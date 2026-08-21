import Link from "next/link";
import { ChevronLeft, ShieldAlert, CheckCircle2 } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getDuplicateCustomers } from "@/lib/actions/customer-merge";
import { DuplicateGroupCard } from "@/components/customers/merge-duplicates";

export default async function DuplicateCustomersPage() {
  if (!(await hasPermission("customers.manage"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to merge customers</p>
      </div>
    );
  }

  const groups = await getDuplicateCustomers();

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Customers
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Possible duplicates</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The same person entered twice ends up with two credit accounts and two balances, and only
          one of them gets chased. Nothing here is merged automatically — a shared phone number is
          strong evidence, a shared name is not.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border p-16 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <p className="text-sm font-medium">No duplicates found.</p>
          <p className="text-sm text-muted-foreground">
            Every customer record looks like a different person.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <DuplicateGroupCard key={`${g.reason}-${g.key}`} reason={g.reason} members={g.members} />
          ))}
        </div>
      )}
    </div>
  );
}
