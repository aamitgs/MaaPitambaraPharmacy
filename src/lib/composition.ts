/**
 * Comparing what two medicines actually contain.
 *
 * A pharmacy is asked "do you have something else for this?" several times
 * a day, and the answer depends on the composition, not the brand. The
 * data to answer it is already captured on every item; nothing read it.
 *
 * The rule this module enforces is the one that matters clinically: a
 * substitute must have the *same salts at the same strengths*. Paracetamol
 * 500mg and Paracetamol 650mg are not substitutes for each other, and
 * treating them as such at a counter would be a dosing error. So anything
 * that cannot be parsed with confidence is reported as "no match" rather
 * than guessed at — a missed substitution costs a sale, a wrong one costs
 * more than that.
 */

/// Pharmacopoeia markers carry no clinical meaning and appear
/// inconsistently — "Paracetamol IP 500mg" and "Paracetamol 500mg" are the
/// same thing.
const PHARMACOPOEIA = /\b(i\.?p\.?|b\.?p\.?|u\.?s\.?p\.?|e\.?p\.?)\b/gi;

/**
 * Salt forms of the same active ingredient, written differently by
 * different manufacturers. Only pairs that are genuinely interchangeable
 * at the same stated strength belong here.
 *
 * This list is short on purpose. It covers the spellings common enough to
 * be worth shipping, and a pharmacy extends it with the ones its own
 * suppliers use (see SaltAlias) — because declaring two salts equivalent
 * is a clinical statement, not a spelling correction, and it should be a
 * decision someone makes rather than a list that grows by guesswork.
 */
export const BUILT_IN_ALIASES = new Map<string, string>([
  ["amoxycillin", "amoxicillin"],
  ["cetirizine hydrochloride", "cetirizine"],
  ["cetirizine hcl", "cetirizine"],
  ["cetirizine dihydrochloride", "cetirizine"],
  ["paracetamol", "paracetamol"],
  ["acetaminophen", "paracetamol"],
  ["chlorpheniramine maleate", "chlorpheniramine"],
  ["chlorphenamine maleate", "chlorpheniramine"],
  ["codeine phosphate", "codeine"],
  ["diclofenac sodium", "diclofenac"],
  ["pantoprazole sodium", "pantoprazole"],
  ["metformin hydrochloride", "metformin"],
  ["metformin hcl", "metformin"],
]);

/** Extra aliases a pharmacy has added, keyed by the spelling on the label. */
export type AliasMap = ReadonlyMap<string, string>;

/**
 * Applies the pharmacy's own aliases first, then the built-in ones, so a
 * local decision always wins over a shipped default.
 */
function resolveAlias(name: string, extra?: AliasMap): string {
  return extra?.get(name) ?? BUILT_IN_ALIASES.get(name) ?? name;
}

export type Ingredient = {
  salt: string;
  /// Normalised to the smallest unit in its dimension so 0.5mg and 500mcg
  /// compare equal.
  amount: number;
  unit: "mcg" | "ml" | "iu" | "%" | "unit";
  /// The "per 5ml" of a syrup. Two products only match if their per-basis
  /// matches too — 10mg/5ml and 10mg/10ml are different concentrations.
  per: string | null;
};

const UNIT_TO_BASE: Record<string, { unit: Ingredient["unit"]; factor: number }> = {
  mcg: { unit: "mcg", factor: 1 },
  µg: { unit: "mcg", factor: 1 },
  ug: { unit: "mcg", factor: 1 },
  mg: { unit: "mcg", factor: 1000 },
  gm: { unit: "mcg", factor: 1_000_000 },
  g: { unit: "mcg", factor: 1_000_000 },
  ml: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  iu: { unit: "iu", factor: 1 },
  "%": { unit: "%", factor: 1 },
};

const STRENGTH = /(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|gm|g|ml|l|iu|%)\b/i;
const PER = /\/\s*(\d+(?:\.\d+)?\s*(?:ml|l|g|gm|tab|tablet|capsule|dose))/i;

function canonicalSalt(raw: string, aliases?: AliasMap): string {
  const cleaned = raw
    .replace(PHARMACOPOEIA, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return resolveAlias(cleaned, aliases);
}

/**
 * Parses one composition string into its ingredients.
 *
 * Returns null when any part of it cannot be read — a partial parse is
 * worse than none, because it would silently compare a two-salt product
 * against the one salt that happened to parse.
 */
export function parseComposition(
  composition: string | null | undefined,
  aliases?: AliasMap
): Ingredient[] | null {
  if (!composition || !composition.trim()) return null;

  const parts = composition
    .split(/\+|,|&/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const ingredients: Ingredient[] = [];
  for (const part of parts) {
    const strength = part.match(STRENGTH);
    // No stated strength means no safe comparison.
    if (!strength) return null;

    const perMatch = part.match(PER);
    const per = perMatch ? perMatch[1].replace(/\s+/g, "").toLowerCase() : null;

    const unitKey = strength[2].toLowerCase();
    const base = UNIT_TO_BASE[unitKey];
    if (!base) return null;

    const salt = canonicalSalt(part.slice(0, strength.index ?? 0), aliases);
    if (!salt) return null;

    ingredients.push({
      salt,
      amount: Number(strength[1]) * base.factor,
      unit: base.unit,
      per,
    });
  }

  return ingredients;
}

/**
 * A stable key for a composition, so items can be grouped by what they
 * contain without comparing every pair.
 *
 * Ingredients are sorted, because "A 500mg + B 125mg" and "B 125mg + A
 * 500mg" are the same medicine written two ways.
 */
export function compositionKey(
  composition: string | null | undefined,
  aliases?: AliasMap
): string | null {
  const parsed = parseComposition(composition, aliases);
  if (!parsed) return null;
  return parsed
    .map((i) => `${i.salt}:${i.amount}${i.unit}${i.per ? `/${i.per}` : ""}`)
    .sort()
    .join("+");
}

/** Whether two items may stand in for one another. */
export function isSubstitute(
  a: string | null | undefined,
  b: string | null | undefined,
  aliases?: AliasMap
): boolean {
  const ka = compositionKey(a, aliases);
  const kb = compositionKey(b, aliases);
  // Two unreadable compositions are not thereby a match.
  if (!ka || !kb) return false;
  return ka === kb;
}

/**
 * Renders a parsed ingredient the way a label would write it.
 *
 * Strengths are held in the smallest unit so they compare cleanly; this
 * turns them back into something a pharmacist reads without pausing.
 */
export function formatIngredient(i: Ingredient): string {
  let value: string;
  if (i.unit === "mcg") {
    if (i.amount >= 1_000_000) value = `${trim(i.amount / 1_000_000)}g`;
    else if (i.amount >= 1000) value = `${trim(i.amount / 1000)}mg`;
    else value = `${trim(i.amount)}mcg`;
  } else if (i.unit === "ml") {
    value = i.amount >= 1000 ? `${trim(i.amount / 1000)}L` : `${trim(i.amount)}ml`;
  } else {
    value = `${trim(i.amount)}${i.unit === "unit" ? "" : i.unit}`;
  }
  return `${i.salt} ${value}${i.per ? `/${i.per}` : ""}`;
}

function trim(n: number): string {
  // 500 rather than 500.00, but 2.5 kept as 2.5.
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** The whole composition, normalised and readable. Null if unparseable. */
export function describeComposition(
  composition: string | null | undefined,
  aliases?: AliasMap
): string | null {
  const parsed = parseComposition(composition, aliases);
  return parsed ? parsed.map(formatIngredient).join(" + ") : null;
}
