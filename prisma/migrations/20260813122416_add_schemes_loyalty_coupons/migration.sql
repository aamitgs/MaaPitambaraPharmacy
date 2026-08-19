-- CreateEnum
CREATE TYPE "SchemeType" AS ENUM ('percent_off', 'buy_x_get_y');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('percent', 'flat');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DiscountType" ADD VALUE 'scheme';
ALTER TYPE "DiscountType" ADD VALUE 'loyalty';
ALTER TYPE "DiscountType" ADD VALUE 'coupon';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "cumulativeSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyTierId" TEXT;

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "schemeId" TEXT;

-- CreateTable
CREATE TABLE "schemes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SchemeType" NOT NULL,
    "config" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minCumulativeSpend" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "singleUsePerCustomer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schemes_tenantId_idx" ON "schemes"("tenantId");

-- CreateIndex
CREATE INDEX "schemes_tenantId_active_idx" ON "schemes"("tenantId", "active");

-- CreateIndex
CREATE INDEX "loyalty_tiers_tenantId_idx" ON "loyalty_tiers"("tenantId");

-- CreateIndex
CREATE INDEX "coupons_tenantId_idx" ON "coupons"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_tenantId_code_key" ON "coupons"("tenantId", "code");

-- CreateIndex
CREATE INDEX "customers_loyaltyTierId_idx" ON "customers"("loyaltyTierId");

-- CreateIndex
CREATE INDEX "discounts_schemeId_idx" ON "discounts"("schemeId");

-- CreateIndex
CREATE INDEX "discounts_couponId_idx" ON "discounts"("couponId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_loyaltyTierId_fkey" FOREIGN KEY ("loyaltyTierId") REFERENCES "loyalty_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tiers" ADD CONSTRAINT "loyalty_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
