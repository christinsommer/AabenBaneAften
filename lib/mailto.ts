export function mailtoHref(email: string) {
  // Keep the address separator literal; escape URI delimiters within the address.
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/gi, '@')}`;
}

export function bccMailtoHref(emails: readonly (string | null | undefined)[], message?: {subject: string; text: string}, separator: ',' | ';' = ',') {
  const addresses = [...new Set(emails.map(email => email?.trim().toLowerCase()).filter((email): email is string => !!email))];
  if (!addresses.length) return null;
  const content = message ? `&subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.text.replace(/\r?\n/g, '\r\n'))}` : '';
  return `mailto:?bcc=${encodeURIComponent(addresses.join(separator))}${content}`;
}
