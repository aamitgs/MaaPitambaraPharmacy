"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cancelInvoice } from "@/lib/actions/invoice-cancel";
import { AlertTriangle, Ban, Loader2 } from "lucide-react";

/**
 * Only rendered for a bill raised today that has no return against it —
 * the same conditions the server enforces. Showing a button that is going
 * to be refused teaches staff to ignore refusals.
 */
export function CancelInvoiceButton({
  invoiceId,
  invoiceNo,
}: {
  invoiceId: string;
  invoiceNo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await cancelInvoice({ invoiceId, reason, managerPin: pin });
        toast.success(`${invoiceNo} cancelled — stock put back`);
        setOpen(false);
        setPin("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not cancel this bill");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Ban className="h-4 w-4" /> Cancel bill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {invoiceNo}</DialogTitle>
          <DialogDescription>
            For a bill that should never have been raised — a double-ring, a mis-scan, a customer
            who walked away. The stock goes straight back.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            If the customer took the medicines and brought them back, use{" "}
            <span className="font-medium">Return</span> instead — that raises a credit note, which
            is what GSTR-1 expects.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rang up twice by mistake"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-pin">Manager PIN</Label>
            <Input
              id="cancel-pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep the bill
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3 || !pin}
            onClick={submit}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancel this bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
