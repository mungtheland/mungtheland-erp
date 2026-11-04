'use strict';
// Staff-only service: intentionally NOT mounted on an HTTP route until staff authentication exists.
const {createArrivalRequestService}=require('./arrival-request');
const SHEET_ID='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';
const TAB="'보호자등원요청'";
const BOOKING=/^RSV-[A-Z0-9-]{1,64}$/;
function requireStaff(principal){
 if(!principal||principal.role!=='staff'||principal.status!=='active'||typeof principal.staffId!=='string'||!principal.staffId.trim())throw Error('Staff access denied');
 return principal.staffId.trim();
}
function createStaffArrivalService({sheets,bookingRepository,spreadsheetId=SHEET_ID,clock=()=>new Date()}){
 if(spreadsheetId!==SHEET_ID)throw Error('Isolated sheet only');
 const guardianService=createArrivalRequestService({sheets,bookingRepository,spreadsheetId});
 const range=TAB+'!A1:N200';
 async function locate(bookingId){
  if(!BOOKING.test(bookingId||''))throw Error('Invalid booking');
  const booking=await bookingRepository.findById(bookingId);
  if(!booking)throw Error('Booking not found');
  const response=await sheets.spreadsheets.values.get({spreadsheetId,range});
  const matches=(response.data.values||[]).map((values,index)=>({values,row:index+1})).slice(1).filter(x=>x.values[1]===bookingId);
  if(matches.length>1)throw Error('Conflicting requests');
  return {booking,entry:matches[0]||null};
 }
 function present(entry){
  if(!entry)return null;
  const r=entry.values;
  return {bookingId:r[1],dogId:r[2],mealTime:r[4]||'',foodProvided:r[5]||'unknown',mannerBelt:r[6]||'unknown',condition:r[7]||'',notes:r[8]||'',revision:Number(r[9]||0),acknowledgedAt:r[11]||null,acknowledgedBy:r[12]||null};
 }
 return {
  async get(principal,bookingId){
   requireStaff(principal);
   const {entry}=await locate(bookingId);
   return present(entry);
  },
  async acknowledge(principal,bookingId,expectedRevision){
   const staffId=requireStaff(principal);
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw Error('Invalid revision');
   const {entry}=await locate(bookingId);
   if(!entry)throw Error('Request not found');
   if(Number(entry.values[9]||0)!==expectedRevision)throw Error('Revision conflict');
   if(entry.values[11])throw Error('Already acknowledged');
   const timestamp=clock().toISOString();
   // Only acknowledgment columns; do not overwrite guardian-submitted fields.
   await sheets.spreadsheets.values.update({spreadsheetId,range:TAB+'!L'+entry.row+':M'+entry.row,valueInputOption:'RAW',requestBody:{values:[[timestamp,staffId]]}});
   return {bookingId,revision:expectedRevision,acknowledgedAt:timestamp,acknowledgedBy:staffId};
  }
 };
}
module.exports={createStaffArrivalService,requireStaff};
