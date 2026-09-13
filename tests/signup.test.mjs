import assert from 'node:assert/strict';
import test from 'node:test';
import {signupInput,signupFields} from '../lib/signup.ts';
import {visibleMember} from '../lib/member-visibility.ts';
const times=['18:30','19:30','20:30'];

test('signup input preserves requested hours and counts possible start times',()=>{
  assert.deepEqual(signupFields(null),{nHours:0,nPossible:0,szPossible:[]});
  assert.deepEqual(signupFields({requestedHours:2,availability:'["18:30","19:30"]',status:'cancelled'}),{nHours:0,nPossible:0,szPossible:[]});
  for(const nHours of [0,1,2,3]) {
    const input={nHours,nPossible:3,szPossible:times};
    assert.deepEqual(signupInput(input,times),input);
    assert.deepEqual(signupFields({requestedHours:nHours,availability:JSON.stringify(times)}),input);
  }
  assert.deepEqual(signupInput({nHours:0,nPossible:0,szPossible:[]},times),{nHours:0,nPossible:0,szPossible:[]});
  const valid={nHours:2,nPossible:3,szPossible:times};
  for(const nHours of [-1,4,1.5,'2',null])assert.throws(()=>signupInput({...valid,nHours},times));
  for(const nPossible of [2,3.5,'3',null,undefined])assert.throws(()=>signupInput({...valid,nPossible},times));
  assert.throws(()=>signupInput({...valid,szPossible:['18:30','18:30','19:30']},times));
  assert.throws(()=>signupInput({...valid,szPossible:['18:30','19:30','21:30']},times));
  assert.throws(()=>signupInput({nHours:3,nPossible:1,szPossible:['18:30']},times));
  assert.deepEqual(signupInput({requestedHours:2,availability:times},times),valid);
});

test('member responses never disclose administrator rankings or PIN hashes',()=>{
  const member={id:1,role:'player',pinHash:'secret',christinRanking:7,adminLevel:'A',name:'Member'};
  assert.deepEqual(visibleMember(member),{id:1,role:'player',name:'Member'});
  const admin=visibleMember({...member,role:'admin'});
  assert.equal(admin.christinRanking,7);
  assert.equal(admin.pinHash,undefined);
});
