/** Isolated booking -> check-in -> candidate deduction -> check-out -> restore integration. NEVER deploy to production. */
function mdIntegrationFindById_(sheet,id){
 const last=sheet.getLastRow();if(last<2)return -1;
 const matches=sheet.getRange(2,1,last-1,1).getDisplayValues().reduce((a,r,i)=>{if(r[0]===id)a.push(i+2);return a;},[]);
 if(matches.length>1)throw Error('중복 ID: '+id);
 return matches.length?matches[0]:-1;
}
function mdIsolatedCheckIn(bookingId){
  bookingId=mdRequired_(bookingId,'예약 ID');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sheet=mdSheet_('예약·등하원관리'),row=mdIntegrationFindById_(sheet,bookingId);
    if(row<0)throw Error('예약을 찾을 수 없습니다.');
    const values=sheet.getRange(row,1,1,11).getValues()[0];
    if(values[5]!=='예약')throw Error('등원할 수 없는 예약상태: '+values[5]);
    if(values[7])throw Error('이미 하원한 예약은 다시 등원 처리할 수 없습니다.');
    if(values[6]){
      if(values[8]!=='등원 중')throw Error('등원 기록과 출석상태가 일치하지 않습니다. 관리자 확인이 필요합니다.');
      return {bookingId:bookingId,alreadyCheckedIn:true};
    }
    if(values[8]&&values[8]!=='미등원')throw Error('등원 전 출석상태가 올바르지 않습니다.');
    sheet.getRange(row,7).setValue(new Date());
    sheet.getRange(row,9).setValue('등원 중');
    return {bookingId:bookingId,checkedIn:true};
  }finally{lock.releaseLock();}
}
/** 기존 예약의 하원 기록. 이용권 차감은 별도 정책 확정 후 구현. */
function mdIsolatedCheckOut(bookingId){
  bookingId=mdRequired_(bookingId,'예약 ID');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const sheet=mdSheet_('예약·등하원관리'),row=mdIntegrationFindById_(sheet,bookingId);
    if(row<0)throw Error('예약을 찾을 수 없습니다.');
    const values=sheet.getRange(row,1,1,11).getValues()[0];
    if(!values[6])throw Error('등원 기록이 없습니다.');
    if(values[7]){
      if(values[8]!=='하원')throw Error('하원 기록과 출석상태가 일치하지 않습니다. 관리자 확인이 필요합니다.');
      return {bookingId:bookingId,alreadyCheckedOut:true};
    }
    if(values[5]!=='예약'||values[8]!=='등원 중')throw Error('하원할 수 없는 예약 또는 출석상태입니다.');
    sheet.getRange(row,8).setValue(new Date());
    sheet.getRange(row,9).setValue('하원');
    return {bookingId:bookingId,checkedOut:true};
  }finally{lock.releaseLock();}
}

function mdRunCandidateAttendanceIntegrationTest(){
 mdCheckSetup();
 const bSheet=mdSheet_('예약·등하원관리'),pSheet=mdSheet_('이용권관리');
 const suffix=Utilities.getUuid().slice(0,8).toUpperCase();
 const bookingId='RSV-INT-'+suffix,passId='PASS-INT-'+suffix,dogId='DOG-INT-'+suffix;
 const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
 const checks=[];
 const assert=(condition,label)=>{if(!condition)throw Error('FAIL: '+label);checks.push('PASS: '+label);};
 bSheet.appendRow([bookingId,today,dogId,'통합테스트견',passId,'예약','','','미등원','미차감','격리 통합 테스트']);
 pSheet.appendRow([passId,dogId,'PRODUCT-TEST','테스트 8회권',today,8,0,8,today,'',160000,0,160000,'완료','사용 가능']);
 SpreadsheetApp.flush();
 const booking=()=>bSheet.getRange(mdIntegrationFindById_(bSheet,bookingId),1,1,11).getValues()[0];
 const pass=()=>pSheet.getRange(mdIntegrationFindById_(pSheet,passId),1,1,15).getValues()[0];
 const hist=()=>mdCandidatePassHistory(passId).filter(x=>x.bookingId===bookingId);
 assert(booking()[8]==='미등원','예약 초기 미등원');
 let blocked=false;try{mdCandidateDeductPass({bookingId,passId,operator:'신송이',reason:'등원 전 차감 방지'});}catch(e){blocked=true;}
 assert(blocked&&hist().length===0,'등원 전 차감 차단');
 assert(mdIsolatedCheckIn(bookingId).checkedIn===true,'정상 등원');
 assert(mdIsolatedCheckIn(bookingId).alreadyCheckedIn===true,'중복 등원 방지');
 assert(mdCandidateDeductPass({bookingId,passId,operator:'신송이',reason:'통합 차감'}).remainingCount===7,'정상 차감');
 assert(pass()[6]===1&&pass()[7]===7&&booking()[9]==='차감','차감 시트 반영');
 assert(mdIsolatedCheckOut(bookingId).checkedOut===true,'정상 하원');
 assert(mdIsolatedCheckOut(bookingId).alreadyCheckedOut===true,'중복 하원 방지');
 assert(booking()[8]==='하원'&&Boolean(booking()[7]),'하원 시트 반영');
 assert(mdCandidateRestorePass({bookingId,passId,operator:'신송이',reason:'통합 복구'}).remainingCount===8,'정상 복구');
 assert(pass()[6]===0&&pass()[7]===8&&booking()[9]==='복구','복구 시트 반영');
 assert(hist().length===2&&hist().some(x=>x.type==='차감')&&hist().some(x=>x.type==='복구'),'차감 복구 이력 각 1건');
 const result={ok:true,bookingId,passId,checks};Logger.log(JSON.stringify(result));return result;
}
