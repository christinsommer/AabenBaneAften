import { getCloudflareContext } from "@opennextjs/cloudflare";

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Åben Bane Aften <mail@aabenbaneaften.dk>",
      reply_to: "aabenbaneaften@hik.dk",
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend kunne ikke sende e-mailen (${response.status}): ${details}`);
  }
}
