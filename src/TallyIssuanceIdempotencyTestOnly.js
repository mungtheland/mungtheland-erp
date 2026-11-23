/**
 * TEST ONLY. Simulates one ticket issuance in the isolated spreadsheet.
 * Never creates an ERP ticket or writes to production.
 * Idempotent by Tally order submission ID under a script lock.
 */
function mdSimulateIssuance_TEST_ONLY(){
  const key='TEST:order:001';
  const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
  const review=book.getSheetByName('통합접수대장');
  const ledger=book.getSheetByName('발급관리_테스트');
  if(!review||!ledger)throw Error('Isolated sheets missing');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw Error('Issuance lock busy');
  try{
    const headers=['발급 고유키','접수키','상품신청 ID','입소계약 ID','처리상태','가상 이용권 ID','처리시각','처리자','처리결과','비고'];
    const actual=ledger.getRange(1,1,1,10).getDisplayValues()[0];
    if(actual.some((v,i)=>v!==headers[i]))throw Error('Ledger schema changed');
    const count=review.getLastRow();
    if(count<2)throw Error('Review empty');
    const matches=review.getRange(2,1,count-1,18).getDisplayValues().filter(r=>r[0]===key);
    if(matches.length!==1)throw Error('Synthetic key missing/duplicate');
    const r=matches[0];
    if(r[1]!=='order:TEST-001'||r[2]!=='contract:TEST-001'||r[12]!=='결제확인'||r[13]!=='입금확인'||r[14]!=='미반영')
      throw Error('Fixture identity or payment state changed');
    const issueKey='TALLY-ORDER:'+r[1];
    const n=ledger.getLastRow();
    const existing=n>1?ledger.getRange(2,1,n-1,10).getDisplayValues():[];
    const hits=existing.filter(x=>x[0]===issueKey);
    if(hits.length>1)throw Error('Duplicate ledger keys detected; manual investigation required');
    if(hits.length===1){
      if(hits[0][1]!==key||hits[0][2]!==r[1]||hits[0][3]!==r[2]||hits[0][4]!=='발급완료(모의)')
        throw Error('Existing issuance record mismatch; manual investigation required');
      const result={passed:true,action:'duplicate_blocked',issueKey,simulatedTickets:1,erpWrites:0};
      console.log(JSON.stringify(result));
      return result;
    }
    const mockId='MOCK-TICKET-TEST-001';
    ledger.getRange(n+1,1,1,10).setValues([[issueKey,key,r[1],r[2],'발급완료(모의)',mockId,new Date(),'테스트담당자','최초 모의발급','실제 ERP 발급 없음']]);
    SpreadsheetApp.flush();
    const result={passed:true,action:'simulated_once',issueKey,simulatedTickets:1,erpWrites:0};
    console.log(JSON.stringify(result));
    return result;
  }finally{lock.releaseLock();}
}
