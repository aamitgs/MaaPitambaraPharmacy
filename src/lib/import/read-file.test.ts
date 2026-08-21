import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { readTabularFile } from "./read-file";

/** Builds a real .xlsx in memory and wraps it as a File, as a browser would. */
async function excelFile(rows: unknown[][], name = "test.xlsx"): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf as ArrayBuffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const csvFile = (text: string) =>
  new File([text], "test.csv", { type: "text/csv" });

describe("readTabularFile", () => {
  it("reads a plain Excel sheet", async () => {
    const file = await excelFile([
      ["Name", "GSTIN", "Payment terms (days)"],
      ["Agra Pharma", "09AAACP1234C1ZV", 30],
    ]);
    const { headers, rows } = await readTabularFile(file);
    expect(headers).toEqual(["Name", "GSTIN", "Payment terms (days)"]);
    expect(rows).toEqual([
      { Name: "Agra Pharma", GSTIN: "09AAACP1234C1ZV", "Payment terms (days)": "30" },
    ]);
  });

  it("finds the header past a title row and a blank line", async () => {
    // Exactly what a distributor's price list looks like. Taking row 1
    // blindly maps every column to nothing and the import looks broken.
    const file = await excelFile([
      ["SUPPLIER MASTER — AUGUST 2026"],
      [],
      ["Name", "GSTIN"],
      ["Yamuna Medical", "09AABCY5678D1ZP"],
    ]);
    const { headers, rows } = await readTabularFile(file);
    expect(headers).toEqual(["Name", "GSTIN"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe("Yamuna Medical");
  });

  it("gives dates as ISO text the validator can parse", async () => {
    const file = await excelFile([
      ["Item", "Expiry"],
      ["Paracetamol", new Date(2027, 5, 30)],
    ]);
    const { rows } = await readTabularFile(file);
    expect(rows[0].Expiry).toBe("2027-06-30");
  });

  it("skips entirely blank rows", async () => {
    const file = await excelFile([["Name"], ["A"], [], ["B"], [null]]);
    const { rows } = await readTabularFile(file);
    expect(rows.map((r) => r.Name)).toEqual(["A", "B"]);
  });

  it("drops trailing empty columns rather than offering phantom headers", async () => {
    const file = await excelFile([
      ["Name", "GSTIN", "", ""],
      ["A", "09AAACP1234C1ZV", "", ""],
    ]);
    const { headers } = await readTabularFile(file);
    expect(headers).toEqual(["Name", "GSTIN"]);
  });

  it("reads CSV through the same entry point", async () => {
    const { headers, rows } = await readTabularFile(
      csvFile("Name,GSTIN\nAgra Pharma,09AAACP1234C1ZV\n")
    );
    expect(headers).toEqual(["Name", "GSTIN"]);
    expect(rows[0].GSTIN).toBe("09AAACP1234C1ZV");
  });

  it("says so when a workbook has no usable header", async () => {
    const file = await excelFile([[], []]);
    await expect(readTabularFile(file)).rejects.toThrow(/header/i);
  });
});
