'use strict';
/**
 * READ ONLY adapter for the isolated Apps Script test workbook.
 * The Sheets client must be a server-side Google API client with read-only scope.
 * No browser access, no production sheet ID, no writes.
 */
const TEST_SPREADSHEET_ID='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';
const TEST_BOOKINGS='예약·등하원관리';
const TEST_DOGS='고객·반려견관리';
function createIsolatedSheetsBookingRepository({sheets,spreadsheetId=TEST_SPREADSHEET_ID}){
 if(spreadsheetId!==TEST_SPREADSHEET_ID)throw Error('Isolated test spreadsheet only');
 if(!sheets||!sheets.spreadsheets||!sheets.spreadsheets.values||
    typeof sheets.spreadsheets.values.get!=='function')throw Error('Trusted Sheets client required');
 async function readRows(name){
  const range="'"+name.replace(/'/g,"''")+"'!A1:Z1000";
  const result=await sheets.spreadsheets.values.get({spreadsheetId,range,valueRenderOption:'FORMATTED_VALUE'});
  return result.data?.values||[];
 }
 return {
  async findById(bookingId){
   if(typeof bookingId!=='string'||!/^RSV-[A-Z0-9-]{1,64}$/.test(bookingId))return null;
   const bookings=await readRows(TEST_BOOKINGS);
   const matches=bookings.slice(1).filter(row=>row[0]===bookingId);
   if(matches.length!==1)return null;
   const booking=matches[0],dogId=booking[2];
   if(!dogId)return null;
   const dogs=await readRows(TEST_DOGS);
   const linked=dogs.slice(1).filter(row=>row[0]===dogId);
   if(linked.length!==1||!linked[0][1])return null;
   // Column positions are grounded in the isolated GuardianRequest test schema.
   // Avoid guessing the date/name columns until their headers are verified.
   return {bookingId,customerId:linked[0][1],dogName:dogId,visitDate:'',status:booking[5]||''};
  }
 };
}
module.exports={createIsolatedSheetsBookingRepository,TEST_SPREADSHEET_ID};
