/** Isolated guardian enrollment state machine.
 * No public endpoint, password handling, or identity proof implied.
 * A trusted staff principal is required for verification; production requires
 * independently established staff authentication and an identity-check policy.
 */
const MD_GE_HEADERS_=['고객 ID','초대 확인','본인확인','활성화','확인 직원','확인시각'];
function mdGuardianEnrollmentSheet_(){
 const s=mdGuardianTestBook_().getSheetByName('보호자계정테스트');
 if(!s)throw Error('Enrollment test sheet not initialized');
 const h=s.getRange(1,1,1,MD_GE_HEADERS_.length).getDisplayValues()[0];
 if(h.some((v,i)=>v!==MD_GE_HEADERS_[i]))throw Error('Enrollment schema mismatch');
 return s;
}
function mdGuardianEnrollmentTestSetup_(){
 const book=mdGuardianTestBook_();
 let s=book.getSheetByName('보호자계정테스트');
 if(!s){s=book.insertSheet('보호자계정테스트');s.getRange(1,1,1,MD_GE_HEADERS_.length).setValues([MD_GE_HEADERS_]);}
 return {ok:true,sheet:s.getName()};
}
function mdGuardianEnrollmentRecordInvite_(consumed){
 if(!consumed||consumed.invitationConsumed!==true||consumed.accountActivated!==false||consumed.customerId!=='CUS-TEST-001')throw Error('Invalid invitation result');
 mdGuardianAccessTestFixture_();
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const s=mdGuardianEnrollmentSheet_(),last=s.getLastRow();
  const rows=last>1?s.getRange(2,1,last-1,1).getDisplayValues():[];
  const matches=rows.map((r,i)=>r[0]===consumed.customerId?i+2:0).filter(Boolean);
  if(matches.length>1)throw Error('Duplicate enrollment');
  if(matches.length===1){
   const row=s.getRange(matches[0],1,1,MD_GE_HEADERS_.length).getValues()[0];
   if(row[2]===true||row[3]===true)throw Error('Already verified');
   s.getRange(matches[0],2).setValue(true);
  }else{s.appendRow([consumed.customerId,true,false,false,'','']);}
  return {customerId:consumed.customerId,invited:true,verified:false,active:false};
 }finally{lock.releaseLock();}
}
function mdGuardianEnrollmentVerifyInternal_(staff,customerId,verifiedEvidence){
 if(!staff||staff.role!=='staff'||!staff.staffId)throw Error('Trusted staff required');
 // Evidence is a structured assertion from a trusted staff workflow, NOT browser input.
 if(!verifiedEvidence||verifiedEvidence.method!=='in_person_id_check'||verifiedEvidence.confirmed!==true)throw Error('Identity verification required');
 if(customerId!=='CUS-TEST-001')throw Error('Only synthetic test customer allowed');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const s=mdGuardianEnrollmentSheet_(),last=s.getLastRow();
  const rows=last>1?s.getRange(2,1,last-1,MD_GE_HEADERS_.length).getValues():[];
  const matches=rows.map((r,i)=>String(r[0])===customerId?i+2:0).filter(Boolean);
  if(matches.length!==1)throw Error('Enrollment not found or duplicated');
  const row=matches[0],values=s.getRange(row,1,1,MD_GE_HEADERS_.length).getValues()[0];
  if(values[1]!==true)throw Error('Invitation not accepted');
  if(values[2]===true||values[3]===true)throw Error('Already verified');
  s.getRange(row,3,1,4).setValues([[true,false,String(staff.staffId),new Date()]]);
  // Verified != active: a secure login credential must still be provisioned.
  return {customerId,verified:true,active:false};
 }finally{lock.releaseLock();}
}
