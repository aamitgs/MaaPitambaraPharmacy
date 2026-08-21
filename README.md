# Maa Pitambara Pharmacy — Billing & Inventory

**MAA PITAMBARA PHARMACY (MPP)**  
16, H.I.G. Shaheed Nagar, Agra, Uttar Pradesh 282001  
GSTIN `09APFPS2581C1ZT` · Ph +91 8010306757 · aamitgs@gmail.com

A GST-compliant, keyboard-first counter-billing system for a single-tenant
retail pharmacy — extended with the supply side (purchase orders, GRN,
purchase returns, supplier ledger) and with regulatory compliance (Schedule
X narcotic register, GST/HSN/GSTR-ready reporting, prescription capture +
pharmacist sign-off, license expiry tracking). See
[Scope](#scope--whats-not-here) for what's deliberately out of scope for now.

## Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **Zustand** for the POS cart
- **PostgreSQL** via **Prisma 7** (driver adapter: `@prisma/adapter-pg`)
- **NextAuth v5** (Credentials + TOTP-based MFA)
- Docker Compose for self-hosted deployment

## Getting started (local development)

Requires Node 20+ and a PostgreSQL 16 instance.

```bash
cp .env.example .env
# edit .env: set DATABASE_URL, generate NEXTAUTH_SECRET/AUTH_SECRET and
# BACKUP_ENCRYPTION_KEY (see the comments in .env.example for how)

npm install
npx prisma migrate deploy   # applies the existing migration
npm run db:seed             # creates a demo tenant, branch, users, items
npm run dev
```

Open http://localhost:3000. The seed script creates the Maa Pitambara
Pharmacy tenant and branch (name, address, GSTIN and PAN come from
`src/lib/brand.ts`), three starter accounts, and a handful of sample items —
then prints the logins and the manager PIN used for discount-cap overrides.
Re-run `npm run db:seed` any time; it's idempotent, and it re-applies the
brand identity without touching settings changed in the UI.

Before billing for real: change every seeded password and the manager PIN,
fill in the drug licence numbers and registered pharmacist under
**Branches → edit** (they print on every receipt and are left blank rather
than seeded with invented numbers), and delete the sample items and batches (the doctor record — Dr. Deepak Kumar Sharma, Mudgal Gastro Medics — is real, not sample data).
Set `SEED_OWNER_PASSWORD` in `.env` to avoid seeding the owner account —
which carries the pharmacy's registered email — with the default password.

Owner and pharmacist accounts are required to set up TOTP MFA on first
login (scan the QR code with any authenticator app). Counter staff MFA is
optional — it can be turned on from Settings → Security.

## Docker (self-hosted)

```bash
cp .env.example .env   # fill in real secrets — do not use the example values
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed   # optional, for a demo dataset
```

The app listens on port 3000. **TLS is expected to be terminated in front of
this container** (a reverse proxy — nginx, Caddy, Traefik, your cloud LB) —
the app itself does not serve HTTPS. Set `NEXTAUTH_URL` to the public HTTPS
URL your proxy exposes.

### Scheduled backups

The "Backup now" button in Settings works regardless of any of this. For an
unattended daily backup, point a host-level cron at the app container:

```cron
0 2 * * * curl -sf -X POST http://localhost:3000/api/backup/scheduled \
  -H "x-backup-secret: $BACKUP_CRON_SECRET"
```

This writes an encrypted export to the `backups/` volume (already declared
in `docker-compose.yml`) and logs the attempt the same way a manual backup
does — it'll show up in Settings and count toward the 48h staleness check on
the dashboard.

### Restoring a backup

Backup files are AES-256-GCM encrypted (`[12-byte IV][16-byte auth tag][ciphertext]`,
base64-encoded when downloaded from the browser). Decrypt with the same
`BACKUP_ENCRYPTION_KEY` used to create them:

```js
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"); // or base64
const payload = readFileSync("pharmacy-backup-....enc");
const iv = payload.subarray(0, 12);
const authTag = payload.subarray(12, 28);
const ciphertext = payload.subarray(28);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
```

The decrypted JSON contains the tenant's branches, items, batches,
customers, doctors, and invoices (with line items and discounts) as of the
export time. Restoring it back into the database isn't automated in Phase
1 — the export exists so the data is recoverable, not as a one-click
restore flow yet.

## Reading fields from a photo (optional)

Both the **Add item** and **Add supplier** forms have a *Fill from photo*
button that appears once a photo is attached. It sends the stored image to
Claude and fills in the blanks — brand name, generic name, manufacturer,
composition, schedule class, unit and pack size from a medicine carton; firm
name, GSTIN and address from a distributor's card, letterhead or cheque.

Set `ANTHROPIC_API_KEY` in `.env` to enable it. Unset, the button reports
"not configured" rather than failing — the same way the WhatsApp and GSP
integrations behave.

Three deliberate constraints, because this writes to a dispensing record:

- **It only fills blank fields.** Anything already typed is left alone.
- **Nothing is saved.** Extracted values land in the form as editable text;
  the row is written only when a person submits it.
- **It does not guess.** The prompt tells the model to return null for
  anything not plainly legible, so a smudged strength comes back empty
  rather than plausible — a blank is safe on a pharmacy record, a confident
  wrong value is not. Schedule class in particular is read from the Rx
  warning box on the pack, not inferred from the brand name.

### Reading a distributor invoice into a GRN

The GRN screen takes this further. Attach the distributor's bill and press
**Read items from bill**: the invoice header fills any blank invoice
number/date, and every product line is read into a **review dialog** before
anything touches the GRN.

Each scanned line arrives with its printed description shown verbatim, its
parsed batch/expiry/MRP/rate/qty editable, and a suggested item from your
master. Lines are added to the GRN draft only when you press Add, and only
if they have an item, a batch number, an expiry and a quantity — the rest
are listed as skipped. From there they are ordinary draft rows, saved by the
same code path (and the same stock/ledger transaction) as hand-keyed ones.

Two parts are deliberately **not** the model's job, because they are rules
rather than reading:

- **Dates** (`normalizeInvoiceDate`) — the model returns the expiry exactly
  as printed and code converts it. Pharma expiry is month-precision and the
  pack is good to the end of that month, so `06/27` becomes `2027-06-30`,
  while a manufacture date becomes the first of the month. Anything that
  doesn't parse cleanly comes back blank for the reviewer.
- **Item matching** (`matchItem`) — scored token overlap against your item
  master, run server-side; the model never sees the catalogue and never
  picks the item. Below half the words in common no match is offered at
  all, so a heavy abbreviation like `PCM 500 TAB` arrives blank for you to
  pick rather than silently matched to paracetamol. Matches under 0.8 are
  flagged "uncertain match" in the review dialog.

Both are pure functions in `src/lib/vision/invoice-lines.ts`.

The model is `claude-opus-5`, set as `MODEL` in `src/lib/vision/extract.ts`.
Roughly a cent per photo at current rates; switching that constant to
`claude-haiku-4-5` cuts it about fivefold if the packs you photograph turn
out to read easily. Extraction runs server-side only — the SDK and the key
never reach the browser.

## Sending a bill by SMS

A customer gets a short message with the invoice number, amount and date,
plus a link to their own read-only copy of the bill. SMS cannot carry a
PDF, which is why the link exists.

### DLT registration comes first (India)

This is not optional and not something the app can do for you. Since TRAI's
2021 regulation, every commercial SMS sent to an Indian number must be
matched against a template registered on a DLT (Distributed Ledger
Technology) platform. Operators silently drop anything that does not match
— the send appears to succeed and the message never arrives.

1. **Register the business** on any operator's DLT portal (Jio, Airtel,
   Vodafone Idea or BSNL — registering with one propagates to the others).
   You will need the pharmacy's GST certificate and a letter of
   authorisation.
