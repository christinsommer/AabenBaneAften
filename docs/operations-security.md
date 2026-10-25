# Operational security and encrypted backups

The repository defines scheduled GitHub Actions for monitoring and backups. Configuration and a successful manual run must be verified in the actual GitHub/provider accounts; source files alone do not prove active operations.

## Activation and secrets

Apply the relevant migrations and application code through the normal [release](../DEPLOYMENT.md). Monitoring tables originate in migration `0020_security_monitoring.sql`.

Configure these GitHub Actions secrets without putting values in Git:

| Secret | Use |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Target account |
| `OPERATIONS_CLOUDFLARE_API_TOKEN` | Operations D1 access; passed to scripts as `CLOUDFLARE_API_TOKEN` |
| `OPERATIONS_RESEND_API_KEY` | Operations alert sending |
| `BACKUP_ENCRYPTION_KEY` | 32 random bytes represented by 64 hex characters |

Use dedicated credentials with the required scope rather than deployment/DNS/account-administration rights. Verify the actual D1 token scope; do not assume it is restricted to one database. Keep a recovery copy of the backup encryption key outside the services being recovered, and retain older keys until their backups expire.

After workflows reach the default branch, manually run Operations backup, then Security monitor. Verify artifact download and decryption with the recovery key. Enable failed-workflow notifications. Alert recipient routing is currently defined in `scripts/operations-lib.mjs`; changing it is a code/configuration task, not a consequence of editing this document.

## Monitoring behavior

[security-monitor.yml](../.github/workflows/security-monitor.yml) schedules checks at minutes 7, 22, 37, and 52. The monitor processes completed 15-minute buckets and catches up over seven days.

| Threshold per bucket | Meaning |
| --- | --- |
| 10 failed logins | Aggregate across accounts/IPs |
| 1 authentication limit block | Rate-limiter activity |
| 100 accepted emails | Activity alert, not an automatic sending block |
| 1 administrator role change | Includes internal actor/target IDs and new role |

Counters are retained for eight days; role history and alert receipts for 30 days. The monitor performs this cleanup. After a longer outage, inspect provider logs separately. Delivery receipts and provider idempotency reduce duplicates but cannot guarantee exactly-once email across all crash windows.

Security tables do not store raw IP addresses, PINs, session tokens, or recipient addresses. A `security_record_failed` application log means event recording failed while the user action continued; monitoring can therefore miss that event. Observe Worker errors as well.

GitHub scheduling can be delayed or fail to start. Email cannot report a scheduler that never runs or a completely unavailable mail service. An independent heartbeat monitor is needed if that failure mode must be detected. Local Sandbox data is not monitored by these production workflows.

## Daily encrypted backup

[operations-backup.yml](../.github/workflows/operations-backup.yml) runs at 02:23 UTC. It exports D1, encrypts using AES-256-GCM, decrypts and restores in isolated SQLite, and verifies integrity, foreign keys, migrations, and preservation. Only encrypted SQL is uploaded as an artifact, with 30-day retention configured. Temporary plaintext files are removed by the workflow tooling.

The backup heartbeat is recorded after artifact upload. The monitor alerts when no success is recorded for 36 hours. The heartbeat is a deliberate production D1 write: this workflow is not a read-only production operation even though its export reads data.

A daily backup can leave approximately a day's changes between snapshots. Actual provider recovery options and retention require account verification. A database restore rehearsal is not a complete application recovery on a new account.

## Decrypt and rehearse

Download the artifact to protected storage and supply `BACKUP_ENCRYPTION_KEY` securely in the process environment:

```powershell
node scripts/decrypt-backup.mjs INPUT.enc NEW-OUTPUT.sql
node scripts/verify-backup.mjs NEW-OUTPUT.sql NEW-REHEARSAL.sqlite
```

These commands require new output paths and do not import into Production. For actual recovery, freeze writes/sending and reconcile later closure/consent changes using [GDPR_BACKUP.md](../GDPR_BACKUP.md).

Investigate security alerts before deleting evidence. Revoke affected sessions and rotate compromised credentials through the applicable account-recovery procedure. Keep secrets and member content out of incident summaries committed to the repository.
