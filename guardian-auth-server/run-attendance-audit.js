'use strict';
// Isolated, read-only diagnostic CLI. Never starts the local API or writes to Sheets.
const {createIsolatedSheetsBookingRepository,TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
const {createIsolatedAttendanceStore}=require('./isolated-attendance-store');
const {auditAttendance}=require('./attendance-audit');
async function runAudit(sheets){
 const repository=createIsolatedSheetsBookingRepository({sheets,spreadsheetId:TEST_SPREADSHEET_ID});
 const store=createIsolatedAttendanceStore({sheets,spreadsheetId:TEST_SPREADSHEET_ID});
 const [bookings,events]=await Promise.all([repository.listForStaff(),store.readAll()]);
 return auditAttendance(bookings,events);
}
function formatReport(result){
 const errors=result.issues.filter(i=>i.severity==='error');
 const reviews=result.issues.filter(i=>i.severity==='review');
 return ['[멍더랜드 격리 등하원 정합성 검사 — 읽기 전용]',
  '예약 '+result.scannedBookings+'건 / 이벤트 '+result.scannedEvents+'건',
  '오류 '+errors.length+'건 / 검토 필요 '+reviews.length+'건',
  ...result.issues.map(i=>'['+i.severity+'] '+i.bookingId+' '+i.code+(i.bookingStatus!==undefined?' (원장: '+i.bookingStatus+' / 등하원: '+i.attendanceStatus+')':''))].join('\n');
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!=='mungtheland-guardian-test')throw Error('Test Google Cloud project required');
 const {google}=require('googleapis');
 const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth});
 const result=await runAudit(sheets);
 process.stdout.write(formatReport(result)+'\n');
}
if(require.main===module)main().catch(err=>{process.stderr.write('Isolated audit failed: '+err.message+'\n');process.exitCode=1;});
module.exports={runAudit,formatReport};
