import "server-only";
import nodemailer from "nodemailer";

/**
 * Email delivery, with the same two-mode design as WhatsApp: send through
 * SMTP when credentials exist, otherwise hand the message to whatever mail
 * client the counter machine already has via a `mailto:` link. A pharmacy
 * that never sets up SMTP still gets a working button.
 *
 * To go live set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and
 * SMTP_FROM (see README). A Gmail account needs an app password, not the
 * account password.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional file to attach. Dropped on the mailto: path, which cannot
   *  carry one — see sendEmailMessage. */
  attachment?: { filename: string; content: Buffer; contentType: string };
}

export interface EmailSendResult {
  success: boolean;
  note?: string;
  /** Set instead of sending when SMTP isn't configured. */
  handoffUrl?: string;
}

function mailtoLink(message: EmailMessage) {
  const params = new URLSearchParams({ subject: message.subject, body: message.text });
  // URLSearchParams encodes spaces as "+", which mail clients render
  // literally in a subject line — mailto wants percent-encoding.
  return `mailto:${encodeURIComponent(message.to)}?${params.toString().replace(/\+/g, "%20")}`;
}

export async function sendEmailMessage(message: EmailMessage): Promise<EmailSendResult> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    return {
      success: false,
      // A mailto: link carries text only — no standard lets a web page
      // attach a file to the user's mail client — so the bill is downloaded
      // separately when this path is taken.
      note: message.attachment
        ? "Automated email isn't configured — this opened in your mail app and the PDF downloaded separately; attach it there."
        : "Automated email isn't configured, so this opened in your mail app — press send there.",
      handoffUrl: mailtoLink(message),
    };
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      attachments: message.attachment
        ? [
            {
              filename: message.attachment.filename,
              content: message.attachment.content,
              contentType: message.attachment.contentType,
            },
          ]
        : undefined,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      note: e instanceof Error ? `Email failed: ${e.message}` : "Email failed",
    };
  }
}
