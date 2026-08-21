import { describe, it, expect } from "vitest";
import { normalizeName, normalizePhone, findDuplicateGroups } from "./customer-identity";

describe("name normalisation", () => {
  it("collapses the three ways one customer gets entered", () => {
    // The exact case from the shop floor.
    expect(normalizeName("Sharma")).toBe("sharma");
    expect(normalizeName("Mr Sharma")).toBe("sharma");
    expect(normalizeName("sharma ji")).toBe("sharma");
    expect(normalizeName("SHRI  Sharma ")).toBe("sharma");
    expect(normalizeName("Mr. Sharma")).toBe("sharma");
  });

  it("does not eat a name that merely contains an honorific's letters", () => {
    expect(normalizeName("Jitendra")).toBe("jitendra");
    expect(normalizeName("Mrinalini")).toBe("mrinalini");
    // "ji" is a suffix, never a whole first name being stripped.
    expect(normalizeName("Ji Sharma")).toBe("ji sharma");
  });

  it("keeps distinct people distinct", () => {
    expect(normalizeName("Ramesh Sharma")).not.toBe(normalizeName("Suresh Sharma"));
  });

  it("falls back rather than returning an empty key", () => {
    // Someone typed only an honorific. An empty key would match every
    // other such record and offer to merge unrelated people.
    expect(normalizeName("Mr")).toBe("mr");
    expect(normalizeName("Dr.")).toBe("dr");
  });
});

describe("phone normalisation", () => {
  it("reduces every way an Indian mobile gets written to the same ten digits", () => {
    const forms = ["9876543210", "+91 98765 43210", "+919876543210", "09876543210",
                   "91-9876543210", "0091 9876543210", "98765 43210"];
    for (const f of forms) expect(normalizePhone(f), f).toBe("9876543210");
  });

  it("returns null for anything that is not a number, so junk never becomes a key", () => {
    expect(normalizePhone("n/a")).toBeNull();
    expect(normalizePhone("-")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    // A landline is not a mobile and is not treated as an identifier.
    expect(normalizePhone("0562 2345678")).toBeNull();
  });
});

describe("finding duplicates", () => {
  const c = (id: string, name: string, phone: string | null = null) => ({ id, name, phone });

  it("groups the same phone under different spellings", () => {
    const groups = findDuplicateGroups([
      c("1", "Sharma", "9876543210"),
      c("2", "Mr Sharma", "+91 98765 43210"),
      c("3", "sharma ji", "09876543210"),
      c("4", "Verma", "9000000000"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("phone");
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("suggests a name match only when no phone contradicts it", () => {
    const groups = findDuplicateGroups([
      c("1", "Sharma"),
      c("2", "Mr Sharma"),
      c("3", "sharma ji", "9876543210"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("name");
    expect(groups[0].members).toHaveLength(3);
  });

  it("refuses to group two people who share a name but not a number", () => {
    // The case that makes automatic merging unacceptable: two real,
    // different Sharmas, each with their own phone and own balance.
    const groups = findDuplicateGroups([
      c("1", "Sharma", "9876543210"),
      c("2", "Mr Sharma", "9000000000"),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("reports a record once, at its strongest evidence", () => {
    const groups = findDuplicateGroups([
      c("1", "Sharma", "9876543210"),
      c("2", "Mr Sharma", "9876543210"),
      c("3", "Sharma"),
    ]);
    // 1 and 2 match on phone; 3 is not pulled into that group by name, and
    // 1 and 2 are not re-offered as a name group.
    expect(groups.filter((g) => g.reason === "phone")).toHaveLength(1);
    expect(groups.some((g) => g.members.some((m) => m.id === "3") && g.reason === "phone")).toBe(false);
  });

  it("says nothing about a clean customer list", () => {
    expect(
      findDuplicateGroups([c("1", "Ramesh Sharma", "9876543210"), c("2", "Suresh Verma", "9000000000")])
    ).toEqual([]);
  });
});
