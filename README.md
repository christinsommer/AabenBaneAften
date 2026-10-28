# Åben Bane

A Danish-language club application for member registration, playing preferences, match planning, replacements, and administration. The website runs on Next.js and Cloudflare Workers with D1 storage. A separate .NET service uses Google OR-Tools CP-SAT to calculate match plans.

The app is named **Åben Bane**. This installation serves HIK and may be presented as **Åben Bane HIK**; it is not an official HIK app. Its values are *Spilleglæde · Gode kampe · Fællesskab*. See the [approved login design and branding](docs/login-design.md).

This documentation describes the repository implementation, not proof of what is currently deployed. Documentation is in English; quoted Danish labels match the application interface.

## Start here

| Task | Guide |
| --- | --- |
| Set up the local application | [Development](docs/development.md) |
| Understand components and data flow | [Architecture](docs/architecture.md) |
| Understand registration and match rules | [Business rules](docs/business-rules.md) |
| Understand tables and migrations | [Data model](DATAMODEL.md) |
| Build, verify, and publish | [Deployment](DEPLOYMENT.md) |
| Refresh local data from Production | [Sandbox refresh](docs/sandbox-refresh.md) |
| Configure or recover administrator MFA | [Administrator MFA](docs/admin-2fa.md) |
| Understand administrator permissions | [Admin and SuperAdmin](SUPERADMIN.md) |
| Find operational guides | [Documentation index](docs/README.md) |

## Local quick start

Prerequisites: Node.js 22.13 or later, npm, Windows PowerShell for the supplied launcher, and .NET 10 SDK for optimizer builds and the full test suite. Run from the repository root:

```powershell
npm.cmd ci
# First setup only: do not overwrite an existing .dev.vars.
Copy-Item .dev.vars.example .dev.vars
node scripts/setup-mfa.mjs --local
npm.cmd run dev
```

Open <http://localhost:3000>. The development command frees port 3000 and applies local database migrations before starting Next.js. Read the [development guide](docs/development.md) before using it alongside another local server.

A new database has no administrator or production members. Public registration creates ordinary members only. See [administrator provisioning](SUPERADMIN.md). For production data, explicitly choose a sanitized refresh or full copy in the [Sandbox guide](docs/sandbox-refresh.md).

Local D1 lives under `.wrangler/local-dev/v3`. Production is a separate remote database. `.dev.vars` is local configuration and is not uploaded during deployment.

## Verification

```powershell
npx.cmd tsc --noEmit
npm.cmd run optimizer:test
npm.cmd run release:check
```

`release:check` builds the Cloudflare artifact and runs release tests without production calls. It writes local build outputs and a new release identifier. Stop the development server first. See [development checks](docs/development.md#verification) for focused tests and lint.

## Contributing

Read [AGENTS.md](AGENTS.md). Update relevant documentation when behavior changes, preserve migration history, and keep credentials, database exports, and real member data out of Git. Third-party license text in `vendor/` is retained verbatim.
