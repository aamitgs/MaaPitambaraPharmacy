import Link from "next/link";
import { ChevronLeft, CircleCheck, CircleAlert, Repeat } from "lucide-react";
import { auth } from "@/auth";
import { getCompositionHealth, listSaltAliases } from "@/lib/actions/composition-health";
import { canEditItemMaster } from "@/lib/rbac";
import { SaltAliases } from "@/components/items/salt-aliases";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default async function CompositionPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [health, aliases] = await Promise.all([getCompositionHealth(), listSaltAliases()]);
  const canEdit = canEditItemMaster(session.user.role);
  const pct = health.total === 0 ? 0 : Math.round((health.usable / health.total) * 100);

  return (
    <div className="space-y-5 p-6">
      <Link
        href="/items"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Items
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Composition &amp; substitutes</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          When a medicine runs out, the billing screen offers anything with the same salts at the
          same strengths. That only works for items whose composition is written in a form the app
          can read.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Ready for substitution</div>
          <div className="text-xl font-semibold tabular-nums">
            {health.usable} <span className="text-sm font-normal text-muted-foreground">of {health.total}</span>
          </div>
          <div className="text-xs text-muted-foreground">{pct}%</div>
        </div>
        <div
          className={cn(
            "rounded-lg border p-3",
            health.issues.length > 0 && "border-warning/40 bg-warning/5"
          )}
        >
          <div className="text-xs text-muted-foreground">Need attention</div>
          <div className="text-xl font-semibold tabular-nums">{health.issues.length}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Substitutable groups</div>
          <div className="text-xl font-semibold tabular-nums">{health.groups.length}</div>
          <div className="text-xs text-muted-foreground">two or more brands</div>
        </div>
      </div>

      {health.groups.length > 0 && (
        <div className="max-w-3xl space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Repeat className="h-4 w-4" /> Working today
          </h2>
          <div className="divide-y rounded-lg border">
            {health.groups.slice(0, 15).map((g) => (
              <div key={g.key} className="p-2.5 text-sm">
                <div className="font-medium">{g.itemNames.join(" · ")}</div>
                <div className="text-xs text-muted-foreground">{g.composition}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-3xl space-y-2">
        <h2 className="text-sm font-semibold">
          {health.issues.length === 0 ? "Nothing to fix" : "Cannot be matched yet"}
        </h2>
        {health.issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
            <CircleCheck className="h-4 w-4 text-success" />
            Every item has a composition the app can read.
          </div>
        ) : (
          <>
            <p className="max-w-prose text-xs text-muted-foreground">
              Every ingredient needs a strength. Write{" "}
              <code className="rounded bg-muted px-1">Paracetamol 500mg</code> or{" "}
              <code className="rounded bg-muted px-1">
                Amoxicillin 500mg + Clavulanic Acid 125mg
              </code>
              . A syrup keeps its basis:{" "}
              <code className="rounded bg-muted px-1">Codeine 10mg/5ml</code>.
            </p>
            <div className="divide-y rounded-lg border">
              {health.issues.map((i) => (
                <div key={i.itemId} className="flex items-start gap-2 p-2.5 text-sm">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/items/${i.itemId}/edit`}
                      className="font-medium hover:underline"
                    >
                      {i.name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {i.reason === "missing" ? (
                        "No composition recorded"
                      ) : (
                        <>
                          <span className="font-mono">{i.composition}</span> — no strengths
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {i.reason === "missing" ? "missing" : "unreadable"}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Separator className="max-w-3xl" />

      <SaltAliases aliases={aliases} canEdit={canEdit} />
    </div>
  );
}
