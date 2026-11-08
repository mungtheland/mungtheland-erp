/**
 * Manual concurrency probe for the isolated Apps Script project only.
 * Run A and B from separate Apps Script editor tabs within 6 seconds.
 * The adapter holds its script lock for 6 seconds for this fixture only.
 * Check both execution logs AND the isolated Sheets history before declaring success.
 */
function mdIsolatedConcurrencyRunA(){
  return mdIsolatedConcurrencyRun_('A');
}
function mdIsolatedConcurrencyRunB(){
  return mdIsolatedConcurrencyRun_('B');
}
function mdIsolatedConcurrencyRun_(label){
  const startedAt=new Date().toISOString();
  console.log(JSON.stringify({label,phase:'START',at:startedAt}));
  const result=mdIsolatedPassAdjust_({
    confirm:'ISOLATED_TEST_ONLY',
    bookingId:'RSV-TEST-CONCURRENT-003',
    passId:'PASS-TEST-CONCURRENT-003',
    type:'차감',
    operator:'STAFF-TEST-CONCURRENT',
    reason:'isolated simultaneous lock test'
  });
  console.log(JSON.stringify({label,phase:'FINISH',at:new Date().toISOString(),result}));
  return result;
}
