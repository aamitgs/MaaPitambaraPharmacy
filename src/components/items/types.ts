import type { PlainItem, PlainBatch } from "@/lib/serialize";

export type ItemWithFlags = PlainItem & {
  batches: PlainBatch[];
  supplierName: string | null;
  totalQty: number;
  lowStock: boolean;
  outOfStock: boolean;
  hasExpired: boolean;
  hasNearExpiry: boolean;
};
