# HIK Åben Bane

Next.js-webapp på Cloudflare Workers med D1.

- Lokal udvikling: `npm run dev` (http://localhost:3000).
- Kontrol uden udgivelse: `npm run release:check`.
- Udgivelse med test, databasebackup og migrationer: `npm run release`.

Se [DEPLOYMENT.md](./DEPLOYMENT.md) for opsætning, databaseændringer og fejlhåndtering.
Brug `npm.cmd` i PowerShell, hvis maskinens scriptpolitik blokerer `npm`.

På Windows frigør `npm run dev` automatisk port 3000 ved at stoppe den proces,
der lytter på porten, inklusive dens underprocesser. Gamle Next.js-servere fra
dette projekt stoppes også, hvis de kører på andre porte og låser projektet. Derefter klargøres den lokale
database, og appen starter på http://localhost:3000. Brug samme kommando til at
genstarte en tidligere kørende version. Opstarten afbrydes, hvis porten ikke kan
frigøres; den skifter ikke automatisk til port 3001.

Node.js skal være mindst 22.13. Installer afhængigheder med `npm ci` ved første opsætning.
Lokale data ligger i `.wrangler/local-dev/v3`. Den oprindelige `.data/app.db` bevares.
