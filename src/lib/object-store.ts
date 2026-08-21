import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * One S3-compatible client, shared by everything that needs durable storage.
 *
 * Uploaded documents and nightly backups have the same requirement — a host
 * whose filesystem is read-only or ephemeral loses both — and they had better
 * agree on where "durable" is. Two copies of this configuration is how one of
 * them ends up quietly writing somewhere nobody looks.
 *
 * Configured, or not, by a single switch: no bucket, no object storage, and
 * callers fall back to local disk.
 */
export const OBJECT_BUCKET = process.env.ATTACHMENT_S3_BUCKET;

export const usingObjectStore = () => Boolean(OBJECT_BUCKET);

let cached: S3Client | null = null;

export function objectStore(): S3Client {
  if (!cached) {
    const endpoint = process.env.ATTACHMENT_S3_ENDPOINT;
    const accessKeyId = process.env.ATTACHMENT_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.ATTACHMENT_S3_SECRET_ACCESS_KEY;
    cached = new S3Client({
      // "auto" is what R2 expects; real AWS needs its own region set.
      region: process.env.ATTACHMENT_S3_REGION || "auto",
      endpoint: endpoint || undefined,
      // Non-AWS providers address buckets by path, not by subdomain.
      forcePathStyle: Boolean(endpoint),
      // Fall through to the SDK's own credential chain when no explicit key
      // is given, so an instance role keeps working.
      credentials:
        accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }
  return cached;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await objectStore().send(
    new PutObjectCommand({
      Bucket: OBJECT_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** Null for a missing object, so callers need not distinguish it from an outage. */
export async function getObject(key: string): Promise<Buffer | null> {
  try {
    const found = await objectStore().send(
      new GetObjectCommand({ Bucket: OBJECT_BUCKET, Key: key })
    );
    if (!found.Body) return null;
    return Buffer.from(await found.Body.transformToByteArray());
  } catch {
    return null;
  }
}
