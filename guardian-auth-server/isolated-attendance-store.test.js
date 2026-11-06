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
