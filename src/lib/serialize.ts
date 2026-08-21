import type {
  Item,
  Batch,
  Customer,
  CustomerLedgerEntry,
  Supplier,
  SupplierLedgerEntry,
  PurchaseOrderItem,
  GrnItem,
  PurchaseReturn,
  PurchaseReturnItem,
} from "@/generated/prisma/client";

// Prisma's Decimal is a class instance, not a plain object — it doesn't
// survive the React Server Component serialization boundary (props passed
// to Client Components, and server action return values). Every read path
// that hands Item/Batch rows to client code must convert Decimal fields to
// plain numbers first, or money math downstream silently gets NaN/garbage.

export type PlainItem = Omit<Item, "taxRate"> & { taxRate: number };
export type PlainBatch = Omit<Batch, "mrp" | "purchaseRate" | "saleRate" | "ptr"> & {
  mrp: number;
  purchaseRate: number;
  saleRate: number;
  ptr: number | null;
};

export function serializeItem(item: Item): PlainItem {
  return { ...item, taxRate: Number(item.taxRate) };
}

export function serializeBatch(batch: Batch): PlainBatch {
  return {
    ...batch,
    mrp: Number(batch.mrp),
    purchaseRate: Number(batch.purchaseRate),
    saleRate: Number(batch.saleRate),
    ptr: batch.ptr === null ? null : Number(batch.ptr),
  };
}

// Customer.outstandingBalance is a cache column only — callers must
// overwrite it with a ledger-summed value (see computeCustomerOutstandingBalances
// in src/lib/actions/customers.ts) before this reaches the client, never
// trust the raw column.
export type PlainCustomer = Omit<Customer, "creditLimit" | "outstandingBalance"> & {
  creditLimit: number | null;
  outstandingBalance: number;
};

export function serializeCustomer(customer: Customer): PlainCustomer {
  return {
    ...customer,
    creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
    outstandingBalance: Number(customer.outstandingBalance),
  };
}

export type PlainCustomerLedgerEntry = Omit<CustomerLedgerEntry, "amount"> & {
  amount: number;
};

export function serializeCustomerLedgerEntry(entry: CustomerLedgerEntry): PlainCustomerLedgerEntry {
  return { ...entry, amount: Number(entry.amount) };
}

// Supplier.outstandingBalance is a cache column only — callers must overwrite
// it with a ledger-summed value (see computeSupplierOutstandingBalance in
// src/lib/actions/suppliers.ts) before this reaches the client, never trust
// the raw column.
export type PlainSupplier = Omit<Supplier, "outstandingBalance"> & {
  outstandingBalance: number;
};

export function serializeSupplier(supplier: Supplier): PlainSupplier {
  return { ...supplier, outstandingBalance: Number(supplier.outstandingBalance) };
}

export type PlainSupplierLedgerEntry = Omit<SupplierLedgerEntry, "amount"> & {
  amount: number;
};

export function serializeSupplierLedgerEntry(entry: SupplierLedgerEntry): PlainSupplierLedgerEntry {
  return { ...entry, amount: Number(entry.amount) };
}

export type PlainPurchaseOrderItem = Omit<PurchaseOrderItem, "rate"> & { rate: number };

export function serializePurchaseOrderItem(item: PurchaseOrderItem): PlainPurchaseOrderItem {
  return { ...item, rate: Number(item.rate) };
}

export type PlainGrnItem = Omit<GrnItem, "mrp" | "rate"> & { mrp: number; rate: number };

export function serializeGrnItem(item: GrnItem): PlainGrnItem {
  return { ...item, mrp: Number(item.mrp), rate: Number(item.rate) };
}

export type PlainPurchaseReturn = Omit<PurchaseReturn, "totalAmount"> & { totalAmount: number };

export function serializePurchaseReturn(ret: PurchaseReturn): PlainPurchaseReturn {
  return { ...ret, totalAmount: Number(ret.totalAmount) };
}

export type PlainPurchaseReturnItem = Omit<PurchaseReturnItem, "rate"> & { rate: number };

export function serializePurchaseReturnItem(item: PurchaseReturnItem): PlainPurchaseReturnItem {
  return { ...item, rate: Number(item.rate) };
}
