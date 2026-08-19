// Target fields for the item-master CSV import. This is the contract the
// core pipeline (normalize -> validate -> preview -> commit) is built
// around. A platform-specific pre-parser (Marg/Vyapar/etc., out of scope
// for Phase 1) would only need to produce rows keyed by these same field
// names — it can bypass the manual column-mapping step entirely without
// the validate/preview/commit stages changing at all.

export type ImportFieldKey =
  | "name"
  | "genericName"
  | "manufacturer"
  | "composition"
  | "scheduleClass"
  | "hsnCode"
  | "taxRate"
  | "unit"
  | "packSize"
  | "reorderLevel"
  | "batchNo"
  | "mfgDate"
  | "expiryDate"
  | "mrp"
  | "purchaseRate"
  | "saleRate"
  | "currentQty"
  | "rackLocation";

export interface ImportFieldDef {
  key: ImportFieldKey;
  label: string;
  group: "item" | "batch";
  required: boolean;
  type: "string" | "number" | "int" | "date" | "scheduleClass";
}

export const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Item name", group: "item", required: true, type: "string" },
  { key: "genericName", label: "Generic name", group: "item", required: false, type: "string" },
  { key: "manufacturer", label: "Manufacturer", group: "item", required: false, type: "string" },
  { key: "composition", label: "Composition", group: "item", required: false, type: "string" },
  {
    key: "scheduleClass",
    label: "Schedule class",
    group: "item",
    required: false,
    type: "scheduleClass",
  },
  { key: "hsnCode", label: "HSN code", group: "item", required: false, type: "string" },
  { key: "taxRate", label: "Tax rate (%)", group: "item", required: false, type: "number" },
  { key: "unit", label: "Unit", group: "item", required: false, type: "string" },
  { key: "packSize", label: "Pack size", group: "item", required: false, type: "string" },
  { key: "reorderLevel", label: "Reorder level", group: "item", required: false, type: "int" },
  { key: "batchNo", label: "Batch no.", group: "batch", required: false, type: "string" },
  { key: "mfgDate", label: "Mfg date", group: "batch", required: false, type: "date" },
  { key: "expiryDate", label: "Expiry date", group: "batch", required: false, type: "date" },
  { key: "mrp", label: "MRP", group: "batch", required: false, type: "number" },
  { key: "purchaseRate", label: "Purchase rate", group: "batch", required: false, type: "number" },
  { key: "saleRate", label: "Sale rate", group: "batch", required: false, type: "number" },
  { key: "currentQty", label: "Current qty", group: "batch", required: false, type: "int" },
  { key: "rackLocation", label: "Rack location", group: "batch", required: false, type: "string" },
];

/** If any of these is present on a row, the whole group is required together. */
export const BATCH_TRIGGER_FIELDS: ImportFieldKey[] = ["batchNo", "expiryDate", "mrp", "saleRate"];

export const SCHEDULE_CLASSES = ["none", "H", "H1", "X", "G"] as const;
