/** Isolated regression of exact release candidate logic; no production access. */
/** 운영 배포 전 검토용 후보. 미배포. 오류 주입 기능 제외. */
/** 수동 이용권 차감/복구 V1: 예약 1건당 1회, 숨김 이력 시트에 감사기록. */
function mdCandidatePassAdjust_(data){
  data=data||{};
  const type=mdRequired_(data.type,'처리유형');
  if(type!=='차감'&&type!=='복구')throw Error('지원하지 않는 처리유형입니다.');
  const bookingId=mdRequired_(data.bookingId,'예약 ID');
  const passId=mdRequired_(data.passId,'이용권 ID');
  const reason=String(data.reason||'').trim();
  if(type==='복구')mdAuditReason_(data,'복구');
  const humanOperator=mdAuditOperator_(data);
  const lock=LockService.getScriptLock();
lock.waitLock(30000);
  try{
    SpreadsheetApp.flush();
    mdCheckSetup();
    const bookingSheet=mdSheet_('예약·등하원관리'),passSheet=mdSheet_('이용권관리');
    // Fail closed when a booking/pass ID appears more than once in its source sheet.
    const uniqueRow=(sheet,id)=>{
      const last=sheet.getLastRow();
      if(last<2)return -1;
      const rows=sheet.getRange(2,1,last-1,1).getDisplayValues();
      const matches=[];
      rows.forEach((r,i)=>{if(r[0]===id)matches.push(i+2);});
      if(matches.length>1)throw Error('중복 ID가 발견되어 처리를 중단했습니다: '+id);
      return matches.length?matches[0]:-1;
    };
    const bRow=uniqueRow(bookingSheet,bookingId),pRow=uniqueRow(passSheet,passId);
    if(bRow<2||pRow<2)throw Error('예약 또는 이용권을 찾을 수 없습니다.');
    const b=bookingSheet.getRange(bRow,1,1,11).getValues()[0];
    const p=passSheet.getRange(pRow,1,1,15).getValues()[0];
    if(String(b[2])!==String(p[1]))throw Error('예약과 이용권의 반려견이 다릅니다.');
    if(type==='차감'&&String(b[5])!=='예약')throw Error('예약상태가 예약인 경우에만 이용권을 차감할 수 있습니다.');
    if(type==='차감'&&(!b[6]||b[8]!=='등원 중'&&b[8]!=='하원'))throw Error('정상적인 등원 기록과 출석상태가 필요합니다.');
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
      if((deduction==='차감')!==(net===1))throw Error('예약 차감상태와 변동이력이 불일치합니다. 관리자 점검이 필요합니다.');
      if(deduction==='차감'&&net===1){
        if(linked!==passId)throw Error('차감 이력과 예약의 이용권 연결이 불일치합니다. 관리자 점검이 필요합니다.');
        return {bookingId,passId,alreadyDeducted:true,remainingCount:remaining};
      }
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
    const operator=humanOperator;
    // 이력 먼저 기록하고 나머지 업데이트: 실패 시 복구를 시도하며 불일치 시 관리자 확인 필요.
    const entryId=mdId_('HIS');
    const oldPass=passSheet.getRange(pRow,7,1,2).getValues()[0];
    const oldStatus=passSheet.getRange(pRow,15).getValue();
    const oldBooking=bookingSheet.getRange(bRow,5).getValue();
    const oldDeduction=bookingSheet.getRange(bRow,10).getValue();
    const findEntryRows=()=>{
      const last=ledger.getLastRow();
      if(last<2)return [];
      return ledger.getRange(2,1,last-1,1).getDisplayValues()
        .reduce((rows,r,i)=>{if(r[0]===entryId)rows.push(i+2);return rows;},[]);
    };
    try{
      ledger.appendRow([entryId,new Date(),type,passId,bookingId,type==='차감'?-1:1,remaining,nextRemaining,operator,reason]);
      SpreadsheetApp.flush();
      passSheet.getRange(pRow,7,1,2).setValues([[nextUsed,nextRemaining]]);
      passSheet.getRange(pRow,15).setValue(nextStatus);
      bookingSheet.getRange(bRow,5).setValue(passId);
      bookingSheet.getRange(bRow,10).setValue(nextDeduction);
      SpreadsheetApp.flush();
    }catch(e){
      let rollbackError=null;
      try{
        passSheet.getRange(pRow,7,1,2).setValues([oldPass]);
        passSheet.getRange(pRow,15).setValue(oldStatus);
        bookingSheet.getRange(bRow,5).setValue(oldBooking);
        bookingSheet.getRange(bRow,10).setValue(oldDeduction);
        SpreadsheetApp.flush();
        const rows=findEntryRows();
        if(rows.length>1)throw Error('중복 이력 ID 발견');
        if(rows.length===1)ledger.deleteRow(rows[0]);
        SpreadsheetApp.flush();
        const actualPass=passSheet.getRange(pRow,7,1,2).getValues()[0];
        const actualStatus=passSheet.getRange(pRow,15).getValue();
        const actualBooking=bookingSheet.getRange(bRow,5).getValue();
        const actualDeduction=bookingSheet.getRange(bRow,10).getValue();
        if(actualPass[0]!==oldPass[0]||actualPass[1]!==oldPass[1]||
           actualStatus!==oldStatus||actualBooking!==oldBooking||
           actualDeduction!==oldDeduction||findEntryRows().length!==0){
          throw Error('롤백 후 데이터 불일치');
        }
      }catch(err){
        rollbackError=err;
        Logger.log('ROLLBACK FAILED: '+err);
      }
      if(rollbackError)throw Error('처리 중 오류 및 복구 실패: 관리자 점검 필요. 원인: '+
        e.message+' / 복구 오류: '+rollbackError.message);
      throw e;
    }
    return {bookingId,passId,type,usedCount:nextUsed,remainingCount:nextRemaining,status:nextStatus,historyId:entryId,automaticDeduction:false};
  }finally{
    lock.releaseLock();
  }
}
function mdCandidateDeductPass(data){return mdCandidatePassAdjust_(Object.assign({},data,{type:'차감'}));}
function mdCandidateRestorePass(data){return mdCandidatePassAdjust_(Object.assign({},data,{type:'복구'}));}
function mdCandidatePassHistory(passId){
  passId=mdRequired_(passId,'이용권 ID');
  const sheet=mdSheet_('_이용권변동이력'),last=sheet.getLastRow();
  if(last<2)return [];
  return sheet.getRange(2,1,last-1,10).getDisplayValues().filter(r=>r[3]===passId).slice(-100).reverse()
    .map(r=>({id:r[0],at:r[1],type:r[2],passId:r[3],bookingId:r[4],delta:Number(r[5]),before:Number(r[6]),after:Number(r[7]),operator:r[8],reason:r[9]}));
}


