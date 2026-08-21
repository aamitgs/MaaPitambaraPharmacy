import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook, type Sheet } from "./xlsx";

const read = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
};

describe("workbook export", () => {
  it("writes a real xlsx with one sheet per table", async () => {
    const sheets: Sheet<Record<string, unknown>>[] = [
      {
        name: "GSTR-1 B2CS",
        columns: [
          { header: "Place of supply", key: "pos", type: "text" },
          { header: "Rate", key: "rate", type: "percent" },
          { header: "Taxable value", key: "value", type: "money" },
        ],
        rows: [{ pos: "09-Uttar Pradesh", rate: 5, value: 1234.5 }],
      },
      { name: "GSTR-3B", columns: [{ header: "Row", key: "row", type: "text" }], rows: [] },
    ];
    const wb = await read(await buildWorkbook(sheets, { title: "t", pharmacy: "Test" }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["GSTR-1 B2CS", "GSTR-3B"]);
  });

  it("keeps an HSN code as text so the leading zero survives", async () => {
    // This is the whole reason for xlsx over CSV: Excel silently turns
    // "0304" into 304, and an HSN summary filed with 304 is wrong.
    const buf = await buildWorkbook(
      [
        {
          name: "HSN",
          columns: [{ header: "HSN", key: "hsn", type: "text" }],
          rows: [{ hsn: "0304" }, { hsn: "3004" }],
        },
      ],
      { title: "t", pharmacy: "Test" }
    );
    const ws = (await read(buf)).getWorksheet("HSN")!;
    expect(ws.getCell("A2").value).toBe("0304");
    expect(typeof ws.getCell("A2").value).toBe("string");
  });

  it("writes money as a number so it can be summed", async () => {
    const buf = await buildWorkbook(
      [
        {
          name: "Money",
          columns: [{ header: "Total", key: "total", type: "money" }],
          rows: [{ total: 1234.56 }],
        },
      ],
      { title: "t", pharmacy: "Test" }
    );
    const ws = (await read(buf)).getWorksheet("Money")!;
    expect(ws.getCell("A2").value).toBe(1234.56);
    expect(ws.getColumn(1).numFmt).toBe("#,##0.00");
  });

  it("puts the note above the header and still lines the columns up", async () => {
    const buf = await buildWorkbook(
      [
        {
          name: "Noted",
          note: "A caveat that has to travel with the file.",
          columns: [{ header: "A", key: "a", type: "text" }],
          rows: [{ a: "x" }],
        },
      ],
      { title: "t", pharmacy: "Test" }
    );
    const ws = (await read(buf)).getWorksheet("Noted")!;
    expect(String(ws.getCell("A1").value)).toContain("caveat");
    expect(ws.getCell("A3").value).toBe("A"); // header on row 3
    expect(ws.getCell("A4").value).toBe("x");
  });

  it("survives a sheet name Excel would reject", async () => {
    // Excel refuses / \ ? * [ ] and caps names at 31 characters, throwing
    // rather than truncating.
    const buf = await buildWorkbook(
      [
        {
          name: "GSTR-1 / 3B: everything [full] ?ever?",
          columns: [{ header: "A", key: "a", type: "text" }],
          rows: [],
        },
      ],
      { title: "t", pharmacy: "Test" }
    );
    const wb = await read(buf);
    const name = wb.worksheets[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[/\\?*[\]]/);
  });

  it("handles an empty table without producing a broken file", async () => {
    const buf = await buildWorkbook(
      [{ name: "Empty", columns: [{ header: "A", key: "a", type: "text" }], rows: [] }],
      { title: "t", pharmacy: "Test" }
    );
    const ws = (await read(buf)).getWorksheet("Empty")!;
    expect(ws.getCell("A1").value).toBe("A");
    expect(ws.rowCount).toBe(1);
  });

  it("writes nulls rather than the string 'undefined'", async () => {
    const buf = await buildWorkbook(
      [
        {
          name: "Gaps",
          columns: [{ header: "A", key: "a", type: "text" }],
          rows: [{ a: null }, {}],
        },
      ],
      { title: "t", pharmacy: "Test" }
    );
    const ws = (await read(buf)).getWorksheet("Gaps")!;
    expect(ws.getCell("A2").value).toBeNull();
    expect(ws.getCell("A3").value).toBeNull();
  });
});
