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
import { createNarcoticReversal } from "@/lib/actions/narcotic-register";
import { Undo2 } from "lucide-react";

const formSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function NarcoticReversalForm({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { reason: "" },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        await createNarcoticReversal(entryId, values);
        toast.success("Reversal entry recorded");
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
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Undo2 className="h-3 w-3" /> Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a reversal entry</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This does not edit or remove the original entry — it adds a new, linked reversal row to
          the register, and does not change stock or the original invoice.
        </p>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" autoFocus {...form.register("reason")} />
            {form.formState.errors.reason && (
              <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
            )}
          </div>
          <Button type="submit" disabled={pending}>
            Record reversal
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
