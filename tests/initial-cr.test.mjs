import assert from 'node:assert/strict';
import test from 'node:test';
import {INITIAL_CR,initialCr} from '../lib/initial-cr.ts';
import {SELF_LEVELS,isSelfLevel,LEVEL_SCORE} from '../lib/ranking.ts';

test('new member CR follows the exact ranking table',()=>{
  const expected={A:2,'A-':3,AB:4,B:5,'B+':4,'B-':6,BC:7,'C+':7,C:8,'C-':9};
  assert.deepEqual(INITIAL_CR,expected);
  assert.equal(SELF_LEVELS.length,10);
  for(const level of Object.keys(expected)) {
    assert.equal(isSelfLevel(level),true);
    assert.ok(Number.isFinite(LEVEL_SCORE[level]));
  }
  for(const invalid of ['D','a','',null])assert.equal(isSelfLevel(invalid),false);
});

test('unknown rankings use A then B then C, ignoring case',()=>{
  for(const [value,expected] of [[' a- ',3],['b+',4],['a spiller',4],['b-form',6],['c-form',8],['cba ukendt',4],['cb ukendt',6],['ukendt',null],['toString',null]])assert.equal(initialCr(value),expected);
});
