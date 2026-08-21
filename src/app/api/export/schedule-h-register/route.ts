import { NextRequest, NextResponse } from "next/server";
import { getScheduleHRegister } from "@/lib/actions/schedule-h-register";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  const scope = searchParams.get("scope") === "all" ? "H_AND_H1" : "H1";

  const rows = await getScheduleHRegister(from, to, scope);

  // Column order follows Rule 65(11A) so a printed copy reads like the
  // bound register an inspector expects, rather than a database dump.
  const csv = toCsv(rows, [
    { key: "serial", label: "Sl. No." },
    { key: (r) => format(new Date(r.date), "yyyy-MM-dd"), label: "Date of supply" },
    { key: (r) => r.patientName ?? "", label: "Patient name" },
    { key: (r) => r.patientAddress ?? "", label: "Patient address" },
    { key: (r) => r.doctorName ?? "", label: "Prescriber name" },
    { key: (r) => r.doctorClinic ?? "", label: "Prescriber address" },
    { key: (r) => r.doctorRegistrationNo ?? "", label: "Prescriber reg. no." },
    { key: "scheduleClass", label: "Schedule" },
    { key: "itemName", label: "Drug name" },
    { key: "batchNo", label: "Batch" },
    { key: (r) => `${r.qty} ${r.unit}`, label: "Quantity supplied" },
    { key: "invoiceNo", label: "Bill no." },
    { key: (r) => r.dispensedBy ?? "", label: "Dispensed by" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-${scope === "H1" ? "h1" : "h"}-register-${from}-to-${to}.csv"`,
    },
  });
}
