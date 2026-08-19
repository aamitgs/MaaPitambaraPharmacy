export interface CsvColumn<T> {
  key: keyof T | ((row: T) => unknown);
  label: string;
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvField(typeof c.key === "function" ? c.key(row) : row[c.key]))
      .join(",")
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
