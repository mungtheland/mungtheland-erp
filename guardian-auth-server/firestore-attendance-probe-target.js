'use strict';

const {createHash}=require('node:crypto');
const {checkLocalConfiguration,readDefaultAdc,getTestAccessToken,PROJECT}=require('./firestore-readonly-diagnostic');

const target=Object.freeze({project:PROJECT,database:'(default)',collection:'attendance_test_v1',location:'asia-northeast3'});
const CLOUD='https://firestore.googleapis.com/v1/';
const databasePath=project=>'projects/'+project+'/databases/'+target.database;
const collectionPath=project=>databasePath(project)+'/documents/'+target.collection;
const missingDocument=response=>response.status===404&&response.body?.error?.status==='NOT_FOUND';
const validVersion=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const validDocumentId=id=>typeof id==='string'&&/^RSV-PROBE-[A-F0-9]{12}4[A-F0-9]{3}[89AB][A-F0-9]{15}$/.test(id);
const stringValue=value=>({stringValue:value});

function fixtureFields(documentId,runId,at){
 return {
  bookingId:stringValue(documentId),state:stringValue('등원 중'),probeRunId:stringValue(runId),
  events:{arrayValue:{values:[{mapValue:{fields:{
   bookingId:stringValue(documentId),eventId:stringValue('EVT-'+runId),action:stringValue('check-in'),
   staffId:stringValue('STAFF-PROBE'),at:stringValue(at)
  }}}]}}
 };
}

function fingerprint(fields){
 const ordered=value=>{
  if(Array.isArray(value))return value.map(ordered);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])]));
  return value;
 };
 return createHash('sha256').update(JSON.stringify(ordered(fields))).digest('hex');
}

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

async function cloudClient({env,fetchRequest,loadAdc=readDefaultAdc,getToken=getTestAccessToken}){
 const credentials=checkLocalConfiguration(env,loadAdc(env));
 const token=await getToken(credentials);
 if(typeof token!=='string'||!token)throw Error('Unexpected diagnostic identity');
 return httpClient(fetchRequest,token);
}

async function checkCloudDatabase(request){
 const database=databasePath(target.project);
 const metadata=await request('GET',CLOUD+database+'?fields=name,locationId,type,deleteTime,firestoreDataAccessMode');
 return {http:metadata.status,matches:metadata.status===200&&metadata.body?.name===database&&metadata.body?.locationId===target.location&&
  metadata.body?.type==='FIRESTORE_NATIVE'&&!metadata.body?.deleteTime&&metadata.body?.firestoreDataAccessMode!=='DATA_ACCESS_MODE_DISABLED'};
}

module.exports={target,CLOUD,databasePath,collectionPath,missingDocument,validVersion,validDocumentId,fixtureFields,
 fingerprint,httpClient,cloudClient,checkCloudDatabase};
