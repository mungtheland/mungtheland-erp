/** 수동 이용권 차감/복구 V1: 예약 1건당 1회, 숨김 이력 시트에 감사기록. */
function mdPassAdjust_(data){
  data=data||{};
  const type=mdRequired_(data.type,'처리유형');
  if(type!=='차감'&&type!=='복구')throw Error('지원하지 않는 처리유형입니다.');
  const bookingId=mdRequired_(data.bookingId,'예약 ID');
  const passId=mdRequired_(data.passId,'이용권 ID');
  const reason=String(data.reason||'').trim();
  if(type==='복구'&&!reason)throw Error('복구 사유를 입력하세요.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    mdCheckSetup();
    const bookingSheet=mdSheet_('예약·등하원관리'),passSheet=mdSheet_('이용권관리');
    const bRow=mdFindById_(bookingSheet,bookingId),pRow=mdFindById_(passSheet,passId);
    if(bRow<2||pRow<2)throw Error('예약 또는 이용권을 찾을 수 없습니다.');
    const b=bookingSheet.getRange(bRow,1,1,11).getValues()[0];
    const p=passSheet.getRange(pRow,1,1,15).getValues()[0];
    if(String(b[2])!==String(p[1]))throw Error('예약과 이용권의 반려견이 다릅니다.');
    const total=Number(p[5]),used=Number(p[6]),remaining=Number(p[7]);
    if(!Number.isSafeInteger(total)||!Number.isSafeInteger(used)||!Number.isSafeInteger(remaining)||used<0||remaining<0||used+remaining!==total)throw Error('이용권 횟수 무결성 오류입니다.');
    const linked=String(b[4]||''),deduction=String(b[9]||'미차감');
    const bookingDate=b[1] instanceof Date?Utilities.formatDate(b[1],'Asia/Seoul','yyyy-MM-dd'):String(b[1]).slice(0,10);
    const start=p[8] instanceof Date?Utilities.formatDate(p[8],'Asia/Seoul','yyyy-MM-dd'):String(p[8]||'').slice(0,10);
    const expiry=p[9] instanceof Date?Utilities.formatDate(p[9],'Asia/Seoul','yyyy-MM-dd'):String(p[9]||'').slice(0,10);
    const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
    const ledger=mdSheet_('_이용권변동이력');
    const history=ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,10).getDisplayValues().filter(r=>r[3]===passId&&r[4]===bookingId):[];
    const net=history.reduce((n,r)=>n+(r[2]==='차감'?1:r[2]==='복구'?-1:0),0);
    if(net<0||net>1)throw Error('차감 이력 불일치: 수동 점검이 필요합니다.');
    if(type==='차감'){
      if(linked&&linked!==passId)throw Error('다른 이용권이 연결된 예약입니다.');
      if(deduction==='차감'||net===1)return {bookingId,passId,alreadyDeducted:true,remainingCount:remaining};
      if(deduction!=='미차감'&&deduction!=='복구')throw Error('예약 차감상태가 올바르지 않습니다.');
      if(p[13]!=='완료'||!['사용 가능','소진'].includes(String(p[14])))throw Error('결제 완료된 사용 가능 이용권만 차감할 수 있습니다.');
      if(remaining<1)throw Error('잔여 횟수가 없습니다.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate))throw Error('예약 이용일이 올바르지 않습니다.');
      if(start&&bookingDate<start)throw Error('이용권 시작일 이전 예약입니다.');
      if(expiry&&bookingDate>expiry)throw Error('이용권 만료일 이후 예약입니다.');
      if(bookingDate>today)throw Error('미래 예약은 미리 차감할 수 없습니다.');
      if(!b[6])throw Error('등원 기록이 있는 예약만 차감할 수 있습니다.');
    }else{
      if(linked!==passId||deduction!=='차감'||net!==1)throw Error('해당 예약의 차감 기록이 없어 복구할 수 없습니다.');
      if(used<1||remaining>=total)throw Error('복구 가능한 사용 횟수가 없습니다.');
    }
    const nextUsed=used+(type==='차감'?1:-1);
    const nextRemaining=remaining+(type==='차감'?-1:1);
    const nextStatus=nextRemaining===0?'소진':'사용 가능';
    const nextDeduction=type==='차감'?'차감':'복구';
    const operator=Session.getEffectiveUser().getEmail()||'운영자';
    // 이력 먼저 기록하고 나머지 업데이트: 실패 시 복구를 시도하며 불일치 시 관리자 확인 필요.
    const entryId=mdId_('HIS');
    const oldPass=passSheet.getRange(pRow,7,1,2).getValues()[0];
    const oldStatus=passSheet.getRange(pRow,15).getValue();
    const oldBooking=bookingSheet.getRange(bRow,5).getValue();
    const oldDeduction=bookingSheet.getRange(bRow,10).getValue();
    let ledgerRow=0;
    try{
      ledger.appendRow([entryId,new Date(),type,passId,bookingId,type==='차감'?-1:1,remaining,nextRemaining,operator,reason]);
      ledgerRow=ledger.getLastRow();
      passSheet.getRange(pRow,7,1,2).setValues([[nextUsed,nextRemaining]]);
      passSheet.getRange(pRow,15).setValue(nextStatus);
      bookingSheet.getRange(bRow,5).setValue(passId);
      bookingSheet.getRange(bRow,10).setValue(nextDeduction);
      SpreadsheetApp.flush();
    }catch(e){
      let rollbackFailed=false;
      try{
        passSheet.getRange(pRow,7,1,2).setValues([oldPass]);
        passSheet.getRange(pRow,15).setValue(oldStatus);
        bookingSheet.getRange(bRow,5).setValue(oldBooking);
        bookingSheet.getRange(bRow,10).setValue(oldDeduction);
        if(ledgerRow&&ledger.getRange(ledgerRow,1).getDisplayValue()===entryId)ledger.deleteRow(ledgerRow);
        SpreadsheetApp.flush();
      }catch(rollbackError){rollbackFailed=true;Logger.log('ROLLBACK FAILED '+rollbackError);}
      if(rollbackFailed)throw Error('처리 중 오류 및 복구 실패: 관리자에게 이력 점검을 요청하세요. '+e.message);
      throw e;
    }
    return {bookingId,passId,type,usedCount:nextUsed,remainingCount:nextRemaining,status:nextStatus,historyId:entryId,automaticDeduction:false};
  }finally{lock.releaseLock();}
}
function mdDeductPass(data){return mdPassAdjust_(Object.assign({},data,{type:'차감'}));}
function mdRestorePass(data){return mdPassAdjust_(Object.assign({},data,{type:'복구'}));}
function mdPassHistory(passId){
  passId=mdRequired_(passId,'이용권 ID');
  const sheet=mdSheet_('_이용권변동이력'),last=sheet.getLastRow();
  if(last<2)return [];
  return sheet.getRange(2,1,last-1,10).getDisplayValues().filter(r=>r[3]===passId).slice(-100).reverse()
    .map(r=>({id:r[0],at:r[1],type:r[2],passId:r[3],bookingId:r[4],delta:Number(r[5]),before:Number(r[6]),after:Number(r[7]),reason:r[9]}));
}
