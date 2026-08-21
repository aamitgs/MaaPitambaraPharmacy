"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { canViewPurchaseRate } from "@/lib/rbac";

export type SearchHit = {
  id: string;
  group: "Items" | "Customers" | "Doctors" | "Suppliers" | "Invoices";
  title: string;
  subtitle: string | null;
  href: string;
  /** Item stock, so "have we got it?" is answered in the palette rather
   *  than one screen later. Null for everything that isn't an item. */
  stock?: { qty: number; low: boolean } | null;
};

/**
 * One query box across the records staff actually hunt for mid-shift. Every
 * lookup is tenant-scoped server-side — the palette never sees another
 * pharmacy's data, and hits are capped so a one-letter query can't drag the
 * whole catalogue over the wire.
 */
export async function globalSearch(term: string): Promise<SearchHit[]> {
  const session = await requireSession();
  const q = term.trim();
  if (q.length < 2) return [];

  const tenantId = session.user.tenantId;
  const contains = { contains: q, mode: "insensitive" as const };

  const [items, customers, doctors, suppliers, invoices] = await Promise.all([
    prisma.item.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ name: contains }, { genericName: contains }, { manufacturer: contains }],
      },
      take: 6,
      select: {
        id: true,
        name: true,
        genericName: true,
        manufacturer: true,
        reorderLevel: true,
        batches: { select: { currentQty: true } },
      },
    }),
    prisma.customer.findMany({
      where: { tenantId, OR: [{ name: contains }, { phone: contains }] },
      take: 5,
      select: { id: true, name: true, phone: true },
    }),
    prisma.doctor.findMany({
      where: { tenantId, OR: [{ name: contains }, { registrationNo: contains }] },
      take: 4,
      select: { id: true, name: true, clinicName: true },
    }),
    prisma.supplier.findMany({
      where: { tenantId, OR: [{ name: contains }, { gstin: contains }] },
      take: 4,
      select: { id: true, name: true, gstin: true },
    }),
    prisma.salesInvoice.findMany({
      where: { tenantId, invoiceNo: contains },
      take: 5,
      orderBy: { invoiceDate: "desc" },
      select: { id: true, invoiceNo: true, total: true, invoiceDate: true },
    }),
  ]);

  const showRates = canViewPurchaseRate(session.user.role);

  return [
    ...items.map((i) => {
      const qty = i.batches.reduce((sum, b) => sum + b.currentQty, 0);
      return {
        id: i.id,
        group: "Items" as const,
        title: i.name,
        subtitle: [i.genericName, i.manufacturer].filter(Boolean).join(" · ") || null,
        href: `/items/${i.id}`,
        stock: { qty, low: qty < i.reorderLevel },
      };
    }),
    ...invoices.map((i) => ({
      id: i.id,
      group: "Invoices" as const,
      title: i.invoiceNo,
      subtitle: `₹${Number(i.total).toFixed(2)} · ${i.invoiceDate.toLocaleDateString("en-IN")}`,
      href: `/invoices/${i.id}/receipt`,
    })),
    ...customers.map((c) => ({
      id: c.id,
      group: "Customers" as const,
      title: c.name,
      subtitle: c.phone,
      href: `/customers/${c.id}`,
    })),
    ...doctors.map((d) => ({
      id: d.id,
      group: "Doctors" as const,
      title: d.name,
      subtitle: d.clinicName,
      href: "/doctors",
    })),
    ...suppliers.map((s) => ({
      id: s.id,
      group: "Suppliers" as const,
      title: s.name,
      // GSTIN is commercial detail; counter staff don't need it in a palette.
      subtitle: showRates ? s.gstin : null,
      href: `/suppliers/${s.id}`,
    })),
  ];
}
