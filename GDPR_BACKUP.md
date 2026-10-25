# Backup, migrations, and recovery

Backups are private operational data. They can contain member details, credential hashes, sessions, and encrypted MFA secrets. A Git-ignored path is not an access-control or retention policy, particularly in a cloud-synchronized workspace.

## Scope and prerequisites

Production uses Cloudflare D1 for `aabenbaneaften.dk`; local D1 lives under `.wrangler/local-dev/v3`. The legacy `.data/app.db` is not the normal active database. Confirm which source is being backed up and where artifacts will be stored.

Account jurisdiction, provider agreements, actual retention, access permissions, synchronization, and key custody are operational facts that source code cannot establish. The owner must maintain them separately.

## Export and restore rehearsal

Stop local development before a local backup/rehearsal:

```powershell
node scripts/backup-privacy.mjs --local
```

For a separately authorized Production export:

```powershell
node scripts/backup-privacy.mjs --remote
```

The local path uses the D1 engine export interface against the configured persistence directory. Remote export uses Wrangler's D1 export command and does not import or mutate production table data.

Artifacts are written to `.data/privacy-backups/<timestamp>/`. The script restores the export into isolated SQLite, checks integrity and foreign keys, rehearses pending migrations, and verifies repeatability and preservation using counts/content hashes. It does not print member records or credentials. Logs and database files remain private.

Hashes demonstrate consistency, not protection against an operator modifying both a file and its manifest. Preserve a protected independent copy where required.

## Migration preservation

`drizzle/checksums.json` records expected SQL content. Applied migration files are immutable; new schema changes require new migrations. Custom privacy tables are maintained through SQL rather than schema push.

The normal [release](DEPLOYMENT.md) exports and rehearses before remote migration, exports again afterwards, and compares original columns/rows. Quiesce legitimate writes during the comparison window to avoid false conflicts. No automatic rollback follows a failed release.

## Recovery without undoing later privacy choices

An old backup is not automatically safe to reopen as the live application.

1. Stop user traffic, background work, and all mail sending for the target environment. `NEWSLETTER_ENABLED=false` alone does not stop transactional email.
2. Capture a consistent latest database after the freeze. Preserve requests and changes received outside the app separately.
3. Restore both the old backup and latest frozen copy in isolation; bring them to the supported schema using verified migrations.
4. Produce a new reconciled copy:

```powershell
node scripts/privacy-restore.mjs OLD.sqlite LATEST-FROZEN.sqlite NEW-OUTPUT.sqlite
```

5. The script reapplies recorded privacy state, closures, preferences, pauses, and audit evidence. It revokes sessions, reset codes, and newsletter links and excludes old queued dispatches from sending. Email identity mismatches require renewed consent.
6. Identity conflicts or historical references that could reidentify a later-closed member stop automatic reconciliation. Output may exist after failure; do not use it as a verified restore. Without the latest copy or equivalent complete evidence, later changes cannot be established automatically.
7. Review name replacements, free text, mail/plan archives, exports, new members, and external records. The helper does not resolve every external or historical relationship.
8. Validate roles, counts, authentication, playing history, consent, and closure behavior in isolation before an authorized production import. Enable traffic and email separately afterwards.

The reconciliation helper never imports into Production. Its synthetic tests are not proof that an end-to-end disaster recovery has been completed on a new provider account.

## Encryption keys and authentication

Recovering encrypted operational backups needs `BACKUP_ENCRYPTION_KEY`. Recovering usable TOTP enrollment needs the original `MFA_ENCRYPTION_KEY`; these are different keys. Preserve historical keys until their backups expire.

A full Production-to-Sandbox copy is not a disaster restore. Local MFA re-enrollment may be preferable to copying the production key. See [Sandbox refresh](docs/sandbox-refresh.md) and [MFA](docs/admin-2fa.md).

## Scheduled backups

GitHub Actions defines an encrypted daily export with a restore rehearsal and artifact retention. See [operational security](docs/operations-security.md) for schedules, secret names, failure detection, and decryption commands. A workflow file existing in Git is not evidence that scheduling, credentials, uploads, or recovery-key access work in the live account.
