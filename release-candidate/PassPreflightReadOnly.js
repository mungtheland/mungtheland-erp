/**
 * 멍더랜드 운영 적용 전 읽기 전용 점검 (미배포).
 * 운영 Apps Script에 복사하거나 실행하려면 별도 승인 필요.
 * 시트 생성/수정, 로그 삭제, 배포를 수행하지 않는다.
 */
function mdPreflightPassReadOnly(){
  const book=mdBook_();
  const findings=[];
  const counts={bookings:0,passes:0,history:0};
  const add=(severity,code,detail)=>findings.push({severity,code,detail});
  const specs={
    '예약·등하원관리':['예약 ID','이용일','반려견 ID','반려견명','이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태','비고'],
    '이용권관리':['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'],
    '_이용권변동이력':['이력 ID','처리시각','처리유형','이용권 ID','예약 ID','변동횟수','변경전 잔여','변경후 잔여','처리자','사유']
  };
  const rows={};
  Object.keys(specs).forEach(name=>{
    const sheet=book.getSheetByName(name);
    if(!sheet){add('BLOCKER','MISSING_SHEET',name);rows[name]=null;return;}
    const expected=specs[name];
    const actual=sheet.getRange(1,1,1,expected.length).getDisplayValues()[0];
    expected.forEach((v,i)=>{if(actual[i]!==v)add('BLOCKER','HEADER_MISMATCH',name+' '+(i+1)+'열: 기대 '+v+' / 실제 '+actual[i]);});
    const last=sheet.getLastRow();
    rows[name]=last>1?sheet.getRange(2,1,last-1,expected.length).getDisplayValues():[];
  });
  const bookings=rows['예약·등하원관리'],passes=rows['이용권관리'],history=rows['_이용권변동이력'];
  counts.bookings=bookings?bookings.length:0;
  counts.passes=passes?passes.length:0;
  counts.history=history?history.length:0;
  const index=(items,label)=>{
    const m=new Map();
    if(!items)return m;
    items.forEach((r,i)=>{
      const id=String(r[0]||'').trim();
      if(!id){add('BLOCKER','EMPTY_ID',label+' '+(i+2)+'행');return;}
      if(m.has(id))add('BLOCKER','DUPLICATE_ID',label+' '+id+' ('+(m.get(id).row)+'행, '+(i+2)+'행)');
      else m.set(id,{row:i+2,values:r});
    });
    return m;
  };
  const bi=index(bookings,'예약'),pi=index(passes,'이용권'),hi=index(history,'이력');
  const net=new Map();
  if(history)history.forEach((r,i)=>{
    const type=r[2],pid=r[3],bid=r[4];
    if(type!=='차감'&&type!=='복구'){add('BLOCKER','UNKNOWN_HISTORY_TYPE',(i+2)+'행 '+type);return;}
    if(!pi.has(pid)||!bi.has(bid))add('BLOCKER','ORPHAN_HISTORY',(i+2)+'행 '+pid+' / '+bid);
    const key=bid+'\u0001'+pid;
    net.set(key,(net.get(key)||0)+(type==='차감'?1:-1));
  });
  if(passes)passes.forEach((p,i)=>{
    const total=Number(p[5]),used=Number(p[6]),remain=Number(p[7]);
    if(![total,used,remain].every(Number.isSafeInteger)||total<0||used<0||remain<0||used+remain!==total)
      add('BLOCKER','PASS_COUNT_MISMATCH',(i+2)+'행 '+p[0]);
  });
  if(bookings)bookings.forEach((b,i)=>{
    const id=b[0],linked=b[4],status=b[9]||'미차감';
    const entries=Array.from(net.entries()).filter(([key])=>key.startsWith(id+'\u0001'));
    const active=entries.filter(([,n])=>n===1);
    if(entries.some(([,n])=>n<0||n>1))add('BLOCKER','INVALID_HISTORY_NET',(i+2)+'행 '+id);
    if(active.length>1)add('BLOCKER','MULTIPLE_ACTIVE_PASSES',(i+2)+'행 '+id);
    if(status==='차감'){
      if(!linked||!pi.has(linked)||net.get(id+'\u0001'+linked)!==1)
        add('BLOCKER','DEDUCTION_LEDGER_MISMATCH',(i+2)+'행 '+id);
    }else if(active.length)add('BLOCKER','UNEXPECTED_ACTIVE_HISTORY',(i+2)+'행 '+id+' 상태 '+status);
    if(linked&&pi.has(linked)&&b[2]!==pi.get(linked).values[1])
      add('BLOCKER','DOG_MISMATCH',(i+2)+'행 '+id);
    if(linked&&!pi.has(linked))add('BLOCKER','MISSING_LINKED_PASS',(i+2)+'행 '+id+' / '+linked);
    if(!['미차감','차감','복구'].includes(status))add('BLOCKER','UNKNOWN_DEDUCTION_STATUS',(i+2)+'행 '+id+' / '+status);
  });
  const result={
    mode:'READ_ONLY',spreadsheetId:book.getId(),checkedAt:new Date().toISOString(),
    counts,ok:findings.length===0,findings,
    note:'정적 무결성 점검만 수행. 백업 상태, 실제 잠금 경합, 동시 수동 편집은 확인하지 않음.'
  };
  Logger.log(JSON.stringify(result));
  return result;
}
