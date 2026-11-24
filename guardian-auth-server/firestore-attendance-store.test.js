'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const {attendanceRequestEventId}=require('./attendance-history');
const projectId='mungtheland-guardian-test',id='RSV-TEST-001';
const staff={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
const bookingRepository={findById:async key=>key===id?{bookingId:key,status:'예약'}:null};
function fakeDb({beforeRetry}={}){
 const docs=new Map();let queue=Promise.resolve();
 const db={projectId,collection:()=>({doc:key=>({id:key,get:async()=>snapshot(key)})})};
 const snapshot=key=>({exists:docs.has(key),data:()=>structuredClone(docs.get(key))});
 db.runTransaction=fn=>{
  const attempt=async()=>{
   const writes=[];
   const tx={get:async ref=>snapshot(ref.id),set:(ref,value)=>writes.push([ref.id,structuredClone(value)])};
   const result=await fn(tx);
   return {writes,result};
  };
  const run=async()=>{
   let committed=await attempt();
   if(beforeRetry){
    beforeRetry(docs);
    committed=await attempt();
   }
   for(const [key,value] of committed.writes)docs.set(key,value);
   return committed.result;
  };
  const next=queue.then(run);queue=next.catch(()=>{});return next;
 };
 return {db,docs};
}
function service(db,at='2026-11-06T02:00:00Z'){
 return createStaffAttendanceService({bookingRepository,store:createFirestoreAttendanceStore({db,projectId}),clock:()=>new Date(at)});
}
const at='2026-11-06T02:00:00Z', previousAt='2026-11-06T01:59:59Z';
const checkIn={bookingId:id,eventId:'EVT-IN',action:'check-in',staffId:staff.staffId,at};
const checkOut={...checkIn,eventId:'EVT-OUT',action:'check-out'};
const checkedIn={bookingId:id,state:'등원 중',events:[checkIn]};
test('Firestore adapter enforces transition order and preserves two events',async()=>{
 const {db,docs}=fakeDb(),svc=service(db);
 await assert.rejects(svc.transition(staff,id,'check-out'),/Invalid transition/);
 await svc.transition(staff,id,'check-in');
 await assert.rejects(svc.transition(staff,id,'check-in'),/Invalid transition/);
 await svc.transition(staff,id,'check-out');
 await assert.rejects(svc.transition(staff,id,'check-out'),/Invalid transition/);
 assert.equal(docs.get(id).events.length,2);
 assert.deepEqual(docs.get(id).events.map(x=>x.action),['check-in','check-out']);
 assert.equal((await service(db).get(staff,id)).state,'하원 완료');
});
test('two independent service instances cannot double check-in concurrently',async()=>{
 const {db,docs}=fakeDb();
 const results=await Promise.allSettled([service(db).transition(staff,id,'check-in'),service(db).transition(staff,id,'check-in')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected'&&/Invalid transition/.test(x.reason.message)).length,1);
 assert.equal(docs.get(id).events.length,1);
});
test('two independent service instances cannot double check-out concurrently',async()=>{
 const {db,docs}=fakeDb();
 await service(db).transition(staff,id,'check-in');
 const results=await Promise.allSettled([service(db).transition(staff,id,'check-out'),service(db).transition(staff,id,'check-out')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected'&&/Invalid transition/.test(x.reason.message)).length,1);
 assert.equal(docs.get(id).events.length,2);
});
test('rejects mismatched project and corrupt attendance history without mutation',async()=>{
 const {db,docs}=fakeDb();
 assert.throws(()=>createFirestoreAttendanceStore({db,projectId:'other'}),/Test Firestore project only/);
 docs.set(id,{bookingId:id,state:'하원 완료',events:[{action:'check-in'}]});
 await assert.rejects(service(db).get(staff,id),/Invalid attendance document/);
 await assert.rejects(service(db).transition(staff,id,'check-in'),/Invalid attendance document/);
 assert.equal(docs.get(id).events.length,1);
});

test('clock rollback is rejected through HTTP without changing the stored check-in',async()=>{
 const {db,docs}=fakeDb();
 await service(db).transition(staff,id,'check-in');
 const original=structuredClone(docs.get(id));
 const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>staff,staffAttendance:service(db,previousAt)});
 let status,body;
 await handler({url:'/api/staff/bookings/'+id+'/attendance/check-out',method:'POST',headers:{authorization:'Bearer fixture'}},{
  writeHead(value){status=value;},end(value){body=JSON.parse(value);}
 });
 assert.equal(status,409);
 assert.deepEqual(body,{error:'Attendance event time precedes previous event',code:'ATTENDANCE_CLOCK_ROLLBACK'});
 assert.deepEqual(docs.get(id),original);
 assert.equal((await service(db).get(staff,id)).state,'등원 중');
});

test('rejects missing or different document booking ID on read and in transaction',async()=>{
 for(const bookingId of [undefined,'RSV-OTHER']){
  const {db,docs}=fakeDb(),store=createFirestoreAttendanceStore({db,projectId});
  const original={...checkedIn,bookingId};
  docs.set(id,original);
  await assert.rejects(store.read(id),{code:'INVALID_ATTENDANCE_DOCUMENT'});
  await assert.rejects(store.commitTransition({event:checkOut,expectedState:'등원 중'}),{code:'INVALID_ATTENDANCE_DOCUMENT'});
  assert.deepEqual(docs.get(id),original);
 }
});

test('rejects malformed existing events even when writing through the adapter directly',async()=>{
 const malformed=[null,{...checkIn,bookingId:'RSV-OTHER'},{...checkIn,action:'check-out'},
  {...checkIn,eventId:undefined},{...checkIn,staffId:undefined},{...checkIn,at:'invalid'},
  {...checkIn,at:'1'},{...checkIn,at:'2026-02-30T02:00:00Z'}];
 for(const event of malformed){
  const {db,docs}=fakeDb(),store=createFirestoreAttendanceStore({db,projectId});
  const original={...checkedIn,events:[event]};
  docs.set(id,original);
  await assert.rejects(store.read(id),{code:'INVALID_ATTENDANCE_HISTORY'});
  await assert.rejects(store.commitTransition({event:checkOut,expectedState:'등원 중'}),{code:'INVALID_ATTENDANCE_HISTORY'});
  assert.deepEqual(docs.get(id),original);
 }
});

test('rejects incomplete and duplicate incoming events without replacing the first event',async()=>{
 const {db,docs}=fakeDb(),store=createFirestoreAttendanceStore({db,projectId});
 docs.set(id,checkedIn);
 for(const event of [
  {...checkOut,bookingId:undefined},{...checkOut,at:undefined},{...checkOut,staffId:''},
  {...checkOut,eventId:''},{...checkOut,eventId:checkIn.eventId}
 ]){
  await assert.rejects(store.commitTransition({event,expectedState:'등원 중'}),{code:'INVALID_ATTENDANCE_HISTORY'});
  assert.deepEqual(docs.get(id),checkedIn);
 }
});

test('transaction retry rereads the document and rejects a newly invalid timestamp',async()=>{
 const laterCheckIn={...checkIn,at:'2026-11-06T03:00:00Z'};
 const updated={...checkedIn,events:[laterCheckIn]};
 const {db,docs}=fakeDb({beforeRetry:documents=>documents.set(id,updated)});
 docs.set(id,checkedIn);
 const store=createFirestoreAttendanceStore({db,projectId});
 await assert.rejects(store.commitTransition({event:checkOut,expectedState:'등원 중'}),{code:'ATTENDANCE_CLOCK_ROLLBACK'});
 assert.deepEqual(docs.get(id),updated);
});

test('transaction retry retains one candidate and preserves prior event and document metadata',async()=>{
 let retries=0;
 const {db,docs}=fakeDb({beforeRetry:()=>{retries++;}});
 const original={...checkedIn,createdBy:'fixture'};
 docs.set(id,original);
 const store=createFirestoreAttendanceStore({db,projectId});
 await store.commitTransition({event:checkOut,expectedState:'등원 중'});
 assert.equal(retries,1);
 assert.deepEqual(docs.get(id),{...original,state:'하원 완료',events:[checkIn,checkOut]});
 assert.deepEqual(await store.read(id),[checkIn,checkOut]);
});

test('concurrent adapters cannot commit duplicate check-in or check-out without a service lock',async()=>{
 const {db,docs}=fakeDb();
 const stores=[createFirestoreAttendanceStore({db,projectId}),createFirestoreAttendanceStore({db,projectId})];
 for(const [event,expectedState,eventCount] of [[checkIn,'예약',1],[checkOut,'등원 중',2]]){
  const results=await Promise.allSettled(stores.map(store=>store.commitTransition({event,expectedState})));
  assert.deepEqual(results.map(result=>result.status),['fulfilled','rejected']);
  assert.match(results[1].reason.message,/Invalid transition/);
  assert.equal(docs.get(id).events.length,eventCount);
 }
});

test('rejects already-stored reverse timestamps and duplicate IDs',async()=>{
 const {db,docs}=fakeDb(),store=createFirestoreAttendanceStore({db,projectId});
 for(const event of [{...checkOut,at:previousAt},{...checkOut,eventId:checkIn.eventId}]){
  const original={...checkedIn,state:'하원 완료',events:[checkIn,event]};
  docs.set(id,original);
  await assert.rejects(store.read(id),{code:'INVALID_ATTENDANCE_HISTORY'});
  await assert.rejects(store.commitTransition({event:checkOut,expectedState:'등원 중'}),{code:'INVALID_ATTENDANCE_HISTORY'});
  assert.deepEqual(docs.get(id),original);
 }
});

test('transaction retry recognizes another commit of the same request and returns its history',async()=>{
 const event={...checkIn,eventId:attendanceRequestEventId('12345678-1234-4234-8234-123456789abc')};
 const alreadySaved={...event,at:previousAt};
 const original={...checkedIn,events:[alreadySaved]};
 const {db,docs}=fakeDb({beforeRetry:documents=>documents.set(id,original)});
 const store=createFirestoreAttendanceStore({db,projectId});
 assert.deepEqual(await store.commitTransition({event,expectedState:'예약'}),[alreadySaved]);
 assert.deepEqual(docs.get(id),original);
});

test('parallel staff requests in the same transaction scope cannot share a request ID',async()=>{
 const {db,docs}=fakeDb();
 const stores=[createFirestoreAttendanceStore({db,projectId}),createFirestoreAttendanceStore({db,projectId})];
 const event={...checkIn,eventId:attendanceRequestEventId('12345678-1234-4234-8234-123456789abc')};
 const [winner,loser]=await Promise.allSettled(stores.map((store,index)=>store.commitTransition({
  event:{...event,staffId:'STAFF-TEST-00'+(index+1)},expectedState:'예약'
 })));
 assert.equal(winner.status,'fulfilled');
 assert.equal(loser.reason.code,'ATTENDANCE_REQUEST_ID_CONFLICT');
 assert.deepEqual(docs.get(id).events,[event]);
});
