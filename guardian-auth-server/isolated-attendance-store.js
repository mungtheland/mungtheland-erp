'use strict';
const {TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
const TAB='직원등하원이력_TEST';
const HEADER=['eventId','bookingId','action','staffId','timestamp'];
function createIsolatedAttendanceStore({sheets,spreadsheetId=TEST_SPREADSHEET_ID}){
 if(spreadsheetId!==TEST_SPREADSHEET_ID)throw Error('Isolated test spreadsheet only');
 const values=sheets?.spreadsheets?.values;
 if(typeof values?.get!=='function'||typeof values?.append!=='function')throw Error('Trusted Sheets client required');
 const range="'"+TAB+"'!A1:E10000";
 async function readAll(){
  const response=await values.get({spreadsheetId,range,valueRenderOption:'UNFORMATTED_VALUE'});
  const rows=response.data?.values||[];
  if(JSON.stringify(rows[0]||[])!==JSON.stringify(HEADER))throw Error('Attendance test sheet missing or header mismatch');
  return rows.slice(1).filter(row=>row.some(v=>v!==''&&v!==null&&v!==undefined)).map(row=>{
   if(row.length<5||!/^EVT-[a-f0-9-]{36}$/.test(row[0])||!['check-in','check-out'].includes(row[2])||!/^STAFF-[A-Z0-9-]{1,64}$/.test(row[3])||Number.isNaN(Date.parse(row[4])))throw Error('Invalid attendance log');
   return {eventId:row[0],bookingId:row[1],action:row[2],staffId:row[3],at:row[4]};
  });
 }
 async function append(event){
  const row=[event.eventId,event.bookingId,event.action,event.staffId,event.at];
  await values.append({spreadsheetId,range:"'"+TAB+"'!A:E",valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[row]}});
 }
 async function read(bookingId){return (await readAll()).filter(event=>event.bookingId===bookingId);}
 return {read,readAll,append};
}
module.exports={createIsolatedAttendanceStore,TAB,HEADER};
