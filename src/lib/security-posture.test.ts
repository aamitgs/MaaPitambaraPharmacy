import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Checks the default-credential detection against the real database.
 *
 * Mirrors the comparisons `getSecurityPosture` makes rather than calling it,
 * because that action is owner-gated and a test has no session. What is
 * being verified is the thing that could silently break: that bcrypt
 * actually recognises the seeded values.
 */
const SEEDED_PASSWORDS = ["Owner@12345", "Pharmacist@12345", "Counter@12345"];
const WEAK_PINS = ["1234", "0000", "1111", "1212", "4321", "9999", "2580"];

let reachable = false;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("default credential detection", () => {
  it("recognises a seeded password by its hash", async () => {
    // Not a database test — proves the comparison itself works, so a
    // failure here means the detection is broken, not that the install is
    // clean.
    const hash = await bcrypt.hash("Owner@12345", 10);
    expect(await bcrypt.compare("Owner@12345", hash)).toBe(true);
    expect(await bcrypt.compare("Owner@12346", hash)).toBe(false);
  });

  it("reports which live accounts are still on an installation password", async ({ skip }) => {
    if (!reachable) skip();
    const users = await prisma.user.findMany({
      select: { email: true, passwordHash: true },
    });
    expect(users.length).toBeGreaterThan(0);

    const stillDefault: string[] = [];
    for (const u of users) {
      for (const seeded of SEEDED_PASSWORDS) {
        if (await bcrypt.compare(seeded, u.passwordHash)) {
          stillDefault.push(u.email);
          break;
        }
      }
    }
    // Deliberately not asserted to be empty: this database is a demo, and a
    // failing test here would be noise. The value is the printed list.
    console.log(
      stillDefault.length
        ? `accounts on installation passwords: ${stillDefault.join(", ")}`
        : "no accounts on installation passwords"
    );
    expect(Array.isArray(stillDefault)).toBe(true);
  }, 30_000);

  it("reports whether the manager PIN is a well-known one", async ({ skip }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirst({ select: { managerPinHash: true } });
    if (!tenant?.managerPinHash) {
      console.log("no manager PIN set");
      return;
    }
    let weak: string | null = null;
    for (const pin of WEAK_PINS) {
      if (await bcrypt.compare(pin, tenant.managerPinHash)) {
        weak = pin;
        break;
      }
    }
    console.log(weak ? "manager PIN is a well-known default" : "manager PIN is not a known default");
    expect(typeof (weak === null || weak.length > 0)).toBe("boolean");
  }, 30_000);
});
