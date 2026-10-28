/** 멍더랜드 ERP V1: 초기 메뉴와 환경 검증. 실운영 자동화는 검증 후 추가. */
const MD_SPREADSHEET_ID = '1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70';
const MD_SHEETS = ['대시보드','고객·반려견관리','예약·등하원관리','이용권관리','원생일지','회계관리','설정'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('멍더랜드 ERP')
    .addItem('시트 연결 점검', 'mdCheckSetup')
    .addToUi();
}

function mdCheckSetup() {
  const ss = SpreadsheetApp.openById(MD_SPREADSHEET_ID);
  const missing = MD_SHEETS.filter(name => !ss.getSheetByName(name));
  const message = missing.length ? '누락된 시트: ' + missing.join(', ') : '7개 시트 연결 확인 완료';
  Logger.log(message);
  SpreadsheetApp.getUi().alert(message);
}
