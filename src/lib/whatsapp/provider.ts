import "server-only";

// Provider: Gupshup (https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation)
// chosen for its well-documented REST API and low setup friction for a
// small pharmacy tenant. To go live: create a Gupshup account, provision a
// WhatsApp Business sender number, and set GUPSHUP_API_KEY,
// GUPSHUP_SOURCE_NUMBER, and GUPSHUP_APP_NAME (see README). Without those
// env vars this always returns { success: false, note: "not configured" }
// — callers must treat that as a normal, expected outcome, not an error to
// surface as a crash, since a pharmacy may simply not have set this up yet.

export interface WhatsAppMessage {
  to: string;
  text: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  note?: string;
  /**
   * Set instead of sending when no Business API credentials exist: a wa.me
   * deep link the counter can open to send the same text from their own
   * WhatsApp. The Gupshup route needs a verified Meta business account and
   * per-message fees, which a single pharmacy may never want — this keeps
   * the button useful in the meantime, and it upgrades silently the day
   * the credentials are set.
   */
  handoffUrl?: string;
}

export function normalizeWhatsAppPhone(phone: string) {
  return normalizePhone(phone);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const source = process.env.GUPSHUP_SOURCE_NUMBER;
  const appName = process.env.GUPSHUP_APP_NAME;

  if (!apiKey || !source || !appName) {
    return {
      success: false,
      note: "Automated sending isn't configured, so this opened in your own WhatsApp — press send there.",
      handoffUrl: `https://wa.me/${normalizePhone(message.to)}?text=${encodeURIComponent(message.text)}`,
    };
  }

  try {
    const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
      body: new URLSearchParams({
        channel: "whatsapp",
        source,
        destination: normalizePhone(message.to),
        "src.name": appName,
        message: JSON.stringify({ type: "text", text: message.text }),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, note: `Gupshup API error ${res.status}: ${body.slice(0, 200)}` };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      note: e instanceof Error ? `Send failed: ${e.message}` : "Send failed: unknown error",
    };
  }
}
