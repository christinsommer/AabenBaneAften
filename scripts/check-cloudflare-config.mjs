import { readFileSync } from "node:fs";

const config = readFileSync("wrangler.jsonc", "utf8");
const parsed = JSON.parse(config);
const db = parsed.d1_databases?.find(binding => binding.binding === 'DB');
if (!db || db.database_id !== 'f6e9f950-cd58-4c81-b707-98cd1753c800' || db.migrations_dir !== 'drizzle') throw new Error('Unexpected production database configuration');
if (parsed.d1_databases.some(binding => binding.remote)) throw new Error('Local development must not use remote D1 bindings');
if (parsed.name !== 'aabenbaneaften' || !parsed.routes?.some(route => route.pattern === 'aabenbaneaften.dk' && route.custom_domain)) throw new Error('Unexpected production Worker/domain');
if (config.includes("00000000-0000-0000-0000-000000000000")) {
  console.error("Opret eller vælg en D1-database, og indsæt dens database_id i wrangler.jsonc før fjernkommandoer.");
  process.exit(1);
}
