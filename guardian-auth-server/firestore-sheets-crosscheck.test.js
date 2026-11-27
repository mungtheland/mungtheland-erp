'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {documentName,summarizeAttendance,compareWithSheets}=require('./firestore-sheets-crosscheck');

const approved='RSV-TEST-CONCURRENT-003';
const fields={
 bookingId:{stringValue:approved},state:{stringValue:'하원 완료'},
 events:{arrayValue:{values:[
  {mapValue:{fields:{bookingId:{stringValue:approved},eventId:{stringValue:'evt-a'},action:{stringValue:'check-in'},at:{stringValue:'2026-11-26T09:31:44.000Z'}}}},
  {mapValue:{fields:{bookingId:{stringValue:approved},eventId:{stringValue:'evt-b'},action:{stringValue:'check-out'},at:{stringValue:'2026-11-26T09:32:21.000Z'}}}}
 ]}}
};
const doc={name:documentName(approved),fields,updateTime:'2026-11-26T09:32:22.071621Z'};

test('only the two approved booking document paths can be built',()=>{
 assert.match(documentName(approved),/attendance_test_v1\/RSV-TEST-CONCURRENT-003$/);
 assert.throws(()=>documentName('RSV-OTHER'),{message:'DOCUMENT_OUT_OF_SCOPE'});
});

test('Firestore state, ordered events, duplicate flags and Seoul time conversion are summarized',()=>{
 const summary=summarizeAttendance(approved,doc);
 assert.equal(summary.bookingMatches,true);
 assert.equal(summary.eventsMatch,true);
 assert.equal(summary.stateMatches,true);
 assert.equal(summary.eventCount,2);
 assert.deepEqual(summary.eventCounts,{checkIn:1,checkOut:1});
 assert.equal(summary.ordered,true);
 assert.equal(summary.validTimes,true);
 assert.deepEqual(summary.kstTimes,['2026-11-26 18:31:44','2026-11-26 18:32:21']);
 assert.equal(summary.duplicateEventIds,false);
 assert.equal(summary.duplicateActions,false);
 assert.doesNotMatch(JSON.stringify(summary),/RSV-|evt-a|evt-b/);
});

test('duplicate event IDs and repeated actions are detected',()=>{
 const repeated=structuredClone(doc);
 repeated.fields.events.arrayValue.values[1].mapValue.fields.eventId={stringValue:'evt-a'};
 repeated.fields.events.arrayValue.values[1].mapValue.fields.action={stringValue:'check-in'};
 const summary=summarizeAttendance(approved,repeated);
 assert.equal(summary.duplicateEventIds,true);
 assert.equal(summary.duplicateActions,true);
 assert.equal(summary.ordered,false);
});

test('an event attached to another booking is not accepted as a matching document event',()=>{
 const different=structuredClone(doc);
 different.fields.events.arrayValue.values[0].mapValue.fields.bookingId={stringValue:'RSV-OTHER'};
 const summary=summarizeAttendance(approved,different);
 assert.equal(summary.eventsMatch,false);
 const result=compareWithSheets({bookingId:approved,attendance:summary,
  bookingRows:[[approved,'','','','PASS-X','예약',null,null,'하원','미차감','']],historyRows:[]});
 assert.equal(result.attendanceStatus,'MISMATCH');
});

test('unapproved or mismatched document names are rejected',()=>{
 assert.throws(()=>summarizeAttendance('RSV-OTHER',doc),{message:'DOCUMENT_OUT_OF_SCOPE'});
 assert.throws(()=>summarizeAttendance(approved,{...doc,name:doc.name+'/subcollection'}),{message:'DOCUMENT_SCOPE_MISMATCH'});
});

test('cross-ledger matching is exact and reports NO_MATCH instead of guessing',()=>{
 const summary=summarizeAttendance(approved,doc);
 const result=compareWithSheets({bookingId:approved,attendance:summary,bookingRows:[['different-id','','DOG-X','Private name']],historyRows:[]});
 assert.deepEqual(result,{status:'NO_MATCH',matches:0,attendanceStatus:'NOT_APPLICABLE',timeStatus:'NOT_APPLICABLE',deductionStatus:'BLOCKED'});
 assert.doesNotMatch(JSON.stringify(result),/DOG-X|Private name|RSV-/);
});

test('missing pass link remains NEEDS_REVIEW and does not become NOT_REQUIRED',()=>{
 const summary=summarizeAttendance(approved,doc);
 const row=[approved,'2026-11-26','dog','private','', '예약',null,null,'하원','미차감',''];
 const result=compareWithSheets({bookingId:approved,attendance:summary,bookingRows:[row],historyRows:[]});
 assert.equal(result.deductionStatus,'NEEDS_REVIEW');
 assert.equal(result.status,'BLOCKED');
});

test('an exact linked row compares attendance while absent deduction evidence stays blocked',()=>{
 const summary=summarizeAttendance(approved,doc);
 summary.passDeductionStatus=null;
 const row=[approved,'2026-11-26','dog','private','PASS-X','예약',new Date('2026-11-26T09:31:44Z'),new Date('2026-11-26T09:32:21Z'),'하원','미차감',''];
 const result=compareWithSheets({bookingId:approved,attendance:summary,bookingRows:[row],historyRows:[]});
 assert.equal(result.attendanceStatus,'PASS');
 assert.equal(result.timeStatus,'PASS');
 assert.equal(result.deductionStatus,'BLOCKED');
 assert.equal(result.status,'BLOCKED');
});

test('confirmed completed deduction requires matching Firestore and Sheets history',()=>{
 const summary=summarizeAttendance(approved,doc);
 summary.passDeductionStatus='COMPLETED';
 const row=[approved,'2026-11-26','dog','private','PASS-X','예약',new Date('2026-11-26T09:31:44Z'),new Date('2026-11-26T09:32:21Z'),'하원','차감',''];
 const history=[['HIST','2026-11-26T09:32:23Z','차감','PASS-X',approved,-1,8,7,'AUTO_ATTENDANCE','']];
 const result=compareWithSheets({bookingId:approved,attendance:summary,bookingRows:[row],historyRows:history});
 assert.equal(result.attendanceStatus,'PASS');
 assert.equal(result.timeStatus,'PASS');
 assert.equal(result.deductionStatus,'PASS');
 assert.equal(result.status,'PASS');
});

test('a nonterminal Firestore deduction state is not treated as completed',()=>{
 const summary=summarizeAttendance(approved,doc);
 summary.passDeductionStatus='NEEDS_REVIEW';
 const row=[approved,'2026-11-26','dog','private','PASS-X','예약',new Date('2026-11-26T09:31:44Z'),new Date('2026-11-26T09:32:21Z'),'하원','차감',''];
 const history=[['HIST','2026-11-26T09:32:23Z','차감','PASS-X',approved,-1,8,7,'AUTO_ATTENDANCE','']];
 const result=compareWithSheets({bookingId:approved,attendance:summary,bookingRows:[row],historyRows:history});
 assert.equal(result.deductionStatus,'BLOCKED');
 assert.equal(result.status,'BLOCKED');
});
