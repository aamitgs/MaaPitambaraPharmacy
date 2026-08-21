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
import { createCustomer } from "@/lib/actions/customers";
import { Plus } from "lucide-react";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  creditTermDays: z.coerce.number().int().min(0).max(365).optional(),
});

// See item-form.tsx for why input/output types are split (zod v4 coerce).
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function CustomerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", phone: "", creditLimit: undefined, creditTermDays: undefined },
  });

  function save(values: FormOutput, allowDuplicatePhone = false) {
    startTransition(async () => {
      try {
        await createCustomer({ ...values, allowDuplicatePhone });
        toast.success("Customer added");
        form.reset();
        setDuplicateOf(null);
        setOpen(false);
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong";
        // The server refuses a repeat phone number once, and names who
        // already has it, so the counter can tell a duplicate from a
        // family sharing one handset.
        if (message.startsWith("DUPLICATE_PHONE:")) {
          setDuplicateOf(message.slice("DUPLICATE_PHONE:".length));
          return;
        }
        toast.error(message);
      }
    });
  }

  function onSubmit(values: FormOutput) {
    save(values);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoFocus {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              {...form.register("phone", { onChange: () => setDuplicateOf(null) })}
            />
            {duplicateOf && (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                <p className="text-warning-foreground">
                  <strong>{duplicateOf}</strong> already uses this number. Adding another record
                  means two credit accounts and two balances for the same phone.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => save(form.getValues() as FormOutput, true)}
                >
                  Add anyway — different person
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="creditLimit">Credit limit (₹, optional)</Label>
            <Input
              id="creditLimit"
              type="number"
              step="0.01"
              placeholder="Leave blank for no credit account"
              {...form.register("creditLimit")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="creditTermDays">Credit term (days, optional)</Label>
            <Input
              id="creditTermDays"
              type="number"
              min={0}
              placeholder="e.g. 30"
              {...form.register("creditTermDays")}
            />
            <p className="text-[11px] text-muted-foreground">
              How long a credit sale may stay unpaid before it shows as overdue. Leave blank and
              nothing is chased.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            Add customer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
