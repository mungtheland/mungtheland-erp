/**
 * Manual, single-purpose test entrypoint.
 * Writes ONLY to the isolated spreadsheet and the fixed synthetic booking/pass.
 * This is intentionally NOT a trigger or a deployed web endpoint.
 */
function mdIsolatedRestoreOnceTest() {
  const preflight=mdIsolatedReadOnlyPreflight();
  if(preflight.mode!=='READ_ONLY_NO_WRITES'||
     preflight.spreadsheetId!=='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY'||
     preflight.bookingId!=='RSV-TEST-PARITY-002'||
     preflight.passId!=='PASS-TEST-PARITY-002'||
     preflight.total!==8||preflight.used!==1||preflight.remaining!==7||
     preflight.historyCount!==1||preflight.historyNet!==1||
     preflight.bookingDeduction!=='차감'||preflight.readyForRestore!==true||
     preflight.balanceValid!==true) {
    throw Error('RESTORE_PREFLIGHT_MISMATCH_NO_WRITE');
  }
  const result=mdIsolatedPassAdjust_({
    confirm:'ISOLATED_TEST_ONLY',
    bookingId:'RSV-TEST-PARITY-002',
    passId:'PASS-TEST-PARITY-002',
    type:'복구',
    operator:'STAFF-TEST-001',
    reason:'격리 Apps Script 복구 기능 검증'
  });
  console.log(JSON.stringify({test:'ISOLATED_RESTORE_ONCE',result}));
  return result;
}
