/** Guardian request: INTERNAL prototype only. Do not expose a public wrapper until authentication is implemented. */
const MD_GR_HEADERS_=['요청 ID','예약 ID','반려견 ID','고객 ID','식사 희망시간','사료 지참','매너벨트 지참','컨디션','특이사항','revision','수정시각','직원확인 revision','직원확인자','직원확인시각'];
function mdValidateGuardianRequest_(data){
 if(!data||typeof data!=='object')throw Error('Missing input');
 const meal=String(data.mealTime||'').trim(),food=String(data.foodBrought||''),belt=String(data.mannerBelt||''),condition=String(data.condition||''),notes=String(data.notes||'').trim();
 if(meal&&!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(meal))throw Error('Invalid meal time');
 if(!['yes','no'].includes(food))throw Error('Invalid food');
 if(!['yes','no','na'].includes(belt))throw Error('Invalid manner belt');
 if(!['normal','caution'].includes(condition))throw Error('Invalid condition');
 if(notes.length>500)throw Error('Notes too long');
 return {meal,food,belt,condition,notes};
}
function mdGuardianRequestSheet_(){
 const s=mdGuardianTestBook_().getSheetByName('보호자등원요청');
 if(!s)throw Error('Guardian request test sheet not configured');
 const h=s.getRange(1,1,1,MD_GR_HEADERS_.length).getDisplayValues()[0];
 if(h.some((v,i)=>v!==MD_GR_HEADERS_[i]))throw Error('Guardian request schema mismatch');
 return s;
}
/** Principal MUST be established by a future server-side authentication layer; never trust principal from browser. */
function mdSaveGuardianRequestInternal_(principal,bookingId,data,expectedRevision){
 if(!principal||!principal.customerId||!principal.dogId)throw Error('Unauthenticated');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Invalid revision');
 const clean=mdValidateGuardianRequest_(data),lock=LockService.getScriptLock();
 lock.waitLock(20000);
 try{
  const bookings=mdGuardianTestSheet_('예약·등하원관리'),br=mdFindById_(bookings,String(bookingId));
  if(br<2)throw Error('Booking not found');
  const b=bookings.getRange(br,1,1,11).getValues()[0];
  if(String(b[2])!==String(principal.dogId))throw Error('Access denied');
  if(b[6]||b[7]||String(b[8])!=='미등원'||String(b[5])!=='예약')throw Error('Request locked after check-in or cancellation');
  const dogs=mdGuardianTestSheet_('고객·반려견관리'),dr=mdFindById_(dogs,String(principal.dogId));
  if(dr<2||String(dogs.getRange(dr,2).getValue())!==String(principal.customerId))throw Error('Access denied');
  const s=mdGuardianRequestSheet_(),last=s.getLastRow();
  const rows=last>1?s.getRange(2,1,last-1,MD_GR_HEADERS_.length).getValues():[];
  const found=rows.map((r,i)=>({r,i})).filter(x=>String(x.r[1])===String(bookingId));
  if(found.length>1)throw Error('Duplicate request records');
  const prev=found.length?found[0]:null,revision=prev?Number(prev.r[9]):0;
  if(revision!==expectedRevision)throw Error('Revision conflict');
  const record=[prev?prev.r[0]:mdId_('REQ'),String(bookingId),String(principal.dogId),String(principal.customerId),clean.meal,clean.food,clean.belt,clean.condition,clean.notes,revision+1,new Date(),'','',''];
  if(prev)s.getRange(prev.i+2,1,1,record.length).setValues([record]);
  else s.appendRow(record);
  return {bookingId:String(bookingId),revision:revision+1};
 }finally{lock.releaseLock();}
}
function mdGuardianRequestFeatureStatus(){return {ready:false,reason:'Authentication and isolated test environment are not configured'};}
