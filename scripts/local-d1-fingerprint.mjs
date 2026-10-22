import {createHash} from 'node:crypto';

const quote = value => `"${value.replaceAll('"','""')}"`;

// Preserve the original columns when verifying an additive migration.
// Explicitly check columns: SQLite can interpret a missing quoted column as text.
export async function fingerprintLocalD1(db, original) {
  const result={};
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations','_cf_KV','privacy_migration_checksums') ORDER BY name").all()).results;
  for(const {name} of tables) {
    if(original && !original[name])continue;
    const actual=(await db.prepare(`PRAGMA table_info(${quote(name)})`).all()).results.map(row=>row.name);
    const columns=original?.[name]?.columns ?? actual;
    if(columns.some(column=>!actual.includes(column)))throw Error('Migration removed existing columns: '+name);
    const rows=(await db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`).all()).results.map(row=>JSON.stringify(row)).sort();
    result[name]={columns,count:rows.length,hash:createHash('sha256').update(rows.join('\n')).digest('hex')};
  }
  return result;
}
