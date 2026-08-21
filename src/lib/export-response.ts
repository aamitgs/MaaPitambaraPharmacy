import "server-only";
import { NextResponse } from "next/server";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { buildWorkbook, workbookHeaders, type ColumnType } from "@/lib/xlsx";

/**
 * One responder for both export formats.
 *
 * Every export route already declares its columns for CSV. Rather than
 * write a second, parallel column list per route for Excel — fifteen
 * chances for the two to drift apart — the same spec drives both, with an
 * optional `type` that only Excel uses. A route opts in by passing the
 * request's `format` through; the default stays CSV, so nothing changes
 * for anyone who has scripted against these URLs.
 */
export type ExportColumn<T> = CsvColumn<T> & { type?: ColumnType; width?: number };

export type ExportFormat = "csv" | "xlsx";

export function formatFromRequest(searchParams: URLSearchParams): ExportFormat {
  return searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
}

export async function exportResponse<T>(options: {
  format: ExportFormat;
  rows: T[];
  columns: ExportColumn<T>[];
  /** Without extension — the right one is appended. */
  filename: string;
  sheetName?: string;
  note?: string;
  pharmacy?: string;
}): Promise<NextResponse> {
  const { format, rows, columns, filename } = options;

  if (format === "csv") {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const buffer = await buildWorkbook(
    [
      {
        name: options.sheetName ?? "Export",
        note: options.note,
        columns: columns.map((c) => ({
          header: c.label,
          key: c.key,
          type: c.type ?? "text",
          width: c.width,
        })),
        rows,
      },
    ],
    { title: filename, pharmacy: options.pharmacy ?? "Pharmacy" }
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: workbookHeaders(`${filename}.xlsx`),
  });
}
