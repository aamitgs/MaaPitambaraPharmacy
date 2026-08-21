import { describe, it, expect } from "vitest";
import { validatePartyRows, fieldsFor } from "./party-fields";

const none = new Set<string>();

describe("party import fields", () => {
  it("offers only the fields that apply to each kind", () => {
    const supplier = fieldsFor("supplier").map((f) => f.key);
    const customer = fieldsFor("customer").map((f) => f.key);
    expect(supplier).toContain("gstin");
    expect(supplier).not.toContain("creditLimit");
    expect(customer).toContain("creditLimit");
    expect(customer).not.toContain("gstin");
  });
});

describe("validatePartyRows", () => {
  it("requires a name", () => {
    const [r] = validatePartyRows("supplier", [{ phone: "9999900001" }], none);
    expect(r.errors).toContain("Name is required");
  });

  it("catches the same party twice in one file", () => {
    // Without this the second row silently overwrites the first, and the
    // import reports two successes for one record.
    const rows = validatePartyRows(
      "supplier",
      [{ name: "Agra Distributors" }, { name: "agra distributors" }],
      none
    );
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[1].errors).toContain("Appears more than once in this file");
  });

  it("marks an existing party as an update, not a create", () => {
    const rows = validatePartyRows(
      "supplier",
      [{ name: "Agra Distributors" }, { name: "New Firm" }],
      new Set(["agra distributors"])
    );
    expect(rows[0].action).toBe("update");
    expect(rows[1].action).toBe("create");
  });

  it("checks the GSTIN shape without pretending to verify it", () => {
    const ok = validatePartyRows("supplier", [{ name: "A", gstin: "09APFPS2581C1ZT" }], none);
    expect(ok[0].errors).toHaveLength(0);
    const bad = validatePartyRows("supplier", [{ name: "A", gstin: "NOT-A-GSTIN" }], none);
    expect(bad[0].errors).toContain("GSTIN is not the right shape");
  });

  it("rejects numbers that are not numbers", () => {
    const [r] = validatePartyRows("customer", [{ name: "A", creditLimit: "lots" }], none);
    expect(r.errors.join(" ")).toMatch(/not a number/);
  });

  it("rejects a fractional day count", () => {
    const [r] = validatePartyRows("customer", [{ name: "A", creditTermDays: "30.5" }], none);
    expect(r.errors.join(" ")).toMatch(/whole number/);
  });

  it("accepts a blank optional field", () => {
    const [r] = validatePartyRows(
      "customer",
      [{ name: "Walk-in regular", creditLimit: "", phone: "" }],
      none
    );
    expect(r.errors).toHaveLength(0);
  });
});
