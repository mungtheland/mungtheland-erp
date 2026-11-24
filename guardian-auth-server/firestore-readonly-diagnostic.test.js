'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {diagnose}=require('./firestore-readonly-diagnostic');

const project='mungtheland-guardian-test';
const resource='projects/'+project;
const database=resource+'/databases/(default)';
const collection=database+'/documents/attendance_test_v1';
const release=resource+'/releases/cloud.firestore';
const ruleset=resource+'/rulesets/fixture';
const reader='mungtheland-guardian-reader@'+project+'.iam.gserviceaccount.com';
const impersonation='https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+reader+':generateAccessToken';
const adc={type:'impersonated_service_account',service_account_impersonation_url:impersonation,
 source_credentials:{type:'authorized_user',client_id:'fixture',client_secret:'fixture',refresh_token:'fixture'}};
const ok=data=>({ok:true,status:200,json:async()=>data});
const deny=()=>({ok:false,status:403,json:async()=>({error:{message:'raw fixture error',
 status:'PERMISSION_DENIED',details:[{reason:'IAM_PERMISSION_DENIED'},{reason:'raw fixture reason'}]}})});

test('wrong project, mixed modes, quota override and unexpected ADC stop before authentication',async()=>{
 const envs=[{GOOGLE_CLOUD_PROJECT:'other'},{GCLOUD_PROJECT:'other'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:18879'},
  {FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:18880'},{GOOGLE_CLOUD_QUOTA_PROJECT:'other'},
  {GOOGLE_APPLICATION_CREDENTIALS:'custom'},{MD_TEST_ATTENDANCE_FIRESTORE:'enabled'},{MD_TEST_ARRIVAL_WRITE:'enabled'}];
 for(const env of envs){
  const result=await diagnose({env,adc,getToken:async()=>assert.fail('Unexpected authentication')});
  assert.equal(result.local.status,'failed');
  assert.equal(result.identity.status,'not-run');
 }
 for(const unsafe of [{...adc,service_account_impersonation_url:impersonation.replace(project,'other')},{...adc,quota_project_id:'other'},
  {...adc,source_credentials:{...adc.source_credentials,quota_project_id:'other'}}]){
  const result=await diagnose({env:{},adc:unsafe,getToken:async()=>assert.fail('Unexpected authentication')});
  assert.equal(result.local.status,'failed');
 }
});

test('authentication failure suppresses raw details and prevents project requests',async()=>{
 const result=await diagnose({env:{},adc,getToken:async()=>{throw Object.assign(Error('private fixture'),{response:{status:403}});},
  fetchRequest:async()=>assert.fail('Unexpected request')});
 assert.deepEqual(result.identity,{status:'failed',http:403});
 assert.equal(result.database.status,'not-run');
 assert.doesNotMatch(JSON.stringify(result),/private fixture/);
});

test('permitted requests target only the fixed project and results omit content and identities',async()=>{
 const expected=[
  ['firestore.googleapis.com','/v1/'+database,'GET',{name:database,locationId:'asia-northeast3',type:'FIRESTORE_NATIVE'}],
  ['firestore.googleapis.com','/v1/'+collection,'GET',{documents:[{name:collection+'/hidden-id',fields:{private:'private fixture'}}]}],
  ['firestore.googleapis.com','/v1/'+collection+'/hidden-id','GET',{createTime:'2026-11-24T00:00:00Z'}],
  ['cloudresourcemanager.googleapis.com','/v1/'+resource+':getIamPolicy','POST',
   {bindings:[{members:['serviceAccount:'+reader],condition:{}},{members:['user:private@example.invalid']}]}],
  ['cloudresourcemanager.googleapis.com','/v1/'+resource+':testIamPermissions','POST',
   {permissions:['datastore.entities.get','datastore.entities.create','private fixture permission']}],
  ['firebaserules.googleapis.com','/v1/'+release,'GET',{name:release,rulesetName:ruleset}],
  ['firebaserules.googleapis.com','/v1/'+ruleset,'GET',{name:ruleset,source:{files:[{content:'private rules text'}]}}]
 ];
 let count=0;
 const result=await diagnose({env:{},adc:{...adc,universe_domain:'ignored'},
  getToken:async credentials=>{assert.deepEqual(credentials,adc);return 'private fixture token';},
  fetchRequest:async(raw,options)=>{
   const [host,path,method,data]=expected[count++];
   const url=new URL(raw);
   assert.equal(url.protocol,'https:');
   assert.equal(url.hostname,host);
   assert.equal(url.pathname,path);
   assert.equal(options.method,method);
   assert.equal(options.redirect,'error');
   if(path.endsWith(':getIamPolicy'))assert.deepEqual(JSON.parse(options.body),{options:{requestedPolicyVersion:3}});
   if(path.endsWith(':testIamPermissions'))assert.deepEqual(JSON.parse(options.body).permissions,[
    'datastore.databases.get','datastore.entities.list','datastore.entities.get',
    'resourcemanager.projects.getIamPolicy','firebaserules.releases.get','firebaserules.rulesets.get',
    'datastore.entities.create','datastore.entities.update'
   ]);
   return ok(data);
  }});
 assert.equal(count,expected.length);
 assert.ok(Object.values(result).every(check=>check.status==='passed'));
 assert.deepEqual(result.iam,{status:'passed',directBindings:1,conditionalBindings:1});
 assert.deepEqual(result.iamPermissions,{status:'passed',
  granted:['datastore.entities.get','datastore.entities.create'],
  attendanceWritePermissionsNotReturned:['datastore.entities.update']});
 assert.deepEqual(result.rules,{status:'passed',sourceFiles:1});
 assert.doesNotMatch(JSON.stringify(result),/private|hidden-id|@|rulesets/);
});

test('empty collection and denied optional scopes are distinguished from a failed connection',async()=>{
 const result=await diagnose({env:{},adc,getToken:async()=>'fixture',
  fetchRequest:async raw=>raw.includes('/documents/')?ok({}):deny()});
 assert.deepEqual(result.list,{status:'passed',sampleAvailable:false});
 assert.equal(result.document.status,'not-run');
 assert.equal(result.rules.status,'not-run');
 assert.deepEqual(result.iam,{status:'failed',http:403,reasons:['PERMISSION_DENIED','IAM_PERMISSION_DENIED']});
 assert.doesNotMatch(JSON.stringify(result),/raw fixture/);
});

test('permission check reports missing create and update without a data write',async()=>{
 const methods=[];
 const result=await diagnose({env:{},adc,getToken:async()=>'fixture',fetchRequest:async(raw,options)=>{
  const path=new URL(raw).pathname;
  methods.push([path,options.method]);
  if(path.endsWith(':testIamPermissions'))return ok({permissions:['datastore.entities.get']});
  if(path.endsWith('/attendance_test_v1'))return ok({});
  return deny();
 }});
 assert.deepEqual(result.iamPermissions.attendanceWritePermissionsNotReturned,[
  'datastore.entities.create','datastore.entities.update'
 ]);
 assert.ok(methods.every(([path,method])=>method==='GET'||/:(getIamPolicy|testIamPermissions)$/.test(path)));
});

test('database identity mismatch stops; unsafe rules and document names are not followed',async()=>{
 let calls=0;
 const mismatch=await diagnose({env:{},adc,getToken:async()=>'fixture',
  fetchRequest:async()=>{calls++;return ok({name:'projects/other/databases/(default)'});}});
 assert.equal(calls,1);
 assert.equal(mismatch.database.status,'failed');
 const result=await diagnose({env:{},adc,getToken:async()=>'fixture',fetchRequest:async raw=>{
  const url=new URL(raw);
  if(url.pathname.endsWith('/attendance_test_v1'))return ok({documents:[{name:collection+'/../unsafe'}]});
  if(url.pathname.endsWith('cloud.firestore'))return ok({name:release,rulesetName:'projects/other/rulesets/unsafe'});
  if(/:(getIamPolicy|testIamPermissions)$/.test(url.pathname))return ok({});
  assert.equal(url.pathname,'/v1/'+database);
  return ok({name:database});
 }});
 assert.equal(result.document.status,'not-run');
 assert.equal(result.release.status,'failed');
 assert.equal(result.rules.status,'not-run');
});
