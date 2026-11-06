'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStaffAttendanceService}=require('./staff-attendance');
const bookingRepository={findById:async id=>id==='RSV-TEST-001'?{bookingId:id}:null};
const staff={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
test('isolated attendance transitions, timestamps, staff and duplicates',async()=>{
 const svc=createStaffAttendanceService({bookingRepository,clock:()=>new Date('2026-11-06T01:00:00Z')});
 assert.equal((await svc.get(staff,'RSV-TEST-001')).state,'예약');
 await assert.rejects(()=>svc.transition(staff,'RSV-TEST-001','check-out'),/Invalid transition/);
 const checkedIn=await svc.transition(staff,'RSV-TEST-001','check-in');
 assert.equal(checkedIn.state,'등원 중');assert.equal(checkedIn.checkIn.staffId,staff.staffId);
 assert.equal(checkedIn.checkIn.at,'2026-11-06T01:00:00.000Z');
 await assert.rejects(()=>svc.transition(staff,'RSV-TEST-001','check-in'),/Invalid transition/);
 const checkedOut=await svc.transition(staff,'RSV-TEST-001','check-out');
 assert.equal(checkedOut.state,'하원 완료');assert.equal(checkedOut.checkOut.staffId,staff.staffId);
 await assert.rejects(()=>svc.transition(staff,'RSV-TEST-001','check-out'),/Invalid transition/);
});
test('attendance rejects unauthorized staff and unknown booking',async()=>{
 const svc=createStaffAttendanceService({bookingRepository});
 await assert.rejects(()=>svc.get({role:'guardian'},'RSV-TEST-001'),/Access denied/);
 await assert.rejects(()=>svc.transition(staff,'RSV-OTHER','check-in'),/Booking not found/);
});

test('inactive and forged staff principals cannot read or write attendance',async()=>{
 const svc=createStaffAttendanceService({bookingRepository});
 for(const principal of [
  {role:'guardian',status:'active',staffId:'STAFF-TEST-001'},
  {role:'staff',status:'inactive',staffId:'STAFF-TEST-001'},
  {role:'staff',status:'active',staffId:'invalid'},
  null
 ]){
  await assert.rejects(()=>svc.get(principal,'RSV-TEST-001'),/Access denied/);
  await assert.rejects(()=>svc.transition(principal,'RSV-TEST-001','check-in'),/Access denied/);
 }
 assert.equal((await svc.get(staff,'RSV-TEST-001')).state,'예약');
});
