# Performance and diagnosis

The repository targets Cloudflare Workers and D1. Runtime limits depend on the actual account and plan; this document deliberately does not state provider prices or quotas as current facts.

## Current implementation

- The home page is dynamically rendered to provide a fresh CSP nonce. It is not a static shared page.
- Personal application state is fetched from `/api/app`; do not put it behind a shared public cache.
- Ordinary successful mutations reuse returned state. Login verifies that the browser sends the new session cookie through a separate request.
- Home-page polling runs every 60 seconds, skips hidden tabs, avoids overlapping background calls, and throttles focus refreshes. Durable optimizer jobs have their own five-second visible polling.
- Spreadsheet dependencies are loaded for import/export rather than every ordinary view.
- Anonymous state avoids some authenticated queries, and ordinary members do not receive unpublished matches.
- Request failures include HTTP status and a Cloudflare Ray ID when available. Mutations are not automatically replayed because a write may have committed even if its response failed.
- Worker observability is enabled in repository configuration. Its live state depends on deployment/account configuration.

## Investigate before changing limits

1. Record the request time, operation, status, and Ray ID without collecting tokens or member content.
2. Inspect Worker logs for CPU-limit errors, exceptions, and D1 failures.
3. Compare latency, CPU distribution, and failure rate by endpoint and method. Local wall-clock latency is not Worker CPU usage.
4. Inspect D1 rows read/written and query scans. Returned row count alone does not measure scanned rows.
5. Separate website work from solver time, container startup, queued-job dispatch, and external email latency.

Administrative state includes substantial member/history data. If measurement identifies it as a bottleneck, consider loading sections through dedicated endpoints when opened. This is a possible improvement, not an implemented guarantee.

Check the actual provider account before capacity decisions. Do not weaken PIN hashing, authorization, or data filtering to fit an assumed plan limit. Deployment instructions are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Local verification limits

A fast local test does not establish production capacity. Build success does not prove that a container is deployed or a cron runs. Full release verification checks the expected health identifier; monitoring still needs to observe real runtime behavior.
