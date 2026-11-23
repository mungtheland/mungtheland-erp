/**
 * STEP 31 — mock discount approval ledger, isolated staging only.
 * No actual staff authentication, real payment confirmation, approval or pass issuance.
 */
function mdOpenHouseMockDiscountLedger_TEST_ONLY(){
 const id='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
 const mockKey='MOCK-DISCOUNT:STEP31-001',visitKey='VISIT:TEST-STEP26-001',receiptKey='TEST:order:001';
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))throw Error('Unable to acquire script lock');
 try{
  const ss=SpreadsheetApp.openById(id);
  const visits=ss.getSheetByName('오픈하우스확인_테스트');
  const ledger=ss.getSheetByName('오픈하우스할인모의승인_테스트');
  const audit=ss.getSheetByName('오픈하우스승인이력_테스트');
  const policies=ss.getSheetByName('할인정책_테스트');
  const intake=ss.getSheetByName('통합접수대장');
  if([visits,ledger,audit,policies,intake].some(x=>!x))throw Error('Required isolated staging sheet missing');
  const v=visits.getDataRange().getValues().slice(1).filter(r=>String(r[0])===visitKey);
  if(v.length!==1||String(v[0][6])!==receiptKey||String(v[0][3])!=='모의확인(실제 미확인)'||String(v[0][9])!=='미승인'||String(v[0][20])!=='미반영')throw Error('Synthetic visit state changed');
  if(intake.getDataRange().getValues().slice(1).filter(r=>String(r[0])===receiptKey).length!==1)throw Error('Synthetic receipt not unique');
  if(audit.getDataRange().getValues().slice(1).filter(r=>String(r[0])==='AUDIT:TEST-STEP28-001').length!==1)throw Error('Synthetic attendance audit not unique');
  const entries=ledger.getDataRange().getValues().slice(1);
  const found=entries.filter(r=>String(r[0])===mockKey);
  if(found.length>1)throw Error('Duplicate mock approval keys');
  if(found.length===1){
   const r=found[0];
   if(String(r[1])!==visitKey||String(r[2])!==receiptKey||Number(r[8])!==0.25||Number(r[9])!==228000||Number(r[10])!==57000||Number(r[11])!==171000||Number(r[12])!==171000||String(r[15])!=='모의기록(실제승인아님)')throw Error('Existing ledger mismatch; manual reconciliation');
   const result={passed:true,action:'duplicate_blocked',mockLedgerRowsAdded:0,realDiscountApproved:false,actualPaymentConfirmed:false,issuanceAllowed:false,stagingWrites:0,productionWrites:0};
   console.log(JSON.stringify(result));return result;
  }
  const p=Object.fromEntries(policies.getDataRange().getValues().slice(1).map(r=>[String(r[0]),r]));
  function rate(code){const r=p[code];if(!r||String(r[5])!=='정책확정')throw Error('Policy not confirmed '+code);const raw=r[2];return typeof raw==='number'?(raw>1?raw/100:raw):Number(String(raw).replace('%',''))/100;}
  const total=rate('COMPANION')+rate('MULTIDOG')+rate('OPENHOUSE');
  if(Math.abs(total-0.25)>1e-9)throw Error('Discount policy rate drift');
  const base=228000,discount=Math.round(base*total),due=base-discount,mockPaid=171000;
  if(discount!==57000||due!==mockPaid)throw Error('Mock payment mismatch');
  ledger.appendRow([mockKey,visitKey,receiptKey,'STAFF:TEST-ONLY','EVIDENCE:SYNTHETIC-NOT-REAL','모의충족','모의충족','모의충족',total,base,discount,due,mockPaid,'가상금액 일치',new Date(),'모의기록(실제승인아님)','실제 방문·할인·입금 확인 아님; ERP 발급 금지']);
  SpreadsheetApp.flush();
  const logged=ledger.getDataRange().getValues().slice(1).filter(r=>String(r[0])===mockKey);
  const after=visits.getDataRange().getValues().slice(1).filter(r=>String(r[0])===visitKey);
  if(logged.length!==1||Number(logged[0][11])!==171000||after.length!==1||String(after[0][9])!=='미승인'||String(after[0][20])!=='미반영')throw Error('Post-write check failed; inspect isolated staging');
  const result={passed:true,action:'synthetic_discount_ledger_created',mockLedgerRowsAdded:1,additionalDiscountRate:total,baseSalePrice:base,additionalDiscountAmount:discount,expectedPayment:due,mockPaymentMatched:true,realDiscountApproved:false,actualPaymentConfirmed:false,issuanceAllowed:false,stagingWrites:1,productionWrites:0};
  console.log(JSON.stringify(result));return result;
 }finally{lock.releaseLock();}
}
