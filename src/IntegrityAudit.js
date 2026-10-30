/** Read-only integrity report. No sheet creation or mutation. */
function mdAuditIntegrity(){
  const names=['고객·반려견관리','예약·등하원관리','이용권관리','_이용권변동이력'];
  const book=mdBook_(), data={};
  names.forEach(name=>{
    const sh=book.getSheetByName(name);
    if(!sh)throw Error('점검에 필요한 시트 누락: '+name);
    data[name]=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,name==='_이용권변동이력'?10:MD_SCHEMAS[name].length).getValues():[];
  });
  return mdAnalyzeIntegrity_(data);
}
function mdAnalyzeIntegrity_(data){
  const dogs=data['고객·반려견관리']||[],bookings=data['예약·등하원관리']||[];
  const passes=data['이용권관리']||[],history=data['_이용권변동이력']||[];
  const issues=[],add=(code,id,detail)=>issues.push({code,id:String(id||''),detail});
  const ids=(rows,label)=>{const set=new Set();rows.forEach(r=>{const id=String(r[0]||'');if(!id)add('MISSING_ID',label,'ID 누락');else if(set.has(id))add('DUPLICATE_ID',id,label+' ID 중복');set.add(id)});return set};
  const dogIds=ids(dogs,'반려견'),bookingIds=ids(bookings,'예약'),passIds=ids(passes,'이용권');
  const byPass=new Map(passes.map(p=>[String(p[0]),p]));
  const bookingMap=new Map(bookings.map(b=>[String(b[0]),b]));
  const net=new Map();
  history.forEach(h=>{
    const passId=String(h[3]||''),bookingId=String(h[4]||''),type=String(h[2]||'');
    if(!passIds.has(passId))add('ORPHAN_HISTORY_PASS',passId,'이력의 이용권 없음');
    if(!bookingIds.has(bookingId))add('ORPHAN_HISTORY_BOOKING',bookingId,'이력의 예약 없음');
    if(type!=='차감'&&type!=='복구'){add('UNKNOWN_HISTORY_TYPE',bookingId,type);return}
    const key=passId+'|'+bookingId;
    net.set(key,(net.get(key)||0)+(type==='차감'?1:-1));
  });
  const activeByPass=new Map();
  net.forEach((count,key)=>{
    const separator=key.indexOf('|'),passId=key.slice(0,separator),bookingId=key.slice(separator+1);
    if(count<0||count>1)add('INVALID_HISTORY_NET',bookingId,'이용권 '+passId+' 순차감 '+count);
    if(count===1)activeByPass.set(passId,(activeByPass.get(passId)||0)+1);
    const booking=bookingMap.get(bookingId);
    if(booking&&count===1&&(String(booking[4])!==passId||String(booking[9])!=='차감'))
      add('BOOKING_HISTORY_MISMATCH',bookingId,'차감 이력과 예약 연결/차감상태 불일치');
  });
  passes.forEach(p=>{
    const id=String(p[0]),total=Number(p[5]),used=Number(p[6]),remaining=Number(p[7]);
    if(!dogIds.has(String(p[1])))add('PASS_DOG_MISSING',id,'이용권 반려견 없음');
    if(![total,used,remaining].every(Number.isSafeInteger)||total<0||used<0||remaining<0||used+remaining!==total)
      add('PASS_COUNT_INVALID',id,'총/사용/잔여 횟수 불일치');
    const count=activeByPass.get(id)||0;
    if(Number.isSafeInteger(used)&&count!==used)add('PASS_HISTORY_COUNT_MISMATCH',id,'사용 '+used+'회, 순차감 이력 '+count+'회');
  });
  bookings.forEach(b=>{
    const id=String(b[0]),status=String(b[5]),attendance=String(b[8]),deduction=String(b[9]||'미차감'),linked=String(b[4]||'');
    if(!dogIds.has(String(b[2])))add('BOOKING_DOG_MISSING',id,'예약 반려견 없음');
    if(linked&&(!passIds.has(linked)||String((byPass.get(linked)||[])[1])!==String(b[2])))
      add('BOOKING_PASS_INVALID',id,'연결 이용권 없음 또는 반려견 불일치');
    if(status==='예약취소'&&(b[6]||b[7]||deduction==='차감'))add('CANCELLED_BOOKING_ACTIVITY',id,'취소 예약에 등하원/차감 기록 존재');
    if(attendance==='미등원'&&(b[6]||b[7]))add('ATTENDANCE_MISMATCH',id,'미등원인데 등하원 시간 존재');
    if(attendance==='등원 중'&&(!b[6]||b[7]))add('ATTENDANCE_MISMATCH',id,'등원 중 시간 불일치');
    if(attendance==='하원'&&(!b[6]||!b[7]))add('ATTENDANCE_MISMATCH',id,'하원 시간 누락');
    if(deduction==='차감'){
      if(!linked||net.get(linked+'|'+id)!==1)add('DEDUCTION_HISTORY_MISMATCH',id,'차감상태에 대응하는 순차감 이력 없음');
    }
  });
  return {ok:issues.length===0,counts:{dogs:dogs.length,bookings:bookings.length,passes:passes.length,history:history.length},issueCount:issues.length,issues};
}
