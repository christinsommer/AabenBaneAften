# Privacy implementation record

This file retains the purpose of the original October 2026 implementation report. It is a historical engineering record, not a current deployment report or legal certification. Current operational instructions live in [privacy administration](GDPR_ADMIN.md), [backup/recovery](GDPR_BACKUP.md), and [security controls](docs/security-controls.md).

## Original delivery scope: 2026-10-11 to 2026-10-12

The original work introduced versioned privacy/cookie information, receipt tracking, voluntary newsletter consent, profile activity/review, controlled closure, and individually addressed newsletters in the existing Next.js/OpenNext/D1 application. Migration `0016_privacy_newsletter.sql` added the custom privacy/newsletter tables.

The delivery record reported local implementation and synthetic testing, not production deployment, real newsletter delivery, or production profile closure. Those statements apply to that delivery, not to later activity in the project.

## Implemented design

- Public Danish privacy/cookie pages and a version-aware information/receipt flow for new and existing members.
- Atomic profile/receipt/optional-consent creation, followed separately by welcome email. Mail failure does not erase the new account.
- Recorded activity distinguished from unknown migrated history. The 2026-09-25 legacy date is marked unknown rather than treated as evidence of a visit.
- Administrator review of inactivity, actual-contact recording, reasoned retention decisions, and future review dates. Merely opening a contact link is not logged as completed contact.
- Controlled profile closure instead of direct deletion. Stable historical relationships remain, so closure is pseudonymization.
- Consent evidence containing document/text version, source, action, address, and timestamp; email changes invalidate old consent.
- Hashed personal tokens tied to account, email revision, and consent. Personal-link GETs do not mutate preferences; explicit POST confirmation is required.
- Drafts, independent prepared dispatch copies, per-recipient consent rechecks, and provider acceptance states. No inbox-delivery claim is made.
- Server-side role/state checks and origin checks for mutations.

No payment, order, balance, or prepaid-credit subsystem was found in the reviewed application. The privacy feature did not introduce one, an external AI service, or image-upload/tracking infrastructure.

## Subsequent behavior that supersedes the original report

The old report described long-lived sessions, no Admin/SuperAdmin split, and only a session cookie. Those statements are no longer current:

- [Session policy](docs/security-controls.md) now distinguishes member and administrator idle/absolute limits.
- [SuperAdmin](SUPERADMIN.md) adds a deployment-bound capability over the admin role.
- [Administrator MFA](docs/admin-2fa.md) adds enrollment, challenges, trusted-device cookies, and recovery.
- Controlled closure uses `NN <internal-id>` and `closed-<internal-id>`, preserving CR and its review timestamp. It does not use the original membership number as the pseudonym.

The current table inventory is in [DATAMODEL.md](DATAMODEL.md), including tables introduced after the original privacy migration.

## Limits and unresolved operational decisions

Exact full-name replacements can be performed in imported plans; duplicate names, unreadable data, abbreviations, and arbitrary free text require review. Identifying newsletter text and in-progress sending can block closure. External mail archives, exported spreadsheets, historical Git content, backups, and provider copies are outside the app's automatic cleanup.

A new profile using a previously released membership number receives a new internal ID, receipts, and consent history. Old historical identity must not transfer to it. Restore procedures must account for closures and preference changes after the backup.

The owner must establish legal/controller identity, contact details, applicable processing grounds, retention decisions for each data category, provider agreements, geographic/transfer arrangements, backup custody, and actual provider tracking configuration. The code alone does not verify these facts. The 24-month review threshold and extra confirmation within 30 days of another newsletter are product choices, not assertions of statutory deadlines.

Published privacy text changes require a new version; retained document versions must not be silently rewritten. See `lib/privacy-text.ts` and `privacy_documents`.

## Historical verification evidence

The original record reported 113 passing regression tests, solver/build checks, and browser checks at 390 px and 1440 px for the preceding delivery. Later focused closure tests covered preserved CR, name replacement, repeated closure/re-registration, login revocation, future-signup blocking, and transactional rollback.

That record also noted Windows file locks preventing some later Cloudflare packaging reruns and pre-existing whole-repository lint failures. These are dated observations, not the status of the current checkout. No historical test count should be presented as a test run performed during a documentation-only change.

For current evidence, run the appropriate checks from [development](docs/development.md). Relevant suites include `tests/privacy.test.mjs`, `tests/privacy-backup.test.mjs`, `tests/privacy-export.test.mjs`, and the dedicated review/closure tests in `tests/`.

## Reference handling

The original report referenced Danish regulator guidance, EU GDPR text, provider import/export documentation, and email idempotency documentation. Their current contents and applicability were not revalidated during this documentation rewrite. Consult current authoritative sources when making legal or provider-policy decisions; the repository's implementation record does not settle them.
