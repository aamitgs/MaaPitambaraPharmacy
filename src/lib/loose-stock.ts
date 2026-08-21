/**
 * Selling part of a pack — four tablets out of a strip of ten.
 *
 * Stock is held as whole packs plus the remainder of at most one opened
 * pack. Two numbers rather than one running total of tablets, because a
 * pharmacy counts its shelf in strips and boxes: "47 strips and 3 loose"
 * is checkable against what is physically there, where "473 tablets" is
 * not.
 *
 * The invariant the rest of the app relies on:
 *
 *     sellable units = packs * unitsPerPack + looseUnits
 *     0 <= looseUnits < unitsPerPack
 *
 * `looseUnits` never reaches a full pack — as soon as it would, it becomes
 * a pack again. Otherwise the same stock could be represented two ways and
 * a count would never reconcile.
 */

export type LooseStock = {
  /** Unopened packs. */
  packs: number;
  /** Units left in the one opened pack. */
  looseUnits: number;
};

export type PackSpec = {
  unitsPerPack: number;
  allowLooseSale: boolean;
};

export function totalUnits(stock: LooseStock, unitsPerPack: number): number {
  return stock.packs * unitsPerPack + stock.looseUnits;
}

/** Puts a raw pair back into canonical form (loose below one full pack). */
export function normalize(stock: LooseStock, unitsPerPack: number): LooseStock {
  if (unitsPerPack <= 1) {
    return { packs: stock.packs + stock.looseUnits, looseUnits: 0 };
  }
  const total = totalUnits(stock, unitsPerPack);
  return {
    packs: Math.floor(total / unitsPerPack),
    looseUnits: total % unitsPerPack,
  };
}

export class LooseStockError extends Error {}

/**
 * Sells `qty` whole packs.
 *
 * Deliberately refuses to make a pack up out of loose units: three loose
 * tablets and a request for one strip is a "no", not a strip assembled
 * from an opened blister.
 */
export function sellPacks(stock: LooseStock, qty: number): LooseStock {
  if (qty <= 0) throw new LooseStockError("Quantity must be positive");
  if (qty > stock.packs) {
    throw new LooseStockError(
      `Only ${stock.packs} full pack${stock.packs === 1 ? "" : "s"} in stock`
    );
  }
  return { packs: stock.packs - qty, looseUnits: stock.looseUnits };
}

/**
 * Sells `units` loose units, opening packs as needed.
 *
 * Takes from the already-open pack first — that is the one physically on
 * the counter, and finishing it before breaking another is both what staff
 * do and what keeps `looseUnits` a single remainder.
 */
export function sellLooseUnits(
  stock: LooseStock,
  units: number,
  spec: PackSpec
): LooseStock {
  if (!spec.allowLooseSale) {
    throw new LooseStockError("This item is not sold loose");
  }
  if (spec.unitsPerPack <= 1) {
    throw new LooseStockError("This item has no pack size to break");
  }
  if (units <= 0) throw new LooseStockError("Quantity must be positive");

  const available = totalUnits(stock, spec.unitsPerPack);
  if (units > available) {
    throw new LooseStockError(`Only ${available} unit${available === 1 ? "" : "s"} in stock`);
  }

  return normalize(
    { packs: stock.packs, looseUnits: stock.looseUnits - units },
    spec.unitsPerPack
  );
}

/** Returned stock going back on the shelf. */
export function returnUnits(
  stock: LooseStock,
  units: number,
  unitsPerPack: number
): LooseStock {
  if (units <= 0) throw new LooseStockError("Quantity must be positive");
  return normalize({ packs: stock.packs, looseUnits: stock.looseUnits + units }, unitsPerPack);
}

/**
 * Price of one loose unit.
 *
 * Rounded to paise at the unit, not at the line: a strip of 10 at ₹31.36
 * gives ₹3.14 a tablet, so ten loose tablets come to ₹31.40 rather than
 * ₹31.36. That four-paise difference is real and in the customer's
 * disfavour, which is why it is computed here once and shown on the bill
 * rather than emerging from a division somewhere in the totals.
 */
export function looseUnitRate(packRate: number, unitsPerPack: number): number {
  if (unitsPerPack <= 1) return packRate;
  return Math.ceil((packRate / unitsPerPack) * 100) / 100;
}

/** "12 strips + 4" — how staff read stock back off a screen. */
export function formatLooseStock(
  stock: LooseStock,
  unitsPerPack: number,
  unitLabel = "unit"
): string {
  if (unitsPerPack <= 1) return `${stock.packs}`;
  if (stock.looseUnits === 0) return `${stock.packs}`;
  return `${stock.packs} + ${stock.looseUnits} ${unitLabel}${stock.looseUnits === 1 ? "" : "s"}`;
}
