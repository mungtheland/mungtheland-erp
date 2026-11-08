/**
 * ISOLATED Apps Script only. Not deployed; not wired to any production endpoint.
 * Install into a separate Apps Script project bound to the isolated workbook.
 * Uses Apps Script LockService shared by calls to THIS script project only.
 */
const MD_ISOLATED_SHEET_ID='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';
const MD_ISOLATED_BOOKING_ID='RSV-TEST-PARITY-002';
const MD_ISOLATED_PASS_ID='PASS-TEST-PARITY-002';
function mdIsolatedPassAdjust_(request){
  if(!request||request.confirm!=='ISOLATED_TEST_ONLY'||!((request.bookingId===MD_ISOLATED_BOOKING_ID&&request.passId===MD_ISOLATED_PASS_ID)||
       (request.bookingId==='RSV-TEST-CONCURRENT-003'&&request.passId==='PASS-TEST-CONCURRENT-003')||
       (request.bookingId==='RSV-TEST-CONCURRENT-004'&&request.passId==='PASS-TEST-CONCURRENT-004'))||!['차감','복구'].includes(request.type))
    throw Error('ISOLATION_GUARD');
  if(request.type==='복구'&&!String(request.reason||'').trim())throw Error('RESTORE_REASON_REQUIRED');
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const book=SpreadsheetApp.openById(MD_ISOLATED_SHEET_ID);
    const bs=book.getSheetByName('예약·등하원관리'),ps=book.getSheetByName('이용권관리'),hs=book.getSheetByName('_이용권변동이력');
    if(!bs||!ps||!hs)throw Error('SCHEMA_MISSING');
    const find=(sheet,id,col)=>{
      const rows=sheet.getRange(2,col,Math.max(sheet.getLastRow()-1,1),1).getDisplayValues();
      const matches=[];rows.forEach((r,i)=>{if(r[0]===id)matches.push(i+2);});
      if(matches.length!==1)throw Error('AMBIGUOUS_ID: '+id);
      return matches[0];
    };
    const br=find(bs,request.bookingId,1),pr=find(ps,request.passId,1);
    const b=bs.getRange(br,1,1,11).getValues()[0],p=ps.getRange(pr,1,1,15).getValues()[0];
    if(String(b[4])!==request.passId||String(b[2])!==String(p[1]))throw Error('LINK_MISMATCH');
    const history=hs.getLastRow()>1?hs.getRange(2,1,hs.getLastRow()-1,10).getValues()
      .filter(r=>String(r[3])===request.passId&&String(r[4])===request.bookingId):[];
    const net=history.reduce((n,r)=>n+(r[2]==='차감'?1:r[2]==='복구'?-1:0),0);
    const total=Number(p[5]),used=Number(p[6]),remaining=Number(p[7]);
    if(![total,used,remaining].every(Number.isSafeInteger)||total<1||used<0||remaining<0||used+remaining!==total||net<0||net>1)
      throw Error('LEDGER_INTEGRITY_ERROR');
    const deduction=String(b[9]||'미차감');
    if(request.type==='차감'&&deduction==='차감'&&net===1)return {decision:'ALREADY_DEDUCTED',remaining,writes:0};
    if(request.type==='차감'){
      if(deduction==='차감'||net!==0)throw Error('PARTIAL_DEDUCTION_RECONCILE');
      if(!['미차감','복구'].includes(deduction)||String(b[5])!=='예약'||!b[6]||!['등원 중','하원'].includes(String(b[8])))
        throw Error('INVALID_ATTENDANCE');
      if(String(p[13])!=='완료'||String(p[14])!=='사용 가능'||remaining<1)throw Error('PASS_NOT_USABLE');
      const day=v=>v instanceof Date?Utilities.formatDate(v,'Asia/Seoul','yyyy-MM-dd'):String(v||'').slice(0,10);
      const visit=day(b[1]),start=day(p[8]),expiry=day(p[9]),today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(visit)||visit>today||start&&visit<start||expiry&&visit>expiry)throw Error('OUTSIDE_VALIDITY');
    }else if(deduction!=='차감'||net!==1||used<1||remaining>=total)throw Error('NOT_RESTORABLE');
    const delta=request.type==='차감'?-1:1,nextRemaining=remaining+delta,nextUsed=used-delta;
    const historyId='HIS-TEST-'+Utilities.getUuid();
    const old={used,remaining,status:p[14],deduction};
    let appended=false;
    try{
      hs.appendRow([historyId,new Date(),request.type,request.passId,request.bookingId,delta,remaining,nextRemaining,
        String(request.operator||'STAFF-TEST-001'),String(request.reason||'')]);
      appended=true;
      ps.getRange(pr,7,1,2).setValues([[nextUsed,nextRemaining]]);
      ps.getRange(pr,15).setValue(nextRemaining===0?'소진':'사용 가능');
      bs.getRange(br,10).setValue(request.type==='차감'?'차감':'복구');
      SpreadsheetApp.flush();
    }catch(e){
      try{
        ps.getRange(pr,7,1,2).setValues([[old.used,old.remaining]]);
        ps.getRange(pr,15).setValue(old.status);
        bs.getRange(br,10).setValue(old.deduction);
        if(appended){
          const last=hs.getLastRow();
          if(String(hs.getRange(last,1).getValue())!==historyId)throw Error('AUDIT_ROW_MOVED');
          hs.deleteRow(last);
        }
        SpreadsheetApp.flush();
      }catch(rollbackError){throw Error('ROLLBACK_UNCERTAIN_MANUAL_RECONCILIATION: '+rollbackError.message);}
      throw Error('WRITE_FAILED_ROLLED_BACK: '+e.message);
    }
    return {decision:request.type==='차감'?'DEDUCTED':'RESTORED',remaining:nextRemaining,writes:1,historyId};
  }finally{lock.releaseLock();}
}
// No public doGet/doPost, no automatic trigger. Call only with explicit request after independent review.
