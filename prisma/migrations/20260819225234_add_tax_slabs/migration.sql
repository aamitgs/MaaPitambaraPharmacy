-- AlterTable
ALTER TABLE "items" ADD COLUMN     "taxSlabId" TEXT;

-- CreateTable
CREATE TABLE "tax_slabs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_slab_rates" (
    "id" TEXT NOT NULL,
    "slabId" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_slab_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hsn_tax_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "slabId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hsn_tax_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_slabs_tenantId_idx" ON "tax_slabs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_slabs_tenantId_name_key" ON "tax_slabs"("tenantId", "name");

-- CreateIndex
CREATE INDEX "tax_slab_rates_slabId_idx" ON "tax_slab_rates"("slabId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_slab_rates_slabId_effectiveFrom_key" ON "tax_slab_rates"("slabId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "hsn_tax_mappings_tenantId_idx" ON "hsn_tax_mappings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "hsn_tax_mappings_tenantId_hsnCode_key" ON "hsn_tax_mappings"("tenantId", "hsnCode");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_taxSlabId_fkey" FOREIGN KEY ("taxSlabId") REFERENCES "tax_slabs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_slabs" ADD CONSTRAINT "tax_slabs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_slab_rates" ADD CONSTRAINT "tax_slab_rates_slabId_fkey" FOREIGN KEY ("slabId") REFERENCES "tax_slabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_slab_rates" ADD CONSTRAINT "tax_slab_rates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsn_tax_mappings" ADD CONSTRAINT "hsn_tax_mappings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hsn_tax_mappings" ADD CONSTRAINT "hsn_tax_mappings_slabId_fkey" FOREIGN KEY ("slabId") REFERENCES "tax_slabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
