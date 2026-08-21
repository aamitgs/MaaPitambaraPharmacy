import { BATCH_TRIGGER_FIELDS, IMPORT_FIELDS, SCHEDULE_CLASSES } from "./fields";
import type { NormalizedRow } from "./normalize";
import { compositionKey } from "@/lib/composition";

export interface ValidatedRow {
  rowIndex: number;
  raw: NormalizedRow;
  errors: string[];
  /**
   * Things worth knowing that do not stop the row importing.
   *
   * The distinction matters on a five-thousand-row supplier file: refusing
   * the whole import because a composition is written loosely would be
   * absurd, but importing it silently means nobody discovers until months
   * later that substitution does not work for most of the catalogue.
   */
  warnings: string[];
  hasBatch: boolean;
}

export interface ValidationSummary {
  total: number;
  validCount: number;
  invalidCount: number;
  /// Rows that import fine but carry a warning.
  warningCount: number;
  rows: ValidatedRow[];
}

function isValidDate(s: string) {
  return !Number.isNaN(new Date(s).getTime());
}

/**
 * Spreadsheets carry booleans as whatever the person typed. Anything
 * unrecognised returns null so it is reported rather than quietly read as
 * false — "Y" meaning "no loose sales" would be a silent data error.
 */
export function parseBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
}

export function validateRows(rows: NormalizedRow[]): ValidationSummary {
  const validated = rows.map((raw): ValidatedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!raw.name) errors.push("Item name is required");

    // Checked without the pharmacy's salt aliases on purpose: aliases only
    // change how an ingredient is *named*, never whether a strength was
    // written down, and it is the missing strength that makes a
    // composition unusable. So the answer here is the same either way, and
    // this stays a pure function the preview can run client-side.
    if (raw.unitsPerPack !== undefined) {
      const n = Number(raw.unitsPerPack);
      if (!Number.isInteger(n) || n < 1) errors.push("Units per pack must be a whole number of 1 or more");
    }

    if (raw.looseUnits !== undefined) {
      const loose = Number(raw.looseUnits);
      if (!Number.isInteger(loose) || loose < 0) {
        errors.push("Loose units must be a whole number");
      } else if (raw.unitsPerPack !== undefined) {
        const per = Number(raw.unitsPerPack);
        // The app's invariant: loose stock is what is left of one opened
        // pack, so it can never reach a full pack — at that point it *is*
        // a pack. Importing 12 loose against a strip of 10 would make the
        // same stock representable two ways and the totals stop agreeing.
        if (Number.isInteger(per) && per >= 1 && loose >= per) {
          errors.push(`Loose units (${loose}) must be fewer than the ${per} in a pack`);
        }
      }
    }

    if (raw.allowLooseSale !== undefined && parseBoolean(raw.allowLooseSale) === null) {
      errors.push('Allow loose sale must be yes/no, true/false or 1/0');
    }

    if (raw.composition?.trim() && !compositionKey(raw.composition)) {
      warnings.push(
        "Composition has no strengths, so this item will not be offered as a substitute — " +
          'write it as "Paracetamol 500mg"'
      );
    }

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

    return { rowIndex: raw._rowIndex, raw, errors, warnings, hasBatch };
  });

  const validCount = validated.filter((r) => r.errors.length === 0).length;
  return {
    total: validated.length,
    validCount,
    invalidCount: validated.length - validCount,
    warningCount: validated.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length,
    rows: validated,
  };
}
