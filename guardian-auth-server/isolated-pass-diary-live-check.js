'use strict';
/**
 * READ-ONLY integration check: isolated Google Sheets booking -> isolated Firestore
 * attendance -> hypothetical pass deduction and guardian diary projection.
 * No actual pass ledger exists in this flow. Never writes to any service.
 */
const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {google}=require('googleapis');
const {createIsolatedSheetsBookingRepository,TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
const {createFirestoreAttendanceStore}=require('./firestore-attendance-store');
const {projectAttendance}=require('./attendance-pass-diary-projection');
const {reconcileBookingStatus}=require('./booking-status-reconciliation');
const PROJECT='mungtheland-guardian-test';
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==PROJECT||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Only isolated test project is permitted');
 const bookingId=process.argv[2];
 if(!/^RSV-TEST-[A-Z0-9-]{1,64}$/.test(bookingId||''))throw Error('Explicit isolated RSV-TEST booking ID required');
 const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'pass-diary-readonly-check');
 try{
  const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const sheets=google.sheets({version:'v4',auth});
  const repo=createIsolatedSheetsBookingRepository({sheets,spreadsheetId:TEST_SPREADSHEET_ID});
  const booking=await repo.findById(bookingId);
  if(!booking)throw Error('Isolated Sheets booking not found');
  const store=createFirestoreAttendanceStore({db:getFirestore(app),projectId:PROJECT});
  const events=await store.read(bookingId);
  const hypotheticalPass={total:8,remaining:8,consumedBookingIds:[]};
  const first=projectAttendance({bookingId,events,pass:hypotheticalPass});
  const simulatedAlreadyConsumed=first.pass.shouldConsume?[bookingId]:[];
  const second=projectAttendance({bookingId,events,pass:{total:8,remaining:first.pass.after,consumedBookingIds:simulatedAlreadyConsumed}});
  if(second.pass.shouldConsume||second.pass.after!==first.pass.after)throw Error('Idempotency failed');
  console.log(JSON.stringify({
   test:'isolated-sheets-firestore-pass-diary-readonly',
   booking:{bookingId:booking.bookingId,dogName:booking.dogName,visitDate:booking.visitDate,sourceStatus:booking.status},
   firestoreEventCount:events.length,
   attendanceState:first.state,
   statusReconciliation:reconcileBookingStatus(booking.status,first.state),
   hypotheticalPass:{initialRemaining:8,afterFirstProjection:first.pass.after,afterRepeatedProjection:second.pass.after,duplicateDeductionPrevented:!second.pass.shouldConsume},
   guardianDiary:first.guardianDiary,
   writesPerformed:0,
   result:'PASS'
  },null,2));
 }finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error('[integration] FAIL:',e.message);process.exitCode=1;});
module.exports={main};
