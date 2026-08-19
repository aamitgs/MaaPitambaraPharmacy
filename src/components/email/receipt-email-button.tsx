"use client";

import { SendEmailButton } from "./send-email-button";
import { sendReceiptEmail } from "@/lib/actions/email";

export function ReceiptEmailButton({
  invoiceId,
  defaultEmail,
}: {
  invoiceId: string;
  defaultEmail: string | null;
}) {
  return (
    <SendEmailButton
      defaultEmail={defaultEmail}
      onSend={(email) => sendReceiptEmail(invoiceId, email)}
    />
  );
}
