"use client";

import { SendEmailButton } from "./send-email-button";
import { sendStatementEmail } from "@/lib/actions/email";

export function StatementEmailButton({
  customerId,
  from,
  to,
}: {
  customerId: string;
  from: string;
  to: string;
}) {
  return (
    <SendEmailButton
      defaultEmail={null}
      onSend={(email) => sendStatementEmail(customerId, from, to, email)}
    />
  );
}
