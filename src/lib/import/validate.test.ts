import { describe, it, expect } from "vitest";
import { validateRows } from "./validate";
import type { NormalizedRow } from "./normalize";

const row = (over: Partial<NormalizedRow> = {}): NormalizedRow =>
  ({ _rowIndex: 1, name: "Dolo 650", ...over }) as NormalizedRow;

/**
 * Warnings exist so a large supplier file is not rejected over something
 * that is merely unhelpful — but is not imported in silence either.
 */
describe("import warnings", () => {
  it("warns, but does not reject, a composition with no strengths", () => {
    const { rows, validCount, invalidCount, warningCount } = validateRows([
      row({ composition: "Paracetamol + Caffeine" }),
    ]);
    expect(rows[0].errors).toEqual([]);
    expect(validCount).toBe(1);
    expect(invalidCount).toBe(0);
    expect(warningCount).toBe(1);
    expect(rows[0].warnings[0]).toContain("will not be offered as a substitute");
  });

  it("says nothing about a composition it can read", () => {
    const { rows, warningCount } = validateRows([
      row({ composition: "Paracetamol 650mg" }),
    ]);
    expect(rows[0].warnings).toEqual([]);
    expect(warningCount).toBe(0);
  });

  it("says nothing when no composition was supplied at all", () => {
    // Composition is optional; nagging about every row of a file that
    // simply does not carry it would bury the rows that are wrong.
    expect(validateRows([row()]).warningCount).toBe(0);
    expect(validateRows([row({ composition: "   " })]).warningCount).toBe(0);
  });

  it("does not count a row that is already failing as a warning row", () => {
    // A row with no name is not importing anyway; listing it under
    // warnings too would double-report the same line.
    const { validCount, invalidCount, warningCount } = validateRows([
      row({ name: undefined, composition: "Paracetamol + Caffeine" }),
    ]);
    expect(validCount).toBe(0);
    expect(invalidCount).toBe(1);
    expect(warningCount).toBe(0);
  });

  it("keeps errors and warnings independent across a mixed file", () => {
    const summary = validateRows([
      row({ _rowIndex: 1, composition: "Paracetamol 500mg" }),
      row({ _rowIndex: 2, composition: "Paracetamol" }),
      row({ _rowIndex: 3, name: undefined }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.validCount).toBe(2);
    expect(summary.invalidCount).toBe(1);
    expect(summary.warningCount).toBe(1);
  });
});

describe("pack configuration and loose units", () => {
  it("accepts loose units below the pack size", () => {
    const { rows } = validateRows([row({ unitsPerPack: "15", looseUnits: "11" })]);
    expect(rows[0].errors).toEqual([]);
  });

  it("refuses loose units that have reached a full pack", () => {
    // 10 loose out of a strip of 10 is a pack, not loose stock. Allowing
    // both representations makes the same shelf add up two different ways.
    const { rows } = validateRows([row({ unitsPerPack: "10", looseUnits: "10" })]);
    expect(rows[0].errors[0]).toContain("must be fewer than the 10 in a pack");
    expect(validateRows([row({ unitsPerPack: "10", looseUnits: "14" })]).rows[0].errors).toHaveLength(1);
  });

  it("refuses a nonsensical pack size", () => {
    expect(validateRows([row({ unitsPerPack: "0" })]).rows[0].errors[0]).toContain("1 or more");
    expect(validateRows([row({ unitsPerPack: "2.5" })]).rows[0].errors).toHaveLength(1);
  });

  it("reads the ways a spreadsheet writes yes and no", () => {
    for (const v of ["yes", "Y", "TRUE", "1", "no", "N", "false", "0"]) {
      expect(validateRows([row({ allowLooseSale: v })]).rows[0].errors, v).toEqual([]);
    }
  });

  it("refuses a value it cannot read rather than assuming no", () => {
    // Silently reading "maybe" as false would switch off loose selling on
    // an item the pharmacy meant to enable.
    expect(validateRows([row({ allowLooseSale: "maybe" })]).rows[0].errors[0]).toContain("yes/no");
  });

  it("says nothing when pack fields are simply absent", () => {
    expect(validateRows([row()]).rows[0].errors).toEqual([]);
  });
});
