# Repository instructions

## Project context

This is a Danish-language club application. Keep user-facing text in Danish unless requested otherwise; write project documentation in English. Start with [README.md](README.md) and [docs/README.md](docs/README.md).

The website uses Next.js, OpenNext, Cloudflare Workers, and D1. The optimizer is a separate .NET 10 / OR-Tools service. Local Sandbox and remote Production are different databases even though configuration uses the same binding name.

## Working rules

- Inspect the current diff and preserve unrelated work and local configuration.
- Read the installed Next.js documentation as required by the generated block below.
- Keep authorization on the server. SuperAdmin is a configured internal player ID plus the admin role, not a separate database role.
- Match-rule changes must agree between `lib/optimizer.ts` and `optimizer-service/Scheduler.cs`; update both layers' tests when applicable.
- Read `db/schema.ts` and SQL migrations. Custom SQL defines tables and triggers absent from Drizzle's schema.
- Add migrations rather than rewriting applied SQL. Maintain the journal, snapshots, and checksums through the established workflow. Preserve statement breakpoints; do not use schema push to bypass custom SQL.
- Use synthetic data and isolated databases for tests. App requests can update sessions, activity, or event defaults even when they appear read-oriented.
- Identify the database target and copy direction before database operations. Full copies and sanitized refreshes have different contracts; see [Sandbox refresh](docs/sandbox-refresh.md).
- Ordinary code/documentation work does not authorize deployment, real email, or production writes. When the user has already authorized the specific operation, continue within that scope without asking for the same approval again.
- Never print credentials, PIN hashes, session tokens, MFA secrets, or raw member exports. Keep private operational artifacts in ignored directories.

## Verification and reporting

Use checks appropriate to the change; see [development](docs/development.md). `release:check` is local but changes build outputs and `lib/release-info.json`. Stop development before full builds. Do not run deployment or remote database commands to validate documentation.

Report changes, checks actually run, and unresolved limitations. Distinguish implementation, local verification, and deployment. Use relative links in committed Markdown and maintain one authoritative guide per topic.

## Installed framework instructions

Preserve the following generated block.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
