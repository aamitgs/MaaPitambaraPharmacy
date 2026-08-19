import type { PlainItem, PlainBatch } from "@/lib/serialize";
import type { SchemeDef } from "@/lib/scheme-engine";

export type PosItem = PlainItem & { batches: PlainBatch[] };

export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  creditLimit: number | null;
  outstandingBalance: number;
  loyaltyTierName: string | null;
  loyaltyDiscountPercent: number;
}

export interface PosDoctor {
  id: string;
  name: string;
  registrationNo: string | null;
  phone: string | null;
  clinicName: string | null;
}

export type PosScheme = SchemeDef;
