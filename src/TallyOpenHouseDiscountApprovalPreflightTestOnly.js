/**
 * STEP 30: read-only discount approval/payment reconciliation preflight.
 * No real attendance confirmation, discount approval, payment update or ERP issuance.
 */
function mdOpenHouseDiscountApprovalPreflight_TEST_ONLY(){
 const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const policies=ss.getSheetByName('할인정책_테스트').getDataRange().getValues().slice(1);
 const policy=Object.fromEntries(policies.map(r=>[String(r[0]),r]));
 const rates={};
 ['COMPANION','MULTIDOG','OPENHOUSE'].forEach(k=>{
  const r=policy[k];if(!r||r[5]!=='정책확정')throw Error('Policy not confirmed: '+k);
  const raw=r[2];const rate=typeof raw==='number'?(raw>1?raw/100:raw):Number(String(raw).replace('%',''))/100;
  if(!Number.isFinite(rate)||rate<=0||rate>1)throw Error('Invalid rate: '+k);
  rates[k]=rate;
 });
 if(Math.abs(rates.COMPANION-.1)>1e-9||Math.abs(rates.MULTIDOG-.1)>1e-9||Math.abs(rates.OPENHOUSE-.05)>1e-9)throw Error('Policy rate drift');
 const visits=ss.getSheetByName('오픈하우스확인_테스트').getDataRange().getValues().slice(1);
 const audit=ss.getSheetByName('오픈하우스승인이력_테스트').getDataRange().getValues().slice(1);
 const matches=visits.filter(r=>r[0]==='VISIT:TEST-STEP26-001');
 if(matches.length!==1||matches[0][3]!=='모의확인(실제 미확인)'||matches[0][9]!=='미승인'||matches[0][20]!=='미반영')throw Error('Unexpected synthetic state');
 if(audit.filter(r=>r[0]==='AUDIT:TEST-STEP28-001').length!==1)throw Error('Missing synthetic audit');
 function day(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d.getTime()/86400000:null;}
 function calculate(x){
  const reasons=[];
  if(!x.staffAuthorized||!x.staffId)reasons.push('STAFF_NOT_VERIFIED');
  if(!x.realAttendanceVerified||!x.evidenceRef)reasons.push('ATTENDANCE_NOT_VERIFIED');
  if(!x.uniqueVisitReceiptLink)reasons.push('LINK_NOT_VERIFIED');
  const d0=day(x.visitDate),d1=day(x.registrationDate);
  if(d0===null||d1===null||d1-d0<0||d1-d0>7)reasons.push('DATE_OUT_OF_WINDOW');
  if(!x.isDaycarePass)reasons.push('PRODUCT_SCOPE_NOT_CONFIRMED');
  if(!Number.isSafeInteger(x.baseSalePrice)||x.baseSalePrice<=0)reasons.push('INVALID_BASE_PRICE');
  if(x.companion&&!x.companionEvidence)reasons.push('COMPANION_NOT_VERIFIED');
  if(x.multidog&&!x.multidogEvidence)reasons.push('MULTIDOG_NOT_VERIFIED');
  if(x.openhouse&&!x.openhouseEvidence)reasons.push('OPENHOUSE_NOT_VERIFIED');
  if(!x.discountRequested)reasons.push('DISCOUNT_NOT_REQUESTED');
  const rate=(x.companion?rates.COMPANION:0)+(x.multidog?rates.MULTIDOG:0)+(x.openhouse?rates.OPENHOUSE:0);
  if(rate>0.250000001)reasons.push('OVER_CAP');
  const amount=Number.isSafeInteger(x.baseSalePrice)&&x.baseSalePrice>0?Math.round(x.baseSalePrice*rate):null;
  const expected=amount===null?null:x.baseSalePrice-amount;
  if(!x.paymentConfirmed||!Number.isSafeInteger(x.paidAmount)||x.paidAmount!==expected)reasons.push('PAYMENT_NOT_MATCHED');
  return {eligible:reasons.length===0,reasons,rate,discountAmount:amount,expectedPayment:expected,approved:false,issued:false};
 }
 const base={staffAuthorized:true,staffId:'STAFF:TEST',realAttendanceVerified:true,evidenceRef:'EVIDENCE:TEST',uniqueVisitReceiptLink:true,visitDate:'2026-11-23',registrationDate:'2026-11-30',isDaycarePass:true,baseSalePrice:228000,companion:true,companionEvidence:true,multidog:true,multidogEvidence:true,openhouse:true,openhouseEvidence:true,discountRequested:true,paymentConfirmed:true,paidAmount:171000};
 const cases=[
  ['all_25_percent',{},true],['no_staff',{staffAuthorized:false},false],
  ['no_attendance',{realAttendanceVerified:false},false],
  ['no_visit_evidence',{evidenceRef:''},false],
  ['bad_link',{uniqueVisitReceiptLink:false},false],
  ['late',{registrationDate:'2026-12-01'},false],
  ['before_visit',{registrationDate:'2026-11-22'},false],
  ['hotel_not_in_scope',{isDaycarePass:false},false],
  ['companion_unverified',{companionEvidence:false},false],
  ['multidog_unverified',{multidogEvidence:false},false],
  ['openhouse_unverified',{openhouseEvidence:false},false],
  ['payment_mismatch',{paidAmount:172000},false],
  ['payment_unconfirmed',{paymentConfirmed:false},false],
  ['bad_base',{baseSalePrice:-1},false],
  ['no_request',{discountRequested:false},false],
  ['single_openhouse',{companion:false,multidog:false,paidAmount:216600},true],
  ['companion_and_multidog',{openhouse:false,paidAmount:182400},true],
  ['same_day',{registrationDate:'2026-11-23'},true]
 ];
 cases.forEach(([name,override,want])=>{const result=calculate(Object.assign({},base,override));if(result.eligible!==want||result.approved||result.issued)throw Error('Failed case: '+name+' '+JSON.stringify(result));});
 const result={passed:true,syntheticCasesPassed:cases.length,policyRates:rates,maximumAdditionalDiscountRate:0.25,exampleBasePrice:228000,exampleAdditionalDiscount:57000,exampleExpectedPayment:171000,actualVisitApproved:false,actualDiscountApproved:false,actualPaymentConfirmed:false,issuanceAllowed:false,stagingWrites:0,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
