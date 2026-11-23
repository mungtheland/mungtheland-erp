/**
 * STEP 36 — read-only Firebase integration configuration inventory.
 * Does not verify Firebase tokens, access Firestore, or expose secrets.
 * Run only in the isolated TEST Apps Script project.
 */
function mdFirebaseAuthConfigurationInventory_TEST_ONLY() {
  const expectedStagingSpreadsheet='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
  const staging=SpreadsheetApp.openById(expectedStagingSpreadsheet);
  if (!staging.getSheetByName('직원권한_테스트'))
    throw Error('Expected isolated employee authorization sheet is missing');
  const props=PropertiesService.getScriptProperties().getProperties();
  const names=Object.keys(props);
  const knownProjectKeys=['FIREBASE_PROJECT_ID','FIREBASE_TEST_PROJECT_ID','FIREBASE_AUTH_PROJECT_ID'];
  const presentProjectKeys=knownProjectKeys.filter(k=>Object.prototype.hasOwnProperty.call(props,k)&&String(props[k]).trim());
  const projectIds=presentProjectKeys.map(k=>String(props[k]).trim());
  const projectIdConflicts=new Set(projectIds).size>1;
  const hasServiceAccountKey=names.some(k=>/FIREBASE.*(PRIVATE_KEY|SERVICE_ACCOUNT|CREDENTIAL)/i.test(k)&&String(props[k]).trim());
  const hasTokenVerifierConfig=names.some(k=>/FIREBASE.*(TOKEN_VERIFIER|AUTH_EMULATOR_HOST)/i.test(k)&&String(props[k]).trim());
  const hasFirebaseLikeProperties=names.filter(k=>/FIREBASE|FIRESTORE/i.test(k)).length;
  // Do not print project IDs, credentials, property names, tokens, or staff identities.
  const result={
    passed:true,
    stagingSpreadsheetConfirmed:true,
    configuredProjectIdPropertyCount:presentProjectKeys.length,
    projectIdConfigurationConflict:projectIdConflicts,
    firebaseRelatedPropertyCount:hasFirebaseLikeProperties,
    serviceAccountCredentialPropertyPresent:hasServiceAccountKey,
    tokenVerifierConfigurationPropertyPresent:hasTokenVerifierConfig,
    firebaseProjectIdentityIndependentlyVerified:false,
    firebaseTokenVerificationImplemented:false,
    firebaseAuthenticationTested:false,
    realStaffIdentityVerified:false,
    productionReady:false,
    stagingWrites:0,productionWrites:0
  };
  console.log(JSON.stringify(result));return result;
}
