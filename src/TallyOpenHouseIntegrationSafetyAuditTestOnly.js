/**
 * STEP 33 — isolated staging integration safety preflight (READ ONLY).
 * No real customer data logged; no writes to any spreadsheet.
 * Does not constitute real staff authentication or production readiness certification.
 */
function mdTallyOpenHouseIntegrationSafetyAudit_TEST_ONLY(){
 const stagingId='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
 const ss=SpreadsheetApp.openById(stagingId);
 const read=name=>{const sh=ss.getSheetByName(name);if(!sh)throw Error('Missing staging tab '+name);return sh.getDataRange().getValues().slice(1).filter(r=>String(r[0]).trim()!=='');};
 const intake=read('통합접수대장'),issue=read('발급관리_테스트'),mapping=read('직원매핑_테스트'),
  products=read('상품기준_테스트'),visits=read('오픈하우스확인_테스트'),
  audits=read('오픈하우스승인이력_테스트'),mock=read('오픈하우스할인모의승인_테스트'),discounts=read('할인정책_테스트');
 const checks=[];
 function check(name,ok){checks.push({name,passed:Boolean(ok)});if(!ok)throw Error('Safety check failed: '+name);}
 const receipt='TEST:order:001',visit='VISIT:TEST-STEP26-001';
 const r=intake.filter(x=>String(x[0])===receipt);
 check('unique_synthetic_receipt',r.length===1);
 check('receipt_not_erp_issued',r[0][14]==='미반영');
 check('real_intakes_unprocessed',intake.filter(x=>/^(order:|contract:)/.test(String(x[0]))).every(x=>x[12]==='심사 필요'&&x[13]==='미확인'&&x[14]==='미반영'));
 check('real_intake_count_expected',intake.filter(x=>/^(order:|contract:)/.test(String(x[0]))).length===2);
 check('no_employee_mapping',mapping.length===0);
 check('product_keys_unapproved',products.length===21&&products.every(x=>x[8]==='검토필요'));
 const v=visits.filter(x=>x[0]===visit);
 check('unique_synthetic_visit',v.length===1&&v[0][6]===receipt);
 check('no_real_attendance',v[0][3]==='모의확인(실제 미확인)'&&!v[0][4]&&!v[0][5]);
 check('no_actual_discount_approval',v[0][9]==='미승인'&&v[0][10]==='미승인'&&v[0][11]==='미승인');
 check('no_visit_erp_issue',v[0][20]==='미반영');
 check('single_synthetic_attendance_audit',audits.filter(x=>x[0]==='AUDIT:TEST-STEP28-001'&&x[9]==='모의처리기록').length===1);
 const m=mock.filter(x=>x[0]==='MOCK-DISCOUNT:STEP31-001');
 check('single_mock_discount_ledger',m.length===1&&m[0][15]==='모의기록(실제승인아님)');
 check('mock_discount_math',Number(m[0][8])===0.25&&Number(m[0][9])===228000&&Number(m[0][10])===57000&&Number(m[0][11])===171000&&Number(m[0][12])===171000);
 check('no_live_pass_issuance_in_staging',issue.every(x=>String(x[4])==='발급완료(모의)'&&String(x[5]).startsWith('MOCK-')&&String(x[9])==='실제 ERP 발급 없음'));
 const p=Object.fromEntries(discounts.map(x=>[String(x[0]),x]));
 check('three_discount_policies_confirmed',['COMPANION','MULTIDOG','OPENHOUSE'].every(k=>p[k]&&p[k][5]==='정책확정'));
 const result={passed:true,checksPassed:checks.length,stagingReceiptCount:intake.length,realTallyReceiptsReviewed:2,
  productKeysAwaitingApproval:products.length,syntheticVisitCount:v.length,syntheticAttendanceAuditCount:1,
  syntheticDiscountLedgerCount:1,realStaffAuthenticationImplemented:false,
  realVisitEvidenceVerificationImplemented:false,realPaymentVerificationImplemented:false,
  liveProductMappingApproved:false,productionIssuanceIntegrationVerified:false,
  productionReady:false,stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
