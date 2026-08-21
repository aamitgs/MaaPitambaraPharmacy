import "server-only";
import ExcelJS from "exceljs";

/**
 * Multi-sheet workbook export.
 *
 * CSV was already here and is fine for one flat table, so this exists for
 * the cases CSV genuinely cannot do:
 *
 *   - A GST return is four related tables. Four separate files is four
 *     chances to hand the accountant a mismatched set; one workbook is not.
 *   - Excel mangles a CSV's HSN codes and GSTINs, silently dropping
 *     leading zeros and reformatting anything that looks like a date.
 *     Typed cells keep "0304" as text and a date as a date.
 *   - Rupee amounts get a real number format rather than a string that
 *     cannot be summed.
 */

export type ColumnType = "text" | "number" | "money" | "date" | "percent";

export type SheetColumn<T> = {
  header: string;
  /** Key on the row, or a function for a derived value. */
  key: keyof T | ((row: T) => unknown);
  type?: ColumnType;
  width?: number;
};

export type Sheet<T> = {
  name: string;
  columns: SheetColumn<T>[];
  rows: T[];
  /** Optional note printed above the table — where a caveat belongs. */
  note?: string;
};

const NUMBER_FORMATS: Record<ColumnType, string | undefined> = {
  text: undefined,
  number: "0",
  money: "#,##0.00",
  date: "dd-mmm-yyyy",
  percent: "0.00",
};

function valueOf<T>(row: T, column: SheetColumn<T>): unknown {
  return typeof column.key === "function"
    ? column.key(row)
    : (row[column.key] as unknown);
}

export async function buildWorkbook(
  sheets: Sheet<any>[],
  meta: { title: string; pharmacy: string; period?: string }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.pharmacy;
  wb.created = new Date();

  for (const sheet of sheets) {
    // Excel refuses these characters and caps the name at 31 characters;
    // hitting either throws rather than truncating, so it is done here.
    const safeName = sheet.name.replace(/[*?:/\\[\]]/g, "-").slice(0, 31);
    const ws = wb.addWorksheet(safeName, {
      views: [{ state: "frozen", ySplit: sheet.note ? 3 : 1 }],
    });

    let headerRow = 1;
    if (sheet.note) {
      ws.mergeCells(1, 1, 1, Math.max(1, sheet.columns.length));
      const cell = ws.getCell(1, 1);
      cell.value = sheet.note;
      cell.font = { italic: true, size: 9, color: { argb: "FF666666" } };
      ws.getRow(2).height = 4;
      headerRow = 3;
    }

    const header = ws.getRow(headerRow);
    header.values = sheet.columns.map((c) => c.header);
    header.font = { bold: true };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3E9DC" },
    };
    header.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };

    sheet.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.max(12, c.header.length + 4);
      const fmt = NUMBER_FORMATS[c.type ?? "text"];
      if (fmt) col.numFmt = fmt;
      if ((c.type ?? "text") === "text") {
        // Keeps HSN codes and GSTINs as typed — Excel would otherwise eat
        // a leading zero or read 3004 as a number.
        col.alignment = { horizontal: "left" };
      }
    });

    for (const row of sheet.rows) {
      const values = sheet.columns.map((c) => {
        const v = valueOf(row, c);
        if (v === null || v === undefined) return null;
        if ((c.type ?? "text") === "text") return String(v);
        if (c.type === "date") return v instanceof Date ? v : new Date(String(v));
        return v;
      });
      ws.addRow(values);
    }

    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: sheet.columns.length },
    };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export function workbookHeaders(filename: string) {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}
