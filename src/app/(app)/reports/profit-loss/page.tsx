import { format } from "date-fns";
import { ShieldAlert, Info } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getProfitAndLoss } from "@/lib/actions/profit-loss";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { cn } from "@/lib/utils";

function Row({
  label,
  value,
  hint,
  bold,
  tone,
  indent,
}: {
  label: string;
  value: number;
  hint?: string;
  bold?: boolean;
  tone?: "positive" | "negative";
  indent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5",
        bold && "border-t pt-2 font-semibold"
      )}
    >
      <div className={cn(indent && "pl-4")}>
        <span className={cn(!bold && "text-sm")}>{label}</span>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          bold ? "text-base" : "text-sm",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive"
        )}
      >
        {value < 0 ? "−" : ""}₹{Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  if (!(await hasPermission("reports.view"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to see this report</p>
      </div>
    );
  }

  const { from, to } = defaultMonthRange(await searchParams);
  const pl = await getProfitAndLoss(from, to);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Profit &amp; loss</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")} ·{" "}
          {pl.invoiceCount} bill{pl.invoiceCount === 1 ? "" : "s"}
        </p>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/profit-loss" />

      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border p-4">
          <Row
            label="Sales"
            value={pl.revenue}
            hint="Taxable value — GST collected is not the pharmacy's money"
          />
          <Row label="Less: customer returns" value={-pl.returnsValue} indent />
          <Row label="Net sales" value={pl.netRevenue} bold />

          <div className="mt-2">
            <Row
              label="Cost of goods sold"
              value={-pl.costOfGoodsSold}
              hint="What the specific batches sold actually cost"
            />
            <Row
              label="Gross profit"
              value={pl.grossProfit}
              bold
              tone={pl.grossProfit >= 0 ? "positive" : "negative"}
            />
            <p className="pt-0.5 text-right text-xs text-muted-foreground">
              {pl.grossMarginPercent}% margin
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="pb-1 text-sm font-medium">Running costs</div>
          {pl.expensesByCategory.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No expenses recorded for this period. Until rent, salaries and electricity are
              entered, the net profit below is only gross margin.
            </p>
          )}
          {pl.expensesByCategory.map((e) => (
            <Row key={e.name} label={e.name} value={-e.amount} indent />
          ))}
          {pl.stockWriteOffs > 0 && (
            <Row
              label="Stock written off"
              value={-pl.stockWriteOffs}
              hint="Expired or damaged — a real loss, shown apart from running costs"
              indent
            />
          )}
          <Row label="Total costs" value={-(pl.totalExpenses + pl.stockWriteOffs)} bold />
        </div>

        <div className="rounded-lg border-2 border-brand-maroon/30 bg-brand-maroon/[0.03] p-4">
          <Row
            label="Net profit"
            value={pl.netProfit}
            bold
            tone={pl.netProfit >= 0 ? "positive" : "negative"}
          />
          <p className="pt-0.5 text-right text-xs text-muted-foreground">
            {pl.netMarginPercent}% of net sales
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                Stock bought this period: ₹{pl.stockPurchased.toFixed(2)}
              </span>{" "}
              — shown for context and deliberately <em>not</em> subtracted. Buying inventory
              moves money from cash into stock; it becomes a cost when it sells. Counting
              purchases as an expense is how a shop convinces itself it lost money in a month it
              stocked up.
            </p>
            <p>
              This is a trading account, not a full set of books — there is no depreciation,
              drawings, or tax provision here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
