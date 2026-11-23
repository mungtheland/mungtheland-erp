/**
 * STEP 42 - Firebase Authentication token verification via Google's accounts:lookup.
 * Requires Script Property FIREBASE_TEST_WEB_API_KEY set locally in isolated Apps Script.
 * The key must belong to mungtheland-guardian-test; restrict it to Identity Toolkit API.
 * Never put credentials or ID tokens into public GitHub or execution logs.
 *
 * Security boundaries:
 * - Google Identity Toolkit validates the supplied Firebase ID token.
 * - The returned localId, NOT a client-supplied UID, is the identity.
 * - A matching Firebase UID in the staging mapping sheet is required.
 * - Inactive/unreviewed users are denied; all real approvals remain disabled.
 * - This is a staging-only verifier, NOT a production approval endpoint.
 */
function mdFirebaseVerifyIdToken_STAGING_ONLY(idToken) {
  const project='mungtheland-guardian-test';
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('FIREBASE_TEST_PROJECT_ID')!==project)
    throw Error('Firebase test project pin mismatch');
  if(typeof idToken!=='string'||idToken.length<100||idToken.length>8192)
    return {authenticated:false,reason:'invalid_token_input',approvalsAllowed:false};
  const apiKey=props.getProperty('FIREBASE_TEST_WEB_API_KEY');
  if(!apiKey||!/^AIza[0-9A-Za-z_-]{30,}$/.test(apiKey))
    throw Error('Firebase test Web API key is not configured');
  // Never log the URL, request, token, email, UID, or API key.
  const response=UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(apiKey),
    {method:'post',contentType:'application/json',
     payload:JSON.stringify({idToken:idToken}),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)
    return {authenticated:false,reason:'firebase_token_rejected',approvalsAllowed:false};
  let body;
  try{body=JSON.parse(response.getContentText());}catch(e){
    return {authenticated:false,reason:'invalid_provider_response',approvalsAllowed:false};
  }
  if(!body||!Array.isArray(body.users)||body.users.length!==1||
     typeof body.users[0].localId!=='string'||!body.users[0].localId)
    return {authenticated:false,reason:'invalid_provider_response',approvalsAllowed:false};
  const uid=body.users[0].localId;
  if(body.users[0].disabled===true)
    return {authenticated:false,reason:'firebase_account_disabled',approvalsAllowed:false};
  const sh=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8')
    .getSheetByName('Firebase직원UID매핑_테스트');
  if(!sh)throw Error('Staging UID mapping missing');
  const rows=sh.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim()===uid);
  if(rows.length!==1)
    return {authenticated:false,reason:'uid_unmapped_or_duplicate',approvalsAllowed:false};
  const r=rows[0];
  // Authenticated identity is distinguished from authorized employee.
  const employeeActive=r[3]==='활성'&&r[4]==='승인';
  return {authenticated:true,staffMapped:true,employeeActive:employeeActive,
    role:employeeActive?String(r[2]):'none',approvalsAllowed:false,
    issuanceAllowed:false,productionReady:false};
}

/** Safe configuration-only check. No token is used or sent. */
function mdFirebaseTokenLookupConfigurationPreflight_TEST_ONLY(){
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('FIREBASE_TEST_PROJECT_ID')!=='mungtheland-guardian-test')
   throw Error('Firebase test project pin mismatch');
 const sh=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8')
  .getSheetByName('Firebase직원UID매핑_테스트');
 if(!sh)throw Error('Staging UID mapping missing');
 const key=props.getProperty('FIREBASE_TEST_WEB_API_KEY')||'';
 const configured=/^AIza[0-9A-Za-z_-]{30,}$/.test(key);
 const result={passed:true,projectIdPinned:true,webApiKeyConfigured:configured,
  firebaseProjectApiKeyAssociationIndependentlyVerified:false,
  realTokenVerified:false,realApprovalsAllowed:false,issuanceAllowed:false,
  stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
