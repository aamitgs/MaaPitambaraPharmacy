"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function ManagerPinDialog({
  open,
  onOpenChange,
  onSubmit,
  error,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (pin: string) => void;
  error: string | null;
  reason: string;
}) {
  const [pin, setPin] = useState("");
  // Reset the field when the dialog transitions closed -> open. Adjusting
  // state during render (rather than in an effect) avoids an extra commit.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPin("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manager approval required</DialogTitle>
          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <InputOTP
            maxLength={4}
            value={pin}
            autoFocus
            onChange={(value) => {
              setPin(value);
              if (value.length === 4) onSubmit(value);
            }}
          >
            <InputOTPGroup>
              {Array.from({ length: 4 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button className="w-full" disabled={pin.length !== 4} onClick={() => onSubmit(pin)}>
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
