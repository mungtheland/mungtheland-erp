'use strict';
// Read-only cross-ledger verification. Does not synchronize two ledgers.
const {google}=require('googleapis');
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {inspectPassParity}=require('./pass-ledger-parity');
const {TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
const PROJECT='mungtheland-guardian-test',BOOKING='RSV-TEST-PARITY-002',PASS='PASS-TEST-PARITY-002';
const tab=name=>"'"+name.replace(/'/g,"''")+"'!";
async function run({sheets,db}){
 const read=async(name,range)=>(await sheets.spreadsheets.values.get({spreadsheetId:TEST_SPREADSHEET_ID,range:tab(name)+range,valueRenderOption:'FORMATTED_VALUE'})).data.values||[];
 const [bookings,passes,history,attendance,firePass,consumption]=await Promise.all([
  read('예약·등하원관리','A1:K30'),read('이용권관리','A1:O30'),read('_이용권변동이력','A1:J100'),
  db.collection('attendance_test_v1').doc(BOOKING).get(),db.collection('pass_ledger_test_v1').doc(PASS).get(),db.collection('pass_consumptions_test_v1').doc(BOOKING).get()]);
 const b=bookings.slice(1).filter(r=>r[0]===BOOKING),p=passes.slice(1).filter(r=>r[0]===PASS);
 if(b.length!==1||p.length!==1)throw Error('Expected exactly one isolated booking and pass');
 const booking={bookingId:b[0][0],visitDate:b[0][1],dogId:b[0][2],passId:b[0][4],deductionStatus:b[0][9]};
 const pass={passId:p[0][0],dogId:p[0][1],totalCount:Number(p[0][5]),usedCount:Number(p[0][6]),remainingCount:Number(p[0][7]),startDate:p[0][8],expiryDate:p[0][9],paymentStatus:p[0][13],status:p[0][14]};
 const entries=history.slice(1).filter(r=>r[3]===PASS&&r[4]===BOOKING).map(r=>({type:r[2],passId:r[3],bookingId:r[4]}));
 const fp=firePass.exists?{passId:PASS,remaining:firePass.data().remaining}:null;
 const fc=consumption.exists?{bookingId:consumption.data().bookingId,passId:consumption.data().passId}:null;
 const parity=inspectPassParity({booking,pass,history:entries,firestorePass:fp,consumption:fc});
 const result={project:PROJECT,spreadsheetId:TEST_SPREADSHEET_ID,bookingId:BOOKING,passId:PASS,readOnly:true,writesPerformed:0,
  sheets:{attendance:b[0][8],deduction:b[0][9],total:pass.totalCount,used:pass.usedCount,remaining:pass.remainingCount,historyEntries:entries.length},
  firestore:{attendance:attendance.exists?attendance.data().state:null,remaining:fp?.remaining??null,consumptionExists:consumption.exists},
  parity};
 console.log(JSON.stringify(result,null,2));
 return result;
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.MD_RUN_READONLY_CROSS_LEDGER_AUDIT!=='YES'||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Explicit isolated read-only audit opt-in required');
 const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/cloud-platform']});
 const sheets=google.sheets({version:'v4',auth});
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'isolated-cross-ledger-audit');
 try{await run({sheets,db:getFirestore(app)});}finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[cross-ledger-audit] FAIL:',e.message);process.exitCode=1;});
module.exports={run};
