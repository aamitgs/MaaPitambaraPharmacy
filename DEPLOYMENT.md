# Deployment

This app runs in two places, and both are real:

- **The shop machine** — a single server on-site, `output: "standalone"`, local
  Postgres, local disk for uploads and backups. This is what keeps billing
  working when the internet is out.
- **A cloud host** — the same repository, deployed to Vercel. Shared access,
  no machine to look after, but an ephemeral filesystem and a UTC clock.

The build already adapts: `next.config.mjs` only emits the standalone server
when `VERCEL` is unset. Everything else is configuration.

---

## 1. Environment variables

### Required — nothing works without these

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Managed Postgres. **Neon and Supabase usually need `?sslmode=require`** — a correct-looking URL without it fails to connect. |
| `AUTH_SECRET` | `openssl rand -base64 32`. Sessions cannot be signed without it. |
| `BACKUP_ENCRYPTION_KEY` | **Must be the same value as the install whose backup you restore**, or the file will not decrypt. |

### Required on a cloud host specifically

| Variable | Why it is not optional here |
|---|---|
| `ATTACHMENT_S3_BUCKET` | Uploads go to local disk without it. A serverless filesystem is read-only apart from an ephemeral `/tmp`, so **prescriptions would appear to save and then vanish** — and those carry a three-year retention obligation. Also switches the nightly backup to the bucket. |
| `ATTACHMENT_S3_ENDPOINT` | Omit for AWS S3. Required for R2 / B2 / MinIO, e.g. `https://<accountid>.r2.cloudflarestorage.com` |
| `ATTACHMENT_S3_REGION` | `auto` for R2; a real region for AWS (`ap-south-1` for Mumbai). |
| `ATTACHMENT_S3_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | Omit both to fall back to the SDK credential chain (instance role). |
| `CRON_SECRET` | The platform scheduler sends `Authorization: Bearer $CRON_SECRET`. Without it the backup route returns 501 rather than running unauthenticated. |

Cloudflare R2 is the easier choice over S3 here: no egress fees, and invoice
PDFs pull the logo from the bucket on every render. **Keep the bucket
private** — files are served only through the authenticated `/api/files/...`
routes.

### Has a working default

| Variable | Default | |
|---|---|---|
| `PHARMACY_TIMEZONE` | `Asia/Kolkata` | Pinned at startup in `src/instrumentation.ts`, before the first request. Not cosmetic: business dates, GST periods and the month inside every document number are local calendar facts. On a UTC host without this, a bill rung up at 02:00 IST on the 1st is dated the previous day and numbered into the previous month. |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `15` | |
| `BACKUP_CRON_SECRET` | — | For a host-level cron on the shop machine (`x-backup-secret` header). The cloud path uses `CRON_SECRET` instead. |

### Optional integrations

`ANTHROPIC_API_KEY` (photo field extraction), `GUPSHUP_*` (WhatsApp),
`SMTP_*` (email), `GSP_*` (e-invoice / e-way bill). Each feature is inert
until its variables are set.

---

## 2. Provisioning the database

A newly created database is empty — no schema, no tenant, no accounts. The
in-app restore cannot fill it: that needs an owner session to authorise it
and an existing tenant row to update.

```bash
DATABASE_URL="postgresql://..." \
BACKUP_ENCRYPTION_KEY="<the key the file was written with>" \
npm run provision -- --backup ./backups/pharmacy-backup-....enc
```

This applies pending migrations (`prisma migrate deploy` — never `reset`,
never `dev`), recreates the tenant under its original id so nothing is
orphaned, writes every table back, and compares what landed against what the
file claimed.

- The file is **decrypted and validated before the database is touched**, so a
  wrong key or truncated file fails without leaving a half-provisioned
  install behind.
- It **refuses a database that already holds a pharmacy**. Use the in-app
  restore (Settings → Backup) for that. `--force` overrides, for a genuinely
  disposable database.
- **Re-running is safe** — existing rows are skipped, not duplicated.
- **Sign-in credentials come from the backup.** They are the same accounts as
  the install the file came from.

---

## 3. Verifying it worked

```bash
curl https://<your-deployment>/api/health
```

| Response | Meaning |
|---|---|
| `{"ok":true,"db":"up",...}` | The connection works. |
| `{"ok":false,"db":"down",...}` HTTP 503 | The app cannot reach a database. |

**`latencyMs` tells you which failure it is.** The probe runs `SELECT 1`:

- **2–10ms** — refused instantly, nothing listening. Almost always
  `DATABASE_URL` unset, so the driver falls back to `127.0.0.1:5432`.
- **hundreds of ms** — a real network attempt that failed: wrong host, wrong
  credentials, missing `sslmode=require`, or an IP allowlist.

> `SELECT 1` succeeds on a **completely empty database**. `ok:true` confirms
> the connection only — you still need to provision before anyone can sign in.

Then sign in. **The owner and pharmacist accounts both have TOTP enabled** and
need the authenticator app; the counter account does not, so it is the quicker
way to confirm a deployment works.

---

## 4. Troubleshooting

Every entry below is a failure this deployment actually hit.

**"The app could not start this page" with a reference number**
The root layout threw. Check `/api/health` first — a database outage is the
usual cause. The reference is a Next.js error digest; the real message is in
the host's runtime logs next to it.

**Login says the server cannot reach its database**
It means exactly that. The password is not being checked at all. Fix
`DATABASE_URL`, then provision.

**Login says "Incorrect email or password" and you are sure it is right**
On a current build this message is only shown when the database *was*
reachable and the password genuinely did not match. If the deployment is
older than `8d8bd22`, this message was also shown for a database outage.

**Build fails at `next-server.js.nft.json`**
`output: "standalone"` was left on for a cloud build. It is now conditional
on `VERCEL`; if you changed that, put it back.

**Build fails prerendering `/login` or `/_not-found` with a Prisma error**
Something DB-backed is being prerendered. Branding is kept out of the build
by `connection()` in `src/lib/branding.ts` — that call is load-bearing.

**Uploads succeed then the file is gone**
`ATTACHMENT_S3_BUCKET` is not set on a host with no durable disk.

**Uploads over ~4.5 MB are rejected**
A platform limit on request bodies, below this app's own 8 MB ceiling.
Phone photos routinely exceed it. Fixing this properly needs presigned
direct-to-bucket uploads, which is not built.

**The nightly backup logs success but there is no file**
Same cause as uploads. With a bucket configured the log records
`object_store`; without one it records `local`, which on a serverless host
means the file was discarded. Check Settings → Backup for which.

**Dates or invoice numbers are off by one day near midnight**
`PHARMACY_TIMEZONE` did not take. A wrong or unrecognised zone is reported
at startup — check the logs for `[startup]`.

**`Cannot read properties of undefined (reading 'findMany')`**
The generated Prisma client is stale. `prisma migrate dev` does not always
regenerate it; run `npx prisma generate` explicitly.

---

## 5. Backups

The nightly job runs at **20:30 UTC — 02:00 IST**, after closing, scheduled
in `vercel.json`. On the shop machine, use a host-level cron instead (see
README).

The destination follows where durable storage is: the bucket under a
`backups/` prefix when one is configured, local disk otherwise, and the log
records which. `maxDuration` is 60s because a function killed part-way writes
no log line at all — the backup does not happen and nothing says so.

**Keep `BACKUP_ENCRYPTION_KEY` somewhere other than the machine it protects.**
A backup file and its key are each useless alone.

---

## 6. What the counter does when the internet drops

Billing continues. Sales queue in the browser and sync when the connection
returns; stock conflicts surface for a human to reconcile rather than
silently overselling.

Two things worth knowing:

- **A device must load `/pos` once while online before it can survive an
  outage.** The service worker caches on use, so a brand-new device is not
  offline-capable out of the box.
- **The offline shell is production-only.** In development a cache in front
  of Turbopack's modules produces stale bundles that look like impossible
  bugs.

---

## 7. Still outstanding

Not code — these are decisions and credentials only you can supply:

- All three accounts are still on their installation passwords, and the
  manager PIN is still `1234`. (Verified against the database, not assumed.)
- Retail (`UP80200001841`) and wholesale (`UP80210001843`) drug licence expiry
  dates are blank — `licenseExpiryDates` holds only `fssai: 2029-01-26`.
- **No batch-wise stock has been imported.** 2,126 items, 0 batches. Billing
  cannot start without batch numbers and expiry dates — inventing them would
  disable the app's expiry blocking on real medicine.
- The function region defaults to the platform's, which may be far from the
  database. Every page issues several queries; if the deployment feels slow,
  this is the first thing to check.
