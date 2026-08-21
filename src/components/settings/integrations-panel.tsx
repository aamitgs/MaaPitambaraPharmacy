import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { getIntegrationStatuses } from "@/lib/integrations";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * A server component on purpose: it reads env vars, which must never be
 * bundled for the browser. Only the booleans cross the wire.
 */
export function IntegrationsPanel() {
  const statuses = getIntegrationStatuses();
  const missing = statuses.filter((s) => !s.configured);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Optional services. Each one degrades quietly when unset — this is where you can see
          which are actually live. Values are read from the server&apos;s environment; the keys
          themselves are never shown here or sent to this browser.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <p className="text-muted-foreground">
            {missing.length} of {statuses.length} are not configured. Set the variables in the
            server&apos;s <code>.env</code> and restart the app — they are read at startup.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {statuses.map((s) => (
          <div key={s.key} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {s.configured ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant={s.configured ? "secondary" : "outline"}>
                    {s.configured ? "Live" : "Not configured"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.purpose}</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.vars.map((v) => (
                <span
                  key={v.name}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px]",
                    v.set
                      ? "bg-success/10 text-success"
                      : v.required
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                  )}
                  title={v.required ? "Required" : "Optional"}
                >
                  {v.name}
                  {!v.set && !v.required && " (optional)"}
                </span>
              ))}
            </div>

            {!s.configured && (
              <p className="mt-2 text-[11px] text-muted-foreground">{s.hint}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
