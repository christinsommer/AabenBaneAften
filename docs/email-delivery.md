# PIN reset email investigation

Reviewed 2026-10-16. Production Resend usage, domain settings and delivery logs have not been inspected. Code findings alone do not establish the cause of reported missing emails.

## Current flow

“Glemt pinkode?” opens a form; it does not itself send email. The member must submit their membership number using “Send reset-link”. Unknown numbers, closed profiles and profiles without an email return the same generic success response without contacting Resend. This avoids exposing membership information.

The app allows 3 reset requests per membership number per hour and 20 per IP per hour. Failed delivery attempts also consume this allowance. Members on shared Wi-Fi share the IP limit. These limits have not been changed.

Reset links expire after 30 minutes. The mail helper now retries transient failures at most twice using the same Resend idempotency key and body. Each request has a 4-second timeout. Retry-After is respected; waits above 1.5 seconds are not attempted inline. Daily/monthly quota errors and permanent errors are not retried. Ambiguous delivery leaves the token valid until expiry; definite rejection removes only the new token.

Worker logs contain email_accepted (provider ID and operation reference) or email_attempt_failed (HTTP status, provider error name, attempt and uncertainty). They do not contain recipients, credentials or reset links. Acceptance is not proof of inbox delivery. Existing plan-email and newsletter senders have separate implementations; these retries apply to the shared sendEmail helper.

## Production diagnosis

1. Obtain the approximate request time and affected member privately. Check their saved email and whether the form was submitted, not merely opened.
2. Check Worker logs for the request, app HTTP 429 and email_attempt_failed. Missing configuration fails before calling Resend.
3. In Resend Usage, check actual plan, daily/monthly consumption and team request limit. Free currently allows 100 emails/day and 3,000/month; all relevant traffic shares quotas. Separate API keys do not isolate a team's request rate.
4. In Resend Logs, check 429 (rate versus quota), 401/403 (key/domain/permissions) and 5xx. Use the provider ID to inspect the email's delivery events, including delayed, bounced, failed or suppressed.
5. Verify the sender domain and DNS authentication in Resend. Delivered means accepted by the recipient server, not necessarily placed in the inbox; check junk/quarantine and incorrect addresses too.

## Further hardening

- Add signed Resend webhooks and a restricted admin delivery view for delivered, delayed, bounced, failed and suppressed events, with limited retention. Never expose reset tokens in that view.
- Use a durable queue with bounded retries, stable idempotency keys, expiry and priority for PIN emails over bulk mail. A queue must not send an expired reset link and must protect any persisted message containing the token.
- Alert on quota exhaustion, authentication failures and repeated delivery failures. Select plan capacity based on peak-day volume, not just monthly totals.
- Reassess the shared-IP limit using actual blocked-request counts without removing account-level abuse protection.

Sources:
- https://resend.com/docs/api-reference/rate-limit
- https://resend.com/pricing
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://www.resend.com/changelog/suppression-list-support
