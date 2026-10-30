/** 변경 이력은 운영 화면에서 숨김 처리한 별도 시트에 보존한다. */
const MD_BOOKING_AUDIT_NAME='_예약변경이력';
const MD_BOOKING_AUDIT_HEADERS=['이력 ID','변경일시','예약 ID','반려견 ID','처리유형','변경 전 이용일','변경 후 이용일','변경 전 상태','변경 후 상태','처리자'];
function mdBookingAuditSheet_(){
  const book=mdBook_();
  let sheet=book.getSheetByName(MD_BOOKING_AUDIT_NAME);
  if(!sheet){
    sheet=book.insertSheet(MD_BOOKING_AUDIT_NAME);
    sheet.getRange(1,1,1,MD_BOOKING_AUDIT_HEADERS.length).setValues([MD_BOOKING_AUDIT_HEADERS]);
    sheet.hideSheet();
  }
  const headers=sheet.getRange(1,1,1,MD_BOOKING_AUDIT_HEADERS.length).getDisplayValues()[0];
  if(MD_BOOKING_AUDIT_HEADERS.some((h,i)=>headers[i]!==h))throw Error('예약 변경 이력 시트의 헤더가 올바르지 않습니다.');
  return sheet;
}
function mdBookingChangeHistory(bookingId){
  bookingId=mdRequired_(bookingId,'예약 ID');
  const book=mdBook_(),sheet=book.getSheetByName(MD_BOOKING_AUDIT_NAME);
  if(!sheet||sheet.getLastRow()<2)return [];
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,MD_BOOKING_AUDIT_HEADERS.length).getDisplayValues();
  return rows.filter(r=>r[2]===bookingId).slice(-100).reverse().map(r=>({
    id:r[0],at:r[1],bookingId:r[2],dogId:r[3],action:r[4],
    oldDate:r[5],newDate:r[6],oldStatus:r[7],newStatus:r[8],operator:r[9]
  }));
}
/** 예약 변경: 등원 전·미차감 예약에 한해 취소 또는 이용일 변경. */
function mdChangeBooking(data){
  data=data||{};
  const bookingId=mdRequired_(data.bookingId,'예약 ID');
  const action=mdRequired_(data.action,'변경 유형');
  if(action!=='취소'&&action!=='날짜변경')throw Error('지원하지 않는 예약 변경 유형입니다.');
  const newDate=action==='날짜변경'?mdRequired_(data.newDate,'변경 이용일'):'';
  if(newDate){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(newDate))throw Error('이용일 형식은 yyyy-MM-dd입니다.');
    const d=new Date(newDate+'T00:00:00Z');
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==newDate)throw Error('존재하지 않는 이용일입니다.');
  }
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    mdCheckSetup();
    const sheet=mdSheet_('예약·등하원관리');
    const row=mdFindById_(sheet,bookingId);
    if(row<2)throw Error('예약을 찾을 수 없습니다.');
    const b=sheet.getRange(row,1,1,11).getValues()[0];
    const status=String(b[5]||''),attendance=String(b[8]||''),deduction=String(b[9]||'미차감');
    if(status!=='예약'||b[6]||b[7]||attendance!=='미등원'||deduction!=='미차감'||b[4])
      throw Error('등원 전·미차감·이용권 미연결 예약만 변경할 수 있습니다.');
    const oldDate=b[1] instanceof Date?Utilities.formatDate(b[1],'Asia/Seoul','yyyy-MM-dd'):String(b[1]).slice(0,10);
    if(action==='취소'){
      mdCommitBookingChange_(sheet,row,6,'예약취소',b,action,oldDate,'');
      return {bookingId,action,status:'예약취소'};
    }
    if(newDate===oldDate)return {bookingId,action,oldDate,newDate,unchanged:true};
    const last=sheet.getLastRow();
    if(last>1){
      const all=sheet.getRange(2,1,last-1,11).getValues();
      const conflict=all.some((r,i)=>{
        if(i+2===row||String(r[2])!==String(b[2])||['취소','예약취소'].includes(String(r[5])))return false;
        const date=r[1] instanceof Date?Utilities.formatDate(r[1],'Asia/Seoul','yyyy-MM-dd'):String(r[1]).slice(0,10);
        return date===newDate;
      });
      if(conflict)throw Error('변경할 날짜에 동일 반려견의 예약이 이미 존재합니다.');
    }
    mdCommitBookingChange_(sheet,row,2,newDate,b,action,oldDate,newDate);
    return {bookingId,action,oldDate,newDate};
  }finally{lock.releaseLock();}
}

/** 이력 선기록 후 원장 변경. 원장 갱신 실패 시 이력을 제거한다. */
function mdCommitBookingChange_(sheet,row,column,value,previous,action,oldDate,newDate){
  const ledger=mdBookingAuditSheet_();
  const id=mdId_('BCH');
  const operator=Session.getEffectiveUser().getEmail()||'운영자';
  const entry=[id,new Date(),String(previous[0]),String(previous[2]),action,oldDate,newDate,String(previous[5]),action==='취소'?'예약취소':String(previous[5]),operator];
  const cell=sheet.getRange(row,column),oldValue=previous[column-1];
  let appended=false;
  try{
    ledger.appendRow(entry);appended=true;
    cell.setValue(value);
    SpreadsheetApp.flush();
  }catch(error){
    let failed=false;
    try{cell.setValue(oldValue);if(appended){const n=ledger.getLastRow();if(ledger.getRange(n,1).getDisplayValue()===id)ledger.deleteRow(n);}SpreadsheetApp.flush();}
    catch(rollback){failed=true;Logger.log('BOOKING CHANGE ROLLBACK FAILED '+rollback);}
    if(failed)throw Error('예약 변경 및 복구 실패: 관리자에게 원장과 변경 이력 점검을 요청하세요. '+error.message);
    throw error;
  }
}
