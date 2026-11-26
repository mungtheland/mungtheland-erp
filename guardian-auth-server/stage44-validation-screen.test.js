'use strict';

const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {test}=require('node:test');
const vm=require('node:vm');
const {createStage44ValidationScreen}=require('./stage44-validation-screen');

test('browser preparation and execution use the issued confirmation header',async t=>{
  let route,executionCount=0,prepareCount=0,releasePreparation,enterPreparation;
  const holdPreparation=new Promise(resolve=>{releasePreparation=resolve;});
  const preparedCallbackEntered=new Promise(resolve=>{enterPreparation=resolve;});
  const logs=[];
  const server=createServer((req,res)=>route(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{
    releasePreparation();
    return new Promise(resolve=>server.close(resolve));
  });
  const origin='http://127.0.0.1:'+server.address().port;
  route=createStage44ValidationScreen({
    firebaseConfig:{projectId:'fixture',apiKey:'quote"and\\slash'},origin,
    prepare:async ({identifier,staffId})=>{
      assert.equal(identifier,'fixture');
      assert.equal(staffId,'STAFF-TEST');
      prepareCount++;
      enterPreparation();
      await holdPreparation;
      return 'fixture@example.invalid';
    },
    authenticate:async token=>token==='mock-token'?{role:'staff',status:'active'}:null,
    execute:async()=>{executionCount++;return 'mock execution';},
    log:entry=>logs.push(entry)
  });
  assert.match(await (await fetch(origin)).text(),/<title>44단계 출석 저장 검증<\/title>/);
  const script=await (await fetch(origin+'/client.js')).text();
  const fields=Object.fromEntries(['mapping','login','identifier','staff','password','result','prepare-button'].map(id=>[id,{}]));
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
  const nonce=JSON.parse(script.match(/^const nonce=(.+);$/m)[1]);
  const request=async(path,headers,status,code,body)=>{
    const response=await post(path,{method:'POST',headers,body});
    assert.equal(response.status,status);
    assert.deepEqual(await response.json(),{code});
  };
  const validHeaders={'X-ERP-Nonce':nonce,Authorization:'Bearer mock-token'};
  await request('/run',validHeaders,409,'PREPARE_REQUIRED');
  const firstPreparation=fields.mapping.onsubmit({preventDefault(){}});
  await preparedCallbackEntered;
  assert.equal(fields['prepare-button'].disabled,true);
  await fields.mapping.onsubmit({preventDefault(){}});
  await request('/prepare',validHeaders,409,'PREPARE_IN_PROGRESS','{}');
  await request('/run',validHeaders,409,'PREPARE_REQUIRED');
  releasePreparation();
  await firstPreparation;
  assert.equal(fields['prepare-button'].disabled,false);
  assert.equal(prepareCount,1);
  await request('/prepare',validHeaders,409,'PREPARE_ALREADY_READY','{}');
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
    {status:409,code:'PREPARE_REQUIRED'},{status:409,code:'PREPARE_IN_PROGRESS'},
    {status:409,code:'PREPARE_REQUIRED'},{status:409,code:'PREPARE_ALREADY_READY'},
    {status:403,code:'CONFIRMATION_MISMATCH'},{status:404,code:'ROUTE_NOT_FOUND'},
    {status:401,code:'AUTH_REQUIRED'},{status:403,code:'AUTH_FAILED'},
    {status:200,code:'RUN_ENTERED'},{status:409,code:'RUN_ALREADY_STARTED'}
  ]);
});

for(const fixture of [
  {name:'malformed body',body:'{invalid',internalCode:'PREPARE_BODY_FAILED',prepareCalls:0},
  {name:'callback rejection',body:'{}',internalCode:'PREPARE_CALLBACK_FAILED',prepareCalls:1}
]){
  test(fixture.name+' logs only a fixed code and blocks execution',async t=>{
    let route,prepareCalls=0;
    const logs=[];
    const server=createServer((req,res)=>route(req,res));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const origin='http://127.0.0.1:'+server.address().port;
    route=createStage44ValidationScreen({
      firebaseConfig:{projectId:'fixture'},origin,
      prepare:async()=>{prepareCalls++;throw Error('private fixture diagnostic');},
      authenticate:async()=>assert.fail('authentication must not run'),
      execute:async()=>assert.fail('execution must not run'),
      log:entry=>logs.push(entry)
    });
    const script=await (await fetch(origin+'/client.js')).text();
    const nonce=JSON.parse(script.match(/^const nonce=(.+);$/m)[1]);
    const request=async(path,body,expectedStatus,code)=>{
      const response=await fetch(origin+path,{
        method:'POST',headers:{Origin:origin,'X-ERP-Nonce':nonce,Authorization:'Bearer mock-token'},body
      });
      assert.equal(response.status,expectedStatus);
      assert.deepEqual(await response.json(),{code});
    };
    await request('/prepare',fixture.body,400,'PREPARE_FAILED');
    await request('/prepare','{}',409,'PREPARE_SESSION_FAILED');
    await request('/run',undefined,409,'PREPARE_REQUIRED');
    assert.equal(prepareCalls,fixture.prepareCalls);
    assert.deepEqual(logs,[
      {status:400,code:fixture.internalCode},
      {status:409,code:'PREPARE_SESSION_FAILED'},
      {status:409,code:'PREPARE_REQUIRED'}
    ]);
  });
}
