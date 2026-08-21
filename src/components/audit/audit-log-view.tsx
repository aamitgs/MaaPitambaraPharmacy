"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAuditLog, type AuditLogRow } from "@/lib/actions/audit-log";
import { ChevronDown, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const ANY = "__any__";

/** Reads better than the dotted key, without hiding anything unmapped. */
const ACTION_LABELS: Record<string, string> = {
  "sale.complete": "Sale completed",
  "invoice.cancel": "Bill cancelled",
  "sales_return.create": "Customer return",
  "stock.adjust": "Stock adjusted",
  "account.passwordChange": "Password changed",
  "mfa.enabled": "MFA enabled",
  "staff.unlock": "Account unlocked",
  "backup.restore": "Backup restored",
  "branding.update": "Branding changed",
  "branding.reset": "Branding reset",
  "settings.counterLimits.update": "Counter limits changed",
  "settings.selling.update": "Stock settings changed",
};

/** Actions worth spotting at a glance in a long list. */
const SENSITIVE = new Set([
  "invoice.cancel",
  "stock.adjust",
  "backup.restore",
  "staff.unlock",
  "settings.counterLimits.update",
  "account.passwordChange",
]);

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AuditLogView({
  initialRows,
  initialCursor,
  facets,
}: {
  initialRows: AuditLogRow[];
  initialCursor: string | null;
  facets: { actions: string[]; entities: string[]; users: { id: string; name: string }[] };
}) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [action, setAction] = useState(ANY);
  const [userId, setUserId] = useState(ANY);
  const [entity, setEntity] = useState(ANY);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filter = () => ({
    action: action === ANY ? undefined : action,
    userId: userId === ANY ? undefined : userId,
    entity: entity === ANY ? undefined : entity,
    from: from || undefined,
    to: to || undefined,
  });

  function apply() {
    startTransition(async () => {
      const result = await listAuditLog(filter());
      setRows(result.rows);
      setCursor(result.nextCursor);
      setExpanded(new Set());
    });
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const result = await listAuditLog({ ...filter(), cursor });
      setRows((r) => [...r, ...result.rows]);
      setCursor(result.nextCursor);
    });
  }

  function reset() {
    setAction(ANY);
    setUserId(ANY);
    setEntity(ANY);
    setFrom("");
    setTo("");
    startTransition(async () => {
      const result = await listAuditLog({});
      setRows(result.rows);
      setCursor(result.nextCursor);
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every privileged action, who did it and when. Owner only, and append-only — nothing in
          this app can edit or delete a row here.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Any action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any action</SelectItem>
              {facets.actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a] ?? a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Who</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Anyone</SelectItem>
              {facets.users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="audit-from">
            From
          </Label>
          <Input
            id="audit-from"
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="audit-to">
            To
          </Label>
          <Input
            id="audit-to"
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <Button onClick={apply} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Apply
        </Button>
        <Button variant="ghost" onClick={reset} disabled={pending}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs">
            <tr>
              <th className="w-8" />
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Who</th>
              <th className="px-3 py-2 text-left font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing recorded for those filters.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const open = expanded.has(row.id);
              const hasDetail = row.before !== null || row.after !== null;
              return (
                <tr key={row.id} className={cn("border-t align-top", open && "bg-muted/20")}>
                  <td className="py-2 pl-2">
                    {hasDetail && (
                      <button
                        type="button"
                        aria-label={open ? "Hide details" : "Show details"}
                        onClick={() =>
                          setExpanded((s) => {
                            const next = new Set(s);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format(new Date(row.createdAt), "dd MMM yyyy, HH:mm:ss")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={SENSITIVE.has(row.action) ? "destructive" : "outline"}>
                      {ACTION_LABELS[row.action] ?? row.action}
                    </Badge>
                    {open && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <div className="text-[11px] font-medium text-muted-foreground">
                            Before
                          </div>
                          <Json value={row.before} />
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-muted-foreground">
                            After
                          </div>
                          <Json value={row.after} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.userName}
                    <div className="text-[11px] text-muted-foreground">{row.userEmail}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {row.entity}
                    <div className="font-mono text-[10px]">{row.entityId}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cursor && (
        <Button variant="outline" onClick={loadMore} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  );
}
