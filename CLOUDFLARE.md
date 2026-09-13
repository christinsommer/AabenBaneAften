# Cloudflare

Den aktuelle vejledning er [DEPLOYMENT.md](./DEPLOYMENT.md).

Worker: `aabenbaneaften`. Domæne: `aabenbaneaften.dk`. Databasebinding: `DB`.
Lokal udvikling bruger `.wrangler/local-dev/v3`, adskilt fra produktionsdatabasen.

Brug `npm run release:check` for at teste og `npm run release` for at udgive.
Ældre manuelle eksport-/importkommandoer er ikke nødvendige i den nye arbejdsgang.
