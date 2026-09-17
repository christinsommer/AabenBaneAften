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
  const mixedSingle={...match,startTime:'20:30',team1:[1],team2:[2]};
  const lateInput=input({players:[p(1,{availability:['20:00','20:30']}),p(2,{gender:'K',availability:['20:00','20:30']})],slots:[{court:1,startTime:'20:00'},{court:1,startTime:'20:30'}]});
  assert.equal(validateProposal([mixedSingle],lateInput).length,1);
  assert.throws(()=>validateProposal([{...mixedSingle,startTime:'20:00'}],lateInput),/20:30/);
  assert.throws(() => validateProposal([{...match,team1:[1,3],team2:[2,4]}],input({locked:[match]})),/låst/);
  assert.equal(validateProposal([{...match,team1:[4,3],team2:[2,1]}],input({locked:[match]})).length,1);
});
test('score counts every repeated relation once, including overlapping partner penalties', () => {
  const historical = input({history:[{date:'2026-10-09',matches:[match,match]},{date:'2026-10-02',matches:[match]}]});
  assert.equal(historyRelations(historical.history).partners.size,2);
  assert.deepEqual(scoreMatch(match,historical),{score:10,balanceDifference:0,balanceSameTeamDifference:0,balanceAge:0,mix:1,sameTeamLastWeek:2,sameTeam3Weeks:2,opponentLastWeek:4});
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

test('same-team CR difference penalizes both teams symmetrically and excludes singles', () => {
  assert.equal(parseAlgorithmWeights({}).FactorSameTeamDifference,15);
  assert.equal(parseAlgorithmWeights({FactorSameTeamDifference:''}).FactorSameTeamDifference,15);
  const data = input({players:[p(1,{cr:2}),p(2,{cr:5}),p(3,{cr:3}),p(4,{cr:4})]});
  const scored = scoreMatch(match,data);
  assert.equal(scored.balanceDifference,0);
  assert.equal(scored.balanceSameTeamDifference,60);
  assert.equal(scored.score,30);
  assert.equal(scoreMatch({...match,team1:match.team2,team2:match.team1},data).score,30);
  assert.equal(scoreMatch(match,{...data,weights:{...data.weights,FactorSameTeamDifference:0}}).score,90);
  assert.equal(scoreMatch({...match,team1:[1],team2:[3]},data).balanceSameTeamDifference,0);
});

test('same-team distance is a hard rule for either partner with CR 1–4', () => {
  assert.equal(parseAlgorithmWeights({}).FactorDistanceSameTeamA,3);
  for(const value of [0,1,4,'2',null]) assert.throws(()=>parseAlgorithmWeights({FactorDistanceSameTeamA:value}),/2 eller 3/);
  const weights={...algorithmWeightDefaults,FactorDistanceSameTeamA:2};
  assert.throws(()=>validateProposal([match],input({weights,players:[p(1,{cr:4}),p(2,{cr:7}),p(3,{cr:4}),p(4,{cr:7})]})),/FactorDistanceSameTeamA/);
  assert.equal(validateProposal([match],input({weights,players:[p(1,{cr:4}),p(2,{cr:6}),p(3,{cr:4}),p(4,{cr:6})]})).length,1);
  assert.equal(validateProposal([match],input({weights,players:[p(1,{cr:5}),p(2,{cr:8}),p(3,{cr:5}),p(4,{cr:8})]})).length,1);
});
test('profile accepts optional birth year without erasing it for old clients', () => {
  const base={firstName:'A',lastName:'B',memberNo:'1',email:'a@example.com',level:'B',gender:'K'};
  assert.equal(Object.hasOwn(profileValues(base),'birthYear'),false);
  for(const birthYear of [1940,1986,'1986']) assert.equal(profileValues({...base,birthYear}).birthYear,Number(birthYear));
  for(const birthYear of ['',null]) assert.equal(profileValues({...base,birthYear}).birthYear,null);
  for(const birthYear of [1939,9999,1986.2,'xx',true]) assert.throws(()=>profileValues({...base,birthYear}),/Fødselsår/);
  assert.equal(Object.hasOwn(profileValues({...base,age:40}),'age'),false);
});
