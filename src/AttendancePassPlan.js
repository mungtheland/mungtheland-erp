/** Shared attendance eligibility rules. This file has no workbook or network access. */
function mdVerifyPassBalance_(history,passId,total,used,remaining){
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

function mdPassDay_(value,formatDay){
  if(value instanceof Date)return Number.isFinite(value.getTime())?formatDay(value):null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const at=new Date(value+'T00:00:00Z');
  return Number.isFinite(at.getTime())&&at.toISOString().slice(0,10)===value?value:null;
}

function mdPlanAttendancePass_({bookingId,booking:b,pass:p,history,event,scope,productKinds,formatDay,today,attendanceState}){
  const review=reason=>({status:'NEEDS_REVIEW',reason});
  const visit=mdPassDay_(b[1],formatDay);
  const eventDate=new Date(event.at);
  const recordedAttendance=(!b[6]&&!b[7]&&b[8]==='미등원')||
    (b[6]&&!b[7]&&b[8]==='등원 중')||(b[6]&&b[7]&&b[8]==='하원');
  if(b[0]!==bookingId||event.bookingId!==bookingId||event.action!=='check-in'||b[5]!=='예약'||!recordedAttendance||
    !visit||!Number.isFinite(eventDate.getTime())||visit!==formatDay(eventDate)||(attendanceState==='등원 중'&&b[8]==='하원'))
    return review('PASS_BOOKING_ATTENDANCE_MISMATCH');

  const linked=String(b[4]||''),deduction=String(b[9]||'미차감');
  const bookingHistory=history.filter(row=>String(row[4])===bookingId);
  if(!linked)return review(deduction==='미차감'&&!bookingHistory.length?'PASS_NOT_LINKED':'PASS_LINK_MISMATCH');
  if(!p||p[0]!==linked)return review('PASS_LINK_MISMATCH');
  if(!b[2]||String(b[2])!==String(p[1]))return review('PASS_DOG_MISMATCH');
  const [total,used,remaining]=p.slice(5,8);
  if(![total,used,remaining].every(Number.isSafeInteger)||total<1||used<0||remaining<0||used+remaining!==total)
    return review('PASS_BALANCE_MISMATCH');

  const netByPass=new Map();
  for(const [,,action,historyPassId] of bookingHistory){
    const delta=action==='차감'?1:action==='복구'?-1:0;
    if(!historyPassId||!delta)return review('PASS_HISTORY_MISMATCH');
    const id=String(historyPassId);
    const balance=(netByPass.get(id)||0)+delta;
    if(balance<0||balance>1)return review('PASS_HISTORY_MISMATCH');
    netByPass.set(id,balance);
  }
  if([...netByPass].some(([id,balance])=>id!==linked&&balance!==0))return review('PASS_CROSS_PASS_HISTORY');
  const previouslyCharged=netByPass.get(linked)===1;
  if(!['미차감','차감','복구'].includes(deduction)||previouslyCharged!==(deduction==='차감'))
    return review('PASS_DEDUCTION_FLAG_MISMATCH');
  try{mdVerifyPassBalance_(history,linked,total,used,remaining);}
  catch(error){return review(error.message==='PASS_BALANCE_MISMATCH'?'PASS_BALANCE_MISMATCH':'PASS_HISTORY_MISMATCH');}

  const productId=String(p[2]||'');
  const kind=productId&&productKinds&&Object.prototype.hasOwnProperty.call(productKinds,productId)?productKinds[productId]:null;
  if(kind==='DAY'&&deduction==='미차감'&&!bookingHistory.length)return {status:'NOT_REQUIRED',reason:'DAY_PASS'};
  if(kind!=='RECURRING')return review('PASS_PRODUCT_UNCONFIRMED');
  if(![8,12,16,20].includes(total))return review('PASS_RECURRING_COUNT_UNCONFIRMED');

  if(previouslyCharged){
    const automaticRows=bookingHistory.filter(row=>row[2]==='차감'&&row[8]==='AUTO_ATTENDANCE');
    if(automaticRows.length&&(automaticRows.length!==1||automaticRows[0][9]!==scope+':'+bookingId+' '+event.eventId))
      return review('PASS_EVENT_MISMATCH');
    return {status:'COMPLETED',reason:automaticRows.length?'ALREADY_AUTOMATIC':'ALREADY_MANUAL'};
  }
  if(deduction!=='미차감'||bookingHistory.length)return review('PASS_PRIOR_ADJUSTMENT');
  if(attendanceState==='하원 완료')return review('PASS_CHECKOUT_COMPLETE');
  if(p[13]!=='완료')return review('PASS_PAYMENT_UNCONFIRMED');
  if(remaining===0)return review('PASS_NO_REMAINING');
  if(p[14]!=='사용 가능')return review('PASS_NOT_ACTIVE');

  const start=mdPassDay_(p[8],formatDay),expiry=mdPassDay_(p[9],formatDay);
  if((p[8]&&!start)||(p[9]&&!expiry)||(start&&expiry&&start>expiry))return review('PASS_DATE_INVALID');
  if(start&&visit<start)return review('PASS_BEFORE_START');
  if(expiry&&visit>expiry)return review('PASS_AFTER_EXPIRY');
  if(visit>today)return review('PASS_FUTURE_VISIT');
  return {status:'ELIGIBLE',reason:'RECURRING_PASS',projection:{usedBefore:used,usedAfter:used+1,remainingBefore:remaining,remainingAfter:remaining-1}};
}

if(typeof module!=='undefined')module.exports={mdPlanAttendancePass_};
