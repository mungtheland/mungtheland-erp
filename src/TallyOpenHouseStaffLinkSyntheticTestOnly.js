/**
 * Step 26: isolated synthetic staff link test. Writes exactly one synthetic
 * visit record to the staging sheet; NEVER writes production or real Tally rows.
 * Requires manually running this function. Re-runs are idempotent.
 */
function mdOpenHouseStaffLinkSynthetic_TEST_ONLY(){
 const spreadsheetId='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
 const visitKey='VISIT:TEST-STEP26-001';
 const receiptKey='TEST:order:001';
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('Could not obtain script lock');
 try{
  const ss=SpreadsheetApp.openById(spreadsheetId);
  const visits=ss.getSheetByName('오픈하우스확인_테스트');
  const queue=ss.getSheetByName('통합접수대장');
  if(!visits||!queue)throw Error('Staging sheets not found');
  const receiptRows=queue.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim()===receiptKey);
  if(receiptRows.length!==1)throw Error('Synthetic receipt missing or duplicated');
  const all=visits.getDataRange().getValues().slice(1);
  const sameVisit=all.filter(r=>String(r[0]).trim()===visitKey);
  const sameReceipt=all.filter(r=>String(r[6]).trim()===receiptKey);
  if(sameVisit.length>1||sameReceipt.length>1)throw Error('Duplicate link records detected');
  if(sameVisit.length===1){
   if(String(sameVisit[0][6]).trim()!==receiptKey)throw Error('Visit key conflicts with another receipt');
   const result={passed:true,action:'duplicate_blocked',visitKey,receiptKey,productionWrites:0,stagingRowsAdded:0,discountApproved:false,issuanceAllowed:false};
   console.log(JSON.stringify(result));return result;
  }
  if(sameReceipt.length)throw Error('Receipt already linked to another visit');
  // This is fabricated test data. No real attendance or discount approval.
  const row=[
   visitKey,'2026-11-23','GUARDIAN:TEST-STEP26','미확인(가상)','',
   '',receiptKey,'2026-11-30','검토필요','미승인','미승인','미승인',
   0,'',0,0,0,'','미확인','미검토','미반영',
   'STEP26 SYNTHETIC ONLY; 실제 방문 증빙 없음; 직원 확인 및 할인 승인 금지'
  ];
  visits.appendRow(row);
  SpreadsheetApp.flush();
  const matching=visits.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim()===visitKey&&String(r[6]).trim()===receiptKey);
  if(matching.length!==1)throw Error('Post-write verification failed; inspect staging manually');
  const result={passed:true,action:'synthetic_link_created',visitKey,receiptKey,stagingRowsAdded:1,
   attendanceVerified:false,discountApproved:false,issuanceAllowed:false,productionWrites:0};
  console.log(JSON.stringify(result));return result;
 }finally{lock.releaseLock();}
}
