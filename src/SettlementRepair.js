/** Reconcile one already-recorded payout. Never creates a cash transaction. */
function mdRepairSettlementPayment(data){
 data=data||{};
 const month=mdRequired_(data.month,'정산월');
 const requestId=mdRequired_(data.requestId,'요청 ID');
 if(!/^REQ-[A-Za-z0-9-]{8,100}$/.test(requestId))throw Error('요청 ID 형식 오류');
 if(data.confirm!==true)throw Error('명시적 복구 승인 필요');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const sh=mdSheet_('_정산이력'),n=sh.getLastRow();
  const rows=n<2?[]:sh.getRange(2,1,n-1,18).getValues();
  const idx=rows.findIndex(x=>String(x[1])===month);
  if(idx<0)throw Error('정산 기록 없음');
  const r=rows[idx],row=idx+2;
  if(String(r[14])!==mdSettlementSnapshot_(month))throw Error('원장 변경: 수동 검토 필요');
  const ledger=mdSheet_('회계관리'),last=ledger.getLastRow();
  const matches=(last<2?[]:ledger.getRange(2,1,last-1,12).getValues()).filter(x=>String(x[11]).includes('[REQ:'+requestId+']'));
  if(matches.length!==1)throw Error('원장 요청 ID가 유일하지 않습니다');
  const tx=matches[0],owner=(String(tx[11]).match(/\[OWNER:(운영자 A|운영자 B)\]/)||[])[1];
  if(String(tx[4])!==String(r[0])||String(tx[2])!=='인출금'||String(tx[3])!=='이익배분'||String(tx[9])!=='확정'||!owner)throw Error('지급 거래 속성 불일치');
  const amount=Number(tx[7]),paidCol=owner==='운영자 A'?12:13,historyCol=owner==='운영자 A'?17:18;
  if(!Number.isSafeInteger(amount)||amount<=0||Number(tx[6])!==0)throw Error('금액 오류');
  const history=String(r[historyCol-1]||'');
  const historyRecorded=history.includes('[REQ:'+requestId+']');
  const all=last<2?[]:ledger.getRange(2,1,last-1,12).getValues();
  const ownerTotal=all.filter(x=>String(x[4])===String(r[0])&&String(x[2])==='인출금'&&String(x[3])==='이익배분'&&String(x[9])==='확정'&&String(x[11]).includes('[OWNER:'+owner+']')).reduce((v,x)=>v+Number(x[7]||0),0);
  const paid=Number(r[paidCol-1]||0),limit=Number(r[owner==='운영자 A'?9:10]);
  if(ownerTotal>limit)throw Error('지급 한도 초과: 수동 검토 필요');
  if(ownerTotal!==paid&&ownerTotal!==paid+amount)throw Error('복수 불일치: 수동 검토 필요');
  if(historyRecorded&&ownerTotal===paid)return {alreadyReconciled:true};
  if(!historyRecorded&&ownerTotal===paid)throw Error('지급 합계는 일치하나 요청 이력이 누락됨: 수동 검토 필요');
  if(!historyRecorded)sh.getRange(row,historyCol).setValue(history+' [REQ:'+requestId+'] '+String(tx[0]));
  if(ownerTotal===paid+amount)sh.getRange(row,paidCol).setValue(ownerTotal);
  const a=Number(sh.getRange(row,12).getValue()),b=Number(sh.getRange(row,13).getValue());
  sh.getRange(row,14).setValue(a+b>=Number(r[8])?'지급 완료':'일부 지급');
  return {repaired:true,transactionId:String(tx[0]),owner,amount,paidUpdated:ownerTotal===paid+amount};
 }finally{lock.releaseLock();}
}
