/** Isolated invitation lifecycle prototype. No public endpoint or production writes.
 * Invitation tokens are never stored in plaintext; only a SHA-256 digest is persisted.
 * The staff principal must originate from trusted server-side authentication.
 */
const MD_GI_HEADERS_=['초대 ID','고객 ID','토큰 해시','생성시각','만료시각','사용시각','상태','발급 직원'];
function mdGuardianInviteSheet_(){
 const s=mdGuardianTestBook_().getSheetByName('보호자초대테스트');
 if(!s)throw Error('Test invitation sheet not initialized');
 const headers=s.getRange(1,1,1,MD_GI_HEADERS_.length).getDisplayValues()[0];
 if(headers.some((v,i)=>v!==MD_GI_HEADERS_[i]))throw Error('Invitation schema mismatch');
 return s;
}
function mdGuardianInviteTestSetup_(){
 const book=mdGuardianTestBook_();
 let s=book.getSheetByName('보호자초대테스트');
 if(!s){s=book.insertSheet('보호자초대테스트');s.getRange(1,1,1,MD_GI_HEADERS_.length).setValues([MD_GI_HEADERS_]);}
 return {ok:true,sheet:s.getName()};
}
function mdGuardianInviteHash_(token){
 return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token)).replace(/=+$/,'');
}
function mdIssueGuardianInviteInternal_(staff,customerId){
 if(!staff||staff.role!=='staff'||!staff.staffId)throw Error('Staff authentication required');
 if(String(customerId)!=='CUS-TEST-001')throw Error('Only synthetic test customer allowed');
 mdGuardianAccessTestFixture_();
 const token=Utilities.getUuid()+Utilities.getUuid(),now=new Date(),expires=new Date(now.getTime()+24*60*60*1000);
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const s=mdGuardianInviteSheet_();
  s.appendRow([mdId_('INV'),customerId,mdGuardianInviteHash_(token),now,expires,'','pending',String(staff.staffId)]);
 }finally{lock.releaseLock();}
 // Return once to the trusted staff console only. Never log or persist the plaintext token.
 return {token,expiresAt:expires.toISOString(),testOnly:true};
}
function mdConsumeGuardianInviteInternal_(token){
 if(typeof token!=='string'||!/^[0-9a-f-]{72}$/.test(token))throw Error('Invalid invitation');
 const digest=mdGuardianInviteHash_(token),lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const s=mdGuardianInviteSheet_(),last=s.getLastRow();
  if(last<2)throw Error('Invitation not found');
  const rows=s.getRange(2,1,last-1,MD_GI_HEADERS_.length).getValues();
  const found=rows.map((r,i)=>({r,i})).filter(x=>String(x.r[2])===digest);
  if(found.length!==1)throw Error('Invitation not found');
  const x=found[0];
  if(String(x.r[6])!=='pending'||x.r[5])throw Error('Invitation already used');
  if(!(x.r[4] instanceof Date)||x.r[4].getTime()<=Date.now())throw Error('Invitation expired');
  s.getRange(x.i+2,6,1,2).setValues([[new Date(),'consumed']]);
  // Consuming a link is NOT account activation. Independent identity verification is mandatory.
  return {customerId:String(x.r[1]),invitationConsumed:true,accountActivated:false};
 }finally{lock.releaseLock();}
}
