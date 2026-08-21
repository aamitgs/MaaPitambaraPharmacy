import { describe, it, expect } from "vitest";
import {
  rateOn,
  resolveTaxRate,
  isMixedRateHsn,
  mixedRateReason,
  lookupHsnSlab,
  type SlabLookup,
} from "./resolve";

const d = (iso: string) => new Date(iso);

// The real change: most finished medicines went 12% -> 5% on 22 Sep 2025.
const standard: SlabLookup = {
  id: "slab-standard",
  name: "Standard medicines",
  rates: [
    { effectiveFrom: d("2017-07-01"), rate: 12 },
    { effectiveFrom: d("2025-09-22"), rate: 5 },
  ],
};
const nil: SlabLookup = {
  id: "slab-nil",
  name: "Nil-rated",
  rates: [{ effectiveFrom: d("2017-07-01"), rate: 0 }],
};

const slabsById = new Map([
  [standard.id, standard],
  [nil.id, nil],
]);
const hsnToSlabId = new Map([
  ["3004", standard.id],
  ["3003", standard.id],
]);

const base = { slabsById, hsnToSlabId, legacyTaxRate: null, hsnCode: null, itemSlabId: null };

describe("rateOn", () => {
  it("picks the rate in force, not the newest", () => {
    expect(rateOn(standard.rates, d("2020-01-01"))!.rate).toBe(12);
    expect(rateOn(standard.rates, d("2026-01-01"))!.rate).toBe(5);
  });

  it("applies a change from its first day, not the day after", () => {
    expect(rateOn(standard.rates, d("2025-09-21"))!.rate).toBe(12);
    expect(rateOn(standard.rates, d("2025-09-22"))!.rate).toBe(5);
  });

  it("ignores a future-dated rate until its day arrives", () => {
    // An owner entering next quarter's change in advance must not have it
    // leak into today's billing.
    const withFuture: SlabLookup = {
      ...standard,
      rates: [...standard.rates, { effectiveFrom: d("2030-04-01"), rate: 18 }],
    };
    expect(rateOn(withFuture.rates, d("2026-08-20"))!.rate).toBe(5);
    expect(rateOn(withFuture.rates, d("2030-04-01"))!.rate).toBe(18);
  });

  it("returns nothing before the first rate ever started", () => {
    expect(rateOn(standard.rates, d("2016-01-01"))).toBeNull();
  });

  it("does not depend on the order rates arrive in", () => {
    const shuffled = [...standard.rates].reverse();
    expect(rateOn(shuffled, d("2026-01-01"))!.rate).toBe(5);
  });
});

describe("resolveTaxRate", () => {
  it("prefers an explicit slab on the item", () => {
    const r = resolveTaxRate({
      ...base,
      itemSlabId: nil.id,
      hsnCode: "3004", // would say 5% — the item override wins
      asOf: d("2026-08-20"),
    });
    expect(r.rate).toBe(0);
    expect(r.source).toBe("item-slab");
    expect(r.slabName).toBe("Nil-rated");
  });

  it("falls back to the slab mapped to the HSN code", () => {
    const r = resolveTaxRate({ ...base, hsnCode: "3004", asOf: d("2026-08-20") });
    expect(r.rate).toBe(5);
    expect(r.source).toBe("hsn-slab");
  });

  it("gives the historical rate for a historical date", () => {
    // The same item, billed in 2024, must resolve to 12% — this is what
    // lets a report explain an old invoice instead of contradicting it.
    const r = resolveTaxRate({ ...base, hsnCode: "3004", asOf: d("2024-06-01") });
    expect(r.rate).toBe(12);
    expect(r.effectiveFrom).toEqual(d("2017-07-01"));
  });

  it("tolerates whitespace around an HSN code", () => {
    expect(resolveTaxRate({ ...base, hsnCode: " 3004 ", asOf: d("2026-08-20") }).rate).toBe(5);
  });

  it("falls back to the item's own legacy rate", () => {
    const r = resolveTaxRate({ ...base, legacyTaxRate: 12, asOf: d("2026-08-20") });
    expect(r.rate).toBe(12);
    expect(r.source).toBe("legacy-item-rate");
  });

  it("reports rather than guesses when nothing is configured", () => {
    const r = resolveTaxRate({ ...base, asOf: d("2026-08-20") });
    expect(r.source).toBe("none");
    expect(r.slabId).toBeNull();
  });

  it("falls through when a slab exists but had no rate that early", () => {
    const r = resolveTaxRate({
      ...base,
      itemSlabId: standard.id,
      legacyTaxRate: 12,
      asOf: d("2016-01-01"),
    });
    expect(r.source).toBe("legacy-item-rate");
  });

  it("falls through when the referenced slab has been deleted", () => {
    const r = resolveTaxRate({
      ...base,
      itemSlabId: "slab-that-is-gone",
      hsnCode: "3004",
      asOf: d("2026-08-20"),
    });
    expect(r.source).toBe("hsn-slab");
  });
});

