"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Mail, Loader2 } from "lucide-react";

/**
 * Sibling of SendWhatsAppButton — same inline popover, same two outcomes:
 * sent through SMTP when configured, otherwise handed to the machine's own
 * mail client via a mailto: link.
 */
export function SendEmailButton({
  defaultEmail,
  onSend,
}: {
  defaultEmail: string | null;
  onSend: (
    email: string
  ) => Promise<{ success: boolean; note?: string; handoffUrl?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [pending, startTransition] = useTransition();

  function handleSend() {
    if (!email.trim()) {
      toast.error("Enter an email address to send to.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await onSend(email.trim());
        if (result.success) {
          toast.success("Sent by email");
          setOpen(false);
          return;
        }
        if (result.handoffUrl) {
          // Same tab: a mailto: navigation hands off to the mail client and
          // leaves the page where it was.
          window.location.href = result.handoffUrl;
          toast.info(result.note ?? "Opened in your mail app — press send there.");
          setOpen(false);
          return;
        }
        toast.error(result.note ?? "Could not send by email");
      } catch (e) {
        // Zod rejects a malformed address server-side; surface that rather
        // than a blank failure.
        toast.error(e instanceof Error ? e.message : "Could not send by email");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Mail className="h-4 w-4" /> Send via Email
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="send-email" className="text-xs">
            Email address
          </Label>
          <Input
            id="send-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
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
