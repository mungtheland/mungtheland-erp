'use strict';
// One-time test-only Firestore pass initialization. Never overwrites a document.
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const PROJECT='mungtheland-guardian-test';
const BOOKING='RSV-TEST-PARITY-002',PASS='PASS-TEST-PARITY-002';
async function initialize(db){
 const attendance=db.collection('attendance_test_v1').doc(BOOKING);
 const pass=db.collection('pass_ledger_test_v1').doc(PASS);
 const consumption=db.collection('pass_consumptions_test_v1').doc(BOOKING);
 const binding=db.collection('pass_reconciliation_bindings_test_v1').doc(BOOKING);
 return db.runTransaction(async tx=>{
  const [a,p,c,b]=await Promise.all([tx.get(attendance),tx.get(pass),tx.get(consumption),tx.get(binding)]);
  if(a.exists||c.exists||b.exists)throw Error('ABORT: attendance, consumption, or binding already exists');
  if(p.exists){
   const v=p.data();
   if(v.total===8&&v.remaining===8&&v.customerId==='CUS-TEST-001')return {result:'ALREADY_INITIALIZED',bookingId:BOOKING,passId:PASS,total:8,remaining:8,writesPerformed:0};
   throw Error('ABORT: existing pass differs from expected test initialization');
  }
  tx.create(pass,{total:8,remaining:8,customerId:'CUS-TEST-001',createdBy:'isolated-parity-pass-init'});
  return {result:'CREATED',bookingId:BOOKING,passId:PASS,total:8,remaining:8,writesPerformed:1};
 });
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.MD_RUN_PARITY_PASS_INIT!=='YES'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit isolated pass initialization opt-in required');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'isolated-parity-pass-init');
 try{console.log(JSON.stringify({project:PROJECT,...await initialize(getFirestore(app))},null,2));}
 finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[pass-init] FAIL:',e.message);process.exitCode=1;});
module.exports={initialize};
