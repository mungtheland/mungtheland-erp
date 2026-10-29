/** 정산 V1: 미확정 참고 계산만 제공. 지급/분개는 발생하지 않는다. */
function mdSettlementPreview(data){
  data=data||{};
  const month=mdRequired_(data.month,'정산월');
  if(!/^\d{4}-\d{2}$/.test(month)||Number(month.slice(5))<1||Number(month.slice(5))>12)throw Error('정산월을 확인하세요.');
  const reserve=Number(data.reserve||0);
  if(!Number.isSafeInteger(reserve)||reserve<0)throw Error('유보금은 0원 이상의 정수여야 합니다.');
  const sheet=mdSheet_('회계관리'),last=sheet.getLastRow();
  const rows=last<2?[]:sheet.getRange(2,1,last-1,12).getValues();
  const fmt=v=>v instanceof Date?Utilities.formatDate(v,'Asia/Seoul','yyyy-MM-dd'):String(v||'').slice(0,10);
  const filtered=rows.filter(r=>r[0]&&String(r[9])==='확정'&&fmt(r[1]).slice(0,7)<=month);
  const current=filtered.filter(r=>fmt(r[1]).slice(0,7)===month);
  const sum=(list,type,col)=>list.filter(r=>String(r[2])===type).reduce((n,r)=>n+(Number(r[col])||0),0);
  const sales=sum(current,'매출',6),costs=sum(current,'지출',7);
  const monthProfit=sales-costs;
  const cashBalance=sum(filtered,'매출',6)+sum(filtered,'출자금',6)-sum(filtered,'지출',7)-sum(filtered,'인출금',7);
  const totalCapital=sum(filtered,'출자금',6)-sum(filtered,'인출금',7);
  const profitLimit=Math.max(0,monthProfit);
  const cashLimit=Math.max(0,cashBalance-reserve);
  const distributable=Math.min(profitLimit,cashLimit);
  const a=Math.floor(distributable/2),b=distributable-a;
  return {month,sales,costs,monthProfit,cashBalance,totalCapital,reserve,profitLimit,cashLimit,distributable,owners:{'운영자 A':a,'운영자 B':b},ratio:'50:50',previewOnly:true,warning:'수동 입력 현금거래 기준 참고치입니다. 미지급금·미수금·부가세·소득세·환불채무·기존 배분액 등은 자동 반영되지 않습니다. 실제 정산 전 장부 대사 및 별도 승인 필요.'};
}
