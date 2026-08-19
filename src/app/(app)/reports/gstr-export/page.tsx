import { auth } from "@/auth";
import {
  getGstr1B2cs,
  getGstr1HsnSummary,
  getGstr3bSummary,
} from "@/lib/actions/gstr-export";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default async function GstrExportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const [b2cs, hsn, gstr3b] = await Promise.all([
    getGstr1B2cs(from, to),
    getGstr1HsnSummary(from, to),
    getGstr3bSummary(from, to),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">GSTR-1 / GSTR-3B Export</h1>
        <p className="text-sm text-muted-foreground">
          Ready-to-file CSVs for {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}.
          Hand these to your accountant, or import the GSTR-1 sheets into the GST portal&apos;s Returns Offline
          Tool. No customer GSTIN is captured by this app, so every sale is reported as B2C — there is no B2B
          sheet to export.
        </p>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/gstr-export" />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">GSTR-1 · Table 7 (B2C small, rate-wise)</h2>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/gstr1-b2cs?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Place of supply</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">Cess</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b2cs.length ? (
                b2cs.map((r) => (
                  <TableRow key={`${r.placeOfSupply}-${r.taxRate}`}>
                    <TableCell>{r.placeOfSupply}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.taxRate}%</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.taxableValue.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.cessAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">GSTR-1 · Table 12 (HSN-wise summary)</h2>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/gstr1-hsn?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HSN</TableHead>
                <TableHead>UQC</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
                <TableHead className="text-right">Total value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hsn.length ? (
                hsn.map((r) => (
                  <TableRow key={r.hsnCode}>
                    <TableCell className="font-medium">{r.hsnCode}</TableCell>
                    <TableCell>{r.uqc}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.taxableValue.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.centralTaxAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.stateTaxAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.totalValue.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">GSTR-3B · Table 3.1 (summary of outward supplies)</h2>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/gstr3b-summary?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nature of supplies</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST/UTGST</TableHead>
                <TableHead className="text-right">Cess</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gstr3b.map((r) => (
                <TableRow key={r.natureOfSupplies}>
                  <TableCell className="text-sm">{r.natureOfSupplies}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.totalTaxableValue.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.integratedTax.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.centralTax.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.stateTax.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.cess.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
