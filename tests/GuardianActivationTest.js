/** Requires previously successful runGuardianEnrollmentTest in isolated sheet. */
function runGuardianActivationTest(){
 runGuardianTestPreflight();
 const customerId='CUS-TEST-001',before=mdGuardianEnrollmentStatusInternal_(customerId);
 if(!before.invited||!before.verified||before.active)throw Error('Expected verified, inactive test account');
 let rejected=false;
 try{mdGuardianActivateInternal_(customerId,{source:'browser',customerId,credentialReady:true});}catch(e){rejected=true;}
 if(!rejected)throw Error('Browser-supplied activation accepted');
 const result=mdGuardianActivateInternal_(customerId,{source:'trusted_credential_provider',customerId,credentialReady:true});
 if(!result.active||result.loginEnabled)throw Error('Activation must not enable unverified login');
 let replayDenied=false;
 try{mdGuardianActivateInternal_(customerId,{source:'trusted_credential_provider',customerId,credentialReady:true});}catch(e){replayDenied=true;}
 if(!replayDenied)throw Error('Activation replay accepted');
 const after=mdGuardianEnrollmentStatusInternal_(customerId);
 if(!after.active||after.loginEnabled)throw Error('Unexpected account state');
 const summary={ok:true,checks:['verified enrollment required','browser activation rejected','activation recorded','replay rejected','login remains disabled']};
 Logger.log(JSON.stringify(summary));return summary;
}
