'use strict';

const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const PROJECT='mungtheland-guardian-test';
const READER='mungtheland-guardian-reader@'+PROJECT+'.iam.gserviceaccount.com';
const IMPERSONATION_URL='https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+READER+':generateAccessToken';
const DATABASE='projects/'+PROJECT+'/databases/(default)';
const DOCUMENTS=DATABASE+'/documents/attendance_test_v1';
const RELEASE='projects/'+PROJECT+'/releases/cloud.firestore';
const FIRESTORE='https://firestore.googleapis.com/v1/';
const RULES='https://firebaserules.googleapis.com/v1/';
const PROJECT_IAM='https://cloudresourcemanager.googleapis.com/v1/projects/'+PROJECT;
const READ_PERMISSIONS=['datastore.databases.get','datastore.entities.list','datastore.entities.get',
 'resourcemanager.projects.getIamPolicy','firebaserules.releases.get','firebaserules.rulesets.get'];
const ATTENDANCE_WRITE_PERMISSIONS=['datastore.entities.create','datastore.entities.update'];
const CHECKED_PERMISSIONS=[...READ_PERMISSIONS,...ATTENDANCE_WRITE_PERMISSIONS];
const ERROR_REASONS=new Set(['IAM_PERMISSION_DENIED','ACCESS_TOKEN_SCOPE_INSUFFICIENT','SERVICE_DISABLED','API_DISABLED',
 'PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','USER_PROJECT_DENIED']);
const NETWORK_CODES=new Set(['EACCES','EPERM','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNREFUSED','ECONNRESET','UND_ERR_CONNECT_TIMEOUT']);

function checkLocalConfiguration(env,adc){
 if(['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT'].some(key=>env[key]&&env[key]!==PROJECT)||
  ['GOOGLE_APPLICATION_CREDENTIALS','CLOUDSDK_CONFIG','FIREBASE_CONFIG','FIRESTORE_EMULATOR_HOST',
   'FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_CLOUD_QUOTA_PROJECT'].some(key=>env[key])||
  ['MD_TEST_ATTENDANCE_FIRESTORE','MD_TEST_ATTENDANCE_PERSIST','MD_TEST_ARRIVAL_WRITE'].some(key=>env[key]==='enabled'))
  throw Error('Conflicting test project configuration');
 const source=adc?.source_credentials;
 if(adc?.type!=='impersonated_service_account'||adc.service_account_impersonation_url!==IMPERSONATION_URL||
  (adc.quota_project_id&&adc.quota_project_id!==PROJECT)||source?.type!=='authorized_user'||
  (source.quota_project_id&&source.quota_project_id!==PROJECT)||
  !['client_id','client_secret','refresh_token'].every(key=>typeof source[key]==='string'&&source[key]))
  throw Error('Unexpected test ADC identity');
 // Keep only recognized ADC fields so unrelated endpoint or quota overrides cannot affect the probe.
 return {type:adc.type,service_account_impersonation_url:IMPERSONATION_URL,
  source_credentials:{type:source.type,client_id:source.client_id,client_secret:source.client_secret,refresh_token:source.refresh_token}};
}

function failure(error){
 const http=error?.response?.status;
 const code=error?.cause?.code??error?.code;
 return {status:'failed',...(Number.isInteger(http)?{http}:{}),...(NETWORK_CODES.has(code)?{networkError:code}:{})};
}

