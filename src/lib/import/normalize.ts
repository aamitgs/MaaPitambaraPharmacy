import { IMPORT_FIELDS, type ImportFieldKey } from "./fields";

export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

export type NormalizedRow = Partial<Record<ImportFieldKey, string>> & { _rowIndex: number };

/**
 * Maps generic {headers, rows} CSV data onto our target fields using a
 * user-chosen column mapping. A platform-specific pre-parser can skip this
 * step entirely and hand rows already shaped like NormalizedRow straight to
 * validateRows() in validate.ts.
 */
export function mapRows(rows: Record<string, string>[], mapping: ColumnMapping): NormalizedRow[] {
  return rows.map((row, index) => {
    const normalized: NormalizedRow = { _rowIndex: index };
    for (const field of IMPORT_FIELDS) {
      const sourceColumn = mapping[field.key];
      if (!sourceColumn) continue;
      const value = row[sourceColumn];
      if (value !== undefined && value !== null && value.trim() !== "") {
        normalized[field.key] = value.trim();
      }
    }
    return normalized;
  });
}
