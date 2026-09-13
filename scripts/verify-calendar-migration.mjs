import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new Database(':memory:');
db.exec(readFileSync('.data/before-calendar-migration-20260912.sql','utf8'));
const tables=['players','events','signups','matches','match_requests','sessions'];
const before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
db.exec(readFileSync('drizzle/0003_flashy_wither.sql','utf8'));
for(const t of tables) {
  const after=db.prepare('SELECT * FROM '+t).all();
  for(const row of before[t]) assert.ok(after.some(candidate=>Object.keys(row).every(key=>candidate[key]===row[key])), 'Preserve original '+t+' row');
}
const calendar=db.prepare('SELECT count(*) AS count,min(date) AS first,max(date) AS last FROM events').get();
assert.equal(calendar.count,34);
console.log(JSON.stringify({preserved:tables.map(t=>({table:t,rows:before[t].length})),calendar}));
db.close();
