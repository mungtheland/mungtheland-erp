/** Private ledger port exercised against the local workbook fixture only. */
function mdAttendancePass_(operation,command){
  const event=command&&command.event;
  if(!['read','deduct'].includes(operation)||!event||event.action!=='check-in'||
    !/^RSV-[A-Z0-9-]{1,64}$/.test(event.bookingId||'')||!/^EVT-[a-f0-9-]{36}$/.test(event.eventId||'')||
    !/^STAFF-[A-Z0-9-]{1,64}$/.test(event.staffId||'')||!Number.isFinite(Date.parse(event.at))||
    command.key!=='local-sheets:'+event.bookingId)throw Error('PASS_COMMAND_INVALID');
  if(PropertiesService.getScriptProperties().getProperty('MD_ATTENDANCE_PASS_SCOPE')!=='local-sheets'||
    mdBook_().getId()!=='erp-local-pass-fixture')throw Error('PASS_WORKBOOK_UNAPPROVED');
  return mdPassAdjust_({type:'차감',bookingId:event.bookingId},{operation,command});
}

function mdPassCorrectionActor_(){
  const subject=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  let allowed;
  try{allowed=JSON.parse(PropertiesService.getScriptProperties().getProperty('MD_PASS_CORRECTION_APPROVERS')||'{}');}
  catch{throw Error('이용권 복구 관리자 설정을 확인하세요.');}
  const actor=subject&&allowed&&Object.prototype.hasOwnProperty.call(allowed,subject)?allowed[subject]:null;
  if(typeof actor!=='string'||!/^PASS-ADMIN-[A-Z0-9-]{1,48}$/.test(actor))throw Error('이용권 복구 관리자 권한이 필요합니다.');
  return actor;
}

function mdPassHistoryRows_(ledger){
  const last=ledger.getLastRow();
  return last>1?ledger.getRange(2,1,last-1,10).getValues():[];
}

function mdVerifyPassBalance_(history,passId,total,used,remaining){
  // Require a continuous history from issuance. An incomplete legacy balance needs review.
  let cursor=total;
  const ids=new Set();
  for(const row of history){
    if(String(row[3])!==passId)continue;
    const [id,,action,,,delta,before,after]=row;
    const direction=action==='차감'?-1:action==='복구'?1:0;
    if(!id||ids.has(id)||!direction||delta!==direction||before!==cursor||after!==cursor+direction||after<0||after>total)
      throw Error('PASS_HISTORY_MISMATCH');
    ids.add(id);
    cursor=after;
  }
  if(cursor!==remaining||total-cursor!==used)throw Error('PASS_BALANCE_MISMATCH');
}

