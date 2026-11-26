'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {execFileSync}=require('node:child_process');
const {createPassDeductionDryRun}=require('./staff-pass-dry-run');
const {createSyntheticDryRunFixture}=require('./run-staff-pass-dry-run.cjs');

const resultFor=(fixture)=>createPassDeductionDryRun(fixture.ports)(fixture.request);

test('A - a linked recurring pass forecasts a single use without persisting it',async()=>{
 const fixture=createSyntheticDryRunFixture();
 assert.deepEqual(await resultFor(fixture),{
  status:'ELIGIBLE',reason:'RECURRING_PASS',
  projection:{usedBefore:0,usedAfter:1,remainingBefore:8,remainingAfter:7},writesPerformed:0
 });
 assert.equal(fixture.pass[7],8);
 assert.equal(fixture.workbook.history.rows.length,0);
});

for(const [name,prepare,status,reason] of [
 ['B - day pass',f=>{f.pass[2]='PRODUCT-DAY';},'NOT_REQUIRED','DAY_PASS'],
 ['C - unlinked booking',f=>{f.booking[4]='';},'NEEDS_REVIEW','PASS_NOT_LINKED'],
 ['C - unknown product',f=>{f.pass[2]='';},'NEEDS_REVIEW','PASS_PRODUCT_UNCONFIRMED'],
 ['C - unexpected recurring count',f=>{f.pass[5]=9;f.pass[7]=9;},'NEEDS_REVIEW','PASS_RECURRING_COUNT_UNCONFIRMED'],
 ['D - mismatched dog',f=>{f.pass[1]='DOG-DIFFERENT';},'NEEDS_REVIEW','PASS_DOG_MISMATCH'],
 ['D - missing linked pass',f=>{f.workbook.passes.rows=[];},'NEEDS_REVIEW','PASS_LINK_MISMATCH'],
 ['D - duplicate linked pass rows',f=>{f.workbook.passes.rows.push([...f.pass]);},'NEEDS_REVIEW','PASS_DUPLICATE'],
 ['D - duplicate reservation rows',f=>{f.workbook.bookings.rows.push([...f.booking]);},'NEEDS_REVIEW','BOOKING_DUPLICATE'],
 ['D - missing reservation',f=>{f.workbook.bookings.rows=[];},'NEEDS_REVIEW','BOOKING_NOT_FOUND'],
 ['E - expired',f=>{f.pass[9]='2026-11-25';},'NEEDS_REVIEW','PASS_AFTER_EXPIRY'],
 ['E - before start',f=>{f.pass[8]='2026-11-27';},'NEEDS_REVIEW','PASS_BEFORE_START'],
 ['E - invalid date',f=>{f.pass[8]='2026-02-31';},'NEEDS_REVIEW','PASS_DATE_INVALID'],
 ['E - exhausted',f=>{
  f.pass[6]=8;f.pass[7]=0;f.pass[14]='소진';
  for(let i=0;i<8;i++)f.workbook.history.rows.push(['HIS-OLDER-'+i,'','차감',f.pass[0],'RSV-OLDER-'+i,-1,8-i,7-i,'','']);
 },'NEEDS_REVIEW','PASS_NO_REMAINING'],
 ['F - payment unconfirmed',f=>{f.pass[13]='미결제';},'NEEDS_REVIEW','PASS_PAYMENT_UNCONFIRMED'],
 ['G - existing manual deduction',f=>f.markManual(),'COMPLETED','ALREADY_MANUAL'],
 ['G - deduction flag differs from history',f=>{f.booking[9]='차감';},'NEEDS_REVIEW','PASS_DEDUCTION_FLAG_MISMATCH'],
 ['H - two different pass histories',f=>{
  f.markManual();f.workbook.history.rows.push(['HIS-OTHER','','차감','PASS-OTHER',f.booking[0],-1,8,7,'','']);
 },'NEEDS_REVIEW','PASS_CROSS_PASS_HISTORY'],
 ['H - remaining history chain gap',f=>{f.pass[6]=1;f.pass[7]=7;},'NEEDS_REVIEW','PASS_BALANCE_MISMATCH'],
 ['I - cancelled reservation',f=>{f.booking[5]='예약취소';},'NEEDS_REVIEW','PASS_BOOKING_ATTENDANCE_MISMATCH'],
 ['I - different reservation date',f=>{f.booking[1]='2026-11-25';},'NEEDS_REVIEW','PASS_BOOKING_ATTENDANCE_MISMATCH'],
 ['I - checkout in Sheets only',f=>{f.booking[6]='09:00';f.booking[7]='17:00';f.booking[8]='하원';},'NEEDS_REVIEW','PASS_BOOKING_ATTENDANCE_MISMATCH'],
 ['I - checkout in Firestore',f=>{
  const {document}=f.source;
  document.state='하원 완료';
  document.events.push({...document.events[0],eventId:'EVT-SYNTHETIC-OUT',action:'check-out',at:'2026-11-26T10:04:00Z'});
 },'NEEDS_REVIEW','PASS_CHECKOUT_COMPLETE'],
 ['I - missing check-in',f=>{f.source.document=null;},'NEEDS_REVIEW','ATTENDANCE_NOT_CONFIRMED'],
 ['I - attendance event ID mismatch',f=>{f.request.command.eventId='EVT-OTHER';},'NEEDS_REVIEW','ATTENDANCE_NOT_CONFIRMED'],
 ['I - inconsistent Firestore state',f=>{f.source.document.state='하원 완료';},'NEEDS_REVIEW','ATTENDANCE_NOT_CONFIRMED'],
 ['I - previous uncertain attempt',f=>{
  f.source.document.passDeduction={key:f.ports.binding.scope+':'+f.booking[0],eventId:f.request.command.eventId,status:'NEEDS_REVIEW'};
 },'NEEDS_REVIEW','ATTEMPT_ALREADY_RECORDED'],
 ['I - mismatched attempt evidence',f=>{
  f.source.document.passDeduction={key:'other-scope:'+f.booking[0],eventId:f.request.command.eventId,status:'PENDING'};
 },'NEEDS_REVIEW','ATTEMPT_SCOPE_OR_EVENT_MISMATCH'],
 ['I - terminal attempt differs from the ledger',f=>{
  f.pass[2]='PRODUCT-DAY';
  f.source.document.passDeduction={key:f.ports.binding.scope+':'+f.booking[0],eventId:f.request.command.eventId,status:'COMPLETED'};
 },'NEEDS_REVIEW','ATTEMPT_LEDGER_MISMATCH'],
 ['I - valid audit for previous automatic deduction',f=>{
  f.markManual();
  f.workbook.history.rows[0][8]='AUTO_ATTENDANCE';
  f.workbook.history.rows[0][9]=f.ports.binding.scope+':'+f.booking[0]+' '+f.request.command.eventId;
 },'COMPLETED','ALREADY_AUTOMATIC']
]){
 test(name,async()=>{
  const fixture=createSyntheticDryRunFixture();
  prepare(fixture);
  assert.deepEqual(await resultFor(fixture),{status,reason,writesPerformed:0});
 });
}

