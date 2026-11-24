'use strict';

const {randomUUID}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {EMULATOR_HOST,EMULATOR_PROJECT}=require('./firestore-attendance-store');
const {target,CLOUD,databasePath,collectionPath,missingDocument,validVersion,fixtureFields,
 fingerprint,httpClient,cloudClient,checkCloudDatabase}=require('./firestore-attendance-probe-target');
const PROJECT_IAM='https://cloudresourcemanager.googleapis.com/v1/projects/'+target.project+':testIamPermissions';
const PERMISSIONS=['datastore.entities.get','datastore.entities.create','datastore.entities.delete'];
const APPROVAL='--execute-approved-test-write';

async function probe({base,project,request,runId=randomUUID(),onCreateAttempt=()=>{},onCreateConfirmed=()=>{}}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId))
  throw Error('Invalid probe run ID');
 const documentId='RSV-PROBE-'+runId.replaceAll('-','').toUpperCase();
 const documents=databasePath(project)+'/documents';
 const collection=collectionPath(project);
 const name=collection+'/'+documentId;
 const documentUrl=base+name;
 const fields=fixtureFields(documentId,runId,new Date().toISOString());
 const expectedFingerprint=fingerprint(fields);
 let phase='absence',response,createAttempted=false,createdUpdateTime;
 const failed=()=>({status:'failed',phase,...(response?{http:response.status}:{}),
  ...(createAttempted?{documentId,cleanup:'unconfirmed'}:{}),
  ...(createdUpdateTime?{createdUpdateTime}:{})});
 try{
  response=await request('GET',documentUrl);
  if(!missingDocument(response))return failed();
  phase='create';response=undefined;
  onCreateAttempt(documentId,expectedFingerprint);
  createAttempted=true;
  // createDocument with an explicit ID fails on collision, including a race after the absence check.
  response=await request('POST',base+collection+'?documentId='+documentId,{fields});
  const version=response.body?.updateTime;
  if(response.status!==200||response.body?.name!==name||
   !validVersion(version)||
   !isDeepStrictEqual(response.body.fields,fields))return failed();
  createdUpdateTime=version;
  onCreateConfirmed(documentId,expectedFingerprint,createdUpdateTime);
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

async function runCloudProbe({args,env,fetchRequest=fetch,loadAdc,getToken,onCreateAttempt,onCreateConfirmed}){
 if(args.length===0)return {status:'dry-run',target};
 if(args.length!==2||args[0]!==APPROVAL||args[1]!==target.project)return {status:'failed',phase:'approval'};
 let phase='identity';
 try{
  const request=await cloudClient({env,fetchRequest,loadAdc,getToken});
  phase='database';
  const metadata=await checkCloudDatabase(request);
  if(!metadata.matches)return {status:'failed',phase,http:metadata.http};
  phase='permissions';
  const policy=await request('POST',PROJECT_IAM,{permissions:PERMISSIONS});
  if(policy.status!==200||!Array.isArray(policy.body?.permissions)||
   !PERMISSIONS.every(permission=>policy.body.permissions.includes(permission)))return {status:'failed',phase,http:policy.status};
  return probe({base:CLOUD,project:target.project,request,onCreateAttempt,onCreateConfirmed});
 }catch{return {status:'failed',phase};}
}

async function runEmulatorProbe({env,fetchRequest=fetch,runId,onCreateAttempt,onCreateConfirmed}){
 if(env.FIRESTORE_EMULATOR_HOST!==EMULATOR_HOST)throw Error('Dedicated emulator required');
 return probe({base:'http://'+EMULATOR_HOST+'/v1/',project:EMULATOR_PROJECT,request:httpClient(fetchRequest,'owner'),
  runId,onCreateAttempt,onCreateConfirmed});
}

if(require.main===module){
 runCloudProbe({
  args:process.argv.slice(2),env:process.env,
  onCreateAttempt:(documentId,expectedFingerprint)=>console.log(JSON.stringify({phase:'create-attempt',documentId,expectedFingerprint})),
  onCreateConfirmed:(documentId,expectedFingerprint,createdUpdateTime)=>console.log(JSON.stringify({
   phase:'create-confirmed',documentId,expectedFingerprint,createdUpdateTime
  }))
 }).then(result=>{
  console.log(JSON.stringify(result));
  if(result.status==='failed')process.exitCode=1;
 });
}
module.exports={runCloudProbe,runEmulatorProbe};
