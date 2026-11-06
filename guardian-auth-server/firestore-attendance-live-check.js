'use strict';
// Explicit opt-in live integration test. Writes only a new random document in the isolated test collection.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {createStaffAttendanceService}=require('./staff-attendance');
const PROJECT='mungtheland-guardian-test';
async function main(){
 if(process.env.MD_RUN_LIVE_ATTENDANCE_TEST!=='YES'||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT)
  throw Error('Live test requires MD_RUN_LIVE_ATTENDANCE_TEST=YES and GOOGLE_CLOUD_PROJECT='+PROJECT);
 if(process.env.FIRESTORE_EMULATOR_HOST)throw Error('Firestore emulator is not allowed for live test');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'attendance-live-'+randomUUID());
 try{
  const db=getFirestore(app);
  const store=createFirestoreAttendanceStore({db,projectId:PROJECT});
  const bookingId='RSV-CONC-'+randomUUID().replace(/-/g,'').toUpperCase();
  const principal={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
  const bookingRepository={findById:async id=>id===bookingId?{bookingId:id,status:'예약'}:null};
  const makeService=()=>createStaffAttendanceService({bookingRepository,store});
  console.log('[live-attendance] project='+PROJECT+' collection=attendance_test_v1 booking='+bookingId);
  assert.equal((await makeService().get(principal,bookingId)).state,'예약');
  await assert.rejects(makeService().transition(principal,bookingId,'check-out'),/Invalid transition/);
  async function race(action,expectedState,expectedEvents){
   const result=await Promise.allSettled([
    makeService().transition(principal,bookingId,action),
    makeService().transition(principal,bookingId,action)
   ]);
   const successes=result.filter(x=>x.status==='fulfilled');
   const failures=result.filter(x=>x.status==='rejected');
   assert.equal(successes.length,1,action+': expected exactly one success');
   assert.equal(failures.length,1,action+': expected exactly one rejection');
   assert.match(String(failures[0].reason?.message),/Invalid transition/);
   const events=await store.read(bookingId);
   assert.equal(events.length,expectedEvents);
   assert.equal((await makeService().get(principal,bookingId)).state,expectedState);
   console.log('[live-attendance] '+action+' one success / one rejected / '+events.length+' stored event(s)');
  }
  await race('check-in','등원 중',1);
  await race('check-out','하원 완료',2);
  await assert.rejects(makeService().transition(principal,bookingId,'check-in'),/Invalid transition/);
  await assert.rejects(makeService().transition(principal,bookingId,'check-out'),/Invalid transition/);
  const doc=await db.collection('attendance_test_v1').doc(bookingId).get();
  assert.equal(doc.data()?.state,'하원 완료');
  assert.deepEqual(doc.data()?.events.map(x=>x.action),['check-in','check-out']);
  console.log('[live-attendance] PASS: atomic concurrency, ordering, persistence; audit document retained');
 }finally{await deleteApp(app);}
}
main().catch(err=>{console.error('[live-attendance] FAIL:',err.code||err.name||'Error',String(err.message||'').slice(0,250));process.exitCode=1;});
