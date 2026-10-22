import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { getPlatformProxy } from 'wrangler';
import { migrationStatements } from './migration-statements.mjs';
import { normalizeSelfLevel } from '../lib/ranking.ts';
import {fingerprintLocalD1} from './local-d1-fingerprint.mjs';

// This script only uses simulated bindings; it never invokes a remote command.
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
if (config.d1_databases.some(binding => binding.remote)) throw new Error('Local setup refuses remote bindings');
const proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: '.wrangler/local-dev/v3' } });
try {
  const db = proxy.env.DB;
  const initialized = await db.prepare("SELECT name FROM sqlite_master WHERE name='d1_migrations'").first();
  const existing = await db.prepare("SELECT name FROM sqlite_master WHERE name='players'").first();
  if (existing && !initialized) throw new Error('Unknown local schema: refusing to overwrite existing data');
  const applied = initialized ? (await db.prepare('SELECT name FROM d1_migrations').all()).results.map(row => row.name) : [];
  const statements = [];
  const manifest=JSON.parse(readFileSync('drizzle/checksums.json','utf8'));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const before=existing?await fingerprintLocalD1(db):{};
  if (!initialized) statements.push(db.prepare('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'));
  for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
    if(manifest[file]!==hash(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('\r\n','\n')))throw new Error('Migration integrity mismatch: '+file);
    if (applied.includes(file)) continue;
    for (const sql of migrationStatements(readFileSync(`drizzle/${file}`, 'utf8'))) statements.push(db.prepare(sql));
    statements.push(db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(file));
  }
  if (existing && statements.length) {
    const backup = spawnSync(process.execPath, [fileURLToPath(new URL('./backup-privacy.mjs', import.meta.url)), '--local'], {encoding:'utf8',windowsHide:true});
    if(backup.status!==0)throw new Error('Local migration stopped: backup/rehearsal failed. '+backup.stderr);
    console.log('Existing local D1 backup and restore rehearsal verified.');
  }
  let snapshot;
  if (!initialized && existsSync('.data/app.db')) {
    mkdirSync('.data/backups', { recursive: true });
    const path = resolve(`.data/backups/local-${Date.now()}.sqlite`);
    const source = new Database('.data/app.db', { readonly: true });
    try { await source.backup(path); } finally { source.close(); }
    console.log(`SQLite backup: ${path}`);
    snapshot = new Database(path, { readonly: true });
    const tables = ['players', 'events', 'sessions', 'pin_reset_tokens', 'signups', 'match_requests', 'matches', 'substitutions', 'feedback'];
    for (const table of [...tables].reverse()) statements.push(db.prepare(`DELETE FROM "${table}"`));
    for (const table of tables) {
      if (!snapshot.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table)) continue;
      const rows = snapshot.prepare(`SELECT * FROM "${table}"${table === 'signups' ? ' ORDER BY created_at, id' : ''}`).all();
      for (const row of rows) {
        if (table === 'players') row.self_level = normalizeSelfLevel(row.self_level);
        const columns = Object.keys(row);
        statements.push(db.prepare(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)));
      }
      console.log(`Preserving ${table}: ${rows.length} rows`);
    }
    statements.push(db.prepare("UPDATE profile_privacy SET last_active_at='2026-09-25T00:00:00.000Z',activity_known=0,activity_type='legacy-default'"));
    snapshot.close();
  }
  // A single D1 batch commits schema and imported rows together or rolls everything back.
  if (statements.length) await db.batch(statements);
  if(existing&&statements.length){const after=await fingerprintLocalD1(db,before);for(const [table,value]of Object.entries(before))if(JSON.stringify(value)!==JSON.stringify(after[table]))throw new Error('Migration changed existing data: '+table);console.log('Existing table counts and fingerprints preserved.');}
  const { members } = await db.prepare('SELECT COUNT(*) AS members FROM players').first();
  if (members === 0) {
    console.warn('WARNING: Local database contains no members. Existing logins will fail here. Restore a local backup or create a local profile.');
  }
  console.log('Local D1 ready (.wrangler/local-dev). Production unchanged.');
} finally { await proxy.dispose(); }
