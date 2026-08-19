// Pure scheme-matching logic, shared by the POS client (live "why" badges
// as the cart changes) and completeSale (authoritative server recompute —
// the client's applied schemes are never trusted as-is).

export interface SchemeConfig {
  percent?: number;
  buyQty?: number;
  getQty?: number;
  applicableItemIds?: string[];
}

export interface SchemeDef {
  id: string;
  name: string;
  type: "percent_off" | "buy_x_get_y";
  config: SchemeConfig;
}

export interface SchemeCartLine {
  lineId: string;
  itemId: string;
  qty: number;
  rate: number;
}

export interface SchemeApplication {
  lineId: string;
  schemeId: string;
  schemeName: string;
  discountAmount: number;
  reason: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Matches active schemes against cart lines. At most one scheme applies per
 * line — whichever gives the larger discount — rather than stacking
 * multiple schemes on the same line, to keep "why" attribution unambiguous.
 * Evaluated per cart line (item+batch), not per item: a customer whose
 * purchase of one item is split across two batch lines will not get
 * buy_x_get_y credit combined across those lines. Documented limitation of
 * the current per-batch cart model, not a bug.
 */
export function applySchemes(schemes: SchemeDef[], lines: SchemeCartLine[]): SchemeApplication[] {
  const applications: SchemeApplication[] = [];

  for (const line of lines) {
    let best: SchemeApplication | null = null;

    for (const scheme of schemes) {
      const applicableItemIds = scheme.config.applicableItemIds;
      if (applicableItemIds && applicableItemIds.length > 0 && !applicableItemIds.includes(line.itemId)) {
        continue;
      }

      let discountAmount = 0;
      let reason = "";

      if (scheme.type === "percent_off") {
        const percent = scheme.config.percent ?? 0;
        if (percent <= 0) continue;
        discountAmount = round2((line.qty * line.rate * percent) / 100);
        reason = `${scheme.name} — ${percent}% off applied`;
      } else {
        const buyQty = scheme.config.buyQty ?? 0;
        const getQty = scheme.config.getQty ?? 0;
        const groupSize = buyQty + getQty;
        if (groupSize <= 0 || getQty <= 0) continue;
        const freeUnits = Math.floor(line.qty / groupSize) * getQty;
        if (freeUnits <= 0) continue;
        discountAmount = round2(freeUnits * line.rate);
        reason = `${scheme.name} — Buy ${buyQty} Get ${getQty} Free applied (${freeUnits} free unit${
          freeUnits === 1 ? "" : "s"
        })`;
      }

      if (discountAmount > 0 && (!best || discountAmount > best.discountAmount)) {
        best = { lineId: line.lineId, schemeId: scheme.id, schemeName: scheme.name, discountAmount, reason };
      }
    }

    if (best) applications.push(best);
  }

  return applications;
}
