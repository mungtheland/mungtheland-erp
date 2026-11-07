/** Read-only visibility check for the isolated Apps Script project. No spreadsheet reads or writes. */
function mdIsolatedConnectionCheck() {
  const result = {
    project: '멍더랜드_이용권차감_격리테스트',
    isolatedSpreadsheetConfigured: typeof MD_ISOLATED_SHEET_ID === 'string',
    isolatedBookingConfigured: typeof MD_ISOLATED_BOOKING_ID === 'string',
    isolatedPassConfigured: typeof MD_ISOLATED_PASS_ID === 'string',
    mode: 'READ_ONLY_NO_SHEETS_ACCESS'
  };
  console.log(JSON.stringify(result));
  return result;
}
