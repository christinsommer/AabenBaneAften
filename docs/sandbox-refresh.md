# Production data and local Sandbox

The source and destination must be explicit before copying. Production is remote D1 for `aabenbaneaften.dk`. This repository's normal Sandbox is local D1 under `.wrangler/local-dev/v3`, not a second remote database named Sandbox.

## Choose the copy contract

| Operation | Data | Authentication | Local configuration |
| --- | --- | --- | --- |
| `Refresh-Sandbox.ps1` | Selected tables/fields, pseudonymized | Removes live credentials/state; creates test accounts | Changes selected settings, including mail and optimizer configuration |
| Full exact copy | All requested application tables and row values | Includes MFA, sessions, reset tokens, trusted devices, and job/mail state | Preserved unless explicitly included in the task |

The supplied refresh script is not an exact copy. Do not use it for a request to copy all tables without changing values. A full-copy procedure must be reviewed separately; the repository currently has no maintained general-purpose exact-copy command. One-off ignored workspace scripts/reports are not a supported public interface.

Neither operation should import into Production. A production export is read-only with respect to table data, though the provider can temporarily make queries unavailable while exporting. Use direct export tooling for a read-only source; app pages may write activity or event defaults.

## Standard sanitized refresh

Stop the local development server first. The script refuses to run while it detects the project's development process or a conflicting deployment lock.

```powershell
# Describe the operation without exporting or replacing data.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Refresh-Sandbox.ps1 -WhatIf

# Export, sanitize, and verify in staging; do not activate.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Refresh-Sandbox.ps1 -PrepareOnly

# Export a fresh snapshot, sanitize, verify, and replace local Sandbox.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Refresh-Sandbox.ps1
```

Requirements: installed Node dependencies and Cloudflare login/export access. `ExecutionPolicy Bypass` is scoped to that PowerShell invocation.

The script preserves selected playing records and registration/default settings. Names become `Testspiller <id>`, membership numbers are remapped, emails become invalid test addresses, and phones are removed. Related spouse numbers, exclusions, and imported plan names are rewritten. Ambiguous historical names stop the copy.

Production PINs, sessions, MFA, trusted devices, reset links, newsletter consent/send state, optimizer jobs, and tables outside the allowlist are not copied. Feedback comments and certain optimizer metadata/settings are cleared. Closed profiles remain closed. See the exact allowlist in [scripts/sandbox-copy.mjs](../scripts/sandbox-copy.mjs).

The result is pseudonymized, not anonymous: IDs, birth years, and playing relationships can remain identifying.

### Test accounts and configuration

The script creates test members `90000001` (SuperAdmin) and `90000002` (member). Their random PINs are kept privately in `.data/sandbox-refresh/test-logins.json` and reused on later sanitized refreshes. The test administrator enrolls in local MFA after each refresh.

The script clears `RESEND_API_KEY`, sets `NEWSLETTER_ENABLED=false`, binds the test SuperAdmin ID, and sets `OPTIMIZER_URL=http://127.0.0.1:5117`. It generates a local MFA encryption key if necessary. Other settings are preserved. Starting the local solver still requires its matching API key.

### Backup, activation, and interruption

Each run uses its own `.data/sandbox-refresh/` directory. `verification.json` describes the verified staging copy. Activation moves the old stopped local state to `local-dev.before` and saves existing settings as `dev.vars.before`. Handled activation failures attempt to restore both.

Raw Production SQL is temporarily placed in a uniquely named Windows TEMP directory and removed during normal completion/error handling. A forced process termination can leave that directory behind. Inspect and remove only the verified temporary directory after diagnosis.

For interrupted activation, stop local services, preserve the failed state, and restore the selected `local-dev.before` and matching configuration backup. Restoring settings may re-enable email. Verify the environment before restarting.

A `.data/sandbox-refresh/paused` file pauses the script. No scheduled task is installed automatically. A scheduled `-PrepareOnly` run creates staging data; it does not activate that data on a later run, which exports again.

## Requirements for an exact copy

For a specifically authorized full copy:

1. Confirm remote source identity and resolve the local destination path. Avoid remote write commands entirely.
2. Export the source and inspect the table/schema inventory without printing row data or secrets.
3. Stop local writers and background workers; take a consistent destination backup.
4. Check compatible schemas. Replace table content transactionally, preserving row values and preventing triggers from transforming imported data. Restore any temporarily suspended local triggers before committing. Do not casually disable constraints in the running app.
5. Verify every copied table using row counts and deterministic content hashes. Check integrity and foreign keys, and verify that unrelated metadata/configuration is unchanged.
6. Store a private report and backup. Treat starting the app or queued-job dispatcher as a separate step that can immediately change the copied snapshot.

This is an operational checklist, not a promise that arbitrary schemas or future tables can be copied without adaptation. Engine metadata is not interchangeable with application data.

## MFA after an exact copy

`admin_mfa.secret` is encrypted by the source environment's `MFA_ENCRYPTION_KEY`. An exact table copy carries ciphertext but does not copy that key. If Sandbox uses its own key, copied MFA enrollment cannot be decrypted there.

Prefer an explicitly authorized reset of the affected Sandbox administrator followed by local enrollment. Preserve the production key and enrollment. Copying production secrets into local settings is not necessary to fix local login. See [administrator MFA](admin-2fa.md#production-data-copied-to-sandbox).

A complete copy also includes sessions, trusted devices, pending jobs, and newsletter state. Preserve these when an exact copy is required; any cleanup or sending/configuration change is a separate, explicit operation.

## Storage of private artifacts

Backups and exports are Git-ignored, but that does not prevent OneDrive synchronization or access by other users. Protect access and retention for the actual storage location. Never put member rows, MFA secrets, recovery codes, or signed export download URLs into committed documentation.
