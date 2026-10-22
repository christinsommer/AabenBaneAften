import test from 'node:test';
import assert from 'node:assert/strict';
import {privacyReviewStatus,inactivityReviewDate} from '../lib/privacy-review-status.ts';

test('inactivity date follows activity independently of manual follow-up',()=>{
 const profile={review_status:'keep',activity_known:1,last_active_at:'2026-10-16T12:00:00Z',review_after:'2027-01-01'};
 assert.equal(inactivityReviewDate(profile),'2028-10-16T12:00:00.000Z');
 assert.equal(inactivityReviewDate({...profile,last_active_at:'2026-11-20T12:00:00Z'}),'2028-11-20T12:00:00.000Z');
 assert.equal(profile.review_after,'2027-01-01');
 assert.equal(privacyReviewStatus({...profile,last_active_at:'2027-01-02T12:00:00Z'},new Date('2027-01-02T13:00:00Z')),'pending');
 assert.equal(inactivityReviewDate({...profile,last_active_at:'2024-02-29T12:00:00Z'}),'2026-02-28T12:00:00.000Z');
 for(const changes of [{activity_known:0},{closed_at:'2026-10-16'},{review_status:'closed'},{last_active_at:'invalid'}])assert.equal(inactivityReviewDate({...profile,...changes}),null);
});

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
