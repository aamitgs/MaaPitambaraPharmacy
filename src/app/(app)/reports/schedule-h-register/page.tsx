import { format } from "date-fns";
import { Download, AlertTriangle } from "lucide-react";
import { auth } from "@/auth";
import { getScheduleHRegister } from "@/lib/actions/schedule-h-register";
import { H1_RETENTION_YEARS } from "@/lib/schedule-h-constants";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function ScheduleHRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; scope?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "owner" && session.user.role !== "pharmacist") {
    return <RestrictedAccess />;
  }

  const params = await searchParams;
  const { from, to } = defaultMonthRange(params);
  const scope = params.scope === "all" ? "H_AND_H1" : "H1";
  const rows = await getScheduleHRegister(from, to, scope);
  const incomplete = rows.filter((r) => r.gaps.length > 0);

  const base = `/reports/schedule-h-register?from=${from}&to=${to}`;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">
          Schedule {scope === "H1" ? "H1" : "H & H1"} register
        </h1>
        <p className="text-sm text-muted-foreground">
          Prescription-only supplies for {format(new Date(from), "dd MMM yyyy")} –{" "}
          {format(new Date(to), "dd MMM yyyy")}. Rule 65(11A) requires the H1 register to be kept
          for {H1_RETENTION_YEARS} years and produced on inspection. Built from the bills
          themselves, so a cancelled bill leaves the register automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter from={from} to={to} basePath="/reports/schedule-h-register" />
        <div className="flex overflow-hidden rounded-lg border">
          <Link
            href={base}
            className={cn("px-3 py-1.5 text-xs", scope === "H1" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            H1 only
          </Link>
          <Link
            href={`${base}&scope=all`}
            className={cn("px-3 py-1.5 text-xs", scope !== "H1" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            H and H1
          </Link>
        </div>
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/export/schedule-h-register?from=${from}&to=${to}${scope === "H1" ? "" : "&scope=all"}`}
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </Button>
      </div>

      {incomplete.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {incomplete.length} {incomplete.length === 1 ? "entry is" : "entries are"} incomplete
          </AlertTitle>
          <AlertDescription>
            An H1 entry needs the patient&apos;s name and address and the prescriber&apos;s name
            and registration number. Missing fields are highlighted below — they cannot be filled
            in retrospectively from here, so the fix is to capture them at the counter.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Sl.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Prescriber</TableHead>
              <TableHead>Drug</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead>Dispensed by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No Schedule {scope === "H1" ? "H1" : "H/H1"} supplies in this period.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={`${r.invoiceNo}-${r.serial}`}>
                <TableCell className="tabular-nums">{r.serial}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {format(new Date(r.date), "dd MMM yyyy")}
                </TableCell>
                <TableCell>
                  <div className={cn(!r.patientName && "text-destructive")}>
                    {r.patientName ?? "— missing —"}
                  </div>
                  <div
                    className={cn(
                      "text-xs",
                      r.patientAddress ? "text-muted-foreground" : "text-destructive"
                    )}
                  >
                    {r.patientAddress ?? "— address missing —"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={cn(!r.doctorName && "text-destructive")}>
                    {r.doctorName ?? "— missing —"}
                  </div>
                  <div
                    className={cn(
                      "text-xs",
                      r.doctorRegistrationNo ? "text-muted-foreground" : "text-destructive"
                    )}
                  >
                    {r.doctorRegistrationNo ? `Reg. ${r.doctorRegistrationNo}` : "— reg. no. missing —"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {r.itemName}
                    <Badge variant="outline" className="text-[10px]">
                      {r.scheduleClass}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Batch {r.batchNo}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qty} {r.unit}
                </TableCell>
                <TableCell className="text-xs">{r.invoiceNo}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.dispensedBy ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
