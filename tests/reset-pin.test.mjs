import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, hashToken, verifyPin, verifyToken } from '../lib/credentials.ts';

test('reset-token roundtrip works for a PIN reset flow', async () => {
  const token = 'reset-token-123';
  const hashed = await hashToken(token);
  assert.notEqual(hashed, token);
  assert.equal(await verifyToken(token, hashed), true);
  assert.equal(await verifyToken('wrong-token', hashed), false);

  const pin = '1234';
  const stored = await hashPin(pin);
  assert.equal(await verifyPin(pin, stored), true);
  assert.equal(await verifyPin('4321', stored), false);
});


