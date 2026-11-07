'use strict';
// Independent Node process; only the parent-selected isolated test booking may be written.
const {randomUUID}=require('node:crypto');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const PROJECT='mungtheland-guardian-test';
async function main(){
 const [bookingId,action,staffId]=process.argv.slice(2);
 if(process.env.MD_RUN_LIVE_ATTENDANCE_TEST!=='YES'||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||
    process.env.FIRESTORE_EMULATOR_HOST||!/^RSV-MPROC-[A-F0-9]{32}$/.test(bookingId||'')||
    !['check-in','check-out'].includes(action)||!/^STAFF-TEST-00[12]$/.test(staffId||'')||
    typeof process.send!=='function')throw Error('Isolated multi-process test guard failed');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'mp-worker-'+randomUUID());
 try{
  const store=createFirestoreAttendanceStore({db:getFirestore(app),projectId:PROJECT});
  process.send({type:'ready'});
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Start signal timeout')),30000);
   process.once('message',msg=>{clearTimeout(timeout);if(msg?.type==='go')resolve();else reject(Error('Unexpected start signal'));});
  });
  try{
   await store.commitTransition({expectedState:action==='check-in'?'예약':'등원 중',event:{
    eventId:randomUUID(),bookingId,action,staffId,at:new Date().toISOString()
   }});
   process.send({type:'result',success:true});
  }catch(err){process.send({type:'result',success:false,error:String(err.message||'').slice(0,180),code:String(err.code||'')});}
 }finally{await deleteApp(app);}
}
main().catch(err=>{if(process.send)process.send({type:'fatal',error:String(err.message||'').slice(0,180)});process.exitCode=1;});