async function diagnose({env,adc,getToken,fetchRequest=fetch}){
 const checks={local:{status:'not-run'},identity:{status:'not-run'},database:{status:'not-run'},
  list:{status:'not-run'},document:{status:'not-run'},iam:{status:'not-run'},iamPermissions:{status:'not-run'},
  release:{status:'not-run'},rules:{status:'not-run'}};
 let credential,token;
 try{credential=checkLocalConfiguration(env,adc);checks.local={status:'passed'};}
 catch{checks.local={status:'failed'};return checks;}
 try{
  token=await getToken(credential);
  if(typeof token!=='string'||!token)throw Error('No token');
  checks.identity={status:'passed'};
 }catch(error){checks.identity=failure(error);return checks;}

 const inspect=async(key,url,parse,body)=>{
  try{
   const response=await fetchRequest(url,{
    method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
   });
   if(!response.ok){
    const data=await response.json().catch(()=>null);
    const reasons=[data?.error?.status,...(Array.isArray(data?.error?.details)?data.error.details.map(item=>item?.reason):[])]
     .filter(reason=>ERROR_REASONS.has(reason));
    checks[key]={status:'failed',http:response.status,...(reasons.length?{reasons:[...new Set(reasons)]}:{})};
    return;
   }
   const result=parse(await response.json());
   checks[key]={status:'passed',...result.summary};
   return result.next;
  }catch(error){checks[key]=failure(error);}
 };
 let targetMatches=true;
 await inspect('database',FIRESTORE+DATABASE+'?fields=name,locationId,type,databaseEdition,deleteTime,firestoreDataAccessMode',data=>{
  if(data?.name!==DATABASE){targetMatches=false;throw Error('Unexpected database identity');}
  const allow=(value,options)=>options.includes(value)?value:undefined;
  return {summary:{
   location:typeof data.locationId==='string'&&/^[a-z0-9-]{2,30}$/.test(data.locationId)?data.locationId:undefined,
   type:allow(data.type,['FIRESTORE_NATIVE','DATASTORE_MODE']),
   edition:allow(data.databaseEdition,['STANDARD','ENTERPRISE']),
   dataAccess:allow(data.firestoreDataAccessMode,['DATA_ACCESS_MODE_ENABLED','DATA_ACCESS_MODE_DISABLED']),
   deleted:Boolean(data.deleteTime)
  }};
 });
 if(!targetMatches)return checks;
 const documentPath=await inspect('list',FIRESTORE+DOCUMENTS+'?pageSize=1&fields=documents(name)',data=>{
  if(!data||typeof data!=='object'||Array.isArray(data)||data.documents!==undefined&&!Array.isArray(data.documents))throw Error('Invalid list');
  const name=data.documents?.[0]?.name;
  const prefix=DOCUMENTS+'/';
  if(data.documents?.length&&(typeof name!=='string'||!name.startsWith(prefix)||!/^[A-Za-z0-9_-]{1,68}$/.test(name.slice(prefix.length))))
   return {summary:{sampleAvailable:true},next:null};
  return {summary:{sampleAvailable:Boolean(name)},next:name};
 });
 if(documentPath)await inspect('document',FIRESTORE+documentPath+'?fields=createTime',data=>{
  if(typeof data.createTime!=='string')throw Error('Invalid document metadata');
  return {};
 });
 // getIamPolicy uses POST for its request envelope. It reads the policy and does not set it.
 await inspect('iam',PROJECT_IAM+':getIamPolicy',data=>{
  if(!data||typeof data!=='object'||Array.isArray(data)||data.bindings!==undefined&&!Array.isArray(data.bindings))throw Error('Invalid IAM policy');
  const direct=(data.bindings||[]).filter(binding=>binding?.members?.includes('serviceAccount:'+READER));
  return {summary:{directBindings:direct.length,conditionalBindings:direct.filter(binding=>binding.condition).length}};
 },{options:{requestedPolicyVersion:3}});
 // Tests only existing permissions at project scope. No policy membership is changed.
 await inspect('iamPermissions',PROJECT_IAM+':testIamPermissions',data=>{
  if(!data||typeof data!=='object'||Array.isArray(data)||data.permissions!==undefined&&!Array.isArray(data.permissions))
   throw Error('Invalid permissions response');
  return {summary:{
   granted:CHECKED_PERMISSIONS.filter(permission=>data.permissions?.includes(permission)),
   attendanceWritePermissionsNotReturned:ATTENDANCE_WRITE_PERMISSIONS.filter(permission=>!data.permissions?.includes(permission))
  }};
 },{permissions:CHECKED_PERMISSIONS});
 const ruleset=await inspect('release',RULES+RELEASE+'?fields=name,rulesetName',data=>{
  const prefix='projects/'+PROJECT+'/rulesets/';
  if(data.name!==RELEASE||typeof data.rulesetName!=='string'||!data.rulesetName.startsWith(prefix)||
   !/^[a-zA-Z0-9_-]{1,128}$/.test(data.rulesetName.slice(prefix.length)))throw Error('Unexpected published rules target');
  return {next:data.rulesetName};
 });
 if(ruleset)await inspect('rules',RULES+ruleset+'?fields=name,source(files(content))',data=>{
  if(data.name!==ruleset||!Array.isArray(data.source?.files)||!data.source.files.length||
   !data.source.files.every(file=>typeof file.content==='string'))throw Error('Invalid ruleset');
  return {summary:{sourceFiles:data.source.files.length}};
 });
 return checks;
}

function readDefaultAdc(env){
 return JSON.parse(readFileSync(join(env.APPDATA,'gcloud','application_default_credentials.json'),'utf8'));
}

async function getTestAccessToken(credentials){
 const {google}=require('googleapis');
 const auth=new google.auth.GoogleAuth({
  projectId:PROJECT,credentials,scopes:['https://www.googleapis.com/auth/cloud-platform']
 });
 return auth.getAccessToken();
}

async function main(){
 if(process.argv.length!==2)throw Error('This probe has no target or write options');
 const env=process.env;
 const checks=await diagnose({env,adc:readDefaultAdc(env),getToken:getTestAccessToken});
 process.stdout.write(JSON.stringify(checks,null,2)+'\n');
 if(Object.values(checks).some(check=>check.status==='failed'))process.exitCode=1;
}

if(require.main===module)main().catch(()=>{
 process.stderr.write('Read-only diagnostic stopped because its local prerequisites were not met.\n');
 process.exitCode=1;
});
module.exports={diagnose,checkLocalConfiguration,readDefaultAdc,getTestAccessToken,PROJECT};
