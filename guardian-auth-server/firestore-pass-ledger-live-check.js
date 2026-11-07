'use strict';
// Opt-in live integration: creates NEW isolated test-only documents, never edits ERP/Sheets.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createIsolatedPassLedger}=require('./firestore-pass-ledger');
const PROJECT='mungtheland-guardian-test';
async function main(){
 if(process.env.MD_RUN_LIVE_PASS_TEST!=='YES'||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit opt-in and real isolated Firestore required');
 const suffix=randomUUID().replace(/-/g,'').toUpperCase();
 const passId='PASS-TEST-'+suffix,bookingId='RSV-TEST-PASS-'+suffix,customerId='CUS-TEST-PASS';
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'pass-live-'+suffix);
 try{
  const db=getFirestore(app);
  if(db.projectId!==PROJECT)throw Error('Wrong Firestore project');
  const passRef=db.collection('pass_ledger_test_v1').doc(passId);
  const attendanceRef=db.collection('attendance_test_v1').doc(bookingId);
  const consumptionRef=db.collection('pass_consumptions_test_v1').doc(bookingId);
  // Create only new random test records. create() fails closed if a document exists.
  await passRef.create({total:8,remaining:8,customerId,createdBy:'isolated-pass-live-check'});
  await attendanceRef.create({bookingId,state:'등원 중',events:[{eventId:'EVT-TEST-'+suffix,bookingId,action:'check-in',staffId:'STAFF-TEST-001',at:new Date().toISOString()}],createdBy:'isolated-pass-live-check'});
  const ledger=createIsolatedPassLedger({db,projectId:PROJECT});
  const requests=Array.from({length:12},()=>ledger.consume({passId,bookingId,customerId}));
  const settled=await Promise.allSettled(requests);
  const failures=settled.filter(x=>x.status==='rejected');
  if(failures.length)throw Error('Concurrent transaction failed: '+failures.map(x=>String(x.reason?.message||x.reason)).slice(0,3).join('; '));
  const results=settled.map(x=>x.value);
  assert.equal(results.filter(x=>x.consumed).length,1,'Exactly one actual deduction');
  assert.equal(results.filter(x=>x.alreadyConsumed).length,11,'Eleven idempotent retries');
  const [passSnap,consumptionSnap,attendanceSnap]=await Promise.all([passRef.get(),consumptionRef.get(),attendanceRef.get()]);
  assert.equal(passSnap.data()?.remaining,7);
  assert.equal(consumptionSnap.data()?.bookingId,bookingId);
  assert.equal(consumptionSnap.data()?.passId,passId);
  assert.equal(consumptionSnap.data()?.checkInEventId,'EVT-TEST-'+suffix);
  assert.equal(attendanceSnap.data()?.events?.length,1);
  const retry=await ledger.consume({passId,bookingId,customerId});
  assert.equal(retry.alreadyConsumed,true);
  assert.equal((await passRef.get()).data()?.remaining,7);
  console.log('[pass-live] PASS project='+PROJECT+' booking='+bookingId+' pass='+passId);
  console.log('[pass-live] 12 concurrent requests: 1 deduction, 11 idempotent; remaining 8 -> 7');
  console.log('[pass-live] repeated retry: no additional deduction; audit retained in test collections');
 }finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[pass-live] FAIL:',String(e.message||e).slice(0,400));process.exitCode=1;});
module.exports={main};
