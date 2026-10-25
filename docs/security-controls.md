# Login, administrator roles and member data

This guide describes repository controls, not a live security audit. See
[administrator MFA](admin-2fa.md), [role boundaries](../SUPERADMIN.md), and
[operational monitoring](operations-security.md) for related procedures.

## Feedback disabled

`POST /api/app` with `action: "feedback"` returns HTTP 403 for everyone, including
administrators and SuperAdmin. The former insert/update handler has been removed.
No database migration or deletion is performed by this change. Existing feedback
and its established privacy/plan-cleanup handling remain intact. Reopening the API
requires defining the workflow, validating inputs and enforcing match participation
and subject-player authorization. Regression tests verify refusal without writes.

## Browser and request protections

All Next.js responses receive `nosniff`, `X-Frame-Options: DENY`, a no-referrer
policy and a baseline CSP against framing and objects. APIs also get
`default-src 'none'`. HTML pages use a fresh random script nonce
per response, with dynamic rendering and no-store caching. Production scripts
allow neither unsafe-inline nor unsafe-eval. Inline CSS remains allowed for
React/Radix positioning. Frames and objects are blocked; app connections are
restricted to the same origin. Development additionally permits eval and WebSockets
for Next.js tooling. Existing mailto/tel links and downloads remain available.

Every POST handler checks the common JSON/origin guard. Foreign or null origins,
cross-site/same-site Fetch Metadata and non-JSON media types are rejected. Requests
without browser origin metadata still require JSON and the endpoint's normal
authentication/authorization; this is CSRF protection, not a substitute for login.

`tests/rendered-html.test.mjs` checks actual Worker headers, nonce uniqueness,
script nonces and request rejection for the tested POST endpoints. The Chrome check
`scripts/check-privacy-browser.mjs` verifies normal UI flows without CSP errors
and rejects an injected inline script.

## Database deployment

Session and limiter changes originated in migrations `0017_dear_wallflower.sql`
and `0018_shiny_eddie_brock.sql`. Apply all pending migrations for the target
checkout, including later MFA/audit changes, before deploying its code.
The normal release script applies migrations before deploying the Worker. Local
development applies them through `node scripts/setup-local-d1.mjs`.

## Authentication limits

Limits are stored in D1 and enforced with atomic conditional writes across Worker
instances. Keys are SHA-256 hashes; raw IP addresses and membership numbers are
not stored in the limiter. Expired records are removed in bounded batches during
authentication traffic. Blocked requests do not extend the account's waiting time.

* Login and MFA each use their own buckets: 50 attempts per IP per 15 minutes; five initial attempts per account
  number, followed by waits of 30, 60, 120 seconds and so on, capped by the
  15-minute window. At most 12 attempts per account per window.
* PIN reset emails: three requests per membership number and 20 per IP per hour.
  Existing and unknown membership numbers use the same limits and response shape.
* Submitting a reset token: 30 attempts per IP per 15 minutes.
* Responses use HTTP 429 and `Retry-After`. D1 failures fail closed.

Both successful and unsuccessful attempts consume allowance. Only Cloudflare's
`CF-Connecting-IP` header is used; requests without it share an unknown-IP bucket.
Do not expose an alternative origin that allows clients to forge this header.
Cloudflare WAF protection remains useful against traffic volume before D1.

## Administrator provisioning

Public registration always creates a player, even in an empty database. Existing
administrator roles are preserved. Only the deployment-bound SuperAdmin may
grant or revoke administrator roles, after supplying their current PIN. These
checks use the login rate limits. Ordinary administrators have no role controls.

For a fresh installation, an operator with trusted database access must verify
the intended member, assign its initial administrator role, then bind its ID via
the existing `scripts/deploy-superadmin.mjs` / `Deploy.ps1 -SuperAdminMemberNo`
workflow. There is deliberately no public bootstrap endpoint.

## Member names

Ordinary players receive their own name and the names needed for the published
current match plan. An unpublished plan does not disclose its names. Registration,
waiting lists, spouse search, and published-plan replacement candidates expose
limited names for their respective functions.
Administrators retain the member directory. Existing visibility preferences still
control plan contact details.

Validation: `node --test tests/security-api.test.mjs` covers concurrent account
limits, IP limits, reset email limits, administrator authorization, first-account
registration and published versus draft member-name visibility using local D1.

## Session policy

Players: 30-minute idle limit and 8-hour absolute lifetime. Administrators,
including SuperAdmin: 15-minute idle limit and 4-hour absolute lifetime. Both
limits are checked server-side against the current role. A role promotion cannot
retain the longer player allowance. Cookie expiration also uses the absolute limit.

The additive migration leaves existing session rows intact, with NULL
`last_seen_at`; these legacy sessions are rejected and require a fresh login.
Ordinary GET requests (including automatic schedule polling) do not renew activity.
Authenticated POST actions and visible user interactions renew it, only while the
session remains valid. Interaction reporting is throttled to once per minute.
Neither activity nor polling extends absolute expiration. Expired tokens are
rejected, removed from D1 and cleared from the browser when presented.

The profile provides “Log ud på alle enheder”, including the current device.
Email changes require the acting user's current PIN, protected by the login
limiter, in both self-service and administrator editing. The target's existing
sessions and PIN-reset links are revoked atomically with the email update. A
self-service email change issues a fresh session for the current device.
MFA credential versions also bind administrator sessions; see the MFA guide for
challenge, recovery-code, and trusted-device revocation.

`tests/session-api.test.mjs` covers both roles, background polling, active renewal,
absolute expiration, legacy sessions, role promotion, cross-device logout and
email-change confirmation/revocation against local D1.
