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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createCoupon, updateCoupon } from "@/lib/actions/coupons";
import { Plus } from "lucide-react";

const formSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  type: z.enum(["percent", "flat"]),
  value: z.coerce.number().positive(),
  validFrom: z.string().min(1, "Start date is required"),
  validTo: z.string().min(1, "End date is required"),
  usageLimit: z.coerce.number().int().positive().optional(),
  singleUsePerCustomer: z.boolean().default(false),
});

type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface CouponDetail {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  validFrom: string;
  validTo: string;
  usageLimit: number | null;
  singleUsePerCustomer: boolean;
}

export function CouponForm({ coupon, trigger }: { coupon?: CouponDetail; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: coupon?.code ?? "",
      type: coupon?.type ?? "percent",
      value: coupon?.value,
      validFrom: coupon?.validFrom.slice(0, 10) ?? "",
      validTo: coupon?.validTo.slice(0, 10) ?? "",
      usageLimit: coupon?.usageLimit ?? undefined,
      singleUsePerCustomer: coupon?.singleUsePerCustomer ?? false,
    },
  });

  const type = form.watch("type");

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        if (coupon) {
          await updateCoupon(coupon.id, values);
          toast.success("Coupon updated");
        } else {
          await createCoupon(values);
          toast.success("Coupon created");
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
        {trigger ?? (
          <Button size="sm">
            <Plus /> New coupon
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{coupon ? "Edit coupon" : "New coupon"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" autoFocus className="uppercase" {...form.register("code")} />
            {form.formState.errors.code && (
              <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => form.setValue("type", v as FormValues["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent</SelectItem>
                  <SelectItem value="flat">Flat ₹</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value">Value</Label>
              <Input id="value" type="number" min={0} step="0.01" {...form.register("value")} />
              {form.formState.errors.value && (
                <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="validFrom">Valid from</Label>
              <Input id="validFrom" type="date" {...form.register("validFrom")} />
              {form.formState.errors.validFrom && (
                <p className="text-xs text-destructive">{form.formState.errors.validFrom.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validTo">Valid to</Label>
              <Input id="validTo" type="date" {...form.register("validTo")} />
              {form.formState.errors.validTo && (
                <p className="text-xs text-destructive">{form.formState.errors.validTo.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="usageLimit">Usage limit (optional)</Label>
            <Input id="usageLimit" type="number" min={1} placeholder="Unlimited" {...form.register("usageLimit")} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.watch("singleUsePerCustomer")}
              onCheckedChange={(v) => form.setValue("singleUsePerCustomer", !!v)}
            />
            Single use per customer
          </label>

          <Button type="submit" disabled={pending}>
            {coupon ? "Save changes" : "Create coupon"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
