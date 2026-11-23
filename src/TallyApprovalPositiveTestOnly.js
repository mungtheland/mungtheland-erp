/**
 * Synthetic-only positive approval test. Never run against real Tally records.
 * Test fixture: TEST:order:001, currently '심사중', no payment, no ERP writes.
 * Uses existing mdReviewTransition_TEST_ONLY() for the actual approval.
 */
function mdReviewApprovedFixture_TEST_ONLY(){
  const key='TEST:order:001';
  const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
  const sheet=book.getSheetByName('통합접수대장');
  const audit=book.getSheetByName('처리이력');
  if(!sheet||!audit)throw Error('Missing isolated test sheets');
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,18).getDisplayValues();
  const matches=rows.map((r,i)=>({r,row:i+2})).filter(x=>x.r[0]===key);
  if(matches.length!==1)throw Error('Fixture key missing or duplicated');
  const {r,row}=matches[0];
  if(r[12]!=='심사중'||r[13]!=='미확인'||r[14]!=='미반영')
    throw Error('Unexpected fixture state; stop');
  if(r[1]!=='order:TEST-001'||r[2]!=='contract:TEST-001'||r[8]!=='할인 신청 없음')
    throw Error('Unexpected fixture identity; stop');
  if(r[9]!=='후보 연결(직원확인)'||r[10]!=='행동·건강상태 직원 검토 필요'||r[11])
    throw Error('Fixture review fields already changed; stop');

  // These are synthetic test attestations, NOT real staff verification.
  const stamp=new Date();
  const auditRow=audit.getLastRow()+1;
  audit.getRange(auditRow,1,1,9).setValues([[
    Utilities.getUuid(),key,stamp,'검토 미완료','테스트 검토완료',
    '테스트담당자','가상 데이터 계약·행동 검토 완료 조건 설정','','테스트 조건 설정'
  ]]);
  sheet.getRange(row,10,1,3).setValues([['직원확인완료','검토완료','']]);
  const result=mdReviewTransition_TEST_ONLY(key,'승인','테스트담당자','가상 신청서 정상 승인 흐름 검증');
  const final=sheet.getRange(row,1,1,18).getDisplayValues()[0];
  if(final[12]!=='승인'||final[13]!=='미확인'||final[14]!=='미반영')
    throw Error('Approval/postconditions mismatch');
  const auditRows=audit.getRange(auditRow,1,audit.getLastRow()-auditRow+1,9).getDisplayValues();
  if(!auditRows.some(x=>x[1]===key&&x[3]==='심사중'&&x[4]==='승인'&&x[8]==='반영완료'))
    throw Error('Approval audit missing');
  const summary={passed:true,key,status:'승인',payment:'미확인',erp:'미반영',approvalAuditVerified:true};
  console.log(JSON.stringify(summary));
  return summary;
}
