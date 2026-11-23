/**
 * Isolated negative test: approval does not imply payment confirmation.
 * Only synthetic TEST:order:001; no payment, audit, or ERP writes expected.
 */
function mdReviewPaymentGuard_TEST_ONLY(){
  const key='TEST:order:001';
  const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
  const sheet=book.getSheetByName('통합접수대장');
  const audit=book.getSheetByName('처리이력');
  if(!sheet||!audit)throw Error('Isolated test sheets missing');
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,18).getDisplayValues();
  const matches=rows.map((v,i)=>({v,row:i+2})).filter(x=>x.v[0]===key);
  if(matches.length!==1)throw Error('Fixture missing or duplicate');
  const {v,row}=matches[0];
  if(v[12]!=='승인'||v[13]!=='미확인'||v[14]!=='미반영')
    throw Error('Fixture precondition mismatch; stop');
  const beforeAudit=audit.getLastRow();
  let blocked=false,reason='';
  try{
    mdReviewTransition_TEST_ONLY(key,'결제확인','테스트담당자','미입금 결제확인 차단 테스트');
  }catch(e){
    reason=String(e.message);
    blocked=/Independent payment verification required/.test(reason);
  }
  if(!blocked)throw Error('Payment guard failed: '+reason);
  const after=sheet.getRange(row,1,1,18).getDisplayValues()[0];
  if(after[12]!=='승인'||after[13]!=='미확인'||after[14]!=='미반영')
    throw Error('Blocked payment attempt changed fixture');
  if(audit.getLastRow()!==beforeAudit)throw Error('Blocked payment attempt added audit row');
  const result={passed:true,paymentConfirmationBlocked:true,status:'승인',payment:'미확인',erp:'미반영',auditUnchanged:true,erpWrites:0};
  console.log(JSON.stringify(result));
  return result;
}
