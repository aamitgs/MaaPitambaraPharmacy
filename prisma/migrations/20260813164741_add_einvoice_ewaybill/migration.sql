-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "einvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ewayBillThreshold" DECIMAL(12,2) NOT NULL DEFAULT 50000;

-- AlterTable
ALTER TABLE "grns" ADD COLUMN     "ewayBillNo" TEXT;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "einvoiceAckNo" TEXT,
ADD COLUMN     "einvoiceIrn" TEXT,
ADD COLUMN     "einvoiceQrData" TEXT,
ADD COLUMN     "ewayBillNo" TEXT;
