# Match optimization with OR-Tools CP-SAT

The website delegates automatic planning to a .NET 10 service using Google OR-Tools 9.15.6755. The C# solver and independent TypeScript validator must agree on match rules. There is no JavaScript heuristic fallback.

See [business rules](../docs/business-rules.md) for registration, spouse modes, exclusions, and manual-review exceptions. This guide covers the solver and its integration.

## Local service

Run from the repository root with .NET 10 SDK installed:

```powershell
npm.cmd run optimizer:test
npm.cmd run optimizer:start
```

The test command restores locked NuGet dependencies, builds, and runs the actual solver self-tests. The start command runs on `http://127.0.0.1:5117` and creates missing `OPTIMIZER_API_KEY`/`OPTIMIZER_URL` values in local `.dev.vars`. Existing settings are preserved; inspect the URL's environment before using it. App and solver keys must match and contain at least 32 characters. Restart the app after settings change.

This standalone service handles `/solve`; it does not dispatch durable jobs. The UI calculation button uses the [background-job workflow](../docs/optimizer-background-jobs.md), which also needs the optimizer Worker, shared local D1 persistence, and cron dispatch. Plain `next dev` plus this service is insufficient for that queue.

For an offline calculation with an already built binary:

```powershell
dotnet optimizer-service/bin/Debug/net10.0/OptimizerService.dll --solve-file input.json result.json
```

Use the service input JSON format. Keep real member snapshots in protected, Git-ignored storage such as `work/`; do not commit them as test fixtures.

## Service and production boundary

The raw .NET service exposes a public `/health` and authenticated `/solve`. It accepts one solve at a time and returns 429 while occupied. Production wraps it with `aabenbane-optimizer`, whose Worker authenticates all supported endpoints, including `/health` and `/jobs-health`, before starting/accessing the container.

[Cloudflare configuration](../optimizer-cloudflare/wrangler.jsonc) defines one `standard-4` container instance and the Workflow/cron bindings. The container sleeps after two minutes of inactivity and has outbound internet disabled. The Worker shares production D1 with the website; the raw solver does not directly read D1.

Solver input contains internal IDs, membership numbers, CR, gender, optional derived age, spouse settings, availability, requests, queue order, status, historical team IDs, exclusions, and configuration. Display names and contact/login credentials are not sent to the raw solver. The durable job snapshot stored by the application also contains names used for saving the plan; do not confuse these two payloads.

Resources are configurable: 1–32 search workers, default 4; 1–900 seconds, default 600. CPU threads share the host's resources. Inputs are limited to 200 players and 32 court/time slots. Cold start, transport, and model construction add overhead beyond the search budget.

## Objectives, in priority order

Later stages may improve an earlier stage's achieved value but may not reduce it. They can rearrange times and teams while preserving those bounds.

1. Maximize active members receiving a first hour, then a second, then a third, within requests.
2. Favor earlier active signup positions when hour coverage is equal.
3. Apply the same hour-coverage and queue priorities to waitlisted members. They may already be used as partners to help active members.
4. Maximize match count.
5. Maximize total score.
6. Favor player-hours at earlier start times.
7. Apply configured court preference order as a final tie-break.

For each status group, first/second/third-hour weights use `(n+1)^2`, `n+1`, and `1`; lower-priority hours cannot compensate for losing a first hour. Up to seven start times use one weighted early-time objective; larger sets use separate objectives to avoid integer overflow.

Search stages share the total budget, can use multiple randomized starts, and retain a complete incumbent. Only a result with all stages proven optimal is labeled `OPTIMAL`; a valid unproven result is `FEASIBLE`. Repeated search is not a guarantee of global optimality. See [Scheduler.cs](Scheduler.cs) for exact budget allocation.

## Scoring factors

The starting score is 100 per match. Factors apply penalties unless a configured value changes their sign. Parsing accepts bounded integers; do not infer validation solely from the word “penalty”.

