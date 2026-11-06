'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditAttendance}=require('./attendance-audit');
const ev=(id,action,at,eventId)=>({bookingId:id,action,at,eventId});
test('audit flags orphan events without modifying source',()=>{
 const bookings=[{bookingId:'RSV-A',status:'예약'}];const events=[ev('RSV-OTHER','check-in','2026-11-06T00:00:00Z','E1')];
 const result=auditAttendance(bookings,events);assert.equal(result.readOnly,true);assert.equal(result.issues[0].code,'ORPHAN');assert.equal(bookings[0].status,'예약');
});
test('audit classifies intentional booking state difference as review',()=>{
 const result=auditAttendance([{bookingId:'RSV-A',status:'예약'}],[ev('RSV-A','check-in','2026-11-06T00:00:00Z','E1')]);
 assert.equal(result.issues.length,1);assert.equal(result.issues[0].severity,'review');
});
test('audit detects cancelled bookings and missing check-in',()=>{
 const result=auditAttendance([{bookingId:'RSV-A',status:'취소'}],[ev('RSV-A','check-out','2026-11-06T00:00:00Z','E1')]);
 assert.deepEqual(result.issues.map(x=>x.code),['CANCELLED_WITH_EVENTS','INVALID_SEQUENCE']);
});
test('audit detects duplicate events and reverse timestamps',()=>{
 const events=[ev('RSV-A','check-in','2026-11-06T02:00:00Z','E1'),ev('RSV-A','check-out','2026-11-06T01:00:00Z','E1')];
 const result=auditAttendance([{bookingId:'RSV-A',status:'예약'}],events);
 assert.ok(result.issues.some(x=>x.code==='DUPLICATE_OR_UNORDERED'));
});
