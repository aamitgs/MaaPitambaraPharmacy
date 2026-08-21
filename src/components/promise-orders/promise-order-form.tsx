"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPromiseOrder } from "@/lib/actions/promise-orders";
import { Loader2, Plus } from "lucide-react";

export function PromiseOrderForm({
  customers,
  items,
  triggerLabel = "Take a promise order",
  defaultRequestedName = "",
}: {
  customers: { id: string; name: string; phone: string | null }[];
  items: { id: string; name: string }[];
  triggerLabel?: string;
  defaultRequestedName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [requestedName, setRequestedName] = useState(defaultRequestedName);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [customerId, setCustomerId] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  // Picking a customer on file fills their number, since that is the point
  // of them being on file.
  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c?.phone && !phone) setPhone(c.phone);
  }

  function submit() {
    startTransition(async () => {
      try {
        await createPromiseOrder({
          requestedName,
          itemId: itemId || undefined,
          qty: Number(qty) || 1,
          customerId: customerId || undefined,
          contactName: contactName || undefined,
          phone: phone || undefined,
          note: note || undefined,
        });
        toast.success("Added to the promise list");
        setOpen(false);
        setRequestedName("");
        setItemId("");
        setQty("1");
        setCustomerId("");
        setContactName("");
        setPhone("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save it");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take a promise order</DialogTitle>
            <DialogDescription>
              For a medicine you don&apos;t have today. Nothing is reserved — the list tells you
              when stock is on the shelf, and it is first come first served until it is billed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-name">What did they ask for?</Label>
              <Input
                id="po-name"
                value={requestedName}
                onChange={(e) => setRequestedName(e.target.value)}
                placeholder="In their words — e.g. the blue inhaler"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="po-item">Match to an item</Label>
                <select
                  id="po-item"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                >
                  <option value="">Not in the item master</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Matched orders track stock automatically.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-qty">Quantity</Label>
                <Input
                  id="po-qty"
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="po-cust">Customer on file</Label>
              <select
                id="po-cust"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={customerId}
                onChange={(e) => pickCustomer(e.target.value)}
              >
                <option value="">Walk-in</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="po-contact">Name</Label>
                <Input
                  id="po-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={Boolean(customerId)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-phone">Phone</Label>
                <Input id="po-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A number is required — without one there is no way to tell them it arrived.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="po-note">Note</Label>
              <Input id="po-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !requestedName.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
