import assert from 'node:assert/strict';
import test from 'node:test';
import {algorithmWeightDefaults, parseAlgorithmWeights, validateProposal, scoreMatch, proposalRows, historyRelations} from '../lib/optimizer.ts';
import {profileValues} from '../lib/profile.ts';
import {normalizeKampplanRows} from '../lib/kampplan-import.js';
import {createMatchCalendar} from '../lib/match-calendar.ts';

const p = (id, extra = {}) => ({id, memberNo: String(id), cr:5, gender:'M', age:40, requestedHours:3, signupOrder:id, status:'active', availability:['18:00','18:30','19:00'], ...extra});
const match = {court:1, startTime:'18:00', team1:[1,2], team2:[3,4]};
const input = extra => ({players:[p(1),p(2),p(3),p(4)], weights:algorithmWeightDefaults, history:[], locked:[], slots:[{court:1,startTime:'18:00'},{court:5,startTime:'18:30'},{court:1,startTime:'19:00'}],...extra});

test('integer weights default only missing and empty values, reject invalid values', () => {
  assert.deepEqual(parseAlgorithmWeights({}), algorithmWeightDefaults);
  assert.equal(parseAlgorithmWeights({FactorMix:''}).FactorMix,10);
  assert.equal(parseAlgorithmWeights({FactorAge:0}).FactorAge,0);
  for (const value of [1.2,'40',null,true,Infinity,1000001]) assert.throws(() => parseAlgorithmWeights({FactorMix:value}));
});
test('independent validator rejects half-hour overlap, double-booked courts, duplicate players and excess hours', () => {
  assert.equal(validateProposal([match,{...match,startTime:'19:00'}], input()).length,2);
  assert.throws(() => validateProposal([match,{...match,court:5,startTime:'18:30'}],input()),/overlappende/);
  assert.throws(() => validateProposal([match,match],input()),/bane/);
  assert.throws(() => validateProposal([{...match,team2:[1,4]}],input()),/flere gange/);
  assert.throws(() => validateProposal([match,{...match,startTime:'19:00'}], input({players:[p(1,{requestedHours:1}),p(2),p(3),p(4)]})),/flere timer/);
  assert.throws(() => validateProposal([match], input({players:[p(1,{availability:['19:00']}),p(2),p(3),p(4)]})),/tidspunktet/);
  assert.throws(() => validateProposal([{...match,court:7}],input()),/rådighed/);
});
test('validator enforces CR boundaries, all banned combinations, singles and locked teams', () => {
  assert.equal(validateProposal([match], input({players:[p(1,{cr:1}),p(2,{cr:4}),p(3,{cr:4}),p(4,{cr:4})]})).length,1);
  assert.throws(() => validateProposal([match], input({players:[p(1,{cr:1}),p(2),p(3),p(4)]})),/CR/);
  for(const [a,b] of [['17108','13993'],['17108','16212'],['11822','15722']])
    assert.throws(() => validateProposal([match], input({players:[p(1,{memberNo:a}),p(2,{memberNo:b}),p(3),p(4)]})),/forbudt/);
  assert.throws(() => validateProposal([{...match,team1:[1],team2:[2]}], input({players:[p(1),p(2,{gender:'K'})]})),/samme køn/);
  assert.throws(() => validateProposal([{...match,team1:[1,3],team2:[2,4]}],input({locked:[match]})),/låst/);
  assert.equal(validateProposal([{...match,team1:[4,3],team2:[2,1]}],input({locked:[match]})).length,1);
});
test('score counts every repeated relation once, including overlapping partner penalties', () => {
  const historical = input({history:[{date:'2026-10-09',matches:[match,match]},{date:'2026-10-02',matches:[match]}]});
  assert.equal(historyRelations(historical.history).partners.size,2);
  assert.deepEqual(scoreMatch(match,historical),{score:10,balanceDifference:0,balanceAge:0,mix:1,sameTeamLastWeek:2,sameTeam3Weeks:2,opponentLastWeek:4});
  const aged = input({players:[p(1,{age:20}),p(2,{age:40}),p(3,{age:50}),p(4,{age:70})],weights:{...algorithmWeightDefaults,FactorAge:1}});
  assert.equal(scoreMatch(match,aged).balanceAge,100);
  assert.equal(scoreMatch(match,aged).score,-10);
  assert.throws(() => validateProposal([match], {...aged,players:[p(1,{age:null}),p(2),p(3),p(4)]}),/Alder/);
});
test('single plan survives table normalization and calendar export', () => {
  const names = new Map([[1,'Anna'],[2,'Bente']]);
  const rows = proposalRows([{court:1,startTime:'18:00',team1:[1],team2:[2]}],names);
  assert.deepEqual(normalizeKampplanRows(rows),rows);
  assert.match(createMatchCalendar({date:'2026-10-16',startTime:'18:00',court:1,players:['Anna','','Bente','']}),/SUMMARY:Anna vs Bente/);
  assert.equal(normalizeKampplanRows([{...rows[0],G:'Third'}]).length,0);
});
test('profile accepts optional integer age without erasing age for old clients', () => {
  const base={firstName:'A',lastName:'B',memberNo:'1',email:'a@example.com',level:'B',gender:'K'};
  assert.equal(Object.hasOwn(profileValues(base),'age'),false);
  for(const age of [0,40,120,'40']) assert.equal(profileValues({...base,age}).age,Number(age));
  assert.equal(profileValues({...base,age:''}).age,null);
  for(const age of [-1,121,3.2,'xx',true]) assert.throws(()=>profileValues({...base,age}),/Alder/);
});
