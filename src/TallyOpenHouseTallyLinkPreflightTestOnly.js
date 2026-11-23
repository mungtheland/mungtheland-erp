/**
 * Step 25: READ-ONLY visit-to-Tally link validation in isolated staging.
 * No name/phone matching, no production access, no writes, no issuance.
 */
function mdOpenHouseTallyLinkPreflight_TEST_ONLY(){
 const ss=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const visits=ss.getSheetByName('오픈하우스확인_테스트');
 const queue=ss.getSheetByName('통합접수대장');
 if(!visits||!queue)throw Error('Isolated staging tabs missing');
 const vr=visits.getDataRange().getValues().slice(1).filter(r=>r.some(v=>v!==''&&v!==null));
 const qr=queue.getDataRange().getValues().slice(1).filter(r=>String(r[0]||'').trim());
 const keys=new Set(),duplicates=new Set();
 for(const r of qr){const k=String(r[0]).trim();if(keys.has(k))duplicates.add(k);keys.add(k);}
 function dateDay(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d.getTime()/86400000:null;
 }
 function validate(v,allVisits,queueKeys,queueDuplicates){
  const key=String(v[0]||'').trim(),receipt=String(v[6]||'').trim();
  const sameVisit=allVisits.filter(r=>String(r[0]||'').trim()===key);
  const sameReceipt=allVisits.filter(r=>String(r[6]||'').trim()===receipt);
  const a=dateDay(v[1]),b=dateDay(v[7]);
  const diff=a===null||b===null?null:b-a;
  const reasons=[];
  if(!key||sameVisit.length!==1)reasons.push('VISIT_KEY_MISSING_OR_DUPLICATE');
  if(!receipt||!queueKeys.has(receipt)||queueDuplicates.has(receipt))reasons.push('TALLY_RECEIPT_MISSING_OR_DUPLICATE');
  if(receipt&&sameReceipt.length!==1)reasons.push('RECEIPT_LINK_MISSING_OR_DUPLICATE');
  if(String(v[3]||'').trim()!=='확인완료'||!String(v[4]||'').trim()||!v[5])reasons.push('ATTENDANCE_NOT_STAFF_VERIFIED');
  if(diff===null||diff<0||diff>7)reasons.push('REGISTRATION_OUTSIDE_7_DAYS');
  if(String(v[9]||'').trim()!=='승인')reasons.push('DISCOUNT_NOT_STAFF_APPROVED');
  return {linked:reasons.length===0,reasons};
 }
 const demo=(overrides={})=>Object.assign(['VISIT:TEST-001','2026-11-23','GUARDIAN:TEST','확인완료','STAFF:TEST','2026-11-23T13:00:00','TEST:order:001','2026-11-30','','승인'],overrides);
 const cases=[
  ['valid',demo(),true],
  ['expired',demo({7:'2026-12-01'}),false],
  ['no_attendance',demo({3:'미확인'}),false],
  ['no_staff',demo({4:''}),false],
  ['no_approval',demo({9:'미승인'}),false],
  ['unknown_receipt',demo({6:'TEST:order:999'}),false],
  ['blank_receipt',demo({6:''}),false],
  ['before_visit',demo({7:'2026-11-22'}),false]
 ];
 for(const [name,row,want] of cases){
  const r=validate(row,[row],new Set(['TEST:order:001']),new Set());
  if(r.linked!==want)throw Error('Synthetic link test failed: '+name+' '+r.reasons.join(','));
 }
 const duplicate=demo();
 if(validate(duplicate,[duplicate,duplicate],new Set(['TEST:order:001']),new Set()).linked)throw Error('Duplicate link not blocked');
 const outcomes=vr.map(r=>validate(r,vr,keys,duplicates));
 const result={passed:true,syntheticCasesPassed:9,stagingTallyReceipts:qr.length,
  recordedVisits:vr.length,eligibleVerifiedLinks:outcomes.filter(x=>x.linked).length,
  blockedOrPendingLinks:outcomes.filter(x=>!x.linked).length,
  automaticNamePhoneMatching:false,actualDiscountApprovalPerformed:false,
  actualIssuanceAllowed:false,productionWrites:0,stagingWrites:0};
 console.log(JSON.stringify(result));return result;
}
