'use strict';
// Opt-in, loopback-only authenticated HTTP race. Never accesses production ERP or Sheets.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createStaffAuthenticator}=require('./staff-authenticate');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const PROJECT='mungtheland-guardian-test';
async function main(){
 if(process.env.MD_RUN_LIVE_ATTENDANCE_TEST!=='YES'||process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Isolated live test opt-in required');
 const ids=[1,2].map(i=>({uid:process.env[i===1?'MD_TEST_STAFF_UID':'MD_TEST_STAFF_2_UID'],email:process.env[i===1?'MD_TEST_STAFF_EMAIL':'MD_TEST_STAFF_2_EMAIL'],staffId:process.env[i===1?'MD_TEST_STAFF_ID':'MD_TEST_STAFF_2_ID']}));
 if(ids.some(x=>!x.uid||!x.email||!/^STAFF-TEST-00[12]$/.test(x.staffId))||new Set(ids.map(x=>x.uid)).size!==2||new Set(ids.map(x=>x.staffId)).size!==2)throw Error('Two distinct test staff mappings required');
 const bookingId='RSV-HTTP-'+randomUUID().replace(/-/g,'').toUpperCase();
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'staff-http-race-'+randomUUID());
 const db=getFirestore(app),store=createFirestoreAttendanceStore({db,projectId:PROJECT});
 const auth=createStaffAuthenticator({firebaseAuth:getAuth(app),projectId:PROJECT,accountStore:{findByFirebaseUid:async uid=>ids.find(x=>x.uid===uid)?{...ids.find(x=>x.uid===uid),status:'active'}:null}});
 const repo={findById:async id=>id===bookingId?{bookingId:id,status:'예약',dogName:'HTTP가상멍이',visitDate:'2026-11-07'}:null,listForStaff:async()=>[{bookingId,status:'예약',dogName:'HTTP가상멍이',visitDate:'2026-11-07'}]};
 const attendance=createStaffAttendanceService({bookingRepository:repo,store});
 const handler=createStaffArrivalHttpHandler({authenticateStaff:auth,staffAttendance:attendance,bookingRepository:repo,staffArrival:{},writeEnabled:false});
 const port=8788;
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&new URL(req.url,'http://localhost').pathname==='/staff-http-race'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; style-src 'unsafe-inline'; frame-ancestors 'none'"});
   fs.createReadStream(path.join(__dirname,'staff-http-race.html')).pipe(res);return;
  }
  if(req.method==='GET'&&req.url==='/test-booking'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({bookingId}));return;}
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:'+port){res.writeHead(403);res.end();return;}
  if(new URL(req.url,'http://localhost').pathname.startsWith('/api/staff/bookings/')){void handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});return;}
  res.writeHead(404);res.end();
 });
 server.listen(port,'127.0.0.1',()=>console.log('[http-race] isolated test on http://127.0.0.1:'+port+'/staff-http-race booking='+bookingId));
}
main().catch(e=>{console.error('[http-race] startup failed:',e.message);process.exitCode=1;});
