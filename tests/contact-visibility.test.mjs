import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {visiblePlanContact} from '../lib/contact-visibility.ts';
import {profileValues} from '../lib/profile.ts';

test('contact visibility independently removes private values from the response', () => {
  const person = {id:1,name:'Test',email:'test@example.com',phone:'12345678',phoneCountryCode:'+45'};
  for (const emailVisible of [true,false]) for (const phoneVisible of [true,false]) {
    const result = visiblePlanContact({...person,emailVisible,phoneVisible});
    assert.equal(result.email, emailVisible ? person.email : '');
    assert.equal(result.phone, phoneVisible ? person.phone : '');
    assert.equal(result.phoneCountryCode, phoneVisible ? '+45' : '');
  }
});

test('profile accepts explicit booleans and preserves choices when fields are omitted', () => {
  const profile = {firstName:'Test',lastName:'Member',memberNo:'1',email:'test@example.com',level:'B',gender:'K'};
  assert.equal(profileValues({...profile,emailVisible:false,phoneVisible:true}).emailVisible,false);
  assert.equal(profileValues({...profile,emailVisible:false,phoneVisible:true}).phoneVisible,true);
  assert.equal(Object.hasOwn(profileValues(profile),'emailVisible'),false);
  assert.equal(Object.hasOwn(profileValues(profile),'phoneVisible'),false);
  for (const value of ['false','true',0,1,null]) assert.throws(() => profileValues({...profile,phoneVisible:value}));
});

test('migration enables both choices for existing and new members without modifying contact details', () => {
  const db = new Database(':memory:');
  try {
    db.exec("CREATE TABLE players(id INTEGER PRIMARY KEY, email TEXT, phone TEXT); INSERT INTO players VALUES(1,'test@example.com','12345678');");
    db.exec(readFileSync('drizzle/0011_lively_trish_tilby.sql','utf8'));
    assert.deepEqual(db.prepare('SELECT * FROM players').get(), {id:1,email:'test@example.com',phone:'12345678',email_visible:1,phone_visible:1});
    db.exec('INSERT INTO players(id) VALUES(2)');
    assert.deepEqual(db.prepare('SELECT email_visible,phone_visible FROM players WHERE id=2').get(), {email_visible:1,phone_visible:1});
  } finally {db.close();}
});
