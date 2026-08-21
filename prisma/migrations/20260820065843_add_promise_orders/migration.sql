-- CreateEnum
CREATE TYPE "PromiseOrderStatus" AS ENUM ('open', 'fulfilled', 'cancelled');

-- CreateTable
CREATE TABLE "promise_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "itemId" TEXT,
    "requestedName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "customerId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "status" "PromiseOrderStatus" NOT NULL DEFAULT 'open',
    "notifiedAt" TIMESTAMP(3),
    "fulfilledInvoiceId" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "takenByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promise_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promise_orders_tenantId_status_idx" ON "promise_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "promise_orders_itemId_idx" ON "promise_orders"("itemId");

-- AddForeignKey
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_fulfilledInvoiceId_fkey" FOREIGN KEY ("fulfilledInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promise_orders" ADD CONSTRAINT "promise_orders_takenByUserId_fkey" FOREIGN KEY ("takenByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
