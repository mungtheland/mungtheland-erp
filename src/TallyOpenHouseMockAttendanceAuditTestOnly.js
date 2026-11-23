/**
 * STEP 28 — SYNTHETIC ONLY.
 * Writes a mock attendance review to isolated staging, never actual approval.
 * Audit-first with lock, idempotency and post-write verification.
 */
function mdOpenHouseMockAttendanceAudit_TEST_ONLY(){
 const ssid='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
 const visitKey='VISIT:TEST-STEP26-001';
 const receiptKey='TEST:order:001';
 const auditKey='AUDIT:TEST-STEP28-001';
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('Could not obtain script lock');
 try{
  const ss=SpreadsheetApp.openById(ssid);
  const visits=ss.getSheetByName('오픈하우스확인_테스트');
  const audit=ss.getSheetByName('오픈하우스승인이력_테스트');
  const queue=ss.getSheetByName('통합접수대장');
  if(!visits||!audit||!queue)throw Error('Missing isolated sheet');
  const v=visits.getDataRange().getValues();
  const matches=[];
  for(let i=1;i<v.length;i++)if(String(v[i][0])===visitKey)matches.push(i);
  if(matches.length!==1)throw Error('Visit missing or duplicated');
  const idx=matches[0],row=v[idx];
  if(String(row[6])!==receiptKey||String(row[2])!=='GUARDIAN:TEST-STEP26')throw Error('Not synthetic target');
  const receipts=queue.getDataRange().getValues().slice(1).filter(r=>String(r[0])===receiptKey);
  if(receipts.length!==1)throw Error('Synthetic Tally receipt missing or duplicate');
  const otherLinks=v.slice(1).filter((r,i)=>i+1!==idx&&String(r[6])===receiptKey);
  if(otherLinks.length)throw Error('Receipt linked to multiple visits');
  const ar=audit.getDataRange().getValues().slice(1);
  const existing=ar.filter(r=>String(r[0])===auditKey);
  if(existing.length>1)throw Error('Duplicate audit key; manual reconciliation required');
  if(existing.length===1){
   if(String(row[3])==='모의확인(실제 미확인)'&&String(existing[0][9])==='모의처리기록') {
    const result={passed:true,action:'duplicate_blocked',auditRowsAdded:0,visitRowsUpdated:0,realAttendanceConfirmed:false,realDiscountApproved:false,productionWrites:0};
    console.log(JSON.stringify(result));return result;
   }
   throw Error('Partial/inconsistent audit state; manual reconciliation required');
  }
  if(String(row[3])!=='미확인(가상)'||String(row[9])!=='미승인'||String(row[20])!=='미반영')throw Error('Unexpected visit state');
  const timestamp=new Date();
  audit.appendRow([auditKey,visitKey,receiptKey,'방문확인 모의전환','미확인(가상)','모의확인(실제 미확인)','STAFF:TEST-ONLY',timestamp,'EVIDENCE:SYNTHETIC-NOT-REAL','모의처리기록','가상 데이터 전용. 실제 방문확인·할인승인 아님']);
  SpreadsheetApp.flush();
  // If the following update fails, the audit remains as a reconciliation marker.
  visits.getRange(idx+1,4).setValue('모의확인(실제 미확인)');
  SpreadsheetApp.flush();
  const after=visits.getRange(idx+1,1,1,22).getValues()[0];
  const logged=audit.getDataRange().getValues().slice(1).filter(r=>String(r[0])===auditKey);
  if(after[3]!=='모의확인(실제 미확인)'||after[9]!=='미승인'||after[20]!=='미반영'||logged.length!==1)throw Error('Post-write verification failed; reconcile staging manually');
  const result={passed:true,action:'synthetic_attendance_audited',auditRowsAdded:1,visitRowsUpdated:1,
   realAttendanceConfirmed:false,realDiscountApproved:false,issuanceAllowed:false,
   productionWrites:0,stagingWrites:2};
  console.log(JSON.stringify(result));return result;
 }finally{lock.releaseLock();}
}
