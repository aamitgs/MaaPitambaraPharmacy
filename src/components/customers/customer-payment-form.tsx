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
import { recordCustomerPayment } from "@/lib/actions/customers";
import { IndianRupee } from "lucide-react";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank transfer" },
] as const;

const formSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  method: z.enum(["cash", "upi", "card", "cheque", "bank_transfer"]),
  date: z.string().min(1, "Date is required"),
  note: z.string().trim().optional(),
});

// See item-form.tsx for why input/output types are split (zod v4 coerce).
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function CustomerPaymentForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: undefined,
      method: "cash",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    },
  });

  function onSubmit(values: FormOutput) {
    startTransition(async () => {
      try {
        await recordCustomerPayment(customerId, values);
        toast.success("Payment recorded");
        form.reset();
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
        <Button size="sm" variant="outline">
          <IndianRupee /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment from this customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input id="amount" type="number" step="0.01" autoFocus {...form.register("amount")} />
              {form.formState.errors.amount && (
                <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...form.register("date")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select
              value={form.watch("method")}
              onValueChange={(v) => form.setValue("method", v as FormValues["method"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" placeholder="e.g. Cheque no. / UTR ref" {...form.register("note")} />
          </div>
          <Button type="submit" disabled={pending}>
            Record payment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
