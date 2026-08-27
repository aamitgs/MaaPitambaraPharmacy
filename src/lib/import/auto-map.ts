import { IMPORT_FIELDS, type ImportFieldKey } from "./fields";
import type { ColumnMapping } from "./normalize";

/**
 * Working out which column is which, so nobody has to map twenty fields by
 * hand.
 *
 * Every pharmacy system names its columns differently — Marg writes
 * "Company" for the manufacturer, "P.Rate" for the purchase rate and
 * "Salt" for the composition; Tally and Vyapar each have their own words.
 * Matching only on our own field names meant a real export mapped almost
 * nothing and the whole file had to be wired up by hand.
 *
 * Aliases are matched on a normalised form (case, spaces and punctuation
 * removed), so "M.R.P.", "MRP" and "mrp" are one thing.
 */
const ALIASES: Partial<Record<ImportFieldKey, string[]>> = {
  name: ["itemname", "productname", "product", "description", "particulars", "medicine", "drugname"],
  genericName: ["generic", "genericname", "molecule"],
  // "company" stays here, not on supplierName: in every export we've seen
  // (Marg included), the Company column names who makes the medicine, not
  // who it's bought from.
  manufacturer: ["company", "companyname", "mfr", "mfg", "manufacturername", "brand"],
  supplierName: ["supplier", "suppliername", "distributor", "distributorname", "vendor", "stockist"],
  composition: ["salt", "salts", "saltname", "content", "contents", "formulation", "ingredients"],
  // Deliberately not "category": Marg's Category column holds things like
  // "-BLANK-", and mapping it here turns a clean file into an error on
  // every row. A wrong guess is worse than no guess — the field is one
  // dropdown away.
  scheduleClass: ["schedule", "drugschedule", "scheduletype", "scheduleclass", "rxtype"],
  hsnCode: ["hsn", "hsncode", "hsnno", "hsnsac"],
  taxRate: ["gstrate", "gst", "gstpercent", "taxpercent", "taxrate", "gsttax", "tax", "vat", "igst"],
  unit: ["uom", "unitofmeasure", "units", "packing", "packtype"],
  packSize: ["pack", "packsize", "packing", "strip", "conversion"],
  barcode: ["barcode", "ean", "upc", "barcodeno", "scancode"],
  unitsPerPack: ["unitsperpack", "perpack", "packqty", "conversionfactor", "strips", "tabsperstrip"],
  allowLooseSale: ["allowloose", "loosesale", "looseallowed", "sellloose"],
  reorderLevel: ["reorder", "reorderlevel", "minlevel", "minimumstock", "minstock", "reorderqty"],
  batchNo: ["batch", "batchno", "batchnumber", "lot", "lotno", "batchcode"],
  mfgDate: ["mfg", "mfgdate", "manufacturingdate", "mfd", "mfgdt"],
  expiryDate: ["expiry", "expirydate", "exp", "expdate", "expdt", "expiredate", "bestbefore"],
  mrp: ["mrp", "maximumretailprice", "retailprice", "mrpvalue"],
  purchaseRate: ["prate", "purchaserate", "purchaseprice", "costprice", "cost", "buyingprice"],
  saleRate: ["salerate", "salesprice", "saleprice", "sellingprice", "sellingrate", "srate", "mrpsale"],
  currentQty: ["stock", "qty", "quantity", "currentstock", "closingstock", "balance", "onhand", "stockqty"],
  looseUnits: ["loose", "looseunits", "looseqty", "openunits", "looseustock"],
  rackLocation: ["rack", "rackno", "racklocation", "shelf", "location", "binlocation"],
};

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Picks a source column for every field it can recognise.
 *
 * A column is never used twice: once "Rate" has been claimed as the
 * purchase rate it cannot also be the sale rate, because silently feeding
 * one column into two price fields is worse than leaving one unmapped.
 * Fields are matched in declaration order, so the more important ones
 * claim an ambiguous column first.
 */
