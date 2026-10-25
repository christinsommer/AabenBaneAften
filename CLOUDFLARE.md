# Cloudflare configuration

Use [DEPLOYMENT.md](DEPLOYMENT.md) for releases and [docs/development.md](docs/development.md) for local setup.

| Component | Repository configuration |
| --- | --- |
| Website Worker | `aabenbaneaften`, configured in `wrangler.jsonc` |
| Custom domain | `aabenbaneaften.dk` |
| D1 binding | `DB`, with an additional alias `aabenbaneaften` |
| Remote D1 | Database name `aabenbaneaften`; both aliases refer to the same ID |
| Optimizer Worker | `aabenbane-optimizer`, configured in `optimizer-cloudflare/wrangler.jsonc` |
| Optimizer jobs | Workflow binding plus a once-per-minute cron |
| Local D1 persistence | `.wrangler/local-dev/v3` |

The optimizer's production D1 binding points to the same remote database as the website. Local development simulates bindings; a production database ID in configuration does not mean local commands automatically access Production. Check command flags and persistence paths explicitly.

Local secrets are in ignored `.dev.vars`. Production secrets are configured on the appropriate Worker. Do not copy local keys into Production as an incidental deployment step.

Repository configuration does not prove current account settings, deployment status, jurisdiction, billing, or backup retention. Inspect those separately when authorized operations require it. [Performance](PERFORMANCE.md) explains which runtime measurements to collect.
