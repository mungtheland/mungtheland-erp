'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStaffAttendanceService}=require('./staff-attendance');
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
   events.set(event.bookingId,[...current,event]);commits++;
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
 await assert.rejects(()=>service.transition(principal,'RSV-TEST-001','check-in'),/Transaction unavailable/);
 assert.equal((await service.get(principal,'RSV-TEST-001')).state,'예약');
});
