/**
 * DLT-registered SMS templates.
 *
 * India does not allow free-form commercial SMS. Since TRAI's 2021
 * regulation every sender must register on a DLT platform (Jio, Airtel,
 * Vodafone Idea, BSNL — registering with one propagates to all), obtain a
 * six-character header, and register the exact text of every message with
 * `{#var#}` placeholders. Operators match outbound traffic against that
 * registered text and silently drop anything that does not match.
 *
 * So the app cannot compose a message. It can only pick a registered
 * template and fill its variables, in the order the template declares them
 * — which is why `variables` below is an ordered function, not an object.
 *
 * `text` here is the copy to paste into the DLT portal when registering.
 * It is also used to render a preview, so what staff see is exactly what
 * was registered. Changing it here without re-registering will get the
 * message dropped by the operator, not by this code.
 */

export type SmsTemplateKey = "receipt" | "receiptWithLink" | "paymentReminder";

export interface SmsTemplate {
  key: SmsTemplateKey;
  /** What to register on the DLT portal, verbatim. */
  text: string;
  /** Human explanation of each `{#var#}`, in order. */
  variableNames: string[];
  /** Env var holding the DLT template id issued after registration. */
  templateIdEnv: string;
  /** Whether the registered text contains a URL — DLT needs those declared. */
  hasUrl: boolean;
}

export const SMS_TEMPLATES: Record<SmsTemplateKey, SmsTemplate> = {
  receipt: {
    key: "receipt",
    text: "Bill {#var#} for Rs {#var#} dated {#var#}. Thank you for visiting {#var#}.",
    variableNames: ["invoice number", "amount", "date", "pharmacy name"],
    templateIdEnv: "SMS_TEMPLATE_ID_RECEIPT",
    hasUrl: false,
  },
  receiptWithLink: {
    key: "receiptWithLink",
    text: "Bill {#var#} for Rs {#var#} dated {#var#}. View: {#var#} - {#var#}",
    variableNames: ["invoice number", "amount", "date", "bill link", "pharmacy name"],
    templateIdEnv: "SMS_TEMPLATE_ID_RECEIPT_LINK",
    hasUrl: true,
  },
  paymentReminder: {
    key: "paymentReminder",
    text: "Reminder: Rs {#var#} is outstanding on your account with {#var#}. Please settle at your convenience.",
    variableNames: ["amount", "pharmacy name"],
    templateIdEnv: "SMS_TEMPLATE_ID_REMINDER",
    hasUrl: false,
  },
};

/**
 * Renders a template for preview and for the log.
 *
 * The provider substitutes variables itself from the values sent alongside
 * the template id — this local render exists so staff can see what will go
 * out, and so the sent text is recorded, not reconstructed later from a
 * template that may since have changed.
 */
export function renderTemplate(key: SmsTemplateKey, values: string[]): string {
  const template = SMS_TEMPLATES[key];
  let i = 0;
  return template.text.replace(/\{#var#\}/g, () => values[i++] ?? "");
}

/**
 * SMS is billed per 160 GSM-7 characters, and one non-GSM character (a ₹
 * sign, a curly quote, an em dash) silently switches the whole message to
 * UCS-2 at 70 characters a part — tripling the cost of a bill receipt.
 * Templates above deliberately say "Rs" rather than "₹" for that reason.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

export function isGsm7(text: string): boolean {
  return [...text].every((c) => GSM7.includes(c) || GSM7_EXTENDED.includes(c));
}

export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; segments: number } {
  if (isGsm7(text)) {
    // Extended characters cost two septets each.
    const septets = [...text].reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
    return { encoding: "GSM-7", segments: septets <= 160 ? 1 : Math.ceil(septets / 153) };
  }
  return { encoding: "UCS-2", segments: text.length <= 70 ? 1 : Math.ceil(text.length / 67) };
}
