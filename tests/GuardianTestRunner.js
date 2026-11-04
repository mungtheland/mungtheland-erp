/** Manual test entrypoints for a SEPARATE Apps Script test project only.
 * These functions must never be included in a production deployment.
 */
function runGuardianTestPreflight(){
 const result=mdGuardianTestSetupCheck_();
 if(!result.ok)throw Error('Missing isolated test sheets: '+result.missing.join(','));
 const smoke=mdGuardianRunIsolationSmokeTest_();
 Logger.log(JSON.stringify(smoke));
 return smoke;
}
function runGuardianWorkflowTest(){
 runGuardianTestPreflight();
 const result=mdGuardianRunWorkflowTest_();
 Logger.log(JSON.stringify(result));
 return result;
}

/** Test-only session checks. Never log or return the bearer token. */
function runGuardianSessionTest(){
 runGuardianTestPreflight();
 const result=mdGuardianTestSessionSelfCheck_();
 Logger.log(JSON.stringify(result));
 return result;
}
