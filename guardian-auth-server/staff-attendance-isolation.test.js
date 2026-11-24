'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const cases=[
 ['coded history',Object.assign(new Error('Different wording'),{code:'INVALID_ATTENDANCE_HISTORY'})],
 ['coded document',Object.assign(new Error('Different wording'),{code:'INVALID_ATTENDANCE_DOCUMENT'})],
 ['legacy history',new Error('Invalid attendance history')],
 ['legacy document',new Error('Invalid attendance document')]
];
for(const [label,error] of cases){
 test(label+' is isolated without hiding healthy bookings',async()=>{
  const bookings=[{bookingId:'RSV-GOOD',status:'예약'},{bookingId:'RSV-BAD',status:'예약'}];
  const handler=createStaffArrivalHttpHandler({
   authenticateStaff:async()=>({role:'staff',status:'active',staffId:'STAFF-TEST-001'}),
   bookingRepository:{listForStaff:async()=>bookings},
   staffAttendance:{get:async(_,id)=>{if(id==='RSV-BAD')throw error;return {state:'예약'};}},
   staffArrival:{}
  });
  const result=await new Promise((resolve,reject)=>{
   const req={url:'/api/staff/bookings',method:'GET',headers:{authorization:'Bearer test'}};
   const res={writeHead(status){this.status=status;},end(body){try{resolve({status:this.status,body:JSON.parse(body)});}catch(err){reject(err);}}};
   Promise.resolve(handler(req,res)).catch(reject);
  });
  assert.equal(result.status,200);
  assert.deepEqual(result.body.bookings,bookings);
  assert.deepEqual(result.body.combined,[
   {bookingId:'RSV-GOOD',sourceStatus:'예약',attendanceState:'예약',displayStatus:'예약',mismatch:false,reason:'MATCH',needsReview:false},
   {bookingId:'RSV-BAD',sourceStatus:'예약',attendanceState:null,displayStatus:'출석 기록 확인 필요',mismatch:true,reason:'INVALID_ATTENDANCE_HISTORY',needsReview:true,attendanceError:true}
  ]);
 });
}
