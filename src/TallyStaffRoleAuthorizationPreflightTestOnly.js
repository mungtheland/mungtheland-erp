/**
 * STEP 34 — isolated, read-only role authorization preflight.
 * All identities and permissions are synthetic; NOT actual authentication.
 * Do not use caller-supplied role or email as proof of identity in production.
 */
function mdStaffRoleAuthorizationPreflight_TEST_ONLY(){
 const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const sheet=ss.getSheetByName('직원권한_테스트');
 if(!sheet)throw Error('Missing isolated employee permission tab');
 const headers=sheet.getRange(1,1,1,8).getValues()[0];
 const expected=['직원키(가상)','역할','계정상태','방문확인 권한','할인승인 권한','결제확인 권한','이용권발급 권한','비고'];
 if(headers.some((v,i)=>v!==expected[i]))throw Error('Employee permission schema drift');
 const existing=sheet.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim());
 if(existing.length!==0)throw Error('Test tab is not empty: do not assume real staff identities');
 const permissions=['attendance','discount','payment','issuance'];
 const roles={
  admin:{attendance:true,discount:true,payment:true,issuance:false},
  staff:{attendance:true,discount:false,payment:false,issuance:false},
  viewer:{attendance:false,discount:false,payment:false,issuance:false}
 };
 const staff={
  'STAFF:TEST-ADMIN':{role:'admin',active:true},
  'STAFF:TEST-WORKER':{role:'staff',active:true},
  'STAFF:TEST-VIEWER':{role:'viewer',active:true},
  'STAFF:TEST-DISABLED':{role:'admin',active:false}
 };
 function authorize(key,action,identityVerified){
  const entry=staff[key];
  if(!identityVerified)return {allowed:false,reason:'IDENTITY_NOT_VERIFIED'};
  if(!entry)return {allowed:false,reason:'UNKNOWN_STAFF'};
  if(!entry.active)return {allowed:false,reason:'ACCOUNT_INACTIVE'};
  if(!permissions.includes(action))return {allowed:false,reason:'UNKNOWN_ACTION'};
  if(!roles[entry.role]||!roles[entry.role][action])return {allowed:false,reason:'ROLE_NOT_PERMITTED'};
  return {allowed:true,reason:'SYNTHETIC_ROLE_MATCH_ONLY'};
 }
 const cases=[
  ['admin_attendance','STAFF:TEST-ADMIN','attendance',true,true],
  ['admin_discount','STAFF:TEST-ADMIN','discount',true,true],
  ['admin_payment','STAFF:TEST-ADMIN','payment',true,true],
  ['admin_issuance_blocked','STAFF:TEST-ADMIN','issuance',true,false],
  ['worker_attendance','STAFF:TEST-WORKER','attendance',true,true],
  ['worker_discount_denied','STAFF:TEST-WORKER','discount',true,false],
  ['worker_payment_denied','STAFF:TEST-WORKER','payment',true,false],
  ['viewer_attendance_denied','STAFF:TEST-VIEWER','attendance',true,false],
  ['viewer_discount_denied','STAFF:TEST-VIEWER','discount',true,false],
  ['disabled_denied','STAFF:TEST-DISABLED','attendance',true,false],
  ['unknown_denied','STAFF:TEST-NOTFOUND','attendance',true,false],
  ['unverified_admin_denied','STAFF:TEST-ADMIN','discount',false,false],
  ['unknown_action_denied','STAFF:TEST-ADMIN','delete',true,false],
  ['empty_key_denied','','attendance',true,false]
 ];
 cases.forEach(([name,key,action,verified,expectedResult])=>{
  const r=authorize(key,action,verified);
  if(r.allowed!==expectedResult)throw Error('Case failed: '+name);
 });
 // A synthetic verified=true input only tests role policy; it is not an auth provider.
 const result={passed:true,syntheticCasesPassed:cases.length,employeePermissionSheetRows:existing.length,
  realEmployeeAccountsCreated:0,realAuthenticationImplemented:false,
  authorizationPolicyTested:true,productionAuthorizationReady:false,
  realAttendanceApproved:false,realDiscountApproved:false,
  realPaymentConfirmed:false,issuanceAllowed:false,
  stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
