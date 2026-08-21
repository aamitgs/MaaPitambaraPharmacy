import Link from "next/link";
import { ShieldCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { getSecurityPosture } from "@/lib/actions/security-posture";
import { cn } from "@/lib/utils";

/**
 * Server component: the checks compare against known-bad credentials, and
 * that comparison must never happen anywhere the browser can see it. Only
 * the findings cross the wire.
 */
export async function SecurityPosture() {
  const findings = await getSecurityPosture();
  const critical = findings.filter((f) => f.severity === "critical").length;

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <h2 className="text-sm font-medium">Security check</h2>
        <p className="text-sm text-muted-foreground">
          Credentials still set to whatever the installation left behind. Only the owner sees
          this, and no password or PIN is shown here — each is only tested against known
          defaults.
        </p>
      </div>

      {findings.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/5 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div className="text-sm">
            <div className="font-medium">Nothing on a default</div>
            <p className="text-xs text-muted-foreground">
              No seeded passwords, no well-known manager PIN, and every owner and pharmacist has
              an authenticator app.
            </p>
          </div>
        </div>
      ) : (
        <>
          {critical > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <span className="font-medium text-destructive">
                {critical} credential{critical === 1 ? "" : "s"} anyone could guess.
              </span>{" "}
              <span className="text-muted-foreground">
                These are published defaults, not weak choices — they are known to everyone who
                has read the setup notes.
              </span>
            </div>
          )}
          {findings.map((f) => (
            <div
              key={f.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                f.severity === "critical"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-warning/30 bg-warning/5"
              )}
            >
              {f.severity === "critical" ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.title}</div>
                <p className="text-xs text-muted-foreground">{f.detail}</p>
              </div>
              <Link
                href={f.fixHref}
                className="shrink-0 text-xs font-medium underline underline-offset-2"
              >
                {f.fix}
              </Link>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