for(const [name,prepare,reason] of [
 ['J - bad Firebase token',f=>{f.request.staffCredential='invalid';},'STAFF_AUTH_FAILED'],
 ['J - guardian instead of active staff',f=>{f.ports.verifyStaff=async()=>({role:'guardian',status:'active'});},'STAFF_AUTH_FAILED'],
 ['K - staff credential reused as service credential',f=>{f.request.serviceCredential=f.request.staffCredential;},'SERVICE_AUTH_FAILED'],
 ['K - service subject not approved',f=>{f.ports.verifyService=async()=>({iss:f.ports.binding.issuer,aud:f.ports.binding.audience,sub:'other',exp:2000000000});},'SERVICE_AUTH_FAILED'],
 ['K - service audience not approved',f=>{f.ports.verifyService=async()=>({iss:f.ports.binding.issuer,aud:'other',sub:f.ports.binding.subject,exp:2000000000});},'SERVICE_AUTH_FAILED'],
 ['K - service credential expires during request',f=>{f.ports.verifyService=async()=>({iss:f.ports.binding.issuer,aud:f.ports.binding.audience,sub:f.ports.binding.subject,exp:f.ports.clock()/1000+1});},'SERVICE_AUTH_FAILED'],
 ['K - out-of-scope booking',f=>{f.request.command.bookingId='RSV-OUTSIDE';},'REQUEST_OUT_OF_SCOPE_OR_EXPIRED'],
 ['K - expired or overlong request',f=>{f.request.command.issuedAt-=61_000;},'REQUEST_OUT_OF_SCOPE_OR_EXPIRED'],
 ['K - caller cannot select workbook',f=>{f.request.command.workbookId='different-workbook';},'REQUEST_OUT_OF_SCOPE_OR_EXPIRED']
]){
 test(name,async()=>{
  const fixture=createSyntheticDryRunFixture();
  prepare(fixture);
  let reads=0;
  fixture.ports.readAttendance=fixture.ports.readLedger=async()=>{reads++;};
  assert.deepEqual(await resultFor(fixture),{status:'BLOCKED',reason,writesPerformed:0});
  assert.equal(reads,0);
 });
}

