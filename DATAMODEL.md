# Data model

The application uses SQLite-compatible Cloudflare D1. Local Sandbox and remote Production have separate data stores. This document describes application storage, not the contents of a particular installation.

## Sources of truth

- [Drizzle schema](db/schema.ts): core typed application tables.
- [SQL migrations](drizzle/): complete schema, including custom privacy, MFA, monitoring, and exclusion tables.
- [Migration checksums](drizzle/checksums.json) and [journal](drizzle/meta/_journal.json): migration integrity and order.
- [Business rules](docs/business-rules.md): application validation and interpretation.

Do not infer the entire database from `db/schema.ts`. Several custom SQL tables are accessed directly. Drizzle enum annotations also do not replace SQL constraints or request validation; for example, the profile API accepts free-text self-ranking.

## Table inventory

There are 33 application/migration tables in the current migration set. SQLite and local Cloudflare metadata tables are engine-managed and are not business records.

| Table | Key / relationship | Purpose |
| --- | --- | --- |
| `players` | `id`; unique `member_no` | Identity, contact preferences, role, PIN hash, ranking, spouse choice |
| `events` | `id`; unique `date` | Playing dates, registration windows, publication, imported plan |
| `signups` | `id`; unique event/player and event/queue number | Requested hours, availability, status, priority |
| `matches` | `id`; event and player IDs | Court, start time, participants, lock state |
| `match_requests` | `id`; event and creator | Invitations by membership number and accepted player IDs |
| `substitutions` | `id`; unique match/outgoing player | Replacement search and selected replacement |
| `feedback` | `id`; unique match/author | Historical match feedback; submission API currently disabled |
| `registration_defaults` | Singleton `id=1` | Default registration opening/closing offsets |
| `optimizer_defaults` | Singleton `id=1` | JSON factors and related schedule/resource settings |
| `forbidden_pairs` | Composite `member_a`, `member_b` | Canonically ordered same-court exclusions |
| `optimizer_jobs` | UUID `id`; event | Durable calculation state and temporary snapshot |
| `sessions` | `token_hash`; player | Expiry, last activity, MFA credential version |
| `pin_reset_tokens` | `id`; player | Hashed reset tokens and expiry |
| `auth_rate_limits` | Hashed `key` | Attempt counts, expiry, and blocking window |
| `admin_mfa` | `player_id` | Encrypted TOTP secret, credential version, replay step, recovery hashes |
| `mfa_challenges` | `token_hash`; player | Short-lived verification/enrollment state |
| `trusted_devices` | `token_hash`; player | Time-limited second-factor trust bound to MFA version |
| `privacy_documents` | Document type/version | Immutable versioned text and content hash |
| `privacy_acknowledgements` | Player/type/version | Receipt for a specific document version |
| `profile_privacy` | `player_id` | Activity evidence, closure, review/contact state |
| `privacy_review_events` | UUID `id`; player/actor | Review decisions and contact history |
| `newsletter_preferences` | `player_id` | Current subscription, pause, email revision, consent reference |
| `newsletter_events` | UUID `id`; player | Consent and preference evidence |
| `newsletter_tokens` | `token_hash`; player | Personal-link authority tied to email/consent |
| `newsletter_drafts` | UUID `id` | Editable newsletter content |
| `newsletter_dispatches` | UUID `id` | Independent prepared content snapshot |
| `newsletter_recipients` | Dispatch/player | Per-recipient consent, delivery state, provider reference |
| `security_counters` | Bucket/kind | Aggregated security and mail activity |
| `security_role_events` | UUID `id` | Role-change audit |
| `security_mfa_events` | UUID `id` | Administrator MFA-reset audit |
| `security_alert_deliveries` | `id` | Alert delivery receipts |
| `operations_health` | `name` | Successful operational-job timestamps |
| `d1_migrations` | `id`; migration name | Applied migration ledger |

These are logical relationships; not every core relationship has a declared SQL foreign key. JSON references also require application validation. Inspect migrations for the actual constraints before writing repair/import code.

## Identity and member fields

`players.id` is the stable internal identifier. `member_no` is text and preserves leading zeros. Do not use a display name as an identity key. `name` is maintained alongside `first_name` and `last_name` for existing displays/imports.

| Field | Interpretation |
| --- | --- |
| `self_level` | Member-entered ranking text; initial CR mapping is server-side |
| `christin_ranking` | Integer 1–9 or NULL; used by the optimizer; restricted to administration |
| `cr_reviewed_at` | Administrator review timestamp; changing CR requires review again |
| `birth_year` | Optional; age is derived for the current Copenhagen year |
| `age` | Legacy column, not the current age source |
| `spouse_no` | Optional numeric membership-number reference, not player ID |
| `spouse_mode` | 1: starts within 30 minutes; 2: same team |
| `email_visible`, `phone_visible` | Independent contact-sharing preferences |
| `role` | `player` or `admin`; SuperAdmin is an environment-bound capability |
| `suspended_event_id` | Event-specific suspension reference |

