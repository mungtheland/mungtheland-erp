'use strict';
// Strictly read-only inventory for one isolated booking/pass. No PII or document dump.
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const PROJECT='mungtheland-guardian-test';
const TARGETS={old:{bookingId:'RSV-TEST-001',passId:'PASS-TEST-SHEETS-001'},parity:{bookingId:'RSV-TEST-PARITY-002',passId:'PASS-TEST-PARITY-002'}};
const target=TARGETS[process.argv[2]||'old'];
if(!target)throw Error('Use only old or parity isolated test target');
const {bookingId:BOOKING,passId:PASS}=target;
async function inspect(db){
 const specs=[['attendance','attendance_test_v1',BOOKING],['pass','pass_ledger_test_v1',PASS],['consumption','pass_consumptions_test_v1',BOOKING],['binding','pass_reconciliation_bindings_test_v1',BOOKING]];
 const result={project:PROJECT,bookingId:BOOKING,passId:PASS,readOnly:true,writesPerformed:0,documents:{}};
 for(const [name,collection,id] of specs){
  const snap=await db.collection(collection).doc(id).get();
  if(!snap.exists){result.documents[name]={exists:false};continue;}
  const v=snap.data();
  result.documents[name]={exists:true,
   ...(name==='attendance'?{state:v.state||null,eventCount:Array.isArray(v.events)?v.events.length:null}:{}),
   ...(name==='pass'?{total:v.total,remaining:v.remaining,hasCustomerId:typeof v.customerId==='string'}:{}),
   ...(name==='consumption'?{bookingIdMatches:v.bookingId===BOOKING,passIdMatches:v.passId===PASS}:{}),
   ...(name==='binding'?{bookingIdMatches:v.bookingId===BOOKING,passIdMatches:v.passId===PASS}:{})};
 }
 return result;
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.MD_RUN_READONLY_FIRESTORE_AUDIT!=='YES'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit isolated Firestore read-only opt-in required');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'pass-readonly-inventory');
 try{console.log(JSON.stringify(await inspect(getFirestore(app)),null,2));}
 finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[firestore-audit] FAIL:',e.message);process.exitCode=1;});
module.exports={inspect};
