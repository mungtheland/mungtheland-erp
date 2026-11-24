'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {mkdtemp,readFile,rm,stat}=require('node:fs/promises');
const http=require('node:http');
const net=require('node:net');
const {tmpdir}=require('node:os');
const {join,resolve,dirname}=require('node:path');
const {startEmulator,guardNetwork,emulatorClient,childEnvironment}=require('./firestore-attendance.emulator.cjs');
const {EMULATOR_HOST}=require('./firestore-attendance-store');
const {openStaffBrowser}=require('./staff-attendance.browser.cjs');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const {createStaffAttendanceService}=require('./staff-attendance');

const date='2026-11-24';
const keys=['NORMAL','RACE','LOST','TIMEOUT','NETWORK','FAILED'];
const fixtureId=key=>'RSV-E2E-'+key;
const bookings=keys.map(key=>({bookingId:fixtureId(key),dogName:'Fixture '+key,visitDate:date,status:'예약'}));
const repository={listForStaff:async()=>bookings,findById:async id=>bookings.find(booking=>booking.bookingId===id)};
const token='browser-fixture-token';
const tokens=new Map([[token,'STAFF-E2E-ONE'],['second-fixture-token','STAFF-E2E-TWO']]);
const attendUrl=id=>'/api/staff/bookings/'+id+'/attendance';
const validPort=port=>Number.isInteger(port)&&port>=1024&&port<=65535&&port!==8787&&port!==Number(EMULATOR_HOST.split(':')[1]);

async function serveFixture(){
 assert.equal(typeof process.send,'function','Expect an isolated test worker');
 const requestedPort=Number(process.argv[3]);
 assert.ok(requestedPort===0||validPort(requestedPort));
 guardNetwork();
 assert.throws(()=>net.connect({host:'firestore.googleapis.com',port:443}),/Blocked non-emulator/);
 const client=emulatorClient();
 const html=await readFile(join(__dirname,'staff-local-test.html'));
 let fault,failCommit=false;
 const posts=[];
 const store={...client.store,async commitTransition(args){
  if(failCommit){failCommit=false;throw Error('Fixture failure before commit');}
  return client.store.commitTransition(args);
 }};
 const handler=createStaffArrivalHttpHandler({
  authenticateStaff:async bearer=>{
   const staffId=tokens.get(bearer);
   return staffId?{role:'staff',status:'active',staffId}:null;
  },
  staffArrival:{get:async()=>null},
  bookingRepository:repository,
  staffAttendance:createStaffAttendanceService({bookingRepository:repository,store})
 });
 const server=http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/staff-local-test'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'"});
   res.end(html);return;
  }
  if(req.method==='GET'&&req.url==='/favicon.ico'){res.writeHead(204).end();return;}
  if(req.method==='POST'){
   posts.push({path:req.url,id:req.headers['x-attendance-request-id']});
   if(fault?.path===req.url){
    const mode=fault.mode;fault=null;
    if(mode==='stall')return; // The browser aborts this request; it never reaches the handler.
    if(mode==='before-commit')failCommit=true;
    if(mode==='lost-response'){
     // Break the response body only after the real handler has completed the commit.
     const writeHead=res.writeHead.bind(res),end=res.end.bind(res);
     res.writeHead=(status,headers)=>writeHead(status,status===200?{...headers,'Content-Length':1024}:headers);
     res.end=body=>{
      if(res.statusCode!==200)return end(body);
      res.write('{');
      setTimeout(()=>res.destroy(),20);
      return res;
     };
    }
   }
  }
  void handler(req,res).then(handled=>{if(!handled)res.writeHead(404).end();}).catch(()=>res.destroy());
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(requestedPort,'127.0.0.1',resolve);});
 const port=server.address().port;
 assert.ok(validPort(port));
 process.on('message',async message=>{
  const {id,operation,value}=message;
  try{
   let data;
   if(operation==='fault')fault=value;
   else if(operation==='posts')data=posts;
   else if(operation==='document'){
    assert.ok(bookings.some(booking=>booking.bookingId===value));
    const snap=await client.db.collection('attendance_test_v1').doc(value).get();
    data=snap.exists?snap.data():null;
   }else if(operation==='stop'){
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    await client.close();
   }else throw Error('Unknown fixture operation');
   process.send({id,data},()=>{if(operation==='stop')process.disconnect();});
  }catch{process.send({id,error:'Fixture operation failed'});}
 });
 process.send({port});
}

