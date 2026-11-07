'use strict';
// Live integration: two separate Node processes race against one isolated Firestore document.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fork}=require('node:child_process');
const path=require('node:path');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const PROJECT='mungtheland-guardian-test';
function worker(bookingId,action,staffId){
 const child=fork(path.join(__dirname,'firestore-attendance-multiprocess-worker.js'),[bookingId,action,staffId],{stdio:['ignore','ignore','pipe','ipc']});
 let settled=false,ready=false;let resolveReady,rejectReady,resolveResult,rejectResult;
 const readyPromise=new Promise((res,rej)=>{resolveReady=res;rejectReady=rej;});
 const resultPromise=new Promise((res,rej)=>{resolveResult=res;rejectResult=rej;});
 const timer=setTimeout(()=>fail(Error('Worker timeout')),60000);
 function fail(err){if(settled)return;settled=true;clearTimeout(timer);child.kill();rejectReady(err);rejectResult(err);}
 child.stderr.on('data',()=>{}); // No credential or diagnostic content is echoed.
 child.on('error',fail);child.on('exit',code=>{if(!settled)fail(Error('Worker exited unexpectedly: '+code));});
 child.on('message',msg=>{
  if(msg?.type==='ready'){ready=true;resolveReady();}
  else if(msg?.type==='result'){settled=true;clearTimeout(timer);resolveResult(msg);}
  else if(msg?.type==='fatal')fail(Error('Worker failed: '+msg.error));
 });
 return {ready:readyPromise,result:resultPromise,go:()=>{if(!ready)throw Error('Worker not ready');child.send({type:'go'});},stop:()=>child.kill()};
}
async function main(){
 if(process.env.MD_RUN_LIVE_ATTENDANCE_TEST!=='YES'||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.FIRESTORE_EMULATOR_HOST)
  throw Error('Requires explicit opt-in, isolated project, and real Firestore');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'mp-parent-'+randomUUID());
 const bookingId='RSV-MPROC-'+randomUUID().replace(/-/g,'').toUpperCase();
 console.log('[multiprocess] isolated project='+PROJECT+' collection=attendance_test_v1 booking='+bookingId);
 try{
  const store=createFirestoreAttendanceStore({db:getFirestore(app),projectId:PROJECT});
  assert.equal((await store.read(bookingId)).length,0);
  async function race(action,expectedLength,expectedState){
   const workers=[worker(bookingId,action,'STAFF-TEST-001'),worker(bookingId,action,'STAFF-TEST-002')];
   try{
    await Promise.all(workers.map(w=>w.ready));
    workers.forEach(w=>w.go());
    const results=await Promise.all(workers.map(w=>w.result));
    assert.equal(results.filter(r=>r.success).length,1,action+': exactly one worker must commit');
    assert.equal(results.filter(r=>!r.success).length,1,action+': exactly one worker must reject');
    const doc=await getFirestore(app).collection('attendance_test_v1').doc(bookingId).get();
    assert.equal(doc.data()?.state,expectedState);
    assert.equal(doc.data()?.events.length,expectedLength);
    assert.deepEqual(doc.data()?.events.map(e=>e.action),expectedLength===1?['check-in']:['check-in','check-out']);
    console.log('[multiprocess] '+action+' PASS: 1 committed, 1 rejected, events='+expectedLength);
   }finally{workers.forEach(w=>w.stop());}
  }
  await race('check-in',1,'등원 중');
  await race('check-out',2,'하원 완료');
  console.log('[multiprocess] PASS: independent processes; final state 하원 완료; audit document retained');
 }finally{await deleteApp(app);}
}
main().catch(err=>{console.error('[multiprocess] FAIL:',String(err.message||err).slice(0,250));process.exitCode=1;});
