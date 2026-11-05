'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStaffArrivalService}=require('./staff-arrival');
const bookingId='RSV-TEST-001';
function fixture(){
 const row=['REQ-TEST-001',bookingId,'DOG-TEST-001','CUS-TEST-001','12:30','yes','no','healthy','notes','4','', '', '', ''];
 const writes=[];
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:[['header'],row]}}),update:async x=>{writes.push(x);return {}}}}};
 const bookingRepository={findById:async id=>id===bookingId?{bookingId:id,customerId:'CUS-TEST-001'}:null};
 return {service:createStaffArrivalService({sheets,bookingRepository,clock:()=>new Date('2026-11-04T03:00:00.000Z')}),writes};
}
const staff={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
test('only active staff may read or acknowledge',async()=>{
 const {service,writes}=fixture();
 for(const principal of [null,{role:'guardian',status:'active',staffId:'x'},{role:'staff',status:'inactive',staffId:'x'}]){
  await assert.rejects(service.get(principal,bookingId),/Staff access denied/);
  await assert.rejects(service.acknowledge(principal,bookingId,4),/Staff access denied/);
 }
 assert.equal(writes.length,0);
});
test('staff sees request without guardian credentials',async()=>{
 const {service}=fixture();const r=await service.get(staff,bookingId);
 assert.equal(r.notes,'notes');assert.equal(r.revision,4);assert.equal(r.acknowledgedAt,null);
});
test('acknowledgment writes only L:N after matching revision',async()=>{
 const {service,writes}=fixture();
 await assert.rejects(service.acknowledge(staff,bookingId,3),/Revision conflict/);
 assert.equal(writes.length,0);
 const result=await service.acknowledge(staff,bookingId,4);
 assert.equal(result.acknowledgedBy,'STAFF-TEST-001');
 assert.match(writes[0].range,/!L2:N2$/);
 assert.deepEqual(writes[0].requestBody.values,[[4,'STAFF-TEST-001','2026-11-04T03:00:00.000Z']]);
});

test('guardian edit and staff acknowledgment serialize; latest revision remains unconfirmed',async()=>{
 const {createArrivalRequestService}=require('./arrival-request');
 const row=['REQ-TEST-001',bookingId,'DOG-TEST-001','CUS-TEST-001','12:30','yes','no','normal','original','4','','','',''];
 const booking=[bookingId,'2026-11-05','DOG-TEST-001','','','예약','','','미등원'];
 const writes=[];
 const sheets={spreadsheets:{values:{
  get:async ({range})=>({data:{values:range.includes('예약·등하원관리')?[['header'],booking]:[['header'],row.slice()]}}),
  update:async args=>{
   writes.push(args.range);
   await Promise.resolve();
   if(/!L2:N2$/.test(args.range))row.splice(11,3,...args.requestBody.values[0]);
   else row.splice(0,row.length,...args.requestBody.values[0]);
  },
  append:async()=>{throw Error('unexpected append')}
 }}};
 const repository={findById:async()=>({bookingId,customerId:'CUS-TEST-001'})};
 const guardian=createArrivalRequestService({sheets,bookingRepository:repository});
 const employee=createStaffArrivalService({sheets,bookingRepository:repository});
 // Employee reviews revision 4 first; guardian then changes it to revision 5.
 const [ack,save]=await Promise.all([
  employee.acknowledge(staff,bookingId,4),
  guardian.save('CUS-TEST-001',bookingId,{mealTime:'13:00',foodProvided:'yes',mannerBelt:'no',condition:'normal',notes:'new'},4)
 ]);
 assert.equal(ack.revision,4);
 assert.equal(save.revision,5);
 assert.equal(row[9],'5');
 assert.deepEqual(row.slice(11,14),['','','']);
 assert.equal((await guardian.get('CUS-TEST-001',bookingId)).reviewStatus,'unconfirmed');
 assert.equal(writes.length,2);
});
test('guardian edit first makes concurrent staff acknowledgment of stale revision fail',async()=>{
 const {createArrivalRequestService}=require('./arrival-request');
 const row=['REQ-TEST-001',bookingId,'DOG-TEST-001','CUS-TEST-001','','yes','no','normal','old','4','','','',''];
 const booking=[bookingId,'2026-11-05','DOG-TEST-001','','','예약','','','미등원'];
 let writes=0;
 const sheets={spreadsheets:{values:{
  get:async ({range})=>({data:{values:range.includes('예약·등하원관리')?[['header'],booking]:[['header'],row.slice()]}}),
  update:async args=>{writes++;await Promise.resolve();if(/!A2:N2$/.test(args.range))row.splice(0,row.length,...args.requestBody.values[0]);else row.splice(11,3,...args.requestBody.values[0]);},
  append:async()=>{throw Error('unexpected append')}
 }}};
 const repository={findById:async()=>({bookingId,customerId:'CUS-TEST-001'})};
 const guardian=createArrivalRequestService({sheets,bookingRepository:repository});
 const employee=createStaffArrivalService({sheets,bookingRepository:repository});
 const [save,ack]=await Promise.allSettled([
  guardian.save('CUS-TEST-001',bookingId,{foodProvided:'yes',mannerBelt:'no',condition:'normal'},4),
  employee.acknowledge(staff,bookingId,4)
 ]);
 assert.equal(save.status,'fulfilled');
 assert.equal(ack.status,'rejected');
 assert.match(ack.reason.message,/Revision conflict/);
 assert.equal(writes,1);
 assert.equal(row[9],'5');
 assert.deepEqual(row.slice(11,14),['','','']);
});
