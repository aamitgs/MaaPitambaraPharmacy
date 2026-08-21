"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword } from "@/lib/actions/account";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && next !== confirm;

  function submit() {
    startTransition(async () => {
      try {
        await changeOwnPassword({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        });
        setCurrent("");
        setNext("");
        setConfirm("");
        toast.success("Password changed — it applies the next time you sign in");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not change your password");
      }
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <h2 className="text-sm font-medium">Password</h2>
        <p className="text-sm text-muted-foreground">
          Change your own sign-in password. You need the current one.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <div className="relative">
            <Input
              id="current-password"
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide passwords" : "Show passwords"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-[11px] text-muted-foreground">
            At least 8 characters, and not digits alone.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch}
          />
          {mismatch && (
            <p className="text-[11px] text-destructive">The two new passwords do not match.</p>
          )}
        </div>
      </div>

      <Button
        onClick={submit}
        disabled={pending || !current || next.length < 8 || next !== confirm}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Change password
      </Button>
    </div>
  );
}
