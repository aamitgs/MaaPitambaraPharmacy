import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readAttachment, type AttachmentKind } from "@/lib/attachment-storage";

/**
 * Reads an uploaded photo and pulls form fields out of it, so staff can
 * photograph a medicine carton or a supplier's card instead of typing.
 *
 * Deliberately advisory: every field comes back editable and nothing is
 * saved until the user submits the form. A misread strength or schedule
 * class on a dispensing record is worse than a blank one, so the prompt
 * forbids guessing — anything not plainly legible comes back null.
 */

/** Vision is optional: unset the key and the "Fill from photo" buttons say so. */
export function isVisionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Swapping to "claude-haiku-4-5" cuts cost ~5x if the packs you photograph
// turn out to be easy to read; see README.
const MODEL = "claude-opus-5";

export class VisionNotConfiguredError extends Error {}

const itemFields = z.object({
  name: z.string().nullable().describe("Brand name exactly as printed on the pack"),
  genericName: z.string().nullable().describe("Generic/salt name if printed"),
  manufacturer: z.string().nullable().describe("Manufacturing company"),
  composition: z
    .string()
    .nullable()
    .describe("Full composition with strengths, e.g. 'Paracetamol 500mg + Caffeine 30mg'"),
  scheduleClass: z
    .enum(["none", "H", "H1", "X"])
    .nullable()
    .describe(
      "Indian drug schedule, from the Rx warning box on the pack. 'H' for the standard " +
        "Schedule H red-line warning, 'H1' where the pack says Schedule H1, 'X' for " +
        "Schedule X. Use 'none' only if the pack clearly carries no prescription warning."
    ),
  hsnCode: z.string().nullable().describe("HSN code if printed (often absent on retail packs)"),
  unit: z.string().nullable().describe("Selling unit: strip, bottle, tube, vial, box"),
  packSize: z.string().nullable().describe("Contents of one unit, e.g. '10 tablets', '100ml'"),
});

const supplierFields = z.object({
  name: z.string().nullable().describe("Firm / distributor name"),
  gstin: z.string().nullable().describe("15-character GSTIN if printed"),
  address: z.string().nullable().describe("Full postal address on one line"),
});

const invoiceLine = z.object({
  description: z
    .string()
    .describe("Product description exactly as printed on the invoice line, abbreviations and all"),
  batchNo: z.string().nullable().describe("Batch / lot number for this line"),
  expiryDate: z
    .string()
    .nullable()
    .describe("Expiry exactly as printed, e.g. '06/27' or 'JUN 27' — do not convert it"),
  mfgDate: z.string().nullable().describe("Manufacture date exactly as printed, if shown"),
  mrp: z.number().nullable().describe("Printed MRP per unit"),
  rate: z.number().nullable().describe("Purchase rate per unit charged on this invoice"),
  qty: z.number().nullable().describe("Quantity received, excluding any free/scheme quantity"),
});

const purchaseInvoice = z.object({
  supplierName: z.string().nullable().describe("Distributor / firm name on the invoice"),
  invoiceNo: z.string().nullable().describe("Supplier's invoice number"),
  invoiceDate: z
    .string()
    .nullable()
    .describe("Invoice date as ISO YYYY-MM-DD if it is unambiguous, otherwise null"),
  lines: z.array(invoiceLine).describe("One entry per product line on the invoice"),
});

export type ExtractedItem = z.infer<typeof itemFields>;
export type ExtractedInvoice = z.infer<typeof purchaseInvoice>;
export type ExtractedSupplier = z.infer<typeof supplierFields>;

const NO_GUESSING =
  "Read only what is actually legible in the image. If a field is not visible, " +
  "unreadable, or you are unsure, return null for it — never guess, infer from " +
  "the brand name, or fill in a typical value. This data goes onto a pharmacy " +
  "dispensing record, where a blank is safe and a wrong value is not.";

async function sourceBlock(kind: AttachmentKind, relativePath: string) {
  const file = await readAttachment(kind, relativePath);
  if (!file) throw new Error("Could not read the uploaded file");

  const data = file.bytes.toString("base64");
  if (file.contentType === "application/pdf") {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data },
    };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: file.contentType as "image/jpeg" | "image/png" | "image/webp",
      data,
    },
  };
}

async function extract<T>(
  kind: AttachmentKind,
  relativePath: string,
  instruction: string,
  format: ReturnType<typeof zodOutputFormat>
): Promise<T> {
  if (!isVisionConfigured()) {
    throw new VisionNotConfiguredError(
      "Photo extraction is not configured — set ANTHROPIC_API_KEY."
    );
  }

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Reading a crumpled foil strip is harder than it looks, but this is a
    // short extraction — medium keeps latency at the counter reasonable.
    output_config: { effort: "medium", format },
    system: NO_GUESSING,
    messages: [
      {
        role: "user",
        content: [await sourceBlock(kind, relativePath), { type: "text", text: instruction }],
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("Could not read the details from that photo");
  }
  return response.parsed_output as T;
}

export function extractItemFromPhoto(relativePath: string) {
  return extract<ExtractedItem>(
    "itemPhotos",
    relativePath,
    "This is a photo of a medicine pack (carton, strip, bottle or label). Extract the " +
      "product details for a pharmacy's item master.",
    zodOutputFormat(itemFields)
  );
}

export function extractPurchaseInvoiceFromPhoto(relativePath: string) {
  return extract<ExtractedInvoice>(
    "purchaseInvoices",
    relativePath,
    "This is a pharmaceutical distributor's sales invoice. Extract the header and every " +
      "product line in the order printed. Read dates verbatim — do not reformat them. " +
      "Skip totals, tax rows, and any line without a product. If a column is missing or " +
      "unreadable on a line, return null for that field rather than estimating it.",
    zodOutputFormat(purchaseInvoice)
  );
}

export function extractSupplierFromPhoto(relativePath: string) {
  return extract<ExtractedSupplier>(
    "purchaseInvoices",
    relativePath,
    "This is a photo of a pharmaceutical distributor's visiting card, letterhead, " +
      "invoice header or cancelled cheque. Extract the firm's details.",
    zodOutputFormat(supplierFields)
  );
}
