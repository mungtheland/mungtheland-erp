'use strict';

const assert=require('node:assert/strict');
const {fork,spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {mkdtemp,rm,stat}=require('node:fs/promises');
const net=require('node:net');
const {tmpdir}=require('node:os');
const {join,resolve,dirname}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const test=require('node:test');
const {createFirestoreAttendanceStore,createEmulatorAttendanceStore,EMULATOR_PROJECT,EMULATOR_HOST}=require('./firestore-attendance-store');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const {runEmulatorProbe}=require('./firestore-attendance-write-probe');
const {runEmulatorResidueCheck}=require('./firestore-attendance-residue-check');

const [host,portText]=EMULATOR_HOST.split(':');
const port=Number(portText);
const staff=[1,2].map(n=>({role:'staff',status:'active',staffId:'STAFF-EMU-'+n}));
const bookingRepository={findById:async bookingId=>/^RSV-EMU-[A-F0-9]{32}$/.test(bookingId)?{bookingId,status:'예약'}:null};
const bookingId=()=> 'RSV-EMU-'+randomUUID().replaceAll('-','').toUpperCase();
const childEnvironment=Object.fromEntries(['SystemRoot','SYSTEMROOT','WINDIR','PATH','TEMP','TMP','TMPDIR']
 .filter(name=>process.env[name]).map(name=>[name,process.env[name]]));

function guardNetwork(){
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){
  const [target,targetHost]=Array.isArray(args[0])?args[0]:args;
  const options=typeof target==='object'&&target!==null?target:{port:target,host:targetHost};
  assert.ok(options.host===host&&Number(options.port)===port&&!options.path,'Blocked non-emulator network connection');
  return connect.apply(this,args);
 };
 return ()=>{net.Socket.prototype.connect=connect;};
}

function emulatorClient(){
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,EMULATOR_HOST,'Expected dedicated loopback emulator');
 const {initializeApp,deleteApp}=require('firebase-admin/app');
 const {getFirestore}=require('firebase-admin/firestore');
 const app=initializeApp({projectId:EMULATOR_PROJECT},'attendance-'+randomUUID());
 const db=getFirestore(app);
 // The store verifies the Admin client's resolved host, port and insecure transport before RPCs.
 const store=createEmulatorAttendanceStore(db);
 return {db,store,close:async()=>{await db.terminate();await deleteApp(app);}};
}

function makeService(store,at='2026-11-24T03:00:00Z'){
 return createStaffAttendanceService({bookingRepository,store,clock:()=>new Date(at)});
}

async function runWorker(){
 assert.equal(typeof process.send,'function','Expect an isolated harness worker');
 guardNetwork();
 const client=emulatorClient();
 try{
  const [operation,id,actor,action,requestId,wait]=process.argv.slice(3);
  assert.match(id,/^RSV-EMU-[A-F0-9]{32}$/);
  assert.ok(staff[actor]&&['read','write'].includes(operation));
  const transaction=client.store.commitTransition;
  const store={...client.store,async commitTransition(args){
   if(wait==='barrier'){
    const release=new Promise(resolve=>process.once('message',resolve));
    process.send({type:'ready'});
    assert.equal(await release,'release');
   }
   return transaction(args);
  }};
  const service=makeService(store);
  const result=operation==='read'?await service.get(staff[actor],id):
   await service.transition(staff[actor],id,action,requestId);
  process.send({type:'result',state:result.state});
 }catch(error){
  process.send({type:'result',error:error.code||error.message});
 }finally{await client.close();}
}

function worker(t,operation,id,actor,action='',requestId='',barrier=''){
 const child=fork(__filename,['worker',operation,id,String(actor),action,requestId,barrier],{
  env:{...childEnvironment,FIRESTORE_EMULATOR_HOST:EMULATOR_HOST},execArgv:[],windowsHide:true,
  stdio:['ignore','ignore','ignore','ipc']
 });
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});
 let markReady,reply,settled=false;
 const ready=new Promise(resolve=>{markReady=resolve;});
 const result=new Promise(resolve=>{reply=resolve;});
 const finish=value=>{settled=true;markReady(false);reply(value);};
 child.on('message',message=>{
  if(message.type==='ready')markReady(true);
  else if(message.type==='result')finish(message);
 });
 child.once('error',()=>finish({error:'worker launch failed'}));
 child.once('exit',()=>{if(!settled)finish({error:'worker exited before result'});});
 return {ready,result,pid:child.pid,release:()=>child.send('release')};
}

