-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN "offlineClientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_offlineClientId_key" ON "sales_invoices"("offlineClientId");
