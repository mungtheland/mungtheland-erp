function mdFirebaseTwoStaffEnrollmentReview_TEST_ONLY(){
 const id='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
 if(PropertiesService.getScriptProperties().getProperty('FIREBASE_TEST_PROJECT_ID')!=='mungtheland-guardian-test')throw Error('Firebase project pin mismatch');
 const sh=SpreadsheetApp.openById(id).getSheetByName('Firebase직원UID매핑_테스트');
 if(!sh)throw Error('Staging mapping sheet missing');
 const expected=['Firebase UID','직원키','역할','계정상태','등록검토상태','등록검토자','등록검토일시','비고'];
 const hdr=sh.getRange(1,1,1,8).getValues()[0];
 if(expected.some((v,i)=>v!==hdr[i]))throw Error('Unexpected mapping schema');
 const filled=sh.getDataRange().getValues().slice(1).filter(r=>r.some(v=>String(v).trim()!==''));
 if(filled.length!==2)throw Error('Expected exactly 2 staff rows, found '+filled.length+'; no changes made');
 const uids=new Set(),staffKeys=new Set();
 filled.forEach((r,i)=>{
   const uid=String(r[0]).trim(),key=String(r[1]).trim();
   if(!uid||!key)throw Error('Missing UID or staff key at mapping row '+(i+2));
   if(/\s/.test(uid)||uid.length<6||uid.length>256)throw Error('UID format review required at row '+(i+2));
   if(uids.has(uid)||staffKeys.has(key))throw Error('Duplicate UID or staff key; no changes made');
   uids.add(uid);staffKeys.add(key);
   if(!/^STAFF-TEST-0[12]$/.test(key))throw Error('Unexpected staff key at row '+(i+2));
   if(r[2]!=='viewer'||r[3]!=='비활성'||r[4]!=='검토필요')throw Error('Fail-closed defaults missing at row '+(i+2));
 });
 const result={passed:true,projectIdPinned:true,expectedTestAccounts:2,
  stagedUidRows:filled.length,distinctUidCount:uids.size,distinctStaffKeyCount:staffKeys.size,
  defaultPermissions:'viewer/inactive/review_required',firebaseAccountsIndependentlyVerified:false,
  firebaseIdTokensVerified:false,realApprovalsAllowed:false,issuanceAllowed:false,
  stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}