2. **Register a header** (sender ID): six characters, e.g. `MPPHRM`.
3. **Register each template.** The exact text to paste is in
   `src/lib/sms/templates.ts` — copy it verbatim, `{#var#}` placeholders
   included. Changing that file without re-registering will get messages
   dropped by the operator, not by this code.
4. **Copy each template id** the portal issues into the matching env var.

### Environment

```bash
MSG91_AUTH_KEY=...              # from msg91.com
MSG91_SENDER_ID=MPPHRM          # the 6-character DLT header
SMS_TEMPLATE_ID_RECEIPT=...     # DLT id for the "receipt" template
SMS_TEMPLATE_ID_RECEIPT_LINK=...# DLT id for the receipt-with-link template
SMS_TEMPLATE_ID_REMINDER=...    # optional, for payment reminders
PUBLIC_BASE_URL=https://...     # where the bill link points; falls back to NEXTAUTH_URL
```

Unset, the Send by SMS button reports exactly which variables are missing
rather than failing silently. Settings → Integrations shows the same thing
at a glance.

MSG91 is the default provider because its flow API maps directly onto the
DLT model. Swapping to another (Gupshup, Kaleyra, Textlocal) means
rewriting `src/lib/sms/provider.ts` and nothing else — everything above it
deals in template keys and variables, never vendor payloads.

