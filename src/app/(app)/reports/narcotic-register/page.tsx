import { auth } from "@/auth";
import { listNarcoticRegisterEntries } from "@/lib/actions/narcotic-register";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { NarcoticReversalForm } from "@/components/reports/narcotic-reversal-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default async function NarcoticRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const entries = await listNarcoticRegisterEntries(from, to);

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4 landscape; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Narcotic Register (Schedule X)</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"} · {format(new Date(from), "dd MMM yyyy")}{" "}
            – {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/narcotic-register?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/narcotic-register" />

      <div className="hidden text-center print:block">
        <h1 className="text-lg font-semibold">Narcotic Register (Schedule X)</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date &amp; time</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Dispensed by</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 print:hidden" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length ? (
              entries.map((e) => (
                <TableRow key={e.id} className={e.isReversal ? "bg-muted/30" : undefined}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(e.dispensedAt), "dd MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {e.itemName} <span className="text-muted-foreground">({e.unit})</span>
                  </TableCell>
                  <TableCell>{e.batchNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.qty}</TableCell>
                  <TableCell className="text-sm">
                    {e.doctorName ? (
                      <>
                        {e.doctorName}
                        {e.doctorRegistrationNo && (
                          <span className="text-muted-foreground"> ({e.doctorRegistrationNo})</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{e.patientName || "—"}</TableCell>
                  <TableCell className="text-sm">{e.dispensedByName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.invoiceNo}</TableCell>
                  <TableCell>
                    {e.isReversal ? (
                      <Badge variant="outline">Reversal</Badge>
                    ) : e.hasReversal ? (
                      <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                        Reversed
                      </Badge>
                    ) : (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">Original</Badge>
                    )}
                  </TableCell>
                  <TableCell className="print:hidden">
                    {!e.isReversal && !e.hasReversal && <NarcoticReversalForm entryId={e.id} />}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  No Schedule X dispenses in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
