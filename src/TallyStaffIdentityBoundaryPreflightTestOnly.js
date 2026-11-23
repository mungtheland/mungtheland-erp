/**
 * STEP 35: identity-to-permission boundary preflight (isolated, in-memory).
 * NOT an authentication implementation. Production must verify Firebase ID
 * tokens server-side using Firebase Admin SDK before calling authorization.
 * Never trust client-submitted uid, email, role, or verified flags.
 */
function mdStaffIdentityBoundaryPreflight_TEST_ONLY() {
  const employees = Object.freeze({
    'firebase-test-uid-admin': {staffKey:'STAFF:TEST-ADMIN',role:'admin',active:true},
    'firebase-test-uid-worker': {staffKey:'STAFF:TEST-WORKER',role:'staff',active:true},
    'firebase-test-uid-viewer': {staffKey:'STAFF:TEST-VIEWER',role:'viewer',active:true},
    'firebase-test-uid-disabled': {staffKey:'STAFF:TEST-DISABLED',role:'admin',active:false}
  });
  const grants = Object.freeze({
    admin:['attendance','discount','payment'],
    staff:['attendance'],
    viewer:[]
  });
  // trustedPrincipal MUST be created by a server-side token verifier.
  // In this TEST ONLY function it is simulated and never comes from a request.
  function authorize(trustedPrincipal, action, requestBody) {
    if (!trustedPrincipal || trustedPrincipal.source !== 'SERVER_VERIFIED_FIREBASE_TOKEN')
      return {allowed:false,reason:'UNVERIFIED_IDENTITY'};
    if (trustedPrincipal.audience !== 'MUNGTHELAND_TEST_PROJECT')
      return {allowed:false,reason:'WRONG_AUDIENCE'};
    if (trustedPrincipal.revoked || !trustedPrincipal.uid)
      return {allowed:false,reason:'INVALID_TOKEN'};
    const entry = employees[trustedPrincipal.uid];
    if (!entry) return {allowed:false,reason:'UNKNOWN_EMPLOYEE'};
    if (!entry.active) return {allowed:false,reason:'INACTIVE_EMPLOYEE'};
    if (!Object.prototype.hasOwnProperty.call(grants,entry.role) ||
        !grants[entry.role].includes(action))
      return {allowed:false,reason:'NOT_AUTHORIZED'};
    // Deliberately ignore any client-supplied role, uid, email, or staffKey.
    return {allowed:true,staffKey:entry.staffKey,reason:'SIMULATED_TRUSTED_PRINCIPAL'};
  }
  function principal(uid,override) {
    return Object.assign({source:'SERVER_VERIFIED_FIREBASE_TOKEN',
      audience:'MUNGTHELAND_TEST_PROJECT',uid:uid,revoked:false},override||{});
  }
  const spoof={uid:'firebase-test-uid-admin',role:'admin',email:'admin@example.invalid',staffKey:'STAFF:TEST-ADMIN'};
  const cases=[
    ['no_principal',null,'discount',spoof,false],
    ['client_spoof_no_principal',undefined,'attendance',spoof,false],
    ['wrong_source',{source:'CLIENT_INPUT',uid:'firebase-test-uid-admin',audience:'MUNGTHELAND_TEST_PROJECT'},'discount',spoof,false],
    ['wrong_audience',principal('firebase-test-uid-admin',{audience:'WRONG'}),'discount',{},false],
    ['revoked',principal('firebase-test-uid-admin',{revoked:true}),'discount',{},false],
    ['unknown_uid',principal('unknown'),'attendance',{},false],
    ['disabled',principal('firebase-test-uid-disabled'),'attendance',{},false],
    ['admin_attendance',principal('firebase-test-uid-admin'),'attendance',{},true],
    ['admin_discount',principal('firebase-test-uid-admin'),'discount',{},true],
    ['admin_payment',principal('firebase-test-uid-admin'),'payment',{},true],
    ['admin_issuance_denied',principal('firebase-test-uid-admin'),'issuance',{},false],
    ['worker_attendance',principal('firebase-test-uid-worker'),'attendance',{},true],
    ['worker_discount_denied',principal('firebase-test-uid-worker'),'discount',spoof,false],
    ['worker_payment_denied',principal('firebase-test-uid-worker'),'payment',spoof,false],
    ['viewer_denied',principal('firebase-test-uid-viewer'),'attendance',spoof,false],
    ['unknown_action',principal('firebase-test-uid-admin'),'delete',{},false],
    ['spoof_role_ignored',principal('firebase-test-uid-worker'),'discount',{role:'admin'},false],
    ['spoof_uid_ignored',principal('firebase-test-uid-worker'),'discount',{uid:'firebase-test-uid-admin'},false],
    ['spoof_email_ignored',principal('firebase-test-uid-viewer'),'payment',{email:'admin@example.invalid'},false]
  ];
  cases.forEach(([name,who,action,body,want])=>{
    const actual=authorize(who,action,body);
    if (actual.allowed!==want) throw Error('Failed: '+name);
  });
  const result={passed:true,syntheticCasesPassed:cases.length,
    firebaseTokenVerificationImplemented:false,
    realStaffIdentityVerified:false,realEmployeeRecordsCreated:0,
    authorizationPolicyBoundaryTested:true,
    realApprovalAllowed:false,issuanceAllowed:false,
    stagingWrites:0,productionWrites:0};
  console.log(JSON.stringify(result));return result;
}
