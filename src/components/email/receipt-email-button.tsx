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
      onSend={async (email) => {
        const result = await sendReceiptEmail(invoiceId, email);
        // The SMTP path attaches the bill itself; the mailto path can't, so
        // download it here for the staff member to attach by hand.
        if (!result.success && result.handoffUrl) {
          window.open(`/api/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer");
        }
        return result;
      }}
    />
  );
}
