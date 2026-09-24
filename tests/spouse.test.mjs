import test from 'node:test';
import assert from 'node:assert/strict';
import {algorithmWeightDefaults, validateProposal, scoreMatch} from '../lib/optimizer.ts';
import {reviewPlan} from '../lib/plan-review.ts';
import {spouseSettings} from '../lib/spouse-settings.ts';
import {visibleMember} from '../lib/member-visibility.ts';
import {profileValues} from '../lib/profile.ts';

const p = (id, extra={}) => ({id,memberNo:String(id),cr:4,gender:'M',age:40,availability:['18:00','19:00'],requestedHours:2,signupOrder:id,status:'active',...extra});
const match = {court:1,startTime:'18:00',team1:[1,2],team2:[3,4]};
const data = (players) => ({players,slots:[{court:1,startTime:'18:00'},{court:2,startTime:'18:00'},{court:1,startTime:'19:00'}],history:[],locked:[],weights:algorithmWeightDefaults});

test('together overrides only the paired CR limits and CR partner penalty', () => {
  const input = data([p(1,{cr:1,spouseNo:2,spouseMode:2}),p(2,{cr:5}),p(3,{cr:3}),p(4,{cr:3})]);
  assert.equal(validateProposal([match],input).length,1);
  assert.equal(scoreMatch(match,input).score,95);
  assert.equal(scoreMatch(match,input).balanceSameTeamDifference,0);
  assert.equal(reviewPlan([match],input).valid,true);
  assert.equal(reviewPlan([match],input).exceptions.length,0);
  assert.throws(()=>validateProposal([{...match,team1:[1,3],team2:[2,4]}],input),/samme hold/);
  input.players[2].cr=9;
  assert.throws(()=>validateProposal([match],input),/CR/);
});

test('simultaneous permits same team, opponents and separate courts but rejects unmatched hours', () => {
  const input=data(Array.from({length:8},(_,i)=>p(i+1)));
  input.players[0].spouseNo=2; input.players[0].spouseMode=1;
  assert.equal(validateProposal([match],input).length,1);
  assert.equal(validateProposal([{...match,team1:[1,3],team2:[2,4]}],input).length,1);
  const separate=[{...match,team1:[1,3],team2:[4,5]},{...match,court:2,team1:[2,6],team2:[7,8]}];
  assert.equal(validateProposal(separate,input).length,2);
  assert.throws(()=>validateProposal([separate[0],{...separate[1],court:1,startTime:'19:00'}],input),/samtidigt/);
  assert.throws(()=>validateProposal([match,{...match,startTime:'19:00',team1:[1,5],team2:[3,6]}],input),/samtidigt/);
  assert.equal(validateProposal([separate[0]],input,{partial:true}).length,1);
  input.players=input.players.filter(p=>p.id!==2);
  assert.equal(validateProposal([separate[0]],input).length,1);
});

test('repeated partners are forbidden across courts and team labels except spouse mode 2', () => {
  const input=data([p(1),p(2),p(3),p(4)]);
  const repeated=[match,{...match,startTime:'19:00',team1:[4,3],team2:[2,1]}];
  for(const options of [{},{manualEdit:true},{partial:true}]) assert.throws(()=>validateProposal(repeated,input,options),/kun være makkere/);
  const review=reviewPlan(repeated,input);
  assert.equal(review.valid,false);
  assert.ok(review.issues.some(i=>i.matchIndex===0));
  assert.ok(review.issues.some(i=>i.matchIndex===1));
  input.players[0].spouseNo=2; input.players[0].spouseMode=1;
  assert.throws(()=>validateProposal(repeated,input),/kun være makkere/);
  input.players[0].spouseMode=2;
  assert.throws(()=>validateProposal(repeated,input),/kun være makkere/);
  input.players[2].spouseNo=4; input.players[2].spouseMode=2;
  assert.equal(validateProposal(repeated,input).length,2);
  assert.equal(reviewPlan(repeated,input).valid,true);
});

test('spouse settings require valid integers and cannot be changed or seen by regular members', () => {
  const current={spouseNo:null,spouseMode:null};
  const members=[{memberNo:'1'},{memberNo:'2'}];
  assert.deepEqual(spouseSettings({spouseNo:2,spouseMode:1},current,'1',members),{spouseNo:2,spouseMode:1});
  for(const body of [{spouseNo:1,spouseMode:1},{spouseNo:9,spouseMode:2},{spouseNo:2,spouseMode:null},{spouseNo:'2',spouseMode:1}])
    assert.throws(()=>spouseSettings(body,current,'1',members));
  const member={pinHash:'secret',christinRanking:3,adminLevel:'A',role:'player',spouseNo:2,spouseMode:2};
  assert.equal(Object.hasOwn(visibleMember(member),'spouseNo'),false);
  assert.equal(Object.hasOwn(visibleMember(member),'spouseMode'),false);
  assert.equal(visibleMember({...member,role:'admin'}).spouseNo,2);
  const values=profileValues({firstName:'A',lastName:'B',memberNo:'1',email:'a@example.com',gender:'M',level:'B',spouseNo:2,spouseMode:2});
  assert.equal(Object.hasOwn(values,'spouseNo'),false);
  assert.equal(Object.hasOwn(values,'spouseMode'),false);
});
