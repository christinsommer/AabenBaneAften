import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { migrationStatements } from '../scripts/migration-statements.mjs';

test('D1 assigns unique queue numbers for concurrent old-client inserts without deploying a Worker', { timeout: 60000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(),'aabenbane-order-'));
  let proxy;
  try {
    proxy = await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'v3')}});
    const db = proxy.env.DB;
    // Production is on 0003; the queue migration must work without unrelated 0004.
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql') && !f.startsWith('0004')).sort()) {
      await db.batch(migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).map(sql=>db.prepare(sql)));
    }
    await Promise.all(Array.from({length:40},(_,index)=>db.prepare("INSERT INTO signups(event_id,player_id,availability) VALUES(1,?,'[]')").bind(index+1).run()));
    const rows = (await db.prepare('SELECT id,player_id,signup_order FROM signups ORDER BY signup_order').all()).results;
    assert.deepEqual(rows.map(row=>row.signup_order),Array.from({length:40},(_,i)=>i+1));
    await db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours,status) VALUES(1,?,'[]',3,'active') ON CONFLICT(event_id,player_id) DO UPDATE SET requested_hours=3,status='active'").bind(rows[0].player_id).run();
    assert.equal((await db.prepare('SELECT signup_order FROM signups WHERE id=?').bind(rows[0].id).first()).signup_order,1);
  } finally { await proxy?.dispose(); rmSync(directory,{recursive:true,force:true}); }
});
