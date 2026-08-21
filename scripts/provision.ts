/**
 * Bring a fresh database up to a working pharmacy, in one command.
 *
 *   npm run provision -- --backup ./backups/pharmacy-backup-....enc
 *
 * Three things have to happen to a newly created database, in order, and
 * doing them by hand is easy to get half-right: apply the schema, put the
 * tenant row back, then put its data back. Half-right is the dangerous
 * outcome — a database with tables and no tenant looks fine until someone
 * signs in, and a database with some tables populated looks fine until an
 * invoice is opened and its lines are missing.
 *
 * Deliberately refuses to touch a database that already has a tenant unless
 * --force is given. This runs against production by definition, and the
 * whole point of a provisioning command is that it is run when tired.
 *
 * The app's own restore (Settings → Backup) stays the tool for restoring
 * over an existing install; it needs an owner session and a tenant to
 * update, neither of which exists on an empty database. Both paths decrypt
 * and validate through the same parseBackup, so a file this accepts is a
 * file the app accepts.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseBackup } from "../src/lib/backup-parse";
import { writeTable, RESTORE_ORDER } from "../src/lib/backup-tables";

type Args = { backup?: string; force: boolean; skipMigrate: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, skipMigrate: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--backup") args.backup = argv[++i];
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--skip-migrate") args.skipMigrate = true;
  }
  return args;
}

/** Never print a connection string: it carries the password. */
function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Point it at the database you want to provision:\n" +
        '  DATABASE_URL="postgresql://..." npm run provision -- --backup <file>'
    );
  }
  if (!args.backup) {
    throw new Error(
      "No backup given. Pass the encrypted file this install should start from:\n" +
        "  npm run provision -- --backup ./backups/pharmacy-backup-....enc\n" +
        "It needs the same BACKUP_ENCRYPTION_KEY the file was written with."
    );
  }

  console.log(`\nTarget database : ${describeTarget(databaseUrl)}`);
  console.log(`Backup file     : ${args.backup}`);

  // 1. Decrypt and validate BEFORE touching the database. A bad key or a
  //    truncated file should fail here, not after migrating.
  const payload = parseBackup(readFileSync(args.backup).toString("base64"));
  const rowsInFile = Object.values(payload.counts).reduce((a, b) => a + b, 0);
  console.log(
    `Backup contents : ${rowsInFile} rows across ${Object.keys(payload.tables).length} tables, ` +
      `exported ${payload.exportedAt}`
  );

  // 2. Schema. `migrate deploy` applies pending migrations and never
  //    generates or resets, which is the only safe variant against a
  //    database that might already hold real records.
  if (args.skipMigrate) {
    console.log("\nSchema          : skipped (--skip-migrate)");
  } else {
    console.log("\nApplying migrations...");
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    // 3. Refuse to overwrite a live install by accident.
    const existing = await prisma.tenant.findFirst({ select: { id: true, pharmacyName: true } });
    if (existing && !args.force) {
      throw new Error(
        `This database already holds a pharmacy ("${existing.pharmacyName}").\n` +
          `Provisioning is for empty databases. To restore over an existing install, use\n` +
          `Settings → Backup in the app, which is owner-gated and asks for confirmation.\n` +
          `Pass --force only if you are certain this database is disposable.`
      );
    }

    console.log("\nRestoring...");
    const restored: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        // The tenant row keeps its original id: every other row references
        // it, so a new id would orphan the entire file.
        const { id, createdAt, ...fields } = payload.tenant as Record<string, unknown> & {
          id: string;
          createdAt: unknown;
        };
        await tx.tenant.upsert({
          where: { id },
          create: { id, createdAt, ...fields } as never,
          update: fields as never,
        });

        for (const table of RESTORE_ORDER) {
          restored[table] = await writeTable(tx, table, payload.tables[table] ?? []);
        }
      },
      // Thousands of inserts; the 5s default gives up partway through and
      // rolls back a restore that was working fine.
      { timeout: 300_000, maxWait: 30_000 }
    );

    const total = Object.values(restored).reduce((a, b) => a + b, 0);

    // 4. Say what landed, and check it against what the file claimed. A
    //    restore that silently drops rows is the failure worth catching.
    const shortfall = RESTORE_ORDER.filter(
      (t) => (restored[t] ?? 0) !== (payload.counts[t] ?? 0)
    );

    console.log(`\nRestored ${total} rows.`);
    if (shortfall.length > 0) {
      console.log("\nTables that did not restore in full:");
      for (const t of shortfall) {
        console.log(`  ${t}: ${restored[t] ?? 0} of ${payload.counts[t] ?? 0}`);
      }
      console.log(
        "\nRows already present are skipped rather than duplicated, so this is\n" +
          "expected when re-running against a database that was partly filled.\n" +
          "On a database that started empty, it is not — investigate before use."
      );
    }

    const users = await prisma.user.count();
    console.log(`\nSign-in accounts restored: ${users}`);
    console.log(
      users === 0
        ? "  No users in the file — you will not be able to sign in. Seed one with `npm run db:seed`."
        : "  Sign in with the same credentials as the install this backup came from."
    );
    console.log("\nDone.\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nProvisioning failed:\n" + (e instanceof Error ? e.message : String(e)) + "\n");
  process.exit(1);
});
