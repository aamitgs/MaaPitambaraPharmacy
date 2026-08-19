"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageCircle, Loader2 } from "lucide-react";

/**
 * One button, opens a tiny inline popover (not a new screen) with the
 * phone number pre-filled from the customer on file — editable for a
 * one-off send to a different number. Mirrors "Print" as a natural
 * post-sale action, per the phase's design direction.
 */
export function SendWhatsAppButton({
  defaultPhone,
  onSend,
}: {
  defaultPhone: string | null;
  onSend: (
    phone: string
  ) => Promise<{ success: boolean; note?: string; handoffUrl?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [pending, startTransition] = useTransition();

  function handleSend() {
    if (!phone.trim()) {
      toast.error("Enter a phone number to send to.");
      return;
    }
    startTransition(async () => {
      const result = await onSend(phone.trim());
      if (result.success) {
        toast.success("Sent via WhatsApp");
        setOpen(false);
        return;
      }
      if (result.handoffUrl) {
        // No Business API credentials: open the message in the staff
        // member's own WhatsApp instead of failing. A new tab rather than a
        // redirect so the receipt stays on screen behind it.
        window.open(result.handoffUrl, "_blank", "noopener,noreferrer");
        toast.info(result.note ?? "Opened in WhatsApp — press send there.");
        setOpen(false);
        return;
      }
      toast.error(result.note ?? "Could not send via WhatsApp");
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageCircle className="h-4 w-4" /> Send via WhatsApp
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-phone" className="text-xs">
            Phone number
          </Label>
          <Input
            id="whatsapp-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
          />
        </div>
        <Button size="sm" className="w-full" onClick={handleSend} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Send
        </Button>
      </PopoverContent>
    </Popover>
  );
}
