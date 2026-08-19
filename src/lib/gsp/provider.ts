import "server-only";

// Provider: a GSP-compliant e-invoice/e-way bill API, documented here
// against the request/response shape used by the NIC IRP schema that most
// Indian GSPs (ClearTax, MasterGST, Cygnet) wrap 1:1. To go live: sign up
// with a GSP (or apply for direct NIC IRP access), and set GSP_BASE_URL,
// GSP_API_KEY, and GSP_SELLER_GSTIN (see README). The exact field names
// below may need adjusting to match whichever specific GSP is provisioned
// — this is the standard shape, not a guarantee every provider matches it
// verbatim.

export interface EinvoiceLineItem {
  name: string;
  hsnCode: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
}

export interface EinvoiceRequest {
  invoiceNo: string;
  invoiceDate: string; // dd/mm/yyyy per IRP convention
  sellerGstin: string;
  buyerGstin?: string;
  buyerName?: string;
  totalValue: number;
  items: EinvoiceLineItem[];
}

export interface EinvoiceResult {
  success: boolean;
  irn?: string;
  ackNo?: string;
  qrData?: string;
  note?: string;
}

export interface EwayBillRequest {
  documentNo: string;
  documentDate: string; // dd/mm/yyyy
  sellerGstin: string;
  totalValue: number;
}

export interface EwayBillResult {
  success: boolean;
  ewayBillNo?: string;
  note?: string;
}

function gspConfig() {
  const baseUrl = process.env.GSP_BASE_URL;
  const apiKey = process.env.GSP_API_KEY;
  const sellerGstin = process.env.GSP_SELLER_GSTIN;
  if (!baseUrl || !apiKey || !sellerGstin) return null;
  return { baseUrl, apiKey, sellerGstin };
}

const NOT_CONFIGURED_NOTE =
  "E-invoice/e-way bill provider is not configured — set GSP_BASE_URL, GSP_API_KEY, and GSP_SELLER_GSTIN to enable generation.";

export async function generateEinvoice(req: EinvoiceRequest): Promise<EinvoiceResult> {
  const config = gspConfig();
  if (!config) return { success: false, note: NOT_CONFIGURED_NOTE };

  try {
    const res = await fetch(`${config.baseUrl}/einvoice/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, note: `GSP e-invoice error ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { irn?: string; ackNo?: string; qrData?: string };
    if (!data.irn) return { success: false, note: "GSP response did not include an IRN." };
    return { success: true, irn: data.irn, ackNo: data.ackNo, qrData: data.qrData };
  } catch (e) {
    return { success: false, note: e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed: unknown error" };
  }
}

export async function generateEwayBill(req: EwayBillRequest): Promise<EwayBillResult> {
  const config = gspConfig();
  if (!config) return { success: false, note: NOT_CONFIGURED_NOTE };

  try {
    const res = await fetch(`${config.baseUrl}/ewaybill/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, note: `GSP e-way bill error ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { ewayBillNo?: string };
    if (!data.ewayBillNo) return { success: false, note: "GSP response did not include an e-way bill number." };
    return { success: true, ewayBillNo: data.ewayBillNo };
  } catch (e) {
    return { success: false, note: e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed: unknown error" };
  }
}
