/**
 * TEST ONLY: controlled review transitions with append-only audit log.
 * Install only in isolated Apps Script project. Never touches production ERP.
 * Real Tally rows are blocked until a separate reviewed rollout.
 */
const MD_REVIEW_TEST_SHEET_ID='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
const MD_REVIEW_ALLOWED={
  '심사 필요':['심사중','보류','거절'],
  '심사중':['보류','거절','승인'],
  '보류':['심사중','거절'],
  '거절':[],
  '승인':['결제확인'],
  '결제확인':[],
  'ERP반영완료':[]
};
function mdReviewTransition_TEST_ONLY(key,nextStatus,reviewer,reason){
  if(!String(key).startsWith('TEST:'))throw Error('Only synthetic TEST: records are editable');
  if(!reviewer||!String(reviewer).trim()||!reason||!String(reason).trim())throw Error('Reviewer and reason required');
  if(!Object.prototype.hasOwnProperty.call(MD_REVIEW_ALLOWED,nextStatus))throw Error('Invalid target status');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw Error('Review lock busy');
  try{
    const book=SpreadsheetApp.openById(MD_REVIEW_TEST_SHEET_ID);
    const sheet=book.getSheetByName('통합접수대장');
    const audit=book.getSheetByName('처리이력');
    if(!sheet||!audit)throw Error('Required sheet missing');
    const n=sheet.getLastRow();
    if(n<2)throw Error('No review rows');
    const keys=sheet.getRange(2,1,n-1,1).getDisplayValues().map(r=>r[0]);
    const found=keys.reduce((a,v,i)=>v===key?[...a,i+2]:a,[]);
    if(found.length!==1)throw Error('Missing or duplicate review key');
    const row=found[0],values=sheet.getRange(row,1,1,18).getDisplayValues()[0];
    const prev=values[12];
    if(!(MD_REVIEW_ALLOWED[prev]||[]).includes(nextStatus))throw Error('Transition not allowed: '+prev+' -> '+nextStatus);
    if(nextStatus==='승인'){
      if(!values[1]||!values[2])throw Error('Both contract and order are required');
      if(values[9]!=='직원확인완료')throw Error('Contract identity must be manually verified');
      if(values[10]&&values[10]!=='검토완료')throw Error('Behavior/health review incomplete');
      if(values[11]&&values[11]!=='검토완료')throw Error('Discount review incomplete');
    }
    if(nextStatus==='결제확인'){
      if(values[13]!=='입금확인')throw Error('Independent payment verification required');
    }
    const now=new Date(),auditRow=audit.getLastRow()+1;
    // Write audit first. If row update fails, history remains available for reconciliation.
    audit.getRange(auditRow,1,1,9).setValues([[
      Utilities.getUuid(),key,now,prev,nextStatus,String(reviewer).trim(),String(reason).trim(),'','상태변경 요청'
    ]]);
    sheet.getRange(row,13).setValue(nextStatus);
    sheet.getRange(row,16,1,2).setValues([[String(reviewer).trim(),now]]);
    audit.getRange(auditRow,9).setValue('반영완료');
    return {key,previous:prev,current:nextStatus,auditRow};
  }finally{lock.releaseLock();}
}
/** Safe self-test: attempts an invalid transition; must fail without changing any row. */
function mdReviewGuardSelfTest_TEST_ONLY(){
  let blocked=false;
  try{mdReviewTransition_TEST_ONLY('TEST:order:001','ERP반영완료','테스트담당자','차단 검증');}
  catch(e){blocked=/Invalid target status|Transition not allowed/.test(String(e.message));}
  if(!blocked)throw Error('Review guard failed');
  return {blocked,productionWrites:0};
}
