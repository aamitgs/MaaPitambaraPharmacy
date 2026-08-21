"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createBatch, updateBatch, type BatchInput } from "@/lib/actions/items";
import type { PlainBatch } from "@/lib/serialize";
import { Plus } from "lucide-react";

const formSchema = z.object({
  batchNo: z.string().trim().min(1, "Batch number is required"),
  mfgDate: z.string().optional(),
  expiryDate: z.string().min(1, "Expiry date is required"),
  mrp: z.coerce.number().positive("MRP must be greater than 0"),
  purchaseRate: z.coerce.number().min(0),
  saleRate: z.coerce.number().positive("Sale rate must be greater than 0"),
  ptr: z.union([z.literal(""), z.coerce.number().positive("PTR must be greater than 0")]).optional(),
  currentQty: z.coerce.number().int().min(0),
  rackLocation: z.string().trim().optional(),
});

// See item-form.tsx for why input/output types are split (zod v4 coerce).
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

function toDateInput(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function BatchForm({
  itemId,
  batch,
  showPurchaseRate,
  canPricePtr,
}: {
  itemId: string;
  batch?: PlainBatch;
  showPurchaseRate: boolean;
  /// Whether this user may set the wholesale price. When false the field is
  /// not rendered at all and the server leaves any stored PTR untouched.
  canPricePtr: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      batchNo: batch?.batchNo ?? "",
      mfgDate: toDateInput(batch?.mfgDate),
      expiryDate: toDateInput(batch?.expiryDate) || "",
      mrp: batch ? Number(batch.mrp) : 0,
      purchaseRate: batch ? Number(batch.purchaseRate) : 0,
      saleRate: batch ? Number(batch.saleRate) : 0,
      ptr: batch?.ptr != null ? Number(batch.ptr) : "",
      currentQty: batch?.currentQty ?? 0,
      rackLocation: batch?.rackLocation ?? "",
    },
  });

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        const input: BatchInput = {
          ...values,
          itemId,
          // Blank clears the wholesale price; omitted entirely when the user
          // may not price wholesale, which the server reads as "leave it".
          ptr: canPricePtr ? (values.ptr === "" || values.ptr === undefined ? null : Number(values.ptr)) : undefined,
        };
        if (batch) {
          await updateBatch(batch.id, input);
          toast.success("Batch updated");
        } else {
          await createBatch(input);
          toast.success("Batch added");
          form.reset();
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {batch ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add batch
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{batch ? "Edit batch" : "Add batch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="batchNo">Batch no.</Label>
              <Input id="batchNo" autoFocus {...form.register("batchNo")} />
              {form.formState.errors.batchNo && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.batchNo.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rackLocation">Rack location</Label>
              <Input id="rackLocation" {...form.register("rackLocation")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mfgDate">Mfg date</Label>
              <Input id="mfgDate" type="date" {...form.register("mfgDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Expiry date</Label>
              <Input id="expiryDate" type="date" {...form.register("expiryDate")} />
              {form.formState.errors.expiryDate && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.expiryDate.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mrp">MRP</Label>
              <Input id="mrp" type="number" step="0.01" {...form.register("mrp")} />
              {form.formState.errors.mrp && (
                <p className="text-xs text-destructive">{form.formState.errors.mrp.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="saleRate">Sale rate</Label>
              <Input id="saleRate" type="number" step="0.01" {...form.register("saleRate")} />
              {form.formState.errors.saleRate && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.saleRate.message}
                </p>
              )}
            </div>
            {canPricePtr && (
              <div className="space-y-1.5">
                <Label htmlFor="ptr">PTR (wholesale)</Label>
                <Input id="ptr" type="number" step="0.01" placeholder="—" {...form.register("ptr")} />
                {form.formState.errors.ptr && (
                  <p className="text-xs text-destructive">{form.formState.errors.ptr.message}</p>
                )}
              </div>
            )}
            {showPurchaseRate && (
              <div className="space-y-1.5">
                <Label htmlFor="purchaseRate">Purchase rate</Label>
                <Input
                  id="purchaseRate"
                  type="number"
                  step="0.01"
                  {...form.register("purchaseRate")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="currentQty">Current qty</Label>
              <Input id="currentQty" type="number" {...form.register("currentQty")} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {batch ? "Save changes" : "Add batch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
