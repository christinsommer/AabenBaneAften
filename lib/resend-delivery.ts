export class EmailDeliveryError extends Error {
  uncertain: boolean;
  constructor(uncertain: boolean) {
    super('E-mailen kunne ikke sendes. Prøv igen senere, eller kontakt administratoren.');
    this.uncertain = uncertain;
  }
}

// One key and identical body across retries prevent duplicate sends after timeouts.
export async function deliverEmail(apiKey: string, body: string, options: {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const request = options.fetch ?? fetch;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const reference = crypto.randomUUID();
  let uncertain = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    let status = 0;
    let code = 'network_error';
    let retry = true;
    let delay = 500 * 2 ** attempt;
    try {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(4000),
        headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': reference},
        body,
      });
      status = response.status;
      const result = await response.json().catch(() => ({})) as {id?: string; name?: string};
      if (response.ok) {
        console.info('email_accepted', {reference, providerId: result.id, attempt: attempt + 1});
        return;
      }
      code = typeof result.name === 'string' && /^[a-z_]+$/.test(result.name) ? result.name : 'provider_error';
      uncertain ||= status >= 500;
      retry = status >= 500 || (status === 429 && !['daily_quota_exceeded', 'monthly_quota_exceeded'].includes(code)) || code === 'concurrent_idempotent_requests';
      const after = response.headers.get('retry-after');
      if (after !== null) {
        const seconds = Number(after);
        const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - Date.now();
        if (Number.isFinite(milliseconds)) delay = Math.max(delay, milliseconds);
      }
    } catch {
      uncertain = true;
    }
    // Do not log recipients, message bodies, reset tokens or provider error text.
    console.warn('email_attempt_failed', {reference, status, code, attempt: attempt + 1, uncertain});
    // Bound total work below the browser's 20-second timeout; never retry before Retry-After.
    if (!retry || delay > 1500 || attempt === 2) throw new EmailDeliveryError(uncertain);
    await sleep(delay);
  }
}
