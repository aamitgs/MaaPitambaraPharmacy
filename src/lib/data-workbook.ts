import "server-only";

/**
 * Columns that must never leave the database in readable form.
 *
 * The encrypted backup carries these because it exists to restore a system
 * — a restore without password hashes locks everyone out. A workbook is
 * the opposite: it is meant to be opened, emailed, and left in a Downloads
 * folder. A credential in it is a credential leaked.
 *
 * Keyed by column name across every table rather than per-table, so a
 * column added to a new model is redacted by name without anyone
 * remembering to add it here.
 */
export const NEVER_EXPORT = new Set([
  "passwordHash",
  "totpSecret",
  "managerPinHash",
  "publicToken",
]);

/**
 * Personal data, redacted unless the owner explicitly asks for it.
 *
 * An accountant needs the sales figures, not the patients' names. Making
 * that the default means the ordinary case produces a file that is far
 * less damaging if it goes astray.
 */
export const PERSONAL_COLUMNS = new Set([
  "patientName",
  "patientPhone",
  "patientAddress",
  "prescriptionImageUrl",
  "phone",
  "email",
  "toAddress",
  "address",
  "licensedAddress",
]);

/** Tables whose whole purpose is personal data. */
export const PERSONAL_TABLES = new Set(["customers", "notes"]);

export type RedactionMode = "redacted" | "full";

export function redactValue(
  table: string,
  column: string,
  value: unknown,
  mode: RedactionMode
): unknown {
  if (NEVER_EXPORT.has(column)) return "[not exported]";
  if (mode === "full") return value;
  if (value === null || value === undefined || value === "") return value;
  if (PERSONAL_COLUMNS.has(column)) return "[redacted]";
  // A customer's name is the identifying field on a table that is entirely
  // about people, so it goes too — but only there. An item's `name` is not
  // personal data.
  if (PERSONAL_TABLES.has(table) && (column === "name" || column === "body")) {
    return "[redacted]";
  }
  return value;
}

/** Cell values Excel can hold — everything else becomes readable text. */
export function cellValue(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    // Prisma Decimals stringify to their exact value; JSON columns become
    // compact JSON rather than "[object Object]".
    const asDecimal = value as { toFixed?: unknown; toString(): string };
    if (typeof asDecimal.toFixed === "function") {
      const n = Number(asDecimal.toString());
      return Number.isFinite(n) ? n : asDecimal.toString();
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