async function startEmulator(java,jar,directory,seed){
 // Refuse to run against an already listening process, even on the dedicated port.
 const probe=net.createServer();
 await new Promise((resolve,reject)=>{
  probe.once('error',reject);probe.listen({host,port,exclusive:true},resolve);
 });
 await new Promise(resolve=>probe.close(resolve));
 const process=spawn(java,[
  '-Djava.net.useSystemProxies=false','-Dhttp.proxyHost=127.0.0.1','-Dhttp.proxyPort=9',
  '-Dhttps.proxyHost=127.0.0.1','-Dhttps.proxyPort=9','-Dhttp.nonProxyHosts=127.0.0.1',
  '-jar',jar,'--host',host,'--port',portText,'--project_id',EMULATOR_PROJECT,
  '--single_project_mode','--single_project_mode_error',...(seed?['--seed_from_export',seed]:[])
 ],{cwd:directory,env:childEnvironment,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let log='',launchError;
 const collect=chunk=>{log=(log+chunk.toString()).slice(-16000);};
 process.stdout.on('data',collect);process.stderr.on('data',collect);
 process.once('error',error=>{launchError=error;});
 const closed=new Promise(resolve=>process.once('close',resolve));
 const stop=async()=>{if(process.exitCode===null&&process.signalCode===null)process.kill();await closed;};
 try{
  for(let attempt=0;attempt<150;attempt++){
   if(launchError||process.exitCode!==null)throw Error('Local emulator startup failed: '+(launchError?.code||log.trim().split(/\r?\n/).at(-1)));
   if(log.includes('Dev App Server is now running')&&log.includes(EMULATOR_HOST))return {stop,pid:process.pid};
   await delay(100);
  }
  throw Error('Local emulator did not publish its loopback endpoint');
 }catch(error){await stop();throw error;}
}

function postAttendance(handler,id,requestId,discardResponse=false){
 let responseStatus,body;
 return handler({
  url:'/api/staff/bookings/'+id+'/attendance/check-in',method:'POST',
  headers:{authorization:'Bearer fixture','x-attendance-request-id':requestId}
 },{
  writeHead(status){responseStatus=status;},
  end(response){if(!discardResponse)body=JSON.parse(response);}
 }).then(()=>({status:responseStatus,body}));
}

if(require.main===module&&process.argv[2]==='worker'){
 runWorker().catch(()=>{process.exitCode=1;}).finally(()=>process.disconnect());
}else if(require.main===module){
 test('isolated Firestore Admin SDK attendance integration',{timeout:120000},async t=>{
  const java=process.env.ERP_FIRESTORE_JAVA, jar=process.env.ERP_FIRESTORE_EMULATOR_JAR;
  assert.ok(java&&jar,'Provide paths to local Java and the verified Firestore emulator JAR');
  assert.ok((await stat(java)).isFile()&&(await stat(jar)).isFile());
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST===EMULATOR_HOST);
  const work=await mkdtemp(join(tmpdir(),'erp-attendance-emulator-'));
  const restoreNetwork=guardNetwork();
  let emulator,client;
  t.after(async()=>{
   try{await client?.close();}
   finally{
    try{await emulator?.stop();}
    finally{
     restoreNetwork();
     if(dirname(resolve(work))===resolve(tmpdir()))await rm(work,{recursive:true,force:true,maxRetries:4,retryDelay:100});
    }
   }
  });
  assert.throws(()=>net.connect({host:'firestore.googleapis.com',port:443}),/Blocked non-emulator/);
  const {initializeApp,deleteApp}=require('firebase-admin/app');
  const {getFirestore}=require('firebase-admin/firestore');
  // A projects-only client without this explicit loopback binding cannot enter the adapter.
  const unsafe=initializeApp({projectId:EMULATOR_PROJECT},'binding-negative');
  const savedHost=process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try{assert.throws(()=>createEmulatorAttendanceStore(getFirestore(unsafe)),/Isolated attendance emulator only/);}
  finally{
   await deleteApp(unsafe);
   if(savedHost)process.env.FIRESTORE_EMULATOR_HOST=savedHost;
  }
  process.env.FIRESTORE_EMULATOR_HOST=EMULATOR_HOST;
  emulator=await startEmulator(resolve(java),resolve(jar),work);
  client=emulatorClient();
  assert.throws(()=>createFirestoreAttendanceStore({db:client.db,projectId:EMULATOR_PROJECT}),/Test Firestore project only/);
  const service=()=>makeService(client.store);
  const persistedId=bookingId();

  await t.test('checkout before check-in is rejected; check-in and checkout persist',async()=>{
   const id=persistedId;
   await assert.rejects(service().transition(staff[0],id,'check-out'),/Invalid transition/);
   assert.deepEqual(await client.store.read(id),[]);
   assert.equal((await service().transition(staff[0],id,'check-in',randomUUID())).state,'등원 중');
   assert.equal((await service().transition(staff[1],id,'check-out',randomUUID())).state,'하원 완료');
   assert.deepEqual((await client.store.read(id)).map(event=>event.action),['check-in','check-out']);
  });
  await t.test('same request replays; a different request conflicts',async()=>{
   const id=bookingId(),requestId=randomUUID();
   const saved=await service().transition(staff[0],id,'check-in',requestId);
   assert.deepEqual(await service().transition(staff[0],id,'check-in',requestId),saved);
   await assert.rejects(service().transition(staff[0],id,'check-in',randomUUID()),/Invalid transition/);
   assert.equal((await client.store.read(id)).length,1);
  });
  await t.test('discarded POST response and same-ID replay retain one event',async()=>{
   const id=bookingId(),requestId=randomUUID();
   const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>staff[0],staffAttendance:service()});
   assert.deepEqual(await postAttendance(handler,id,requestId,true),{status:200,body:undefined});
   assert.equal((await service().get(staff[0],id)).state,'등원 중');
   const replay=await postAttendance(handler,id,requestId);
   assert.equal(replay.status,200);
   assert.equal(replay.body.attendance.state,'등원 중');
   assert.equal((await client.store.read(id)).length,1);
  });
  await t.test('independent Node workers restore existing state from the running emulator',async()=>{
   const reader=worker(t,'read',persistedId,0);
   assert.notEqual(reader.pid,process.pid);
   assert.equal((await reader.result).state,'하원 완료');
  });
  await t.test('same-process staff contention commits exactly one event',async()=>{
   const id=bookingId();
   const results=await Promise.allSettled(staff.map(actor=>service().transition(actor,id,'check-in',randomUUID())));
   assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
   assert.match(results.find(result=>result.status==='rejected').reason.message,/Invalid transition/);
   assert.equal((await client.store.read(id)).length,1);
  });
  await t.test('independent transactions race with distinct requests for both actions',async()=>{
   const id=bookingId();
   for(const action of ['check-in','check-out']){
    const children=staff.map((_,i)=>worker(t,'write',id,i,action,randomUUID(),'barrier'));
    assert.notEqual(children[0].pid,children[1].pid);
    assert.deepEqual(await Promise.all(children.map(child=>child.ready)),[true,true]);
    children.forEach(child=>child.release());
    const results=await Promise.all(children.map(child=>child.result));
    assert.equal(results.filter(result=>result.state===(action==='check-in'?'등원 중':'하원 완료')).length,1);
    assert.equal(results.filter(result=>result.error==='ATTENDANCE_STATE_CONFLICT').length,1);
    assert.equal((await client.store.read(id)).length,action==='check-in'?1:2);
   }
  });
  await t.test('independent workers retry the same request and retain one event',async()=>{
   const id=bookingId(),requestId=randomUUID();
   const children=[0,0].map(i=>worker(t,'write',id,i,'check-in',requestId,'barrier'));
   assert.deepEqual(await Promise.all(children.map(child=>child.ready)),[true,true]);
   children.forEach(child=>child.release());
   assert.deepEqual((await Promise.all(children.map(child=>child.result))).map(result=>result.state),['등원 중','등원 중']);
   assert.equal((await client.store.read(id)).length,1);
  });
  await t.test('malformed documents and events block reads and writes without alteration',async()=>{
   for(const missingId of [false,true]){
    const id=bookingId();
    const reference=client.db.collection('attendance_test_v1').doc(id);
    const event={bookingId:id,eventId:'EVT-FIXTURE',staffId:staff[0].staffId,action:'check-in',at:'invalid'};
    const original={state:'등원 중',events:[event],...(missingId?{}:{bookingId:id})};
    await reference.create(original);
    const code=missingId?'INVALID_ATTENDANCE_DOCUMENT':'INVALID_ATTENDANCE_HISTORY';
    await assert.rejects(service().get(staff[0],id),{code});
    await assert.rejects(service().transition(staff[0],id,'check-out',randomUUID()),{code});
    assert.deepEqual((await reference.get()).data(),original);
   }
  });
  await t.test('earlier server clock rejects checkout without changing check-in',async()=>{
   const id=bookingId();
   await makeService(client.store,'2026-11-24T03:00:00Z').transition(staff[0],id,'check-in');
   const original=await client.store.read(id);
   await assert.rejects(makeService(client.store,'2026-11-24T02:59:59Z').transition(staff[1],id,'check-out'),{code:'ATTENDANCE_CLOCK_ROLLBACK'});
   assert.deepEqual(await client.store.read(id),original);
  });
  await t.test('isolated REST probe creates, verifies and conditionally deletes one document',async()=>{
   let addedId;
   const result=await runEmulatorProbe({env:process.env,fetchRequest:async(raw,options)=>{
    const response=await fetch(raw,options);
    if(options.method==='POST'&&new URL(raw).searchParams.has('documentId')&&response.ok){
     addedId=new URL(raw).searchParams.get('documentId');
     const history=await client.store.read(addedId);
     assert.equal(history.length,1);
     assert.equal(history[0].action,'check-in');
    }
    return response;
   }});
   assert.match(addedId,/^RSV-PROBE-[A-F0-9]{32}$/);
   assert.deepEqual(result,{status:'passed',documentId:addedId,cleanup:'confirmed'});
   assert.equal((await client.db.collection('attendance_test_v1').doc(addedId).get()).exists,false);
  });
  await t.test('probe refuses an existing fixture without changing it',async()=>{
   const runId=randomUUID();
   const id='RSV-PROBE-'+runId.replaceAll('-','').toUpperCase();
   const reference=client.db.collection('attendance_test_v1').doc(id);
   const original={fixture:'already here'};
   await reference.create(original);
   const result=await runEmulatorProbe({env:process.env,runId});
   assert.deepEqual(result,{status:'failed',phase:'absence',http:200});
   assert.deepEqual((await reference.get()).data(),original);
  });
  await t.test('Firestore refuses cleanup if the probe document changes before DELETE',async()=>{
   const runId=randomUUID();
   const id='RSV-PROBE-'+runId.replaceAll('-','').toUpperCase();
   const reference=client.db.collection('attendance_test_v1').doc(id);
   const result=await runEmulatorProbe({env:process.env,runId,fetchRequest:async(raw,options)=>{
    if(new URL(raw).pathname.endsWith(':commit'))await reference.update({fixture:'changed before delete'});
    return fetch(raw,options);
   }});
   assert.equal(result.phase,'delete');
   assert.equal(result.cleanup,'unconfirmed');
   assert.ok(result.createdUpdateTime);
   assert.equal((await reference.get()).data().fixture,'changed before delete');
  });
  await t.test('lost create response leaves a candidate but no complete ownership evidence',async()=>{
   let attempt;
   const result=await runEmulatorProbe({env:process.env,onCreateAttempt:(...values)=>{attempt=values;},
    fetchRequest:async(raw,options)=>{
     const response=await fetch(raw,options);
     if(options.method==='POST'){
      assert.ok(response.ok);
      await response.arrayBuffer();
      throw Error('Emulated create response loss');
     }
     return response;
    }});
   assert.equal(result.phase,'create');
   assert.equal(result.createdUpdateTime,undefined);
   assert.deepEqual(await runEmulatorResidueCheck({env:process.env,args:['--inspect',...attempt]}),{
    status:'present',documentId:attempt[0],fixtureMatches:true,fingerprintMatches:true,versionMatches:null,evidenceMatches:false
   });
  });
  await t.test('read-only inspection confirms absence after a lost cleanup response',async()=>{
   let confirmed;
   const result=await runEmulatorProbe({env:process.env,onCreateConfirmed:(...values)=>{confirmed=values;},
    fetchRequest:async(raw,options)=>{
     const response=await fetch(raw,options);
     if(new URL(raw).pathname.endsWith(':commit')){
      assert.ok(response.ok);
      await response.arrayBuffer();
      throw Error('Emulated cleanup response loss');
     }
     return response;
    }});
   assert.equal(result.phase,'delete');
   assert.equal(result.cleanup,'unconfirmed');
   assert.deepEqual(await runEmulatorResidueCheck({env:process.env,args:['--inspect',...confirmed]}),{
    status:'absent',documentId:confirmed[0]
   });
  });
  await t.test('plain emulator restart resets data; importing a snapshot restores it',async()=>{
   const original=await client.store.read(persistedId);
   assert.equal(original.length,2);
   const response=await fetch('http://'+EMULATOR_HOST+'/emulator/v1/projects/'+EMULATOR_PROJECT+':export',{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),redirect:'error',
    body:JSON.stringify({database:'projects/'+EMULATOR_PROJECT+'/databases/(default)',export_directory:work,export_name:'snapshot'})
   });
   assert.equal(response.status,200);
   await response.arrayBuffer();
   const seed=join(work,'snapshot','snapshot.overall_export_metadata');
   assert.ok((await stat(seed)).isFile());
   const firstPid=emulator.pid;
   await client.close();client=null;
   await emulator.stop();
   emulator=await startEmulator(resolve(java),resolve(jar),work);
   assert.notEqual(emulator.pid,firstPid);
   client=emulatorClient();
   assert.deepEqual(await client.store.read(persistedId),[]);
   const emptyPid=emulator.pid;
   await client.close();client=null;
   await emulator.stop();
   emulator=await startEmulator(resolve(java),resolve(jar),work,seed);
   assert.notEqual(emulator.pid,emptyPid);
   client=emulatorClient();
   assert.deepEqual(await client.store.read(persistedId),original);
   assert.equal((await service().get(staff[0],persistedId)).state,'하원 완료');
  });
 });
}

module.exports={startEmulator,guardNetwork,emulatorClient,childEnvironment};
