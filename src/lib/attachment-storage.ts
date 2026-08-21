import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { objectKey, keyIsSafe } from "@/lib/attachment-keys";

/**
 * Storage for uploaded documents, kept outside `public/` so a file can only
 * be read back through an authenticated /api/files/... route (which
 * cross-checks the requesting tenant against the record the path is attached
 * to) rather than by guessing a URL.
 *
 * Two backends live behind `saveAttachment`/`readAttachment`, chosen by
 * whether ATTACHMENT_S3_BUCKET is set:
 *
 *   unset — local disk, as originally built, for the in-shop machine.
 *   set   — an S3-compatible bucket (R2, S3, Backblaze, MinIO), needed on
 *           any host with an ephemeral or read-only filesystem. A serverless
 *           deploy silently loses local writes, and prescriptions are a
 *           record we are legally required to retain, so this is not
 *           optional there.
 *
 * Stored paths are backend-independent (`<tenantId>/<uuid>.<ext>`), so the
 * same database row resolves under either one. See README.
 *
 * Each kind gets its own root rather than sharing one with subdirectories:
 * stored paths are relative to the root, so folding prescriptions under a
 * new parent would invalidate every path already in the database.
 */
const ROOTS = {
  prescriptions: process.env.PRESCRIPTION_STORAGE_DIR
    ? path.resolve(process.env.PRESCRIPTION_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "prescriptions"),
  purchaseInvoices: process.env.PURCHASE_INVOICE_STORAGE_DIR
    ? path.resolve(process.env.PURCHASE_INVOICE_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "purchase-invoices"),
  itemPhotos: process.env.ITEM_PHOTO_STORAGE_DIR
    ? path.resolve(process.env.ITEM_PHOTO_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "item-photos"),
  // Brand logos differ from every other kind here: they are served by an
  // UNAUTHENTICATED route (/api/brand/[file]), because the login screen
  // shows the logo before there is a session and an emailed PDF embeds it
  // for a recipient who has no account at all. Nothing confidential is ever
  // stored under this root.
  brandAssets: process.env.BRAND_ASSET_STORAGE_DIR
    ? path.resolve(process.env.BRAND_ASSET_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "brand-assets"),
} as const;

export type AttachmentKind = keyof typeof ROOTS;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_BYTES = 8 * 1024 * 1024;

export class AttachmentUploadError extends Error {}

/** Bucket name is the switch: no bucket, no S3. */
const S3_BUCKET = process.env.ATTACHMENT_S3_BUCKET;

let cachedClient: S3Client | null = null;

function s3(): S3Client {
  if (!cachedClient) {
    const endpoint = process.env.ATTACHMENT_S3_ENDPOINT;
    const accessKeyId = process.env.ATTACHMENT_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.ATTACHMENT_S3_SECRET_ACCESS_KEY;
    cachedClient = new S3Client({
      // "auto" is what R2 expects; real AWS needs its own region set.
      region: process.env.ATTACHMENT_S3_REGION || "auto",
      endpoint: endpoint || undefined,
      // Non-AWS providers address buckets by path, not by subdomain.
      forcePathStyle: Boolean(endpoint),
      // Fall through to the SDK's own credential chain when no explicit
      // key is given, so an instance role keeps working.
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }
  return cachedClient;
}

export async function saveAttachment(
  kind: AttachmentKind,
  tenantId: string,
  file: File
): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new AttachmentUploadError("Only JPEG, PNG, WEBP, or PDF files are accepted.");
  }
  if (file.size > MAX_BYTES) {
    throw new AttachmentUploadError("File is too large (max 8 MB).");
  }

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const relativePath = `${tenantId}/${filename}`;

  if (S3_BUCKET) {
    await s3().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: objectKey(kind, relativePath),
        Body: buffer,
        ContentType: file.type,
      })
    );
    return relativePath;
  }

  const tenantDir = path.join(ROOTS[kind], tenantId);
  await mkdir(tenantDir, { recursive: true });
  // turbopackIgnore: this path is runtime-only (uploaded files), not a
  // build-time dependency — without the annotation Turbopack traces the
  // whole project into the standalone output because it can't tell.
  await writeFile(path.join(/* turbopackIgnore: true */ tenantDir, filename), buffer);

  return relativePath;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Resolves a stored relative path to bytes + content-type, refusing to escape the storage root. */
export async function readAttachment(
  kind: AttachmentKind,
  relativePath: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return null;

  if (S3_BUCKET) {
    if (!keyIsSafe(relativePath)) return null;
    try {
      const found = await s3().send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: objectKey(kind, relativePath),
        })
      );
      if (!found.Body) return null;
      const bytes = Buffer.from(await found.Body.transformToByteArray());
      return { bytes, contentType };
    } catch {
      // A missing object and an unreachable bucket both read as "not found"
      // to the caller, which is what the local backend already does.
      return null;
    }
  }

  const root = ROOTS[kind];
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep)) return null;

  try {
    const bytes = await readFile(resolved);
    return { bytes, contentType };
  } catch {
    return null;
  }
}
