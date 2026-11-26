'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFirestoreAttendanceStore,createEmulatorAttendanceStore,EMULATOR_PROJECT,EMULATOR_HOST}=require('./firestore-attendance-store');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const {attendanceRequestEventId}=require('./attendance-history');
const {createStaffPassDeduction}=require('./staff-pass-deduction');
const {createPassWorkbookFixture}=require('./attendance-pass-workbook.fixture.cjs');
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

function passFixture(options){
 const {db,docs}=fakeDb();
 const [servicePath,port]=EMULATOR_HOST.split(':');
 const fixtureDb={...db,projectId:EMULATOR_PROJECT,_settings:{servicePath,port:Number(port),ssl:false}};
 const prior=process.env.FIRESTORE_EMULATOR_HOST;
 process.env.FIRESTORE_EMULATOR_HOST=EMULATOR_HOST;
 let store;
 try{store=createEmulatorAttendanceStore(fixtureDb);}
 finally{
  if(prior===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;
  else process.env.FIRESTORE_EMULATOR_HOST=prior;
 }
 const workbook=createPassWorkbookFixture();
 const {booking,pass,passId}=workbook.seed(id,options);
 const passDeduction=createStaffPassDeduction(workbook.ledger);
 const open=(attendanceStore=store)=>createStaffAttendanceService({bookingRepository,store:attendanceStore,clock:workbook.clock,passDeduction});
 const session=open();
 const checkIn=(request)=>session.transition(staff,id,'check-in',request);
 return {db,docs,store,workbook,booking,pass,passId,passDeduction,open,session,checkIn};
}
const requestA='00000000-0000-4000-8000-000000000001';
const requestB='00000000-0000-4000-8000-000000000002';

test('automatic attendance pass wiring is rejected for the cloud store and a non-isolated ledger',()=>{
 const {db,passDeduction,workbook}=passFixture();
 assert.throws(()=>createStaffAttendanceService({bookingRepository,store:createFirestoreAttendanceStore({db,projectId}),passDeduction}),/transactional attendance/);
 assert.throws(()=>createStaffPassDeduction({...workbook.ledger,scope:'unapproved'}),/Isolated Sheets/);
});

test('check-in deducts once, while checkout, replay, and duplicate requests do not',async()=>{
 const f=passFixture();
 assert.equal((await f.session.get(staff,id)).passDeductionStatus,'PENDING');
 assert.equal(f.workbook.history.length,1);
 assert.equal((await f.checkIn(requestA)).passDeductionStatus,'COMPLETED');
 assert.equal(f.pass[7],7);
 const [entry]=f.workbook.history.slice(1);
 assert.equal(entry[8],'AUTO_ATTENDANCE');
 assert.equal(entry[9],'local-sheets:'+id+' '+attendanceRequestEventId(requestA));
 assert.deepEqual(f.docs.get(id).passDeduction,{key:'local-sheets:'+id,eventId:attendanceRequestEventId(requestA),status:'COMPLETED'});
 assert.equal((await f.checkIn(requestA)).passDeductionStatus,'COMPLETED');
 await assert.rejects(f.checkIn(requestB),/Invalid transition/);
 assert.equal((await f.session.transition(staff,id,'check-out',requestB)).passDeductionStatus,'COMPLETED');
 assert.equal(f.docs.get(id).events.length,2);
 assert.equal(f.workbook.history.length,2);
 assert.equal(f.workbook.stats().deductCalls,1);
});

test('already manually deducted shows completed using the original audit and remaining count',async()=>{
 const f=passFixture({checkedIn:true});
 f.workbook.runtime.mdDeductPass({bookingId:id,passId:f.passId,operator:'신송이'});
 const snapshot=f.workbook.snapshot();
 assert.equal((await f.checkIn()).passDeductionStatus,'COMPLETED');
 assert.equal(f.workbook.snapshot(),snapshot);
 assert.equal(f.workbook.history.length,2);
 assert.equal(f.pass[7],7);
});

test('conflicting manual deduction on a different pass blocks automatic and alternate manual deductions',async()=>{
 const f=passFixture({checkedIn:true});
 const other=f.workbook.seed('RSV-OTHER');
 f.booking[4]=other.passId;
 f.workbook.runtime.mdDeductPass({bookingId:id,passId:other.passId,operator:'신송이'});
 f.booking[4]=f.passId;
 f.booking[9]='미차감';
 const snapshot=f.workbook.snapshot();
 assert.equal((await f.checkIn()).passDeductionStatus,'NEEDS_REVIEW');
 assert.throws(()=>f.workbook.runtime.mdDeductPass({bookingId:id,passId:f.passId,operator:'신송이'}),/다른 이용권의 변동이력/);
 assert.equal(f.workbook.snapshot(),snapshot);
});

for(const [label,options,modify,expected] of [
 ['zero uses',{remaining:0},f=>{
  for(let i=0;i<8;i++)f.workbook.history.push(['HIST-PREV-'+i,f.workbook.clock(),'차감',f.passId,'RSV-PAST-'+i,-1,8-i,7-i,'fixture','']);
 },/PASS_NO_REMAINING/],
 ['before starts',{start:'2026-11-25'},()=>{},/PASS_BEFORE_START/],
 ['expired',{expiry:'2026-11-23'},()=>{},/PASS_AFTER_EXPIRY/],
 ['another dog',{},f=>{f.pass[1]='DOG-OTHER';},/PASS_DOG_MISMATCH/],
 ['changed date',{date:'2026-11-23'},()=>{},/PASS_BOOKING_ATTENDANCE_MISMATCH/],
 ['cancelled reservation',{},f=>{f.booking[5]='예약취소';},/PASS_BOOKING_ATTENDANCE_MISMATCH/],
 ['invalid Sheets attendance',{},f=>{f.booking[8]='등원 중';},/PASS_BOOKING_ATTENDANCE_MISMATCH/],
 ['unknown product',{product:''},()=>{},/PASS_PRODUCT_UNCONFIRMED/],
 ['unsupported recurring count',{},f=>{f.pass[5]=9;f.pass[7]=9;},/PASS_RECURRING_COUNT_UNCONFIRMED/],
 ['missing balance provenance',{remaining:7},()=>{},/PASS_BALANCE_MISMATCH/],
 ['mismatched booking flag',{},f=>{f.booking[9]='차감';},/PASS_DEDUCTION_FLAG_MISMATCH/]
]){
 test('attendance survives a rejected ledger validation: '+label,async()=>{
  const f=passFixture(options);
  modify(f);
  const snapshot=f.workbook.snapshot();
  assert.equal((await f.checkIn(requestA)).passDeductionStatus,'NEEDS_REVIEW');
  const doc=f.docs.get(id);
  assert.equal(doc.state,'등원 중');
  assert.equal(doc.passDeduction.status,'NEEDS_REVIEW');
  assert.equal(f.workbook.snapshot(),snapshot);
  assert.throws(()=>f.workbook.runtime.mdAttendancePass_('deduct',{key:'local-sheets:'+id,event:doc.events[0]}),expected);
 });
}

test('day pass and unlinked booking are excluded without affecting the ledger',async()=>{
 for(const options of [{product:'DAILY'},{linked:false}]){
  const f=passFixture(options);
  const snapshot=f.workbook.snapshot();
  assert.equal((await f.checkIn()).passDeductionStatus,'NOT_REQUIRED');
  assert.equal((await f.open().get(staff,id)).passDeductionStatus,'NOT_REQUIRED');
  assert.equal(f.workbook.snapshot(),snapshot);
 }
});

test('unconfirmed claim and lost attendance acknowledgement do not dispatch deductions',async()=>{
 for(const lostOperation of ['claimPassDeduction','commitTransition']){
  const f=passFixture();
  const service=f.open({...f.store,[lostOperation]:async args=>{
   await f.store[lostOperation](args);
   throw Error('Fixture acknowledgement lost');
  }});
  if(lostOperation==='commitTransition')await assert.rejects(service.transition(staff,id,'check-in',requestA),{code:'ATTENDANCE_OUTCOME_UNKNOWN'});
  else assert.equal((await service.transition(staff,id,'check-in',requestA)).passDeductionStatus,'NEEDS_REVIEW');
  assert.equal((await f.open().transition(staff,id,'check-in',requestA)).passDeductionStatus,'NEEDS_REVIEW');
  assert.equal(f.workbook.stats().deductCalls,0);
  assert.equal(f.docs.get(id).events.length,1);
 }
});

for(const [fault,readback,balance,entries] of [
 ['reject','NEEDS_REVIEW',8,1],['partial','NEEDS_REVIEW',8,2],['lost','COMPLETED',7,2]
]){
 test('failure reconciliation is read-only across recreated services: '+fault,async()=>{
  const f=passFixture();
  f.workbook.faults.set(id,fault);
  assert.equal((await f.checkIn(requestA)).passDeductionStatus,'NEEDS_REVIEW');
  const snapshot=f.workbook.snapshot();
  assert.equal((await f.open().get(staff,id)).passDeductionStatus,readback);
  assert.equal((await f.open().transition(staff,id,'check-in',requestA)).passDeductionStatus,readback);
  assert.equal(f.workbook.stats().deductCalls,1);
  assert.equal(f.docs.get(id).events.length,1);
  assert.equal(f.pass[7],balance);
  assert.equal(f.workbook.history.length,entries);
  assert.equal(f.workbook.snapshot(),snapshot);
 });
}

test('correction requires verified administrator and reason and cannot trigger another automatic deduction',async()=>{
 const f=passFixture();
 await f.checkIn(requestA);
 const input={bookingId:id,passId:f.passId,operator:'신송이',reason:'출석 이후 정정'};
 const snapshot=f.workbook.snapshot();
 assert.throws(()=>f.workbook.runtime.mdRestorePass({...input,role:'admin',approved:true}),/관리자 권한/);
 assert.equal(f.workbook.snapshot(),snapshot);
 f.workbook.authorizeAdmin();
 assert.throws(()=>f.workbook.runtime.mdRestorePass({...input,reason:''}),/사유/);
 f.workbook.runtime.mdRestorePass(input);
 assert.equal(f.pass[7],8);
 assert.equal(f.workbook.history.at(-1)[8],'PASS-ADMIN-FIXTURE');
 assert.equal(f.workbook.history.at(-1)[9],input.reason);
 assert.equal((await f.open().get(staff,id)).passDeductionStatus,'NEEDS_REVIEW');
 assert.equal((await f.open().transition(staff,id,'check-in',requestA)).passDeductionStatus,'NEEDS_REVIEW');
 const event=f.docs.get(id).events[0];
 assert.equal((await f.workbook.ledger.deduct({key:'local-sheets:'+id,event})).status,'NEEDS_REVIEW');
 f.booking[6]=f.workbook.clock();f.booking[8]='등원 중';
 assert.throws(()=>f.workbook.runtime.mdDeductPass(input),/다시 차감할 수 없습니다/);
 assert.equal(f.workbook.history.length,3);
 assert.equal(f.pass[7],8);
});

test('a partial automatic write blocks a later manual deduction on the same pass',async()=>{
 const f=passFixture();
 f.workbook.faults.set(id,'partial');
 assert.equal((await f.checkIn()).passDeductionStatus,'NEEDS_REVIEW');
 const {booking}=f.workbook.seed('RSV-OTHER',{checkedIn:true});
 booking[4]=f.passId;
 const before=f.workbook.snapshot();
 assert.throws(()=>f.workbook.runtime.mdDeductPass({bookingId:booking[0],passId:f.passId,operator:'신송이'}),/PASS_BALANCE_MISMATCH/);
 assert.equal(f.workbook.snapshot(),before);
});

test('readback rejects an automatic audit that refers to another attendance event',async()=>{
 const f=passFixture();
 await f.checkIn(requestA);
 f.workbook.history.at(-1)[9]='local-sheets:'+id+' '+attendanceRequestEventId(requestB);
 const before=f.workbook.snapshot();
 assert.equal((await f.open().get(staff,id)).passDeductionStatus,'NEEDS_REVIEW');
 assert.equal(f.workbook.snapshot(),before);
 assert.equal(f.workbook.stats().deductCalls,1);
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
