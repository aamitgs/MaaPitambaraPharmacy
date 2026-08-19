"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function PharmacistSignoffDialog({
  open,
  onOpenChange,
  onSubmit,
  error,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (email: string, password: string) => void;
  error: string | null;
  submitting: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmail("");
      setPassword("");
    }
  }

  function submit() {
    if (!email.trim() || !password) return;
    onSubmit(email.trim(), password);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pharmacist sign-off required</DialogTitle>
          <DialogDescription>
            This sale contains a Schedule H/H1/X item. A Pharmacist or Owner must authenticate to sign off
            before it can be completed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="signoffEmail">Pharmacist email</Label>
            <Input
              id="signoffEmail"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signoffPassword">Password</Label>
            <Input
              id="signoffPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!email.trim() || !password || submitting}
            onClick={submit}
          >
            Verify &amp; complete sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
