/**
 * TEST ONLY: read-only issuance reconciliation against production ERP.
 * Never creates a ticket, changes payment status, or writes to any sheet.
 * This does not authorize production issuance.
 */
function mdIssuanceReconcileDryRun_TEST_ONLY(){
  const stagingId='1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
  const erpId='1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70';
  const key='TEST:order:001', issueKey='TALLY-ORDER:order:TEST-001';
  const staging=SpreadsheetApp.openById(stagingId);
  const review=staging.getSheetByName('통합접수대장');
  const issued=staging.getSheetByName('발급관리_테스트');
  const erp=SpreadsheetApp.openById(erpId);
  const passes=erp.getSheetByName('이용권관리');
  const dogs=erp.getSheetByName('고객·반려견관리');
  if(!review||!issued||!passes||!dogs)throw Error('Required sheets missing');
  const reviewRows=review.getLastRow()>1?review.getRange(2,1,review.getLastRow()-1,18).getDisplayValues():[];
  const matches=reviewRows.filter(r=>r[0]===key);
  if(matches.length!==1)throw Error('Synthetic review record missing/duplicated');
  const r=matches[0];
  if(r[1]!=='order:TEST-001'||r[2]!=='contract:TEST-001'||r[12]!=='결제확인'||r[13]!=='입금확인'||r[14]!=='미반영')
    throw Error('Synthetic review state unexpected');
  const issueRows=issued.getLastRow()>1?issued.getRange(2,1,issued.getLastRow()-1,10).getDisplayValues():[];
  const hits=issueRows.filter(v=>v[0]===issueKey);
  if(hits.length!==1||hits[0][4]!=='발급완료(모의)'||hits[0][5]!=='MOCK-TICKET-TEST-001')
    throw Error('Mock issuance ledger inconsistent');
  const passHeaders=passes.getRange(1,1,1,15).getDisplayValues()[0];
  const dogHeaders=dogs.getRange(1,1,1,16).getDisplayValues()[0];
  if(passHeaders[0]!=='이용권 ID'||passHeaders[1]!=='반려견 ID'||passHeaders[2]!=='상품 ID'||
     dogHeaders[0]!=='반려견 ID'||dogHeaders[1]!=='고객 ID')
    throw Error('Production ERP schema mismatch');
  const passIds=passes.getLastRow()>1?passes.getRange(2,1,passes.getLastRow()-1,1).getDisplayValues().map(x=>x[0]):[];
  const mockIdCollision=passIds.includes('MOCK-TICKET-TEST-001');
  if(mockIdCollision)throw Error('Unexpected mock ticket ID in production; investigate');
  const result={
    passed:true,source:'synthetic',mockLedgerCount:1,duplicateMockRecords:0,
    productionMockTicketFound:false,dogIdVerified:false,productIdVerified:false,
    actualIssuanceAllowed:false,productionWrites:0
  };
  console.log(JSON.stringify(result));
  return result;
}
