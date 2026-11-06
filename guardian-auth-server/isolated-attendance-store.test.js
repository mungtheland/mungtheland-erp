'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedAttendanceStore,HEADER}=require('./isolated-attendance-store');
const {createStaffAttendanceService}=require('./staff-attendance');
const bookingRepository={findById:async id=>id==='RSV-TEST-001'?{bookingId:id}:null};
const staff={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
test('isolated attendance persists across service recreation and blocks duplicates',async()=>{
 const rows=[HEADER];
 const sheets={spreadsheets:{values:{
  get:async()=>({data:{values:rows.map(r=>r.slice())}}),
  append:async({requestBody})=>{rows.push(requestBody.values[0]);return {data:{}};}
 }}};
 const store=createIsolatedAttendanceStore({sheets});
 const first=createStaffAttendanceService({bookingRepository,store});
 await first.transition(staff,'RSV-TEST-001','check-in');
 const restarted=createStaffAttendanceService({bookingRepository,store});
 assert.equal((await restarted.get(staff,'RSV-TEST-001')).state,'등원 중');
 await assert.rejects(()=>restarted.transition(staff,'RSV-TEST-001','check-in'),/Invalid transition/);
 await restarted.transition(staff,'RSV-TEST-001','check-out');
 assert.equal((await createStaffAttendanceService({bookingRepository,store}).get(staff,'RSV-TEST-001')).state,'하원 완료');
 assert.equal(rows.length,3);
});
test('missing isolated tab fails closed without writing',async()=>{
 let writes=0;
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:[]}}),append:async()=>{writes++;}}}};
 const svc=createStaffAttendanceService({bookingRepository,store:createIsolatedAttendanceStore({sheets})});
 await assert.rejects(()=>svc.transition(staff,'RSV-TEST-001','check-in'),/header mismatch/);
 assert.equal(writes,0);
});
test('production spreadsheet id is rejected',()=>{
 const sheets={spreadsheets:{values:{get:async()=>({}),append:async()=>({})}}};
 assert.throws(()=>createIsolatedAttendanceStore({sheets,spreadsheetId:'production'}),/Isolated test spreadsheet only/);
});

test('two simultaneous check-ins in one process append exactly one event',async()=>{
 const rows=[HEADER];
 const sheets={spreadsheets:{values:{
  get:async()=>({data:{values:rows.map(row=>row.slice())}}),
  append:async({requestBody})=>{await new Promise(resolve=>setTimeout(resolve,5));rows.push(requestBody.values[0]);return {data:{}};}
 }}};
 const store=createIsolatedAttendanceStore({sheets});
 const a=createStaffAttendanceService({bookingRepository,store});
 const b=createStaffAttendanceService({bookingRepository,store});
 const results=await Promise.allSettled([a.transition(staff,'RSV-TEST-001','check-in'),b.transition(staff,'RSV-TEST-001','check-in')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected'&&/Invalid transition/.test(x.reason.message)).length,1);
 assert.equal(rows.length,2);
});
test('failed append does not falsely record check-in',async()=>{
 const sheets={spreadsheets:{values:{
  get:async()=>({data:{values:[HEADER]}}),
  append:async()=>{throw Error('Sheets unavailable');}
 }}};
 const service=createStaffAttendanceService({bookingRepository,store:createIsolatedAttendanceStore({sheets})});
 await assert.rejects(()=>service.transition(staff,'RSV-TEST-001','check-in'),/Sheets unavailable/);
 assert.equal((await service.get(staff,'RSV-TEST-001')).state,'예약');
});
test('attendance events for other booking IDs cannot alter requested booking',async()=>{
 const rows=[HEADER,['EVT-00000000-0000-4000-8000-000000000000','RSV-OTHER','check-in','STAFF-TEST-001','2026-11-06T00:00:00Z']];
 const sheets={spreadsheets:{values:{
  get:async()=>({data:{values:rows}}),append:async()=>{throw Error('Unexpected write');}
 }}};
 const service=createStaffAttendanceService({bookingRepository,store:createIsolatedAttendanceStore({sheets})});
 assert.equal((await service.get(staff,'RSV-TEST-001')).state,'예약');
});
test('invalid event order is rejected rather than silently repaired',async()=>{
 const rows=[HEADER,['EVT-00000000-0000-4000-8000-000000000000','RSV-TEST-001','check-out','STAFF-TEST-001','2026-11-06T00:00:00Z']];
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:rows}}),append:async()=>{throw Error('Unexpected write');}}}};
 const service=createStaffAttendanceService({bookingRepository,store:createIsolatedAttendanceStore({sheets})});
 await assert.rejects(()=>service.get(staff,'RSV-TEST-001'),/Invalid attendance history/);
});

test('cancelled booking cannot be checked in, even with valid staff credentials',async()=>{
 const repo={findById:async id=>({bookingId:id,status:'취소'})};
 const service=createStaffAttendanceService({bookingRepository:repo});
 await assert.rejects(()=>service.transition(staff,'RSV-TEST-001','check-in'),/Booking status blocks attendance/);
 assert.equal((await service.get(staff,'RSV-TEST-001')).state,'예약');
});
test('duplicate attendance event IDs fail closed',async()=>{
 const event=['EVT-00000000-0000-4000-8000-000000000000','RSV-TEST-001','check-in','STAFF-TEST-001','2026-11-06T00:00:00Z'];
 const rows=[HEADER,event,[...event.slice(0,2),'check-out',...event.slice(3)]];
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:rows}}),append:async()=>{throw Error('Unexpected write');}}}};
 const service=createStaffAttendanceService({bookingRepository,store:createIsolatedAttendanceStore({sheets})});
 await assert.rejects(()=>service.get(staff,'RSV-TEST-001'),/Invalid attendance history/);
});
test('out-of-order event timestamps fail closed',async()=>{
 const rows=[HEADER,
  ['EVT-00000000-0000-4000-8000-000000000000','RSV-TEST-001','check-in','STAFF-TEST-001','2026-11-06T01:00:00Z'],
  ['EVT-00000000-0000-4000-8000-000000000001','RSV-TEST-001','check-out','STAFF-TEST-001','2026-11-06T00:00:00Z']];
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:rows}}),append:async()=>{throw Error('Unexpected write');}}}};
 const service=createStaffAttendanceService({bookingRepository,store:createIsolatedAttendanceStore({sheets})});
 await assert.rejects(()=>service.get(staff,'RSV-TEST-001'),/Invalid attendance history/);
});

test('unknown explicit booking status blocks attendance writes',async()=>{
 const repo={findById:async id=>({bookingId:id,status:'환불 처리'})};
 const service=createStaffAttendanceService({bookingRepository:repo});
 await assert.rejects(()=>service.transition(staff,'RSV-TEST-001','check-in'),/Booking status blocks attendance/);
 assert.equal((await service.get(staff,'RSV-TEST-001')).state,'예약');
});
