import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultOptimizerPriorities,optimizerObjectives,parseOptimizerPriorities} from '../lib/optimizer-priorities.ts';
import {algorithmWeightDefaults,validateProposal} from '../lib/optimizer.ts';
test('priorities preserve order and explicit booleans without sharing defaults',()=>{
 const custom=defaultOptimizerPriorities.map(p=>({...p})).reverse();custom[0].enabled=false;
 assert.deepEqual(parseOptimizerPriorities(custom),custom);
 assert.equal(defaultOptimizerPriorities.every(p=>p.enabled),true);
 assert.equal(optimizerObjectives.length,12);
 assert.equal(parseOptimizerPriorities(custom.map(p=>({...p,enabled:false}))).some(p=>p.enabled),false);
});
test('invalid, missing, duplicated and unknown priorities are rejected',()=>{
 for(const value of [null,{},[],defaultOptimizerPriorities.slice(1),[...defaultOptimizerPriorities,defaultOptimizerPriorities[0]],defaultOptimizerPriorities.map((p,i)=>i===0?{...p,id:'unknown'}:p),defaultOptimizerPriorities.map((p,i)=>i===0?defaultOptimizerPriorities[1]:p),defaultOptimizerPriorities.map(p=>({...p,enabled:'false'})),defaultOptimizerPriorities.map(({id})=>({id}))])assert.throws(()=>parseOptimizerPriorities(value));
});

test('disabling all objectives never disables availability or requested-hour limits',()=>{
 const players=[1,2,3,4].map(id=>({id,memberNo:String(id),cr:5,gender:'M',requestedHours:1,signupOrder:id,status:'active',availability:['18:00']}));
 const input={players,slots:[{court:1,startTime:'18:00'},{court:1,startTime:'19:00'}],history:[],locked:[],weights:algorithmWeightDefaults,optimizerPriorities:defaultOptimizerPriorities.map(p=>({...p,enabled:false}))};
 const match={court:1,startTime:'18:00',team1:[1,2],team2:[3,4]};
 assert.equal(validateProposal([match],input).length,1);
 assert.throws(()=>validateProposal([{...match,startTime:'19:00'}],input));
 assert.throws(()=>validateProposal([match,{...match,startTime:'19:00',team1:[1,3],team2:[2,4]}],{...input,players:players.map(p=>({...p,availability:['18:00','19:00']}))}));
});
