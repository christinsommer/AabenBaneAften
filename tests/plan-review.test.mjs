import test from 'node:test';
import assert from 'node:assert/strict';
import {algorithmWeightDefaults, validateProposal, scoreMatch} from '../lib/optimizer.ts';
import {reviewPlan, editableMatches, proposedMatches, swapPlayerSlots} from '../lib/plan-review.ts';

const p=(id, extra={})=>({id,memberNo:String(id),cr:4,gender:'M',age:40,availability:['18:00','18:30','19:00','20:00','20:30','21:00'],requestedHours:2,signupOrder:id,status:'active',...extra});
const match={court:1,startTime:'18:00',team1:[1,2],team2:[3,4]};
const input=(extra={})=>({players:[p(1),p(2),p(3),p(4),p(5),p(6),p(7),p(8)],weights:algorithmWeightDefaults,history:[],locked:[],
  slots:[{court:1,startTime:'18:00'},{court:5,startTime:'18:30'},{court:1,startTime:'19:00'},{court:2,startTime:'20:00'},{court:5,startTime:'20:30'},{court:1,startTime:'21:00'}],...extra});

test('only manual edits may exceed partner distance; other rules still reject the plan',()=>{
  const data=input({players:[p(1,{cr:4}),p(2,{cr:7}),p(3,{cr:4}),p(4,{cr:7})],weights:{...algorithmWeightDefaults,FactorDistanceSameTeamA:2}});
  assert.throws(()=>validateProposal([match],data),/FactorDistanceSameTeamA/);
  assert.deepEqual(validateProposal([match],data,{manualEdit:true}),[match]);
  data.players[0].availability=['21:00'];
  assert.throws(()=>validateProposal([match],data,{manualEdit:true}),/tidspunkt/);
  const review=reviewPlan([match],data);
  assert.equal(review.valid,false);
  assert.equal(review.exceptions.length,2);
  assert.deepEqual(review.issues[0].playerIds,[1]);
  data.players[0].cr=3;
  assert.throws(()=>validateProposal([match],data,{manualEdit:true}),/større end 3/);
});

test('review reports every affected appearance for availability, overlap and excess hours',()=>{
  const data=input({players:[p(1,{availability:['19:00'],requestedHours:1}),p(2),p(3),p(4),p(5),p(6),p(7)]});
  const plan=[match,{court:5,startTime:'18:30',team1:[1,5],team2:[6,7]}];
  const result=reviewPlan(plan,data);
  assert.equal(result.valid,false);
  assert.ok(result.issues.every(i=>i.playerIds.length===1 && i.playerIds[0]===1));
  for(const index of [0,1]) {
    const messages=result.issues.filter(i=>i.matchIndex===index).map(i=>i.message).join(' ');
    assert.match(messages,/ikke valgt/);assert.match(messages,/overlappende/);assert.match(messages,/flere timer/);
  }
});

test('review checks CR boundaries, partner distance, mixed teams, forbidden pairs and locked matches',()=>{
  const distance=reviewPlan([match],input({players:[p(1,{cr:4}),p(2,{cr:7}),p(3,{cr:4}),p(4,{cr:7})],weights:{...algorithmWeightDefaults,FactorDistanceSameTeamA:2}}));
  assert.equal(distance.valid,true);
  assert.deepEqual(distance.issues,[]);
  assert.deepEqual(distance.exceptions.map(i=>i.playerIds),[[1,2],[3,4]]);
  assert.ok(distance.scores.every(Number.isFinite));
  const cr=reviewPlan([match],input({players:[p(1,{cr:1}),p(2,{cr:5}),p(3,{cr:5}),p(4,{cr:5})]}));
  assert.ok(cr.issues.some(i=>i.message.includes('højst være 3') && i.playerIds.includes(1)));
  const mixed=reviewPlan([match],input({players:[p(1,{gender:'K'}),p(2,{gender:'K'}),p(3),p(4)]}));
  assert.match(mixed.issues[0].message,/Mixed/);
  const forbidden=reviewPlan([match],input({players:[p(1,{memberNo:'17108'}),p(2,{memberNo:'13993'}),p(3),p(4)]}));
  assert.deepEqual(forbidden.issues[0].playerIds,[1,2]);
  const locked=reviewPlan([{...match,team1:[1,3],team2:[2,4]}],input({locked:[match]}));
  assert.ok(locked.issues.some(i=>i.message.includes('låst')));
});

test('review checks unknown players, unequal teams, early singles and court collisions',()=>{
  assert.equal(reviewPlan([{...match,team1:[99,2]}],input()).scores[0],null);
  assert.equal(reviewPlan([{...match,team1:[1]}],input()).scores[0],null);
  assert.ok(reviewPlan([{...match,team1:[1],team2:[2]}],input()).issues.some(i=>i.message.includes('20.30')));
  assert.ok(reviewPlan([match,{...match,team1:[5,6],team2:[7,8]}],input()).issues.every(i=>i.message.includes('samme bane')));
});

test('swaps preserve all appearances, update score, and moving to a blank slot can be repaired',()=>{
  const plan=[match,{court:1,startTime:'21:00',team1:[5],team2:[6]}];
  const edit=editableMatches(plan);
  const moved=swapPlayerSlots(edit,{match:0,team:0,slot:1},{match:1,team:0,slot:1});
  assert.equal(reviewPlan(proposedMatches(moved),input()).valid,false);
  const restored=swapPlayerSlots(moved,{match:1,team:0,slot:1},{match:0,team:0,slot:1});
  assert.deepEqual(proposedMatches(restored),plan);
  assert.deepEqual(proposedMatches(edit),plan,'original state is not mutated');
  const swapped=proposedMatches(swapPlayerSlots(edit,{match:0,team:0,slot:0},{match:0,team:1,slot:0}));
  const data=input({history:[{date:'2026-09-18',matches:[match]}]});
  assert.notEqual(reviewPlan(plan,data).scores[0],reviewPlan(swapped,data).scores[0]);
  assert.equal(reviewPlan(swapped,data).valid,true);
  assert.deepEqual(reviewPlan(swapped,data).scores,validateProposal(swapped,data).map(m=>scoreMatch(m,data).score));
});