| Factor | Default | Role |
| --- | ---: | --- |
| `FactorMatchDifference` | 40 | Difference between team strength totals |
| `FactorSameTeamDifference` | 15 | Sum of partner CR differences in doubles |
| `FactorDistanceSameTeamA` | 2 | Hard partner-distance limit for CR 1–4; not a score term |
| `FactorSameTeamLastWeek` | 20 | Partnership repeated from the latest qualifying round |
| `FactorSameTeam3Weeks` | 10 | Partnership present in any of the last three qualifying rounds |
| `FactorOpponentLastWeek` | 5 | Opponent pair repeated from the latest qualifying round |
| `FactorOpponentThisWeek` | 5 | Each opponent-pair meeting after the first in this plan |
| `FactorDoubleSameSex` | 5 | Four players of one gender in doubles |
| `FactorSingle` | 10 | Singles match |
| `Factor3OfAKind` | 30 | Three players of one gender in doubles |
| `FactorAge` | 0 | Known-age partner and team-total differences |

History penalties can accumulate: a partnership from the last round can incur both partner-history penalties. An unordered relationship counts once per historical condition. Within-plan opponent penalties apply once per additional pair meeting, including singles.

For doubles, the known-age expression is `abs(A-B) + abs(C-D) + abs(A+B-C-D)`. A partner term requires both ages; the team-total term requires all four. Singles use the two known ages. Missing age never prevents participation.

Spouse mode 2 exempts only that pair from CR-distance constraints and the partner CR-difference term; other constraints and penalties remain. Mode 1 allows a one-to-one correspondence of assigned starts within 30 minutes. See [spouse rules](../docs/business-rules.md#spouse-choices).

Default values and score formulas are defined in [lib/optimizer.ts](../lib/optimizer.ts), with help text in [lib/optimizer-settings.ts](../lib/optimizer-settings.ts). SuperAdmin manages factors/resources; ordinary administrators calculate with stored settings.

## Saving and editing

A successful durable result replaces the existing plan with a draft. Failed calculations retain the previous plan. Publication remains explicit. Revision checks prevent stale plan/settings from being overwritten; some signup/member changes produce persisted warnings instead. See [background jobs](../docs/optimizer-background-jobs.md).

Manual editing calls the TypeScript reviewer, not the solver. It can permit the specific partner-distance exception while still enforcing other constraints. Scores and saved factor metadata are recalculated consistently. Missing inputs for older/imported score calculation are shown as unavailable rather than invented.

The unfulfilled-wishes report is calculated from the displayed plan and current registrations. Excel export places it after the match rows; import reads only the matches. Duplicate names require review.

## Deployment

Use the coordinated [deployment workflow](../DEPLOYMENT.md), which migrates/verifies D1 before deploying the optimizer and then the website. Updating only one side of a rule change can make solver proposals fail application validation.

The lower-level `optimizer:deploy`, `optimizer:check`, and `optimizer:connect` commands are operational tools, not local tests. Connect sets website Worker secrets after checking the service. Production key material is kept in ignored `.data/optimizer-production/key`; do not delete or disclose it during ordinary cleanup.

The current health compatibility marker is `optional-ages-v8` in both the service and checker. It is a compatibility assertion, not a unique build identifier or proof that every recent rule edit is deployed.

## Tests

- `npm.cmd run optimizer:test`: real C# solver, including shifted spouse starts and invalid locked plans.
- `node --test tests/optimizer.test.mjs tests/spouse.test.mjs tests/plan-review.test.mjs`: independent TypeScript validation/review.
- `tests/optimizer-api.test.mjs`: API-to-solver integration with isolated D1; requires its build prerequisites.
- `tests/optimizer-jobs.test.mjs`: durable lifecycle and persistence scenarios.
- `node scripts/check-plan-editor.mjs`: Windows Edge interaction checks using isolated fake data.

Do not interpret local test success as a completed production rollout.
