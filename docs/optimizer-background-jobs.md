# Durable optimizer jobs

See [architecture](architecture.md) for runtime boundaries and the
[optimizer guide](../optimizer-service/README.md) for solver setup and rules.

The UI submits a short authenticated POST to `/api/optimizer/jobs`. It persists an immutable input snapshot and returns 202. At that point the browser can disconnect or log out. A unique partial index permits one queued/running job per event, including concurrent requests from different admins.

The optimizer Worker's minute cron dispatches the D1 outbox to Cloudflare Workflows with the job UUID as the instance ID. A lost start response cannot lose or duplicate a job. The Workflow calculates against the stored snapshot and saves the draft in a separate retriable step. It does not use the originating browser signal or session. Transient solver errors retry twice; an infrastructure restart can cause recomputation of the same snapshot. Final saving is atomic and idempotent.

The prior plan is retained until a new result is successfully saved. Saving a new result sets draft status and clears published_at. Publication always requires the admin button. Editing a plan, schedule or optimizer settings while computing invalidates the save, except for objective priorities: their ordered IDs and enabled flags are copied into `snapshot.input.optimizerPriorities`, and later priority changes apply only to new jobs. The saved plan retains this copy in private `_optimizerPriorities` metadata. Member attributes and signups can change and produce separate persisted warnings instead, combined when both changed. Signup additions, deletions, cancellations, waitlist status, hours and availability are compared atomically when saving; the latest signups are never overwritten. The draft and allocation summary use the original snapshot. Member additions/deletions remain conflicts to avoid restoring deleted people. Saved names and scores reflect the input snapshot. Changing a field and reverting it before completion cannot be detected by snapshot comparison.

Admins poll every five seconds while visible and immediately on focus/visibility restoration. Polling does not start or finish work. On login or remount the latest job and its warning/summary are retrieved. Normal members cannot access this endpoint or see drafts. The old synchronous API remains for compatibility and manual editing; the calculation button exclusively uses the durable API.

Snapshots contain member names, membership numbers and optimizer attributes, never PIN hashes, sessions or API secrets. They are cleared on completion/failure. Cron expires abandoned jobs after two hours and removes terminal job records after 30 days. Snapshot-derived allocation summaries remain with their plan, just like the plan's player names.

## Deployment

The job table was introduced by `0019_amused_quasimodo.sql`. Deploy the optimizer Worker (Workflow + minute cron + D1 binding) and the app with all required migrations. Use the [release procedure](../DEPLOYMENT.md) with `--with-optimizer`; migration and backup verification precede optimizer deployment so cron cannot access a missing table. The authenticated `/jobs-health` check verifies job-protocol availability. The shared production D1 binding and optimizer secret are used; there is no browser callback credential.

Source code does not establish live deployment status. Workflows and cron must be available in the target account. For local development, run the website and optimizer Worker against the same local D1 persistence and dispatch scheduled events through the local Wrangler setup. Plain `next dev` does not execute the cron/Workflow. The standalone .NET solver is not a durable job dispatcher. Do not copy production service URLs into local configuration to work around a missing local dispatcher.

## Verification

Integration tests use an isolated D1 database and a controlled solver response: authorization, duplicate start, cron dispatch without a browser, logout before calculation, original member/signup snapshots, persistent and combined warnings, signup preservation, draft-only save, repeated completion and concurrent publication conflict. Production rollout should additionally verify a real long-running job while closing the browser, then logging back in; server/job state must finish independently. Test an actual locked smartphone as well, since local automated tests do not reproduce device OS suspension.

Implementation: [job core](../lib/optimizer-job-core.ts), [Worker jobs](../optimizer-cloudflare/jobs.js), and [Worker configuration](../optimizer-cloudflare/wrangler.jsonc).
