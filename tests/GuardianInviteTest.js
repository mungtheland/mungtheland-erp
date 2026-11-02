/** Isolated invite regression. Creates one synthetic invite and consumes it. */
function runGuardianInviteTest(){
 runGuardianTestPreflight();
 mdGuardianInviteTestSetup_();
 const issued=mdIssueGuardianInviteInternal_({role:'staff',staffId:'STAFF-TEST-001'},'CUS-TEST-001');
 const result=mdConsumeGuardianInviteInternal_(issued.token);
 if(result.customerId!=='CUS-TEST-001'||!result.invitationConsumed||result.accountActivated)throw Error('Invite lifecycle mismatch');
 let rejected=false;
 try{mdConsumeGuardianInviteInternal_(issued.token);}catch(e){rejected=true;}
 if(!rejected)throw Error('Replayed invitation accepted');
 let staffDenied=false;
 try{mdIssueGuardianInviteInternal_({role:'guardian',staffId:'FAKE'},'CUS-TEST-001');}catch(e){staffDenied=true;}
 if(!staffDenied)throw Error('Untrusted issuer accepted');
 const summary={ok:true,checks:['staff-only issue','single use','replay rejected','guardian cannot issue','activation not implied']};
 Logger.log(JSON.stringify(summary));
 return summary;
}
