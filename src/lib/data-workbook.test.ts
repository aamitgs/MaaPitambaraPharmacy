import { describe, it, expect } from "vitest";
import { redactValue, cellValue, NEVER_EXPORT } from "./data-workbook";

describe("data workbook redaction", () => {
  it("never exports a credential, even in full mode", () => {
    // The whole point: "full" means every business field, not the secrets.
    for (const col of NEVER_EXPORT) {
      expect(redactValue("users", col, "sensitive", "full")).toBe("[not exported]");
      expect(redactValue("users", col, "sensitive", "redacted")).toBe("[not exported]");
    }
  });

  it("redacts patient details by default", () => {
    expect(redactValue("salesInvoices", "patientName", "Amit", "redacted")).toBe("[redacted]");
    expect(redactValue("salesInvoices", "patientPhone", "9999900001", "redacted")).toBe(
      "[redacted]"
    );
  });

  it("lets the owner ask for them explicitly", () => {
    expect(redactValue("salesInvoices", "patientName", "Amit", "full")).toBe("Amit");
  });

  it("redacts a customer's name but not an item's", () => {
    // `name` is personal on a table about people and not on one about
    // products — the same column name means different things.
    expect(redactValue("customers", "name", "Mrs Sharma", "redacted")).toBe("[redacted]");
    expect(redactValue("items", "name", "Paracetamol 500mg", "redacted")).toBe(
      "Paracetamol 500mg"
    );
  });

  it("leaves blanks alone rather than writing [redacted] over nothing", () => {
    expect(redactValue("customers", "phone", null, "redacted")).toBeNull();
    expect(redactValue("customers", "phone", "", "redacted")).toBe("");
  });

  it("keeps business figures in every mode", () => {
    expect(redactValue("salesInvoices", "total", 314, "redacted")).toBe(314);
    expect(redactValue("items", "hsnCode", "3004", "redacted")).toBe("3004");
  });
});

describe("cellValue", () => {
  it("keeps numbers and dates as themselves", () => {
    const d = new Date("2026-08-20");
    expect(cellValue(42)).toBe(42);
    expect(cellValue(d)).toBe(d);
    expect(cellValue(true)).toBe(true);
    expect(cellValue(null)).toBeNull();
  });

  it("turns a Decimal into a number so it can be summed", () => {
    const decimalLike = { toFixed: () => "314.00", toString: () => "314.00" };
    expect(cellValue(decimalLike)).toBe(314);
  });

  it("writes JSON rather than [object Object]", () => {
    expect(cellValue({ a: 1 })).toBe('{"a":1}');
  });
});
