
/**
 * 멍더랜드 이용권 차감 회귀 테스트 전용 공통 함수.
 * 운영 ERP 연결 금지.
 */
const MD_SPREADSHEET_ID =
  '1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';

const MD_TEST_SCHEMAS = {
  '예약·등하원관리': [
    '예약 ID', '이용일', '반려견 ID', '반려견명',
    '이용권 ID', '예약상태', '등원시간', '하원시간',
    '출석상태', '차감상태', '비고'
  ],
  '이용권관리': [
    '이용권 ID', '반려견 ID', '상품 ID', '상품명',
    '구매일', '총 횟수', '사용 횟수', '잔여 횟수',
    '시작일', '만료일', '판매금액', '할인금액',
    '결제금액', '결제상태', '이용권상태'
  ],
  '_이용권변동이력': [
    '이력 ID', '처리일시', '처리유형', '이용권 ID',
    '예약 ID', '변동 횟수', '변경 전 잔여',
    '변경 후 잔여', '처리자', '사유'
  ]
};

function mdBook_() {
  if (MD_SPREADSHEET_ID !==
      '1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY') {
    throw Error('격리 테스트 스프레드시트가 아닙니다.');
  }
  return SpreadsheetApp.openById(MD_SPREADSHEET_ID);
}

function mdSheet_(name) {
  if (!Object.prototype.hasOwnProperty.call(
      MD_TEST_SCHEMAS, name)) {
    throw Error('테스트 허용 시트가 아닙니다: ' + name);
  }
  const sheet = mdBook_().getSheetByName(name);
  if (!sheet) throw Error('테스트 시트 없음: ' + name);
  return sheet;
}

function mdCheckSetup() {
  const book = mdBook_();
  Object.keys(MD_TEST_SCHEMAS).forEach(name => {
    const sheet = mdSheet_(name);
    const expected = MD_TEST_SCHEMAS[name];
    const actual = sheet.getRange(
      1, 1, 1, expected.length
    ).getDisplayValues()[0];

    if (expected.some((h, i) => actual[i] !== h)) {
      throw Error('테스트 시트 헤더 불일치: ' + name);
    }
  });
  return { ok: true, spreadsheetId: book.getId() };
}

function mdRequired_(value, label) {
  if (value === undefined || value === null ||
      String(value).trim() === '') {
    throw Error('필수값 누락: ' + label);
  }
  return String(value).trim();
}

function mdId_(prefix) {
  return prefix + '-' +
    Utilities.formatDate(
      new Date(), 'Asia/Seoul', 'yyyyMMdd'
    ) + '-' +
    Utilities.getUuid().slice(0, 8).toUpperCase();
}
