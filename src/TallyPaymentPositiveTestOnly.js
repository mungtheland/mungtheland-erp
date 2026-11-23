/**
 * Isolated positive payment-confirmation test for one synthetic record.
 * Never confirms real payments or writes to production ERP.
 * Run exactly once. On error, inspect the test sheet before retrying.
 */
function mdReviewPaymentPositive_TEST_ONLY(){
  const key='TEST:order:001';
  const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
  const sheet=book.getSheetByName('통합접수대장');
  const audit=book.getSheetByName('처리이력');
  if(!sheet||!audit)throw Error('Test sheets missing');
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,18).getDisplayValues();
  const found=rows.map((r,i)=>({r,row:i+2})).filter(x=>x.r[0]===key);
  if(found.length!==1)throw Error('Synthetic fixture missing or duplicated');
  const {r,row}=found[0];
  if(r[1]!=='order:TEST-001'||r[2]!=='contract:TEST-001')
    throw Error('Unexpected fixture identity');
  if(r[12]!=='승인'||r[13]!=='미확인'||r[14]!=='미반영')
    throw Error('Unexpected fixture state; do not rerun');
  const now=new Date();
  const preAuditRow=audit.getLastRow()+1;
  audit.getRange(preAuditRow,1,1,9).setValues([[
    Utilities.getUuid(),key,now,'미확인','입금확인','테스트담당자',
    '가상 입금확인 조건 설정 (실제 결제 아님)','','테스트 조건 설정'
  ]]);
  sheet.getRange(row,14).setValue('입금확인');
  const transition=mdReviewTransition_TEST_ONLY(key,'결제확인','테스트담당자','가상 입금확인 후 결제상태 전환 검증');
  const after=sheet.getRange(row,1,1,18).getDisplayValues()[0];
  const log=audit.getRange(transition.auditRow,1,1,9).getDisplayValues()[0];
  if(after[12]!=='결제확인'||after[13]!=='입금확인'||after[14]!=='미반영')
    throw Error('Postcondition mismatch');
  if(log[1]!==key||log[3]!=='승인'||log[4]!=='결제확인'||log[8]!=='반영완료')
    throw Error('Audit verification mismatch');
  const result={passed:true,key,status:'결제확인',payment:'입금확인',erp:'미반영',auditVerified:true,erpWrites:0};
  console.log(JSON.stringify(result));
  return result;
}
