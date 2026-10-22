import assert from 'node:assert/strict';
import {totp} from '../lib/totp.ts';
export const testMfaKey='a'.repeat(64);
export async function enrollMfa(post,loginBody) {
 assert.equal(loginBody.mfa.stage,'setup');
 const response=await post({action:'mfa_verify',code:await totp(loginBody.mfa.secret,Math.floor(Date.now()/30000))});
 assert.equal(response.status,200,await response.clone().text());
 return response;
}
