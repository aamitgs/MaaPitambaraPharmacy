export type StockLedgerType = "grn" | "sale" | "purchase_return" | "transfer_in" | "transfer_out";

const LEDGER_LABELS: Record<StockLedgerType, string> = {
  grn: "GRN receipt",
  sale: "Sale",
  purchase_return: "Purchase return",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

export function ledgerTypeLabel(type: StockLedgerType) {
  return LEDGER_LABELS[type];
}