export function autoMapColumns(
  headers: string[],
  options: {
    /**
     * Mappings for columns this module computed itself. They are not
     * guesses — a derived column exists for one purpose — so they are
     * applied first and their columns cannot be claimed by anything else.
     */
    seed?: ColumnMapping;
    /**
     * A sample of rows. Used only to break ties: an export often carries
     * a column with the perfect name and nothing in it (Marg's stock
     * report has an empty "Manufacturer" beside a populated "Company"),
     * and mapping to the empty one loses the data.
     */
    sample?: Record<string, string>[];
  } = {}
): ColumnMapping {
  const mapping: ColumnMapping = { ...(options.seed ?? {}) };
  const taken = new Set<string>(Object.values(mapping).filter(Boolean) as string[]);
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  const sample = options.sample ?? [];
  const hasData = (column: string) =>
    sample.length === 0 || sample.some((r) => (r[column] ?? "").trim() !== "");

  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key]) continue;
    const candidates = [
      normalizeHeader(field.key),
      normalizeHeader(field.label),
      ...(ALIASES[field.key] ?? []),
    ];

    // Candidates are tried in priority order rather than header order, so
    // the best name for a field wins wherever it happens to sit in the
    // file. Without this, a column that merely appears earlier — "IGST"
    // before a proper GST rate — claims the field first.
    let hit: { raw: string; norm: string } | undefined;
    let emptyFallback: { raw: string; norm: string } | undefined;
    for (const candidate of candidates) {
      const matches = normalized.filter((h) => !taken.has(h.raw) && h.norm === candidate);
      const withData = matches.find((h) => hasData(h.raw));
      if (withData) { hit = withData; break; }
      if (!emptyFallback && matches.length > 0) emptyFallback = matches[0];
    }
    // Only settle for a perfectly-named but empty column once no later
    // alias found one carrying values.
    if (!hit) {
      for (const candidate of candidates) {
        const byLength = [candidate];
        const found = normalized.find(
          (h) => !taken.has(h.raw) && byLength.some((c) => c.length >= 4 && h.norm.includes(c)) && hasData(h.raw)
        );
        if (found) { hit = found; break; }
      }
    }
    if (!hit) hit = emptyFallback;

    if (hit) {
      mapping[field.key] = hit.raw;
      taken.add(hit.raw);
    }
  }

  return mapping;
}

export type DerivedColumn = {
  header: string;
  /** Why it appeared, shown to the user so a computed column is never a surprise. */
  note: string;
};

/**
 * Builds columns a file implies but does not contain.
 *
 * Two cases come up on nearly every Indian export and both otherwise force
 * manual work the app can do itself:
 *
 *  - GST is split into SGST and CGST halves. The app stores one rate, and
 *    the whole rate is their sum.
 *  - Stock is written as packs.units — "83.2" is 83 strips plus 2 loose
 *    tablets. Imported as a plain number that becomes 83 packs and two
 *    lost tablets, or worse, 83.2 packs.
 */
export function deriveColumns(
  headers: string[],
  rows: Record<string, string>[]
): {
  headers: string[];
  rows: Record<string, string>[];
  derived: DerivedColumn[];
  /** What each computed column is for — never left to be guessed at. */
  seed: ColumnMapping;
} {
  const norm = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const derived: DerivedColumn[] = [];
  const seed: ColumnMapping = {};
  let outHeaders = [...headers];
  let outRows = rows;

  // --- GST halves -> one rate
  const sgst = norm.get("sgst");
  const cgst = norm.get("cgst");
  const hasWholeRate = ["gst", "gstrate", "taxrate", "gstpercent", "tax"].some((k) => norm.has(k));
  if (sgst && cgst && !hasWholeRate) {
    const header = "GST Rate";
    outRows = outRows.map((r) => ({
      ...r,
      [header]: String((Number(r[sgst]) || 0) + (Number(r[cgst]) || 0)),
    }));
    outHeaders = [...outHeaders, header];
    seed.taxRate = header;
    derived.push({
      header,
      note: 'Added as "GST Rate", summing the SGST and CGST columns — together they are the full rate.',
    });
  }

  // --- packs.units -> packs and loose units
  const stockCol = ["stock", "currentstock", "closingstock", "qty", "quantity"]
    .map((k) => norm.get(k))
    .find(Boolean);
  if (stockCol) {
    const anyFractional = rows.some((r) => /^\d+\.\d+$/.test((r[stockCol] ?? "").trim()));
    if (anyFractional) {
      const packsHeader = "Stock — packs";
      const looseHeader = "Stock — loose units";
      outRows = outRows.map((r) => {
        const raw = (r[stockCol] ?? "").trim();
        const m = raw.match(/^(\d+)(?:\.(\d+))?$/);
        // The decimal digits are the loose count as written: "80.11" is
        // eleven loose, not one. Read as text, never as arithmetic.
        return { ...r, [packsHeader]: m ? m[1] : raw, [looseHeader]: m?.[2] ? String(Number(m[2])) : "0" };
      });
      outHeaders = [...outHeaders, packsHeader, looseHeader];
      seed.currentQty = packsHeader;
      seed.looseUnits = looseHeader;
      derived.push({
        header: `${packsHeader} / ${looseHeader}`,
        note: `Split from "${stockCol}", where a value like 83.2 means 83 packs and 2 loose units.`,
      });
    }
  }

  return { headers: outHeaders, rows: outRows, derived, seed };
}
