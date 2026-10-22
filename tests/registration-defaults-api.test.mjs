import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {registrationIsOpen} from '../lib/registration.ts';

test('existing next Friday uses saved registration defaults and opens Wednesday at 06 Copenhagen time',{timeout:120000},async()=>{
  const directory=mkdtempSync(join(process.cwd(),'.registration-defaults-test-'));
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB;
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    globalThis.__registrationDefaultsDb=db;
    const outfile=join(directory,'schedule.mjs');
    await build({entryPoints:['lib/schedule.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'test-context',setup(builder){
        builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getCloudflareContext=()=>({env:{DB:globalThis.__registrationDefaultsDb}});'}));
      }
    }]});
    const {ensureEvent}=await import(pathToFileURL(outfile).href);
    await db.prepare('DELETE FROM events').run();
    await db.prepare('DELETE FROM registration_defaults').run();
    await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at) VALUES(1,'2030-06-14','2030-06-12T10:00:00.000Z','2030-06-13T10:00:00.000Z')").run();
    await db.prepare("INSERT INTO registration_defaults(id,open_days,open_time,close_days,close_time) VALUES(1,2,'06:00',1,'12:00')").run();
    const monday=new Date('2030-06-10T10:00:00Z');
    const event=await ensureEvent(monday);
    assert.equal(event.registrationOpensAt,'2030-06-12T04:00:00.000Z');
    assert.equal(registrationIsOpen(event,Date.parse('2030-06-12T03:59:59Z')),false);
    assert.equal(registrationIsOpen(event,Date.parse('2030-06-12T04:00:00Z')),true);
    assert.equal((await db.prepare('SELECT registration_opens_at AS opens FROM events WHERE id=1').first()).opens,event.registrationOpensAt);
    await db.prepare("UPDATE registration_defaults SET open_time='07:15'").run();
    assert.equal((await ensureEvent(monday)).registrationOpensAt,'2030-06-12T05:15:00.000Z');
    await db.prepare("UPDATE events SET registration_opens_at='2030-06-12T04:00:00.000Z'").run();
    assert.equal((await ensureEvent(new Date('2030-06-12T04:00:00Z'))).registrationOpensAt,'2030-06-12T04:00:00.000Z','an already opened round is not delayed');
    await db.prepare("UPDATE events SET registration_schedule_custom=1,registration_opens_at='2030-06-12T09:00:00.000Z'").run();
    assert.equal((await ensureEvent(monday)).registrationOpensAt,'2030-06-12T09:00:00.000Z','explicit round schedule is preserved');
    await db.prepare("UPDATE events SET registration_schedule_custom=0,registration_override='closed'").run();
    assert.equal((await ensureEvent(monday)).registrationOpensAt,'2030-06-12T09:00:00.000Z','manual closure is preserved');
  } finally {
    delete globalThis.__registrationDefaultsDb;
    await proxy?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
