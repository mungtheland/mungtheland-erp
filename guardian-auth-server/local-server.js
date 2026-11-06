'use strict';
/**
 * Loopback-only development API. Requires Application Default Credentials
 * and a pre-provisioned, server-owned guardian mapping; never maps the
 * currently logged-in user automatically.
 */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createGuardianAuthenticator}=require('./authenticate');
const {createGuardianBookingHttpHandler}=require('./booking-http');
const {createArrivalRequestService}=require('./arrival-request');
const {createStaffAuthenticator}=require('./staff-authenticate');
const {createStaffArrivalService}=require('./staff-arrival');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
const {createStaffAttendanceService}=require('./staff-attendance');
const {createIsolatedAttendanceStore}=require('./isolated-attendance-store');
const {createIsolatedSheetsBookingRepository,TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
async function main(){
 const {getAuth}=require('firebase-admin/auth');
 const {initializeApp,applicationDefault}=require('firebase-admin/app');
 const {google}=require('googleapis');
 const projectId='mungtheland-guardian-test';
 const uid=process.env.MD_TEST_GUARDIAN_UID;
 const email=process.env.MD_TEST_GUARDIAN_EMAIL;
 if(!uid||!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Explicit test UID and email are required');
 if(process.env.GOOGLE_CLOUD_PROJECT!==projectId)throw Error('Wrong Google Cloud project');
 const app=initializeApp({credential:applicationDefault(),projectId});
 const firebaseAuth=getAuth(app);
 const arrivalWriteEnabled=process.env.MD_TEST_ARRIVAL_WRITE==='enabled';
 const attendancePersistEnabled=process.env.MD_TEST_ATTENDANCE_PERSIST==='enabled';
 const googleAuth=new google.auth.GoogleAuth({scopes:[arrivalWriteEnabled||attendancePersistEnabled?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth:googleAuth});
 // Optional second, independently authenticated test guardian for real cross-customer denial.
 // This is an explicit, server-owned test mapping; never accept customerId from the browser.
 const otherUid=process.env.MD_TEST_OTHER_GUARDIAN_UID;
 const otherEmail=process.env.MD_TEST_OTHER_GUARDIAN_EMAIL;
 if(Boolean(otherUid)!==Boolean(otherEmail))throw Error('Both secondary test UID and email are required');
 if(otherUid&&(!/^\S+@\S+\.\S+$/.test(otherEmail)||otherUid===uid||
    otherEmail.toLowerCase()===email.toLowerCase()))throw Error('Invalid secondary test guardian');
 const accountStore={findByFirebaseUid:async candidate=>{
  if(candidate===uid)return {customerId:'CUS-TEST-001',email:email.toLowerCase(),status:'active'};
  if(otherUid&&candidate===otherUid)return {customerId:'CUS-TEST-OTHER',email:otherEmail.toLowerCase(),status:'active'};
  return null;
 }};
 const baseAuthenticate=createGuardianAuthenticator({firebaseAuth,accountStore,projectId,onDiagnostic:code=>process.stderr.write('[guardian-test] '+code+'\n')});
 const authenticateGuardian=async token=>{
  try{return await baseAuthenticate(token);}catch(_){process.stderr.write('[guardian-test] AUTH_STAGE_FAILED (token verification or test mapping)\n');throw Error('Authentication failed');}
 };
 const baseRepository=createIsolatedSheetsBookingRepository({sheets,spreadsheetId:TEST_SPREADSHEET_ID});
 const bookingRepository={listForStaff:async()=>baseRepository.listForStaff(),findByCustomerId:async customerId=>baseRepository.findByCustomerId(customerId),findById:async bookingId=>{
  try{const booking=await baseRepository.findById(bookingId);
   process.stderr.write('[guardian-test] BOOKING_STAGE_'+(booking?'FOUND':'NOT_FOUND')+'\n');return booking;
  }catch(_){process.stderr.write('[guardian-test] BOOKING_STAGE_ERROR (read-only Sheets access or schema)\n');throw Error('Booking lookup failed');}
 }};
 // Staff test identity must be explicitly provisioned by server operator.
 const staffUid=process.env.MD_TEST_STAFF_UID;
 const staffEmail=process.env.MD_TEST_STAFF_EMAIL;
 const staffId=process.env.MD_TEST_STAFF_ID;
 if([staffUid,staffEmail,staffId].some(Boolean)&&![staffUid,staffEmail,staffId].every(Boolean))throw Error('All staff test identity settings are required');
 if(staffUid&&(staffUid===uid||staffUid===otherUid||!/^\S+@\S+\.\S+$/.test(staffEmail)||!/^STAFF-[A-Z0-9-]{1,64}$/.test(staffId)))throw Error('Invalid staff test identity');
 const staffStore={findByFirebaseUid:async candidate=>candidate===staffUid&&staffUid?{staffId,email:staffEmail.toLowerCase(),status:'active'}:null};
 const authenticateStaff=createStaffAuthenticator({firebaseAuth,accountStore:staffStore,projectId});
 const staffArrival=createStaffArrivalService({sheets,bookingRepository});
 const attendanceStore=attendancePersistEnabled?createIsolatedAttendanceStore({sheets,spreadsheetId:TEST_SPREADSHEET_ID}):null;
 const staffAttendance=createStaffAttendanceService({bookingRepository,store:attendanceStore});
 process.stdout.write('[staff-test] Attendance mode: '+(attendancePersistEnabled?'isolated Sheets event log':'process-local simulation')+'\n');
 const handleStaffArrival=createStaffArrivalHttpHandler({authenticateStaff,staffArrival,staffAttendance,bookingRepository,writeEnabled:arrivalWriteEnabled});
 const handle=createGuardianBookingHttpHandler({authenticateGuardian,bookingRepository});
 const arrival=createArrivalRequestService({sheets,bookingRepository});
 async function handleArrival(req,res){
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const match=/^\/api\/guardian\/bookings\/(RSV-[A-Z0-9-]{1,64})\/arrival-request$/.exec(new URL(req.url,'http://localhost').pathname);
  if(!match)return false;
  if(!['GET','PUT'].includes(req.method)){send(405,{error:'Method not allowed'});return true;}
  const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!bearer){send(401,{error:'Authentication required'});return true;}
  try{
   const principal=await authenticateGuardian(bearer[1]);
   if(!principal||principal.role!=='guardian'||!principal.customerId)throw Error('Access denied');
   if(req.method==='GET'){send(200,{request:await arrival.get(principal.customerId,match[1])});return true;}
   if(!arrivalWriteEnabled){send(503,{error:'Test write not enabled'});return true;}
   let raw='';
   for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Payload too large');}
   const data=JSON.parse(raw);
   const result=await arrival.save(principal.customerId,match[1],data,data.expectedRevision);
   send(200,result);
  }catch(err){process.stderr.write('[guardian-test] ARRIVAL_REQUEST_FAILED\n');if(err.message==='Revision conflict'){send(409,{error:'Revision conflict'});}else{send(403,{error:'Access denied or request rejected'});}}
  return true;
 }
 const port=Number(process.env.PORT||8787);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
 http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/staff-local-test'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; style-src 'unsafe-inline'; frame-ancestors 'none'"});
   fs.createReadStream(path.join(__dirname,'staff-local-test.html')).pipe(res);return;
  }
  if(req.method==='GET'&&(req.url==='/local-test'||req.url==='/local-test?')){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
   fs.createReadStream(path.join(__dirname,'local-test.html')).pipe(res);return;
  }
  if(req.method==='OPTIONS'&&req.headers.origin==='https://mungtheland-guardian-test.web.app'){
   res.writeHead(204,{'Access-Control-Allow-Origin':'https://mungtheland-guardian-test.web.app','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization','Access-Control-Max-Age':'600','Vary':'Origin'});res.end();return;
  }
  res.setHeader('Access-Control-Allow-Origin','https://mungtheland-guardian-test.web.app');
  res.setHeader('Vary','Origin');
  // Browsers send Origin on same-origin PUT requests. Accept only this loopback origin
  // or the explicitly allowed test Hosting origin; do not allow arbitrary origins.
  const localOrigin='http://127.0.0.1:'+port;
  if(req.headers.origin&&req.headers.origin!==localOrigin&&req.headers.origin!=='https://mungtheland-guardian-test.web.app'){
   res.writeHead(403);res.end();return;
  }
  if(new URL(req.url,'http://localhost').pathname==='/api/staff/bookings'||/^\/api\/staff\/bookings\/RSV-[A-Z0-9-]{1,64}\/(?:arrival-request(?:\/acknowledge)?|attendance(?:\/(?:check-in|check-out))?)(?:\?|$)/.test(req.url)){
   void handleStaffArrival(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});return;
  }
  if(/^\/api\/guardian\/bookings\/RSV-[A-Z0-9-]{1,64}\/arrival-request(?:\?|$)/.test(req.url)){
   void handleArrival(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});return;
  }
  void handle(req,res).catch(()=>{if(!res.headersSent){res.writeHead(500,{'Cache-Control':'no-store'});}res.end();});
 }).listen(port,'127.0.0.1',()=>{process.stdout.write('Isolated guardian API listening on 127.0.0.1:'+port+'\n');});
}
if(require.main===module)main().catch(err=>{process.stderr.write('Local API startup failed: '+err.message+'\n');process.exitCode=1;});
module.exports={main};
