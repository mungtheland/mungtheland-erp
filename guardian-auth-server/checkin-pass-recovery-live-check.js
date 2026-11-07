'use strict';
// Explicit opt-in isolated Firestore integration: genuine check-in, injected
// single pass failure, then recovery against real transactional pass ledger.
// Uses new random synthetic documents only; never touches Sheets or production.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {createIsolatedPassLedger}=require('./firestore-pass-ledger');
const {createCheckInPassCoordinator}=require('./checkin-pass-coordinator');
const PROJECT='mungtheland-guardian-test';
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.MD_RUN_LIVE_PASS_TEST!=='YES'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit isolated real Firestore opt-in required');
 const suffix=randomUUID().replace(/-/g,'').toUpperCase();
 const bookingId='RSV-TEST-RECOVERY-'+suffix,passId='PASS-TEST-RECOVERY-'+suffix,customerId='CUS-TEST-RECOVERY';
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'recovery-'+suffix);
 try{
  const db=getFirestore(app);
  if(db.projectId!==PROJECT)throw Error('Wrong Firestore project');
  const passRef=db.collection('pass_ledger_test_v1').doc(passId);
  const attendanceRef=db.collection('attendance_test_v1').doc(bookingId);
  const consumptionRef=db.collection('pass_consumptions_test_v1').doc(bookingId);
  await passRef.create({total:8,remaining:8,customerId,createdBy:'isolated-recovery-check'});
  const bookingRepository={findById:async id=>id===bookingId?{bookingId,status:'예약',customerId}:null};
  const attendance=createStaffAttendanceService({bookingRepository,store:createFirestoreAttendanceStore({db,projectId:PROJECT})});
  const actualLedger=createIsolatedPassLedger({db,projectId:PROJECT});
  let failNext=true;
  const passLedger={consume:async args=>{
   if(failNext){failNext=false;throw Error('Injected transient failure before Firestore transaction');}
   return actualLedger.consume(args);
  }};
  const coordinator=createCheckInPassCoordinator({attendance,passLedger});
  const principal={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
  const args={principal,bookingId,passId,customerId};
  const first=await coordinator.checkInAndConsume(args);
  assert.equal(first.consumptionStatus,'pending-reconciliation');
  assert.equal(first.reconciliationRequired,true);
  assert.equal((await attendanceRef.get()).data()?.events?.length,1);
  assert.equal((await passRef.get()).data()?.remaining,8);
  assert.equal((await consumptionRef.get()).exists,false);
  console.log('[recovery] stage 1 PASS: check-in committed; simulated pass failure; balance 8; pending reconciliation');
  const second=await coordinator.checkInAndConsume(args);
  assert.equal(second.consumptionStatus,'consumed');
  assert.equal(second.remaining,7);
  assert.equal(second.reconciliationRequired,false);
  assert.equal((await attendanceRef.get()).data()?.events?.length,1);
  assert.equal((await consumptionRef.get()).data()?.bookingId,bookingId);
  console.log('[recovery] stage 2 PASS: retry deducted once; balance 7; check-in events still 1');
  const third=await coordinator.checkInAndConsume(args);
  assert.equal(third.consumptionStatus,'already-consumed');
  assert.equal((await passRef.get()).data()?.remaining,7);
  assert.equal((await attendanceRef.get()).data()?.events?.length,1);
  console.log('[recovery] stage 3 PASS: repeat idempotent; balance 7; audit retained');
  console.log('[recovery] PASS project='+PROJECT+' booking='+bookingId+' pass='+passId);
 }finally{await deleteApp(app);}
}
if(require.main===module)main().catch(err=>{console.error('[recovery] FAIL:',String(err.message||err).slice(0,350));process.exitCode=1;});
module.exports={main};
