'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const principal={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
const bookings=[{bookingId:'RSV-TEST-001',visitDate:'2026-11-05',status:'예약',dogName:'테스트멍이'}];
function request(handler){
 return new Promise((resolve,reject)=>{
  const req={url:'/api/staff/bookings',method:'GET',headers:{authorization:'Bearer test'}};
  const res={writeHead(status){this.status=status;},end(body){try{resolve({status:this.status,body:JSON.parse(body)});}catch(e){reject(e);}}};
  Promise.resolve(handler(req,res)).catch(reject);
 });
}
test('staff listing includes independent read-only booking and attendance states',async()=>{
 let reads=0,writes=0;
 const handler=createStaffArrivalHttpHandler({
  authenticateStaff:async()=>principal,
  bookingRepository:{listForStaff:async()=>bookings},
  staffAttendance:{get:async(_,id)=>{reads++;assert.equal(id,'RSV-TEST-001');return {state:'하원 완료'};},transition:async()=>{writes++;throw Error('must not write');}},
  staffArrival:{}
 });
 const response=await request(handler);
 assert.equal(response.status,200);
 assert.deepEqual(response.body.bookings,bookings);
 assert.deepEqual(response.body.combined,[{bookingId:'RSV-TEST-001',sourceStatus:'예약',attendanceState:'하원 완료'}]);
 assert.equal(reads,1);assert.equal(writes,0);
});
test('listing fails closed if attendance read fails; never reports an invented state',async()=>{
 const handler=createStaffArrivalHttpHandler({
  authenticateStaff:async()=>principal,
  bookingRepository:{listForStaff:async()=>bookings},
  staffAttendance:{get:async()=>{throw Error('store unavailable');}},
  staffArrival:{}
 });
 const response=await request(handler);
 assert.equal(response.status,500);
 assert.equal(response.body.error,'Booking list unavailable');
});
