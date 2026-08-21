-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "looseUnits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "allowLooseSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitsPerPack" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "isLooseSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitsPerPack" INTEGER NOT NULL DEFAULT 1;
