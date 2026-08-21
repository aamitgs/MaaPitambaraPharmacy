"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/actions/error-monitor";

/**
 * What staff see when a screen crashes, and — more importantly — the point
 * at which the crash gets recorded somewhere the owner will find it.
 *
 * Next.js hands this boundary a digest rather than the original message
 * for server-side errors, so the digest is reported too: it is the only
 * thing that ties this screen to the full stack in the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientError(
      `screen crash${error.digest ? ` (digest ${error.digest})` : ""}`,
      error.message,
      error.stack
    );
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div>
        <p className="text-sm font-medium">Something went wrong on this screen.</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          It has been recorded for the owner to look at. Nothing you had already saved is lost —
          bills, payments and stock are only written when they succeed.
        </p>
      </div>
      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          Reference {error.digest}
        </code>
      )}
      <Button onClick={reset} variant="outline" size="sm">
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
