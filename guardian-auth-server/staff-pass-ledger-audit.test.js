'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzePassLedger,EXPECTED_HEADERS}=require('./staff-pass-ledger-audit');
const {INTEGRATION_TEST_WORKBOOK_ID}=require('./staff-pass-ledger-read');

const catalog={P8:{kind:'RECURRING',total:8},P12:{kind:'RECURRING',total:12},P16:{kind:'RECURRING',total:16},P20:{kind:'RECURRING',total:20},DAY:{kind:'DAY'}};
function fixture(){
 const booking=['RSV-SYNTHETIC-052','2026-11-26','DOG-SYNTHETIC-052','PRIVATE_DOG','PASS-SYNTHETIC-052','예약','','','미등원','미차감','PRIVATE_NOTE'];
 const pass=['PASS-SYNTHETIC-052','DOG-SYNTHETIC-052','P8','PRIVATE_PRODUCT','2026-01-01',8,0,8,'2026-01-01','2026-12-31',0,0,0,'완료','사용 가능'];
 const workbook={complete:true,snapshot:{version:'synthetic-version',openedAt:10,closedAt:11,timeZone:'Etc/GMT'},
  bookings:{headers:[...EXPECTED_HEADERS.bookings],rows:[booking]},passes:{headers:[...EXPECTED_HEADERS.passes],rows:[pass]},
  history:{headers:[...EXPECTED_HEADERS.history],rows:[]}};
 return {workbook,booking,pass};
}
const run=(data,options={})=>analyzePassLedger({workbook:data.workbook,productCatalog:catalog,source:'synthetic',firestoreEvidence:[],...options});
const check=(result,code)=>result.checks[code];
const history=(id,at,action,passId,bookingId,delta,before,after,actor='manual')=>[id,at,action,passId,bookingId,delta,before,after,actor,'PRIVATE_REASON'];

