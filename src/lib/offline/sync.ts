import { completeSale } from "@/lib/actions/pos";
import { listPendingSales, updateSaleStatus, pruneSynced } from "./queue";
import { judgeStaleness } from "./staleness";

const CONFLICT_PATTERNS = [
  "no longer available",
  "left in stock",
  "changed — please review",
];

function isStockConflict(message: string): boolean {
  return CONFLICT_PATTERNS.some((p) => message.includes(p));
}

// Must match the sentinel thrown by resolvePharmacistSignoff in
// src/lib/actions/pos.ts. Whoever is signed in when a queued sale finally
// syncs may not be the pharmacist who rang it up, so this can't be
// resolved by a bare retry the way a stock conflict can.
export const SIGNOFF_REQUIRED_MESSAGE = "PHARMACIST_SIGNOFF_REQUIRED";

export interface SyncSummary {
  synced: number;
  conflicts: number;
  failed: number;
  stale: number;
  needsSignoff: number;
}

/**
 * Replays queued offline sales against completeSale, in the order they
 * were rung up. Each sale's authoritative stock check happens for real
 * here — a batch sold below available stock by another terminal in the
 * meantime surfaces as a "conflict" (distinct from a generic failure) so
 * staff can reconcile it manually rather than it silently overselling or
 * vanishing from the queue.
 */
export async function syncPendingSales(
  tenantId: string,
  options: { maxAgeHours: number; force?: string[] } = { maxAgeHours: 12 }
): Promise<SyncSummary> {
  const pending = (await listPendingSales(tenantId)).filter(
    (s) => s.status === "pending" || s.status === "failed" || s.status === "stale"
  );

  const summary: SyncSummary = { synced: 0, conflicts: 0, failed: 0, stale: 0, needsSignoff: 0 };
  const forced = new Set(options.force ?? []);

  for (const sale of pending) {
    // Age is checked before the sale is sent, not after: the point is to
    // stop it reaching the server unattended, not to explain afterwards.
    const verdict = judgeStaleness(sale.createdAt, options.maxAgeHours);
    if (verdict.stale && !forced.has(sale.localId)) {
      if (sale.status !== "stale") {
        await updateSaleStatus(sale.localId, "stale", { message: verdict.reason });
      }
      summary.stale += 1;
      continue;
    }

    await updateSaleStatus(sale.localId, "syncing");
    try {
      const result = await completeSale({ ...sale.payload, queuedAt: new Date(sale.createdAt) });
      await updateSaleStatus(sale.localId, "synced", { invoiceNo: result.invoiceNo });
      summary.synced += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed — unknown error";
      if (message === SIGNOFF_REQUIRED_MESSAGE) {
        await updateSaleStatus(sale.localId, "needs_signoff", {
          message: "Needs a pharmacist or owner to verify and sign off before this can post.",
        });
        summary.needsSignoff += 1;
      } else if (isStockConflict(message)) {
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
