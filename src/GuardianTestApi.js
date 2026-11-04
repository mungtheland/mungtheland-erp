/** Internal test-only API adapter. Do not expose as a public web app.
 * All browser-facing integration must wait for verified authentication.
 */
function mdGuardianTestReadWithToken_(token,bookingId){
 const principal=mdGuardianPrincipalFromTestToken_(token);
 return mdGuardianRequestForBookingInternal_(principal,String(bookingId));
}
function mdGuardianTestSaveWithToken_(token,bookingId,data,revision){
 const principal=mdGuardianPrincipalFromTestToken_(token);
 return mdSaveGuardianRequestInternal_(principal,String(bookingId),data,revision);
}
/** Read-only test runner: does not print a token or modify sheet rows. */
function runGuardianTokenReadTest(){
 runGuardianTestPreflight();
 const session=mdIssueGuardianTestSession_();
 const result=mdGuardianTestReadWithToken_(session.token,'RSV-TEST-001');
 if(result.bookingId!=='RSV-TEST-001')throw Error('Booking mismatch');
 let denied=false;
 try{mdGuardianTestReadWithToken_('invalid','RSV-TEST-001');}catch(e){denied=true;}
 if(!denied)throw Error('Invalid session accepted');
 const summary={ok:true,bookingId:result.bookingId,revision:result.revision,invalidTokenDenied:true};
 Logger.log(JSON.stringify(summary));
 return summary;
}
