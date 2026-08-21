import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import {
  getGstr1B2cs,
  getGstr1CreditNotes,
  getGstr1HsnSummary,
  getGstr3bSummary,
} from "@/lib/actions/gstr-export";
import { getTaxHealth } from "@/lib/actions/tax-health";
import { defaultMonthRange } from "@/lib/date-range";
import { getBranding } from "@/lib/branding";
import { UnauthorizedError } from "@/lib/rbac";
import { buildWorkbook, workbookHeaders, type Sheet } from "@/lib/xlsx";

/**
 * The whole GST return as one workbook.
 *
 * Four sheets that have to agree with each other, so they travel as one
 * file — handing an accountant four CSVs is four chances to work from a
 * mismatched set. The last sheet carries the pre-filing findings, because
 * a caveat that stays on screen is a caveat nobody downstream ever sees.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
  });

  let b2cs, hsn, gstr3b, creditNotes, health, branding;
  try {
    [b2cs, hsn, gstr3b, creditNotes, health, branding] = await Promise.all([
      getGstr1B2cs(from, to),
      getGstr1HsnSummary(from, to),
      getGstr3bSummary(from, to),
      getGstr1CreditNotes(from, to),
      getTaxHealth(from, to),
      getBranding(),
    ]);
  } catch (e) {
    // A missing permission is an answer, not a crash — an unhandled throw
    // here reaches the browser as a 500 and looks like a broken export.
    if (e instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Only an Owner or Pharmacist can export GST returns." },
        { status: 403 }
      );
    }
    throw e;
  }

  const period = `${format(new Date(from), "dd MMM yyyy")} – ${format(new Date(to), "dd MMM yyyy")}`;

  const sheets: Sheet<any>[] = [
    {
      name: "GSTR-1 B2CS",
      note: `Table 7 — B2C small, rate-wise. ${period}. No customer GSTIN is captured, so every sale is B2C.`,
      columns: [
        { header: "Type", key: "type", type: "text" },
        { header: "Place of supply", key: "placeOfSupply", type: "text", width: 20 },
        { header: "Rate", key: "taxRate", type: "percent" },
        { header: "Taxable value", key: "taxableValue", type: "money", width: 16 },
        { header: "Cess", key: "cessAmount", type: "money" },
      ],
      rows: b2cs,
    },
    {
      name: "GSTR-1 9B Credit notes",
      note: `Table 9B — credit notes against the B2C sales above. ${period}.`,
      columns: [
        { header: "Note no.", key: "noteNumber", type: "text", width: 18 },
        { header: "Note date", key: "noteDate", type: "text" },
        { header: "Against invoice", key: "invoiceNumber", type: "text", width: 18 },
        { header: "Invoice date", key: "invoiceDate", type: "text" },
        { header: "Type", key: "noteType", type: "text" },
        { header: "Place of supply", key: "placeOfSupply", type: "text", width: 20 },
        { header: "Rate", key: "rate", type: "percent" },
        { header: "Taxable value", key: "taxableValue", type: "money", width: 16 },
        { header: "CGST", key: "centralTax", type: "money" },
        { header: "SGST", key: "stateTax", type: "money" },
      ],
      rows: creditNotes,
    },
    {
      name: "GSTR-1 HSN",
      note: `Table 12 — HSN-wise summary. ${period}. HSN codes are text: a spreadsheet would otherwise drop a leading zero.`,
      columns: [
        { header: "HSN", key: "hsnCode", type: "text" },
        { header: "Description", key: "description", type: "text", width: 30 },
        { header: "UQC", key: "uqc", type: "text" },
        { header: "Quantity", key: "totalQuantity", type: "number" },
        { header: "Taxable value", key: "taxableValue", type: "money", width: 16 },
        { header: "IGST", key: "integratedTaxAmount", type: "money" },
        { header: "CGST", key: "centralTaxAmount", type: "money" },
        { header: "SGST", key: "stateTaxAmount", type: "money" },
        { header: "Cess", key: "cessAmount", type: "money" },
        { header: "Total value", key: "totalValue", type: "money", width: 16 },
      ],
      rows: hsn,
    },
    {
      name: "GSTR-3B 3.1",
      note: `Table 3.1 — summary of outward supplies. ${period}. Credit notes are already netted off row (a).`,
      columns: [
        { header: "Nature of supplies", key: "natureOfSupplies", type: "text", width: 62 },
        { header: "Taxable value", key: "totalTaxableValue", type: "money", width: 16 },
        { header: "IGST", key: "integratedTax", type: "money" },
        { header: "CGST", key: "centralTax", type: "money" },
        { header: "SGST/UTGST", key: "stateTax", type: "money" },
        { header: "Cess", key: "cess", type: "money" },
      ],
      rows: gstr3b,
    },
    {
      name: "Before you file",
      note: health.length
        ? "Checks that were outstanding when this workbook was generated."
        : "No issues were outstanding when this workbook was generated.",
      columns: [
        { header: "Severity", key: "severity", type: "text" },
        { header: "Finding", key: "title", type: "text", width: 46 },
        { header: "Count", key: "count", type: "number" },
        { header: "Detail", key: "detail", type: "text", width: 80 },
        {
          header: "Examples",
          key: (f: (typeof health)[number]) => f.examples.map((e) => e.label).join("; "),
          type: "text",
          width: 50,
        },
      ],
      rows: health,
    },
  ];

  const buffer = await buildWorkbook(sheets, {
    title: "GST return pack",
    pharmacy: branding.name,
    period,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: workbookHeaders(`gst-return-${from}-to-${to}.xlsx`),
  });
}
