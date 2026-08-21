import { describe, it, expect } from "vitest";
import {
  totalUnits,
  normalize,
  sellPacks,
  sellLooseUnits,
  returnUnits,
  looseUnitRate,
  formatLooseStock,
  LooseStockError,
} from "./loose-stock";

const strip = { unitsPerPack: 10, allowLooseSale: true };

describe("loose stock", () => {
  it("counts total units across packs and the opened one", () => {
    expect(totalUnits({ packs: 5, looseUnits: 3 }, 10)).toBe(53);
  });

  it("keeps loose below a full pack", () => {
    // 2 packs and 14 loose is the same stock as 3 packs and 4 loose, and
    // only one of those can be allowed to exist.
    expect(normalize({ packs: 2, looseUnits: 14 }, 10)).toEqual({ packs: 3, looseUnits: 4 });
    expect(normalize({ packs: 0, looseUnits: 10 }, 10)).toEqual({ packs: 1, looseUnits: 0 });
  });

  it("opens a pack when the loose remainder runs out", () => {
    const after = sellLooseUnits({ packs: 5, looseUnits: 2 }, 4, strip);
    // Takes the 2 loose, breaks a strip for the other 2, leaving 8 loose.
    expect(after).toEqual({ packs: 4, looseUnits: 8 });
    expect(totalUnits(after, 10)).toBe(48);
  });

  it("finishes the open pack before breaking another", () => {
    expect(sellLooseUnits({ packs: 3, looseUnits: 6 }, 6, strip)).toEqual({
      packs: 3,
      looseUnits: 0,
    });
  });

  it("sells across several packs in one go", () => {
    const after = sellLooseUnits({ packs: 5, looseUnits: 0 }, 23, strip);
    expect(after).toEqual({ packs: 2, looseUnits: 7 });
    expect(totalUnits(after, 10)).toBe(27); // 50 - 23
  });

  it("never loses or invents a unit", () => {
    let stock = { packs: 9, looseUnits: 0 };
    let sold = 0;
    for (const n of [3, 7, 1, 12, 5, 9, 4]) {
      stock = sellLooseUnits(stock, n, strip);
      sold += n;
    }
    expect(totalUnits(stock, 10) + sold).toBe(90);
    expect(stock.looseUnits).toBeLessThan(10);
  });

  it("refuses to build a full pack out of loose units", () => {
    // Three loose tablets is not a strip, however much the total says so.
    expect(() => sellPacks({ packs: 0, looseUnits: 9 }, 1)).toThrow(LooseStockError);
  });

  it("refuses to break a pack for an item not sold loose", () => {
    expect(() =>
      sellLooseUnits({ packs: 5, looseUnits: 0 }, 2, { unitsPerPack: 10, allowLooseSale: false })
    ).toThrow(/not sold loose/);
  });

  it("refuses to oversell", () => {
    expect(() => sellLooseUnits({ packs: 1, looseUnits: 2 }, 13, strip)).toThrow(/Only 12/);
    expect(() => sellPacks({ packs: 2, looseUnits: 0 }, 3)).toThrow(/Only 2 full packs/);
  });

  it("puts a return back and reassembles whole packs", () => {
    expect(returnUnits({ packs: 4, looseUnits: 7 }, 3, 10)).toEqual({ packs: 5, looseUnits: 0 });
  });

  it("prices a loose unit in the pharmacy's favour, to the paisa", () => {
    // 31.36 / 10 = 3.136, which must not be charged as 3.13.
    expect(looseUnitRate(31.36, 10)).toBe(3.14);
    expect(looseUnitRate(100, 10)).toBe(10);
    // A pack of one is just the pack price.
    expect(looseUnitRate(45.5, 1)).toBe(45.5);
  });

  it("reads stock back the way staff count it", () => {
    expect(formatLooseStock({ packs: 12, looseUnits: 4 }, 10, "tablet")).toBe("12 + 4 tablets");
    expect(formatLooseStock({ packs: 12, looseUnits: 0 }, 10, "tablet")).toBe("12");
    expect(formatLooseStock({ packs: 12, looseUnits: 1 }, 10, "tablet")).toBe("12 + 1 tablet");
  });

  it("treats an unpacked item as plain units", () => {
    expect(normalize({ packs: 3, looseUnits: 2 }, 1)).toEqual({ packs: 5, looseUnits: 0 });
    expect(formatLooseStock({ packs: 7, looseUnits: 0 }, 1)).toBe("7");
  });
});
