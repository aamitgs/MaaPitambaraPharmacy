import type { NextRequest } from "next/server";
import { getGstr1CreditNotes } from "@/lib/actions/gstr-export";
import { defaultMonthRange } from "@/lib/date-range";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getGstr1CreditNotes(from, to);

  // Column layout follows the GSTR-1 offline tool's Table 9B sheet.
  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "noteNumber", label: "Note/Refund Voucher Number" },
    { key: "noteDate", label: "Note/Refund Voucher date" },
    { key: "invoiceNumber", label: "Invoice/Advance Receipt Number" },
    { key: "invoiceDate", label: "Invoice/Advance Receipt date" },
    { key: "noteType", label: "Note/Refund Voucher Type" },
    { key: "placeOfSupply", label: "Place Of Supply" },
    { key: "rate", label: "Rate" , type: "money" },
    { key: "taxableValue", label: "Taxable Value" , type: "money" },
    { key: "centralTax", label: "Central Tax" },
    { key: "stateTax", label: "State/UT Tax" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `gstr1-credit-notes-${from}-to-${to}`,
  });
}
