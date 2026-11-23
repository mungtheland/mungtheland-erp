/**
 * STEP 41: Firebase public signing-key endpoint connectivity.
 * READ ONLY. Does not accept, decode, log or validate user tokens.
 * This is NOT authentication and MUST NOT be used as an approval gate.
 */
function mdFirebasePublicKeysConnectivity_TEST_ONLY() {
 const project='mungtheland-guardian-test';
 if(PropertiesService.getScriptProperties().getProperty('FIREBASE_TEST_PROJECT_ID')!==project)
   throw Error('Unexpected Firebase project ID');
 const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 if(!ss.getSheetByName('Firebase직원UID매핑_테스트'))
   throw Error('Isolated staging sheet missing');
 const url='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
 const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});
 const status=response.getResponseCode();
 if(status!==200)throw Error('Firebase public certificate endpoint returned HTTP '+status);
 const certs=JSON.parse(response.getContentText());
 const kids=Object.keys(certs);
 if(!kids.length||kids.some(k=>!String(certs[k]).includes('BEGIN CERTIFICATE')))
   throw Error('Unexpected public certificate response');
 const cacheControl=String(response.getHeaders()['Cache-Control']||response.getHeaders()['cache-control']||'');
 const result={passed:true,projectIdPinned:true,publicCertificateEndpointReachable:true,
   httpStatus:status,publicCertificateCount:kids.length,cacheControlPresent:!!cacheControl,
   actualFirebaseUserVerified:false,idTokenSignatureVerified:false,
   jwtClaimsVerified:false,revocationChecked:false,realApprovalsAllowed:false,
   productionReady:false,stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
