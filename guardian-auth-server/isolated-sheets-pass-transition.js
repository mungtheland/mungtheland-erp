'use strict';
// Pure state transition for the isolated Sheets pass ledger. No I/O.
// A caller MUST hold an exclusive per-workbook lock and re-read current rows
// before applying this plan; this function alone is not concurrency protection.
function planPassAdjustment({booking,pass,history,type,today}){
 if(!['차감','복구'].includes(type))throw Error('INVALID_TYPE');
 if(!booking||!pass||!Array.isArray(history))throw Error('INVALID_INPUT');
 if(booking.passId!==pass.passId||booking.dogId!==pass.dogId)throw Error('LINK_MISMATCH');
 const total=pass.total,used=pass.used,remaining=pass.remaining;
 if(![total,used,remaining].every(Number.isSafeInteger)||total<1||used<0||remaining<0||used+remaining!==total)throw Error('INVALID_BALANCE');
 if(history.some(x=>x.bookingId!==booking.bookingId||x.passId!==pass.passId||!['차감','복구'].includes(x.type)))throw Error('INVALID_HISTORY');
 const net=history.reduce((n,x)=>n+(x.type==='차감'?1:-1),0);
 if(net<0||net>1)throw Error('INVALID_HISTORY_NET');
 if(type==='차감'){
  if(booking.deduction==='차감'&&net===1)return {decision:'ALREADY_DEDUCTED',write:false,remaining};
  if(booking.deduction==='차감'||net===1)throw Error('INCONSISTENT_DEDUCTION');
  if(!['미차감','복구'].includes(booking.deduction))throw Error('INVALID_DEDUCTION_STATUS');
  if(booking.status!=='예약'||!booking.checkedInAt||!['등원 중','하원'].includes(booking.attendance))throw Error('NO_VALID_CHECKIN');
  if(pass.payment!=='완료'||pass.status!=='사용 가능'||remaining<1)throw Error('PASS_NOT_USABLE');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)||!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('INVALID_DATE');
  if(booking.date>today||(pass.start&&booking.date<pass.start)||(pass.expiry&&booking.date>pass.expiry))throw Error('OUTSIDE_VALIDITY');
 }else{
  if(booking.deduction!=='차감'||net!==1||used<1||remaining>=total)throw Error('NOT_RESTORABLE');
 }
 const delta=type==='차감'?-1:1;
 return {decision:type==='차감'?'DEDUCT':'RESTORE',write:true,used:used-delta,remaining:remaining+delta,
  passStatus:remaining+delta===0?'소진':'사용 가능',bookingDeduction:type,
  history:{type,bookingId:booking.bookingId,passId:pass.passId,delta,before:remaining,after:remaining+delta}};
}
module.exports={planPassAdjustment};
