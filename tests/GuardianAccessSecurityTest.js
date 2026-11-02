/** Read-only authorization regression checks. Isolated synthetic test project ONLY. */
function runGuardianAccessSecurityTest(){
 runGuardianTestPreflight();
 const fixture=mdGuardianAccessTestFixture_();
 const session=mdIssueGuardianTestSession_();
 const assert=(condition,message)=>{if(!condition)throw Error('SECURITY TEST FAIL: '+message);};
 const expectDenied=(callback,message)=>{
  let denied=false;
  try{callback();}catch(e){denied=true;}
  assert(denied,message);
 };
 const read=mdGuardianTestReadWithToken_(session.token,'RSV-TEST-001');
 assert(read.bookingId==='RSV-TEST-001','own booking read');
 assert(fixture.customerId==='CUS-TEST-001'&&fixture.dogId==='DOG-TEST-001','fixture identity');
 expectDenied(()=>mdGuardianTestReadWithToken_('invalid','RSV-TEST-001'),'malformed token');
 expectDenied(()=>mdGuardianTestReadWithToken_(Utilities.getUuid()+Utilities.getUuid(),'RSV-TEST-001'),'unknown token');
 expectDenied(()=>mdGuardianTestReadWithToken_(session.token,'RSV-NOT-OWNED'),'nonexistent booking');
 expectDenied(()=>mdGuardianTestSaveWithToken_('invalid','RSV-TEST-001',{
  mealTime:'12:00',foodBrought:'yes',mannerBelt:'na',condition:'normal',notes:''
 },read.revision),'invalid token write');
 mdRevokeGuardianTestSession_(session.token);
 expectDenied(()=>mdGuardianTestReadWithToken_(session.token,'RSV-TEST-001'),'revoked session must be denied');
 const result={ok:true,checks:['own booking read','fixture identity','malformed token rejected','unknown token rejected','unowned booking rejected','unauthenticated write rejected','revoked token rejected'],bookingId:read.bookingId};
 Logger.log(JSON.stringify(result)); // Never log bearer tokens or personal data.
 return result;
}
