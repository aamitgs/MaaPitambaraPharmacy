-- Barcode on the item master. Nullable: most Indian pharmacy stock is keyed
-- by name, and only some packs carry a scannable EAN/UPC.
ALTER TABLE "items" ADD COLUMN "barcode" TEXT;

-- Unique per tenant so a scan resolves to exactly one item. Postgres treats
-- NULLs as distinct in a unique index, so every un-barcoded item coexists.
CREATE UNIQUE INDEX "items_tenantId_barcode_key" ON "items"("tenantId", "barcode");
CREATE INDEX "items_tenantId_barcode_idx" ON "items"("tenantId", "barcode");
