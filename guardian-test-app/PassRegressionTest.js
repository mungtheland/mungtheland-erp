
/**
 * 멍더랜드 수동 이용권 차감·복구 회귀 테스트
 * 격리 스프레드시트 전용
 *
 * 실행 함수: mdRunPassRegressionTest
 */
function mdRunPassRegressionTest() {
  mdCheckSetup();

  const bookingSheet = mdSheet_('예약·등하원관리');
  const passSheet = mdSheet_('이용권관리');
  const ledger = mdSheet_('_이용권변동이력');

  const suffix = Utilities.getUuid().slice(0, 8).toUpperCase();
  const bookingId = 'RSV-REG-' + suffix;
  const passId = 'PASS-REG-' + suffix;
  const dogId = 'DOG-REG-' + suffix;
  const today = Utilities.formatDate(
    new Date(), 'Asia/Seoul', 'yyyy-MM-dd'
  );

  const input = {
    bookingId: bookingId,
    passId: passId,
    operator: '신송이',
    reason: '회귀 테스트 복구'
  };

  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw Error('검증 실패: ' + message);
    results.push('PASS: ' + message);
  };

  // 신규 테스트 데이터 생성
  bookingSheet.appendRow([
    bookingId, today, dogId, '회귀테스트견',
    passId, '예약', new Date(), '',
    '등원 중', '미차감', '회귀 테스트 전용'
  ]);

  passSheet.appendRow([
    passId, dogId, 'PRODUCT-TEST', '테스트 8회권',
    today, 8, 0, 8, today, '',
    160000, 0, 160000, '완료', '사용 가능'
  ]);

  SpreadsheetApp.flush();

  const getPass = () => {
    const rows = passSheet.getDataRange().getValues();
    const row = rows.find(r => String(r[0]) === passId);
    if (!row) throw Error('테스트 이용권을 찾을 수 없습니다.');
    return row;
  };

  const getBooking = () => {
    const rows = bookingSheet.getDataRange().getValues();
    const row = rows.find(r => String(r[0]) === bookingId);
    if (!row) throw Error('테스트 예약을 찾을 수 없습니다.');
    return row;
  };

  const getHistory = () => {
    return mdPassHistory(passId).filter(
      r => r.bookingId === bookingId
    );
  };

  Logger.log('TEST IDS: ' + bookingId + ' / ' + passId);

  // 1. 정상 차감
  const deducted = mdDeductPass(input);
  assert(deducted.remainingCount === 7, '정상 차감 결과 7회');
  assert(Number(getPass()[6]) === 1, '사용 횟수 1회');
  assert(Number(getPass()[7]) === 7, '잔여 횟수 7회');
  assert(getBooking()[9] === '차감', '예약 차감상태 반영');
  assert(getHistory().length === 1, '차감 이력 1건');

  // 2. 중복 차감 방지
  const repeated = mdDeductPass(input);
  assert(repeated.alreadyDeducted === true, '중복 차감 방지');
  assert(Number(getPass()[7]) === 7, '중복 차감 후 잔여 7회');
  assert(getHistory().length === 1, '중복 이력 생성 방지');

  // 3. 정상 복구
  const restored = mdRestorePass(input);
  assert(restored.remainingCount === 8, '정상 복구 결과 8회');
  assert(Number(getPass()[6]) === 0, '복구 후 사용 횟수 0회');
  assert(Number(getPass()[7]) === 8, '복구 후 잔여 횟수 8회');
  assert(getBooking()[9] === '복구', '예약 복구상태 반영');
  assert(getHistory().length === 2, '차감·복구 이력 2건');

  // 4. 중복 복구 방지
  let blocked = false;
  try {
    mdRestorePass(input);
  } catch (e) {
    blocked = true;
    Logger.log('EXPECTED ERROR: ' + e.message);
  }
  assert(blocked, '중복 복구 차단');
  assert(Number(getPass()[7]) === 8, '중복 복구 후 잔여 8회');
  assert(getHistory().length === 2, '중복 복구 이력 생성 방지');

  Logger.log(JSON.stringify({
    ok: true,
    bookingId: bookingId,
    passId: passId,
    checks: results
  }, null, 2));

  return { ok: true, bookingId, passId, checks: results };
}
