import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageCompliance } from "@/lib/rbac";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";

export default async function BranchesPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (!canManageCompliance(session.user.role)) return <RestrictedAccess />;

  const branches = await prisma.branch.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
  const canCreate = session.user.role === "owner";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            {branches.length} branch{branches.length === 1 ? "" : "es"}
          </p>
        </div>
        {canCreate && (
          <Button asChild size="sm">
            <Link href="/branches/new">
              <Plus /> New branch
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length ? (
              branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.licensedAddress}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.gstin || "—"}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/branches/${b.id}`}>Edit</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No branches yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
