/*
  Warnings:

  - You are about to drop the column `logoUrl` on the `tenants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "logoUrl",
ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "brandDescription" TEXT,
ADD COLUMN     "brandShortName" TEXT,
ADD COLUMN     "brandTagline" TEXT,
ADD COLUMN     "brandingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "hoursHeadline" TEXT,
ADD COLUMN     "hoursNote" TEXT,
ADD COLUMN     "invoiceHeaderText" TEXT,
ADD COLUMN     "invoicePaperDefault" TEXT,
ADD COLUMN     "logoHorizontalUrl" TEXT,
ADD COLUMN     "logoIconUrl" TEXT,
ADD COLUMN     "logoStackedUrl" TEXT,
ADD COLUMN     "showLogoOnInvoice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "supportEmail" TEXT,
ADD COLUMN     "surfaceColor" TEXT,
ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "websiteUrl" TEXT;
