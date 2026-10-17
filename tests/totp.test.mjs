import test from 'node:test';
import assert from 'node:assert/strict';
import {base32,totp,matchTotp} from '../lib/totp.ts';
test('RFC 6238 SHA-1 vectors and authenticator validation window',async()=>{
 const secret=base32(new TextEncoder().encode('12345678901234567890'));
 assert.equal(secret,'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(await totp(secret,Math.floor(seconds/30),8),expected);
 const now=1800000000000,step=Math.floor(now/30000);
 for(const offset of [-1,0,1])assert.equal(await matchTotp(secret,await totp(secret,step+offset),now),step+offset);
 assert.equal(await matchTotp(secret,await totp(secret,step-2),now),null);
 for(const value of ['','12345','1234567','abcdef'])assert.equal(await matchTotp(secret,value,now),null);
});
