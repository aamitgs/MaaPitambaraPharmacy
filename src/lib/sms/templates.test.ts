import { describe, it, expect } from "vitest";
import { renderTemplate, smsSegments, isGsm7, SMS_TEMPLATES } from "./templates";

describe("SMS templates", () => {
  it("fills variables in the order the DLT template declares them", () => {
    expect(
      renderTemplate("receipt", ["INV-202608-0007", "13.00", "20/08/2026", "Maa Pitambara Pharmacy"])
    ).toBe("Bill INV-202608-0007 for Rs 13.00 dated 20/08/2026. Thank you for visiting Maa Pitambara Pharmacy.");
  });

  it("declares a variable name for every placeholder", () => {
    for (const t of Object.values(SMS_TEMPLATES)) {
      const placeholders = (t.text.match(/\{#var#\}/g) ?? []).length;
      expect(t.variableNames.length, `${t.key} names vs placeholders`).toBe(placeholders);
    }
  });

  it("keeps every shipped template inside one GSM-7 segment", () => {
    // A template that spills to two segments doubles the per-message cost
    // for every bill the pharmacy ever sends.
    for (const t of Object.values(SMS_TEMPLATES)) {
      const filled = renderTemplate(
        t.key,
        t.variableNames.map((n) =>
          n === "bill link"
            ? "https://example.com/bill/abcdefghijklmnop"
            : n === "pharmacy name"
              ? "Maa Pitambara Pharmacy"
              : n === "invoice number"
                ? "INV-202608-0007"
                : n === "amount"
                  ? "1234.00"
                  : "20/08/2026"
        )
      );
      const { encoding, segments } = smsSegments(filled);
      expect(encoding, `${t.key} must stay GSM-7`).toBe("GSM-7");
      expect(segments, `${t.key} spans ${segments} segments: "${filled}"`).toBe(1);
    }
  });

  it("catches the rupee sign, which triples the cost of a message", () => {
    // ₹ is not in GSM-7. One of them switches the whole SMS to UCS-2, where
    // a segment is 70 characters instead of 160 — which is exactly why the
    // templates say "Rs".
    expect(isGsm7("Bill INV-1 for Rs 250")).toBe(true);
    expect(isGsm7("Bill INV-1 for ₹250")).toBe(false);
    expect(smsSegments("₹" + "a".repeat(80)).encoding).toBe("UCS-2");
    expect(smsSegments("₹" + "a".repeat(80)).segments).toBe(2);
  });

  it("counts segments at the GSM-7 boundaries", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ encoding: "GSM-7", segments: 1 });
    expect(smsSegments("a".repeat(161))).toEqual({ encoding: "GSM-7", segments: 2 });
    expect(smsSegments("a".repeat(70)).segments).toBe(1);
  });
});
