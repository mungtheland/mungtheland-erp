'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcileBookingStatus}=require('./booking-status-reconciliation');
test('matching booking and attendance state has no warning',()=>{const x=reconcileBookingStatus('예약','예약');assert.equal(x.mismatch,false);assert.equal(x.displayStatus,'예약');});
test('Sheets reserved and Firestore checkout flags mismatch',()=>{const x=reconcileBookingStatus('예약','하원 완료');assert.equal(x.mismatch,true);assert.equal(x.reason,'SOURCE_ATTENDANCE_DIFFER');assert.equal(x.displayStatus,'하원 완료');assert.equal(x.sourceStatus,'예약');});
test('unknown source status is reviewable without overwriting it',()=>{const x=reconcileBookingStatus('취소','예약');assert.equal(x.reason,'UNKNOWN_SOURCE_STATUS');assert.equal(x.needsReview,true);assert.equal(x.sourceStatus,'취소');});
test('invalid attendance state is rejected',()=>assert.throws(()=>reconcileBookingStatus('예약','오류'),/Unknown attendance/));
