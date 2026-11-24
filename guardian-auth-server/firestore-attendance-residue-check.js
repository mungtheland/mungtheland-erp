'use strict';

const {isDeepStrictEqual}=require('node:util');
const {EMULATOR_HOST,EMULATOR_PROJECT}=require('./firestore-attendance-store');
const {target,CLOUD,collectionPath,missingDocument,validVersion,validDocumentId,fixtureFields,
 fingerprint,httpClient,cloudClient,checkCloudDatabase}=require('./firestore-attendance-probe-target');

function parseEvidence(args){
 const [option,id,expectedFingerprint,createdUpdateTime]=args;
 if(args.length<2||args.length>4||option!=='--inspect'||!validDocumentId(id)||
  (expectedFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(expectedFingerprint))||
  (createdUpdateTime!==undefined&&!validVersion(createdUpdateTime)))return null;
 return {id,expectedFingerprint,createdUpdateTime};
}

async function inspect({base,project,request,evidence}){
 const {id,expectedFingerprint,createdUpdateTime}=evidence;
 const name=collectionPath(project)+'/'+id;
 try{
  const response=await request('GET',base+name);
  if(missingDocument(response))return {status:'absent',documentId:id};
  if(response.status!==200)return {
   status:[401,403].includes(response.status)?'blocked':'failed',phase:'read',http:response.status
  };
  if(response.body?.name!==name||!validVersion(response.body.updateTime))return {status:'failed',phase:'read'};
  const {fields,updateTime}=response.body;
  const runId=id.slice('RSV-PROBE-'.length).toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
  const at=fields?.events?.arrayValue?.values?.[0]?.mapValue?.fields?.at?.stringValue;
  const fixtureMatches=validVersion(at)&&isDeepStrictEqual(fields,fixtureFields(id,runId,at));
  const fingerprintMatches=expectedFingerprint&&fixtureMatches?fingerprint(fields)===expectedFingerprint:null;
  const versionMatches=createdUpdateTime?updateTime===createdUpdateTime:null;
  return {status:'present',documentId:id,fixtureMatches,fingerprintMatches,versionMatches,
   evidenceMatches:fixtureMatches&&fingerprintMatches===true&&versionMatches===true};
 }catch{return {status:'failed',phase:'read'};}
}

async function runCloudResidueCheck({args,env,fetchRequest=fetch,loadAdc,getToken}){
 if(args.length===0)return {status:'dry-run',target,operation:'read-only'};
 const evidence=parseEvidence(args);
 if(!evidence)return {status:'failed',phase:'arguments'};
 let phase='identity';
 try{
  const request=await cloudClient({env,fetchRequest,loadAdc,getToken});
  phase='database';
  const metadata=await checkCloudDatabase(request);
  if(!metadata.matches)return {status:[401,403].includes(metadata.http)?'blocked':'failed',phase,http:metadata.http};
  return inspect({base:CLOUD,project:target.project,request,evidence});
 }catch{return {status:'failed',phase};}
}

async function runEmulatorResidueCheck({args,env,fetchRequest=fetch}){
 if(env.FIRESTORE_EMULATOR_HOST!==EMULATOR_HOST)throw Error('Dedicated emulator required');
 const evidence=parseEvidence(args);
 if(!evidence)return {status:'failed',phase:'arguments'};
 return inspect({base:'http://'+EMULATOR_HOST+'/v1/',project:EMULATOR_PROJECT,request:httpClient(fetchRequest,'owner'),evidence});
}

if(require.main===module){
 runCloudResidueCheck({args:process.argv.slice(2),env:process.env}).then(result=>{
  console.log(JSON.stringify(result));
  if(['failed','blocked'].includes(result.status))process.exitCode=1;
 });
}
module.exports={runCloudResidueCheck,runEmulatorResidueCheck};
