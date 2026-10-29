/** Settlement payout: record a transfer already made, never initiate bank transfers. */
function mdSettlementPayment(data) {
  data=data||{};
  const month=mdRequired_(data.month,'정산월');
  const owner=mdRequired_(data.owner,'운영자');
  const date=mdRequired_(data.date,'송금일');
  const requestId=mdRequired_(data.requestId,'요청 ID');
  const amount=Number(data.amount);
  if(!/^REQ-[A-Za-z0-9-]{8,100}$/.test(requestId))throw Error('요청 ID 형식 오류');
  if(!['운영자 A','운영자 B'].includes(owner))throw Error('운영자 선택 오류');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('송금일 형식 오류');
  if(!Number.isSafeInteger(amount)||amount<=0)throw Error('금액 오류');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const sheet=mdSheet_('_정산이력');
    const last=sheet.getLastRow();
    const rows=last<2?[]:sheet.getRange(2,1,last-1,18).getValues();
    const index=rows.findIndex(r=>String(r[1])===month);
    if(index<0)throw Error('확정된 정산이 없습니다.');
    const r=rows[index],row=index+2;
    const paidCol=owner==='운영자 A'?12:13;
    const historyCol=owner==='운영자 A'?17:18;
    const history=String(r[historyCol-1]||'');
    if(history.includes('[REQ:'+requestId+']'))return {alreadyRecorded:true};
    const ledger=mdSheet_('회계관리');
    const ledgerRows=ledger.getLastRow()<2?[]:ledger.getRange(2,1,ledger.getLastRow()-1,12).getDisplayValues();
    if(ledgerRows.some(x=>String(x[11]).includes('[REQ:'+requestId+']')))throw Error('회계 원장에 이미 기록된 지급 요청입니다. 정산 이력 확인 필요');
    const reconciliation=mdSettlementStatus(month);
    if(reconciliation.inconsistent)throw Error('지급 이력과 회계 원장이 불일치합니다. 지급을 중단합니다.');
    if(reconciliation.changed)throw Error('정산 후 원장이 변경되었습니다. 검토가 필요합니다.');
    const remaining=Number(r[owner==='운영자 A'?9:10])-Number(r[paidCol-1]||0);
    if(amount>remaining)throw Error('미지급 잔액 초과');
    const currentCash=mdSettlementPreview({month,reserve:0}).cashBalance;
    if(currentCash<amount)throw Error('장부상 현금잔액이 지급액보다 적습니다.');
    const transactionId=mdId_('TXN');
    mdAppend_('회계관리',{'거래 ID':transactionId,'거래일':date,'거래유형':'인출금','거래분류':'이익배분','관련 ID':String(r[0]),'거래내용':month+' '+owner+' 정산 지급','입금액':0,'출금액':amount,'결제수단':'계좌이체','거래상태':'확정','처리자':Session.getEffectiveUser().getEmail()||'운영자','비고':'[OWNER:'+owner+'] [REQ:'+requestId+']'});
    sheet.getRange(row,historyCol).setValue(history+' [REQ:'+requestId+'] '+transactionId);
    sheet.getRange(row,paidCol).setValue(Number(r[paidCol-1]||0)+amount);
    // 확정 당시의 원장 서명은 변경하지 않는다.
    const paid=Number(sheet.getRange(row,12).getValue())+Number(sheet.getRange(row,13).getValue());
    sheet.getRange(row,14).setValue(paid>=Number(r[8])?'지급 완료':'일부 지급');
    return {transactionId,remaining:remaining-amount,amount,owner};
  } finally {lock.releaseLock();}
}
