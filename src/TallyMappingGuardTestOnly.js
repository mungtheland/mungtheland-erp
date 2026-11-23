/**
 * TEST ONLY. Read-only mapping guard.
 * The existing synthetic fixture intentionally has no verified ERP dog/product mapping.
 * Never writes to production or staging.
 */
function mdMappingGuard_TEST_ONLY(){
  const staging=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
  const erp=SpreadsheetApp.openById('1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70');
  const review=staging.getSheetByName('통합접수대장');
  const dogs=erp.getSheetByName('고객·반려견관리');
  const passes=erp.getSheetByName('이용권관리');
  if(!review||!dogs||!passes)throw Error('Required sheet missing');
  const rows=review.getLastRow()>1?review.getRange(2,1,review.getLastRow()-1,18).getDisplayValues():[];
  const matches=rows.filter(r=>r[0]==='TEST:order:001');
  if(matches.length!==1)throw Error('Fixture missing or duplicate');
  const r=matches[0];
  if(r[12]!=='결제확인'||r[13]!=='입금확인'||r[14]!=='미반영')
    throw Error('Fixture payment state changed');
  const dogHeaders=dogs.getRange(1,1,1,16).getDisplayValues()[0];
  const passHeaders=passes.getRange(1,1,1,15).getDisplayValues()[0];
  if(dogHeaders[0]!=='반려견 ID'||dogHeaders[1]!=='고객 ID'||
     passHeaders[1]!=='반려견 ID'||passHeaders[2]!=='상품 ID'||
     passHeaders[10]!=='판매금액'||passHeaders[11]!=='할인금액'||passHeaders[12]!=='결제금액')
    throw Error('ERP mapping schema changed');
  // The review form has no staff-approved ERP dog ID, product master ID,
  // or authoritative agreed amount. Never infer IDs from dog names.
  const result={
    passed:true,syntheticKey:'TEST:order:001',
    paymentConfirmed:true,dogIdVerified:false,productIdVerified:false,
    approvedPriceVerified:false,issuanceBlocked:true,
    reason:'ERP_DOG_PRODUCT_PRICE_MAPPING_NOT_VERIFIED',productionWrites:0
  };
  console.log(JSON.stringify(result));
  return result;
}
