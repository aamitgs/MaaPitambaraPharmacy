import { auth } from "@/auth";
import { listSchemes, listItemNamesForSchemes } from "@/lib/actions/schemes";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { SchemeForm } from "@/components/schemes/scheme-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function SchemesPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const [schemes, items] = await Promise.all([listSchemes(), listItemNamesForSchemes()]);
  const canCreate = session.user.role === "owner";
  const now = new Date();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Schemes</h1>
          <p className="text-sm text-muted-foreground">
            {schemes.length} scheme{schemes.length === 1 ? "" : "s"} — auto-applied on matching cart items at billing
          </p>
        </div>
        {canCreate && <SchemeForm items={items} />}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Valid window</TableHead>
              <TableHead>Status</TableHead>
              {canCreate && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {schemes.length ? (
              schemes.map((s) => {
                const inWindow = new Date(s.validFrom) <= now && now <= new Date(s.validTo);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.type === "percent_off"
                        ? `${s.config.percent ?? 0}% off`
                        : `Buy ${s.config.buyQty} Get ${s.config.getQty} Free`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(s.validFrom), "dd MMM yyyy")} – {format(new Date(s.validTo), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {s.active && inWindow ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/15">Live</Badge>
                      ) : s.active ? (
                        <Badge variant="outline">Out of window</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    {canCreate && (
                      <TableCell>
                        <SchemeForm
                          scheme={s}
                          items={items}
                          trigger={
                            <Button size="sm" variant="outline">
                              Edit
                            </Button>
                          }
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No schemes yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
