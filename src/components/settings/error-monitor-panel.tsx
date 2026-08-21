"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { Check, ChevronDown, CircleAlert, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveError, type ErrorRow } from "@/lib/actions/error-monitor";

export function ErrorMonitorPanel({ errors }: { errors: ErrorRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (errors.length === 0) {
    return (
      <div className="max-w-2xl space-y-2">
        <h2 className="text-sm font-semibold">Faults</h2>
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
          <CircleCheck className="h-4 w-4 text-success" />
          Nothing has gone wrong since the last time these were cleared.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Faults</h2>
        <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
          {errors.length} open
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Errors that reached someone using the app. Repeats are counted rather than repeated, so a
        fault that happens on every sale is one line here.
      </p>

      <div className="divide-y rounded-lg border">
        {errors.map((e) => (
          <div key={e.id} className="p-3 text-sm">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.context}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {e.source}
                  </Badge>
                  {e.occurrences > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      ×{e.occurrences}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 break-words text-muted-foreground">{e.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Last {formatDistanceToNow(new Date(e.lastSeenAt), { addSuffix: true })}
                  {e.occurrences > 1 &&
                    ` · first seen ${format(new Date(e.firstSeenAt), "d MMM, h:mm a")}`}
                </p>
                {expanded === e.id && e.stack && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                    {e.stack}
                  </pre>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {e.stack && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Show details"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", expanded === e.id && "rotate-180")}
                    />
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Mark as dealt with"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await resolveError(e.id);
                      toast.success("Marked as dealt with");
                      router.refresh();
                    })
                  }
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
