-- CreateEnum
CREATE TYPE "CustomerLedgerEntryType" AS ENUM ('sale', 'payment');

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "outstandingBalance" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "customer_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CustomerLedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_ledger_entries_tenantId_idx" ON "customer_ledger_entries"("tenantId");

-- CreateIndex
CREATE INDEX "customer_ledger_entries_customerId_createdAt_idx" ON "customer_ledger_entries"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "customer_ledger_entries" ADD CONSTRAINT "customer_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ledger_entries" ADD CONSTRAINT "customer_ledger_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Customer.outstandingBalance was previously incremented directly
-- by completeSale on every credit-mode sale (Phase 1-4). Now that the real
-- balance is derived from customer_ledger_entries, write one "sale" entry
-- per historical completed credit invoice so existing customer debt isn't
-- silently zeroed out by the switch to the ledger.
INSERT INTO "customer_ledger_entries" ("id", "tenantId", "customerId", "type", "amount", "referenceId", "referenceType", "note", "createdAt")
SELECT
  'backfill_' || si."id",
  si."tenantId",
  si."customerId",
  'sale',
  si."total",
  si."id",
  'SalesInvoice',
  'Backfilled from pre-ledger outstandingBalance',
  si."invoiceDate"
FROM "sales_invoices" si
WHERE si."paymentMode" = 'credit'
  AND si."customerId" IS NOT NULL
  AND si."status" = 'completed';
