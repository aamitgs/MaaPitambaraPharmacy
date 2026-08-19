import { BATCH_TRIGGER_FIELDS, IMPORT_FIELDS, SCHEDULE_CLASSES } from "./fields";
import type { NormalizedRow } from "./normalize";

export interface ValidatedRow {
  rowIndex: number;
  raw: NormalizedRow;
  errors: string[];
  hasBatch: boolean;
}

export interface ValidationSummary {
  total: number;
  validCount: number;
  invalidCount: number;
  rows: ValidatedRow[];
}

function isValidDate(s: string) {
  return !Number.isNaN(new Date(s).getTime());
}

export function validateRows(rows: NormalizedRow[]): ValidationSummary {
  const validated = rows.map((raw): ValidatedRow => {
    const errors: string[] = [];

    if (!raw.name) errors.push("Item name is required");

    if (raw.taxRate !== undefined && Number.isNaN(Number(raw.taxRate))) {
      errors.push("Tax rate must be a number");
    }
    if (raw.reorderLevel !== undefined && !Number.isInteger(Number(raw.reorderLevel))) {
      errors.push("Reorder level must be a whole number");
    }
    if (raw.scheduleClass !== undefined) {
      const normalizedClass = raw.scheduleClass.toUpperCase();
      const match = SCHEDULE_CLASSES.find(
        (c) => c.toUpperCase() === normalizedClass || (c === "none" && normalizedClass === "NONE")
      );
      if (!match) {
        errors.push(`Schedule class must be one of ${SCHEDULE_CLASSES.join(", ")}`);
      }
    }

    const hasBatch = BATCH_TRIGGER_FIELDS.some((f) => raw[f] !== undefined);
    if (hasBatch) {
      for (const field of ["batchNo", "expiryDate", "mrp", "saleRate"] as const) {
        if (raw[field] === undefined) {
          const def = IMPORT_FIELDS.find((f) => f.key === field)!;
          errors.push(`${def.label} is required when adding a batch`);
        }
      }
      if (raw.expiryDate && !isValidDate(raw.expiryDate)) {
        errors.push("Expiry date is not a valid date");
      }
      if (raw.mfgDate && !isValidDate(raw.mfgDate)) {
        errors.push("Mfg date is not a valid date");
      }
      if (raw.mrp !== undefined && (Number.isNaN(Number(raw.mrp)) || Number(raw.mrp) <= 0)) {
        errors.push("MRP must be a positive number");
      }
      if (
        raw.saleRate !== undefined &&
        (Number.isNaN(Number(raw.saleRate)) || Number(raw.saleRate) <= 0)
      ) {
        errors.push("Sale rate must be a positive number");
      }
      if (raw.purchaseRate !== undefined && Number.isNaN(Number(raw.purchaseRate))) {
        errors.push("Purchase rate must be a number");
      }
      if (raw.currentQty !== undefined && !Number.isInteger(Number(raw.currentQty))) {
        errors.push("Current qty must be a whole number");
      }
    }

    return { rowIndex: raw._rowIndex, raw, errors, hasBatch };
  });

  const validCount = validated.filter((r) => r.errors.length === 0).length;
  return {
    total: validated.length,
    validCount,
    invalidCount: validated.length - validCount,
    rows: validated,
  };
}