### Why the templates say "Rs" and not "₹"

SMS is billed per 160 characters in GSM-7. A single non-GSM character — a
rupee sign, a curly quote, an em dash — switches the whole message to UCS-2
at 70 characters per part, tripling the cost of every bill. There is a test
asserting each shipped template stays inside one GSM-7 segment.

### The public bill link

`/bill/<token>` is a read-only page showing one invoice, reachable without
signing in — the recipient has no account, so the token is the credential.

- 128-bit random token, generated only when a bill is first shared
- Serves `completed` bills only; a cancelled bill 404s
- `noindex, nofollow` so it never reaches a search engine
- No app navigation, no other invoice, no customer balance

The link goes out over SMS, which is not a confidential channel and may sit
in a phone's message log for years — hence a token long enough that
guessing is hopeless rather than a short code.

## Branding

Brand identity lives in two places, deliberately:

- **`src/lib/brand.ts`** — build-time strings: name, tagline, registered
  address/GSTIN/PAN, contact details, the receipt footer default, and the
  brand gold used for `theme-color` and the PWA manifest. This is what the
  browser tab, login card and installed-app name read, and what
  `prisma/seed.ts` writes into the tenant/branch rows.
- **The database** (`Tenant`, `Branch`) — everything printed on a document.
  Receipts, debit notes and reports read `Tenant.pharmacyName`,
  `Tenant.invoiceFooterText` and the `Branch` address/GSTIN/licence columns,
  all editable in the app, so a correction never needs a redeploy.

Visual assets:

| File | Used for |
| --- | --- |
| `src/components/brand-mark.tsx` | `BrandLockupHorizontal` (sidebar), `BrandLockup` (stacked, login screen), `BrandMark` (roundel alone, printed bills) |
| `public/logo-icon.png` | Master roundel, as supplied |
| `public/logo-stacked.png` | Roundel above the wordmark — login screen |
| `public/logo-horizontal.png` | Roundel beside the wordmark — the app sidebar |
| `src/app/icon.png` | Favicon (256px), via Next's icon file convention |
| `public/icon-192.png`, `public/icon-512.png` | PWA manifest icons |
| `src/app/globals.css` | Palette — `--brand-maroon` / `--brand-gold` / `--brand-cream`, taken from the logo, plus the shadcn tokens derived from them |

All of these derive from the supplied artwork; the favicon and PWA sizes are
resized copies of `logo-icon.png`, so regenerate them if the logo changes.
They are also listed in `PUBLIC_ASSETS` in `src/auth.config.ts` — without
that the middleware redirects them to `/login` and a signed-out tab loses
its favicon and login logo.

Palette (from the brand sheet — these hexes are the source of truth; the
CSS ships the same colours as oklch):

| Token | Hex | Role |
| --- | --- | --- |
| `--brand-maroon` | `#6E1B3A` | Wordmark, icon cross, headings, primary buttons |
| `--brand-maroon-light` | `#8A2447` | Secondary maroon |
| `--brand-gold` | `#D98E2B` | Logo tagline, accents, hover/highlight |
| `--brand-gold-light` | `#F4B942` | Gradients, secondary accents (the logo dots) |
| `--brand-gold-tint` | `#FDEBC7` | Hover fills, active nav, `--accent` |
| `--brand-cream` | `#FFF8EF` | Page background |
| — | `#FFFFFF` | Cards, sidebar |
| — | `#2A2A2A` | Body text (`--foreground`) |

**Gold is a surface colour, not a text colour.** Gold on cream measures
2.5:1, well under the 4.5:1 needed for body text, so gold appears as fills,
rules and accents only — the one exception is the logo tagline, which is
part of a logotype. Maroon on cream is 10.6:1 and white on maroon 11.2:1,
so type and buttons lead with maroon; that also holds the brand sheet's
70:30 maroon:gold ratio.

