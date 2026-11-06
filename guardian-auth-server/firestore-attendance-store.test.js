'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {createStaffAttendanceService}=require('./staff-attendance');
const projectId='mungtheland-guardian-test',id='RSV-TEST-001';
const staff={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
const bookingRepository={findById:async key=>key===id?{bookingId:key,status:'예약'}:null};
function fakeDb(){
 const docs=new Map();let queue=Promise.resolve();
 const db={projectId,collection:()=>({doc:key=>({id:key,get:async()=>snapshot(key)})})};
 const snapshot=key=>({exists:docs.has(key),data:()=>structuredClone(docs.get(key))});
 db.runTransaction=fn=>{
  const run=async()=>{
   const writes=[];
   const tx={get:async ref=>snapshot(ref.id),set:(ref,value)=>writes.push([ref.id,structuredClone(value)])};
   const result=await fn(tx);
   for(const [key,value] of writes)docs.set(key,value);
   return result;
  };
  const next=queue.then(run);queue=next.catch(()=>{});return next;
 };
 return {db,docs};
}
function service(db){
 return createStaffAttendanceService({bookingRepository,store:createFirestoreAttendanceStore({db,projectId}),clock:()=>new Date('2026-11-06T02:00:00Z')});
}
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
