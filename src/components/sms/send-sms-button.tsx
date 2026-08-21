"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquare, Loader2 } from "lucide-react";

/**
 * Mirrors the WhatsApp button: one control, an inline popover, the number
 * pre-filled from whoever is on the bill.
 *
 * Shows the segment count after sending because SMS is billed per part,
 * and a pharmacy sending hundreds of bills a month should be able to see
 * that a bill costs one message rather than three.
 */
export function SendSmsButton({
  defaultPhone,
  onSend,
}: {
  defaultPhone: string | null;
  onSend: (phone: string) => Promise<{
    success: boolean;
    note?: string;
    text?: string;
    segments?: number;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [preview, setPreview] = useState<{ text?: string; segments?: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSend() {
    if (!phone.trim()) {
      toast.error("Enter a mobile number to send to.");
      return;
    }
    startTransition(async () => {
      const result = await onSend(phone.trim());
      setPreview({ text: result.text, segments: result.segments });
      if (result.success) {
        toast.success(
          result.segments && result.segments > 1
            ? `Sent as ${result.segments} SMS parts`
            : "Sent by SMS"
        );
        setOpen(false);
        return;
      }
      toast.error(result.note ?? "Could not send the SMS");
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquare className="h-4 w-4" /> Send by SMS
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="sms-phone" className="text-xs">
            Mobile number
          </Label>
          <Input
            id="sms-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            inputMode="numeric"
          />
          <p className="text-[11px] text-muted-foreground">
            Mobile only — a landline cannot receive SMS.
          </p>
        </div>

        {preview?.text && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-2">
            <p className="text-[11px] leading-relaxed">{preview.text}</p>
            {preview.segments !== undefined && (
              <p className="text-[10px] text-muted-foreground">
                {preview.segments} SMS part{preview.segments === 1 ? "" : "s"}
              </p>
            )}
          </div>
        )}

        <Button size="sm" className="w-full" onClick={handleSend} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Send
        </Button>
      </PopoverContent>
    </Popover>
  );
}
