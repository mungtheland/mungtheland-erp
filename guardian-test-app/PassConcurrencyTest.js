
/**
 * 멍더랜드 이용권 동시 차감 테스트
 * 격리 테스트 전용
 *
 * 1. mdPreparePassConcurrencyTest: 테스트 데이터 준비
 * 2. mdRunConcurrentDeduction: 두 실행에서 동시에 호출
 * 3. mdVerifyPassConcurrencyTest: 최종 결과 확인
 */

const MD_CONCURRENCY_KEY = 'MD_PASS_CONCURRENCY_TEST';

function mdPreparePassConcurrencyTest() {
  mdCheckSetup();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const bookingSheet = mdSheet_('예약·등하원관리');
    const passSheet = mdSheet_('이용권관리');

    const suffix = Utilities.getUuid()
      .slice(0, 8).toUpperCase();

    const bookingId = 'RSV-CON-' + suffix;
    const passId = 'PASS-CON-' + suffix;
    const dogId = 'DOG-CON-' + suffix;

    const today = Utilities.formatDate(
      new Date(), 'Asia/Seoul', 'yyyy-MM-dd'
    );

    bookingSheet.appendRow([
      bookingId, today, dogId, '동시실행테스트견',
      passId, '예약', new Date(), '',
      '등원 중', '미차감', '동시 실행 테스트'
    ]);

    passSheet.appendRow([
      passId, dogId, 'PRODUCT-TEST',
      '동시실행 테스트 8회권',
      today, 8, 0, 8, today, '',
      160000, 0, 160000,
      '완료', '사용 가능'
    ]);

    SpreadsheetApp.flush();

    PropertiesService.getScriptProperties().setProperty(
      MD_CONCURRENCY_KEY,
      JSON.stringify({ bookingId, passId })
    );

    Logger.log('PREPARED: ' + bookingId + ' / ' + passId);

    return { bookingId, passId };
  } finally {
    lock.releaseLock();
  }
}

function mdRunConcurrentDeduction() {
 // mdCheckSetup();

  const raw = PropertiesService.getScriptProperties()
    .getProperty(MD_CONCURRENCY_KEY);

  if (!raw) throw Error('테스트 준비가 필요합니다.');

  const ids = JSON.parse(raw);

  const startedAt = new Date().toISOString();

  Logger.log('START: ' + startedAt);
Utilities.sleep(5000);
  const result = mdDeductPass({
    bookingId: ids.bookingId,
    passId: ids.passId,
    operator: '신송이',
    reason: '동시 실행 차감 검증'
  });

  Logger.log(JSON.stringify({
    startedAt,
    finishedAt: new Date().toISOString(),
    result
  }));

  return result;
}

function mdVerifyPassConcurrencyTest() {
  mdCheckSetup();

  const raw = PropertiesService.getScriptProperties()
    .getProperty(MD_CONCURRENCY_KEY);

  if (!raw) throw Error('테스트 준비가 필요합니다.');

  const ids = JSON.parse(raw);

  const bookingRows = mdSheet_('예약·등하원관리')
    .getDataRange().getValues();

  const passRows = mdSheet_('이용권관리')
    .getDataRange().getValues();

  const booking = bookingRows.find(
    r => String(r[0]) === ids.bookingId
  );

  const pass = passRows.find(
    r => String(r[0]) === ids.passId
  );

  if (!booking || !pass) {
    throw Error('테스트 데이터가 없습니다.');
  }

  const history = mdPassHistory(ids.passId).filter(
    r => r.bookingId === ids.bookingId
  );

  const checks = {
    usedExactlyOnce: Number(pass[6]) === 1,
    remainingSeven: Number(pass[7]) === 7,
    bookingDeducted: booking[9] === '차감',
    oneHistoryEntry: history.length === 1,
    correctHistoryType:
      history.length === 1 &&
      history[0].type === '차감'
  };

  const ok = Object.values(checks).every(Boolean);

  Logger.log(JSON.stringify({
    ok,
    bookingId: ids.bookingId,
    passId: ids.passId,
    used: pass[6],
    remaining: pass[7],
    historyCount: history.length,
    checks
  }, null, 2));

  if (!ok) {
    throw Error('동시 차감 무결성 검증 실패');
  }

  return { ok, checks };
}
