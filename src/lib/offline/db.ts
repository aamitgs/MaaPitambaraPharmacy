import Dexie, { type EntityTable } from "dexie";
import type { PosItem, PosCustomer, PosDoctor, PosScheme } from "@/components/pos/types";
import type { CompleteSaleInput } from "@/lib/actions/pos";

export interface ReceiptHeader {
  tenant: {
    pharmacyName: string;
    invoiceFooterText: string | null;
    invoiceTermsText: string | null;
  };
  branch: {
    name: string;
    licensedAddress: string;
    phone: string | null;
    landline: string | null;
    gstin: string | null;
    drugLicenseRetailNo: string | null;
    drugLicenseWholesaleNo: string | null;
    fssaiNo: string | null;
    pharmacistName: string | null;
    pharmacistRegistrationNo: string | null;
  } | null;
}

/** A single cached snapshot of everything the POS screen needs to keep working offline. */
export interface PosCacheRecord {
  id: "current";
  tenantId: string;
  branchId: string | null;
  items: PosItem[];
  customers: PosCustomer[];
  doctors: PosDoctor[];
  schemes: PosScheme[];
  staffDiscountCapPercent: number;
  receiptHeader: ReceiptHeader;
  updatedAt: number;
}

export type PendingSaleStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";

export interface PendingSale {
  localId: string;
  tenantId: string;
  createdAt: number;
  payload: CompleteSaleInput;
  // A denormalized snapshot for display in the pending-sync panel without
  // re-deriving totals from `payload` — cart lines already carry item
  // names client-side at the moment the sale is queued.
  summary: { itemCount: number; total: number; paymentMode: string };
  status: PendingSaleStatus;
  message?: string;
  invoiceNo?: string;
}

const db = new Dexie("pharmacy-offline") as Dexie & {
  posCache: EntityTable<PosCacheRecord, "id">;
  pendingSales: EntityTable<PendingSale, "localId">;
};

db.version(1).stores({
  posCache: "id",
  pendingSales: "localId, tenantId, status, createdAt",
});

export { db };
