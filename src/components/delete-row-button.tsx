"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { DeleteResult } from "@/lib/delete-result";

/**
 * The confirm-then-delete link used across the master-data list tables
 * (suppliers, customers, …). The server action is what actually decides
 * whether a row can go — a record with real history refuses with its own
 * message, which surfaces here as a toast rather than a broken dialog.
 */
export function DeleteRowButton({
  label,
  id,
  action,
}: {
  /** Name shown in the confirmation, e.g. the supplier's or customer's name. */
  label: string;
  id: string;
  /**
   * The server action itself — passed by reference, not wrapped in a
   * closure. A page that renders this as a Server Component (customers,
   * doctors) can only hand a Client Component a function across that
   * boundary if Next.js recognises it as a server action; a plain arrow
   * function built around one on the server does not qualify and fails
   * at render with "Functions cannot be passed directly to Client
   * Components".
   */
  action: (id: string) => Promise<DeleteResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await action(id);
        if (result.ok) {
          toast.success(`${label} deleted`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch {
        // A genuinely unexpected failure (network drop, DB down) — the
        // real message never reaches here (see DeleteResult above), so
        // there's nothing more specific to show.
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
        >
          Delete
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone. A record with any purchase, sales or payment history
            against it can&apos;t be deleted — only one that was never used.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
