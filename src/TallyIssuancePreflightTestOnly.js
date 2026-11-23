/**
 * TEST ONLY: read-only preflight for issuance idempotency.
 * No ERP writes, no ticket creation, no sheet creation.
 * A successful result is NOT authorization to issue a ticket.
 */
function mdIssuancePreflight_TEST_ONLY(){
  const stagingId='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
  const erpId='1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70';
  const key='TEST:order:001';
  const review=SpreadsheetApp.openById(stagingId).getSheetByName('통합접수대장');
  const tickets=SpreadsheetApp.openById(erpId).getSheetByName('이용권관리');
  const ledger=SpreadsheetApp.openById(erpId).getSheetByName('_이용권변동이력');
  if(!review||!tickets||!ledger)throw Error('Expected sheets missing');
  const expectedTickets=['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'];
  const expectedLedger=['이력 ID','처리시각','처리유형','이용권 ID','예약 ID','변동횟수','변경전 잔여','변경후 잔여','처리자','사유'];
  const th=tickets.getRange(1,1,1,expectedTickets.length).getDisplayValues()[0];
  const lh=ledger.getRange(1,1,1,expectedLedger.length).getDisplayValues()[0];
  if(th.some((v,i)=>v!==expectedTickets[i])||lh.some((v,i)=>v!==expectedLedger[i]))
    throw Error('ERP schema differs; stop');
  const n=review.getLastRow();
  if(n<2)throw Error('No staging rows');
  const rows=review.getRange(2,1,n-1,18).getDisplayValues();
  const found=rows.filter(r=>r[0]===key);
  if(found.length!==1)throw Error('Missing or duplicate staging key');
  const r=found[0];
  if(r[12]!=='결제확인'||r[13]!=='입금확인'||r[14]!=='미반영')
    throw Error('Test fixture not ready');
  // Stable issuance identity is derived from source submission ID, not random ticket ID.
  const issueKey='TALLY-ORDER:'+r[1];
  if(!r[1]||!r[2]||!r[1].startsWith('order:TEST-')||!r[2].startsWith('contract:TEST-'))
    throw Error('Synthetic source identifiers missing');
  // No external issuance-key index currently exists; issuance remains disabled.
  const result={passed:true,syntheticKey:key,issueKey,
    schemaVerified:true,issueKeyIndexExists:false,issuanceAllowed:false,
    productionWrites:0};
  console.log(JSON.stringify(result));
  return result;
}
