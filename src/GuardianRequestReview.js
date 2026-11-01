/** Internal staff review and guardian read helpers. Not public endpoints. */
function mdGuardianRequestForBookingInternal_(principal,bookingId){
 if(!principal||!principal.customerId||!principal.dogId)throw Error('Unauthenticated');
 const bookings=mdSheet_('예약·등하원관리'),br=mdFindById_(bookings,String(bookingId));
 if(br<2)throw Error('Booking not found');
 const booking=bookings.getRange(br,1,1,11).getValues()[0];
 if(String(booking[2])!==String(principal.dogId))throw Error('Access denied');
 const dogs=mdSheet_('고객·반려견관리'),dr=mdFindById_(dogs,String(principal.dogId));
 if(dr<2||String(dogs.getRange(dr,2).getValue())!==String(principal.customerId))throw Error('Access denied');
 const s=mdGuardianRequestSheet_(),last=s.getLastRow();
 if(last<2)return {bookingId:String(bookingId),revision:0,request:null};
 const rows=s.getRange(2,1,last-1,MD_GR_HEADERS_.length).getValues().filter(r=>String(r[1])===String(bookingId));
 if(rows.length>1)throw Error('Duplicate request records');
 if(!rows.length)return {bookingId:String(bookingId),revision:0,request:null};
 const r=rows[0];
 return {bookingId:String(bookingId),revision:Number(r[9]),request:{mealTime:String(r[4]||''),foodBrought:String(r[5]||''),mannerBelt:String(r[6]||''),condition:String(r[7]||''),notes:String(r[8]||'')},staffReviewed:Number(r[11])===Number(r[9])};
}
/** Staff identity must come from verified admin authentication, never a client supplied name. */
function mdConfirmGuardianRequestInternal_(staffPrincipal,bookingId,expectedRevision){
 if(!staffPrincipal||staffPrincipal.role!=='staff'||!staffPrincipal.staffId)throw Error('Staff authentication required');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw Error('Invalid revision');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const s=mdGuardianRequestSheet_(),last=s.getLastRow();
  if(last<2)throw Error('Request not found');
  const rows=s.getRange(2,1,last-1,MD_GR_HEADERS_.length).getValues();
  const matches=rows.map((r,i)=>({r,i})).filter(x=>String(x.r[1])===String(bookingId));
  if(matches.length!==1)throw Error('Request missing or duplicated');
  const x=matches[0];
  if(Number(x.r[9])!==expectedRevision)throw Error('Revision conflict');
  s.getRange(x.i+2,12,1,3).setValues([[expectedRevision,String(staffPrincipal.staffId),new Date()]]);
  return {bookingId:String(bookingId),reviewedRevision:expectedRevision};
 }finally{lock.releaseLock();}
}