test('A - duplicate booking IDs are counted without disclosing them',()=>{
 const f=fixture();f.workbook.bookings.rows.push([...f.booking]);
 const r=run(f);assert.equal(check(r,'A').status,'FAIL');assert.equal(check(r,'A').issues,1);
 assert.doesNotMatch(JSON.stringify(r),/RSV-|DOG-|PRIVATE/);
});
test('B - duplicate pass IDs and C - duplicate history IDs are counted',()=>{
 const f=fixture();f.workbook.passes.rows.push([...f.pass]);
 f.workbook.history.rows.push(history('HIS-DUP','2026-11-26T01:00:00.000Z','차감',f.pass[0],f.booking[0],-1,8,7),
  history('HIS-DUP','2026-11-26T01:01:00.000Z','복구',f.pass[0],f.booking[0],1,7,8));
 const r=run(f);assert.equal(check(r,'B').issues,1);assert.equal(check(r,'C').issues,1);
});
test('D - missing linked pass and E - cross-dog link are separate checks',()=>{
 const f=fixture();f.booking[4]='PASS-MISSING';
 assert.equal(check(run(f),'D').issues,1);
 f.booking[4]='';assert.equal(check(run(f),'D').issues,1);
 f.booking[4]=f.pass[0];f.pass[1]='DOG-OTHER';assert.equal(check(run(f),'E').issues,1);
});
test('F - explicit SKU map verifies 8/12/16/20 and unknown mappings block or fail closed',()=>{
 const f=fixture(),noMap=analyzePassLedger({workbook:f.workbook,source:'synthetic',firestoreEvidence:[]});
 assert.equal(check(noMap,'F').status,'BLOCKED');
 for(const [id,total] of [['P8',8],['P12',12],['P16',16],['P20',20]]){
  f.pass[2]=id;f.pass[5]=total;f.pass[7]=total;assert.equal(check(run(f),'F').status,'PASS');
 }
 f.pass[2]='UNKNOWN';assert.equal(check(run(f),'F').status,'BLOCKED');
});
test('unknown catalog blocks SKU, day-pass and confirmed attendance conclusions',()=>{
 const f=fixture();f.pass[2]='TEST-ONLY';f.booking[8]='등원 중';f.booking[6]='10:00';
 const r=run(f,{productCatalog:{}});
 assert.equal(check(r,'F').status,'BLOCKED');assert.equal(check(r,'Q').status,'BLOCKED');assert.equal(check(r,'S').status,'BLOCKED');
});
test('G - used plus remaining must equal total and H - remaining cannot be negative',()=>{
 const f=fixture();f.pass[7]=7;assert.equal(check(run(f),'G').status,'FAIL');
 f.pass[7]=-1;f.pass[6]=9;assert.equal(check(run(f),'H').status,'FAIL');
});
test('I - unpaid pass with use is detected',()=>{
 const f=fixture();f.pass[13]='미확인';f.pass[6]=1;f.pass[7]=7;
 assert.equal(check(run(f),'I').issues,1);
});
test('J - an out-of-period charge is detected using ISO calendar dates',()=>{
 const f=fixture();f.booking[1]='2025-12-31';f.booking[9]='차감';f.pass[6]=1;f.pass[7]=7;
 f.workbook.history.rows.push(history('HIS-1','2026-01-01T00:00:00.000Z','차감',f.pass[0],f.booking[0],-1,8,7));
 assert.equal(check(run(f),'J').issues,1);
});
test('K - repeated deductions and L - manual/automatic collision are detected',()=>{
 const f=fixture();f.booking[8]='등원 중';f.booking[6]='10:00';f.booking[9]='차감';f.pass[6]=2;f.pass[7]=6;
 f.workbook.history.rows.push(history('H1','2026-11-26T01:00:00.000Z','차감',f.pass[0],f.booking[0],-1,8,7),
  history('H2','2026-11-26T01:01:00.000Z','차감',f.pass[0],f.booking[0],-1,7,6,'AUTO_ATTENDANCE'));
 const r=run(f);assert.equal(check(r,'K').issues,1);assert.equal(check(r,'L').issues,1);
});
test('M - history transition continuity and N - current balance reconciliation',()=>{
 const f=fixture();f.pass[6]=2;f.pass[7]=6;
 f.workbook.history.rows.push(history('H1','2026-11-26T01:00:00.000Z','차감',f.pass[0],f.booking[0],-1,8,7),
  history('H2','2026-11-26T01:01:00.000Z','복구',f.pass[0],f.booking[0],1,5,6));
 const r=run(f);assert.equal(check(r,'M').status,'FAIL');assert.equal(check(r,'N').status,'FAIL');
});
test('O - cancelled booking with deduction and P - unconfirmed attendance with deduction are detected',()=>{
 const f=fixture();f.booking[5]='취소';f.booking[9]='차감';
 f.workbook.history.rows.push(history('H1','2026-11-26T01:00:00.000Z','차감',f.pass[0],f.booking[0],-1,8,7));
 const r=run(f);assert.equal(check(r,'O').issues,1);assert.equal(check(r,'P').issues,1);
});
test('Q - daily pass is excluded from recurring deductions',()=>{
 const f=fixture();f.pass[2]='DAY';f.pass[5]=1;f.pass[7]=1;f.booking[4]=f.pass[0];f.booking[9]='차감';
 f.workbook.history.rows.push(history('H1','2026-11-26T01:00:00.000Z','차감',f.pass[0],f.booking[0],-1,1,0));
 assert.equal(check(run(f),'Q').issues,1);
});
test('R - booking deduction flag must match ledger history and S - confirmed check-in must be reconciled',()=>{
 const f=fixture();f.booking[8]='등원 중';f.booking[6]='10:00';
 let r=run(f);assert.equal(check(r,'R').status,'PASS');assert.equal(check(r,'S').issues,1);
 f.booking[9]='차감';f.pass[6]=1;f.pass[7]=7;
 f.workbook.history.rows.push(history('H1','2026-11-26T01:00:00.000Z','차감',f.pass[0],f.booking[0],-1,8,7));
 r=run(f);assert.equal(check(r,'R').status,'PASS');assert.equal(check(r,'S').status,'PASS');
});
test('T - real Firestore comparison is blocked without authorized evidence',()=>{
 const f=fixture();f.workbook.workbookId=INTEGRATION_TEST_WORKBOOK_ID;
 const r=analyzePassLedger({workbook:f.workbook,productCatalog:catalog,source:'integration-test'});
 assert.equal(check(r,'T').status,'BLOCKED');
});
test('full header/schema and snapshot version are required, output is aggregate only',()=>{
 const f=fixture();f.workbook.bookings.headers[3]='unexpected';
 const r=run(f);assert.equal(Object.values(r.checks).filter(c=>c.status==='BLOCKED').length,20);
 const clean=fixture(),result=run(clean);assert.equal(result.writesPerformed,0);assert.equal(result.rowCounts.bookings,1);
 assert.doesNotMatch(JSON.stringify(result),/RSV-|DOG-|PASS-SYNTHETIC|PRIVATE/);
 clean.workbook.workbookId='different-test-file';
 const wrongTarget=analyzePassLedger({workbook:clean.workbook,productCatalog:catalog,source:'integration-test'});
 assert.equal(check(wrongTarget,'A').status,'BLOCKED');
});