async function startFixture(t,port=0){
 const child=fork(__filename,['server',String(port)],{
  execArgv:[],env:{...childEnvironment,FIRESTORE_EMULATOR_HOST:EMULATOR_HOST},
  windowsHide:true,stdio:['ignore','ignore','ignore','ipc']
 });
 const exited=new Promise(resolve=>child.once('close',resolve));
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();await exited;});
 const bound=await new Promise((resolve,reject)=>{
  child.once('message',message=>resolve(message.port));
  child.once('error',reject);
  child.once('exit',()=>reject(Error('Fixture server exited before listening')));
 });
 assert.ok(validPort(bound));
 if(port)assert.equal(bound,port);
 const pending=new Map();
 let sequence=0;
 child.on('message',({id,data,error})=>{
  const request=pending.get(id);
  if(!request)return;
  pending.delete(id);
  if(error)request.reject(Error(error));else request.resolve(data);
 });
 child.once('exit',()=>{
  for(const request of pending.values())request.reject(Error('Fixture server exited'));
  pending.clear();
 });
 const call=(operation,value)=>new Promise((resolve,reject)=>{
  const id=++sequence;
  pending.set(id,{resolve,reject});
  child.send({id,operation,value},error=>{if(error){pending.delete(id);reject(error);}});
 });
 return {port:bound,pid:child.pid,origin:'http://127.0.0.1:'+bound,call,
  stop:async()=>{await call('stop');await exited;assert.equal(child.exitCode,0);}};
}

