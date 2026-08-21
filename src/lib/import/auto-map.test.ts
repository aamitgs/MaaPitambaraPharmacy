import { describe, it, expect } from "vitest";
import { autoMapColumns, deriveColumns } from "./auto-map";

/** The exact header row of a Marg item export. */
const MARG_ITEMS = ["ItemID","Company","ItemCode","Name","HSNCode","LocalTax","SGST","CGST",
  "CentralTax","IGST","HsnName","OldTax","Rate","AddLess","P.Rate","M.R.P.","Stock","Tax Diff.",
  "Category","Salt"];

/** And a Marg batch-wise stock export. */
const MARG_STOCK = ["Code","Product Name","Unit","Batch No.","Expiry","Current Stock",
  "Cost Price","M.R.P.","Purchase Price","Sales Price","Company","Rack No."];

describe("auto-mapping a Marg item file", () => {
  const m = autoMapColumns(MARG_ITEMS);

  it("recognises the columns whose names share nothing with ours", () => {
    expect(m.name).toBe("Name");
    expect(m.manufacturer).toBe("Company");     // "Company" means manufacturer
    expect(m.composition).toBe("Salt");         // "Salt" means composition
    expect(m.hsnCode).toBe("HSNCode");
    expect(m.mrp).toBe("M.R.P.");
    expect(m.purchaseRate).toBe("P.Rate");
  });

  it("does not feed one column into two fields", () => {
    // "Rate" and "P.Rate" both look like a price. Whichever is claimed
    // first, the other field must not silently reuse it.
    const used = Object.values(m);
    expect(new Set(used).size).toBe(used.length);
  });

  it("leaves fields alone when the file genuinely has no such column", () => {
    // Nothing in a Marg item file says whether loose sale is allowed.
    expect(m.allowLooseSale).toBeUndefined();
    expect(m.batchNo).toBeUndefined();
  });

  it("does not mistake Marg's Category column for a drug schedule", () => {
    // It holds "-BLANK-". Mapped to scheduleClass it fails every row,
    // turning a clean import into 2,129 errors.
    expect(m.scheduleClass).toBeUndefined();
  });
});

describe("auto-mapping a batch-wise stock file", () => {
  const m = autoMapColumns(MARG_STOCK);
  it("finds the batch and expiry, which is what makes stock importable", () => {
    expect(m.name).toBe("Product Name");
    expect(m.batchNo).toBe("Batch No.");
    expect(m.expiryDate).toBe("Expiry");
    expect(m.currentQty).toBe("Current Stock");
    expect(m.rackLocation).toBe("Rack No.");
  });
});

describe("columns a file implies but does not contain", () => {
  it("adds one GST rate from the SGST and CGST halves", () => {
    const { headers, rows, derived, seed } = deriveColumns(MARG_ITEMS,
      [{ SGST: "2.5", CGST: "2.5", Name: "X", Stock: "0" }]);
    expect(headers).toContain("GST Rate");
    expect(rows[0]["GST Rate"]).toBe("5");
    expect(derived.some(d => d.note.includes("full rate"))).toBe(true);
    // And the mapper then finds it.
    expect(seed.taxRate).toBe("GST Rate");
    expect(autoMapColumns(headers, { seed }).taxRate).toBe("GST Rate");
  });

  it("does not invent a GST column when the file already has one", () => {
    const { headers } = deriveColumns(["Name","SGST","CGST","GST Rate"], [{}]);
    expect(headers.filter(h => h === "GST Rate")).toHaveLength(1); // the file's own, not an added one
  });

  it("splits packs.units stock into packs and loose units", () => {
    const { rows } = deriveColumns(["Name","Stock"],
      [{ Name: "A", Stock: "83.2" }, { Name: "B", Stock: "80.11" }, { Name: "C", Stock: "5" }]);
    expect(rows[0]["Stock — packs"]).toBe("83");
    expect(rows[0]["Stock — loose units"]).toBe("2");
    // The decimal digits are the count as written: 11 loose, not 1.
    expect(rows[1]["Stock — packs"]).toBe("80");
    expect(rows[1]["Stock — loose units"]).toBe("11");
    // A whole number is simply packs.
    expect(rows[2]["Stock — packs"]).toBe("5");
    expect(rows[2]["Stock — loose units"]).toBe("0");
  });

  it("leaves a whole-number stock column alone", () => {
    const { headers } = deriveColumns(["Name","Stock"], [{ Name: "A", Stock: "12" }]);
    expect(headers).toEqual(["Name","Stock"]);
  });
});

describe("generic files", () => {
  it("maps a plainly-named file", () => {
    const m = autoMapColumns(["Item Name","Manufacturer","HSN","GST %","Batch","Expiry Date","MRP","Qty"]);
    expect(m.name).toBe("Item Name");
    expect(m.manufacturer).toBe("Manufacturer");
    expect(m.hsnCode).toBe("HSN");
    expect(m.taxRate).toBe("GST %");
    expect(m.batchNo).toBe("Batch");
    expect(m.expiryDate).toBe("Expiry Date");
    expect(m.currentQty).toBe("Qty");
  });

  it("maps nothing from a file that is not an item list", () => {
    expect(autoMapColumns(["Ledger","Voucher","Debit","Credit"]).name).toBeUndefined();
  });
});

describe("computed columns are told, not guessed", () => {
  it("sends the packs column to quantity, not to pack size", () => {
    // "Stock — packs" contains the word "pack", and Pack size is declared
    // first, so guessing put the quantity in the wrong field entirely.
    const { headers, rows, seed } = deriveColumns(["Product Name","Current Stock"],
      [{ "Product Name": "A", "Current Stock": "83.2" }]);
    const m = autoMapColumns(headers, { seed, sample: rows });
    expect(m.currentQty).toBe("Stock — packs");
    expect(m.looseUnits).toBe("Stock — loose units");
    expect(m.packSize).toBeUndefined();
  });
});

describe("a perfectly-named empty column", () => {
  it("loses to a populated one that means the same thing", () => {
    // Marg's stock report has an empty "Manufacturer" beside a populated
    // "Company". Mapping the empty one imports 2,129 blanks.
    const headers = ["Product Name", "Company", "Manufacturer"];
    const sample = [{ "Product Name": "A", Company: "SINAG HEALTHCARE", Manufacturer: "" }];
    expect(autoMapColumns(headers, { sample }).manufacturer).toBe("Company");
  });

  it("still uses the well-named column when it does have data", () => {
    const headers = ["Product Name", "Company", "Manufacturer"];
    const sample = [{ "Product Name": "A", Company: "X", Manufacturer: "CIPLA" }];
    expect(autoMapColumns(headers, { sample }).manufacturer).toBe("Manufacturer");
  });

  it("falls back to the empty column when nothing else matches", () => {
    const sample = [{ "Product Name": "A", Manufacturer: "" }];
    expect(autoMapColumns(["Product Name","Manufacturer"], { sample }).manufacturer).toBe("Manufacturer");
  });
});
