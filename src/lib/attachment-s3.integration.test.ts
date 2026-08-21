import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";

/** Minimal S3-compatible store: enough for PutObject/GetObject round-trips. */
const objects = new Map<string, { body: Buffer; contentType: string }>();
let server: http.Server;
let storage: typeof import("@/lib/attachment-storage");

beforeAll(async () => {
  server = http.createServer((req, res) => {
    // Path-style: /<bucket>/<key...>; the SDK appends ?x-id=<Operation>.
    const pathname = new URL(req.url!, "http://localhost").pathname;
    const key = decodeURIComponent(pathname.replace(/^\/test-bucket\//, ""));
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: req.headers["content-type"] as string,
        });
        res.writeHead(200).end();
      });
      return;
    }
    const found = objects.get(key);
    if (!found) {
      res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    res.writeHead(200, { "content-type": found.contentType }).end(found.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  process.env.ATTACHMENT_S3_BUCKET = "test-bucket";
  process.env.ATTACHMENT_S3_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.ATTACHMENT_S3_ACCESS_KEY_ID = "test";
  process.env.ATTACHMENT_S3_SECRET_ACCESS_KEY = "test";
  // Imported after the env is set — the backend switch is read at module load.
  storage = await import("@/lib/attachment-storage");
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("S3 attachment backend", () => {
  it("round-trips a file through the bucket, not the disk", async () => {
    const bytes = Buffer.from("prescription-image-bytes");
    const file = new File([bytes], "rx.jpg", { type: "image/jpeg" });

    const stored = await storage.saveAttachment("prescriptions", "tenant-1", file);

    expect(stored).toMatch(/^tenant-1\/[0-9a-f-]{36}\.jpg$/);
    expect([...objects.keys()]).toEqual([`prescriptions/${stored}`]);
    expect(objects.get(`prescriptions/${stored}`)!.contentType).toBe("image/jpeg");

    // Nothing may touch the local filesystem when a bucket is configured —
    // that is the whole point on a read-only/ephemeral host.
    expect(existsSync(path.join(process.cwd(), "storage", "prescriptions", "tenant-1")))
      .toBe(false);

    const read = await storage.readAttachment("prescriptions", stored);
    expect(read).not.toBeNull();
    expect(read!.bytes.toString()).toBe("prescription-image-bytes");
    expect(read!.contentType).toBe("image/jpeg");
  });

  it("returns null for a missing object instead of throwing", async () => {
    const missing = await storage.readAttachment(
      "prescriptions",
      "tenant-1/00000000-0000-4000-8000-000000000000.jpg"
    );
    expect(missing).toBeNull();
  });

  it("refuses to read across kinds via traversal", async () => {
    const invoice = new File([Buffer.from("secret")], "b.pdf", {
      type: "application/pdf",
    });
    const stored = await storage.saveAttachment("purchaseInvoices", "tenant-2", invoice);

    const escaped = await storage.readAttachment(
      "prescriptions",
      `../purchaseInvoices/${stored}`
    );
    expect(escaped).toBeNull();
  });
});