if(require.main===module&&process.argv[2]==='server'){
 serveFixture().catch(()=>process.exit(1));
}else if(require.main===module){
 test('Chromium UI through staff HTTP API and real Firestore emulator',{timeout:120000},async t=>{
  const java=process.env.ERP_FIRESTORE_JAVA,jar=process.env.ERP_FIRESTORE_EMULATOR_JAR;
  assert.ok(java&&jar&&(await stat(java)).isFile()&&(await stat(jar)).isFile(),'Provide local Java and verified emulator JAR');
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST===EMULATOR_HOST);
  const work=await mkdtemp(join(tmpdir(),'erp-staff-e2e-'));
  let emulator;
  t.after(async()=>{
   await emulator?.stop();
   if(dirname(resolve(work))===resolve(tmpdir()))await rm(work,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  });
  emulator=await startEmulator(resolve(java),resolve(jar),work);
  let fixture=await startFixture(t);
  const routeErrors=[];
  let droppedRequestId;
  const browser=await openStaffBrowser(t,fixture.origin,routeErrors,request=>{
   if(request.method!=='POST'||!request.url.endsWith(attendUrl(fixtureId('NETWORK'))+'/check-in')||droppedRequestId)return false;
   droppedRequestId=Object.entries(request.headers).find(([header])=>header.toLowerCase()==='x-attendance-request-id')?.[1];
   assert.ok(droppedRequestId);
   return true;
  });
  const {check,click,input,evaluate,card,buttons,notice,summary,pageErrors}=browser;
  const browserClick=(key,action)=>evaluate(`(${card(fixtureId(key))}).querySelectorAll('button')[${action==='check-in'?1:2}].click()`);
  const record=(key,server=fixture)=>server.call('document',fixtureId(key));
  const posts=(key,action)=>fixture.call('posts').then(all=>all.filter(post=>post.path===attendUrl(fixtureId(key))+'/'+action));
  const state=(key,value)=>`(${card(fixtureId(key))})?.querySelector('.attendance-state')?.dataset.state===${JSON.stringify(value)}`;
  const checkUi=(...conditions)=>check(conditions.join(' && '),'staff card, notice and summary',300);
  const post=async(key,action,requestId=randomUUID(),bearer=token,server=fixture)=>{
   const res=await fetch(server.origin+attendUrl(fixtureId(key))+'/'+action,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:'Bearer '+bearer,'X-Attendance-Request-Id':requestId}
   });
   return {status:res.status,body:await res.json()};
  };
  const assertEvents=async(key,actions)=>{
   const saved=await record(key);
   assert.deepEqual(saved.events.map(event=>event.action),actions);
   assert.equal(new Set(saved.events.map(event=>event.eventId)).size,actions.length);
   return saved;
  };
  const loginAndLoad=async()=>{
   await check("typeof document.querySelector('#login')?.onsubmit==='function'",'staff module loaded');
   await input('#email','staff@example.invalid','input');
   await input('#password','fixture-only','input');
   await click('#login button');
   await check("document.querySelector('#result').textContent.includes('로그인 성공')",'fixture login');
   await input('#visit-date',date,'change');
  };
  await loginAndLoad();

  await t.test('UI check-in/out match Firestore; duplicate actions and checkout before check-in are rejected',async()=>{
   const id=fixtureId('NORMAL');
   await checkUi(buttons(id,false,true),summary(6,6,0,0,0));
   assert.equal((await post('NORMAL','check-out')).status,409);
   assert.equal(await record('NORMAL'),null);
   await browserClick('NORMAL','check-in');
   await checkUi(state('NORMAL','등원 중'),buttons(id,true,false),summary(6,5,1,0,0));
   assert.equal((await assertEvents('NORMAL',['check-in'])).state,'등원 중');
   const requests=await posts('NORMAL','check-in');
   assert.equal(requests.length,1);
   const idempotencyKey=requests.at(-1).id;
   assert.equal((await post('NORMAL','check-in',idempotencyKey)).status,200);
   assert.equal((await post('NORMAL','check-in')).status,409);
   await browserClick('NORMAL','check-out');
   await checkUi(state('NORMAL','하원 완료'),buttons(id,true,true),summary(6,5,0,1,0));
   assert.equal((await post('NORMAL','check-out')).status,409);
   assert.equal((await assertEvents('NORMAL',['check-in','check-out'])).state,'하원 완료');
  });
  await t.test('distinct IDs and staff on two HTTP processes produce one Firestore event',async()=>{
   const second=await startFixture(t);
   assert.notEqual(second.pid,fixture.pid);
   const results=await Promise.all([post('RACE','check-in'),post('RACE','check-in',randomUUID(),'second-fixture-token',second)]);
   assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
   const conflict=results.find(result=>result.status===409);
   assert.equal(conflict.body.code,'ATTENDANCE_STATE_CONFLICT');
   assert.equal((await assertEvents('RACE',['check-in'])).state,'등원 중');
   await second.stop();
   await click('#list');
   await checkUi(state('RACE','등원 중'),summary(6,4,1,1,0));
  });
  await t.test('lost committed response re-reads the persisted state without duplicating',async()=>{
   const id=fixtureId('LOST');
   await fixture.call('fault',{path:attendUrl(id)+'/check-in',mode:'lost-response'});
   await browserClick('LOST','check-in');
   await checkUi(state('LOST','등원 중'),notice(id,'처리 결과를 확인할 수 없습니다.'),summary(6,3,2,1,0));
   const [attempt]=await posts('LOST','check-in');
   assert.equal((await post('LOST','check-in',attempt.id)).status,200);
   await assertEvents('LOST',['check-in']);
  });
  await t.test('browser POST timeout and network reset re-read state and reuse the request ID on retry',async()=>{
   const timed=fixtureId('TIMEOUT'),network=fixtureId('NETWORK');
   await fixture.call('fault',{path:attendUrl(timed)+'/check-in',mode:'stall'});
   await browserClick('TIMEOUT','check-in');
   await checkUi(buttons(timed,false,true),state('TIMEOUT','예약'),notice(timed,'현재 출석 상태를 다시 조회했습니다.'));
   assert.equal(await record('TIMEOUT'),null);
   await browserClick('TIMEOUT','check-in');
   await checkUi(state('TIMEOUT','등원 중'));
   const timeoutPosts=await posts('TIMEOUT','check-in');
   assert.equal(timeoutPosts.length,2);
   assert.equal(timeoutPosts[0].id,timeoutPosts[1].id);
   await assertEvents('TIMEOUT',['check-in']);
   await browserClick('NETWORK','check-in');
   await checkUi(buttons(network,false,true),state('NETWORK','예약'),notice(network,'현재 출석 상태를 다시 조회했습니다.'));
   assert.equal(await record('NETWORK'),null);
   await browserClick('NETWORK','check-in');
   await checkUi(state('NETWORK','등원 중'),summary(6,1,4,1,0));
   const networkPosts=await posts('NETWORK','check-in');
   assert.deepEqual(networkPosts.map(request=>request.id),[droppedRequestId]);
   await assertEvents('NETWORK',['check-in']);
  });
  await t.test('failure before commit leaves the document absent and the card recoverable',async()=>{
   const id=fixtureId('FAILED');
   await fixture.call('fault',{path:attendUrl(id)+'/check-in',mode:'before-commit'});
   await browserClick('FAILED','check-in');
   await checkUi(state('FAILED','예약'),buttons(id,false,true),notice(id,'처리 결과를 확인할 수 없습니다.'),summary(6,1,4,1,0));
   assert.equal(await record('FAILED'),null);
  });
  await t.test('new HTTP server process reloads original Firestore records and the UI summary',async()=>{
   const oldPid=fixture.pid,port=fixture.port;
   const original=await Promise.all(keys.map(key=>record(key)));
   await fixture.stop();
   fixture=await startFixture(t,port);
   assert.notEqual(fixture.pid,oldPid);
   assert.deepEqual(await Promise.all(keys.map(key=>record(key))),original);
   await click('#list');
   await checkUi(state('NORMAL','하원 완료'),state('RACE','등원 중'),state('FAILED','예약'),summary(6,1,4,1,0));
  });
  assert.deepEqual(routeErrors,[]);
  assert.deepEqual(pageErrors,[]);
 });
}
