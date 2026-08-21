import { auth } from "@/auth";
import {
  getGstr1B2cs,
  getGstr1CreditNotes,
  getGstr1HsnSummary,
  getGstr3bSummary,
} from "@/lib/actions/gstr-export";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/reports/export-buttons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download, FileSpreadsheet, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getTaxHealth } from "@/lib/actions/tax-health";
import { getTaxThresholdStatus } from "@/lib/actions/tax-thresholds";

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
  const [b2cs, hsn, gstr3b, creditNotes, taxHealth, thresholds] = await Promise.all([
    getGstr1B2cs(from, to),
    getGstr1HsnSummary(from, to),
    getGstr3bSummary(from, to),
    getGstr1CreditNotes(from, to),
    getTaxHealth(from, to),
    getTaxThresholdStatus(),
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

      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter from={from} to={to} basePath="/reports/gstr-export" />
        {/* One workbook rather than four CSVs: the sheets have to agree with
            each other, and separate files are four chances not to. */}
        <Button asChild size="sm">
          <a href={`/api/export/gst-workbook?from=${from}&to=${to}`}>
            <FileSpreadsheet className="h-4 w-4" /> Download the whole return (Excel)
          </a>
        </Button>
      </div>

      {/* TCS/TDS only exist above ₹10 crore of preceding-year turnover, so
          this stays out of the way entirely until it is anywhere near
          relevant — a permanent banner about an obligation that does not
          apply is noise that trains people to ignore banners. */}
      {(thresholds.obligationStatus !== "not-applicable" ||
        thresholds.trajectoryStatus !== "not-applicable" ||
        thresholds.parties.length > 0) && (
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">TCS / TDS thresholds</h2>
          <p className="text-xs text-muted-foreground">
            {thresholds.precedingFinancialYear} turnover was ₹
            {thresholds.precedingTurnover.toLocaleString("en-IN")}, against the ₹10 crore
            threshold at which TCS under 206C(1H) and TDS under 194Q begin to apply.{" "}
            {thresholds.obligationStatus === "crossed"
              ? "Those obligations apply this year — talk to your accountant about collection and quarterly returns."
              : thresholds.obligationStatus === "approaching"
                ? "Close enough to plan for."
                : "They do not apply this year."}
          </p>
          {thresholds.parties.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium">
                Parties past ₹40 lakh this year ({thresholds.financialYear})
              </p>
              {thresholds.parties.map((p) => (
                <div key={`${p.kind}-${p.id}`} className="flex justify-between text-xs">
                  <span>
                    {p.name}{" "}
                    <span className="text-muted-foreground">
                      ({p.kind === "customer" ? "sales to" : "purchases from"})
                    </span>
                  </span>
                  <span className="tabular-nums">₹{p.amount.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Checked before the numbers, not after: the point is to catch these
          while they are still cheap to fix. */}
      {taxHealth.length > 0 && (
        <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <h2 className="text-sm font-semibold">Before you file</h2>
          <div className="space-y-2">
            {taxHealth.map((f) => (
              <div key={f.id} className="flex items-start gap-3">
                {f.severity === "critical" ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {f.title}{" "}
                    <span className="font-normal text-muted-foreground">({f.count})</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.detail}</p>
                  {f.examples.length > 0 && (
                    <p className="mt-1 text-xs">
                      {f.examples.map((e, i) => (
                        <span key={e.id}>
                          {i > 0 && ", "}
                          {e.href ? (
                            <Link href={e.href} className="underline underline-offset-2">
                              {e.label}
                            </Link>
                          ) : (
                            e.label
                          )}
                        </span>
                      ))}
                      {f.count > f.examples.length && ` and ${f.count - f.examples.length} more`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">GSTR-1 · Table 7 (B2C small, rate-wise)</h2>
          <ExportButtons href={`/api/export/gstr1-b2cs?from=${from}&to=${to}`} />
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
          <h2 className="text-sm font-semibold">GSTR-1 · Table 9B (credit notes)</h2>
          <ExportButtons href={`/api/export/gstr1-credit-notes?from=${from}&to=${to}`} />
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Note</TableHead>
                <TableHead>Against invoice</TableHead>
                <TableHead>Place of supply</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">CGST</TableHead>
                <TableHead className="text-right">SGST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditNotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    No credit notes in this period.
                  </TableCell>
                </TableRow>
              )}
              {creditNotes.map((row, i) => (
                <TableRow key={`${row.noteNumber}-${row.rate}-${i}`}>
                  <TableCell className="font-medium">{row.noteNumber}</TableCell>
                  <TableCell>{row.invoiceNumber}</TableCell>
                  <TableCell>{row.placeOfSupply}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.rate}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{row.taxableValue.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{row.centralTax.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{row.stateTax.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">GSTR-1 · Table 12 (HSN-wise summary)</h2>
          <ExportButtons href={`/api/export/gstr1-hsn?from=${from}&to=${to}`} />
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
          <ExportButtons href={`/api/export/gstr3b-summary?from=${from}&to=${to}`} />
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
