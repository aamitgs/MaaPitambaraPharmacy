"use client";

import { SendWhatsAppButton } from "./send-whatsapp-button";
import { sendStatementWhatsApp } from "@/lib/actions/whatsapp";

export function StatementWhatsAppButton({
  customerId,
  from,
  to,
  defaultPhone,
}: {
  customerId: string;
  from: string;
  to: string;
  defaultPhone: string | null;
}) {
  return (
    <SendWhatsAppButton
      defaultPhone={defaultPhone}
      onSend={(phone) => sendStatementWhatsApp(customerId, from, to, phone)}
    />
  );
}
