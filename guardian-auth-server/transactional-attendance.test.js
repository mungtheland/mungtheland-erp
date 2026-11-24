'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const principal={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
const bookingRepository={findById:async bookingId=>({bookingId,status:'예약'})};
function transactionalFake(){
 const events=new Map();let commits=0;
 return {read:async id=>[...(events.get(id)||[])],get commits(){return commits;},
  async commitTransition({event,expectedState}){
   // Fake transactional boundary: a real adapter must provide cross-process atomicity.
   const current=events.get(event.bookingId)||[];
   const state=current.length===0?'예약':current.length===1?'등원 중':'하원 완료';
   if(state!==expectedState)throw Error('Invalid transition');
   if(event.action!==(state==='예약'?'check-in':'check-out'))throw Error('Invalid transition');
   const saved=[...current,event];
   events.set(event.bookingId,saved);commits++;
   return saved;
  }
 };
}
test('transactional store interface uses conditional commit instead of append',async()=>{
 const store=transactionalFake();store.append=async()=>{throw Error('append must not be used');};
 const service=createStaffAttendanceService({bookingRepository,store});
 assert.equal((await service.transition(principal,'RSV-TEST-001','check-in')).state,'등원 중');
 assert.equal((await service.transition(principal,'RSV-TEST-001','check-out')).state,'하원 완료');
 assert.equal(store.commits,2);
});
test('conditional commit rejects stale state without extra event',async()=>{
 const store=transactionalFake();
 const first=createStaffAttendanceService({bookingRepository,store});
 await first.transition(principal,'RSV-TEST-001','check-in');
 await assert.rejects(()=>store.commitTransition({event:{bookingId:'RSV-TEST-001',action:'check-in'},expectedState:'예약'}),/Invalid transition/);
 assert.equal((await first.get(principal,'RSV-TEST-001')).state,'등원 중');
 assert.equal(store.commits,1);
});
test('failed transactional commit does not claim success',async()=>{
 const store={read:async()=>[],commitTransition:async()=>{throw Error('Transaction unavailable');}};
 const service=createStaffAttendanceService({bookingRepository,store});
 await assert.rejects(()=>service.transition(principal,'RSV-TEST-001','check-in'),{code:'ATTENDANCE_OUTCOME_UNKNOWN'});
 assert.equal((await service.get(principal,'RSV-TEST-001')).state,'예약');
});

test('confirmed commit returns through HTTP even when the next store read fails',async()=>{
 const store=transactionalFake(),read=store.read;
 store.read=async id=>{
  if(store.commits)throw Error('post-commit read unavailable');
  return read(id);
 };
 const service=createStaffAttendanceService({bookingRepository,store});
 const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>principal,staffAttendance:service});
 const result=await request(handler,'check-in');
 assert.equal(result.status,200);
 assert.equal(result.body.attendance.state,'등원 중');
 assert.equal(store.commits,1);
 await assert.rejects(service.get(principal,'RSV-TEST-001'),/post-commit read unavailable/);
});

const checkInId='12345678-1234-4234-8234-123456789abc';
const checkOutId='12345678-1234-4234-8234-123456789def';
async function request(handler,action,id){
 let status,body;
 const headers={authorization:'Bearer fixture'};
 if(id!==undefined)headers['x-attendance-request-id']=id;
 await handler({url:'/api/staff/bookings/RSV-TEST-001/attendance/'+action,method:'POST',headers},{
  writeHead(value){status=value;},end(value){body=JSON.parse(value);}
 });
 return {status,body};
}

test('lost commit acknowledgment stays unknown until replay confirms the same stored event',async()=>{
 const store=transactionalFake(),commit=store.commitTransition;
 store.commitTransition=async args=>{await commit(args);throw Error('commit acknowledgment lost');};
 const service=createStaffAttendanceService({bookingRepository,store});
 const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>principal,staffAttendance:service});
 const first=await request(handler,'check-in',checkInId);
 assert.equal(first.status,503);
 assert.equal(first.body.code,'ATTENDANCE_OUTCOME_UNKNOWN');
 assert.equal((await service.get(principal,'RSV-TEST-001')).state,'등원 중');
 assert.equal((await request(handler,'check-in',checkInId)).body.attendance.state,'등원 중');
 assert.equal(store.commits,1);
});

test('request IDs distinguish actions and staff and remain optional for legacy clients',async()=>{
 const store=transactionalFake();
 const service=createStaffAttendanceService({bookingRepository,store});
 let actor=principal;
 const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>actor,staffAttendance:service});
 assert.equal((await request(handler,'check-in','bad-id')).status,400);
 assert.equal((await request(handler,'check-in',checkInId)).status,200);
 actor={...principal,staffId:'STAFF-TEST-002'};
 const collision=await request(handler,'check-in',checkInId);
 assert.equal(collision.status,409);
 assert.equal(collision.body.code,'ATTENDANCE_REQUEST_ID_CONFLICT');
 actor=principal;
 assert.equal((await request(handler,'check-out',checkInId)).body.code,'ATTENDANCE_REQUEST_ID_CONFLICT');
 assert.equal((await request(handler,'check-out',checkOutId)).body.attendance.state,'하원 완료');
 assert.equal((await request(handler,'check-in',checkInId)).body.attendance.state,'하원 완료');
 assert.equal((await request(handler,'check-out')).body.code,'ATTENDANCE_STATE_CONFLICT');
 assert.equal(store.commits,2);
});

test('failure before attempting a write has a distinct HTTP response',async()=>{
 const store={read:async()=>{throw Error('read unavailable');},commitTransition:async()=>assert.fail('Unexpected write')};
 const service=createStaffAttendanceService({bookingRepository,store});
 const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>principal,staffAttendance:service});
 const result=await request(handler,'check-in',checkInId);
 assert.equal(result.status,503);
 assert.equal(result.body.code,'ATTENDANCE_WRITE_FAILED');
});
