'use strict';
/**
 * Loopback-only development API. Requires Application Default Credentials
 * and a pre-provisioned, server-owned guardian mapping; never maps the
 * currently logged-in user automatically.
 */
const http=require('node:http');
const {createGuardianAuthenticator}=require('./authenticate');
const {createGuardianBookingHttpHandler}=require('./booking-http');
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
 const googleAuth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth:googleAuth});
 const accountStore={findByFirebaseUid:async candidate=>
  candidate===uid?{customerId:'CUS-TEST-001',email:email.toLowerCase(),status:'active'}:null};
 const authenticateGuardian=createGuardianAuthenticator({firebaseAuth,accountStore,projectId});
 const bookingRepository=createIsolatedSheetsBookingRepository({sheets,spreadsheetId:TEST_SPREADSHEET_ID});
 const handle=createGuardianBookingHttpHandler({authenticateGuardian,bookingRepository});
 const port=Number(process.env.PORT||8787);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
 http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','https://mungtheland-guardian-test.web.app');
  res.setHeader('Vary','Origin');
  if(req.headers.origin&&req.headers.origin!=='https://mungtheland-guardian-test.web.app'){
   res.writeHead(403);res.end();return;
  }
  void handle(req,res).catch(()=>{if(!res.headersSent){res.writeHead(500,{'Cache-Control':'no-store'});}res.end();});
 }).listen(port,'127.0.0.1',()=>{process.stdout.write('Isolated guardian API listening on 127.0.0.1:'+port+'\n');});
}
if(require.main===module)main().catch(err=>{process.stderr.write('Local API startup failed: '+err.message+'\n');process.exitCode=1;});
module.exports={main};