/** Sheets entry shared by manual adjustments and the isolated attendance port. */
function mdPassAdjust_(data,automatic){
  data=data||{};
  const type=mdRequired_(data.type,'처리유형');
  if(type!=='차감'&&type!=='복구')throw Error('지원하지 않는 처리유형입니다.');
  const bookingId=mdRequired_(data.bookingId,'예약 ID');
  let passId=automatic?'':mdRequired_(data.passId,'이용권 ID');
  const rawReason=automatic?automatic.command.key+' '+automatic.command.event.eventId:
    type==='복구'?mdAuditReason_(data,'복구'):String(data.reason||'').trim();
  const reason=rawReason.startsWith('=')?"'"+rawReason:rawReason;
  const operator=automatic?'AUTO_ATTENDANCE':mdAuditOperator_(data);
  const auditActor=type==='복구'?mdPassCorrectionActor_():operator;
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
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
    const bRow=uniqueRow(bookingSheet,bookingId);
    if(bRow<2)throw Error('예약 또는 이용권을 찾을 수 없습니다.');
    const b=bookingSheet.getRange(bRow,1,1,11).getValues()[0];
    const linked=String(b[4]||''),deduction=String(b[9]||'미차감');
    const ledger=mdSheet_('_이용권변동이력');
    const history=mdPassHistoryRows_(ledger);
    const bookingHistory=history.filter(row=>String(row[4])===bookingId);
    if(automatic){
      const event=automatic.command.event;
      const visit=b[1] instanceof Date?Utilities.formatDate(b[1],'Asia/Seoul','yyyy-MM-dd'):String(b[1]).slice(0,10);
      const recordedAttendance=(!b[6]&&!b[7]&&b[8]==='미등원')||(b[6]&&!b[7]&&b[8]==='등원 중')||(b[6]&&b[7]&&b[8]==='하원');
      if(b[5]!=='예약'||!recordedAttendance||visit!==Utilities.formatDate(new Date(event.at),'Asia/Seoul','yyyy-MM-dd'))
        throw Error('PASS_BOOKING_ATTENDANCE_MISMATCH');
      if(!linked){
        if(deduction!=='미차감'||bookingHistory.length)throw Error('PASS_LINK_MISMATCH');
        return {status:'NOT_REQUIRED'};
      }
      passId=linked;
    }
    const pRow=uniqueRow(passSheet,passId);
    if(pRow<2)throw Error('예약 또는 이용권을 찾을 수 없습니다.');
    const p=passSheet.getRange(pRow,1,1,15).getValues()[0];
    if(String(b[2])!==String(p[1]))throw Error('예약과 이용권의 반려견이 다릅니다.');
    if(type==='차감'&&String(b[5])!=='예약')throw Error('예약상태가 예약인 경우에만 이용권을 차감할 수 있습니다.');
    if(!automatic&&type==='차감'&&(!b[6]||b[8]!=='등원 중'&&b[8]!=='하원'))throw Error('정상적인 등원 기록과 출석상태가 필요합니다.');
    const total=Number(p[5]),used=Number(p[6]),remaining=Number(p[7]);
    if(!Number.isSafeInteger(total)||!Number.isSafeInteger(used)||!Number.isSafeInteger(remaining)||used<0||remaining<0||used+remaining!==total)throw Error('이용권 횟수 무결성 오류입니다.');
    const bookingDate=b[1] instanceof Date?Utilities.formatDate(b[1],'Asia/Seoul','yyyy-MM-dd'):String(b[1]).slice(0,10);
    const start=p[8] instanceof Date?Utilities.formatDate(p[8],'Asia/Seoul','yyyy-MM-dd'):String(p[8]||'').slice(0,10);
    const expiry=p[9] instanceof Date?Utilities.formatDate(p[9],'Asia/Seoul','yyyy-MM-dd'):String(p[9]||'').slice(0,10);
    const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
    const netByPass=new Map();
    for(const [,,action,historyPassId] of bookingHistory){
      const delta=action==='차감'?1:action==='복구'?-1:0;
      if(automatic&&!delta)throw Error('PASS_HISTORY_MISMATCH');
      const id=String(historyPassId);
      netByPass.set(id,(netByPass.get(id)||0)+delta);
    }
    for(const [historyPassId,netChange] of netByPass){
      if(historyPassId!==passId&&netChange!==0)throw Error('같은 예약에 다른 이용권의 변동이력이 남아 있습니다. 관리자 점검이 필요합니다.');
    }
    const net=netByPass.get(passId)||0;
    if(net<0||net>1)throw Error('차감 이력 불일치: 수동 점검이 필요합니다.');
    const autoEntry=row=>row[2]==='차감'&&row[8]==='AUTO_ATTENDANCE';
    const automatedEntries=bookingHistory.filter(autoEntry);
    if(automatic||automatedEntries.length||history.some(row=>row[3]===passId&&autoEntry(row)))
      mdVerifyPassBalance_(history,passId,total,used,remaining);
    if(type==='차감'){
      if(linked&&linked!==passId)throw Error('다른 이용권이 연결된 예약입니다.');
      if((deduction==='차감')!==(net===1))throw Error('예약 차감상태와 변동이력이 불일치합니다. 관리자 점검이 필요합니다.');
      if(automatic){
        const kinds=JSON.parse(PropertiesService.getScriptProperties().getProperty('MD_PASS_PRODUCT_KINDS')||'{}');
        const productId=String(p[2]||'');
        const kind=productId&&kinds&&Object.prototype.hasOwnProperty.call(kinds,productId)?kinds[productId]:null;
        if(kind==='DAY'&&deduction==='미차감'&&!bookingHistory.length)return {status:'NOT_REQUIRED'};
        if(kind!=='RECURRING')throw Error('PASS_PRODUCT_UNCONFIRMED');
      }
      if(deduction==='차감'&&net===1){
        if(linked!==passId)throw Error('차감 이력과 예약의 이용권 연결이 불일치합니다. 관리자 점검이 필요합니다.');
        if(automatic){
          if(automatedEntries.length&&(automatedEntries.length!==1||automatedEntries[0][9]!==reason))
            throw Error('PASS_EVENT_MISMATCH');
          return {status:'COMPLETED'};
        }
        return {bookingId,passId,alreadyDeducted:true,remainingCount:remaining};
      }
      if(automatic){
        if(deduction!=='미차감'||bookingHistory.length||automatic.operation==='read')return {status:'NEEDS_REVIEW'};
        if(![8,12,16,20].includes(total))throw Error('PASS_RECURRING_COUNT_UNCONFIRMED');
        if((start&&!/^\d{4}-\d{2}-\d{2}$/.test(start))||(expiry&&!/^\d{4}-\d{2}-\d{2}$/.test(expiry)))throw Error('PASS_DATE_INVALID');
      }else if(automatedEntries.length)throw Error('이미 자동 차감 이력이 있어 다시 차감할 수 없습니다.');
      if(deduction!=='미차감'&&deduction!=='복구')throw Error('예약 차감상태가 올바르지 않습니다.');
      if(p[13]!=='완료'||!['사용 가능','소진'].includes(String(p[14])))throw Error('결제 완료된 사용 가능 이용권만 차감할 수 있습니다.');
      if(remaining<1)throw Error('잔여 횟수가 없습니다.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate))throw Error('예약 이용일이 올바르지 않습니다.');
      if(start&&bookingDate<start)throw Error('이용권 시작일 이전 예약입니다.');
      if(expiry&&bookingDate>expiry)throw Error('이용권 만료일 이후 예약입니다.');
      if(bookingDate>today)throw Error('미래 예약은 미리 차감할 수 없습니다.');
    }else{
      if(linked!==passId||deduction!=='차감'||net!==1)throw Error('해당 예약의 차감 기록이 없어 복구할 수 없습니다.');
      if(used<1||remaining>=total)throw Error('복구 가능한 사용 횟수가 없습니다.');
    }
    const nextUsed=used+(type==='차감'?1:-1);
    const nextRemaining=remaining+(type==='차감'?-1:1);
    const nextStatus=nextRemaining===0?'소진':'사용 가능';
    const nextDeduction=type==='차감'?'차감':'복구';
    // 자동 차감 결과가 불명확하면 기록을 보존하고 수동 확인으로 넘긴다.
    const entryId=mdId_('HIS');
    const oldPass=passSheet.getRange(pRow,7,1,2).getValues()[0];
    const oldStatus=passSheet.getRange(pRow,15).getValue();
    const oldBooking=bookingSheet.getRange(bRow,5).getValue();
    const oldDeduction=bookingSheet.getRange(bRow,10).getValue();
    let ledgerRow=0;
    try{
      ledger.appendRow([entryId,new Date(),type,passId,bookingId,type==='차감'?-1:1,remaining,nextRemaining,auditActor,reason]);
      ledgerRow=ledger.getLastRow();
      passSheet.getRange(pRow,7,1,2).setValues([[nextUsed,nextRemaining]]);
      passSheet.getRange(pRow,15).setValue(nextStatus);
      bookingSheet.getRange(bRow,5).setValue(passId);
      bookingSheet.getRange(bRow,10).setValue(nextDeduction);
      SpreadsheetApp.flush();
      if(automatic){
        const after=mdPassHistoryRows_(ledger);
        const counts=passSheet.getRange(pRow,7,1,2).getValues()[0];
        mdVerifyPassBalance_(after,passId,total,counts[0],counts[1]);
        if(counts[0]!==nextUsed||counts[1]!==nextRemaining||bookingSheet.getRange(bRow,10).getValue()!=='차감'||
          bookingSheet.getRange(bRow,5).getValue()!==passId||!after.some(row=>row[0]===entryId&&row[9]===reason))
          throw Error('PASS_WRITE_UNCONFIRMED');
        return {status:'COMPLETED'};
      }
    }catch(e){
      if(automatic)throw Error('PASS_WRITE_UNCONFIRMED');
      let rollbackFailed=false;
      try{
        passSheet.getRange(pRow,7,1,2).setValues([oldPass]);
        passSheet.getRange(pRow,15).setValue(oldStatus);
        bookingSheet.getRange(bRow,5).setValue(oldBooking);
        bookingSheet.getRange(bRow,10).setValue(oldDeduction);
        if(ledgerRow&&ledger.getRange(ledgerRow,1).getDisplayValue()===entryId)ledger.deleteRow(ledgerRow);
        SpreadsheetApp.flush();
      }catch(rollbackError){rollbackFailed=true;Logger.log('PASS_ROLLBACK_FAILED');}
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
    .map(r=>({id:r[0],at:r[1],type:r[2],passId:r[3],bookingId:r[4],delta:Number(r[5]),before:Number(r[6]),after:Number(r[7]),operator:r[8],reason:r[9]}));
}
