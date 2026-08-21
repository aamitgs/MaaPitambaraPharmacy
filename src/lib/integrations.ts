import "server-only";

/**
 * One place that says which optional integrations are actually configured.
 *
 * Each of these already degrades gracefully on its own — a missing key
 * makes the button report "not configured" rather than crash. What was
 * missing is anywhere to *see* that: an owner who set SMTP a month ago and
 * mistyped a variable name had no way to find out except by sending a bill
 * and waiting for a complaint.
 *
 * Reads env vars only. No secret ever leaves this module — the UI is told
 * whether a value is present, never what it is.
 */

export type IntegrationStatus = {
  key: string;
  name: string;
  /** What stops working while this is unset. */
  purpose: string;
  configured: boolean;
  /** Env vars this needs, and whether each is currently set. */
  vars: { name: string; set: boolean; required: boolean }[];
  /** Where to get the credentials. */
  hint: string;
};

const present = (name: string) => Boolean(process.env[name]?.trim());

function build(
  key: string,
  name: string,
  purpose: string,
  hint: string,
  vars: { name: string; required: boolean }[]
): IntegrationStatus {
  const resolved = vars.map((v) => ({ ...v, set: present(v.name) }));
  return {
    key,
    name,
    purpose,
    hint,
    vars: resolved,
    // Configured means every *required* var is present. A half-filled set
    // is reported as not configured, which is the honest answer: the
    // feature will not work.
    configured: resolved.filter((v) => v.required).every((v) => v.set),
  };
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    build(
      "email",
      "Email",
      "Sending a bill to a patient by email, and the receipt-email button on every invoice.",
      "Any SMTP account — Gmail with an app password, Zoho, or your host's mail server.",
      [
        { name: "SMTP_HOST", required: true },
        { name: "SMTP_PORT", required: true },
        { name: "SMTP_USER", required: true },
        { name: "SMTP_PASSWORD", required: true },
        { name: "SMTP_FROM", required: false },
      ]
    ),
    build(
      "sms",
      "SMS",
      "Texting a bill to the patient, with a link to their own copy.",
      "MSG91 (msg91.com), plus a DLT registration — mandatory in India since 2021. Register the business on any operator's DLT portal, get a 6-character header, then register each template from src/lib/sms/templates.ts and paste its id here. Operators silently drop messages whose text does not match a registered template.",
      [
        { name: "MSG91_AUTH_KEY", required: true },
        { name: "MSG91_SENDER_ID", required: true },
        { name: "SMS_TEMPLATE_ID_RECEIPT", required: true },
        { name: "SMS_TEMPLATE_ID_RECEIPT_LINK", required: false },
        { name: "SMS_TEMPLATE_ID_REMINDER", required: false },
        { name: "PUBLIC_BASE_URL", required: false },
      ]
    ),
    build(
      "whatsapp",
      "WhatsApp",
      "Sending a bill over WhatsApp automatically. Without it, staff can still hand off to their own WhatsApp.",
      "A WhatsApp Business API provider — this build targets Gupshup.",
      [
        { name: "GUPSHUP_API_KEY", required: true },
        { name: "GUPSHUP_SOURCE_NUMBER", required: true },
        { name: "GUPSHUP_APP_NAME", required: true },
      ]
    ),
    build(
      "einvoice",
      "E-invoice & e-way bill",
      "Generating an IRN and e-way bill through the GST network. Only needed once the branch crosses the e-invoicing turnover threshold.",
      "A GSP (ClearTax, MasterGST, Cygnet) or direct NIC IRP access.",
      [
        { name: "GSP_BASE_URL", required: true },
        { name: "GSP_API_KEY", required: true },
        { name: "GSP_SELLER_GSTIN", required: true },
      ]
    ),
    build(
      "vision",
      "Fill from photo",
      "Reading an item carton, a distributor's card or an invoice photo and filling the form in.",
      "An Anthropic API key from console.anthropic.com.",
      [{ name: "ANTHROPIC_API_KEY", required: true }]
    ),
    build(
      "backup",
      "Backup encryption",
      "Encrypting backup files. Without it, Backup now fails outright — this one is not optional.",
      "Any 32-byte key, hex or base64. Generate with: openssl rand -hex 32",
      [
        { name: "BACKUP_ENCRYPTION_KEY", required: true },
        { name: "BACKUP_CRON_SECRET", required: false },
      ]
    ),
  ];
}