/**
 * 멍더랜드 수동 이용권 차감·복구 회귀 테스트
 * 격리 스프레드시트 전용
 *
 * 실행 함수: mdRunCandidateRegressionTest
 */
function mdRunCandidateRegressionTest() {
  mdCheckSetup();

  const bookingSheet = mdSheet_('예약·등하원관리');
  const passSheet = mdSheet_('이용권관리');
  const ledger = mdSheet_('_이용권변동이력');

  const suffix = Utilities.getUuid().slice(0, 8).toUpperCase();
  const bookingId = 'RSV-CAND-' + suffix;
  const passId = 'PASS-CAND-' + suffix;
  const dogId = 'DOG-CAND-' + suffix;
  const today = Utilities.formatDate(
    new Date(), 'Asia/Seoul', 'yyyy-MM-dd'
  );

  const input = {
    bookingId: bookingId,
    passId: passId,
    operator: '신송이',
    reason: '회귀 테스트 복구'
  };

  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw Error('검증 실패: ' + message);
    results.push('PASS: ' + message);
  };

  // 신규 테스트 데이터 생성
  bookingSheet.appendRow([
    bookingId, today, dogId, '회귀테스트견',
    passId, '예약', new Date(), '',
    '등원 중', '미차감', '회귀 테스트 전용'
  ]);

  passSheet.appendRow([
    passId, dogId, 'PRODUCT-TEST', '테스트 8회권',
    today, 8, 0, 8, today, '',
    160000, 0, 160000, '완료', '사용 가능'
  ]);

  SpreadsheetApp.flush();

  const getPass = () => {
    const rows = passSheet.getDataRange().getValues();
    const row = rows.find(r => String(r[0]) === passId);
    if (!row) throw Error('테스트 이용권을 찾을 수 없습니다.');
    return row;
  };

  const getBooking = () => {
    const rows = bookingSheet.getDataRange().getValues();
    const row = rows.find(r => String(r[0]) === bookingId);
    if (!row) throw Error('테스트 예약을 찾을 수 없습니다.');
    return row;
  };

  const getHistory = () => {
    return mdCandidatePassHistory(passId).filter(
      r => r.bookingId === bookingId
    );
  };

  Logger.log('TEST IDS: ' + bookingId + ' / ' + passId);

  // 1. 정상 차감
  const deducted = mdCandidateDeductPass(input);
  assert(deducted.remainingCount === 7, '정상 차감 결과 7회');
  assert(Number(getPass()[6]) === 1, '사용 횟수 1회');
  assert(Number(getPass()[7]) === 7, '잔여 횟수 7회');
  assert(getBooking()[9] === '차감', '예약 차감상태 반영');
  assert(getHistory().length === 1, '차감 이력 1건');

  // 2. 중복 차감 방지
  const repeated = mdCandidateDeductPass(input);
  assert(repeated.alreadyDeducted === true, '중복 차감 방지');
  assert(Number(getPass()[7]) === 7, '중복 차감 후 잔여 7회');
  assert(getHistory().length === 1, '중복 이력 생성 방지');

  // 3. 정상 복구
  const restored = mdCandidateRestorePass(input);
  assert(restored.remainingCount === 8, '정상 복구 결과 8회');
  assert(Number(getPass()[6]) === 0, '복구 후 사용 횟수 0회');
  assert(Number(getPass()[7]) === 8, '복구 후 잔여 횟수 8회');
  assert(getBooking()[9] === '복구', '예약 복구상태 반영');
  assert(getHistory().length === 2, '차감·복구 이력 2건');

  // 4. 중복 복구 방지
  let blocked = false;
  try {
    mdCandidateRestorePass(input);
  } catch (e) {
    blocked = true;
    Logger.log('EXPECTED ERROR: ' + e.message);
  }
  assert(blocked, '중복 복구 차단');
  assert(Number(getPass()[7]) === 8, '중복 복구 후 잔여 8회');
  assert(getHistory().length === 2, '중복 복구 이력 생성 방지');

  Logger.log(JSON.stringify({
    ok: true,
    bookingId: bookingId,
    passId: passId,
    checks: results
  }, null, 2));

  return { ok: true, bookingId, passId, checks: results };
}
