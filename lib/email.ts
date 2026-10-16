import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deliverEmail } from './resend-delivery';

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(message: EmailMessage) {
  const apiKey = (getCloudflareContext().env as CloudflareEnv & { RESEND_API_KEY?: string }).RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("E-mail er ikke konfigureret i dette miljø (RESEND_API_KEY mangler).");
  }

  await deliverEmail(apiKey, JSON.stringify({
      from: "Åben Bane Aften <mail@aabenbaneaften.dk>",
      reply_to: "aabenbaneaften@hik.dk",
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }));
}
