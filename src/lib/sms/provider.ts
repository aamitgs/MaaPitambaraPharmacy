import "server-only";
import { SMS_TEMPLATES, renderTemplate, smsSegments, type SmsTemplateKey } from "./templates";

/**
 * Provider: MSG91 (https://docs.msg91.com/reference/send-sms).
 *
 * Chosen over the Gupshup account this app already uses for WhatsApp
 * because MSG91's flow-based API maps directly onto the DLT model India
 * requires — you send a registered template id plus named variables, and
 * the operator matches it against the registered text. Swapping providers
 * means rewriting this file only; everything above it deals in template
 * keys and variables, never in vendor payloads.
 *
 * Unset credentials are a normal state, not an error: a pharmacy may never
 * enable SMS. The result carries a `note` explaining why, exactly as the
 * WhatsApp provider does.
 *
 * What has to exist before a single message sends, none of which this code
 * can do for you (see README):
 *   1. A DLT registration for the business entity
 *   2. A six-character header (sender id), e.g. MPPHRM
 *   3. Each template in src/lib/sms/templates.ts registered, its id set in
 *      the matching env var
 */

export interface SmsSendResult {
  success: boolean;
  note?: string;
  /** Rendered text, recorded so the log shows what actually went out. */
  text?: string;
  segments?: number;
  /** Provider's message id, for chasing a delivery query. */
  providerMessageId?: string;
}

export function normalizeSmsPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  // MSG91 wants the country code with no plus.
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

export function isValidIndianMobile(phone: string): boolean {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  // Indian mobile numbers are ten digits starting 6-9. Landlines cannot
  // receive SMS, so rejecting them here saves a silent failure later.
  return /^[6-9]\d{9}$/.test(local);
}

export function smsConfigStatus(templateKey: SmsTemplateKey) {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const senderId = process.env.MSG91_SENDER_ID?.trim();
  const templateId = process.env[SMS_TEMPLATES[templateKey].templateIdEnv]?.trim();
  return {
    configured: Boolean(authKey && senderId && templateId),
    missing: [
      !authKey && "MSG91_AUTH_KEY",
      !senderId && "MSG91_SENDER_ID",
      !templateId && SMS_TEMPLATES[templateKey].templateIdEnv,
    ].filter(Boolean) as string[],
  };
}

export async function sendSms(
  to: string,
  templateKey: SmsTemplateKey,
  values: string[]
): Promise<SmsSendResult> {
  const text = renderTemplate(templateKey, values);
  const { segments, encoding } = smsSegments(text);

  if (!isValidIndianMobile(to)) {
    return {
      success: false,
      note: "That is not a 10-digit Indian mobile number — SMS cannot go to a landline.",
      text,
      segments,
    };
  }

  const status = smsConfigStatus(templateKey);
  if (!status.configured) {
    return {
      success: false,
      note: `SMS isn't configured — set ${status.missing.join(", ")}. Registering the template on a DLT portal is required first; see Settings → Integrations.`,
      text,
      segments,
    };
  }

  const template = SMS_TEMPLATES[templateKey];
  const templateId = process.env[template.templateIdEnv]!.trim();

  // MSG91's flow API takes named variables. The names must match the ones
  // used when the template was registered; `var1..varN` is its convention
  // and what the portal generates by default.
  const variables: Record<string, string> = {};
  values.forEach((v, i) => {
    variables[`var${i + 1}`] = v;
  });

  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: process.env.MSG91_AUTH_KEY!.trim(),
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: template.hasUrl ? "1" : "0",
        recipients: [{ mobiles: normalizeSmsPhone(to), ...variables }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const body = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        success: false,
        note: `SMS provider error ${res.status}: ${body.slice(0, 200)}`,
        text,
        segments,
      };
    }

    // MSG91 answers 200 with {"type":"error"} for a rejected template, so
    // the status code alone is not proof of a send.
    let providerMessageId: string | undefined;
    try {
      const json = JSON.parse(body) as { type?: string; message?: string };
      if (json.type === "error") {
        return {
          success: false,
          note:
            `Provider rejected the message: ${json.message ?? "unknown reason"}. ` +
            `This is nearly always a DLT template mismatch — the registered text must match ` +
            `src/lib/sms/templates.ts exactly.`,
          text,
          segments,
        };
      }
      providerMessageId = json.message;
    } catch {
      // A non-JSON 200 is unusual but not a failure in itself.
    }

    return {
      success: true,
      text,
      segments,
      providerMessageId,
      note: encoding === "UCS-2" ? "Sent, but as a Unicode message — costlier per part." : undefined,
    };
  } catch (e) {
    return {
      success: false,
      note: e instanceof Error ? `Send failed: ${e.message}` : "Send failed: unknown error",
      text,
      segments,
    };
  }
}
