import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf } from "./invoice-pdf";
import type { ReceiptData } from "@/lib/actions/invoices";
import { getBranding } from "@/lib/branding";
import { readAttachment } from "@/lib/attachment-storage";

/**
 * react-pdf needs image bytes, not a URL — it renders outside the browser,
 * so it cannot fetch /api/brand itself. The logo is read straight off disk
 * and inlined as a data URL.
 *
 * Cached by the resolved path rather than read once per process: an owner
 * can swap the logo at any time, and a stale module-level cache would keep
 * emailing bills with the old artwork until the server restarted.
 */
const logoCache = new Map<string, string | null>();

async function brandLogo(): Promise<string | null> {
  const branding = await getBranding();
  const key = branding.logo.horizontal;

  const cached = logoCache.get(key);
  if (cached !== undefined) return cached;

  let dataUrl: string | null = null;
  try {
    if (branding.hasCustomLogo) {
      // Uploaded artwork: the URL carries a UUID filename under the
      // brand-assets root.
      const file = key.split("?")[0].split("/").pop();
      const found = file ? await readAttachment("brandAssets", `brand/${file}`) : null;
      if (found) {
        dataUrl = `data:${found.contentType};base64,${found.bytes.toString("base64")}`;
      }
    } else {
      const file = await readFile(path.join(process.cwd(), "public", "logo-horizontal.png"));
      dataUrl = `data:image/png;base64,${file.toString("base64")}`;
    }
  } catch {
    // A missing logo must not stop a bill going out.
    dataUrl = null;
  }

  logoCache.set(key, dataUrl);
  return dataUrl;
}

export async function renderInvoicePdf(data: ReceiptData): Promise<Buffer> {
  const logo = data.tenant.showLogo ? await brandLogo() : null;
  return renderToBuffer(<InvoicePdf data={data} logo={logo ?? undefined} />);
}

export function invoiceFileName(invoiceNo: string) {
  return `${invoiceNo.replace(/[^A-Za-z0-9-]/g, "-")}.pdf`;
}
