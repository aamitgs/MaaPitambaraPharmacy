-- CreateTable
CREATE TABLE "salt_aliases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salt_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salt_aliases_tenantId_idx" ON "salt_aliases"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "salt_aliases_tenantId_alias_key" ON "salt_aliases"("tenantId", "alias");

-- AddForeignKey
ALTER TABLE "salt_aliases" ADD CONSTRAINT "salt_aliases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
