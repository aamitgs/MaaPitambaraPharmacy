import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A plain stub rather than `vi.fn()`: Vitest tracks promises returned from
 * a spy and reports a rejection as an unhandled error even when the code
 * under test catches it properly — which would make this file fail while
 * the route behaved correctly. A hand-rolled stub keeps the rejection a
 * real async one, which is how a dead database actually fails.
 */
let behaviour: () => Promise<unknown>;
let calls = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: () => {
      calls += 1;
      return behaviour();
    },
  },
}));

const { GET } = await import("./route");

/**
 * The healthcheck exists so that a database outage is visible. A probe
 * that answers {ok:true} whatever the state of the database is worse than
 * no probe at all — the POS reads "online" as "safe to bill", and would
 * fail sales one at a time instead of queueing them offline.
 */
describe("healthcheck", () => {
  beforeEach(() => {
    calls = 0;
    behaviour = async () => [{ "?column?": 1 }];
  });

  it("reports healthy only after the database actually answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, db: "up" });
    // The point of the whole change: it queries, rather than asserting.
    expect(calls).toBe(1);
  });

  it("fails with 503 when the database is unreachable", async () => {
    behaviour = async () => {
      throw new Error("connection refused");
    };
    const res = await GET();
    // A status a load balancer or uptime monitor can act on without
    // parsing the body.
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, db: "down" });
  });

  it("does not leak the connection error to an unauthenticated caller", async () => {
    behaviour = async () => {
      throw new Error("password authentication failed for user 'pharmacy' at 10.0.0.5:5432");
    };
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toContain("password");
    expect(body).not.toContain("10.0.0.5");
  });

  it("is never cached — a stale healthy answer is the dangerous one", async () => {
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
    behaviour = async () => {
      throw new Error("down");
    };
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
  });
});
