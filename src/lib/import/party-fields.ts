/**
 * Import targets for suppliers and customers.
 *
 * Kept apart from the item-master fields rather than folded into one giant
 * union: the two imports share a pipeline but not a shape, and a single
 * field list would make every supplier column an option when mapping an
 * item file.
 */
export type PartyKind = "supplier" | "customer";

export type PartyFieldKey =
  | "name"
  | "phone"
  | "gstin"
  | "address"
  | "paymentTermsDays"
  | "creditLimit"
  | "creditTermDays";

export interface PartyFieldDef {
  key: PartyFieldKey;
  label: string;
  required: boolean;
  type: "string" | "number" | "int";
  /** Which import this field belongs to. */
  kinds: PartyKind[];
  hint?: string;
}

export const PARTY_FIELDS: PartyFieldDef[] = [
  { key: "name", label: "Name", required: true, type: "string", kinds: ["supplier", "customer"] },
  { key: "phone", label: "Phone", required: false, type: "string", kinds: ["supplier", "customer"] },
  {
    key: "gstin",
    label: "GSTIN",
    required: false,
    type: "string",
    kinds: ["supplier"],
    hint: "15 characters; checked for shape, not verified against the portal.",
  },
  { key: "address", label: "Address", required: false, type: "string", kinds: ["supplier"] },
  {
    key: "paymentTermsDays",
    label: "Payment terms (days)",
    required: false,
    type: "int",
    kinds: ["supplier"],
  },
  {
    key: "creditLimit",
    label: "Credit limit (₹)",
    required: false,
    type: "number",
    kinds: ["customer"],
    hint: "Blank means no credit account — the customer pays at the counter.",
  },
  {
    key: "creditTermDays",
    label: "Credit term (days)",
    required: false,
    type: "int",
    kinds: ["customer"],
  },
];

export const fieldsFor = (kind: PartyKind) =>
  PARTY_FIELDS.filter((f) => f.kinds.includes(kind));

export type PartyRow = Partial<Record<PartyFieldKey, string>>;

export type PartyRowResult = {
  raw: PartyRow;
  errors: string[];
  /** Set when an existing record will be updated rather than created. */
  action: "create" | "update";
};

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/;

/**
 * Validates a parsed sheet.
 *
 * Runs on the client for the preview and again on the server before
 * committing — the preview is a courtesy, never the gate.
 */
export function validatePartyRows(
  kind: PartyKind,
  rows: PartyRow[],
  existingNames: Set<string>
): PartyRowResult[] {
  const seen = new Set<string>();

  return rows.map((raw) => {
    const errors: string[] = [];
    const name = raw.name?.trim() ?? "";

    if (!name) errors.push("Name is required");
    if (name.length > 160) errors.push("Name is too long");

    const key = name.toLowerCase();
    if (name && seen.has(key)) {
      // Two rows for the same party in one file would have the second
      // silently overwrite the first.
      errors.push("Appears more than once in this file");
    }
    if (name) seen.add(key);

    if (raw.gstin?.trim() && !GSTIN_SHAPE.test(raw.gstin.trim().toUpperCase())) {
      errors.push("GSTIN is not the right shape");
    }

    for (const field of fieldsFor(kind)) {
      const value = raw[field.key]?.trim();
      if (!value) continue;
      if (field.type === "number" || field.type === "int") {
        const n = Number(value);
        if (!Number.isFinite(n)) errors.push(`${field.label} is not a number`);
        else if (n < 0) errors.push(`${field.label} cannot be negative`);
        else if (field.type === "int" && !Number.isInteger(n))
          errors.push(`${field.label} must be a whole number`);
      }
    }

    return {
      raw,
      errors,
      action: name && existingNames.has(key) ? "update" : "create",
    };
  });
}
