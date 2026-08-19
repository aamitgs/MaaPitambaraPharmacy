/*
  Warnings:

  - Added the required column `branchId` to the `batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `grns` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('pending', 'approved', 'completed', 'rejected');

-- AlterTable (nullable first — backfilled below, then enforced NOT NULL)
ALTER TABLE "batches" ADD COLUMN     "branchId" TEXT;

-- AlterTable (nullable first — backfilled below, then enforced NOT NULL)
ALTER TABLE "grns" ADD COLUMN     "branchId" TEXT;

-- Backfill: every tenant had exactly one Branch before Phase 4, so every
-- existing Grn/Batch belongs to that tenant's sole branch.
UPDATE "grns" g
SET "branchId" = (SELECT b.id FROM "branches" b WHERE b."tenantId" = g."tenantId" LIMIT 1);

UPDATE "batches" bt
SET "branchId" = (
  SELECT b.id FROM "branches" b
  JOIN "items" i ON i."tenantId" = b."tenantId"
  WHERE i.id = bt."itemId"
  LIMIT 1
);

ALTER TABLE "grns" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "batches" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'pending',
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_tenantId_idx" ON "stock_transfers"("tenantId");

-- CreateIndex
CREATE INDEX "stock_transfers_tenantId_status_idx" ON "stock_transfers"("tenantId", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_fromBranchId_idx" ON "stock_transfers"("fromBranchId");

-- CreateIndex
CREATE INDEX "stock_transfers_toBranchId_idx" ON "stock_transfers"("toBranchId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "batches_branchId_idx" ON "batches"("branchId");

-- CreateIndex
CREATE INDEX "batches_branchId_itemId_batchNo_idx" ON "batches"("branchId", "itemId", "batchNo");

-- CreateIndex
CREATE INDEX "grns_branchId_idx" ON "grns"("branchId");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
