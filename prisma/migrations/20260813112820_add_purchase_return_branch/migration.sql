/*
  Warnings:

  - Added the required column `branchId` to the `purchase_returns` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable (nullable first — backfilled below, then enforced NOT NULL)
ALTER TABLE "purchase_returns" ADD COLUMN     "branchId" TEXT;

-- Backfill from the linked GRN's branch where one exists, else the
-- tenant's sole pre-Phase-4 branch.
UPDATE "purchase_returns" pr
SET "branchId" = COALESCE(
  (SELECT g."branchId" FROM "grns" g WHERE g.id = pr."grnId"),
  (SELECT b.id FROM "branches" b WHERE b."tenantId" = pr."tenantId" LIMIT 1)
);

ALTER TABLE "purchase_returns" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "purchase_returns_branchId_idx" ON "purchase_returns"("branchId");

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
