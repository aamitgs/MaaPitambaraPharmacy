"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  markPromiseOrderNotified,
  fulfilPromiseOrder,
  cancelPromiseOrder,
  type PromiseOrderRow,
} from "@/lib/actions/promise-orders";
import { Check, Loader2, PackageCheck, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PromiseOrderList({
  orders,
  showAll,
}: {
  orders: PromiseOrderRow[];
  showAll: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const ready = orders.filter((o) => o.canFulfil);

  const run = (fn: () => Promise<unknown>, ok: string) =>
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  return (
    <div className="space-y-4">
      {ready.length > 0 && (
        <div className="rounded-lg border border-success/40 bg-success/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <PackageCheck className="h-4 w-4 text-success" />
            {ready.length} {ready.length === 1 ? "order is" : "orders are"} ready to collect
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The stock is on the shelf now. Ring the customer before it sells to someone else —
            nothing is held back for them.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button asChild size="sm" variant={showAll ? "outline" : "default"}>
          <Link href="/promise-orders">Open only</Link>
        </Button>
        <Button asChild size="sm" variant={showAll ? "default" : "outline"}>
          <Link href="/promise-orders?status=all">All</Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asked for</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Wanted</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nothing on the promise list.
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => (
              <TableRow key={o.id} className={cn(o.canFulfil && "bg-success/5")}>
                <TableCell>
                  <div className="font-medium">{o.requestedName}</div>
                  {o.itemName && o.itemName !== o.requestedName && (
                    <div className="text-xs text-muted-foreground">matched: {o.itemName}</div>
                  )}
                  {!o.itemId && (
                    <Badge variant="outline" className="mt-0.5 text-[10px]">
                      not in item master
                    </Badge>
                  )}
                  {o.note && <div className="text-xs text-muted-foreground">{o.note}</div>}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{o.customerName ?? "—"}</div>
                  {o.phone && (
                    <a
                      href={`tel:${o.phone}`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" /> {o.phone}
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.qty}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    o.availableQty === null && "text-muted-foreground",
                    o.canFulfil && "font-medium text-success"
                  )}
                >
                  {o.availableQty === null ? "—" : o.availableQty}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(o.createdAt))}
                  {o.notifiedAt && (
                    <div className="text-[11px]">
                      told {format(new Date(o.notifiedAt), "dd MMM")}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {o.status !== "open" ? (
                    <Badge variant={o.status === "fulfilled" ? "secondary" : "outline"}>
                      {o.status}
                    </Badge>
                  ) : cancelling === o.id ? (
                    <div className="flex gap-1">
                      <Input
                        autoFocus
                        placeholder="Why?"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="h-7"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            await cancelPromiseOrder(o.id, reason);
                            setCancelling(null);
                            setReason("");
                          }, "Cancelled")
                        }
                      >
                        OK
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1">
                      {o.canFulfil && o.phone && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          title="Mark that the customer has been told"
                          onClick={() =>
                            run(
                              () => markPromiseOrderNotified(o.id),
                              `Noted — ${o.customerName ?? "customer"} told`
                            )
                          }
                        >
                          <Phone className="h-3.5 w-3.5" /> Told them
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => fulfilPromiseOrder(o.id), "Closed as fulfilled")}
                      >
                        <Check className="h-3.5 w-3.5" /> Done
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setCancelling(o.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pending && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}
