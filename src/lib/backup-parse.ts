import { decryptBackup } from "@/lib/backup-crypto";
import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  type BackupPayload,
} from "@/lib/backup-schema";

/**
 * Decrypt and validate a backup file.
 *
 * Lives apart from the server action so the provisioning command can apply
 * exactly the same checks. A second, hand-written parser is how a restore
 * path ends up accepting a file the app would have rejected — the same way
 * the nightly backup once wrote seven tables while the manual one wrote
 * forty-five.
 */
export function parseBackup(base64: string): BackupPayload {
  let json: string;
  try {
    json = decryptBackup(Buffer.from(base64, "base64"));
  } catch {
    throw new Error(
      "Could not decrypt that file. It needs the same BACKUP_ENCRYPTION_KEY it was created with."
    );
  }

  let payload: BackupPayload;
  try {
    payload = JSON.parse(json) as BackupPayload;
  } catch {
    throw new Error("That file decrypted but is not a valid backup.");
  }

  if (payload.version !== BACKUP_VERSION) {
    throw new Error(
      `That backup is version ${payload.version ?? "1"}; this app writes and reads version ` +
        `${BACKUP_VERSION}. Version 1 files only contain six tables and cannot be restored.`
    );
  }
  if (!payload.tables || !payload.tenant) {
    throw new Error("That backup is missing its table data.");
  }

  // The counts recorded at export time must match what the file actually
  // holds. A mismatch means truncation or tampering, and restoring half a
  // ledger is worse than restoring none of it.
  for (const table of BACKUP_TABLES) {
    const actual = payload.tables[table]?.length ?? 0;
    const claimed = payload.counts?.[table] ?? 0;
    if (actual !== claimed) {
      throw new Error(
        `That backup is damaged: it says ${claimed} ${table} but contains ${actual}.`
      );
    }
  }

  return payload;
}
