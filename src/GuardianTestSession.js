/** Test-only guardian access: opaque, expiring, server-stored bearer tokens.
 * IMPORTANT: This is a prototype, not a production authentication solution.
 * Never accept customerId or dogId from browser parameters.
 * Do not install in production or expose a public web app without security review.
 */
const MD_GA_TOKEN_PREFIX_='MD_GA_SESSION_';
const MD_GA_TTL_SECONDS_=900;
function mdGuardianAccessTestFixture_(){
 const book=mdGuardianTestBook_();
 if(book.getId()===MD_SPREADSHEET_ID)throw Error('Production access forbidden');
 const dogs=mdGuardianTestSheet_('고객·반려견관리');
 const row=mdFindById_(dogs,'DOG-TEST-001');
 if(row<2)throw Error('Synthetic dog not found');
 const r=dogs.getRange(row,1,1,2).getDisplayValues()[0];
 if(r[0]!=='DOG-TEST-001'||r[1]!=='CUS-TEST-001')throw Error('Fixture mismatch');
 return {customerId:r[1],dogId:r[0]};
}
/** Test-only session bootstrap, callable in the Apps Script editor, not a browser endpoint. */
function mdIssueGuardianTestSession_(){
 const principal=mdGuardianAccessTestFixture_();
 const token=Utilities.getUuid()+Utilities.getUuid();
 const key=MD_GA_TOKEN_PREFIX_+Utilities.base64EncodeWebSafe(
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token)).replace(/=+$/,'');
 CacheService.getScriptCache().put(key,JSON.stringify(principal),MD_GA_TTL_SECONDS_);
 return {token:token,expiresInSeconds:MD_GA_TTL_SECONDS_,testOnly:true};
}
function mdGuardianPrincipalFromTestToken_(token){
 if(typeof token!=='string'||!/^[0-9a-f-]{72}$/.test(token))throw Error('Invalid session');
 const key=MD_GA_TOKEN_PREFIX_+Utilities.base64EncodeWebSafe(
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token)).replace(/=+$/,'');
 const value=CacheService.getScriptCache().get(key);
 if(!value)throw Error('Session expired or invalid');
 const principal=JSON.parse(value);
 if(!principal||!principal.customerId||!principal.dogId)throw Error('Invalid session principal');
 mdGuardianAccessTestFixture_();
 return {customerId:principal.customerId,dogId:principal.dogId};
}
function mdGuardianTestSessionSelfCheck_(){
 const issued=mdIssueGuardianTestSession_();
 const principal=mdGuardianPrincipalFromTestToken_(issued.token);
 if(principal.customerId!=='CUS-TEST-001'||principal.dogId!=='DOG-TEST-001')throw Error('Session mismatch');
 let rejected=false;
 try{mdGuardianPrincipalFromTestToken_('invalid');}catch(e){rejected=true;}
 if(!rejected)throw Error('Invalid token was accepted');
 const booking=mdGuardianRequestForBookingInternal_(principal,'RSV-TEST-001');
 return {ok:true,checks:['synthetic fixture','session issue','session resolve','invalid token rejected','booking ownership'],bookingId:booking.bookingId};
}

/** Explicitly revoke a test session without exposing its principal. */
function mdRevokeGuardianTestSession_(token){
 if(typeof token!=='string'||!/^[0-9a-f-]{72}$/.test(token))throw Error('Invalid session');
 const key=MD_GA_TOKEN_PREFIX_+Utilities.base64EncodeWebSafe(
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token)).replace(/=+$/,'');
 CacheService.getScriptCache().remove(key);
 return {revoked:true};
}
