export function mailtoHref(email: string) {
  // Keep the address separator literal; escape URI delimiters within the address.
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/gi, '@')}`;
}

export function bccMailtoHref(emails: readonly (string | null | undefined)[]) {
  const addresses = [...new Set(emails.map(email => email?.trim().toLowerCase()).filter((email): email is string => !!email))];
  return addresses.length ? `mailto:?bcc=${encodeURIComponent(addresses.join(','))}` : null;
}
