-- One distributor invoice can only be received once.
--
-- Scoped to the supplier, not global: two distributors independently
-- numbering an invoice "1024" is normal and must both be accepted.
CREATE UNIQUE INDEX "grns_tenantId_supplierId_supplierInvoiceNo_key"
  ON "grns"("tenantId", "supplierId", "supplierInvoiceNo");
