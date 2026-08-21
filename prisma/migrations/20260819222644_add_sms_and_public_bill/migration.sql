-- SMS delivery log, mirroring whatsapp_logs.
CREATE TYPE "SmsMessageType" AS ENUM ('receipt', 'statement', 'reminder');
CREATE TYPE "SmsStatus" AS ENUM ('sent', 'failed');

CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "phone" TEXT NOT NULL,
    "messageType" "SmsMessageType" NOT NULL,
    "status" "SmsStatus" NOT NULL,
    "note" TEXT,
    "templateKey" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_logs_tenantId_idx" ON "sms_logs"("tenantId");
CREATE INDEX "sms_logs_invoiceId_idx" ON "sms_logs"("invoiceId");

ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Public share token for the read-only bill page. Nullable and unique:
-- Postgres treats NULLs as distinct, so unshared bills coexist freely.
ALTER TABLE "sales_invoices" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "sales_invoices_publicToken_key" ON "sales_invoices"("publicToken");
