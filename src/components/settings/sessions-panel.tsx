"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { Monitor, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeDevice } from "@/lib/user-agent";
import { revokeSession, revokeOtherSessions, type SessionRow } from "@/lib/actions/sessions";

export function SessionsPanel({
  sessions,
  isOwner,
  currentUserId,
}: {
  sessions: SessionRow[];
  isOwner: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const mine = sessions.filter((s) => s.userId === currentUserId);
  const others = sessions.filter((s) => s.userId !== currentUserId);

  function end(id: string, label: string) {
    setBusy(id);
    startTransition(async () => {
      try {
        await revokeSession(id);
        toast.success(`Signed out ${label}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    });
  }

  const row = (s: SessionRow, showWho: boolean) => (
    <div
      key={s.id}
      className={cn(
        "flex items-start gap-3 p-3 text-sm",
        s.isCurrent && "bg-primary/5"
      )}
    >
      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{describeDevice(s.userAgent)}</span>
          {s.isCurrent && <Badge variant="secondary">This device</Badge>}
          {showWho && <Badge variant="outline">{s.userName}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {s.ipPrefix ? `${s.ipPrefix} · ` : ""}
          active {formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })} · signed in{" "}
          {format(new Date(s.createdAt), "d MMM, h:mm a")}
        </p>
      </div>
      {!s.isCurrent && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending && busy === s.id}
          onClick={() => end(s.id, showWho ? s.userName : describeDevice(s.userAgent))}
        >
          End
        </Button>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Signed-in devices</h2>
          <p className="text-xs text-muted-foreground">
            Ending a session cuts that device off at once — it does not wait for the session to
            time out.
          </p>
        </div>
        {mine.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const n = await revokeOtherSessions();
                toast.success(`Signed out ${n} other device${n === 1 ? "" : "s"}`);
                router.refresh();
              })
            }
          >
            <LogOut /> Sign out my other devices
          </Button>
        )}
      </div>

      <div className="divide-y rounded-lg border">{mine.map((s) => row(s, false))}</div>

      {isOwner && others.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold">Other staff</h3>
          <p className="text-xs text-muted-foreground">
            Who else is signed in, and on what. On a shared counter PC this is how you find a
            session someone walked away from.
          </p>
          <div className="divide-y rounded-lg border">{others.map((s) => row(s, true))}</div>
        </>
      )}
    </div>
  );
}
