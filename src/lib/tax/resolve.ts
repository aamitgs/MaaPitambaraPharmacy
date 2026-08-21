/**
 * Which GST rate applies, and why.
 *
 * Two ideas kept deliberately apart:
 *
 *   A **slab** is a named bucket an item belongs to — "Nil-rated",
 *   "Standard medicines", "Industrial formulations". Membership is a
 *   property of the product and rarely changes.
 *
 *   A **rate** is what that bucket costs on a given date. When GST 2.0
 *   moved most finished medicines from 12% to 5% in September 2025, every
 *   item stayed exactly where it was and the bucket's rate changed.
 *
 * Conflating the two is what forces a mass re-tagging of the item master
 * on every policy change, and what makes it impossible to answer "why did
 * this invoice charge 12%?" a year later.
 *
 * Historical invoices are safe regardless — SalesInvoiceItem stores the
 * rate it charged. This resolution decides what to charge *today*, and
 * lets a report explain what was charged *then*.
 */

export type SlabRate = {
  /** Inclusive. The rate applies from this instant until the next one. */
  effectiveFrom: Date;
  rate: number;
};

export type ResolvedRate = {
  rate: number;
  /** How the rate was arrived at — shown in the pre-filing check. */
  source: "item-slab" | "hsn-slab" | "legacy-item-rate" | "none";
  slabId: string | null;
  slabName: string | null;
  /** When the applied rate came into force; null for a legacy item rate. */
  effectiveFrom: Date | null;
};

/**
 * The rate in force on `asOf` — the latest one that had already started.
 *
 * A future-dated rate is invisible until its day arrives, which is what
 * lets an owner enter a budget change in advance without it leaking into
 * today's billing.
 */
export function rateOn(rates: SlabRate[], asOf: Date): SlabRate | null {
  let best: SlabRate | null = null;
  for (const r of rates) {
    if (r.effectiveFrom > asOf) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best;
}

export type SlabLookup = {
  id: string;
  name: string;
  rates: SlabRate[];
};

/**
 * Finds the slab for an HSN code, most specific first.
 *
 * HSN is hierarchical: 3004 is a heading, 300490 a subheading, 30049099 a
 * tariff item, and each is a narrowing of the one before. Items in a
 * pharmacy carry whichever length the supplier printed, so an exact-match
 * lookup would force a mapping for every 8-digit code in existence.
 *
 * Longest match wins, so a specific 30066010 mapping beats a blanket 3006
 * one — which is how a chapter's exceptions get handled without abandoning
 * the default for everything else in it.
 */
export function lookupHsnSlab(
  hsnCode: string,
  hsnToSlabId: Map<string, string>
): string | null {
  const code = hsnCode.trim();
  if (!code) return null;
  for (let len = code.length; len >= 2; len--) {
    const slabId = hsnToSlabId.get(code.slice(0, len));
    if (slabId) return slabId;
  }
  return null;
}

export type ResolveInput = {
  /** Explicit slab on the item — the most specific answer. */
  itemSlabId: string | null;
  hsnCode: string | null;
  /** The item's own rate, from before slabs existed. */
  legacyTaxRate: number | null;
  slabsById: Map<string, SlabLookup>;
  /** HSN code -> slab id. */
  hsnToSlabId: Map<string, string>;
  asOf: Date;
};

/**
 * Most specific wins: an explicit slab on the item, then the slab mapped
 * to its HSN code, then whatever rate the item carried before any of this
 * existed.
 *
 * HSN is the middle tier rather than a separate "category" concept because
 * in Indian GST the HSN *is* the classification — rates are legally
 * defined against it. Inventing a parallel category would mean maintaining
 * two taxonomies that must agree.
 */
export function resolveTaxRate(input: ResolveInput): ResolvedRate {
  const fromSlab = (slabId: string, source: "item-slab" | "hsn-slab"): ResolvedRate | null => {
    const slab = input.slabsById.get(slabId);
    if (!slab) return null;
    const applicable = rateOn(slab.rates, input.asOf);
    if (!applicable) return null;
    return {
      rate: applicable.rate,
      source,
      slabId: slab.id,
      slabName: slab.name,
      effectiveFrom: applicable.effectiveFrom,
    };
  };

  if (input.itemSlabId) {
    const resolved = fromSlab(input.itemSlabId, "item-slab");
    if (resolved) return resolved;
  }

  if (input.hsnCode) {
    const mapped = lookupHsnSlab(input.hsnCode, input.hsnToSlabId);
    if (mapped) {
      const resolved = fromSlab(mapped, "hsn-slab");
      if (resolved) return resolved;
    }
  }

  if (input.legacyTaxRate !== null) {
    return {
      rate: input.legacyTaxRate,
      source: "legacy-item-rate",
      slabId: null,
      slabName: null,
      effectiveFrom: null,
    };
  }

  // Zero is not a safe default for tax, so this is reported rather than
  // silently applied — the pre-filing check surfaces every item that lands
  // here.
  return { rate: 0, source: "none", slabId: null, slabName: null, effectiveFrom: null };
}

/**
 * HSN chapters that carry more than one GST rate inside them.
 *
 * Mapping one of these to a slab is a *default*, not a classification —
 * it is right for the bulk of the chapter and wrong for specific lines
 * within it. Those exceptions have to be set per item, and the only way
 * anyone remembers to is if the system says which items are affected.
 *
 * Not exhaustive, and not a substitute for the notification: it flags the
 * chapters where a blanket rate is known to be unsafe.
 */
export const MIXED_RATE_HSN: Record<string, string> = {
  "3006": "Contraceptives are nil-rated while most other pharmaceutical goods in this chapter are not.",
  "9018": "Medical devices split across rates — many moved to 5%, others remain higher.",
  "2106": "Food preparations range from nil to 18% depending on the product.",
  "9004": "Spectacles and lenses are rated differently from corrective aids.",
};

export function isMixedRateHsn(hsnCode: string | null | undefined): boolean {
  if (!hsnCode) return false;
  const trimmed = hsnCode.trim();
  // Match on the 4-digit heading, so 30061010 is caught by the 3006 entry.
  return Object.keys(MIXED_RATE_HSN).some((h) => trimmed.startsWith(h));
}

export function mixedRateReason(hsnCode: string | null | undefined): string | null {
  if (!hsnCode) return null;
  const trimmed = hsnCode.trim();
  const key = Object.keys(MIXED_RATE_HSN).find((h) => trimmed.startsWith(h));
  return key ? MIXED_RATE_HSN[key] : null;
}
