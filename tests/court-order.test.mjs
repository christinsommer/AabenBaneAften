import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCourtOrder,defaultCourtOrder,parseCourtOrder} from '../lib/court-order.ts';

const match=(court,startTime='18:00')=>({court,startTime,team1:[1,2],team2:[3,4]});
const slots=['18:00','19:00','18:30','19:30'].flatMap(startTime=>(startTime.endsWith(':00')?[1,2,3,4]:[5,6,7]).map(court=>({court,startTime})));

test('court orders accept arbitrary allowed courts and subsets, but reject duplicates and invalid numbers',()=>{
  assert.deepEqual(parseCourtOrder({whole:'4, 3, 2, 1',half:'5,6,7'}),defaultCourtOrder);
  for(const whole of ['4,3,2,2','4,3,2,1,','x,3,2,1','0,1','-1,2','1.5,2'])
    assert.throws(()=>parseCourtOrder({whole,half:'5,6,7'}));
  assert.deepEqual(parseCourtOrder({whole:'12, 8',half:''}),{whole:[12,8],half:[]});
  assert.throws(()=>parseCourtOrder({whole:[],half:[]}));
});

test('shared courts retain the solver allocation so overlapping times cannot collide',()=>{
  const plan=[match(8,'18:00'),match(9,'18:30')];
  assert.deepEqual(applyCourtOrder(plan,{slots:[],locked:[]},{whole:[9,8],half:[9,8]}),plan);
});

test('whole and half-hour priorities choose courts independently at every start time',()=>{
  const plan=[match(1),match(2),match(1,'19:00'),match(7,'18:30'),match(6,'19:30')];
  const before=structuredClone(plan);
  const assigned=applyCourtOrder(plan,{slots,locked:[]},defaultCourtOrder);
  assert.deepEqual(assigned.map(m=>m.court),[4,3,4,5,5]);
  assert.deepEqual(plan,before);
  assert.deepEqual(assigned.map(({court,...m})=>m),plan.map(({court,...m})=>m));
  assert.deepEqual(applyCourtOrder(plan,{slots,locked:[]},{whole:[2,1,4,3],half:[7,6,5]}).map(m=>m.court),[2,1,2,7,7]);
});

test('locked matches reserve their court and unavailable courts are never assigned',()=>{
  const plan=[match(1),match(2),match(3)];
  const assigned=applyCourtOrder(plan,{slots,locked:[plan[0]]},defaultCourtOrder);
  assert.deepEqual(assigned.map(m=>m.court),[1,4,3]);
  assert.deepEqual(assigned[0],plan[0]);
  assert.deepEqual(applyCourtOrder([match(1),match(2)],{slots:slots.filter(s=>s.court!==4),locked:[]},defaultCourtOrder).map(m=>m.court),[3,2]);
});
