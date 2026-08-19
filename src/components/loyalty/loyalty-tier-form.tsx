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
import { createLoyaltyTier, updateLoyaltyTier } from "@/lib/actions/loyalty-tiers";
import { Plus } from "lucide-react";

const formSchema = z.object({
  name: z.string().trim().min(1, "Tier name is required"),
  minCumulativeSpend: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100),
});

type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface LoyaltyTierDetail {
  id: string;
  name: string;
  minCumulativeSpend: number;
  discountPercent: number;
}

export function LoyaltyTierForm({ tier, trigger }: { tier?: LoyaltyTierDetail; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tier?.name ?? "",
      minCumulativeSpend: tier?.minCumulativeSpend ?? 0,
      discountPercent: tier?.discountPercent ?? 0,
    },
  });

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        if (tier) {
          await updateLoyaltyTier(tier.id, values);
          toast.success("Loyalty tier updated");
        } else {
          await createLoyaltyTier(values);
          toast.success("Loyalty tier created");
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
            <Plus /> New tier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tier ? "Edit loyalty tier" : "New loyalty tier"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Tier name</Label>
            <Input id="name" autoFocus placeholder="e.g. Gold" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minCumulativeSpend">Minimum cumulative spend (₹)</Label>
            <Input id="minCumulativeSpend" type="number" min={0} step="0.01" {...form.register("minCumulativeSpend")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discountPercent">Discount %</Label>
            <Input id="discountPercent" type="number" min={0} max={100} step="0.01" {...form.register("discountPercent")} />
          </div>
          <Button type="submit" disabled={pending}>
            {tier ? "Save changes" : "Create tier"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
