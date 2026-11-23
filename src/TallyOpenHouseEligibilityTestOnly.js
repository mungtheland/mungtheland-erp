/**
 * TEST ONLY: open-house discount eligibility and additive stacking.
 * Pure synthetic cases; reads policy from isolated spreadsheet; writes nowhere.
 */
function mdOpenHouseEligibilitySelfTest_TEST_ONLY(){
 const b=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const s=b.getSheetByName('할인정책_테스트');
 if(!s)throw Error('Policy sheet missing');
 const rows=s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,7).getValues():[];
 const by=Object.fromEntries(rows.map(r=>[r[0],r]));
 for(const [code,rate] of [['COMPANION',0.1],['MULTIDOG',0.1],['OPENHOUSE',0.05]]){
   const r=by[code];
   if(!r||r[5]!=='정책확정'||Number(r[2])!==rate)throw Error('Policy not confirmed: '+code);
 }
 function day(s){
   if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Invalid date format');
   const d=new Date(s+'T00:00:00Z');
   if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Invalid calendar date');
   return Math.floor(d.getTime()/86400000);
 }
 function eligible(visit,registration,verified){
   if(!verified)return false;
   if(!visit||!registration)return false;
   const delta=day(registration)-day(visit);
   return delta>=0&&delta<=7;
 }
 const cases=[
  ['same_day', '2026-11-23','2026-11-23',true,true],
  ['day_7','2026-11-23','2026-11-30',true,true],
  ['day_8','2026-11-23','2026-12-01',true,false],
  ['before_visit','2026-11-23','2026-11-22',true,false],
  ['unverified_visit','2026-11-23','2026-11-24',false,false],
  ['month_boundary','2026-12-29','2027-01-05',true,true],
  ['year_boundary_expired','2026-12-29','2027-01-06',true,false],
  ['leap_day','2028-02-29','2028-03-07',true,true],
  ['missing_date',null,'2026-11-24',true,false]
 ];
 for(const [name,v,r,verified,want] of cases){
   if(eligible(v,r,verified)!==want)throw Error('Case failed: '+name);
 }
 const base=228000;
 const rates=[0,0.05,0.1,0.15,0.2,0.25];
 const payable=rates.map(rate=>({rate,amount:Math.round(base*(1-rate))}));
 if(payable.find(x=>x.rate===0.25).amount!==171000)throw Error('25% example mismatch');
 const result={passed:true,casesPassed:cases.length,visitDayIncluded:true,deadlineDays:7,
   requiresVerifiedAttendance:true,stacking:'additive',maxAdditionalDiscountRate:0.25,
   exampleBase:base,exampleDiscount:57000,examplePayable:171000,
   productionIssuanceEnabled:false,productionWrites:0,stagingWrites:0};
 console.log(JSON.stringify(result));return result;
}
