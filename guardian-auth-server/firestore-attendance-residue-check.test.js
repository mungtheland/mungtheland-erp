'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {collectionPath,fixtureFields,fingerprint}=require('./firestore-attendance-probe-target');
const {EMULATOR_HOST,EMULATOR_PROJECT}=require('./firestore-attendance-store');
const {runCloudResidueCheck,runEmulatorResidueCheck}=require('./firestore-attendance-residue-check');

const runId='12345678-1234-4234-8234-123456789abc';
const id='RSV-PROBE-12345678123442348234123456789ABC';
const version='2026-11-24T04:00:00.123456Z';
const fields=fixtureFields(id,runId,'2026-11-24T04:00:00.000Z');
const digest=fingerprint(fields);
const env={FIRESTORE_EMULATOR_HOST:EMULATOR_HOST};
const forbidden=()=>assert.fail('Unexpected ADC or network access');
const reply=(status,data)=>({status,json:async()=>data});

test('residue tool defaults to dry-run and rejects unscoped or unsafe IDs before ADC',async()=>{
 for(const args of [[],['--inspect','RSV-TEST-001'],['--inspect',id+'/../other'],['--inspect',id,'bad digest'],
  ['--inspect',id,digest,'bad version'],['--delete',id],['--inspect',id.replace('4234','1234')]]){
  const result=await runCloudResidueCheck({args,env:{},loadAdc:forbidden,getToken:forbidden,fetchRequest:forbidden});
  assert.equal(result.status,args.length?'failed':'dry-run');
 }
 await assert.rejects(runEmulatorResidueCheck({args:['--inspect',id],env:{},fetchRequest:forbidden}),/Dedicated emulator/);
});

test('residue inspection only fetches the fixed document without emitting content',async()=>{
 const name=collectionPath(EMULATOR_PROJECT)+'/'+id;
 for(const [args,body,expected] of [
  [['--inspect',id,digest,version],{name,fields,updateTime:version},[true,true,true,true]],
  [['--inspect',id,digest],{name,fields,updateTime:version},[true,true,null,false]],
  [['--inspect',id,digest,version],{name,fields,updateTime:'2026-11-25T04:00:00Z'},[true,true,false,false]],
  [['--inspect',id,digest,version],{name,fields:{...fields,other:'private fixture'},updateTime:version},[false,null,true,false]],
  [['--inspect',id,digest,version],{name,fields:fixtureFields(id,runId,'2026-11-23T00:00:00Z'),updateTime:version},[true,false,true,false]]
 ]){
  let calls=0;
  const result=await runEmulatorResidueCheck({args,env,fetchRequest:async(raw,options)=>{
   calls++;
   assert.equal(raw,'http://'+EMULATOR_HOST+'/v1/'+name);
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   assert.equal(options.body,undefined);
   return reply(200,body);
  }});
  assert.equal(calls,1);
  assert.equal(result.status,'present');
  assert.deepEqual([result.fixtureMatches,result.fingerprintMatches,result.versionMatches,result.evidenceMatches],expected);
  assert.doesNotMatch(JSON.stringify(result),/private fixture|STAFF-PROBE|\d{4}-\d{2}-\d{2}T/);
 }
});

test('residue inspection distinguishes absence, access denial, and ambiguous rejection',async()=>{
 for(const [http,body,status] of [[404,{error:{status:'NOT_FOUND'}},'absent'],[404,null,'failed'],
  [403,{error:{message:'private fixture'}},'blocked'],[503,{},'failed']]){
  const result=await runEmulatorResidueCheck({args:['--inspect',id],env,fetchRequest:async()=>reply(http,body)});
  assert.equal(result.status,status);
  assert.doesNotMatch(JSON.stringify(result),/private fixture/);
 }
});

test('cloud residue inspection rechecks the database before reading a single document',async()=>{
 const project='mungtheland-guardian-test';
 const database='projects/'+project+'/databases/(default)';
 const adc={type:'impersonated_service_account',
  service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/mungtheland-guardian-reader@'+project+'.iam.gserviceaccount.com:generateAccessToken',
  source_credentials:{type:'authorized_user',client_id:'fixture',client_secret:'fixture',refresh_token:'fixture'}};
 for(const matches of [false,true]){
  const paths=[];
  const result=await runCloudResidueCheck({args:['--inspect',id],env:{},loadAdc:()=>adc,getToken:async()=>'fixture',
   fetchRequest:async(raw,options)=>{
    const url=new URL(raw);
    assert.equal(url.origin,'https://firestore.googleapis.com');
    assert.equal(options.method,'GET');
    paths.push(url.pathname);
    if(paths.length===1)return reply(200,{name:database,type:'FIRESTORE_NATIVE',locationId:matches?'asia-northeast3':'other-region'});
    return reply(404,{error:{status:'NOT_FOUND'}});
   }});
  assert.deepEqual(paths,matches?['/v1/'+database,'/v1/'+collectionPath(project)+'/'+id]:['/v1/'+database]);
  assert.equal(result.status,matches?'absent':'failed');
 }
});
