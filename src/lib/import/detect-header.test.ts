import { describe, it, expect } from "vitest";
import { detectHeader, rowsFromMatrix } from "./detect-header";

const BANNER = "MAA PITAMBARA PHARMACY 16,H.I.G.SHAHEED NAGAR (BEHIND POLICE CHOWKI),AGRA";

/** The shape of a real Marg stock report, down to the merged banners. */
const MARG_STOCK: string[][] = [
  Array(16).fill(BANNER),
  Array(16).fill("STOCK REPORT AS ON DATE 19/08/2026"),
  ["Code","Product Name","Unit","Current Stock","Sales Scheme","Sales Scheme","Purc.Scheme","Purc.Scheme","Cost Price","Value","M.R.P.","Purchase Price","Sales Price","Company","Manufacturer","Rack No."],
  ["Code","Product Name","Unit","Current Stock","Deal","Free","Deal","Free","Cost Price","Value","M.R.P.","Purchase Price","Sales Price","Company","Manufacturer","Rack No."],
  ["A00972","9L PLUS CAP 10","CAP","0","0","0","10","1","189.087","0","243.75","185.71","243.75","SINAG HEATHCARE","",""],
  ["A00677","ABIWAYS-200SR 10","Tab","83.2","0","0","0","0","131.8","0","178.13","117.68","190","TASMED","",""],
];

describe("finding the header in an exported report", () => {
  const d = detectHeader(MARG_STOCK);

  it("skips banner rows, which merge one value across every column", () => {
    // The bug this fixes: every column was named after the pharmacy.
    expect(d.headerIndex).toBe(2);
    expect(d.headers[0]).toBe("Code");
    expect(d.headers).not.toContain(BANNER);
  });

  it("skips a sub-header row so it is not read as data", () => {
    expect(d.dataStartIndex).toBe(4);
    const rows = rowsFromMatrix(MARG_STOCK, d);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Product Name"]).toBe("9L PLUS CAP 10");
    expect(rows.some((r) => r["Product Name"] === "Product Name")).toBe(false);
  });

  it("makes repeated column names unique, or later ones overwrite earlier", () => {
    expect(d.headers.filter((h) => h.startsWith("Sales Scheme"))).toEqual([
      "Sales Scheme",
      "Sales Scheme (2)",
    ]);
    expect(new Set(d.headers).size).toBe(d.headers.length);
  });
});

describe("ordinary files", () => {
  it("takes row one when row one is the header", () => {
    const m = [["Name","Qty"],["Dolo","5"]];
    const d = detectHeader(m);
    expect(d.headerIndex).toBe(0);
    expect(d.dataStartIndex).toBe(1);
    expect(rowsFromMatrix(m, d)).toEqual([{ Name: "Dolo", Qty: "5" }]);
  });

  it("does not mistake a data row for a repeated header", () => {
    // Two products whose names happen to sit under matching columns must
    // still be data — only a row echoing the header is skipped.
    const m = [["Name","Qty"],["Dolo","5"],["Crocin","9"]];
    expect(rowsFromMatrix(m, detectHeader(m))).toHaveLength(2);
  });

  it("drops trailing empty columns rather than offering phantom fields", () => {
    expect(detectHeader([["Name","Qty","",""],["Dolo","5","",""]]).headers).toEqual(["Name","Qty"]);
  });

  it("falls back to the first row rather than throwing when nothing looks like a header", () => {
    const d = detectHeader([["only-one-cell"],["x"]]);
    expect(d.headerIndex).toBe(0);
  });

  it("tolerates a title row that is not merged, just short", () => {
    const m = [["Stock report"],[],["Name","Qty"],["Dolo","5"]];
    const d = detectHeader(m);
    expect(d.headers).toEqual(["Name","Qty"]);
  });
});
