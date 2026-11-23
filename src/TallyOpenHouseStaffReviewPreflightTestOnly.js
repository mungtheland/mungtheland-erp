/**
 * Isolated open-house staff review preflight. READ ONLY.
 * Never writes to staging or production; never approves or issues passes.
 */
function mdOpenHouseStaffReviewPreflight_TEST_ONLY(){
 const id='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
 const ss=SpreadsheetApp.openById(id);
 const sheet=ss.getSheetByName('오픈하우스확인_테스트');
 const policy=ss.getSheetByName('할인정책_테스트');
 const products=ss.getSheetByName('상품기준_테스트');
 if(!sheet||!policy||!products)throw Error('Missing isolated staging sheet');
 const expected=['방문확인키','방문일(YYYY-MM-DD)','보호자 식별키(내부용)','방문확인 상태','확인 직원','확인일시','등록 접수키','등록일(YYYY-MM-DD)','7일 이내 판정','오픈하우스 할인 승인','동반입소 승인','다견 승인','총 추가 할인율','상품키(임시)','기준 판매금액(원)','추가 할인액(원)','예상 결제금액(원)','실제 입금액(원)','입금 대조','최종 직원 검토','ERP 반영','비고'];
 const header=sheet.getRange(1,1,1,22).getValues()[0];
 if(expected.some((h,i)=>header[i]!==h))throw Error('Staff review schema mismatch');
 const policies=policy.getRange(2,1,policy.getLastRow()-1,7).getValues();
 const map=Object.fromEntries(policies.map(r=>[r[0],r]));
 for(const [key,rate] of [['COMPANION',0.1],['MULTIDOG',0.1],['OPENHOUSE',0.05]]){
  if(!map[key]||map[key][5]!=='정책확정'||Number(map[key][2])!==rate)throw Error('Policy not confirmed: '+key);
 }
 const productRows=products.getRange(2,1,products.getLastRow()-1,10).getValues();
 if(productRows.length!==21)throw Error('Unexpected product catalog');
 const p=productRows.find(r=>r[0]==='D-08-W1');
 if(!p||Number(p[7])!==228000)throw Error('Reference price mismatch');
 function days(x){
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))throw Error('Bad date');
  const d=new Date(x+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x)throw Error('Invalid date');
  return d.getTime()/86400000;
 }
 function check(t){
  const delta=days(t.registration)-days(t.visit);
  const openhouse=Boolean(t.visitVerified&&t.openhouseApproved&&t.staffId&&t.visitKey&&t.registrationKey&&delta>=0&&delta<=7);
  const rate=(t.companionApproved?0.1:0)+(t.multidogApproved?0.1:0)+(openhouse?0.05:0);
  const payable=Math.round(228000*(1-rate));
  const paymentMatches=Number.isSafeInteger(t.paid)&&t.paid===payable;
  const ready=Boolean(openhouse&&t.finalStaffReview&&paymentMatches&&t.productApproved&&t.dogIdVerified);
  return {openhouse,rate,payable,paymentMatches,ready};
 }
 const base={visit:'2026-11-23',registration:'2026-11-30',visitVerified:true,openhouseApproved:true,staffId:'STAFF-TEST',visitKey:'VISIT-TEST',registrationKey:'TEST:order:001',companionApproved:true,multidogApproved:true,paid:171000,finalStaffReview:false,productApproved:false,dogIdVerified:false};
 const tests=[
  ['boundary',base,true,0.25,171000,false],
  ['expired',{...base,registration:'2026-12-01'},false,0.2,182400,false],
  ['unverified',{...base,visitVerified:false},false,0.2,182400,false],
  ['not_approved',{...base,openhouseApproved:false},false,0.2,182400,false],
  ['missing_staff',{...base,staffId:''},false,0.2,182400,false],
  ['wrong_payment',{...base,paid:170000},true,0.25,171000,false],
  ['no_other_discounts',{...base,companionApproved:false,multidogApproved:false,paid:216600},true,0.05,216600,false],
  ['missing_registration_key',{...base,registrationKey:''},false,0.2,182400,false],
  ['staff_review_not_enough',{...base,finalStaffReview:true},true,0.25,171000,false]
 ];
 for(const [name,input,eligible,rate,amount,ready] of tests){
  const r=check(input);
  if(r.openhouse!==eligible||Math.abs(r.rate-rate)>1e-9||r.payable!==amount||r.ready!==ready)throw Error('Test failed: '+name);
 }
 const dataRows=Math.max(0,sheet.getLastRow()-1);
 const result={passed:true,staffReviewColumns:22,syntheticCasesPassed:tests.length,
  recordedVisits:dataRows,openHouseDiscountRate:0.05,maxAdditionalDiscountRate:0.25,
  issuanceAllowed:false,productionWrites:0,stagingWrites:0};
 console.log(JSON.stringify(result));return result;
}
