import Papa from "papaparse";
import ExcelJS from "exceljs";
import { detectHeader, rowsFromMatrix } from "./detect-header";

/**
 * Turns an uploaded CSV or Excel file into header + row objects.
 *
 * One entry point for both formats so everything downstream — column
 * mapping, validation, preview, commit — never learns which was used. A
 * distributor's price list arrives as .xlsx roughly as often as .csv, and
 * asking a pharmacy to "save as CSV first" is where an import gets
 * abandoned.
 */
export type ParsedFile = { headers: string[]; rows: Record<string, string>[] };

const isExcel = (file: File) =>
  /\.xlsx?$/i.test(file.name) ||
  file.type.includes("spreadsheetml") ||
  file.type === "application/vnd.ms-excel";

export async function readTabularFile(file: File): Promise<ParsedFile> {
  return isExcel(file) ? readExcel(file) : readCsv(file);
}

/**
 * Parses the file's text rather than handing PapaParse the File itself.
 *
 * Its file-streaming path uses FileReaderSync, a Web Worker API that does
 * not exist outside a browser — so the streaming version cannot be tested
 * anywhere the browser is not. An item master is a few megabytes at most,
 * so reading it into memory costs nothing and makes the parser the same
 * code everywhere it runs.
 */
async function readCsv(file: File): Promise<ParsedFile> {
  const text = await file.text();
  // Parsed without a header so the same detection runs on CSV as on Excel —
  // a report exported to CSV carries exactly the same title rows.
  const results = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
  if (results.errors.length > 0 && results.data.length === 0) {
    throw new Error(results.errors[0].message);
  }
  const matrix = results.data.map((r) => (r as string[]).map((c) => String(c ?? "")));
  const detection = detectHeader(matrix);
  if (detection.headers.filter(Boolean).length === 0) {
    throw new Error("Could not find a header row in that file.");
  }
  return { headers: detection.headers.filter(Boolean), rows: rowsFromMatrix(matrix, detection) };
}

async function readExcel(file: File): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("That workbook has no sheets.");

  const matrix: string[][] = [];
  for (let n = 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell);
    });
    matrix.push(cells);
  }

  const detection = detectHeader(matrix);
  const headers = detection.headers.filter(Boolean);
  if (headers.length === 0) throw new Error("Could not find a header row in that workbook.");

  return { headers, rows: rowsFromMatrix(matrix, detection) };
}

/**
 * A cell's value as the text a person would see.
 *
 * Excel hands back dates as Date, formulas as objects, and numbers as
 * numbers — all of which have to become strings, because the validator
 * downstream parses strings. Dates use an ISO date so the existing date
 * parsing recognises them regardless of the sheet's display format.
 */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return String(o.result);
    if (o.text !== undefined) return String(o.text);
    return "";
  }
  return String(v);
}
