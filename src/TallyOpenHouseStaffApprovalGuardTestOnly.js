/**
 * STEP 27: READ-ONLY staff authorization / approval preflight.
 * Synthetic scenario testing only. No sheet writes, no real approvals.
 */
function mdOpenHouseStaffApprovalGuard_TEST_ONLY() {
 const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const visits=ss.getSheetByName('오픈하우스확인_테스트');
 const queue=ss.getSheetByName('통합접수대장');
 const policy=ss.getSheetByName('할인정책_테스트');
 if(!visits||!queue||!policy)throw Error('Missing staging sheet');
 const vrows=visits.getDataRange().getValues().slice(1);
 const qrows=queue.getDataRange().getValues().slice(1);
 const p=Object.fromEntries(policy.getDataRange().getValues().slice(1).map(r=>[r[0],r]));
 if(!p.OPENHOUSE||p.OPENHOUSE[5]!=='정책확정'||Number(p.OPENHOUSE[2])!==0.05)throw Error('OPENHOUSE policy mismatch');
 const target=vrows.filter(r=>r[0]==='VISIT:TEST-STEP26-001');
 if(target.length!==1||target[0][3]!=='미확인(가상)'||target[0][9]!=='미승인'||target[0][20]!=='미반영')throw Error('Synthetic target modified unexpectedly');
 if(qrows.filter(r=>r[0]==='TEST:order:001').length!==1)throw Error('Synthetic receipt missing/duplicate');
 function ordinal(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d.getTime()/86400000:null;
 }
 function guard(a){
  const reasons=[];
  if(!a.isAuthorizedStaff||!a.staffId||!a.evidenceReference)reasons.push('STAFF_AUTH_OR_EVIDENCE_MISSING');
  if(!a.visitKey||!a.receiptKey||!a.uniqueVisit||!a.uniqueReceipt)reasons.push('LINK_NOT_UNIQUE');
  if(!a.attendanceConfirmed)reasons.push('ATTENDANCE_NOT_CONFIRMED');
  const d1=ordinal(a.visitDate),d2=ordinal(a.registrationDate);
  if(d1===null||d2===null||d2-d1<0||d2-d1>7)reasons.push('OUTSIDE_REGISTRATION_WINDOW');
  if(!a.discountRequested)reasons.push('DISCOUNT_NOT_REQUESTED');
  return {approvalEligible:reasons.length===0,reasons,approvalPerformed:false};
 }
 const ok={isAuthorizedStaff:true,staffId:'STAFF:TEST',evidenceReference:'EVIDENCE:TEST',visitKey:'VISIT:TEST',receiptKey:'TEST:order:001',uniqueVisit:true,uniqueReceipt:true,attendanceConfirmed:true,visitDate:'2026-11-23',registrationDate:'2026-11-30',discountRequested:true};
 const cases=[
  ['valid',{},true],['unauthorized',{isAuthorizedStaff:false},false],
  ['no_staff',{staffId:''},false],['no_evidence',{evidenceReference:''},false],
  ['unverified',{attendanceConfirmed:false},false],
  ['expired',{registrationDate:'2026-12-01'},false],
  ['before_visit',{registrationDate:'2026-11-22'},false],
  ['duplicate_visit',{uniqueVisit:false},false],
  ['duplicate_receipt',{uniqueReceipt:false},false],
  ['missing_request',{discountRequested:false},false],
  ['invalid_date',{visitDate:'2026-02-30'},false]
 ];
 cases.forEach(([name,override,expected])=>{
  const result=guard(Object.assign({},ok,override));
  if(result.approvalEligible!==expected||result.approvalPerformed)throw Error('Case failed: '+name);
 });
 const result={passed:true,syntheticCasesPassed:cases.length,staffAuthorizationRequired:true,
  evidenceReferenceRequired:true,uniqueLinkRequired:true,attendanceConfirmationRequired:true,
  registrationWindowDays:7,realVisitApproved:false,realDiscountApproved:false,
  auditWriteImplemented:false,productionWrites:0,stagingWrites:0,issuanceAllowed:false};
 console.log(JSON.stringify(result));return result;
}
