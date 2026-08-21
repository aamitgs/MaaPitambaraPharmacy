import { describe, it, expect } from "vitest";
import { objectKey, keyIsSafe } from "@/lib/attachment-keys";

describe("objectKey", () => {
  it("prefixes the kind so one bucket can hold every kind", () => {
    expect(objectKey("prescriptions", "tenant-1/abc.jpg")).toBe(
      "prescriptions/tenant-1/abc.jpg"
    );
  });

  it("keeps kinds apart, so the same stored path never collides", () => {
    const stored = "tenant-1/abc.jpg";
    expect(objectKey("itemPhotos", stored)).not.toBe(
      objectKey("prescriptions", stored)
    );
  });
});

describe("keyIsSafe", () => {
  it("accepts the shape saveAttachment actually produces", () => {
    expect(keyIsSafe("tenant-1/3f2b8c1e-0000-4000-8000-000000000000.pdf")).toBe(true);
    expect(keyIsSafe("brand/logo.png")).toBe(true);
  });

  it("rejects traversal that would cross into another kind's prefix", () => {
    // Without this a prescription URL reaches purchase invoices, which is a
    // different tenant-scoping check entirely.
    expect(keyIsSafe("tenant-1/../../purchaseInvoices/tenant-2/x.pdf")).toBe(false);
    expect(keyIsSafe("../brand-assets/logo.png")).toBe(false);
    expect(keyIsSafe("..")).toBe(false);
  });

  it("rejects absolute keys", () => {
    expect(keyIsSafe("/etc/passwd")).toBe(false);
  });

  it("rejects backslashes rather than trusting the provider to normalise them", () => {
    expect(keyIsSafe("tenant-1\\..\\..\\x.pdf")).toBe(false);
  });

  it("allows dots that are not a whole segment", () => {
    // "..jpg" and "a..b" are legitimate names, not traversal.
    expect(keyIsSafe("tenant-1/a..b.jpg")).toBe(true);
    expect(keyIsSafe("tenant-1/..jpg")).toBe(true);
  });
});
