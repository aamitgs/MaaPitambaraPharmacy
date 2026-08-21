/**
 * Deciding when two customer records are the same person.
 *
 * The names people give at a pharmacy counter are not identifiers. The same
 * customer is entered as "Sharma", "Mr Sharma" and "sharma ji" across three
 * visits, and each spelling opens its own credit account with its own
 * balance — so the shop chases one and not the others.
 *
 * Phone number is the only field here that is close to an identifier, and
 * it is treated as one. Names are used to *suggest* a merge, never to make
 * one automatically: two unrelated Sharmas is the ordinary case, not the
 * exception, and merging them would move real money between real accounts.
 */

/// Honorifics and suffixes that carry no identity, in the forms actually
/// typed at an Indian counter. Matched as whole words only, so "Jitendra"
/// never loses a "ji".
const HONORIFICS = [
  "mr", "mrs", "ms", "miss", "dr", "doctor", "shri", "sri", "smt",
  "shrimati", "sh", "master", "mast", "baby", "m/s", "messrs",
];
const SUFFIXES = ["ji", "sahab", "saheb", "sahib", "bhai", "behn", "ben", "didi"];

/**
 * Strips honorifics, punctuation and spacing so that display differences
 * stop being identity differences. The result is for comparison only — the
 * name the customer gave is always what gets shown back to them.
 */
export function normalizeName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[.,'"`\-_/\\]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const stripped = words.filter((w, i) => {
    if (HONORIFICS.includes(w) && i < words.length - 1) return false;
    if (SUFFIXES.includes(w) && i > 0) return false;
    return true;
  });

  // Everything stripped away (someone entered just "Mr") — fall back to the
  // original rather than returning an empty key that would match every
  // other such record.
  return (stripped.length ? stripped : words).join(" ").trim();
}

/**
 * Reduces a phone number to the ten digits that identify an Indian mobile.
 * Returns null for anything that is not a recognisable mobile, so that
 * "n/a" and "-" never become a shared key that merges strangers.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D+/g, "");

  // Strip the country code however it was written: 00 91, 0 91, +91 (the
  // plus is already gone), or a bare leading 91 on a 12-digit string.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  // A leading 0 is how landline-era habits write a mobile.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length !== 10) return null;
  // Indian mobile numbers begin 6–9. This is what keeps a landline out:
  // "0562 2345678" reduces to ten digits too, but a shared shop or
  // household line identifies a household, not a person, and using it as
  // an identity key would offer to merge unrelated customers.
  if (!/^[6-9]/.test(digits)) return null;

  return digits;
}

export type IdentityCandidate = {
  id: string;
  name: string;
  phone: string | null;
};

export type DuplicateGroup<T extends IdentityCandidate> = {
  /// "phone" groups are near-certain; "name" groups are a suggestion only.
  reason: "phone" | "name";
  key: string;
  members: T[];
};

/**
 * Groups records that look like the same person.
 *
 * Phone matches are reported first and take precedence: a record already
 * grouped by phone is not reported again under a weaker name match, so the
 * reviewer sees each duplicate once, at its strongest evidence.
 */
export function findDuplicateGroups<T extends IdentityCandidate>(
  customers: T[]
): DuplicateGroup<T>[] {
  const byPhone = new Map<string, T[]>();
  for (const c of customers) {
    const key = normalizePhone(c.phone);
    if (!key) continue;
    byPhone.set(key, [...(byPhone.get(key) ?? []), c]);
  }

  const groups: DuplicateGroup<T>[] = [];
  const claimed = new Set<string>();

  for (const [key, members] of byPhone) {
    if (members.length < 2) continue;
    groups.push({ reason: "phone", key, members });
    members.forEach((m) => claimed.add(m.id));
  }

  const byName = new Map<string, T[]>();
  for (const c of customers) {
    if (claimed.has(c.id)) continue;
    const key = normalizeName(c.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }

  for (const [key, members] of byName) {
    if (members.length < 2) continue;
    // Two records with the same name but *different* phone numbers are
    // most likely two different people, and merging them would be a real
    // error — so they are not offered.
    const phones = new Set(members.map((m) => normalizePhone(m.phone)).filter(Boolean));
    if (phones.size > 1) continue;
    groups.push({ reason: "name", key, members });
  }

  return groups;
}
