"use server";

import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { matchItem, normalizeInvoiceDate } from "@/lib/vision/invoice-lines";
import {
  extractItemFromPhoto,
  extractPurchaseInvoiceFromPhoto,
  extractSupplierFromPhoto,
  VisionNotConfiguredError,
  type ExtractedItem,
  type ExtractedSupplier,
} from "@/lib/vision/extract";

/**
 * Results are returned rather than thrown so the form can show "not
 * configured" the same way the WhatsApp and GSP integrations do — an
 * unconfigured optional integration is not an application error.
 */
type Result<T> = { ok: true; fields: T } | { ok: false; message: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, fields: await fn() };
  } catch (e) {
    if (e instanceof VisionNotConfiguredError) {
      return { ok: false, message: "Photo reading isn't configured on this server." };
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not read that photo",
    };
  }
}

export async function readItemPhoto(imagePath: string): Promise<Result<ExtractedItem>> {
  await requireRole(["owner", "pharmacist"]);
  return run(() => extractItemFromPhoto(imagePath));
}

export async function readSupplierPhoto(imagePath: string): Promise<Result<ExtractedSupplier>> {
  await requireRole(["owner", "pharmacist"]);
  return run(() => extractSupplierFromPhoto(imagePath));
}

export type ScannedGrnLine = {
  description: string;
  /** Best match from the item master, or null for the user to pick. */
  matchedItemId: string | null;
  matchedItemName: string | null;
  /** 1 = every word matched. Below 0.5 no match is offered at all. */
  matchScore: number;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  mrp: string;
  rate: string;
  qty: string;
};

export type ScannedGrn = {
  supplierName: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  lines: ScannedGrnLine[];
};

/**
 * Reads a distributor invoice photo into draft GRN rows. Matching against
 * the item master happens here, server-side, against this tenant's items —
 * the model never sees the catalogue and never picks the item.
 */
export async function readPurchaseInvoicePhoto(
  imagePath: string
): Promise<Result<ScannedGrn>> {
  const session = await requireRole(["owner", "pharmacist"]);

  return run(async () => {
    const [invoice, items] = await Promise.all([
      extractPurchaseInvoiceFromPhoto(imagePath),
      prisma.item.findMany({
        where: { tenantId: session.user.tenantId },
        select: { id: true, name: true, genericName: true },
      }),
    ]);

    return {
      supplierName: invoice.supplierName,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      lines: invoice.lines.map((line) => {
        const match = matchItem(line.description, items);
        return {
          description: line.description,
          matchedItemId: match?.item.id ?? null,
          matchedItemName: match?.item.name ?? null,
          matchScore: match?.score ?? 0,
          batchNo: line.batchNo ?? "",
          mfgDate: normalizeInvoiceDate(line.mfgDate, "mfg") ?? "",
          expiryDate: normalizeInvoiceDate(line.expiryDate, "expiry") ?? "",
          mrp: line.mrp === null ? "" : String(line.mrp),
          rate: line.rate === null ? "" : String(line.rate),
          qty: line.qty === null ? "" : String(line.qty),
        };
      }),
    };
  });
}
