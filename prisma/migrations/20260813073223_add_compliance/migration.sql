-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "fssaiNo" TEXT,
ADD COLUMN     "licenseExpiryDates" JSONB,
ADD COLUMN     "narcoticLicenseNo" TEXT;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "pharmacistSignoffAt" TIMESTAMP(3),
ADD COLUMN     "pharmacistSignoffUserId" TEXT,
ADD COLUMN     "prescriptionImageUrl" TEXT;

-- CreateTable
CREATE TABLE "narcotic_register_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "doctorId" TEXT,
    "patientName" TEXT,
    "dispensedByUserId" TEXT NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfId" TEXT,

    CONSTRAINT "narcotic_register_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "narcotic_register_entries_reversalOfId_key" ON "narcotic_register_entries"("reversalOfId");

-- CreateIndex
CREATE INDEX "narcotic_register_entries_tenantId_idx" ON "narcotic_register_entries"("tenantId");

-- CreateIndex
CREATE INDEX "narcotic_register_entries_tenantId_dispensedAt_idx" ON "narcotic_register_entries"("tenantId", "dispensedAt");

-- CreateIndex
CREATE INDEX "narcotic_register_entries_invoiceId_idx" ON "narcotic_register_entries"("invoiceId");

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_pharmacistSignoffUserId_fkey" FOREIGN KEY ("pharmacistSignoffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_dispensedByUserId_fkey" FOREIGN KEY ("dispensedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narcotic_register_entries" ADD CONSTRAINT "narcotic_register_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "narcotic_register_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
