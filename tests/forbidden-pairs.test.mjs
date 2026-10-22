import assert from 'node:assert/strict';
import test from 'node:test';
import {parseForbiddenPairs} from '../lib/forbidden-pairs.ts';
import {validateProposal,algorithmWeightDefaults} from '../lib/optimizer.ts';
import {reviewPlan} from '../lib/plan-review.ts';

test('pair settings reject self-pairs, malformed values and reversed duplicates',()=>{
  assert.deepEqual(parseForbiddenPairs([['b','a']]),[['a','b']]);
  for(const value of [null,{},[['a']],[[1,2]],[['','b']],[['a','a']],[['a','b'],['b','a']]])
    assert.throws(()=>parseForbiddenPairs(value));
  assert.deepEqual(parseForbiddenPairs([]),[]);
});

test('configured pairs are hard boundaries for partners and opponents, including manual plans',()=>{
  const input={players:[1,2,3,4].map(id=>({id,memberNo:String(id),cr:5,gender:'M',age:40,availability:['18:00'],requestedHours:1,signupOrder:id,status:'active'})),slots:[{court:1,startTime:'18:00'}],history:[],locked:[],weights:algorithmWeightDefaults};
  const match={court:1,startTime:'18:00',team1:[1,2],team2:[3,4]};
  for(const pair of [['1','2'],['3','1']]) {
    const restricted={...input,forbiddenMemberPairs:[pair]};
    assert.throws(()=>validateProposal([match],restricted),/forbudt/);
    assert.throws(()=>validateProposal([match],restricted,{manualEdit:true}),/forbudt/);
    assert.equal(reviewPlan([match],restricted).valid,false);
  }
  assert.equal(validateProposal([match],{...input,forbiddenMemberPairs:[]}).length,1);
  const legacy={...input,players:input.players.map((p,i)=>({...p,memberNo:['17108','13993','11822','15722'][i]}))};
  assert.equal(validateProposal([match],legacy).length,1,'no hidden club-specific restrictions');
});
