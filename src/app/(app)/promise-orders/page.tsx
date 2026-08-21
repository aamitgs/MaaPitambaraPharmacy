import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listPromiseOrders } from "@/lib/actions/promise-orders";
import { PromiseOrderList } from "@/components/promise-orders/promise-order-list";
import { PromiseOrderForm } from "@/components/promise-orders/promise-order-form";
import { listCustomers } from "@/lib/actions/customers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function PromiseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await hasPermission("sales.sell"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to see promise orders</p>
      </div>
    );
  }

  const session = await auth();
  const params = await searchParams;
  const showAll = params.status === "all";

  const [orders, customers, items] = await Promise.all([
    listPromiseOrders(showAll ? "all" : "open"),
    listCustomers(),
    prisma.item.findMany({
      where: { tenantId: session!.user.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
  ]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Promise orders</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Medicines customers asked for that weren&apos;t in stock. Stock levels here are live,
            not a flag set when a delivery arrived — so an order only shows as ready if the
            medicine is on the shelf right now.
          </p>
        </div>
        <PromiseOrderForm
          customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
          items={items}
        />
      </div>

      <PromiseOrderList orders={orders} showAll={showAll} />
    </div>
  );
}
