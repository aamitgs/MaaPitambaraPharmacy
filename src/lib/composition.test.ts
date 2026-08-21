import { describe, it, expect } from "vitest";
import {
  parseComposition,
  compositionKey,
  isSubstitute,
  describeComposition,
} from "./composition";

describe("parsing a composition", () => {
  it("reads a single-salt product", () => {
    expect(parseComposition("Paracetamol 500mg")).toEqual([
      { salt: "paracetamol", amount: 500_000, unit: "mcg", per: null },
    ]);
  });

  it("ignores pharmacopoeia markers, which are written inconsistently", () => {
    expect(compositionKey("Paracetamol IP 500mg")).toBe(compositionKey("Paracetamol 500mg"));
    expect(compositionKey("Paracetamol I.P. 500 mg")).toBe(compositionKey("Paracetamol 500mg"));
  });

  it("reads a combination product", () => {
    const parsed = parseComposition("Amoxycillin 500mg + Clavulanic Acid 125mg");
    expect(parsed).toHaveLength(2);
    expect(parsed?.[0].salt).toBe("amoxicillin");
    expect(parsed?.[1].amount).toBe(125_000);
  });

  it("normalises units so 0.5mg and 500mcg are the same strength", () => {
    expect(compositionKey("Digoxin 0.5mg")).toBe(compositionKey("Digoxin 500mcg"));
    expect(compositionKey("Vitamin C 1g")).toBe(compositionKey("Vitamin C 1000mg"));
  });

  it("keeps the per-volume basis of a syrup", () => {
    const parsed = parseComposition("Codeine Phosphate 10mg / 5ml");
    expect(parsed?.[0].per).toBe("5ml");
    expect(parsed?.[0].salt).toBe("codeine");
  });

  it("refuses to parse rather than guess", () => {
    // No strength stated — nothing safe can be concluded.
    expect(parseComposition("Paracetamol")).toBeNull();
    expect(parseComposition("")).toBeNull();
    expect(parseComposition(null)).toBeNull();
    // One salt readable, one not: a partial parse would compare the
    // readable half and call two different products the same.
    expect(parseComposition("Amoxycillin 500mg + Clavulanic Acid")).toBeNull();
  });
});

describe("deciding on a substitute", () => {
  it("matches the same salts at the same strengths, in any order", () => {
    expect(
      isSubstitute(
        "Amoxycillin 500mg + Clavulanic Acid 125mg",
        "Clavulanic Acid 125mg + Amoxicillin 500mg"
      )
    ).toBe(true);
  });

  it("refuses a different strength — the error that would matter clinically", () => {
    expect(isSubstitute("Paracetamol 500mg", "Paracetamol 650mg")).toBe(false);
    expect(isSubstitute("Paracetamol 500mg", "Paracetamol 500mcg")).toBe(false);
  });

  it("refuses a different concentration of the same salt", () => {
    // A 10mg/5ml syrup is twice the strength of 10mg/10ml.
    expect(isSubstitute("Codeine Phosphate 10mg/5ml", "Codeine Phosphate 10mg/10ml")).toBe(false);
  });

  it("refuses when one product has an extra ingredient", () => {
    expect(
      isSubstitute("Paracetamol 500mg", "Paracetamol 500mg + Caffeine 30mg")
    ).toBe(false);
  });

  it("treats known salt-form spellings as the same ingredient", () => {
    expect(isSubstitute("Cetirizine Hydrochloride 10mg", "Cetirizine 10mg")).toBe(true);
    expect(isSubstitute("Acetaminophen 500mg", "Paracetamol 500mg")).toBe(true);
  });

  it("never calls two unreadable compositions a match", () => {
    // Both null keys. Returning true here would offer every unlabelled
    // item as a substitute for every other.
    expect(isSubstitute("Paracetamol", "Amoxicillin")).toBe(false);
    expect(isSubstitute(null, null)).toBe(false);
    expect(isSubstitute("", "")).toBe(false);
  });
});

describe("a pharmacy's own salt aliases", () => {
  const aliases = new Map([
    ["torsemide", "torasemide"],
    ["vitamin b12", "cyanocobalamin"],
  ]);

  it("matches spellings the built-in list does not know", () => {
    // Without the alias these are two different ingredients.
    expect(isSubstitute("Torsemide 10mg", "Torasemide 10mg")).toBe(false);
    expect(isSubstitute("Torsemide 10mg", "Torasemide 10mg", aliases)).toBe(true);
  });

  it("still refuses a different strength — an alias is not a licence", () => {
    expect(isSubstitute("Torsemide 10mg", "Torasemide 20mg", aliases)).toBe(false);
  });

  it("lets a pharmacy's own decision override a shipped default", () => {
    // The built-in list folds acetaminophen into paracetamol. A pharmacy
    // that wants them kept apart can say so.
    const keepApart = new Map([["acetaminophen", "acetaminophen-distinct"]]);
    expect(isSubstitute("Acetaminophen 500mg", "Paracetamol 500mg")).toBe(true);
    expect(isSubstitute("Acetaminophen 500mg", "Paracetamol 500mg", keepApart)).toBe(false);
  });

  it("leaves unaliased ingredients alone", () => {
    expect(compositionKey("Paracetamol 500mg", aliases)).toBe(compositionKey("Paracetamol 500mg"));
  });
});

describe("reading a composition back", () => {
  it("renders strengths the way a label writes them", () => {
    expect(describeComposition("Paracetamol 500mg")).toBe("paracetamol 500mg");
    expect(describeComposition("Digoxin 500mcg")).toBe("digoxin 500mcg");
    // Normalised to mcg internally, shown as mg again.
    expect(describeComposition("Digoxin 0.5mg")).toBe("digoxin 500mcg");
    expect(describeComposition("Vitamin C 1g")).toBe("vitamin c 1g");
  });

  it("keeps a syrup's basis visible", () => {
    expect(describeComposition("Codeine Phosphate 10mg/5ml")).toBe("codeine 10mg/5ml");
  });

  it("does not print trailing zeros on whole numbers", () => {
    expect(describeComposition("Amoxicillin 250mg")).not.toContain(".00");
    expect(describeComposition("Levothyroxine 12.5mcg")).toBe("levothyroxine 12.5mcg");
  });

  it("returns null for anything it could not parse", () => {
    expect(describeComposition("Paracetamol")).toBeNull();
    expect(describeComposition(null)).toBeNull();
  });
});
