-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('receipt', 'statement', 'reminder');

-- CreateEnum
CREATE TYPE "WhatsAppStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "whatsapp_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "phone" TEXT NOT NULL,
    "messageType" "WhatsAppMessageType" NOT NULL,
    "status" "WhatsAppStatus" NOT NULL,
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_logs_tenantId_idx" ON "whatsapp_logs"("tenantId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_customerId_idx" ON "whatsapp_logs"("customerId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_invoiceId_idx" ON "whatsapp_logs"("invoiceId");

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
