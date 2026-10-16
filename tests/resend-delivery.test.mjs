import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverEmail, EmailDeliveryError} from '../lib/resend-delivery.ts';

test('retries temporary failures with identical payload and idempotency key', async () => {
  const calls=[], delays=[];
  await deliverEmail('test', '{"text":"test"}', {sleep:async ms=>{delays.push(ms);},fetch:async(url,options)=>{
    calls.push(options);
    if(calls.length===1)throw new TypeError('network');
    if(calls.length===2)return Response.json({name:'rate_limit_exceeded'},{status:429,headers:{'retry-after':'1'}});
    return Response.json({id:'test-id'});
  }});
  assert.equal(calls.length,3);
  assert.equal(new Set(calls.map(c=>c.headers['Idempotency-Key'])).size,1);
  assert.equal(new Set(calls.map(c=>c.body)).size,1);
  assert.deepEqual(delays,[500,1000]);
});

test('permanent errors, quotas and long Retry-After are not retried',async()=>{
  for(const [status,name,after] of [[403,'validation_error',null],[429,'daily_quota_exceeded',null],[429,'monthly_quota_exceeded',null],[429,'rate_limit_exceeded','60']]){
    let calls=0;
    await assert.rejects(deliverEmail('test','{}',{fetch:async()=>{
      calls++;
      return Response.json({name},{status,headers:after?{'retry-after':after}:{}});
    }}),e=>e instanceof EmailDeliveryError&&!e.uncertain);
    assert.equal(calls,1);
  }
});

test('ambiguous acceptance survives exhaustion and later definitive errors',async()=>{
  for(const finalStatus of [503,403]){
    let calls=0;
    await assert.rejects(deliverEmail('test','{}',{sleep:async()=>{},fetch:async()=>{
      calls++;
      if(calls===1)throw new TypeError('timeout');
      return Response.json({name:'provider_error'},{status:finalStatus});
    }}),e=>e instanceof EmailDeliveryError&&e.uncertain);
    assert.equal(calls,finalStatus===503?3:2);
  }
});
