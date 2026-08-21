-- CreateTable
CREATE TABLE "cash_ups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingFloat" DECIMAL(12,2) NOT NULL,
    "cashSales" DECIMAL(12,2) NOT NULL,
    "upiSales" DECIMAL(12,2) NOT NULL,
    "cardSales" DECIMAL(12,2) NOT NULL,
    "creditSales" DECIMAL(12,2) NOT NULL,
    "cashRefunds" DECIMAL(12,2) NOT NULL,
    "otherRefunds" DECIMAL(12,2) NOT NULL,
    "expectedCash" DECIMAL(12,2) NOT NULL,
    "countedCash" DECIMAL(12,2) NOT NULL,
    "variance" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "countedByUserId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_ups_tenantId_closedAt_idx" ON "cash_ups"("tenantId", "closedAt");

-- AddForeignKey
ALTER TABLE "cash_ups" ADD CONSTRAINT "cash_ups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ups" ADD CONSTRAINT "cash_ups_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ups" ADD CONSTRAINT "cash_ups_countedByUserId_fkey" FOREIGN KEY ("countedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