`Tenant.logoUrl` and `Tenant.primaryColor` exist in the schema but nothing
reads them yet — per-tenant white-labelling is still out of scope (see
[Scope](#scope--whats-not-here)); the brand is applied at build time.

## Security notes

- **TLS**: assumed to be terminated at the reverse proxy / load balancer in
  front of this app (see Docker section above). No app-level TLS handling.
- **Passwords**: hashed with bcrypt, never stored or logged in plaintext.
- **MFA**: TOTP secrets are stored in the database, never logged. Required
  for owner/pharmacist roles; optional for counter staff.
- **RBAC**: enforced server-side in every mutation (`requireRole()` /
  `requireSession()` in `src/lib/rbac.ts`), not just hidden in the UI —
  a counter-staff account calling an owner-only server action directly gets
  rejected regardless of what the client renders.
- **Audit log**: every price edit, stock adjustment, discount override,
  item import, and sale completion writes an `AuditLog` row with
  before/after values where applicable.
- **SQL injection**: all data access goes through Prisma's parameterized
  queries; there is no raw SQL in the application code.
- **Backups**: encrypted at rest (AES-256-GCM) before being written to disk
  or sent to the browser — see [Restoring a backup](#restoring-a-backup).
- **Session idle timeout**: configurable via `SESSION_IDLE_TIMEOUT_MINUTES`
  (default 15). Implemented as a sliding JWT expiry, not a hard
  server-tracked session store — acceptable for Phase 1's single-tenant
  scale, but worth knowing if you're auditing this.
- **Self-hosted auth trust**: `trustHost: true` is set in
  `src/auth.config.ts` because this app only ships as self-hosted Docker,
  never Vercel. This is safe *because* TLS termination and host validation
  are the reverse proxy's job — don't expose the app container directly to
  the internet without one.
- **Uploaded documents** (prescription photos; supplier invoices on a GRN,
  quotations on a purchase order and a supplier's card/cheque; item pack
  photos): stored on local disk under `PRESCRIPTION_STORAGE_DIR` (default
  `./storage/prescriptions`), `PURCHASE_INVOICE_STORAGE_DIR` (default
  `./storage/purchase-invoices`) and `ITEM_PHOTO_STORAGE_DIR` (default
  `./storage/item-photos`), all outside `public/`. That is the default and
  suits the single-server in-shop deployment.

  Set `ATTACHMENT_S3_BUCKET` (plus endpoint/region/keys — see `.env.example`)
  to store uploads in any S3-compatible bucket instead. **This is required on
  serverless hosts** such as Vercel, whose filesystem is read-only apart from
  an ephemeral `/tmp`: local writes there are discarded between requests, so
  an uploaded prescription would appear to save and then vanish — and
  prescriptions carry a three-year retention obligation. Stored paths are
  identical under both backends, so the same database row resolves either
  way. Keep the bucket private; files are still served only through the
  authenticated `/api/files/...` routes.

  One caveat when hosting behind a serverless platform: upload requests pass
  through the function, and platforms cap request bodies (Vercel at ~4.5 MB)
  below this app's own 8 MB limit. Large phone photos will be rejected by the
  platform before the app sees them; lifting that needs presigned
  direct-to-bucket uploads, which is not built yet.

  To use a different backend entirely, swap `src/lib/attachment-storage.ts`
  for an S3-compatible client if that ever changes. Each kind has its own
  root rather than sharing one with subdirectories: stored paths are
  relative to the root, so re-parenting them would invalidate every path
  already in the database. Files are only readable through the
  authenticated `/api/files/prescriptions/...` and
  `/api/files/purchase-invoices/...` and `/api/files/item-photos/...`
  routes, which cross-check the requesting user's tenant against the sales
  invoice, GRN, purchase order, supplier or item the path is attached to
  rather than trusting the URL. Uploads are capped at 8 MB and limited
  to JPEG/PNG/WEBP/PDF; writing a supplier-invoice file additionally
  requires the Owner/Pharmacist role that may create a GRN. Back these
  directories up alongside the database if you rely on them for compliance
  records.

## Purchase & Inventory (Phase 2)

Extends the Phase 1 billing flow with the supply side, without changing it:

- **Suppliers** (`/suppliers`): name/GSTIN/address/payment-terms CRUD, plus a
  detail view with a running ledger and an outstanding balance that's always
  computed as `SUM(SupplierLedgerEntry.amount)` — never trusted from a cached
  column. Manual payments can be recorded against a supplier (amount + note).
- **Purchase orders** (`/purchase-orders`, optional): supplier + line items
  (item/qty/rate), draft → sent → received/cancelled status. A PO is never
  required before a GRN. The quotation or order sheet it was keyed in from
  can be attached as a photo/PDF the same way, shown as "Quotation" on the
  PO detail screen.
- **GRN — goods received** (`/grn`): the main daily-use screen. A fast
  repeated row-entry bar (item search → batch no. → mfg/expiry dates → MRP →
  rate → qty) where Enter commits a row and moves to the next; mfg date,
  expiry date, MRP, and rate carry forward between rows since a distributor
  invoice often repeats them, while item/batch no./qty always clear. Past
  expiry and MRP-below-rate show as inline non-blocking warnings, not
  errors. Saving creates/updates the matching `Batch` (matched by item +
  batch no.), increments its stock, writes a `SupplierLedgerEntry`, and — if
  linked to a PO — marks it received. Stock is visible in the POS batch
  picker immediately after saving. The distributor's bill can be attached as
  a photo or PDF while entering the GRN (`capture="environment"`, so a phone
  opens the camera straight away) and is reachable afterwards from the GRN
  detail screen.
- **Purchase returns** (`/purchase-returns`): from a GRN's "Return items"
  link or standalone. Select item + batch + qty + an overall reason;
  decrements `Batch.currentQty` (rejected server-side if it exceeds current
  stock) and writes a negative `SupplierLedgerEntry`. Detail view renders a
  printable (A4) debit note.
- **Alerts** (`/alerts`, linked from the dashboard): low-stock items (with
  last purchase rate/supplier for reorder reference) and near-expiry/expired
  batches, reusing the same `nearExpiryWindowDays` tenant setting Phase 1's
  in-list badges use. Each low-stock row links directly into GRN entry,
  pre-filled with that item.

## Compliance (Phase 3)

- **Narcotic / Schedule X register** (`/reports/narcotic-register`,
  Owner/Pharmacist only): every Schedule X sale writes a
  `NarcoticRegisterEntry` automatically inside the same transaction as the
  sale. Insert-only at the application level — there are no update/delete
  actions for it. Corrections are a separate linked reversal row
  (`reversalOfId`), never an edit to the original, so the register stays a
  faithful record of what was actually dispensed. Listed oldest-first (a
  bound register is read top to bottom), with CSV export and an A4-landscape
  print view for inspection.
- **GST invoice formatting**: receipts show CGST/SGST as two separate
  amounts (per line and in the total) instead of one combined figure,
  re-deriving the intra-state 50/50 split `billing.ts` already computes —
  no new stored value. An **HSN-wise summary** report (`/reports/hsn-summary`)
  aggregates taxable value/tax by HSN code and rate for a selected period,
  with CSV export.
- **GSTR-1 / GSTR-3B export** (`/reports/gstr-export`, Owner/Pharmacist
  only): three CSVs an accountant can use directly — GSTR-1 Table 7 (B2C
  small, by place-of-supply and rate), GSTR-1 Table 12 (HSN summary, in the
  offline tool's column layout), and GSTR-3B Table 3.1 (outward-supplies
  summary). No GST portal API integration — output only. No B2B sheet:
  `Customer` has no GSTIN field in this schema (walk-in retail only), so
  every sale is inherently B2C.
- **Prescription capture + pharmacist sign-off**: optional prescription
  photo upload on Schedule H/H1/X sales (see
  [Security notes](#security-notes) for how images are stored). A
  Pharmacist or Owner at the till signs off via their own session
  automatically; Counter Staff must have a Pharmacist/Owner re-authenticate
  (email + password) in a dialog before the sale finalizes —
  `completeSale` re-verifies those credentials server-side rather than
  trusting the client.
- **License expiry tracking**: a Compliance tab in Settings
  (Owner/Pharmacist only) captures each license's number and expiry date
  (retail/wholesale drug license, narcotic license, FSSAI registration) and
  a configurable renewal-warning window (default 60 days). Surfaced on the
  *existing* Alerts screen (a "License renewals" section, not a separate
  screen) and as a dashboard banner, with severity escalating from
  "upcoming" to "urgent" (≤15 days) to "expired". A license lapse is a
  warning, not a billing block — that's a deliberate business decision to
  revisit later, not an oversight.

## Integrations & offline hardening (Phase 5)

- **Credit customer ledger**: `Customer.outstandingBalance` is now a cache
  column only — the real balance is `SUM(CustomerLedgerEntry.amount)`
  (mirrors the Supplier ledger from Phase 2). Every credit sale writes a
  `sale` entry; a customer detail page (`/customers/[id]`) lets staff
  record `payment` entries and view a printable, CSV-exportable statement
  of account (`/customers/[id]/statement`) with opening/closing balance.
- **WhatsApp receipt/statement delivery**: uses
  [Gupshup](https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation)'s
  WhatsApp Business API. Set `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE_NUMBER`, and
  `GUPSHUP_APP_NAME` (see `.env.example`) to send automatically.

  **Without those credentials the button still works**: it opens a `wa.me`
  deep link with the same message pre-filled, in the staff member's own
  WhatsApp, for them to press send. That needs no Meta business
  verification, no template approval and no per-message fee — which matters
  for a single pharmacy that may never want a Business API account. The
  attempt is logged with status `handed_off` rather than `sent`, because the
  app cannot confirm delivery once the message leaves for WhatsApp. Setting
  the Gupshup credentials switches the same button to automatic sending with
  no other change. **What's actually sent is a formatted text
  summary, not a PDF/image attachment** — this app's other "PDF" exports
  are all browser print-to-PDF (no server-side document rendering exists
  anywhere in the codebase), so there's no pipeline to attach a receipt
  image to a WhatsApp message yet. Adding one (headless rendering + hosting
  the resulting file for Gupshup's document-message API) is a real,
  reasonably-sized follow-up, not something faked here.
- **Invoice PDF**: a real server-rendered A5 bill (`/api/invoices/[id]/pdf`,
  tenant-checked), offered as a **PDF** button on the receipt screen and
  attached automatically to emailed receipts when SMTP is configured. Built
  with `@react-pdf/renderer` rather than headless Chrome so a self-hosted
  container needs no browser.

  Two consequences worth knowing. The layout in `src/lib/pdf/invoice-pdf.tsx`
  **re-declares** the A5 bill — react-pdf renders its own primitives, so it
  cannot share a tree with the HTML `ReceiptView`; the two are kept in step
  by hand. And amounts read `Rs.` rather than `₹`: react-pdf's built-in
  Helvetica has no rupee glyph and would print a blank box. Registering a
  Unicode font (Noto Sans, OFL) in `render-invoice.tsx` and bundling the TTF
  fixes that.

  **WhatsApp cannot carry the attachment.** A `wa.me` deep link takes text
  only, and Gupshup's document API needs a publicly reachable URL to fetch
  the file from — a LAN-hosted app has none. Staff download the PDF and
  attach it by hand; the mailto: fallback downloads it for them
  automatically for the same reason.

- **Email receipt/statement delivery**: same two-mode design as WhatsApp.
  Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`
  (see `.env.example`) to send through SMTP — a Gmail account needs an app
  password, not the account password. Without them the "Send via Email"
  button opens the message in whatever mail client the counter machine has,
  via a `mailto:` link, and logs the attempt as `handed_off`. Sends the same
  itemised text summary as WhatsApp, not a PDF attachment.

  `EmailLog` is a separate table from `WhatsAppLog` rather than one generic
  message log: the WhatsApp table already holds live rows, and collapsing
  the two would mean migrating production data for symmetry alone. Worth
  generalising if a third channel ever appears.

- **E-invoice (IRN) & e-way bill generation**: against a GSP (GST Suvidha
  Provider) API compatible with the NIC IRP schema most Indian GSPs
  (ClearTax, MasterGST, Cygnet) wrap — set `GSP_BASE_URL`, `GSP_API_KEY`,
  and `GSP_SELLER_GSTIN` (see `.env.example`) once a provider account is
  provisioned; unset, generation attempts report "not configured".
  E-invoicing is gated by a per-branch `einvoiceEnabled` toggle
  (Branch edit screen) standing in for the turnover-threshold check, since
  that threshold is government policy that changes over time, not a
  constant to hardcode. E-way bill generation is gated by a configurable
  per-branch value threshold (`ewayBillThreshold`, default ₹50,000) — value
  only; distance-based thresholds aren't implemented since nothing in this
  app calculates distance (no geocoding). Both calls are fire-and-forget
  after the sale/GRN transaction already committed — never awaited by the
  checkout or GRN-save response — so a slow or down GSP adds zero latency
  to the counter. A failed attempt leaves the IRN/e-way bill number null;
  a "Generate e-invoice" / "Generate e-way bill" button appears on the
  receipt (and GRN detail) screen to retry manually. A successful IRN
  renders as a QR code (via the `qrcode` package, same one used for MFA
  setup) directly on the printed receipt.
- **Offline-first POS billing**: scoped specifically to the billing screen
  and printing, not the whole app. A `navigator.onLine`-plus-real-ping
  check (`/api/health`) drives a persistent, unmissable status bar — never
  a dismissible toast — showing "Offline — N bills pending sync." While
  offline, item search keeps working off the already-loaded catalog
  (backed by an IndexedDB cache, via Dexie, refreshed on load and every 3
  minutes while online, so a long-open tab survives a reload mid-shift
  too), and completing a sale writes it to an IndexedDB queue instead of
  calling the server, immediately showing a locally-rendered, printable
  receipt built entirely from client-side state — no round-trip. On
  reconnection the queue replays automatically, in order, against the same
  `completeSale` action used online (idempotent via a client-generated
  `offlineClientId`, so a retried sync can't double-bill); a batch sold
  below available stock by another terminal in the meantime surfaces as a
  distinct "conflict" in the queue panel for manual reconciliation, never
  silently oversold or dropped. **Deliberately blocked while offline**
  (each needs a real-time server check that can't be safely approximated
  from cached state): credit-mode sales (ledger validation), a discount
  above the staff cap (manager PIN verification), and prescription sales
  for non-pharmacist/owner roles (pharmacist re-auth) — each shows a clear
  inline reason rather than silently failing or behaving unsafely. Live-
  verified end to end via Playwright with `context.setOffline()`: item
  search and cart entry while offline, the offline receipt overlay,
  automatic sync on reconnection, and a real stock-conflict surfaced
  correctly (one of two queued sales for the same nearly-out-of-stock
  batch synced, the other flagged, stock never went negative).

## Scope / what's not here

Deliberately out of scope for Phases 1–3 (see the original build specs for
the full lists): multi-tenant signup/billing, direct GST portal
API/e-invoicing/e-way bill integration, purchase scheme tracking (treated
as a manual rate adjustment, not a modeled entity), landed cost
calculation (GRN rate is a flat per-unit rate), multi-branch transfers,
supplier payment gateway/bank integration (manual ledger entry only),
scheme/loyalty discounts, cloud backup, Marg/Vyapar importers, Hospital
Mode, white-labeling beyond the basic logo/color/footer fields, AI
features, real payment gateway integration, SMS/WhatsApp notifications,
and multi-state GSTIN/IGST logic beyond the basic intra-state assumption.
The CSV import pipeline (`src/lib/import/`) is structured in independent
stages — parse → map → validate → commit — specifically so a
platform-specific pre-parser could be dropped in ahead of
`validate`/`commit` in a later phase without touching those two stages.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run a production build (`next start`) |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm run db:seed` | Seed demo tenant/branch/users/items (idempotent) |
| `npx prisma studio` | Browse the database |
| `npx prisma migrate dev` | Create/apply a migration in development |

## Project structure

```
prisma/schema.prisma       Database schema (every table carries tenantId)
prisma.config.ts           Prisma 7 config (datasource URL, migrations path)
src/auth.ts, auth.config.ts  NextAuth v5 setup (auth.config.ts is Edge-safe,
                              used by src/proxy.ts; auth.ts adds the
                              Credentials provider + Prisma/bcrypt)
src/lib/actions/           Server actions (one file per feature area)
src/lib/billing.ts         Shared GST/discount math (client + server)
src/lib/serialize.ts       Decimal -> number conversion for RSC boundaries
src/components/pos/        The POS billing screen
src/components/receipt/    Thermal (58/80mm) + A4 receipt renderer
src/components/purchasing/ Supplier/PO/GRN/return forms and detail views
src/lib/import/            CSV import pipeline (parse/map/validate stages)
```
