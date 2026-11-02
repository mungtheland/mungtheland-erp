/** TEST-ONLY account activation gate. No password storage or public endpoint.
 * trustedProvisioning is a server-side result from a future credential provider,
 * NOT a browser-supplied boolean. Never expose these functions via google.script.run.
 */
function mdGuardianActivateInternal_(customerId,trustedProvisioning){
 if(customerId!=='CUS-TEST-001')throw Error('Synthetic test customer only');
 if(!trustedProvisioning||trustedProvisioning.source!=='trusted_credential_provider'||trustedProvisioning.customerId!==customerId||trustedProvisioning.credentialReady!==true)throw Error('Credential provisioning required');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const s=mdGuardianEnrollmentSheet_(),last=s.getLastRow();
  const rows=last>1?s.getRange(2,1,last-1,MD_GE_HEADERS_.length).getValues():[];
  const matches=rows.map((r,i)=>String(r[0])===customerId?i+2:0).filter(Boolean);
  if(matches.length!==1)throw Error('Enrollment missing or duplicated');
  const row=matches[0],state=s.getRange(row,1,1,MD_GE_HEADERS_.length).getValues()[0];
  if(state[1]!==true||state[2]!==true)throw Error('Identity verification incomplete');
  if(state[3]===true)throw Error('Already activated');
  s.getRange(row,4).setValue(true);
  return {customerId,active:true,loginEnabled:false,reason:'No verified login provider connected'};
 }finally{lock.releaseLock();}
}
function mdGuardianEnrollmentStatusInternal_(customerId){
 if(customerId!=='CUS-TEST-001')throw Error('Synthetic test customer only');
 const s=mdGuardianEnrollmentSheet_(),last=s.getLastRow();
 const rows=last>1?s.getRange(2,1,last-1,4).getValues():[];
 const matches=rows.filter(r=>String(r[0])===customerId);
 if(matches.length!==1)throw Error('Enrollment missing or duplicated');
 return {invited:matches[0][1]===true,verified:matches[0][2]===true,active:matches[0][3]===true,loginEnabled:false};
}
