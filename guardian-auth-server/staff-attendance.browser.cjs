'use strict';
// Run with Node 24: node --test guardian-auth-server/staff-attendance.browser.cjs
// Optionally set CHROMIUM_PATH to a locally installed Chromium executable.
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const http=require('node:http');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');

const date='2026-11-24', otherDate='2026-11-25';
const bookings=[
 {bookingId:'RSV-HTTP',dogName:'Fixture HTTP',visitDate:date},
 {bookingId:'RSV-NETWORK',dogName:'Fixture Network',visitDate:date},
 {bookingId:'RSV-NORMAL',dogName:'Fixture Normal',visitDate:date},
 {bookingId:'RSV-OTHER',dogName:'Fixture Other',visitDate:otherDate}
].map(booking=>({...booking,status:'예약'}));
const sdk='https://www.gstatic.com/firebasejs/11.10.0/';
const modules={
 [sdk+'firebase-app.js']:'export const initializeApp = config => ({config});',
 [sdk+'firebase-auth.js']:`
  const auth={currentUser:null};
  export const getAuth=()=>auth;
  export async function signInWithEmailAndPassword(instance,email,password){
   if(instance!==auth || email!=='staff@example.invalid' || password!=='fixture-only')throw Error('Invalid fixture login');
   auth.currentUser={getIdToken:async()=> 'browser-fixture-token'};
  }
  export async function signOut(){auth.currentUser=null;}
 `
};

async function until(read, description){
 for(let attempt=0;attempt<100;attempt++){
  const value=await read();
  if(value)return value;
  await delay(50);
 }
 throw Error('Timed out: '+description);
}

async function connect(url){
 const socket=new WebSocket(url), pending=new Map();
 let id=0;
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 const cdp={socket,send(method,params={}){
  return new Promise((resolve,reject)=>{
   const requestId=++id;
   pending.set(requestId,{resolve,reject});
   socket.send(JSON.stringify({id:requestId,method,params}));
  });
 }};
 socket.addEventListener('message',({data})=>{
  const message=JSON.parse(data);
  const request=pending.get(message.id);
  if(request){
   pending.delete(message.id);
   if(message.error)request.reject(Error(message.error.message));
   else request.resolve(message.result);
  }else cdp.onEvent?.(message);
 });
 socket.addEventListener('close',()=>{
  for(const request of pending.values())request.reject(Error('Chromium disconnected'));
  pending.clear();
 });
 return cdp;
}

