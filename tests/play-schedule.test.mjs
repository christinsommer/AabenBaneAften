import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlayTimes,buildPlaySchedule,defaultPlayTimes,playTimeLabel} from '../lib/play-schedule.ts';
import {signupInput} from '../lib/signup.ts';
import {unusedImportedCourts} from '../lib/unused-courts.ts';
import {normalizeKampplanRows} from '../lib/kampplan-rows.js';

test('summer courts and times become the only slots and signup options',()=>{
  const schedule=buildPlaySchedule({whole:[12,8],half:[10]},parsePlayTimes({whole:'19:00, 18:00',half:'17:30, 18:30'}));
  assert.deepEqual(schedule.times,['17:30','18:00','18:30','19:00']);
  assert.deepEqual(schedule.slots.filter(s=>s.startTime==='18:00').map(s=>s.court),[12,8]);
  assert.equal(schedule.slots.some(s=>s.court===1),false);
  assert.deepEqual(signupInput({nHours:1,nPossible:2,szPossible:['17:30','18:00']},schedule.times).szPossible,['17:30','18:00']);
  assert.throws(()=>signupInput({nHours:1,nPossible:2,szPossible:['17:30','20:30']},schedule.times),/gyldige/);
  assert.equal(playTimeLabel('17:30'),'17:30–18:30');
  assert.deepEqual(unusedImportedCourts([{A:'18:00',B:'19:00',C:'12'}],['18:00'],schedule.slots),[{time:'18:00',courts:[8]}]);
  assert.equal(normalizeKampplanRows([{A:'18:00',B:'19:00',C:'12',D:'A',E:'B',F:'C',G:'D'}]).length,1);
});

test('empty groups are disabled and invalid, duplicate or mismatched times are rejected',()=>{
  assert.deepEqual(buildPlaySchedule({whole:[],half:[8]},defaultPlayTimes).timeGroups.whole,[]);
  assert.deepEqual(parsePlayTimes({whole:'',half:'17:30'}),{whole:[],half:['17:30']});
  for(const whole of ['18:30','25:00','18:00,18:00','18:00,','18','18:15'])
    assert.throws(()=>parsePlayTimes({whole,half:'17:30'}));
  assert.throws(()=>parsePlayTimes({whole:[],half:[]}));
  assert.throws(()=>buildPlaySchedule({whole:[8],half:[]},{whole:[],half:['17:30']}));
  assert.throws(()=>buildPlaySchedule({whole:Array.from({length:9},(_,i)=>i+1),half:[10]},defaultPlayTimes),/32/);
});