describe("mixed-rate HSN chapters", () => {
  it("catches a chapter that carries more than one rate", () => {
    expect(isMixedRateHsn("3006")).toBe(true);
    expect(isMixedRateHsn("9018")).toBe(true);
    // 3004 is uniformly medicaments — a blanket mapping is safe there.
    expect(isMixedRateHsn("3004")).toBe(false);
  });

  it("matches on the heading, so a full 8-digit code is still caught", () => {
    expect(isMixedRateHsn("30066010")).toBe(true);
    expect(mixedRateReason("30066010")).toMatch(/[Cc]ontraceptives/);
  });

  it("copes with whitespace and nothing at all", () => {
    expect(isMixedRateHsn(" 3006 ")).toBe(true);
    expect(isMixedRateHsn(null)).toBe(false);
    expect(isMixedRateHsn("")).toBe(false);
    expect(mixedRateReason(null)).toBeNull();
  });
});

describe("hierarchical HSN lookup", () => {
  const map = new Map([
    ["3004", "slab-standard"],
    ["3006", "slab-standard"],
    ["30066010", "slab-nil"], // contraceptives, the exception inside 3006
  ]);

  it("matches an exact code", () => {
    expect(lookupHsnSlab("3004", map)).toBe("slab-standard");
  });

  it("falls back to the heading for a longer tariff item", () => {
    // Suppliers print 4, 6 or 8 digits; a mapping on the heading has to
    // cover all of them or the master becomes unmaintainable.
    expect(lookupHsnSlab("30049099", map)).toBe("slab-standard");
    expect(lookupHsnSlab("300490", map)).toBe("slab-standard");
  });

  it("prefers the most specific mapping", () => {
    // 30066010 is mapped to nil in its own right and must beat the
    // blanket 3006 default — this is how a chapter's exceptions work.
    expect(lookupHsnSlab("30066010", map)).toBe("slab-nil");
    expect(lookupHsnSlab("30061010", map)).toBe("slab-standard");
  });

  it("returns nothing for an unmapped chapter", () => {
    expect(lookupHsnSlab("8471", map)).toBeNull();
    expect(lookupHsnSlab("", map)).toBeNull();
  });

  it("resolves a full tariff item through the heading mapping", () => {
    const standard: SlabLookup = {
      id: "slab-standard",
      name: "Standard medicines",
      rates: [{ effectiveFrom: new Date("2025-09-22"), rate: 5 }],
    };
    const r = resolveTaxRate({
      itemSlabId: null,
      hsnCode: "30049099",
      legacyTaxRate: 12,
      slabsById: new Map([[standard.id, standard]]),
      hsnToSlabId: new Map([["3004", standard.id]]),
      asOf: new Date("2026-08-20"),
    });
    expect(r.rate).toBe(5);
    expect(r.source).toBe("hsn-slab");
  });
});
