# Documentation index

These guides describe repository behavior. Live configuration, deployment versions, permissions, and provider billing require separate operational verification.

## Build and understand

| Guide | Purpose |
| --- | --- |
| [Project overview](../README.md) | Starting point |
| [Development](development.md) | Setup, configuration, tests, and troubleshooting |
| [Architecture](architecture.md) | Runtime boundaries, APIs, and source map |
| [Data model](../DATAMODEL.md) | Table inventory, relationships, and migrations |
| [Business rules](business-rules.md) | Registration, ranking, spouse rules, and replacements |
| [Optimizer](../optimizer-service/README.md) | Solver objectives, scoring, and service setup |
| [Background jobs](optimizer-background-jobs.md) | Calculation lifecycle and conflicts |
| [Forbidden pairs](forbidden-player-pairs.md) | Same-court exclusions |

## Operate and support

| Guide | Purpose |
| --- | --- |
| [Deployment](../DEPLOYMENT.md) | Release workflow and failure handling |
| [Cloudflare](../CLOUDFLARE.md) | Worker and database configuration |
| [Sandbox refresh](sandbox-refresh.md) | Sanitized versus full copying |
| [Admin and SuperAdmin](../SUPERADMIN.md) | Roles and account binding |
| [Administrator MFA](admin-2fa.md) | Enrollment, keys, and recovery |
| [Security controls](security-controls.md) | Authentication limits and sessions |
| [Operational security](operations-security.md) | Monitoring and encrypted backups |
| [Email delivery](email-delivery.md) | PIN reset delivery and diagnosis |
| [Performance](../PERFORMANCE.md) | Measurement and implementation tradeoffs |
| [Privacy administration](../GDPR_ADMIN.md) | Review, closure, and newsletters |
| [Backup and recovery](../GDPR_BACKUP.md) | Restore rehearsal and reconciliation |
| [Privacy implementation record](../GDPR_SLUTRAPPORT.md) | Historical evidence and open operational decisions |

## Maintenance conventions

Write in English; retain identifiers and quoted Danish UI labels. Verify behavior against source and tests. Keep current instructions separate from dated observations and proposed improvements. Document command side effects and expected outcomes. Use relative links and language-tagged code fences. Preserve vendor licenses and the framework-generated instructions in `AGENTS.md`.

Reviewed against the workspace on 2026-10-25. Describing an implemented feature does not establish that it has been deployed.
