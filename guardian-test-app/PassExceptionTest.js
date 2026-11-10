
/**
 * 멍더랜드 이용권 예외 상황 회귀 테스트
 * 실행 함수: mdRunPassExceptionTest
 * 격리 테스트 프로젝트 전용
 */
function mdRunPassExceptionTest() {
  mdCheckSetup();

  const bookingSheet = mdSheet_('예약·등하원관리');
  const passSheet = mdSheet_('이용권관리');
  const ledger = mdSheet_('_이용권변동이력');

  const suffix = Utilities.getUuid().slice(0, 8).toUpperCase();
  const today = Utilities.formatDate(
    new Date(), 'Asia/Seoul', 'yyyy-MM-dd'
  );

  const results = [];

  function assert(condition, label) {
    if (!condition) throw Error('검증 실패: ' + label);
    results.push('PASS: ' + label);
  }

  function createFixture(name, options) {
    options = options || {};
    const id = suffix + '-' + name;
    const bookingId = 'RSV-EX-' + id;
    const passId = 'PASS-EX-' + id;
    const dogId = 'DOG-EX-' + id;
    const remaining = options.remaining === undefined
      ? 8 : options.remaining;
    const used = 8 - remaining;

    bookingSheet.appendRow([
      bookingId, today,
      options.bookingDogId || dogId,
      '예외테스트견',
      options.linkedPassId || passId,
      '예약', new Date(), '',
      '등원 중',
      options.deduction || '미차감',
      '예외 상황 테스트'
    ]);

    passSheet.appendRow([
      passId, dogId,
      'PRODUCT-TEST', '테스트 8회권',
      today, 8, used, remaining,
      today, '',
      160000, 0, 160000,
      '완료',
      remaining === 0 ? '소진' : '사용 가능'
    ]);

    SpreadsheetApp.flush();

    return { bookingId, passId, dogId };
  }

  function snapshot(f) {
    const booking = bookingSheet.getDataRange()
      .getValues().find(r => String(r[0]) === f.bookingId);

    const pass = passSheet.getDataRange()
      .getValues().find(r => String(r[0]) === f.passId);

    const history = mdPassHistory(f.passId).filter(
      r => r.bookingId === f.bookingId
    );

    if (!booking || !pass) {
      throw Error('테스트 데이터 조회 실패');
    }

    return JSON.stringify({
      linkedPassId: booking[4],
      deduction: booking[9],
      used: pass[6],
      remaining: pass[7],
      status: pass[14],
      history: history
    });
  }

  function expectBlocked(f, label) {
    const before = snapshot(f);
    let errorMessage = '';

    try {
      mdDeductPass({
        bookingId: f.bookingId,
        passId: f.passId,
        operator: '신송이',
        reason: '예외 상황 검증'
      });
    } catch (e) {
      errorMessage = e.message;
    }

    assert(errorMessage.length > 0, label + ' 차단');
    assert(snapshot(f) === before, label + ' 데이터 불변');
    Logger.log(label + ': ' + errorMessage);
  }

  // 1. 예약 ID 중복
  const duplicate = createFixture('DUP');
  bookingSheet.appendRow(
    bookingSheet.getRange(
      bookingSheet.getLastRow(), 1, 1, 11
    ).getValues()[0]
  );
  expectBlocked(duplicate, '예약 ID 중복');

  // 2. 예약과 이용권의 반려견 불일치
  const wrongDog = createFixture('DOG', {
    bookingDogId: 'DOG-OTHER-' + suffix
  });
  expectBlocked(wrongDog, '반려견 ID 불일치');

  // 3. 이용권 잔여 횟수 0
  const exhausted = createFixture('ZERO', {
    remaining: 0
  });
  expectBlocked(exhausted, '잔여 횟수 0');

  // 4. 예약 차감상태와 이력 불일치
  const mismatch = createFixture('HISTORY', {
    deduction: '차감'
  });
  expectBlocked(mismatch, '차감상태와 이력 불일치');

  // 5. 다른 이용권 연결
  const wrongPass = createFixture('LINK', {
    linkedPassId: 'PASS-OTHER-' + suffix
  });
  expectBlocked(wrongPass, '다른 이용권 연결');

  Logger.log(JSON.stringify({
    ok: true,
    testId: suffix,
    checks: results
  }, null, 2));

  return { ok: true, testId: suffix, checks: results };
}
