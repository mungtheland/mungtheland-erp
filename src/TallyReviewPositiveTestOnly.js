/** One-time positive-path review test. Synthetic record only. */
function mdReviewPositiveSelfTest_TEST_ONLY(){
  const key='TEST:order:001';
  const result=mdReviewTransition_TEST_ONLY(key,'심사중','테스트담당자','가상 접수 심사 시작 검증');
  if(result.previous!=='심사 필요'||result.current!=='심사중')throw Error('Unexpected transition result');
  const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
  const sheet=book.getSheetByName('통합접수대장');
  const audit=book.getSheetByName('처리이력');
  const keys=sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().map(r=>r[0]);
  const index=keys.indexOf(key);
  if(index<0)throw Error('Test row not found after transition');
  const state=sheet.getRange(index+2,13).getDisplayValue();
  const log=audit.getRange(result.auditRow,1,1,9).getDisplayValues()[0];
  if(state!=='심사중'||log[1]!==key||log[3]!=='심사 필요'||log[4]!=='심사중'||log[8]!=='반영완료')
    throw Error('Review/audit verification mismatch');
  console.log(JSON.stringify({passed:true,key,status:state,auditVerified:true,erpWrites:0}));
  return {passed:true,status:state,auditVerified:true,erpWrites:0};
}
