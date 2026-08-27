-- AlterTable
ALTER TABLE "items" ADD COLUMN     "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "items_supplierId_idx" ON "items"("supplierId");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
