export type StockLedgerType =
  | "grn"
  | "sale"
  | "sales_return"
  | "purchase_return"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

const LEDGER_LABELS: Record<StockLedgerType, string> = {
  grn: "GRN receipt",
  sale: "Sale",
  sales_return: "Customer return",
  purchase_return: "Purchase return",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  adjustment: "Adjustment",
};

export function ledgerTypeLabel(type: StockLedgerType) {
  return LEDGER_LABELS[type];
}
