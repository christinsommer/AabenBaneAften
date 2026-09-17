import test from 'node:test';
import assert from 'node:assert/strict';
import {algorithmWeightDefaults} from '../lib/optimizer.ts';
import {optimizerHelp, restoreWeights, weightFields} from '../lib/optimizer-settings.ts';

test('used weights survive browser storage including the distance dropdown and zero values', () => {
  const used={...algorithmWeightDefaults,FactorMix:50,FactorAge:0,FactorDistanceSameTeamA:2};
  assert.deepEqual(restoreWeights(JSON.stringify(used)),used);
  assert.equal(weightFields(used).FactorMix,'50');
  assert.equal(weightFields(used).FactorDistanceSameTeamA,'2');
  assert.deepEqual(restoreWeights('broken'),algorithmWeightDefaults);
  assert.deepEqual(restoreWeights('{"FactorMix":50}'),{...algorithmWeightDefaults,FactorMix:50});
  assert.ok(Object.keys(algorithmWeightDefaults).every(key=>optimizerHelp[key]?.length>20));
});
