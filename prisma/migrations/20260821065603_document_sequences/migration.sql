-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_tenantId_prefix_periodKey_key" ON "document_sequences"("tenantId", "prefix", "periodKey");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from documents already issued.
--
-- Without this the counter would start at zero and immediately hand out
-- numbers that are already on real invoices, which the unique index would
-- then reject — every sale failing until someone worked out why. Seeded from
-- MAX rather than COUNT so a cancelled or deleted document never causes a
-- number to be handed out twice.
--
-- Only well-formed PREFIX-YYYYMM-NNNN values are considered; anything else
-- was not issued by this counter and must not move it.
INSERT INTO "document_sequences" ("id", "tenantId", "prefix", "periodKey", "lastNumber", "updatedAt")
SELECT
    gen_random_uuid()::text,
    src."tenantId",
    src.prefix,
    split_part(src.no, '-', 2),
    MAX(split_part(src.no, '-', 3)::int),
    NOW()
FROM (
    SELECT "tenantId", 'INV' AS prefix, "invoiceNo"    AS no FROM "sales_invoices"     WHERE "invoiceNo"    ~ '^INV-[0-9]{6}-[0-9]+$'
    UNION ALL
    SELECT "tenantId", 'CN'  AS prefix, "returnNo"     AS no FROM "sales_returns"      WHERE "returnNo"     ~ '^CN-[0-9]{6}-[0-9]+$'
    UNION ALL
    SELECT "tenantId", 'ADJ' AS prefix, "adjustmentNo" AS no FROM "stock_adjustments"  WHERE "adjustmentNo" ~ '^ADJ-[0-9]{6}-[0-9]+$'
    UNION ALL
    SELECT "tenantId", 'CNT' AS prefix, "countNo"      AS no FROM "stock_counts"       WHERE "countNo"      ~ '^CNT-[0-9]{6}-[0-9]+$'
) AS src
GROUP BY src."tenantId", src.prefix, split_part(src.no, '-', 2);
