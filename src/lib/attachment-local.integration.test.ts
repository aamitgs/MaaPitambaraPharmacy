import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The local-disk backend is the in-shop deployment, so it has to keep
 * working unchanged when no bucket is configured.
 */
let dir: string;
let storage: typeof import("@/lib/attachment-storage");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mpp-attach-"));
  delete process.env.ATTACHMENT_S3_BUCKET;
  process.env.PRESCRIPTION_STORAGE_DIR = dir;
  storage = await import("@/lib/attachment-storage");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("local attachment backend", () => {
  it("writes to disk and reads back", async () => {
    const file = new File([Buffer.from("on-disk-bytes")], "rx.png", {
      type: "image/png",
    });
    const stored = await storage.saveAttachment("prescriptions", "tenant-1", file);

    expect(stored).toMatch(/^tenant-1\/[0-9a-f-]{36}\.png$/);
    expect((await readFile(path.join(dir, stored))).toString()).toBe("on-disk-bytes");

    const read = await storage.readAttachment("prescriptions", stored);
    expect(read!.bytes.toString()).toBe("on-disk-bytes");
    expect(read!.contentType).toBe("image/png");
  });

  it("still refuses to escape the storage root", async () => {
    expect(await storage.readAttachment("prescriptions", "../../etc/passwd")).toBeNull();
  });

  it("rejects a disallowed type before writing anything", async () => {
    const bad = new File([Buffer.from("x")], "x.exe", { type: "application/x-msdownload" });
    await expect(
      storage.saveAttachment("prescriptions", "tenant-1", bad)
    ).rejects.toThrow(storage.AttachmentUploadError);
  });
});
