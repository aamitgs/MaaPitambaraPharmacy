import Dexie, { type EntityTable } from "dexie";
import type { PosItem, PosCustomer, PosDoctor, PosScheme } from "@/components/pos/types";
import type { CompleteSaleInput } from "@/lib/actions/pos";

export interface ReceiptHeader {
  tenant: {
    pharmacyName: string;
    invoiceHeaderText: string;
    invoiceFooterText: string;
    invoiceTermsText: string;
    // Cached with the rest of the header so an offline bill still prints
    // the pharmacy's own logo. The URL points at the public /api/brand
    // route, which a service worker can cache like any other asset.
    logoHorizontal: string;
    logoIcon: string;
    showLogo: boolean;
    paperDefault: string;
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

export type PendingSaleStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "conflict"
  | "failed"
  /// Queued too long ago to post by itself. Never discarded — the sale
  /// really happened — but it waits for someone to look at it.
  | "stale"
  /// This sale needs a pharmacist/owner to sign off (a Schedule H/H1/X
  /// item) but whoever is signed in now, when it's finally syncing, isn't
  /// one — e.g. a shift change happened while it sat in the queue. Kept
  /// distinct from "failed" so it gets its own recovery action instead of
  /// a bare discard, since discarding it drops the narcotics register
  /// entry for medicine that has already left the shelf.
  | "needs_signoff";

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
