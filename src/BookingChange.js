/** 예약 변경: 등원 전·미차감 예약에 한해 취소 또는 이용일 변경. */
function mdChangeBooking(data){
  data=data||{};
  const bookingId=mdRequired_(data.bookingId,'예약 ID');
  const action=mdRequired_(data.action,'변경 유형');
  if(action!=='취소'&&action!=='날짜변경')throw Error('지원하지 않는 예약 변경 유형입니다.');
  const newDate=action==='날짜변경'?mdRequired_(data.newDate,'변경 이용일'):'';
  if(newDate){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(newDate))throw Error('이용일 형식은 yyyy-MM-dd입니다.');
    const d=new Date(newDate+'T00:00:00Z');
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==newDate)throw Error('존재하지 않는 이용일입니다.');
  }
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    mdCheckSetup();
    const sheet=mdSheet_('예약·등하원관리');
    const row=mdFindById_(sheet,bookingId);
    if(row<2)throw Error('예약을 찾을 수 없습니다.');
    const b=sheet.getRange(row,1,1,11).getValues()[0];
    const status=String(b[5]||''),attendance=String(b[8]||''),deduction=String(b[9]||'미차감');
    if(status!=='예약'||b[6]||b[7]||attendance!=='미등원'||deduction!=='미차감'||b[4])
      throw Error('등원 전·미차감·이용권 미연결 예약만 변경할 수 있습니다.');
    if(action==='취소'){
      sheet.getRange(row,6).setValue('예약취소');
      return {bookingId,action,status:'예약취소'};
    }
    const oldDate=b[1] instanceof Date?Utilities.formatDate(b[1],'Asia/Seoul','yyyy-MM-dd'):String(b[1]).slice(0,10);
    if(newDate===oldDate)return {bookingId,action,oldDate,newDate,unchanged:true};
    const last=sheet.getLastRow();
    if(last>1){
      const all=sheet.getRange(2,1,last-1,11).getValues();
      const conflict=all.some((r,i)=>{
        if(i+2===row||String(r[2])!==String(b[2])||['취소','예약취소'].includes(String(r[5])))return false;
        const date=r[1] instanceof Date?Utilities.formatDate(r[1],'Asia/Seoul','yyyy-MM-dd'):String(r[1]).slice(0,10);
        return date===newDate;
      });
      if(conflict)throw Error('변경할 날짜에 동일 반려견의 예약이 이미 존재합니다.');
    }
    sheet.getRange(row,2).setValue(newDate);
    return {bookingId,action,oldDate,newDate};
  }finally{lock.releaseLock();}
}
