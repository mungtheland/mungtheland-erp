'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/PassIssuanceLedger.js','utf8');
let workbookOpens=0;
const context={Date,Set,Object,Array,Number,String,Math,Error,JSON,Utilities:{},
 mdBook_:()=>{workbookOpens++;throw Error('unexpected workbook access');}};
vm.runInNewContext(source,context,{filename:'src/PassIssuanceLedger.js'});
const {mdPassIssuanceRunWithPorts_,mdPassIssuanceReconcile_,mdPersistPassIssuance_,mdPassIssuanceValidateCommand_}=context;
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(error){console.error('FAIL '+name);throw error;}}

const makeCommand=(overrides={})=>({validationStatus:'VALIDATED',issuanceRequestId:'REQ-SYNTH-62001',
 idempotencyKey:'PASS-ISSUE:v4:REQ-SYNTH-62001',paymentReference:'PAY-SYNTH-62001',productId:'SYNTH-PASS-8',productName:'Synthetic eight uses',
 catalogVersion:4,productType:'PASS',approvalStatus:'APPROVED',active:true,petId:'PET-SYNTH-01',guardianId:'GUARD-SYNTH-01',
 totalUses:8,amount:80000,saleAmount:80000,discountAmount:0,startDate:'2026-11-27',expiryDate:'2027-11-27',
 paymentStatus:'완료',requestedAt:'2026-11-27T01:00:00.000Z',committedAt:'',sourceChannel:'synthetic-test',
 auditReference:'AUDIT-SYNTH-62001',...overrides});
function harness(options={}){
 const ledger=[],passes=[];let writes={ledger:0,pass:0,commit:0},released=0,readCount=0,coverage=options.coverage||'COMPLETE';
 const fault=options.fault||'';
 const lock={tryLock:()=>options.lockAvailable!==false,releaseLock:()=>{released++;}};
 const ports={getLock:()=>lock,createPassId:()=>options.passId||'SYNTH-PASS-62001',now:()=> '2026-11-27T01:00:01.000Z',
  readSnapshot(){readCount++;if(fault==='READ'&&readCount>1)throw Error('synthetic readback fault');return {schemaValid:true,
   legacyPaymentReferenceCoverage:coverage,ledger:structuredClone(ledger),passes:structuredClone(passes)};},
  appendLedger(row){writes.ledger++;if(fault==='LEDGER_BEFORE')throw Error('synthetic fault');ledger.push(structuredClone(row));if(fault==='LEDGER_AFTER')throw Error('synthetic lost acknowledgement');return ledger.length+1;},
  appendPass(row){writes.pass++;if(fault==='PASS_BEFORE')throw Error('synthetic fault');passes.push(structuredClone(row));if(fault==='PASS_AFTER')throw Error('synthetic lost acknowledgement');},
  updateLedger(rowNumber,changes){writes.commit++;if(fault==='COMMIT_BEFORE')throw Error('synthetic fault');
   const row=ledger[rowNumber-2];if(row.issuanceRequestId!==changes.issuanceRequestId||row.issuanceStatus!==changes.expectedStatus)return false;
   const {issuanceRequestId,expectedStatus,...updates}=structuredClone(changes);Object.assign(row,updates);
   if(fault==='COMMIT_AFTER')throw Error('synthetic lost acknowledgement');return true;}};
 return {ledger,passes,writes,released,lock,ports,getReleased:()=>released,getReads:()=>readCount,setCoverage:value=>{coverage=value;},issue:(cmd=makeCommand())=>mdPassIssuanceRunWithPorts_(cmd,ports)};
}

