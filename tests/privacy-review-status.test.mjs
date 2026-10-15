import test from 'node:test';
import assert from 'node:assert/strict';
import {privacyReviewStatus} from '../lib/privacy-review-status.ts';

test('one review status combines activity, decisions and follow-up deadlines',()=>{
 const now=new Date('2026-10-14T12:00:00Z');
 const base={review_status:'pending',last_active_at:'2026-10-13T12:00:00Z',activity_known:1};
 const status=changes=>privacyReviewStatus({...base,...changes},now);
 assert.equal(status({}),'active');
 assert.equal(status({activity_known:0}),'pending');
 assert.equal(status({last_active_at:'2024-10-14T12:00:00Z'}),'pending');
 assert.equal(status({review_status:'keep',activity_known:0,review_after:'2026-10-15'}),'active');
 assert.equal(status({review_status:'keep',review_after:'2026-10-14'}),'pending');
 assert.equal(status({review_status:'contacted',review_after:'2026-10-15'}),'contacted');
 assert.equal(status({review_status:'contacted',review_after:'2026-10-14'}),'pending');
 assert.equal(status({review_status:'contacted',last_contact_at:'2026-10-01T00:00:00Z'}),'contacted');
 assert.equal(status({review_status:'contacted',last_contact_at:'2026-09-01T00:00:00Z'}),'pending');
 assert.equal(status({review_status:'pendingErasure',review_after:'2020-01-01'}),'pendingErasure');
 assert.equal(status({closed_at:'2026-10-13'}),'closed');
});
