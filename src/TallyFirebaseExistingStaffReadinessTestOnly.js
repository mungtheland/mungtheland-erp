/**
 * STEP 38: Firebase existing-user integration readiness (READ ONLY).
 * Does NOT call Firebase, validate a token, access customer records, or grant access.
 * Safe to run in isolated Apps Script staging project.
 */
function mdFirebaseExistingStaffReadiness_TEST_ONLY() {
  const expected='mungtheland-guardian-test';
  const p=PropertiesService.getScriptProperties();
  if(p.getProperty('FIREBASE_TEST_PROJECT_ID')!==expected)
    throw Error('Firebase test project is not pinned to the expected ID');
  const sheet=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8')
    .getSheetByName('직원권한_테스트');
  if(!sheet)throw Error('Staging employee permission sheet missing');
  const expectedHeaders=['직원키(가상)','역할','계정상태','방문확인 권한','할인승인 권한','결제확인 권한','이용권발급 권한','비고'];
  const headers=sheet.getRange(1,1,1,8).getValues()[0];
  if(headers.some((v,i)=>v!==expectedHeaders[i]))throw Error('Unexpected employee permission schema');
  const rows=sheet.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim());
  if(rows.length)throw Error('Unexpected employee mapping data; manual review required');
  const cases=[
    {name:'unknown_identity',verified:false,uid:'',active:false,role:'admin',allow:false},
    {name:'unmapped_uid',verified:true,uid:'unmapped',active:false,role:'admin',allow:false},
    {name:'disabled_employee',verified:true,uid:'mapped',active:false,role:'admin',allow:false},
    {name:'viewer_denied',verified:true,uid:'mapped',active:true,role:'viewer',allow:false},
    {name:'worker_discount_denied',verified:true,uid:'mapped',active:true,role:'staff',allow:false},
    {name:'admin_discount_policy_only',verified:true,uid:'mapped',active:true,role:'admin',allow:true}
  ];
  cases.forEach(c=>{
    const allow=c.verified&&c.uid==='mapped'&&c.active&&c.role==='admin';
    if(allow!==c.allow)throw Error('Failed synthetic gate: '+c.name);
  });
  const result={passed:true,projectIdPinned:true,provider:'email_password_user_reported',
    syntheticReadinessCasesPassed:cases.length,stagingEmployeeMappings:rows.length,
    actualFirebaseUserListVerified:false,actualFirebaseIdTokenVerified:false,
    uidToStaffMappingImplemented:false,realStaffApprovalAllowed:false,
    productionReady:false,stagingWrites:0,productionWrites:0};
  console.log(JSON.stringify(result));return result;
}
