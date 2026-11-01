/** Run ONLY in separate Apps Script test project with MD_GUARDIAN_TEST_SPREADSHEET_ID set.
 * Uses synthetic fixture rows; resets only its own test booking/request.
 * Never install in production. No public endpoint.
 */
function mdGuardianRunWorkflowTest_(){
 const book=mdGuardianTestBook_();
 if(book.getId()===MD_SPREADSHEET_ID)throw Error('Production workbook forbidden');
 const bookingId='RSV-TEST-001',dogId='DOG-TEST-001',customerId='CUS-TEST-001';
 const principal={dogId:dogId,customerId:customerId};
 const staff={role:'staff',staffId:'STAFF-TEST-001'};
 const bookings=mdGuardianTestSheet_('예약·등하원관리');
 const br=mdFindById_(bookings,bookingId);
 if(br<2)throw Error('Synthetic test booking missing');
 const b=bookings.getRange(br,1,1,11).getValues()[0];
 if(String(b[2])!==dogId||String(b[5])!=='예약'||String(b[8])!=='미등원'||b[6]||b[7])throw Error('Test booking is not in initial state');
 const dogs=mdGuardianTestSheet_('고객·반려견관리');
 const dr=mdFindById_(dogs,dogId);
 if(dr<2||String(dogs.getRange(dr,2).getValue())!==customerId)throw Error('Synthetic dog missing');
 const req=mdGuardianRequestSheet_();
 if(req.getLastRow()>1){
  const values=req.getRange(2,2,req.getLastRow()-1,1).getDisplayValues();
  if(values.some(r=>r[0]===bookingId))throw Error('Test request already exists; do not overwrite existing data');
 }
 const assert=(ok,message)=>{if(!ok)throw Error('TEST FAIL: '+message);};
 const expectError=(fn,message)=>{let failed=false;try{fn();}catch(e){failed=true;}assert(failed,message);};
 const data={mealTime:'12:30',foodBrought:'yes',mannerBelt:'no',condition:'normal',notes:'synthetic test'};
 const first=mdSaveGuardianRequestInternal_(principal,bookingId,data,0);
 assert(first.revision===1,'first save revision');
 const read=mdGuardianRequestForBookingInternal_(principal,bookingId);
 assert(read.revision===1&&read.request.mannerBelt==='no'&&!read.staffReviewed,'first read');
 expectError(()=>mdSaveGuardianRequestInternal_({dogId:'OTHER',customerId:customerId},bookingId,data,1),'wrong dog must be denied');
 expectError(()=>mdSaveGuardianRequestInternal_(principal,bookingId,data,0),'stale revision must be denied');
 mdConfirmGuardianRequestInternal_(staff,bookingId,1);
 assert(mdGuardianRequestForBookingInternal_(principal,bookingId).staffReviewed,'staff review');
 const second=mdSaveGuardianRequestInternal_(principal,bookingId,{...data,mannerBelt:'yes'},1);
 assert(second.revision===2,'second save');
 assert(!mdGuardianRequestForBookingInternal_(principal,bookingId).staffReviewed,'staff review reset');
 expectError(()=>mdConfirmGuardianRequestInternal_(staff,bookingId,1),'stale staff review');
 // Temporarily mark synthetic booking checked in. Always restore original cells.
 const original=bookings.getRange(br,7,1,3).getValues()[0];
 try{
  bookings.getRange(br,7).setValue(new Date());
  bookings.getRange(br,9).setValue('등원 중');
  expectError(()=>mdSaveGuardianRequestInternal_(principal,bookingId,data,2),'checked-in edit must be denied');
 }finally{bookings.getRange(br,7,1,3).setValues([original]);}
 return {ok:true,bookingId:bookingId,revision:2,checks:8,warning:'Synthetic request rows remain in isolated test sheet'};
}
