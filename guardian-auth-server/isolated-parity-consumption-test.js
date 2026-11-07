'use strict';
// Opt-in isolated check-in and idempotent pass consumption test. No Sheets writes.
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {createIsolatedPassLedger}=require('./firestore-pass-ledger');
const PROJECT='mungtheland-guardian-test',BOOKING='RSV-TEST-PARITY-002',PASS='PASS-TEST-PARITY-002',CUSTOMER='CUS-TEST-001';
async function run(db){
 const attendanceRef=db.collection('attendance_test_v1').doc(BOOKING);
 const passRef=db.collection('pass_ledger_test_v1').doc(PASS);
 const consumptionRef=db.collection('pass_consumptions_test_v1').doc(BOOKING);
 const [a,p,c]=await Promise.all([attendanceRef.get(),passRef.get(),consumptionRef.get()]);
 if(a.exists||c.exists)throw Error('ABORT: existing attendance or consumption; no mutation');
 if(!p.exists||p.data().total!==8||p.data().remaining!==8||p.data().customerId!==CUSTOMER)throw Error('ABORT: expected fresh 8-visit test pass not found');
 const store=createFirestoreAttendanceStore({db,projectId:PROJECT});
 const ledger=createIsolatedPassLedger({db,projectId:PROJECT});
 await store.commitTransition({expectedState:'예약',event:{eventId:'EVT-TEST-PARITY-002-IN',bookingId:BOOKING,action:'check-in',staffId:'STAFF-TEST-001',occurredAt:new Date().toISOString()}});
 const first=await ledger.consume({bookingId:BOOKING,passId:PASS,customerId:CUSTOMER});
 const second=await ledger.consume({bookingId:BOOKING,passId:PASS,customerId:CUSTOMER});
 const [afterPass,afterConsumption,afterAttendance]=await Promise.all([passRef.get(),consumptionRef.get(),attendanceRef.get()]);
 const passed=first.consumed===true&&first.remaining===7&&second.alreadyConsumed===true&&second.consumed===false&&afterPass.data()?.remaining===7&&afterConsumption.data()?.passId===PASS&&afterAttendance.data()?.state==='등원 중';
 const result={project:PROJECT,bookingId:BOOKING,passId:PASS,first,second,finalRemaining:afterPass.data()?.remaining,attendanceState:afterAttendance.data()?.state,consumptionExists:afterConsumption.exists,passed,sheetsWrites:0};
 console.log(JSON.stringify(result,null,2));
 if(!passed)throw Error('Verification failed: inspect isolated test state before retrying');
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.MD_RUN_PARITY_CONSUMPTION_TEST!=='YES'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit isolated consumption test opt-in required');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'isolated-parity-consume');
 try{await run(getFirestore(app));}finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[parity-consume] FAIL:',e.message);process.exitCode=1;});
module.exports={run};
