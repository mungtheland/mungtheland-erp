/** 멍더랜드 회계 V1: 실제 현금 흐름만 수동 입력. 이용권 사용은 매출을 생성하지 않는다. */
function mdAccountingSummary(month){
  month=mdRequired_(month,'조회월');
  if(!/^\d{4}-\d{2}$/.test(month))throw Error('조회월은 YYYY-MM 형식이어야 합니다.');
  const sheet=mdSheet_('회계관리'),last=sheet.getLastRow();
  const rows=last<2?[]:sheet.getRange(2,1,last-1,12).getValues();
  const fmt=v=>v instanceof Date?Utilities.formatDate(v,'Asia/Seoul','yyyy-MM-dd'):String(v||'').slice(0,10);
  const items=rows.filter(r=>fmt(r[1]).slice(0,7)===month&&String(r[9])==='확정').map(r=>({id:String(r[0]),date:fmt(r[1]),type:String(r[2]),category:String(r[3]),description:String(r[5]),income:Number(r[6])||0,expense:Number(r[7])||0,paymentMethod:String(r[8])}));
  const totals={sales:0,costs:0,contributions:0,withdrawals:0};
  items.forEach(r=>{if(r.type==='매출')totals.sales+=r.income;else if(r.type==='지출')totals.costs+=r.expense;else if(r.type==='출자금')totals.contributions+=r.income;else if(r.type==='인출금')totals.withdrawals+=r.expense;});
  return {month,totals,operatingResult:totals.sales-totals.costs,cashMovement:totals.sales+totals.contributions-totals.costs-totals.withdrawals,items:items.reverse().slice(0,100)};
}
function mdAddAccountingEntry(data){
  data=data||{};
  const type=mdRequired_(data.type,'거래유형'),category=mdRequired_(data.category,'거래분류');
  const description=mdRequired_(data.description,'거래내용'),date=mdRequired_(data.date,'거래일');
  if(!['매출','지출','출자금','인출금'].includes(type))throw Error('허용되지 않은 거래유형입니다.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date+'T00:00:00Z')))throw Error('거래일을 확인하세요.');
  const amount=Number(data.amount);
  if(!Number.isSafeInteger(amount)||amount<=0)throw Error('금액은 1원 이상의 정수여야 합니다.');
  const method=mdRequired_(data.paymentMethod,'결제수단');
  const requestId=mdRequired_(data.requestId,'등록 요청 ID');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    mdCheckSetup();
    const sheet=mdSheet_('회계관리');
    if(sheet.getLastRow()>1){
      const rows=sheet.getRange(2,1,sheet.getLastRow()-1,12).getDisplayValues();
      const previous=rows.find(r=>String(r[11]).includes('[REQ:'+requestId+']'));
      if(previous)return {transactionId:previous[0],alreadyRecorded:true,type:previous[2],amount:Number(previous[6])||Number(previous[7]),date:previous[1],status:previous[9]};
    }
    const id=mdId_('TXN'),income=['매출','출자금'].includes(type)?amount:0,expense=['지출','인출금'].includes(type)?amount:0;
    mdAppend_('회계관리',{'거래 ID':id,'거래일':date,'거래유형':type,'거래분류':category,'관련 ID':String(data.relatedId||'').trim(),'거래내용':description,'입금액':income,'출금액':expense,'결제수단':method,'거래상태':'확정','처리자':Session.getEffectiveUser().getEmail()||'운영자','비고':String(data.notes||'').trim()+' [REQ:'+requestId+']'});
    return {transactionId:id,type,amount,date,status:'확정',automatic:false};
  }finally{lock.releaseLock();}
}
