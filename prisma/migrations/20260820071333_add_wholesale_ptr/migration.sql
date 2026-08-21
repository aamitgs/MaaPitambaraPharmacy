-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('mrp', 'ptr');

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "ptr" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "priceBasis" "PriceBasis" NOT NULL DEFAULT 'mrp';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "wholesaleBillingEnabled" BOOLEAN NOT NULL DEFAULT false;