test('Chromium staff attendance workflow with isolated fixtures',{timeout:45000},async t=>{
 const executable=process.env.CHROMIUM_PATH||[
  join(process.env.ProgramFiles||'C:/Program Files','Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/chromium','/usr/bin/google-chrome'
 ].find(existsSync);
 assert.ok(executable,'Test setup: install Chromium locally or set CHROMIUM_PATH');
 const html=await readFile(join(__dirname,'staff-local-test.html'));
 let recover=false, normalState='예약';
 const routeErrors=[],pageErrors=[],requests=[];
 const server=http.createServer((req,res)=>{
  const send=(status,data)=>{
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify(data));
  };
  if(req.method==='GET'&&req.url==='/staff-local-test'){
   res.writeHead(200,{
    'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'"
   });
   res.end(html);
   return;
  }
  if(req.method==='GET'&&req.url==='/favicon.ico'){res.writeHead(204).end();return;}
  requests.push([req.method,req.url]);
  if(req.headers.authorization!=='Bearer browser-fixture-token'){
   routeErrors.push('Missing fixture token: '+req.url);send(401,{});return;
  }
  if(req.method==='GET'&&req.url==='/api/staff/bookings'){
   const combined=bookings.map(({bookingId})=>({
    bookingId,attendanceState:bookingId==='RSV-HTTP'?null:bookingId==='RSV-NORMAL'?normalState:'예약',
    attendanceError:bookingId==='RSV-HTTP'
   }));
   send(200,{bookings,combined});return;
  }
  const route=/^\/api\/staff\/bookings\/(RSV-[A-Z]+)\/(arrival-request|attendance)(?:\/(check-in|check-out))?$/.exec(req.url);
  if(route&&bookings.some(booking=>booking.bookingId===route[1])){
   const [,id,kind,action]=route;
   if(req.method==='GET'&&kind==='arrival-request'&&!action){send(200,{request:null});return;}
   if(req.method==='GET'&&kind==='attendance'&&!action){
    if(id==='RSV-HTTP'&&!recover){send(503,{});return;}
    send(200,{attendance:{state:id==='RSV-NORMAL'?normalState:id==='RSV-HTTP'?'등원 중':'예약'}});
    return;
   }
   if(req.method==='POST'&&kind==='attendance'&&id==='RSV-NORMAL'){
    if(action==='check-in'&&normalState==='예약'){normalState='등원 중';send(200,{attendance:{state:normalState}});return;}
    if(action==='check-out'&&normalState==='등원 중'){normalState='하원 완료';send(200,{attendance:{state:normalState}});return;}
   }
  }
  routeErrors.push('Unexpected fixture request: '+req.method+' '+req.url);
  send(404,{});
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port;
 const profile=await mkdtemp(join(tmpdir(),'erp-attendance-chromium-'));
 const browser=spawn(executable,[
  '--headless=new','--user-data-dir='+profile,'--remote-debugging-port=0',
  '--no-first-run','--disable-background-networking','--disable-component-update',
  '--disable-default-apps','--disable-sync','--disable-quic','--no-pings',
  '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'
 ],{windowsHide:true,stdio:'ignore'});
 let spawnError;
 browser.once('error',error=>{spawnError=error;});
 const closed=new Promise(resolve=>browser.once('close',resolve));
 t.after(async()=>{
  browser.kill();await closed;
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 });
 const debugPort=await until(async()=>{
  if(spawnError)throw Error('Test setup: Chromium launch failed',{cause:spawnError});
  if(browser.exitCode!==null)throw Error('Test setup: Chromium exited with '+browser.exitCode);
  try{return Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}
  catch(error){if(error.code!=='ENOENT')throw error;}
 },'Chromium debug port');
 const targets=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
 const target=targets.find(candidate=>candidate.type==='page');
 assert.ok(target,'Test setup: missing Chromium page');
 const cdp=await connect(target.webSocketDebuggerUrl);
 t.after(()=>cdp.socket.close());
 cdp.onEvent=({method,params})=>{
  if(method==='Runtime.exceptionThrown')pageErrors.push(params.exceptionDetails.exception?.description||params.exceptionDetails.text);
  if(method!=='Fetch.requestPaused')return;
  const {requestId,request}=params;
  const respond=async()=>{
   if(Object.hasOwn(modules,request.url)&&request.method==='GET'){
    await cdp.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[
     {name:'Content-Type',value:'text/javascript'},{name:'Access-Control-Allow-Origin',value:origin}
    ],body:Buffer.from(modules[request.url]).toString('base64')});
   }else if(request.url===origin+'/api/staff/bookings/RSV-NETWORK/attendance'){
    await cdp.send('Fetch.failRequest',{requestId,errorReason:'ConnectionReset'});
   }else if(new URL(request.url).origin===origin){
    await cdp.send('Fetch.continueRequest',{requestId});
   }else{
    routeErrors.push('Blocked unexpected external request: '+request.url);
    await cdp.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
   }
  };
  void respond().catch(error=>routeErrors.push('Interception error: '+error.message));
 };
 await cdp.send('Runtime.enable');
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 await cdp.send('Page.navigate',{url:origin+'/staff-local-test'});
 const evaluate=async expression=>{
  const outcome=await cdp.send('Runtime.evaluate',{expression,returnByValue:true});
  if(outcome.exceptionDetails)throw Error('Browser evaluation: '+outcome.exceptionDetails.exception?.description);
  return outcome.result.value;
 };
 const check=(expression,description)=>until(async()=>{
  if(routeErrors.length)throw Error('Test fixture: '+routeErrors.join('; '));
  if(pageErrors.length)throw Error('Page exception: '+pageErrors.join('; '));
  return evaluate(expression);
 },description);
 const input=(selector,value,event)=>evaluate(`(()=>{
  const input=document.querySelector(${JSON.stringify(selector)});
  input.value=${JSON.stringify(value)};input.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));
 })()`);
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const card=id=>`[...document.querySelectorAll('.booking-card')].find(card=>card.children[1].textContent.endsWith(${JSON.stringify(id)}))`;
 const count=number=>`document.querySelectorAll('.booking-card').length===${number}`;
 const summary=(total,reserved,inProgress,done,review)=>`JSON.stringify([...document.querySelectorAll('#booking-summary > div')].map(cell=>[cell.firstElementChild.textContent,Number(cell.lastElementChild.textContent)]))===${JSON.stringify(JSON.stringify([['전체 예약',total],['미등원',reserved],['등원 중',inProgress],['하원 완료',done],['출석 확인 필요',review],['직원 확인 대기',0]]))}`;
 const visible=id=>`([${card(id)}].some(card=>card&&!card.hidden))`;
 const detail=(id,expected)=>`(${card(id)})?.querySelector('.attendance-detail')?.textContent.includes(${JSON.stringify(expected)})`;
 const buttons=(id,inDisabled,outDisabled)=>`JSON.stringify([...( ${card(id)} )?.querySelectorAll('button')||[]].slice(1).map(button=>button.disabled))===${JSON.stringify(JSON.stringify([inDisabled,outDisabled]))}`;

 await t.test('fixture login and isolated HTTP / network errors',async()=>{
  await check("typeof document.querySelector('#login')?.onsubmit==='function'",'staff module loaded');
  await input('#email','staff@example.invalid','input');
  await input('#password','fixture-only','input');
  await click('#login button');
  await check("document.querySelector('#result').textContent.includes('로그인 성공')",'mock staff login');
  await input('#visit-date',date,'change');
  await check([count(3),detail('RSV-HTTP','출석 기록 확인 필요 — 등·하원 처리 차단'),
   detail('RSV-NETWORK','출석 조회 중 오류 발생'),buttons('RSV-HTTP',true,true),
   buttons('RSV-NETWORK',true,true),buttons('RSV-NORMAL',false,true),summary(3,1,0,0,2)].join(' && '),'isolated errors and summary');
 });
 await t.test('error recovery, check-in and check-out update the summary',async()=>{
  recover=true;
  await click('#list');
  await check([buttons('RSV-HTTP',true,false),buttons('RSV-NORMAL',false,true),summary(3,1,1,0,1)].join(' && '),'recovered HTTP booking and summary');
  await evaluate(`(${card('RSV-NORMAL')}).querySelectorAll('button')[1].click()`);
  await check([buttons('RSV-NORMAL',true,false),summary(3,0,2,0,1)].join(' && '),'check-in and updated summary');
  await evaluate(`(${card('RSV-NORMAL')}).querySelectorAll('button')[2].click()`);
  await check([buttons('RSV-NORMAL',true,true),summary(3,0,1,1,1)].join(' && '),'check-out and updated summary');
  assert.ok(requests.some(([method,url])=>method==='POST'&&url.endsWith('/check-in')));
  assert.ok(requests.some(([method,url])=>method==='POST'&&url.endsWith('/check-out')));
 });
 await t.test('status filter, name / ID search, and date change',async()=>{
  await input('#attendance-filter','하원 완료','change');
  await check([visible('RSV-NORMAL'),'!'+visible('RSV-HTTP'),'!'+visible('RSV-NETWORK'),summary(3,0,1,1,1)].join(' && '),'state filter and date-wide totals');
  await input('#attendance-filter','all','change');
  for(const term of ['fixture normal','rsv-normal']){
   await input('#booking-search',term,'input');
   await check([visible('RSV-NORMAL'),'!'+visible('RSV-HTTP'),'!'+visible('RSV-NETWORK')].join(' && '),'name or ID search');
  }
  await input('#booking-search','','input');
  await input('#visit-date',otherDate,'change');
  await check([count(1),visible('RSV-OTHER'),buttons('RSV-OTHER',false,true),summary(1,1,0,0,0)].join(' && '),'other date cards and summary');
 });
 assert.deepEqual(routeErrors,[],'test fixture routing');
 assert.deepEqual(pageErrors,[],'uncaught product JavaScript errors');
});
