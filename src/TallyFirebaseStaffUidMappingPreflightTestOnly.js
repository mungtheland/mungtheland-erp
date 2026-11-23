/**
 * STEP 39 — Firebase staff UID mapping schema and fail-closed preflight.
 * Reads isolated staging only. Does not access Firebase, write UIDs,
 * trust a client-supplied UID, or enable real approvals.
 */
function mdFirebaseStaffUidMappingPreflight_TEST_ONLY(){
 const project='mungtheland-guardian-test';
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('FIREBASE_TEST_PROJECT_ID')!==project)
   throw Error('Unexpected Firebase test project configuration');
 const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const sh=ss.getSheetByName('Firebase직원UID매핑_테스트');
 if(!sh)throw Error('UID mapping staging tab missing');
 const expected=['Firebase UID','직원키','역할','계정상태','등록검토상태','등록검토자','등록검토일시','비고'];
 const headers=sh.getRange(1,1,1,8).getValues()[0];
 if(headers.some((x,i)=>x!==expected[i]))throw Error('UID mapping schema mismatch');
 const rows=sh.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim());
 if(rows.length)throw Error('Mapping tab contains entries: manual privacy/security review required');
 // Synthetic UID examples are never written or sent to logs.
 const map=[
  {uid:'TEST_UID_A',staff:'STAFF:TEST-ADMIN',role:'admin',status:'활성',review:'승인'},
  {uid:'TEST_UID_B',staff:'STAFF:TEST-WORKER',role:'staff',status:'활성',review:'승인'},
  {uid:'TEST_UID_C',staff:'STAFF:TEST-VIEWER',role:'viewer',status:'비활성',review:'승인'},
  {uid:'TEST_UID_D',staff:'STAFF:TEST-PENDING',role:'admin',status:'활성',review:'검토필요'}
 ];
 function check(principal,action){
  if(!principal||principal.verifiedByServer!==true||principal.projectId!==project)
    return false;
  const matching=map.filter(r=>r.uid===principal.uid);
  if(matching.length!==1)return false;
  const r=matching[0];
  if(r.status!=='활성'||r.review!=='승인')return false;
  return r.role==='admin'&&['attendance','discount','payment'].includes(action)
    ||r.role==='staff'&&action==='attendance';
 }
 const trusted=uid=>({verifiedByServer:true,projectId:project,uid});
 const cases=[
  [null,'attendance',false],
  [{uid:'TEST_UID_A'},'discount',false],
  [{verifiedByServer:true,projectId:'wrong',uid:'TEST_UID_A'},'discount',false],
  [trusted('TEST_UID_A'),'discount',true],
  [trusted('TEST_UID_A'),'payment',true],
  [trusted('TEST_UID_A'),'issuance',false],
  [trusted('TEST_UID_B'),'attendance',true],
  [trusted('TEST_UID_B'),'discount',false],
  [trusted('TEST_UID_C'),'attendance',false],
  [trusted('TEST_UID_D'),'discount',false],
  [trusted('TEST_UID_UNKNOWN'),'attendance',false]
 ];
 cases.forEach((c,i)=>{if(check(c[0],c[1])!==c[2])throw Error('Synthetic case failed: '+(i+1));});
 const result={passed:true,syntheticCasesPassed:cases.length,projectIdPinned:true,
  uidMappingSheetRows:rows.length,realUidMappingsCreated:0,
  actualFirebaseTokenVerificationImplemented:false,
  realStaffApprovalsAllowed:false,issuanceAllowed:false,
  stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
