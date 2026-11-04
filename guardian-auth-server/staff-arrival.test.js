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
test('acknowledgment writes only L:M after matching revision',async()=>{
 const {service,writes}=fixture();
 await assert.rejects(service.acknowledge(staff,bookingId,3),/Revision conflict/);
 assert.equal(writes.length,0);
 const result=await service.acknowledge(staff,bookingId,4);
 assert.equal(result.acknowledgedBy,'STAFF-TEST-001');
 assert.match(writes[0].range,/!L2:M2$/);
 assert.deepEqual(writes[0].requestBody.values,[['2026-11-04T03:00:00.000Z','STAFF-TEST-001']]);
});
