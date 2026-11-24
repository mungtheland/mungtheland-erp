'use strict';

const {randomUUID}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {checkLocalConfiguration,readDefaultAdc,getTestAccessToken,PROJECT}=require('./firestore-readonly-diagnostic');
const {EMULATOR_HOST,EMULATOR_PROJECT}=require('./firestore-attendance-store');

const REGION='asia-northeast3';
const DATABASE='(default)';
const COLLECTION='attendance_test_v1';
const CLOUD='https://firestore.googleapis.com/v1/';
const PROJECT_IAM='https://cloudresourcemanager.googleapis.com/v1/projects/'+PROJECT+':testIamPermissions';
const PERMISSIONS=['datastore.entities.get','datastore.entities.create','datastore.entities.delete'];
const APPROVAL='--execute-approved-test-write';
const target={project:PROJECT,database:DATABASE,collection:COLLECTION,location:REGION};

function httpClient(fetchRequest,token){
 return async(method,url,body)=>{
  const response=await fetchRequest(url,{
   method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:response.status,body:response.status===204?null:await response.json().catch(()=>null)};
 };
}

const missingDocument=response=>response.status===404&&response.body?.error?.status==='NOT_FOUND';
const stringValue=value=>({stringValue:value});

async function probe({base,project,request,runId=randomUUID(),onCreateAttempt=()=>{}}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId))
  throw Error('Invalid probe run ID');
 const documentId='RSV-PROBE-'+runId.replaceAll('-','').toUpperCase();
 const documents='projects/'+project+'/databases/'+DATABASE+'/documents';
 const collection=documents+'/'+COLLECTION;
 const name=collection+'/'+documentId;
 const documentUrl=base+name;
 const fields={
  bookingId:stringValue(documentId),state:stringValue('등원 중'),probeRunId:stringValue(runId),
  events:{arrayValue:{values:[{mapValue:{fields:{
   bookingId:stringValue(documentId),eventId:stringValue('EVT-'+runId),action:stringValue('check-in'),
   staffId:stringValue('STAFF-PROBE'),at:stringValue(new Date().toISOString())
  }}}]}}
 };
 let phase='absence',response,createAttempted=false,createdUpdateTime;
 const failed=()=>({status:'failed',phase,...(response?{http:response.status}:{}),
  ...(createAttempted?{documentId,cleanup:'unconfirmed'}:{}),
  ...(createdUpdateTime?{createdUpdateTime}:{})});
 try{
  response=await request('GET',documentUrl);
  if(!missingDocument(response))return failed();
  phase='create';response=undefined;
  onCreateAttempt(documentId);
  createAttempted=true;
  // createDocument with an explicit ID fails on collision, including a race after the absence check.
  response=await request('POST',base+collection+'?documentId='+documentId,{fields});
  const version=response.body?.updateTime;
  if(response.status!==200||response.body?.name!==name||
   typeof version!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(version)||
   !isDeepStrictEqual(response.body.fields,fields))return failed();
  createdUpdateTime=version;
  phase='read';response=undefined;
  response=await request('GET',documentUrl);
  if(response.status!==200||response.body?.name!==name||response.body?.updateTime!==version||
   !isDeepStrictEqual(response.body.fields,fields))return failed();
  phase='delete';response=undefined;
  // If anything changed after creation, Firestore itself refuses deletion.
  response=await request('POST',base+documents+':commit',{writes:[{delete:name,currentDocument:{updateTime:version}}]});
  if(response.status!==200)return failed();
  phase='verifyDeletion';response=undefined;
  response=await request('GET',documentUrl);
  if(!missingDocument(response))return failed();
  return {status:'passed',documentId,cleanup:'confirmed'};
 }catch{return failed();}
}

async function runCloudProbe({args,env,fetchRequest=fetch,loadAdc=readDefaultAdc,getToken=getTestAccessToken,onCreateAttempt}){
 if(args.length===0)return {status:'dry-run',target};
 if(args.length!==2||args[0]!==APPROVAL||args[1]!==PROJECT)return {status:'failed',phase:'approval'};
 let phase='identity';
 try{
  const credentials=checkLocalConfiguration(env,loadAdc(env));
  const token=await getToken(credentials);
  if(typeof token!=='string'||!token)return {status:'failed',phase};
  const request=httpClient(fetchRequest,token);
  phase='database';
  const database='projects/'+PROJECT+'/databases/'+DATABASE;
  const metadata=await request('GET',CLOUD+database+'?fields=name,locationId,type,deleteTime,firestoreDataAccessMode');
  if(metadata.status!==200||metadata.body?.name!==database||metadata.body?.locationId!==REGION||
   metadata.body?.type!=='FIRESTORE_NATIVE'||metadata.body?.deleteTime||
   metadata.body?.firestoreDataAccessMode==='DATA_ACCESS_MODE_DISABLED')return {status:'failed',phase,http:metadata.status};
  phase='permissions';
  const policy=await request('POST',PROJECT_IAM,{permissions:PERMISSIONS});
  if(policy.status!==200||!Array.isArray(policy.body?.permissions)||
   !PERMISSIONS.every(permission=>policy.body.permissions.includes(permission)))return {status:'failed',phase,http:policy.status};
  return probe({base:CLOUD,project:PROJECT,request,onCreateAttempt});
 }catch{return {status:'failed',phase};}
}

async function runEmulatorProbe({env,fetchRequest=fetch,runId}){
 if(env.FIRESTORE_EMULATOR_HOST!==EMULATOR_HOST)throw Error('Dedicated emulator required');
 return probe({base:'http://'+EMULATOR_HOST+'/v1/',project:EMULATOR_PROJECT,request:httpClient(fetchRequest,'owner'),runId});
}

if(require.main===module){
 runCloudProbe({
  args:process.argv.slice(2),env:process.env,
  onCreateAttempt:documentId=>console.log(JSON.stringify({phase:'create-attempt',documentId}))
 }).then(result=>{
  console.log(JSON.stringify(result));
  if(result.status==='failed')process.exitCode=1;
 });
}
module.exports={runCloudProbe,runEmulatorProbe};
