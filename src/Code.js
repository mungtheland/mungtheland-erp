/** 멍더랜드 ERP V1 — 독립형 Apps Script. 예약·이용권 차감은 정책 확정 전 비활성화. */
const MD_SPREADSHEET_ID = '1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70';
const MD_SCHEMAS = Object.freeze({
  '고객·반려견관리':['반려견 ID','고객 ID','보호자명','연락처','반려견명','견종','생년월일','성별','중성화','체중(kg)','접종정보','건강·알레르기','성향·주의사항','비상연락처','등록일','상태'],
  '예약·등하원관리':['예약 ID','이용일','반려견 ID','반려견명','이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태','비고'],
  '이용권관리':['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'],
  '원생일지':['일지 ID','이용일','예약 ID','반려견 ID','식사','배변','활동','휴식','건강상태','특이사항','작성자','작성일시'],
  '회계관리':['거래 ID','거래일','거래유형','거래분류','관련 ID','거래내용','입금액','출금액','결제수단','거래상태','처리자','비고']
});
function mdBook_(){return SpreadsheetApp.openById(MD_SPREADSHEET_ID);}
function mdSheet_(name){
  const sheet=mdBook_().getSheetByName(name);
  if(!sheet)throw Error('시트 누락: '+name);
  return sheet;
}
function mdHeaders_(sheet){
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
}
function mdValidateSchema_(){
  const book=mdBook_();
  const missing=['대시보드','설정'].filter(n=>!book.getSheetByName(n));
  const mismatch=[];
  Object.keys(MD_SCHEMAS).forEach(name=>{
    const sheet=book.getSheetByName(name);
    if(!sheet){missing.push(name);return;}
    const actual=mdHeaders_(sheet);
    const expected=MD_SCHEMAS[name];
    expected.forEach((h,i)=>{if(actual[i]!==h)mismatch.push(name+' '+(i+1)+'열: '+h);});
  });
  return {ok:missing.length===0&&mismatch.length===0,missing:missing,mismatch:mismatch,spreadsheetId:book.getId()};
}
/** Apps Script 편집기에서 직접 실행: 로그에서 연결 결과 확인. 데이터를 변경하지 않음. */
function mdCheckSetup(){
  const result=mdValidateSchema_();
  Logger.log(JSON.stringify(result,null,2));
  if(!result.ok)throw Error('ERP 시트 구조 불일치: '+JSON.stringify(result));
  return result;
}
function mdRequired_(value,label){
  if(value===undefined||value===null||String(value).trim()==='')throw Error('필수값 누락: '+label);
  return String(value).trim();
}
function mdId_(prefix){return prefix+'-'+Utilities.formatDate(new Date(),'Asia/Seoul','yyyyMMdd')+'-'+Utilities.getUuid().slice(0,8).toUpperCase();}
function mdFindById_(sheet,id){
  const last=sheet.getLastRow();
  if(last<2)return -1;
  const found=sheet.getRange(2,1,last-1,1).createTextFinder(id).matchEntireCell(true).findNext();
  return found?found.getRow():-1;
}
function mdAppend_(name,record){
  const sheet=mdSheet_(name),headers=mdHeaders_(sheet);
  const expected=MD_SCHEMAS[name];
  if(!expected||expected.some((h,i)=>headers[i]!==h))throw Error('헤더가 변경되어 기록을 중단했습니다: '+name);
  const row=headers.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:'');
  sheet.appendRow(row);
  return record[headers[0]];
}
/** 보호자·반려견 신규 등록. 고객 ID는 동일 보호자에게 재사용 가능. */
function mdRegisterDog(data){
  data=data||{};
  const guardian=mdRequired_(data.guardianName,'보호자명');
  const phone=mdRequired_(data.phone,'연락처');
  const dogName=mdRequired_(data.dogName,'반려견명');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    mdCheckSetup();
    const dogId=mdId_('DOG'),customerId=data.customerId?String(data.customerId):mdId_('CUS');
    mdAppend_('고객·반려견관리',{
      '반려견 ID':dogId,'고객 ID':customerId,'보호자명':guardian,'연락처':phone,
      '반려견명':dogName,'견종':data.breed||'','생년월일':data.birthDate||'',
      '성별':data.sex||'','중성화':data.neutered||'','체중(kg)':data.weight||'',
      '접종정보':data.vaccines||'','건강·알레르기':data.health||'',
      '성향·주의사항':data.notes||'','비상연락처':data.emergencyPhone||'',
      '등록일':new Date(),'상태':'등록'
    });
    return {dogId:dogId,customerId:customerId};
  }finally{lock.releaseLock();}
}
/** 예약 생성. 이용권 자동 차감 없음. 날짜는 yyyy-MM-dd 문자열. */
function mdCreateBooking(data){
  data=data||{};
  const dogId=mdRequired_(data.dogId,'반려견 ID');
  const date=mdRequired_(data.date,'이용일');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date+'T00:00:00Z')))throw Error('이용일 형식은 yyyy-MM-dd');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    mdCheckSetup();
    const dogs=mdSheet_('고객·반려견관리');
    const dogRow=mdFindById_(dogs,dogId);
    if(dogRow<0)throw Error('등록되지 않은 반려견 ID: '+dogId);
    const dogName=dogs.getRange(dogRow,5).getDisplayValue();
    const bookings=mdSheet_('예약·등하원관리');
    if(bookings.getLastRow()>1){
      const values=bookings.getRange(2,1,bookings.getLastRow()-1,11).getDisplayValues();
      if(values.some(r=>r[1]===date&&r[2]===dogId&&!['취소','예약취소'].includes(r[5])))
        throw Error('동일 반려견의 해당 날짜 예약이 이미 존재합니다.');
    }
    const bookingId=mdId_('RSV');
    mdAppend_('예약·등하원관리',{
      '예약 ID':bookingId,'이용일':date,'반려견 ID':dogId,'반려견명':dogName,
      '이용권 ID':data.passId||'','예약상태':'예약','출석상태':'미등원','차감상태':'미차감',
      '비고':data.notes||''
    });
    return {bookingId:bookingId,dogId:dogId,date:date};
  }finally{lock.releaseLock();}
}
/** 기존 예약의 등원 기록. 중복 실행해도 두 번 기록하지 않음. */
function mdCheckIn(bookingId){
  bookingId=mdRequired_(bookingId,'예약 ID');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sheet=mdSheet_('예약·등하원관리'),row=mdFindById_(sheet,bookingId);
    if(row<0)throw Error('예약을 찾을 수 없습니다.');
    const values=sheet.getRange(row,1,1,11).getValues()[0];
    if(values[5]!=='예약')throw Error('등원할 수 없는 예약상태: '+values[5]);
    if(values[6])return {bookingId:bookingId,alreadyCheckedIn:true};
    sheet.getRange(row,7).setValue(new Date());
    sheet.getRange(row,9).setValue('등원');
    return {bookingId:bookingId,checkedIn:true};
  }finally{lock.releaseLock();}
}
/** 기존 예약의 하원 기록. 이용권 차감은 별도 정책 확정 후 구현. */
function mdCheckOut(bookingId){
  bookingId=mdRequired_(bookingId,'예약 ID');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sheet=mdSheet_('예약·등하원관리'),row=mdFindById_(sheet,bookingId);
    if(row<0)throw Error('예약을 찾을 수 없습니다.');
    const values=sheet.getRange(row,1,1,11).getValues()[0];
    if(!values[6])throw Error('등원 기록이 없습니다.');
    if(values[7])return {bookingId:bookingId,alreadyCheckedOut:true};
    sheet.getRange(row,8).setValue(new Date());
    sheet.getRange(row,9).setValue('하원');
    return {bookingId:bookingId,checkedOut:true};
  }finally{lock.releaseLock();}
}
