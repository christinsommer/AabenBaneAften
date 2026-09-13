# HIK Åben Bane

Next.js-webapp på Cloudflare Workers med D1.

- Lokal udvikling: `npm run dev` (http://localhost:3000).
- Kontrol uden udgivelse: `npm run release:check`.
- Udgivelse med test, databasebackup og migrationer: `npm run release`.

Se [DEPLOYMENT.md](./DEPLOYMENT.md) for opsætning, databaseændringer og fejlhåndtering.
Brug `npm.cmd` i PowerShell, hvis maskinens scriptpolitik blokerer `npm`.

Node.js skal være mindst 22.13. Installer afhængigheder med `npm ci` ved første opsætning.
Lokale data ligger i `.wrangler/local-dev/v3`. Den oprindelige `.data/app.db` bevares.