Normal members do not receive administrator-only ranking fields or raw spouse configuration. The self-service spouse search returns a limited selected-person view. See [roles](SUPERADMIN.md) and [contact behavior](docs/business-rules.md).

## Registration and calendar

`events.date` is a date without a time. Registration deadlines represent instants and are calculated in `Europe/Copenhagen`, including daylight-saving transitions. `registration_override` is `auto`, `open`, or `closed`; cancelled events remain closed. `registration_schedule_custom` distinguishes an explicitly edited schedule from defaults.

`events.planning_in_progress` is a non-null boolean integer, default false, exposed as `planningInProgress`. Migration [0024](drizzle/0024_planning_in_progress.sql) adds it and the custom `optimizer_jobs_start_planning` trigger. Inserting a queued/running job sets the event flag in the same transaction; rolling back the insert also rolls back the flag. Existing queued/running jobs are backfilled. Publication clears it; solver completion/failure does not. Member writes check the flag atomically. See [registration rules](docs/business-rules.md#calendar-and-registration).

`is_test` marks a test event; `test_active` selects it for the home page. `archived` hides a date without deleting its registrations/history. Re-adding an archived date reuses its original record. The app selects existing dates; it does not generate a new season automatically.

`signups.availability` is a JSON array of start-time strings. `requested_hours` is 0–3 at the application boundary. The API also exposes derived `nHours`, `nPossible`, and `szPossible`; it does not store a redundant availability count.

```json
{"action":"signup","nHours":2,"nPossible":4,"szPossible":["18:30","19:00","19:30","20:00"]}
```

`signup_order` is assigned per event by triggers. Editing hours/availability preserves it; cancellation or zero hours relinquishes the position, and rejoining receives a new position. `created_at` is not the current priority. Missing registrations are represented by derived zero values and `not_registered`, not inserted placeholder rows.

## Match representations

`matches.player_ids` is a JSON array of stable internal IDs. Optimizer match objects use `team1` and `team2`; persisted ordering is significant when reconstructing teams. Each normal match occupies 60 minutes; `start_time` has no date because the event supplies it.

`events.imported_kampplan` is JSON with spreadsheet columns:

| Columns | Meaning |
| --- | --- |
| `A`, `B` | Start and end time |
| `C` | Court |
| `D`, `E` | First team's player names |
| `F`, `G` | Second team's player names |

Optimizer-created rows can include private revision, factor, score, and allocation metadata. API responses strip privileged metadata for other roles. Name-based imports require normalized, unique matches to members; ambiguous names must not silently select an ID.

## Job and privacy state

`optimizer_defaults.weights` also stores `optimizerPriorities`: an ordered array of 12 unique `{id, enabled}` entries. Missing configuration uses the documented default order, with all goals enabled. Priority updates patch this JSON property without replacing factors, resources, court order, or play times; no additional table or migration is needed.

`optimizer_jobs.snapshot.input.optimizerPriorities` freezes the effective configuration at job creation. Priority-only settings changes are excluded from the stale-plan revision guard. Successful plans retain the copied list in the first imported row's private `_optimizerPriorities` metadata after the temporary snapshot is removed.

`optimizer_jobs` allows only one queued/running job per event through a partial unique index. Snapshots are temporary; completion/failure clears them. See [job lifecycle](docs/optimizer-background-jobs.md) for expiry and stale-result handling.

Profile closure is controlled pseudonymization, not a physical deletion. The internal ID, playing history, CR, and CR review timestamp remain. Contact and login data are removed; the member number becomes `closed-<id>`. Triggers block direct deletion and ordinary edits to closed profiles. See [privacy administration](GDPR_ADMIN.md).

Newsletter consent is specific to an email revision and documented event. Email changes invalidate old consent and tokens. Opening a personal link does not itself change a preference.

## Time and secret storage

Do not assume all timestamps use one format. Core session/event fields are text timestamps, MFA challenge/device expiry uses epoch milliseconds, and security monitoring uses epoch seconds. Read the column's producer before converting.

PINs are hashed; session and personal-link tokens are stored as hashes. TOTP secrets are encrypted using `MFA_ENCRYPTION_KEY`, which is outside D1. Copying `admin_mfa` without the corresponding key does not create usable MFA in another environment. [MFA recovery](docs/admin-2fa.md) explains the supported response.

## Migration discipline

Create a new migration for schema changes; do not edit an applied file. Maintain SQL, metadata, and checksums together. Statements use `--> statement-breakpoint`: splitting on semicolons breaks triggers. Do not use `drizzle-kit push` as a replacement for the custom SQL workflow.

The release process verifies a backup, rehearses migrations, and compares original data after the remote migration. See [deployment](DEPLOYMENT.md) and [backup/recovery](GDPR_BACKUP.md). A schema change and a full data refresh are separate operations.
