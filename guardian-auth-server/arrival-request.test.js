'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createArrivalRequestService,validate}=require('./arrival-request');
test('arrival fields validated',()=>{
 assert.equal(validate({mealTime:'12:30',foodProvided:'yes',mannerBelt:'no'}).mealTime,'12:30');
 assert.throws(()=>validate({mealTime:'25:99',foodProvided:'yes',mannerBelt:'no'}));
 assert.throws(()=>validate({foodProvided:'yes',mannerBelt:'no',notes:'x'.repeat(501)}));
});
test('other guardian cannot read or save request',async()=>{
 let accessed=false;
 const sheets={spreadsheets:{values:{get:async()=>{accessed=true;return {data:{values:[]}}},update:async()=>{accessed=true},append:async()=>{accessed=true}}}};
 const bookingRepository={findById:async()=>({bookingId:'RSV-TEST-001',customerId:'CUS-TEST-001'})};
 const service=createArrivalRequestService({sheets,bookingRepository});
 await assert.rejects(service.get('CUS-TEST-OTHER','RSV-TEST-001'),/Access denied/);
 await assert.rejects(service.save('CUS-TEST-OTHER','RSV-TEST-001',{foodProvided:'yes',mannerBelt:'yes'},0),/Access denied/);
 assert.equal(accessed,false);
});

test('A policy: guardian edit after staff review clears L:N and increments revision',async()=>{
 const row=['REQ-TEST-001','RSV-TEST-001','DOG-TEST-001','CUS-TEST-001','12:30','yes','no','normal','old','4','','4','STAFF-001','2026-11-04T01:00:00Z'];
 const booking=['RSV-TEST-001','2026-11-05','DOG-TEST-001','','','예약','','','미등원'];
 const writes=[];
 const sheets={spreadsheets:{values:{
  get:async ({range})=>({data:{values:range.includes('예약·등하원관리')?[['header'],booking]:[['header'],row]}}),
  update:async args=>{writes.push(args);return {}},
  append:async()=>{throw Error('unexpected append')}
 }}};
 const service=createArrivalRequestService({sheets,bookingRepository:{findById:async()=>({customerId:'CUS-TEST-001'})}});
 const result=await service.save('CUS-TEST-001','RSV-TEST-001',{mealTime:'13:00',foodProvided:'yes',mannerBelt:'no',condition:'healthy',notes:'changed'},4);
 assert.equal(result.revision,5);
 assert.deepEqual(writes[0].requestBody.values[0].slice(11,14),['','','']);
 assert.equal(writes[0].requestBody.values[0][9],'5');
});
test('A policy: guardian save rejected after check-in',async()=>{
 const booking=['RSV-TEST-001','2026-11-05','DOG-TEST-001','','','예약','09:00','','등원 중'];
 let writes=0;
 const sheets={spreadsheets:{values:{
  get:async ({range})=>({data:{values:range.includes('예약·등하원관리')?[['header'],booking]:[['header']]}}),
  update:async()=>{writes++},append:async()=>{writes++}
 }}};
 const service=createArrivalRequestService({sheets,bookingRepository:{findById:async()=>({customerId:'CUS-TEST-001'})}});
 await assert.rejects(service.save('CUS-TEST-001','RSV-TEST-001',{mealTime:'',foodProvided:'yes',mannerBelt:'no'},0),/Request locked/);
 assert.equal(writes,0);
});

test('stale revision is rejected without writing',async()=>{
 const row=['REQ-TEST-001','RSV-TEST-001','DOG-TEST-001','CUS-TEST-001','','yes','no','normal','','5'];
 let writes=0;
 const sheets={spreadsheets:{values:{
  get:async()=>({data:{values:[['header'],row]}}),
  update:async()=>{writes++},append:async()=>{writes++}
 }}};
 const service=createArrivalRequestService({sheets,bookingRepository:{findById:async()=>({customerId:'CUS-TEST-001'})}});
 await assert.rejects(service.save('CUS-TEST-001','RSV-TEST-001',{foodProvided:'yes',mannerBelt:'no'},4),/Revision conflict/);
 assert.equal(writes,0);
});

test('concurrent guardian saves with same expected revision allow only one write',async()=>{
 const bookingId='RSV-TEST-001';
 const row=['REQ-TEST-001',bookingId,'DOG-TEST-001','CUS-TEST-001','','yes','no','normal','','4','','','',''];
 const booking=[bookingId,'2026-11-05','DOG-TEST-001','','','예약','','','미등원'];
 let writes=0;
 const sheets={spreadsheets:{values:{
  get:async ({range})=>({data:{values:range.includes('예약·등하원관리')?[['header'],booking]:[['header'],row.slice()]}}),
  update:async args=>{writes++;await Promise.resolve();row.splice(0,row.length,...args.requestBody.values[0]);},
  append:async()=>{throw Error('unexpected append')}
 }}};
 const service=createArrivalRequestService({sheets,bookingRepository:{findById:async()=>({customerId:'CUS-TEST-001'})}});
 const payload={foodProvided:'yes',mannerBelt:'no',condition:'normal'};
 const results=await Promise.allSettled([
  service.save('CUS-TEST-001',bookingId,{...payload,notes:'first'},4),
  service.save('CUS-TEST-001',bookingId,{...payload,notes:'second'},4)
 ]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected'&&/Revision conflict/.test(x.reason.message)).length,1);
 assert.equal(writes,1);
 assert.equal(row[9],'5');
});
