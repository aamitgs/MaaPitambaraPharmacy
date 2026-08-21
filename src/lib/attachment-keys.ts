import type { AttachmentKind } from "@/lib/attachment-storage";

/**
 * Object-key construction for the S3-compatible attachment backend, kept
 * apart from attachment-storage so it is testable without standing up an
 * S3 client. Pure — no I/O, no `server-only`.
 */

/**
 * Object key for a stored path. The kind is a prefix rather than a separate
 * bucket so one bucket serves the whole install, and it mirrors the
 * one-root-per-kind rule in attachment-storage.
 */
export const objectKey = (kind: AttachmentKind, relativePath: string) =>
  `${kind}/${relativePath}`;

/**
 * The /api/files/... routes build `relativePath` from URL segments, so it is
 * attacker-shaped input. The local backend gets its containment from
 * path.resolve; a bucket has no such notion — keys are just strings, and
 * "prescriptions/x/../../brand-assets/y" would resolve server-side at some
 * providers and read another kind's file. So traversal is rejected here,
 * before a key is ever built.
 */
export function keyIsSafe(relativePath: string): boolean {
  if (relativePath.startsWith("/") || relativePath.includes("\\")) return false;
  return !relativePath.split("/").includes("..");
}
