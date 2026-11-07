'use strict';
// Read-only idempotency preflight against isolated Sheets and Firestore.
// This is a safety gate, not an automatic Sheets write or synchronization service.
const {google}=require('googleapis');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
const PROJECT='mungtheland-guardian-test',BOOKING='RSV-TEST-PARITY-002',PASS='PASS-TEST-PARITY-002';
async function inspect({sheets,db}){
 const read=async(name,range)=>(await sheets.spreadsheets.values.get({spreadsheetId:TEST_SPREADSHEET_ID,range:"'"+name+"'!"+range,valueRenderOption:'FORMATTED_VALUE'})).data.values||[];
 const [bookings,passes,history,attendance,consumption,firePass]=await Promise.all([
  read('예약·등하원관리','A1:K30'),read('이용권관리','A1:O30'),read('_이용권변동이력','A1:J100'),
  db.collection('attendance_test_v1').doc(BOOKING).get(),
  db.collection('pass_consumptions_test_v1').doc(BOOKING).get(),
  db.collection('pass_ledger_test_v1').doc(PASS).get()]);
 const b=bookings.slice(1).filter(r=>r[0]===BOOKING),p=passes.slice(1).filter(r=>r[0]===PASS);
 if(b.length!==1||p.length!==1)throw Error('ABORT: ambiguous or missing test booking/pass');
 const h=history.slice(1).filter(r=>r[3]===PASS&&r[4]===BOOKING);
 const net=h.reduce((n,r)=>n+(r[2]==='차감'?1:r[2]==='복구'?-1:0),0);
 const total=Number(p[0][5]),used=Number(p[0][6]),remaining=Number(p[0][7]);
 const valid= b[0][2]===p[0][1]&&b[0][4]===PASS&&b[0][8]==='등원 중'&&b[0][9]==='차감'&&
  total===8&&used===1&&remaining===7&&used+remaining===total&&net===1&&h.length===3&&
  h[0][2]==='차감'&&Number(h[0][5])===-1&&Number(h[0][6])===8&&Number(h[0][7])===7&&
  h[1][2]==='복구'&&Number(h[1][5])===1&&Number(h[1][6])===7&&Number(h[1][7])===8&&
  h[2][2]==='차감'&&Number(h[2][5])===-1&&Number(h[2][6])===8&&Number(h[2][7])===7&&
  attendance.exists&&attendance.data().state==='등원 중'&&consumption.exists&&
  consumption.data().bookingId===BOOKING&&consumption.data().passId===PASS&&
  firePass.exists&&firePass.data().remaining===7;
 const result={project:PROJECT,bookingId:BOOKING,passId:PASS,readOnly:true,writesPerformed:0,
  sheets:{used,remaining,historyCount:h.length,historyNet:net,deductionStatus:b[0][9]},
  firestore:{attendance:attendance.exists?attendance.data().state:null,consumptionExists:consumption.exists,remaining:firePass.exists?firePass.data().remaining:null},
  decision:valid?'ALREADY_DEDUCTED_NO_WRITE':'BLOCK_AND_RECONCILE',safeToDeductAgain:false,passed:valid};
 console.log(JSON.stringify(result,null,2));
 if(!valid)throw Error('State mismatch: no additional deduction permitted');
 return result;
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.MD_RUN_READONLY_DUPLICATE_GUARD!=='YES'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit isolated read-only guard opt-in required');
 const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth});
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'isolated-duplicate-guard');
 try{await inspect({sheets,db:getFirestore(app)});}finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[duplicate-guard] FAIL:',e.message);process.exitCode=1;});
module.exports={inspect};
