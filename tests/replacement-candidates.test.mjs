import test from 'node:test';
import assert from 'node:assert/strict';
import { replacementCandidates } from '../lib/replacement-candidates.ts';

const members = [{id:1,name:'Mig'}, {id:2,name:'Anne'}, {id:3,name:'Bo'}, {id:4,name:'Dan'}];
const signup = (playerId, requestedHours, status='active') => ({playerId,requestedHours,status});
const match = (startTime, ids) => ({startTime,playerIds:JSON.stringify(ids)});

test('requires missing hours and at least one free own slot; excludes self and cancelled signups', () => {
  const result = replacementCandidates(1,members,[signup(1,3),signup(2,2),signup(3,1),signup(4,2,'cancelled')],[],[
    match('18:00',[1,3]),match('19:00',[1]),match('18:30',[2]),
  ]);
  assert.deepEqual(result, []); // Anne overlaps both own matches; Bo already has his requested hour.
  const available = replacementCandidates(1,members,[signup(2,2),signup(3,1,'waitlist')],[],[
    match('18:00',[1,2]),match('19:00',[1]),
  ]);
  assert.deepEqual(available.map(p=>[p.id,p.assigned,p.times]),[
    [3,0,['18:00–19:00','19:00–20:00']], [2,1,['19:00–20:00']],
  ]);
});

test('imported plan takes precedence, normalizes names and respects actual end times', () => {
  const imported = [{A:'18.00',B:'19.00',D:'Mig',E:'',F:'Dan',G:''},
    {A:'17:30',B:'18:30',D:'  ANNE ',E:'',F:'Dan',G:''}];
  assert.deepEqual(replacementCandidates(1,members,[signup(2,2),signup(3,1)],imported,[match('18:00',[3])])
    .map(p=>p.id),[3]);
});

test('does not guess imported allocations for duplicate names or users without matches', () => {
  const imported = [{A:'18:00',B:'19:00',D:'Mig',E:'',F:'Dan',G:''}];
  assert.deepEqual(replacementCandidates(1,[...members,{id:5,name:'Anne'}],[signup(2,2)],imported,[]),[]);
  assert.deepEqual(replacementCandidates(2,members,[signup(3,2)],imported,[]),[]);
  assert.deepEqual(replacementCandidates(1,[...members,{id:5,name:'Mig'}],[signup(3,2)],imported,[]),[]);
});
