import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ageFromBirthYear, birthYearOptions, currentYear} from '../lib/birth-year.ts';
import {profileValues} from '../lib/profile.ts';
import {visibleMember} from '../lib/member-visibility.ts';

test('birth-year options and derived age advance at Danish New Year', () => {
  const before=new Date('2026-12-31T22:59:59Z'), after=new Date('2026-12-31T23:00:00Z');
  assert.equal(currentYear(before),2026);
  assert.equal(currentYear(after),2027);
  assert.deepEqual(birthYearOptions(before),Array.from({length:71},(_,i)=>2010-i));
  assert.equal(birthYearOptions(after)[0],2011);
  assert.equal(birthYearOptions(after).at(-1),1940);
  assert.equal(ageFromBirthYear(1986,before),40);
  assert.equal(ageFromBirthYear(1986,after),41);
  assert.equal(ageFromBirthYear(null,after),null);
  assert.equal(ageFromBirthYear(undefined,after),null);
});

test('profile validates the current minimum age and hides legacy age', () => {
  const base={firstName:'A',lastName:'B',memberNo:'1',email:'a@example.com',level:'B',gender:'K'};
  assert.equal(profileValues({...base,birthYear:currentYear()-16}).birthYear,currentYear()-16);
  assert.throws(()=>profileValues({...base,birthYear:currentYear()-15}),/Fødselsår/);
  const member=visibleMember({pinHash:'secret',christinRanking:5,adminLevel:null,role:'member',age:39,birthYear:1986});
  assert.equal(member.birthYear,1986);
  assert.equal(Object.hasOwn(member,'age'),false);
});

test('migration converts only fictional ages and preserves existing members', () => {
  const db=new DatabaseSync(':memory:');
  try {
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0009')).sort()) db.exec(readFileSync(`drizzle/${file}`,'utf8'));
    const insert=db.prepare("INSERT INTO players(member_no,name,pin_hash,gender,self_level,age,created_at) VALUES(?,?,'test','K','B',?,'2026-09-15 12:00:00')");
    insert.run('SB50-test','Sandbox',40);
    insert.run('12345','Real',40);
    insert.run('SB50-empty','Unknown',null);
    db.exec(readFileSync('drizzle/0009_next_silver_samurai.sql','utf8'));
    assert.equal(db.prepare("SELECT birth_year FROM players WHERE member_no='SB50-test'").get().birth_year,1986);
    assert.equal(db.prepare("SELECT birth_year FROM players WHERE member_no='12345'").get().birth_year,null);
    assert.equal(db.prepare("SELECT age FROM players WHERE member_no='12345'").get().age,40);
    assert.equal(db.prepare("SELECT birth_year FROM players WHERE member_no='SB50-empty'").get().birth_year,null);
  } finally {db.close();}
});
