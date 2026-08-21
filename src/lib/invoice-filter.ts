import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { parseLocalDate } from "@/lib/date-range";

/**
 * One place that turns invoice search params into a Prisma filter.
 *
 * Shared by the list screen and the CSV export deliberately: the export
 * button sits next to a filtered table, so if the two built their own
 * filters, "export" would silently mean something other than what is on
 * screen — which is the sort of difference nobody notices until a figure
 * is queried months later.
 */
export type InvoiceFilter = {
  q?: string;
  from?: string;
  to?: string;
  paymentMode?: string;
  status?: string;
  medicine?: string;
};

export function buildInvoiceWhere(
  tenantId: string,
  filter: InvoiceFilter,
  branchFilter: Record<string, unknown> = {}
): Prisma.SalesInvoiceWhereInput {
  const where: Prisma.SalesInvoiceWhereInput = { tenantId, ...branchFilter };

  const q = filter.q?.trim();
  if (q) {
    where.OR = [
      { invoiceNo: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { phone: { contains: q } } },
      { patientName: { contains: q, mode: "insensitive" } },
      { patientPhone: { contains: q } },
    ];
  }

  const medicine = filter.medicine?.trim();
  if (medicine) {
    where.items = {
      some: {
        item: {
          OR: [
            { name: { contains: medicine, mode: "insensitive" } },
            { genericName: { contains: medicine, mode: "insensitive" } },
            { barcode: medicine },
          ],
        },
      },
    };
  }

  if (filter.from || filter.to) {
    // Local, not UTC: `new Date("2026-08-01")` is 05:30 IST, which would
    // drop a night shift's bills from the first day of any range.
    const invoiceDate: Prisma.DateTimeFilter = {};
    if (filter.from) invoiceDate.gte = parseLocalDate(filter.from);
    if (filter.to) {
      const to = parseLocalDate(filter.to);
      to.setHours(23, 59, 59, 999);
      invoiceDate.lte = to;
    }
    where.invoiceDate = invoiceDate;
  }

  if (filter.paymentMode && filter.paymentMode !== "all") {
    where.paymentMode = filter.paymentMode as Prisma.SalesInvoiceWhereInput["paymentMode"];
  }
  if (filter.status && filter.status !== "all") {
    where.status = filter.status as Prisma.SalesInvoiceWhereInput["status"];
  }

  return where;
}
