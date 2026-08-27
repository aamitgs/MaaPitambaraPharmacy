-- AlterTable
ALTER TABLE "items" ADD COLUMN     "distributorId" TEXT;

-- CreateIndex
CREATE INDEX "items_distributorId_idx" ON "items"("distributorId");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
