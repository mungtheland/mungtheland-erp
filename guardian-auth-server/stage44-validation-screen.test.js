'use strict';

const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {test}=require('node:test');
const vm=require('node:vm');
const {createStage44ValidationScreen}=require('./stage44-validation-screen');

test('browser preparation and execution use the issued confirmation header',async t=>{
  let route,executionCount=0,prepareCount=0;
  const logs=[];
  const server=createServer((req,res)=>route(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  route=createStage44ValidationScreen({
    firebaseConfig:{projectId:'fixture',apiKey:'quote"and\\slash'},origin,
    prepare:async ({identifier,staffId})=>{
      assert.equal(identifier,'fixture');
      assert.equal(staffId,'STAFF-TEST');
      prepareCount++;
      return 'fixture@example.invalid';
    },
    authenticate:async token=>token==='mock-token'?{role:'staff',status:'active'}:null,
    execute:async()=>{executionCount++;return 'mock execution';},
    log:entry=>logs.push(entry)
  });
  assert.match(await (await fetch(origin)).text(),/<title>44단계 출석 저장 검증<\/title>/);
  const script=await (await fetch(origin+'/client.js')).text();
  const fields=Object.fromEntries(['mapping','login','identifier','staff','password','result'].map(id=>[id,{}]));
  Object.assign(fields.mapping,{reset(){}});
  fields.identifier.value='fixture';
  fields.staff.value='STAFF-TEST';
  fields.password.value='fixture-password';
  const post=(path,options)=>fetch(origin+path,{...options,headers:{...options.headers,Origin:origin}});
  await vm.runInNewContext('(async()=>{'+script.replace(/^import .*;$/gm,'')+'})()',{
    document:{getElementById:id=>fields[id]},fetch:post,
    initializeApp:config=>assert.equal(config.apiKey,'quote"and\\slash'),
    getAuth:()=>({currentUser:{getIdToken:async()=>'mock-token'}}),
    inMemoryPersistence:{},setPersistence:async()=>{},
    signInWithEmailAndPassword:async(_auth,email,password)=>{
      assert.equal(email,'fixture@example.invalid');
      assert.equal(password,'fixture-password');
    },
    signOut:async()=>{}
  });
  await fields.mapping.onsubmit({preventDefault(){}});
  assert.equal(prepareCount,1);
  const nonce=JSON.parse(script.match(/^const nonce=(.+);$/m)[1]);
  const request=async(path,headers,status,code)=>{
    const response=await post(path,{method:'POST',headers});
    assert.equal(response.status,status);
    assert.deepEqual(await response.json(),{code});
  };
  await request('/run',{'X-ERP-Nonce':'${NONCE_PLACEHOLDER}'},403,'CONFIRMATION_MISMATCH');
  await request('/unknown',{},404,'ROUTE_NOT_FOUND');
  await request('/run',{'X-ERP-Nonce':nonce},401,'AUTH_REQUIRED');
  await request('/run',{'X-ERP-Nonce':nonce,Authorization:'Bearer rejected'},403,'AUTH_FAILED');
  assert.equal(executionCount,0);
  await fields.login.onsubmit({preventDefault(){}});
  assert.equal(fields.result.textContent,'mock execution');
  assert.equal(fields.password.value,'');
  assert.equal(executionCount,1);
  await request('/run',{'X-ERP-Nonce':nonce,Authorization:'Bearer mock-token'},409,'RUN_ALREADY_STARTED');
  assert.deepEqual(logs,[
    {status:403,code:'CONFIRMATION_MISMATCH'},{status:404,code:'ROUTE_NOT_FOUND'},
    {status:401,code:'AUTH_REQUIRED'},{status:403,code:'AUTH_FAILED'},
    {status:200,code:'RUN_ENTERED'},{status:409,code:'RUN_ALREADY_STARTED'}
  ]);
});
