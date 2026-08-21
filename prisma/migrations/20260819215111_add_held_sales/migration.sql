-- CreateTable
CREATE TABLE "held_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cart" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "estimatedTotal" DECIMAL(12,2) NOT NULL,
    "heldByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "held_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "held_sales_tenantId_branchId_createdAt_idx" ON "held_sales"("tenantId", "branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_heldByUserId_fkey" FOREIGN KEY ("heldByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
