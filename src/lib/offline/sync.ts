import { completeSale } from "@/lib/actions/pos";
import { listPendingSales, updateSaleStatus, pruneSynced } from "./queue";

const CONFLICT_PATTERNS = [
  "no longer available",
  "left in stock",
  "changed — please review",
];

function isStockConflict(message: string): boolean {
  return CONFLICT_PATTERNS.some((p) => message.includes(p));
}

export interface SyncSummary {
  synced: number;
  conflicts: number;
  failed: number;
}

/**
 * Replays queued offline sales against completeSale, in the order they
 * were rung up. Each sale's authoritative stock check happens for real
 * here — a batch sold below available stock by another terminal in the
 * meantime surfaces as a "conflict" (distinct from a generic failure) so
 * staff can reconcile it manually rather than it silently overselling or
 * vanishing from the queue.
 */
export async function syncPendingSales(tenantId: string): Promise<SyncSummary> {
  const pending = (await listPendingSales(tenantId)).filter(
    (s) => s.status === "pending" || s.status === "failed"
  );

  const summary: SyncSummary = { synced: 0, conflicts: 0, failed: 0 };

  for (const sale of pending) {
    await updateSaleStatus(sale.localId, "syncing");
    try {
      const result = await completeSale(sale.payload);
      await updateSaleStatus(sale.localId, "synced", { invoiceNo: result.invoiceNo });
      summary.synced += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed — unknown error";
      if (isStockConflict(message)) {
        await updateSaleStatus(sale.localId, "conflict", { message });
        summary.conflicts += 1;
      } else {
        await updateSaleStatus(sale.localId, "failed", { message });
        summary.failed += 1;
      }
    }
  }

  await pruneSynced(tenantId);
  return summary;
}
