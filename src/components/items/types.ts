import type { PlainItem, PlainBatch } from "@/lib/serialize";

export type ItemWithFlags = PlainItem & {
  batches: PlainBatch[];
  totalQty: number;
  lowStock: boolean;
  outOfStock: boolean;
  hasExpired: boolean;
  hasNearExpiry: boolean;
};
