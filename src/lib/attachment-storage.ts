import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local-disk storage for uploaded documents, outside `public/` so a file can
 * only be read back through an authenticated /api/files/... route (which
 * cross-checks the requesting tenant against the record the path is attached
 * to) rather than by guessing a URL. Simplest option for this single-server
 * deployment — swap for an S3-compatible client behind these two functions
 * if that ever changes. See README.
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

  const tenantDir = path.join(ROOTS[kind], tenantId);
  await mkdir(tenantDir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // turbopackIgnore: this path is runtime-only (uploaded files), not a
  // build-time dependency — without the annotation Turbopack traces the
  // whole project into the standalone output because it can't tell.
  await writeFile(path.join(/* turbopackIgnore: true */ tenantDir, filename), buffer);

  return `${tenantId}/${filename}`;
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
  const root = ROOTS[kind];
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep)) return null;

  const ext = resolved.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return null;

  try {
    const bytes = await readFile(resolved);
    return { bytes, contentType };
  } catch {
    return null;
  }
}
