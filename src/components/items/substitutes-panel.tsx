import Link from "next/link";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubstituteResult } from "@/lib/actions/substitutes";

/**
 * What else on the shelf could stand in for this item.
 *
 * Shown even when the item is in stock: the question "what else do we have
 * like this" comes up when a customer balks at a price, not only when the
 * shelf is empty.
 */
export function SubstitutesPanel({ result }: { result: SubstituteResult }) {
  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Repeat className="h-4 w-4" /> Same composition
      </h2>

      {result.note ? (
        <p className="max-w-prose rounded-lg border p-3 text-sm text-muted-foreground">
          {result.note}
          {result.note.includes("no strengths") || result.note.includes("No composition") ? (
            <>
              {" "}
              <Link href="/items/composition" className="underline underline-offset-2">
                See what needs fixing
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {result.options.map((o) => (
            <div key={o.itemId} className="flex items-center justify-between gap-3 p-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link href={`/items/${o.itemId}`} className="truncate font-medium hover:underline">
                    {o.name}
                  </Link>
                  {o.scheduleClass !== "none" && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {o.scheduleClass}
                    </Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{o.manufacturer || "—"}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-medium tabular-nums">₹{o.rate.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{o.inStock} in stock</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