test('L - errors and incomplete snapshots block without fallback',async()=>{
 for(const [target,reason] of [
  ['readAttendance','ATTENDANCE_READ_FAILED'],['readLedger','LEDGER_READ_FAILED']
 ]){
  const fixture=createSyntheticDryRunFixture();
  let attempts=0;
  fixture.ports[target]=async()=>{attempts++;throw Error('SYNTHETIC_PRIVATE_API_DETAIL');};
  assert.deepEqual(await resultFor(fixture),{status:'BLOCKED',reason,writesPerformed:0});
  assert.equal(attempts,1);
 }

 for(const [change,reason] of [
  [f=>{f.source.databaseId='other';},'ATTENDANCE_SCOPE_UNVERIFIED'],
  [f=>{f.workbook.workbookId='other';},'LEDGER_SCOPE_OR_COMPLETENESS_UNVERIFIED'],
  [f=>{f.workbook.complete=false;},'LEDGER_SCOPE_OR_COMPLETENESS_UNVERIFIED'],
  [f=>{f.workbook.history.headers[2]='unknown';},'LEDGER_SCHEMA_UNVERIFIED']
 ]){
  const fixture=createSyntheticDryRunFixture();
  change(fixture);
  assert.deepEqual(await resultFor(fixture),{status:'BLOCKED',reason,writesPerformed:0});
 }
});

test('L - a stalled reader is aborted and no retry is made',async()=>{
 const fixture=createSyntheticDryRunFixture();
 let attempts=0,signal;
 fixture.ports.timeoutMs=25;
 fixture.ports.readLedger=options=>{attempts++;signal=options.signal;return new Promise(()=>{});};
 assert.deepEqual(await resultFor(fixture),{status:'BLOCKED',reason:'LEDGER_TIMEOUT',writesPerformed:0});
 assert.equal(attempts,1);
 assert.equal(signal.aborted,true);
});

test('M - CLI emits only counts, fixed codes and synthetic projection',()=>{
 const text=execFileSync(process.execPath,[require.resolve('./run-staff-pass-dry-run.cjs'),'--synthetic'],{encoding:'utf8'});
 const result=JSON.parse(text);
 assert.equal(result.source,'SYNTHETIC');
 assert.deepEqual(result.statuses,{ELIGIBLE:1,NOT_REQUIRED:1,NEEDS_REVIEW:3,COMPLETED:1});
 assert.equal(result.writesPerformed,0);
 assert.doesNotMatch(text,/RSV-|DOG-|PASS-SYNTHETIC|@example|synthetic-workbook|PRIVATE|credential|staffId/);
});

test('N - dry-run cannot operate the mutation ports and leaves both snapshots unchanged',async()=>{
 const fixture=createSyntheticDryRunFixture();
 const snapshots=structuredClone([fixture.workbook,fixture.source]);
 for(const property of ['deduct','restore','claimPassDeduction','finishPassDeduction','commitTransition','appendRow','update','set']){
  Object.defineProperty(fixture.ports,property,{get(){assert.fail('Dry-run accessed a mutation port');}});
 }
 assert.equal((await resultFor(fixture)).status,'ELIGIBLE');
 assert.equal((await resultFor(fixture)).status,'ELIGIBLE');
 assert.deepEqual([fixture.workbook,fixture.source],snapshots);
 assert.equal(require.cache[require.resolve('../src/PassAdjust.js')],undefined);
});
