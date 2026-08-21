import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  SYSTEM_ROLE_PERMISSIONS,
} from "./permissions";

/**
 * The permission matrix, asserted rather than assumed.
 *
 * These are policy decisions, not implementation details — "counter staff
 * may not bill at wholesale" is a statement about how the pharmacy is run,
 * and a change to it should have to be deliberate enough to update a test.
 */
describe("permission catalogue", () => {
  it("keys and labels stay in step", () => {
    expect(PERMISSION_KEYS.length).toBe(Object.keys(PERMISSIONS).length);
    for (const key of PERMISSION_KEYS) {
      expect(PERMISSIONS[key], `${key} has no label`).toBeTruthy();
    }
  });

  it("gives the owner everything", () => {
    expect([...SYSTEM_ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it("does not let counter staff hand margin away", () => {
    const counter = SYSTEM_ROLE_PERMISSIONS.counter_staff;
    // PTR is below retail by design. Whoever holds this can sell at close
    // to cost to anyone who asks, so it does not belong on a till login.
    expect(counter).not.toContain("sales.wholesale");
    // Same reasoning for the rest of the money-losing set.
    expect(counter).not.toContain("sales.cancel");
    expect(counter).not.toContain("stock.adjust");
    expect(counter).not.toContain("purchasing.viewRates");
  });

  it("lets a pharmacist bill wholesale", () => {
    expect(SYSTEM_ROLE_PERMISSIONS.pharmacist).toContain("sales.wholesale");
  });

  it("lets counter staff do the job they are there for", () => {
    expect(SYSTEM_ROLE_PERMISSIONS.counter_staff).toContain("sales.sell");
    expect(SYSTEM_ROLE_PERMISSIONS.counter_staff).toContain("cashup.manage");
  });

  it("never grants staff administration through a role", () => {
    // Staff and role admin is hard-gated to the owner in code precisely so
    // it cannot be granted away; there must be no permission for it.
    expect(PERMISSION_KEYS).not.toContain("users.manage" as never);
  });

  it("grants nothing a role does not know about", () => {
    for (const [role, perms] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(PERMISSION_KEYS, `${role} grants unknown ${p}`).toContain(p);
      }
    }
  });
});
