import type { NextRequest } from "next/server";
import { listNarcoticRegisterEntries } from "@/lib/actions/narcotic-register";
import { defaultMonthRange } from "@/lib/date-range";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const entries = await listNarcoticRegisterEntries(from, to);

  const columns: ExportColumn<(typeof entries)[number]>[] = [
    { key: (e) => format(new Date(e.dispensedAt), "yyyy-MM-dd HH:mm"), label: "Date & time" },
    { key: "itemName", label: "Item" },
    { key: "batchNo", label: "Batch" },
    { key: "qty", label: "Qty" , type: "number" },
    { key: (e) => e.doctorName ?? "", label: "Doctor" },
    { key: (e) => e.doctorRegistrationNo ?? "", label: "Doctor reg. no." },
    { key: (e) => e.patientName ?? "", label: "Patient" },
    { key: "dispensedByName", label: "Dispensed by" },
    { key: "invoiceNo", label: "Invoice no." },
    { key: (e) => (e.isReversal ? "Reversal" : e.hasReversal ? "Reversed" : "Original"), label: "Status" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: entries,
    columns,
    filename: `narcotic-register-${from}-to-${to}`,
  });
}
