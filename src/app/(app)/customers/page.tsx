import Link from "next/link";
import { listCustomers } from "@/lib/actions/customers";
import { CustomerForm } from "@/components/customers/customer-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <CustomerForm />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Credit account</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length ? (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/customers/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  <TableCell>
                    {c.creditLimit !== null ? (
                      <Badge variant="outline">Limit ₹{c.creditLimit.toFixed(2)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.outstandingBalance > 0 ? (
                      <span className="text-destructive">₹{c.outstandingBalance.toFixed(2)}</span>
                    ) : (
                      "₹0.00"
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No customers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
