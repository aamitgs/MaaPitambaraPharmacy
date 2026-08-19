-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('sent', 'failed', 'handed_off');

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "toAddress" TEXT NOT NULL,
    "messageType" "WhatsAppMessageType" NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_tenantId_idx" ON "email_logs"("tenantId");

-- CreateIndex
CREATE INDEX "email_logs_customerId_idx" ON "email_logs"("customerId");

-- CreateIndex
CREATE INDEX "email_logs_invoiceId_idx" ON "email_logs"("invoiceId");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
