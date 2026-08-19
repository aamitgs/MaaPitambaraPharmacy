import { db, type PosCacheRecord, type PendingSale, type PendingSaleStatus } from "./db";
import type { CompleteSaleInput } from "@/lib/actions/pos";

export async function saveCache(record: Omit<PosCacheRecord, "id" | "updatedAt">) {
  await db.posCache.put({ ...record, id: "current", updatedAt: Date.now() });
}

export async function loadCache(): Promise<PosCacheRecord | undefined> {
  return db.posCache.get("current");
}

export function newOfflineClientId(): string {
  return `off_${crypto.randomUUID()}`;
}

export async function queueSale(params: {
  tenantId: string;
  localId: string;
  payload: CompleteSaleInput;
  itemCount: number;
  total: number;
}): Promise<void> {
  const entry: PendingSale = {
    localId: params.localId,
    tenantId: params.tenantId,
    createdAt: Date.now(),
    payload: params.payload,
    summary: { itemCount: params.itemCount, total: params.total, paymentMode: params.payload.paymentMode },
    status: "pending",
  };
  await db.pendingSales.add(entry);
}

export async function listPendingSales(tenantId: string): Promise<PendingSale[]> {
  return db.pendingSales.where("tenantId").equals(tenantId).sortBy("createdAt");
}

export async function countUnsynced(tenantId: string): Promise<number> {
  return db.pendingSales
    .where("tenantId")
    .equals(tenantId)
    .filter((s) => s.status !== "synced")
    .count();
}

export async function updateSaleStatus(
  localId: string,
  status: PendingSaleStatus,
  extra?: { message?: string; invoiceNo?: string }
) {
  await db.pendingSales.update(localId, { status, ...extra });
}

export async function discardSale(localId: string) {
  await db.pendingSales.delete(localId);
}

/** Clears synced entries older than a day so the queue table doesn't grow forever. */
export async function pruneSynced(tenantId: string) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stale = await db.pendingSales
    .where("tenantId")
    .equals(tenantId)
    .filter((s) => s.status === "synced" && s.createdAt < cutoff)
    .toArray();
  await db.pendingSales.bulkDelete(stale.map((s) => s.localId));
}
