/**
 * Isolated rejection tests against existing synthetic review row.
 * The transition must reject before audit/status writes.
 * Do not use real Tally submissions.
 */
function mdReviewApprovalGuard_TEST_ONLY(){
  const key='TEST:order:001';
  const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
  const review=book.getSheetByName('통합접수대장');
  const audit=book.getSheetByName('처리이력');
  const values=review.getRange(2,1,1,18).getDisplayValues()[0];
  if(values[0]!==key||values[12]!=='심사중')throw Error('Unexpected fixture state; stop');
  if(!values[1]||!values[2])throw Error('Fixture must have contract and order');
  if(values[9]==='직원확인완료')throw Error('Fixture already manually verified; stop');
  const historyBefore=audit.getLastRow();
  let message='';
  try{
    mdReviewTransition_TEST_ONLY(key,'승인','테스트담당자','미확인 계약 승인 차단 테스트');
  }catch(e){message=String(e.message);}
  if(!/Contract identity must be manually verified/.test(message))
    throw Error('Expected identity guard not triggered: '+message);
  const after=review.getRange(2,1,1,18).getDisplayValues()[0];
  if(after[12]!=='심사중'||audit.getLastRow()!==historyBefore)
    throw Error('Blocked approval modified review or history');
  console.log(JSON.stringify({passed:true,approvalBlocked:true,statusUnchanged:true,auditUnchanged:true,erpWrites:0}));
  return {passed:true,approvalBlocked:true,statusUnchanged:true,auditUnchanged:true,erpWrites:0};
}
