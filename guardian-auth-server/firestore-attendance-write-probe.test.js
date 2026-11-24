'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {runCloudProbe,runEmulatorProbe}=require('./firestore-attendance-write-probe');
const {EMULATOR_HOST}=require('./firestore-attendance-store');

const project='mungtheland-guardian-test';
const database='projects/'+project+'/databases/(default)';
const approved=['--execute-approved-test-write',project];
const env={FIRESTORE_EMULATOR_HOST:EMULATOR_HOST};
const runId='12345678-1234-4234-8234-123456789abc';
const missing={error:{status:'NOT_FOUND'}};
const version='2026-11-24T04:00:00.123456Z';
const reply=(status,data)=>({status,json:async()=>data});
const forbidden=()=>assert.fail('Unexpected access');
const adc={type:'impersonated_service_account',
 service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/mungtheland-guardian-reader@'+project+'.iam.gserviceaccount.com:generateAccessToken',
 source_credentials:{type:'authorized_user',client_id:'fixture',client_secret:'fixture',refresh_token:'fixture'}};

test('default and invalid cloud invocations never load ADC or connect',async()=>{
 for(const args of [[],['--execute-approved-test-write'],['--execute-approved-test-write','other']]){
  const result=await runCloudProbe({args,env:{},loadAdc:forbidden,getToken:forbidden,fetchRequest:forbidden});
  assert.equal(result.status,args.length?'failed':'dry-run');
 }
});

test('cloud probe stops on wrong ADC, wrong database, wrong region or missing cleanup permission',async()=>{
 let result=await runCloudProbe({args:approved,env:{},loadAdc:()=>({...adc,service_account_impersonation_url:'wrong'}),
  getToken:forbidden,fetchRequest:forbidden});
 assert.equal(result.phase,'identity');
 for(const metadata of [{name:'projects/other/databases/(default)',locationId:'asia-northeast3'},
  {name:database,locationId:'other-region'}]){
  const calls=[];
  result=await runCloudProbe({args:approved,env:{},loadAdc:()=>adc,getToken:async()=>'fixture',fetchRequest:async(url,{method})=>{
   calls.push(method);assert.match(url,/firestore\.googleapis\.com/);
   return reply(200,{type:'FIRESTORE_NATIVE',...metadata});
  }});
  assert.equal(result.phase,'database');
  assert.deepEqual(calls,['GET']);
 }
 const calls=[];
 result=await runCloudProbe({args:approved,env:{},loadAdc:()=>adc,getToken:async()=>'fixture',fetchRequest:async(url,options)=>{
  calls.push(options.method);
  if(options.method==='GET')return reply(200,{name:database,locationId:'asia-northeast3',type:'FIRESTORE_NATIVE'});
  assert.ok(url.endsWith(':testIamPermissions'));
  assert.ok(JSON.parse(options.body).permissions.includes('datastore.entities.delete'));
  return reply(200,{permissions:['datastore.entities.get','datastore.entities.create']});
 }});
 assert.equal(result.phase,'permissions');
 assert.deepEqual(calls,['GET','POST']);
});

test('explicit approved mock run stays on the fixed cloud project and pinned document version',async()=>{
 let document,steps=0,notified;
 const calls=[];
 const result=await runCloudProbe({args:approved,env:{},loadAdc:()=>adc,getToken:async()=>'fixture',
  onCreateAttempt:id=>{notified=id;},
  fetchRequest:async(raw,options)=>{
   const url=new URL(raw);
   calls.push(options.method);
   assert.equal(options.redirect,'error');
   assert.ok(url.protocol==='https:'&&url.pathname.startsWith('/v1/projects/'+project));
   if(++steps===1)return reply(200,{name:database,locationId:'asia-northeast3',type:'FIRESTORE_NATIVE'});
   if(steps===2)return reply(200,JSON.parse(options.body));
   assert.equal(url.hostname,'firestore.googleapis.com');
   assert.ok(url.pathname.startsWith('/v1/'+database+'/documents'));
   if(steps===3||steps===7)return reply(404,missing);
   if(steps===4){
    assert.equal(url.searchParams.get('documentId'),notified);
    document={name:database+'/documents/attendance_test_v1/'+notified,
     fields:JSON.parse(options.body).fields,updateTime:version};
    return reply(200,document);
   }
   if(steps===5)return reply(200,document);
   assert.equal(url.pathname,'/v1/'+database+'/documents:commit');
   assert.deepEqual(JSON.parse(options.body),{writes:[{delete:document.name,currentDocument:{updateTime:version}}]});
   return reply(200,{});
  }});
 assert.deepEqual(calls,['GET','POST','GET','POST','GET','POST','GET']);
 assert.deepEqual(result,{status:'passed',documentId:notified,cleanup:'confirmed'});
});

test('existing ID, create collision and lost create response never trigger DELETE or retry',async()=>{
 for(const mode of ['existing','collision','lost-response']){
  const calls=[];
  const result=await runEmulatorProbe({env,runId,fetchRequest:async(_,options)=>{
   calls.push(options.method);
   if(options.method==='GET')return mode==='existing'?reply(200,{}):reply(404,missing);
   if(mode==='lost-response')throw Error('private fixture');
   return reply(409,{});
  }});
  assert.deepEqual(calls,mode==='existing'?['GET']:['GET','POST']);
  assert.equal(result.phase,mode==='existing'?'absence':'create');
  assert.equal(result.cleanup,mode==='existing'?undefined:'unconfirmed');
  assert.equal(result.createdUpdateTime,undefined);
  assert.doesNotMatch(JSON.stringify(result),/private fixture/);
 }
});

test('mismatched content or a changed read version leaves recovery metadata and never deletes',async()=>{
 for(const conflict of ['content','version']){
  let document,steps=0;
  const result=await runEmulatorProbe({env,runId,fetchRequest:async(raw,options)=>{
   const url=new URL(raw);
   assert.equal(url.pathname.endsWith(':commit'),false);
   if(++steps===1)return reply(404,missing);
   if(steps===2){
    document={name:url.pathname.slice(4)+'/'+url.searchParams.get('documentId'),fields:JSON.parse(options.body).fields,updateTime:version};
    return reply(200,document);
   }
   return reply(200,conflict==='content'?{...document,fields:{}}:{...document,updateTime:'2026-11-25T04:00:00Z'});
  }});
  assert.equal(steps,3);
  assert.equal(result.phase,'read');
  assert.equal(result.cleanup,'unconfirmed');
  assert.equal(result.createdUpdateTime,version);
  assert.equal(result.documentId,'RSV-PROBE-12345678123442348234123456789ABC');
 }
});

test('emulator entry refuses another host',async()=>{
 await assert.rejects(runEmulatorProbe({env:{FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com'},fetchRequest:forbidden}),/Dedicated emulator/);
});
