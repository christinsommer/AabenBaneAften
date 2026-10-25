# Email delivery and PIN reset diagnosis

The app uses Resend for transactional email and separate plan/newsletter flows. `RESEND_API_KEY` must be configured in the environment performing the send. Newsletter sending additionally requires `NEWSLETTER_ENABLED=true`; that flag does not disable PIN or other service email.

## PIN reset behavior

Opening “Glemt pinkode?” only opens a form. The member submits their number with “Send reset-link”. Unknown membership numbers, closed profiles, and profiles without an email return the same generic success shape without contacting the provider.

The limiter allows three reset requests per membership number and 20 per IP per hour. Failed delivery attempts also consume allowance. Shared Wi-Fi users share the IP budget.

Reset links expire after 30 minutes. The shared delivery helper retries transient failures at most twice with the same body/idempotency key. Each attempt has a four-second timeout. It respects bounded Retry-After delays; delays over 1.5 seconds are not waited inline. Permanent/quota failures are not retried. An uncertain delivery leaves the token valid until expiry; definite rejection removes only the newly created token.

Plan email and newsletters have separate implementations. Do not assume the shared helper's retry behavior applies to them.

## Configuration checks

A production release preflight checks for the email secret. Missing runtime configuration produces `email_configuration_missing` before a provider request.

For an authorized production configuration change, enter the key through the secret prompt, never a command argument:

```powershell
node node_modules/wrangler/bin/wrangler.js secret put RESEND_API_KEY --config wrangler.jsonc
node scripts/check-email-config.mjs
```

The second command checks secret presence in Production. It does not validate the key's permissions, sender domain, quota, or inbox delivery. Local configuration belongs in `.dev.vars`, followed by a restart.

## Diagnosis

1. Establish the approximate request time and whether the form was submitted. Check the saved address through authorized administration.
2. Inspect application status/429 responses and Worker logs. `email_accepted` records a provider reference; `email_attempt_failed` records status, error kind, attempt, and uncertainty without recipients or tokens.
3. Check the actual provider account's usage and limits. Do not rely on historical pricing/quota figures or assume separate API keys isolate team quotas.
4. Use the provider reference to inspect delivery, delay, bounce, suppression, or rejection. Review key/domain errors separately from transient failures.
5. Verify sender-domain configuration and investigate junk/quarantine or an incorrect recipient address.

Acceptance is not delivery to an inbox. A test should be explicitly authorized for a test recipient; documentation checks must not send real mail.

## Historical observation

The earlier investigation recorded that a read-only production secret listing on 2026-10-20 lacked `RESEND_API_KEY`. It did not retrieve historical provider delivery logs. This is a dated observation, not a claim that the secret is still missing now. Recheck the actual environment when diagnosing a new incident.

## Possible improvements, not implemented guarantees

A signed delivery webhook, restricted delivery-status view, and durable prioritized transactional queue could improve diagnosis/recovery. Any queue must preserve idempotency, protect tokens, and avoid sending expired reset links. No such future design should be described as current behavior.

See [security controls](security-controls.md), [privacy administration](../GDPR_ADMIN.md), and [operational monitoring](operations-security.md).
