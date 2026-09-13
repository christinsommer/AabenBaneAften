import test from 'node:test';
import assert from 'node:assert/strict';
import { profileValues } from '../lib/profile.ts';

const profile = {firstName:'Test',lastName:'Member',memberNo:'1',email:'test@example.com',level:'B',gender:'K'};
test('phone is optional, preserves leading zeros and accepts a separate country code', () => {
  assert.equal(profileValues(profile).phone,undefined);
  assert.equal(profileValues({...profile,phone:''}).phone,'');
  const result=profileValues({...profile,phone:'01234567',phoneCountryCode:'+45'});
  assert.equal(result.phone,'01234567');
  assert.equal(result.phoneCountryCode,'+45');
  assert.equal(profileValues({...profile,phone:'123456789',phoneCountryCode:'+49'}).phoneCountryCode,'+49');
});
test('phone validation rejects letters, punctuation and a country code in the local number', () => {
  for(const phone of ['+4512345678','12 34','12-34','abcdefgh','1234567890123456'])assert.throws(()=>profileValues({...profile,phone}));
  for(const phoneCountryCode of ['', '45','+0','+1234','Danmark'])assert.throws(()=>profileValues({...profile,phoneCountryCode}));
});
