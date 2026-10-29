/** 오늘 예약 카드 전용 조회: 대시보드 집계 API와 독립적으로 예약 행을 반환. */
function mdTodayBookingCards(date){
  date=mdRequired_(date,'조회일');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('조회일 형식이 올바르지 않습니다.');
  const sheet=mdSheet_('예약·등하원관리'),last=sheet.getLastRow();
  if(last<2)return [];
  const fmt=v=>v instanceof Date?Utilities.formatDate(v,'Asia/Seoul','yyyy-MM-dd'):String(v||'').slice(0,10);
  const time=v=>v instanceof Date?Utilities.formatDate(v,'Asia/Seoul','HH:mm'):String(v||'');
  return sheet.getRange(2,1,last-1,11).getValues().filter(r=>fmt(r[1])===date&&!['취소','예약취소'].includes(String(r[5])))
    .map(r=>({bookingId:String(r[0]),dogId:String(r[2]),dogName:String(r[3]),bookingStatus:String(r[5]),attendance:String(r[8]||'미등원'),deduction:String(r[9]||'미차감'),checkIn:time(r[6]),checkOut:time(r[7])}));
}
