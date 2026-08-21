import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { revokeAllForUser } from "@/lib/trusted-device-store";
import { hashDeviceToken, newDeviceToken, trustExpiry } from "@/lib/trusted-device";

/**
 * The rule that matters most: when the credentials behind a trust change,
 * the trust goes with them. A password reset that left a standing OTP
 * bypass would be worse than useless.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

describe("clearing trust when credentials change", () => {
  it("revokes every live device for the user and leaves others alone", async ({ skip }) => {
    if (!reachable) skip();
    const users = await prisma.user.findMany({ take: 2, select: { id: true } });
    if (users.length < 2) skip();
    const [mine, theirs] = users;

    const made: string[] = [];
    for (const u of [mine.id, mine.id, theirs.id]) {
      const d = await prisma.trustedDevice.create({
        data: {
          userId: u,
          tokenHash: hashDeviceToken(newDeviceToken()),
          label: "vitest device",
          expiresAt: trustExpiry(),
        },
      });
      made.push(d.id);
    }

    try {
      const count = await revokeAllForUser(mine.id);
      expect(count).toBe(2);

      const rows = await prisma.trustedDevice.findMany({
        where: { id: { in: made } },
        select: { id: true, userId: true, revokedAt: true },
      });
      for (const r of rows) {
        if (r.userId === mine.id) expect(r.revokedAt).not.toBeNull();
        // Someone else's device must not be caught in the sweep.
        else expect(r.revokedAt).toBeNull();
      }

      // Running it twice must not double-count or resurrect anything.
      expect(await revokeAllForUser(mine.id)).toBe(0);
    } finally {
      await prisma.trustedDevice.deleteMany({ where: { id: { in: made } } });
    }
  }, 30_000);
});
