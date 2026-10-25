# Deployment

Use the checked release workflow for `aabenbaneaften.dk`. This guide describes what the scripts do; it does not establish the currently deployed version or authorize a production change.

## Prerequisites

- Node.js dependencies installed with `npm.cmd ci` and .NET 10 SDK available.
- Cloudflare credentials with the permissions required by the selected operation.
- Docker Desktop with Linux containers for a full optimizer/container release.
- Production secrets for MFA, email, and SuperAdmin verified through the preflight.
- A reviewed migration diff and a protected location for database backups.

Local `.dev.vars` is never uploaded as production configuration. Read [MFA setup](docs/admin-2fa.md), [roles](SUPERADMIN.md), and [Cloudflare boundaries](CLOUDFLARE.md).

## Choose the operation

Run from the project root:

| Command | Effect |
| --- | --- |
| `npm.cmd run release:check` | Local build and tests; no production commands |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy.ps1 -CheckOnly` | Windows wrapper for local release checks |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy.ps1 -WhatIf` | Describe the full deployment without executing it |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy.ps1` | Full website and optimizer release, including remote migration |
| `npm.cmd run release` | Website release and remote migrations; does not deploy the optimizer |
| `npm.cmd run release -- --with-optimizer` | Release including the optimizer |

`ExecutionPolicy Bypass` applies to that PowerShell process. The wrapper resolves its own project directory, writes a transcript, and temporarily stops/restarts this project's development server and local optimizer when necessary. Direct npm release commands do not provide that process-management wrapper.

For the initial production SuperAdmin binding, use `Deploy.ps1 -SuperAdminMemberNo <verified-number>`. This reads the production member, verifies an open administrator, and stores its internal ID as a Worker secret. Subsequent releases preserve an existing binding. See [SUPERADMIN.md](SUPERADMIN.md).

## What the release verifies

[scripts/release.mjs](scripts/release.mjs) is the authoritative sequence:

1. Acquire a release lock and validate Cloudflare configuration.
2. For real releases, preflight MFA/email secret presence and SuperAdmin configuration. Local check mode skips production calls.
3. Build/test the .NET optimizer, create a new release UUID, and build the OpenNext artifact.
4. Run the Node test suite serially. Check mode stops here.
5. Export Production D1 and restore it to isolated SQLite. Check integrity, foreign keys, migration compatibility, and data preservation.
6. Apply pending remote migrations. Export again and compare original table content.
7. For a full release, deploy/check/connect the optimizer after database migration.
8. Apply the verified SuperAdmin binding when needed, then deploy the website.
9. Poll `/api/health` for the expected release UUID. Recheck the optimizer on a full release and write the receipt.

Do not run optimizer deployment ahead of a required database migration: its cron and Workflow use D1. Changes to match rules usually require both website and optimizer deployment.

## Migration workflow

Edit the appropriate schema source and generate a new migration where applicable:

```powershell
npm.cmd run db:generate
npm.cmd run db:setup
```

Review generated SQL before use. Custom SQL tables are not fully modeled in Drizzle; maintain custom migrations, journal/snapshot metadata, and `drizzle/checksums.json` consistently. Never rewrite an applied migration or replace this process with schema push. Prefer additive changes; destructive changes require a specific data migration/recovery plan.

The release comparison preserves original columns and rows while permitting additions. Keep member changes quiet during the before/after export interval: a legitimate concurrent write can otherwise stop verification.

## Output and failures

Artifacts are private under `.data/releases/`, including SQL exports, isolated restore files, logs, and a successful `receipt.json`. Exports contain personal data and authentication material. Git ignore rules do not prevent cloud-folder synchronization.

A failed step stops later steps. Each child step has a 15-minute timeout and periodic progress output. Optimizer rollout waiting is configurable with `-ContainerWaitMinutes` (1–60, default 15).

There is no automatic database rollback. If migration succeeds and deployment fails, the database has already changed. Inspect logs, completed steps, and backups before retrying. Use the [recovery procedure](GDPR_BACKUP.md) when data restoration is actually necessary.

`release.lock` prevents concurrent releases. Remove a stale lock only after verifying that no release is running. A successful local check does not prove that credentials or remote services will work later.

## Commands that bypass checks

`cf:deploy`, manual remote SQL, and individual optimizer deploy/connect commands bypass parts of the coordinated release. They are not substitutes for the normal workflow. `optimizer:check` performs authenticated remote health/solver checks with synthetic input; it is not an offline test.

Local checks change build outputs and `lib/release-info.json`, even though they do not change Production. Stop local development before invoking full builds directly.
