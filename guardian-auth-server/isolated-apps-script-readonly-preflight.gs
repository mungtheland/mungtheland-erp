/**
 * Read-only inspection of the isolated test booking, pass and ledger.
 * No writes. Explicit spreadsheet ID guard and unique row checks.
 */
function mdIsolatedReadOnlyPreflight() {
  const id='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';
  const bookingId='RSV-TEST-PARITY-002';
  const passId='PASS-TEST-PARITY-002';
  if(MD_ISOLATED_SHEET_ID!==id||MD_ISOLATED_BOOKING_ID!==bookingId||MD_ISOLATED_PASS_ID!==passId) {
    throw Error('ISOLATION_GUARD');
  }
  const ss=SpreadsheetApp.openById(id);
  function rowById(name,target,width) {
    const sheet=ss.getSheetByName(name);
    if(!sheet||sheet.getLastRow()<2)throw Error('MISSING_SHEET_OR_ROWS: '+name);
    const values=sheet.getRange(2,1,sheet.getLastRow()-1,width).getDisplayValues();
    const matches=values.filter(r=>r[0]===target);
    if(matches.length!==1)throw Error('NON_UNIQUE_OR_MISSING_ID: '+name);
    return matches[0];
  }
  const b=rowById('예약·등하원관리',bookingId,11);
  const p=rowById('이용권관리',passId,15);
  const hs=ss.getSheetByName('_이용권변동이력');
  if(!hs)throw Error('MISSING_HISTORY_SHEET');
  const entries=hs.getLastRow()<2?[]:hs.getRange(2,1,hs.getLastRow()-1,10).getDisplayValues()
    .filter(r=>r[3]===passId&&r[4]===bookingId);
  const net=entries.reduce((n,r)=>n+(r[2]==='차감'?1:r[2]==='복구'?-1:0),0);
  const total=Number(p[5]),used=Number(p[6]),remaining=Number(p[7]);
  const result={
    mode:'READ_ONLY_NO_WRITES',spreadsheetId:id,bookingId,passId,
    bookingPassId:b[4],bookingDeduction:b[9],bookingAttendance:b[8],
    passDogMatchesBooking:b[2]===p[1],total,used,remaining,
    historyCount:entries.length,historyNet:net,
    balanceValid:Number.isSafeInteger(total)&&Number.isSafeInteger(used)&&Number.isSafeInteger(remaining)&&total>0&&used>=0&&remaining>=0&&total===used+remaining,
    readyForRestore:b[4]===passId&&b[2]===p[1]&&b[9]==='차감'&&net===1&&used>=1&&remaining<total
  };
  console.log(JSON.stringify(result));
  return result;
}
