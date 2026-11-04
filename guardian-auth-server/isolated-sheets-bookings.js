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
  async findByCustomerId(customerId){
   if(typeof customerId!=='string'||!/^CUS-TEST-[A-Z0-9-]+$/.test(customerId))return [];
   const [bookings,dogs]=await Promise.all([readRows(TEST_BOOKINGS),readRows(TEST_DOGS)]);
   const dogOwners=new Map(),ambiguousDogs=new Set(),bookingCounts=new Map();
   for(const row of dogs.slice(1)){
    if(!row[0]||!row[1])continue;
    if(dogOwners.has(row[0]))ambiguousDogs.add(row[0]);
    else dogOwners.set(row[0],row[1]);
   }
   for(const row of bookings.slice(1))if(row[0])bookingCounts.set(row[0],(bookingCounts.get(row[0])||0)+1);
   return bookings.slice(1).filter(row=>/^RSV-[A-Z0-9-]{1,64}$/.test(row[0]||'')&&
     bookingCounts.get(row[0])===1&&!ambiguousDogs.has(row[2])&&dogOwners.get(row[2])===customerId)
    .map(row=>({bookingId:row[0],dogName:dogs.slice(1).find(d=>d[0]===row[2])?.[4]||row[2],visitDate:row[1]||'',status:row[5]||''}));
  },
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
   // Verified isolated headers: booking B=visit date, C=dog ID, F=status; dog E=name.
   return {bookingId,customerId:linked[0][1],dogName:linked[0][4]||dogId,visitDate:booking[1]||'',status:booking[5]||''};
  }
 };
}
module.exports={createIsolatedSheetsBookingRepository,TEST_SPREADSHEET_ID};