test('disabled Apps Script entry returns before workbook access',()=>{
 workbookOpens=0;const result=mdPersistPassIssuance_(makeCommand());assert.equal(result.status,'DISABLED');
 assert.equal(result.reason,'ISSUANCE_STORAGE_DISABLED');assert.equal(workbookOpens,0);
});
test('command requires approved catalog, recurring pass, payment and stable idempotency key',()=>{
 assert.equal(mdPassIssuanceValidateCommand_(makeCommand()).ok,true);
 for(const patch of [{approvalStatus:'DRAFT'},{productType:'TEST_ONLY'},{active:false},{paymentStatus:'미결제'},
  {idempotencyKey:'wrong'},{totalUses:7},{amount:-1},{issuanceRequestId:' REQ-SYNTH-62001'}])
  assert.equal(mdPassIssuanceValidateCommand_(makeCommand(patch)).ok,false);
 for(const patch of [{startDate:'2026-02-30'},{expiryDate:'2026-01-01'},{amount:70000},{saleAmount:70000,discountAmount:80000}])
  assert.equal(mdPassIssuanceValidateCommand_(makeCommand(patch)).ok,false);
});
test('reconciliation reports NO_MATCH, MATCH, PARTIAL and MISMATCH without normalization',()=>{
 assert.equal(mdPassIssuanceReconcile_([],[]).status,'NO_MATCH');
 const l={issuanceRequestId:'R',idempotencyKey:'K',paymentReference:'P',productId:'SKU',catalogVersion:1,petId:'DOG',guardianId:'G',
  passId:'PASS-1',totalUses:8,issuanceStatus:'COMMITTED',committedAt:'2026-11-27T00:00:00.000Z'};
 const p={passId:'PASS-1',productId:'SKU',petId:'DOG',totalUses:8,usedUses:0,remainingUses:8};
 assert.equal(mdPassIssuanceReconcile_([l],[p]).status,'MATCH');
 assert.equal(mdPassIssuanceReconcile_([{...l,issuanceStatus:'PENDING',committedAt:''}],[p]).status,'PARTIAL');
 assert.equal(mdPassIssuanceReconcile_([l],[{...p,productId:' sku'}]).status,'MISMATCH');
 assert.equal(mdPassIssuanceReconcile_([l],[]).status,'NEEDS_REVIEW');
 assert.equal(mdPassIssuanceReconcile_([l,l],[p]).status,'DUPLICATE');
});
test('lock unavailable blocks before reading and always avoids writes',()=>{
 const h=harness({lockAvailable:false});assert.equal(h.issue().reason,'LOCK_TIMEOUT');assert.equal(h.writes.ledger,0);assert.equal(h.getReads(),0);assert.equal(h.getReleased(),0);
});
test('legacy payment reference coverage must be complete before any persistence',()=>{
 const h=harness({coverage:'INCOMPLETE'});assert.equal(h.issue().reason,'LEGACY_PAYMENT_REFERENCE_UNVERIFIED');assert.equal(h.writes.ledger,0);
});
test('spreadsheet adapter maps only the declared tabs and writes only against mock sheets',()=>{
 const ledgerHeaders=['발급요청 ID','멱등성 키','결제 참조','상품 ID','카탈로그 버전','반려견 ID','보호자 ID','이용권 ID',
  '총 횟수','발급 상태','요청시각','확정시각','처리 횟수','마지막 오류 코드','신청 채널','감사 참조'];
 const passHeaders=['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'];
 const makeSheet=headers=>({headers,grid:[headers],getLastRow(){return this.grid.length;},getLastColumn(){return this.headers.length;},
  getRange(r,c,nRows,nCols){const sheet=this;return {getDisplayValues(){return Array.from({length:nRows},(_,i)=>Array.from({length:nCols},(_,j)=>String(sheet.grid[r-1+i]?.[c-1+j]??'')));},
   getValues(){return Array.from({length:nRows},(_,i)=>Array.from({length:nCols},(_,j)=>sheet.grid[r-1+i]?.[c-1+j]??''));},
   setValues(values){values.forEach((row,i)=>{sheet.grid[r-1+i]=[...(sheet.grid[r-1+i]||[])];row.forEach((v,j)=>sheet.grid[r-1+i][c-1+j]=v);});}};},
  appendRow(row){this.grid.push(row);}});
 const ledger=makeSheet(ledgerHeaders),passes=makeSheet(passHeaders),flush={count:0};
 context.MD_SCHEMAS={'이용권관리':passHeaders};context.mdHeaders_=sheet=>sheet.headers;
 const requestedSheetNames=[];context.mdBook_=()=>({getSheetByName:name=>{requestedSheetNames.push(name);return requestedSheetNames.length===1?ledger:passes;}});
 context.SpreadsheetApp={flush:()=>flush.count++};
 const ports=context.mdPassIssuanceSpreadsheetPorts_();assert.equal(requestedSheetNames[0],context.mdPassIssuanceV2SheetName_());
 const snapshot=ports.readSnapshot();
 assert.equal(snapshot.schemaValid,true);assert.equal(snapshot.legacyPaymentReferenceCoverage,'INCOMPLETE');
 const row=ports.appendLedger({issuanceRequestId:'REQ-SYNTH-62003',idempotencyKey:'KEY',paymentReference:'PAY-SYNTH-62003',
  productId:'SYNTH-PASS-8',catalogVersion:4,petId:'PET-SYNTH-01',guardianId:'GUARD-SYNTH-01',passId:'PASS-SYNTH-62003',
  totalUses:8,issuanceStatus:'PENDING',requestedAt:'2026-11-27T00:00:00.000Z',committedAt:'',attemptCount:1,lastErrorCode:'',
  sourceChannel:'synthetic-test',auditReference:'AUDIT-SYNTH-62003'});
 assert.equal(row,2);ports.appendPass({passId:'PASS-SYNTH-62003',petId:'PET-SYNTH-01',productId:'SYNTH-PASS-8',productName:'Synthetic pass',
  totalUses:8,amount:80000,saleAmount:80000,discountAmount:0,startDate:'2026-11-27',expiryDate:'2027-11-27'});
 assert.equal(ports.updateLedger(2,{issuanceRequestId:'REQ-SYNTH-62003',expectedStatus:'PENDING',issuanceStatus:'NEEDS_REVIEW',lastErrorCode:'SYNTHETIC_REVIEW'}),true);
 assert.equal(ledger.grid[1][0],'REQ-SYNTH-62003');assert.equal(ledger.grid[1][9],'NEEDS_REVIEW');
 assert.equal(passes.grid[1][0],'PASS-SYNTH-62003');assert.equal(passes.grid[1][3],'Synthetic pass');assert.equal(passes.grid[1][7],8);
 assert.equal(passes.grid[1][12],80000);assert.equal(flush.count,3);
});
test('legacy 13-column issuance tab is rejected without creating or changing sheets',()=>{
 const legacyHeaders=['Issuance request ID','Pass ID','Pet ID','Uses','Start date','Expiry date','Sale amount',
  'Discount amount','Payment amount','Payment method','Approver','Approved at','Status'];
 let writes=0;
 const legacySheet={getRange(){return {getDisplayValues:()=>[legacyHeaders]};},getLastColumn:()=>legacyHeaders.length,
  getLastRow:()=>1,appendRow(){writes++;},insertColumnAfter(){writes++;}};
 context.MD_SCHEMAS={'이용권관리':[]};context.mdHeaders_=()=>[];
 context.mdBook_=()=>({getSheetByName:()=>legacySheet,insertSheet(){writes++;throw Error('unexpected sheet creation');}});
 assert.throws(()=>context.mdPassIssuanceSpreadsheetPorts_(),/ISSUANCE_LEDGER_SCHEMA_MISMATCH/);
 assert.equal(writes,0);
});
test('V2 writer does not fall back to the legacy issuance tab',()=>{
 const requested=[];const legacySheet={};
 context.mdBook_=()=>({getSheetByName:name=>{requested.push(name);return name==='_이용권발급이력'?legacySheet:null;}});
 assert.throws(()=>context.mdPassIssuanceSpreadsheetPorts_(),/ISSUANCE_LEDGER_TAB_MISSING/);
 assert.equal(requested[0],context.mdPassIssuanceV2SheetName_());
 assert.notEqual(requested[0],'_이용권발급이력');
});
test('normal issuance records pending, pass, then committed and verifies final pair',()=>{
 const h=harness();const result=h.issue();assert.equal(result.status,'COMMITTED');assert.equal(result.alreadyCommitted,false);
 assert.equal(h.ledger[0].issuanceStatus,'COMMITTED');assert.equal(h.ledger[0].passId,'SYNTH-PASS-62001');
 assert.equal(h.passes.length,1);assert.deepEqual(h.writes,{ledger:1,pass:1,commit:1});assert.equal(h.getReleased(),1);
});
test('same request retry returns the committed pass and writes nothing again',()=>{
 const h=harness();h.issue();const before={...h.writes};const result=h.issue();assert.equal(result.status,'COMMITTED');assert.equal(result.alreadyCommitted,true);
 assert.deepEqual(h.writes,before);assert.equal(h.passes.length,1);
});
test('competing mock callers leave one pass and one committed row',()=>{
 const h=harness();const results=[h.issue(),h.issue()];
 assert.equal(results.filter(result=>result.status==='COMMITTED').length,2);assert.equal(h.passes.length,1);assert.equal(h.ledger.length,1);
 assert.equal(h.writes.ledger,1);assert.equal(h.writes.pass,1);assert.equal(h.writes.commit,1);
});
test('committed same-request lookup remains available even when legacy payment coverage is incomplete',()=>{
 const h=harness();h.issue();const writes={...h.writes};h.setCoverage('INCOMPLETE');
 const result=h.issue();assert.equal(result.status,'COMMITTED');assert.equal(result.alreadyCommitted,true);assert.deepEqual(h.writes,writes);
});
test('payment reference reused by a different request is blocked',()=>{
 const h=harness();h.issue();const result=h.issue(makeCommand({issuanceRequestId:'REQ-SYNTH-62002',idempotencyKey:'PASS-ISSUE:v4:REQ-SYNTH-62002'}));
 assert.equal(result.reason,'PAYMENT_REFERENCE_CONFLICT');assert.equal(h.passes.length,1);
});
test('new pass ID collision blocks before the pending ledger is written',()=>{
 const h=harness();h.passes.push({passId:'SYNTH-PASS-62001',productId:'SYNTH-PASS-8',petId:'PET-SYNTH-OTHER',totalUses:8});
 const result=h.issue();assert.equal(result.reason,'PASS_ID_DUPLICATE');assert.equal(h.ledger.length,0);assert.equal(h.writes.ledger,0);
});
test('same request with changed payment reference is blocked',()=>{
 const h=harness();h.issue();const result=h.issue(makeCommand({paymentReference:'PAY-SYNTH-OTHER'}));assert.equal(result.reason,'REQUEST_ID_CONFLICT');
});
test('pending state after append acknowledgement loss is never automatically reissued',()=>{
 const h=harness({fault:'LEDGER_AFTER'});assert.equal(h.issue().reason,'PENDING_WRITE_UNKNOWN');assert.equal(h.ledger.length,1);
 assert.equal(h.issue().reason,'PENDING_RECONCILIATION_REQUIRED');assert.equal(h.passes.length,0);
});
for(const point of ['LEDGER_BEFORE','PASS_BEFORE','PASS_AFTER','READ','COMMIT_BEFORE'])test('failure '+point+' leaves no false committed result',()=>{
 const h=harness({fault:point});const result=h.issue();assert.notEqual(result.status,'COMMITTED');assert.equal(h.getReleased(),1);
 if(point==='LEDGER_BEFORE')assert.equal(h.ledger.length,0);
 else assert.ok(h.ledger.length===1);
});
test('commit response loss is resolved by exact read-only reconciliation on retry',()=>{
 const h=harness({fault:'COMMIT_AFTER'});assert.equal(h.issue().reason,'COMMIT_MARKER_UNKNOWN');
 const retry=h.issue();assert.equal(retry.status,'COMMITTED');assert.equal(retry.alreadyCommitted,true);assert.equal(h.passes.length,1);
});
test('script lock is released when snapshot access throws',()=>{
 const h=harness({fault:'READ'});assert.equal(h.issue().reason,'PASS_READBACK_UNKNOWN');assert.equal(h.getReleased(),1);
});
test('unknown duplicate, pass-only and ledger-only states require review',()=>{
 const h=harness();h.passes.push({passId:'OLD',issuanceRequestId:'REQ-SYNTH-62001',paymentReference:'PAY-SYNTH-62001'});
 assert.equal(h.issue().reason,'PASS_WITHOUT_LEDGER');
 const duplicate=harness();duplicate.ledger.push({issuanceRequestId:'REQ-SYNTH-62001',idempotencyKey:'K',paymentReference:'PAY-SYNTH-62001',issuanceStatus:'PENDING'});
 duplicate.ledger.push({...duplicate.ledger[0]});assert.equal(duplicate.issue().reason,'DUPLICATE_RECORD');
 const ledgerOnly=mdPassIssuanceReconcile_([{issuanceRequestId:'R',issuanceStatus:'COMMITTED',passId:'P'}],[]);
 assert.equal(ledgerOnly.status,'NEEDS_REVIEW');
});
test('script lock is released after storage failures',()=>{
 for(const fault of ['LEDGER_AFTER','PASS_BEFORE','PASS_AFTER','COMMIT_BEFORE','COMMIT_AFTER']){
  const h=harness({fault});h.issue();assert.equal(h.getReleased(),1);
 }
});

console.log('PASS: '+passed+' issuance ledger adapter contract checks; no live storage invoked');
