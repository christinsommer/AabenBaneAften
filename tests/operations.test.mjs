import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import {encryptBackup,decryptBackup} from '../scripts/backup-crypto.mjs';
import {alarmCandidates} from '../scripts/operations-lib.mjs';
import {applyPending} from '../scripts/privacy-backup-lib.mjs';
import {runMonitor} from '../scripts/security-monitor.mjs';

test('backup authentication rejects tampering and wrong keys; random nonces prevent repeated ciphertext',()=>{
  const key=randomBytes(32).toString('hex'),plain=Buffer.from('private database contents');
  const first=encryptBackup(plain,key),second=encryptBackup(plain,key);
  assert.deepEqual(decryptBackup(first,key),plain);
  assert.notDeepEqual(first,second);
  assert.throws(()=>decryptBackup(first,randomBytes(32).toString('hex')));
  const corrupt=Buffer.from(first);corrupt[corrupt.length-1]^=1;
  assert.throws(()=>decryptBackup(corrupt,key));
  assert.throws(()=>encryptBackup(plain,'short'));
  assert.throws(()=>decryptBackup(Buffer.from('invalid'),key));
});
test('monitor catches up, deduplicates, ignores open windows, and retries failed delivery',async()=>{
  const db=new Database(':memory:');
  try {
    applyPending(db);
    const now=180000,previous=now-900;
    db.prepare('INSERT INTO operations_health VALUES(?,?)').run('backup',now);
    db.prepare('INSERT INTO security_counters VALUES(?,?,?)').run(previous,'login_failed',10);
    db.prepare('INSERT INTO security_counters VALUES(?,?,?)').run(previous,'role_changed',1);
    db.prepare('INSERT INTO security_counters VALUES(?,?,?)').run(now,'auth_limited',1);
    db.prepare('INSERT INTO security_role_events VALUES(?,?,?,?,?)').run('role',previous,1,2,'admin');
    const runQuery=async(sql,params=[])=>{
      const stmt=db.prepare(sql);return stmt.reader?stmt.all(...params):(stmt.run(...params),[]);
    };
    const messages=[];let heartbeats=0;
    const options={runQuery,now,recordHeartbeat:async()=>{heartbeats++;}};
    await assert.rejects(runMonitor({...options,send:async()=>{throw Error('provider unavailable');}}),/provider unavailable/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM security_alert_deliveries').get().n,0);
    assert.equal(heartbeats,0);
    const send=async(id,text)=>{messages.push({id,text});};
    await runMonitor({...options,send});
    await runMonitor({...options,send});
    assert.equal(messages.length,1);
    assert.match(messages[0].text,/bruger-ID 1 ændrede bruger-ID 2 til admin/);
    assert.equal(heartbeats,2);
    db.prepare('DELETE FROM operations_health').run();
    await runMonitor({...options,send});
    await runMonitor({...options,send});
    assert.equal(messages.length,2);
    assert.match(messages[1].text,/36 timer/);
  }finally{db.close();}
});
test('alarm thresholds ignore ordinary activity and trigger at each boundary',()=>{
  const rows=[{kind:'login_failed',total:9},{kind:'login_failed',total:10},{kind:'auth_limited',total:1},{kind:'mail_sent',total:99},{kind:'mail_sent',total:100},{kind:'role_changed',total:1},{kind:'unknown',total:1000}];
  assert.deepEqual(alarmCandidates(rows),[rows[1],rows[2],rows[4],rows[5]]);
});
test('monitoring schema is additive, counters accumulate and delivery markers deduplicate',()=>{
  const db=new Database(':memory:');
  try {
    applyPending(db);
    const add=db.prepare('INSERT INTO security_counters(bucket,kind,total) VALUES(?,?,?) ON CONFLICT(bucket,kind) DO UPDATE SET total=total+excluded.total');
    for(let i=0;i<10;i++)add.run(900,'login_failed',1);
    add.run(1800,'login_failed',1);
    assert.deepEqual(db.prepare('SELECT total FROM security_counters ORDER BY bucket').all(),[{total:10},{total:1}]);
    db.prepare('INSERT INTO security_role_events VALUES(?,?,?,?,?)').run('event',900,1,2,'admin');
    const sent=db.prepare('INSERT OR IGNORE INTO security_alert_deliveries VALUES(?,?)');
    sent.run('security-900',1900);sent.run('security-900',2000);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM security_alert_deliveries').get().n,1);
    applyPending(db);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM security_role_events').get().n,1);
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  }finally{db.close();}
});
