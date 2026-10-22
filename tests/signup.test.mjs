import assert from 'node:assert/strict';
import test from 'node:test';
import {signupInput,signupFields,includeIntermediateTimes} from '../lib/signup.ts';
import {visibleMember} from '../lib/member-visibility.ts';
const times=['18:00','18:30','19:00','19:30','20:00','20:30'];
test('saving wishes includes intermediate slots only inside consecutive chosen hours', () => {
  const slots = ['18:00','18:30','19:00','19:30','20:00','20:30','21:00'];
  assert.deepEqual(includeIntermediateTimes(['18:00','19:00'],slots),slots.slice(0,3));
  assert.deepEqual(includeIntermediateTimes(['18:30','19:30'],slots),slots.slice(1,4));
  assert.deepEqual(includeIntermediateTimes(['20:00','18:00','19:00'],slots),slots.slice(0,5));
  assert.deepEqual(includeIntermediateTimes(['18:00','20:00'],slots),['18:00','20:00']);
  assert.deepEqual(includeIntermediateTimes(['18:00'],slots),['18:00']);
  assert.deepEqual(includeIntermediateTimes([],slots),[]);
  const expanded = includeIntermediateTimes(['18:00','19:00'],slots);
  assert.deepEqual(includeIntermediateTimes(expanded,slots),expanded);
  assert.throws(()=>signupInput({nHours:2,nPossible:expanded.length,szPossible:expanded},slots),/mindst 4 tider/);
});

test('signup input preserves requested hours and counts possible start times',()=>{
  assert.deepEqual(signupFields(null),{nHours:0,nPossible:0,szPossible:[]});
  assert.deepEqual(signupFields({requestedHours:2,availability:'["18:30","19:30"]',status:'cancelled'}),{nHours:0,nPossible:0,szPossible:[]});
  for(const nHours of [0,1,2,3]) {
    const input={nHours,nPossible:6,szPossible:times};
    assert.deepEqual(signupInput(input,times),input);
    assert.deepEqual(signupFields({requestedHours:nHours,availability:JSON.stringify(times)}),input);
  }
  assert.deepEqual(signupInput({nHours:0,nPossible:0,szPossible:[]},times),{nHours:0,nPossible:0,szPossible:[]});
  const valid={nHours:2,nPossible:6,szPossible:times};
  for(const nHours of [-1,4,1.5,'2',null])assert.throws(()=>signupInput({...valid,nHours},times));
  for(const nPossible of [2,3.5,'3',null,undefined])assert.throws(()=>signupInput({...valid,nPossible},times));
  assert.throws(()=>signupInput({...valid,szPossible:['18:30','18:30','19:30']},times));
  assert.throws(()=>signupInput({...valid,szPossible:['18:30','19:30','21:30']},times));
  assert.throws(()=>signupInput({nHours:3,nPossible:1,szPossible:['18:30']},times));
  assert.deepEqual(signupInput({requestedHours:2,availability:times},times),valid);
});

test('at least two alternatives and enough non-overlapping full hours are required',()=>{
  const slots=['18:00','18:30','19:00','19:30','20:00','20:30'];
  const input=(nHours,szPossible)=>signupInput({nHours,szPossible,nPossible:szPossible.length},slots);
  assert.throws(()=>input(1,['18:00']),/mindst 2 tider/);
  assert.throws(()=>input(1,[]),/mindst 2 tider/);
  assert.equal(input(1,['18:00','18:30']).nHours,1);
  for(const hours of [1,2,3]) {
    for(let count=0;count<hours*2;count++)assert.throws(()=>input(hours,slots.slice(0,count)),new RegExp(`mindst ${hours*2} tider`));
    assert.equal(input(hours,slots.slice(0,hours*2)).nHours,hours);
  }
  assert.equal(input(3,slots).nHours,3);
  assert.throws(()=>signupInput({requestedHours:2,availability:['18:00','18:30']},slots),/mindst 4 tider/);
  const overlapping=['18:00','18:10','18:20','18:30'];
  assert.throws(()=>signupInput({nHours:2,nPossible:4,szPossible:overlapping},overlapping),/ikke overlapper/);
});

test('member responses never disclose administrator rankings or PIN hashes',()=>{
  const member={id:1,role:'player',pinHash:'secret',christinRanking:7,adminLevel:'A',name:'Member'};
  assert.deepEqual(visibleMember(member),{id:1,role:'player',name:'Member'});
  const admin=visibleMember({...member,role:'admin'});
  assert.equal(admin.christinRanking,7);
  assert.equal(admin.pinHash,undefined);
});
