import Link from "next/link";
import { format } from "date-fns";
import {
  ShieldAlert,
  MessageCircle,
  MessageSquare,
  Mail,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listCommunications } from "@/lib/actions/communications";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const CHANNEL_ICON = {
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
} as const;

const CHANNEL_LABEL = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" } as const;

const TABS = [
  { key: "all", label: "All channels" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
] as const;

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; status?: string }>;
}) {
  if (!(await hasPermission("customers.manage"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to see the message log</p>
      </div>
    );
  }

  const params = await searchParams;
  const channel = (params.channel ?? "all") as "all" | "whatsapp" | "sms" | "email";
  const status = (params.status ?? "all") as "all" | "failed";
  const { entries, failedCount } = await listCommunications({ channel, status });

  const link = (next: Record<string, string>) => {
    const q = new URLSearchParams({ channel, ...(status !== "all" ? { status } : {}), ...next });
    for (const [k, v] of [...q.entries()]) if (v === "all") q.delete(k);
    return `/communications${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Message log</h1>
        <p className="text-sm text-muted-foreground">
          Every bill, statement and reminder sent to a customer, across all three channels —
          who it went to, when, and whether it actually arrived.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={link({ channel: t.key })}
              className={cn(
                "px-3 py-1.5 text-xs",
                channel === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <Link
          href={link({ status: status === "failed" ? "all" : "failed" })}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs",
            status === "failed"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "hover:bg-muted"
          )}
        >
          Not delivered{failedCount > 0 && ` (${failedCount})`}
        </Link>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>To</TableHead>
              <TableHead>About</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing sent yet.
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => {
              const Icon = CHANNEL_ICON[e.channel];
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(e.sentAt), "dd MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {CHANNEL_LABEL[e.channel]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{e.recipient}</div>
                    {e.customerName && (
                      <div className="text-xs text-muted-foreground">{e.customerName}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {e.messageType}
                    </Badge>
                    {e.invoiceId && e.invoiceNo && (
                      <Link
                        href={`/invoices/${e.invoiceId}/receipt`}
                        className="ml-1.5 text-xs underline underline-offset-2"
                      >
                        {e.invoiceNo}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm",
                        e.failed ? "text-destructive" : "text-success"
                      )}
                    >
                      {e.failed ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span className="capitalize">{e.status.replace("_", " ")}</span>
                    </div>
                    {e.note && (
                      <div className="max-w-md text-xs text-muted-foreground">{e.note}</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
