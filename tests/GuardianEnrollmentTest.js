/** Synthetic invitation-to-verification flow; does not activate accounts. */
function runGuardianEnrollmentTest(){
 runGuardianTestPreflight();
 mdGuardianInviteTestSetup_();
 mdGuardianEnrollmentTestSetup_();
 const staff={role:'staff',staffId:'STAFF-TEST-001'};
 const issued=mdIssueGuardianInviteInternal_(staff,'CUS-TEST-001');
 const consumed=mdConsumeGuardianInviteInternal_(issued.token);
 const recorded=mdGuardianEnrollmentRecordInvite_(consumed);
 if(!recorded.invited||recorded.active||recorded.verified)throw Error('Invalid initial enrollment');
 let denied=false;
 try{mdGuardianEnrollmentVerifyInternal_({role:'guardian',staffId:'FAKE'},'CUS-TEST-001',{method:'in_person_id_check',confirmed:true});}catch(e){denied=true;}
 if(!denied)throw Error('Guardian verified own identity');
 const verified=mdGuardianEnrollmentVerifyInternal_(staff,'CUS-TEST-001',{method:'in_person_id_check',confirmed:true});
 if(!verified.verified||verified.active)throw Error('Verification must not activate account');
 const result={ok:true,checks:['invitation accepted','not activated automatically','nonstaff verification denied','staff verification recorded','activation remains disabled']};
 Logger.log(JSON.stringify(result));
 return result;
}
