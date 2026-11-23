/**
 * STEP 37 — explicitly pin Firebase test project ID in isolated Apps Script.
 * No Firebase network requests, credentials, users, or production writes.
 * Only writes one non-secret Script Property after conflict checks.
 */
function mdFirebaseTestProjectPin_TEST_ONLY() {
  const expected='mungtheland-guardian-test';
  const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
  if(!ss.getSheetByName('직원권한_테스트'))throw Error('Isolated staging marker missing');
  const p=PropertiesService.getScriptProperties();
  const keys=['FIREBASE_PROJECT_ID','FIREBASE_TEST_PROJECT_ID','FIREBASE_AUTH_PROJECT_ID'];
  const existing=keys.map(k=>({key:k,value:p.getProperty(k)})).filter(x=>x.value!==null&&String(x.value).trim()!=='');
  if(existing.some(x=>x.value!==expected))throw Error('Conflicting Firebase project ID configuration: no changes made');
  const current=p.getProperty('FIREBASE_TEST_PROJECT_ID');
  let action='already_pinned';
  if(current!==expected){p.setProperty('FIREBASE_TEST_PROJECT_ID',expected);action='test_project_pinned';}
  const verified=p.getProperty('FIREBASE_TEST_PROJECT_ID')===expected;
  if(!verified)throw Error('Failed to verify pinned project ID');
  const result={passed:true,action,projectId:expected,projectIdPinned:true,
    firebaseProjectConnectionVerified:false,firebaseTokenVerificationImplemented:false,
    realStaffIdentityVerified:false,realApprovalsAllowed:false,issuanceAllowed:false,
    scriptPropertyWrites:action==='test_project_pinned'?1:0,stagingSheetWrites:0,productionWrites:0};
  console.log(JSON.stringify(result));return result;
}
