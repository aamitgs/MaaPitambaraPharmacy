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
  action: (id: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      try {
        await action(id);
        toast.success(`${label} deleted`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete");
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
