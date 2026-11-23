/**
 * TEST ONLY: read-only mapping readiness guard.
 * Provisional product keys are NOT approved ERP product IDs.
 * Does not create tickets or write to any sheet.
 */
function mdMappingReadiness_TEST_ONLY(){
 const b=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const catalog=b.getSheetByName('상품기준_테스트');
 const mapping=b.getSheetByName('직원매핑_테스트');
 const review=b.getSheetByName('통합접수대장');
 if(!catalog||!mapping||!review)throw Error('Required isolated sheet missing');
 const expectedC=['상품키(임시)','서비스','상품구분','이용횟수','체중구간','정가(원)','할인정책','판매금액(원)','승인상태','비고'];
 const expectedM=['접수키','상품신청 ID','ERP 반려견 ID','반려견 확인자','반려견 확인일시','상품키(임시)','상품 승인확인','정가(원)','할인액(원)','최종금액(원)','결제대조','매핑상태','검토자','비고'];
 if(catalog.getRange(1,1,1,10).getDisplayValues()[0].some((v,i)=>v!==expectedC[i])||
    mapping.getRange(1,1,1,14).getDisplayValues()[0].some((v,i)=>v!==expectedM[i]))
    throw Error('Mapping sheet schema mismatch');
 const products=catalog.getLastRow()>1?catalog.getRange(2,1,catalog.getLastRow()-1,10).getDisplayValues():[];
 const mappings=mapping.getLastRow()>1?mapping.getRange(2,1,mapping.getLastRow()-1,14).getDisplayValues():[];
 const reviews=review.getLastRow()>1?review.getRange(2,1,review.getLastRow()-1,18).getDisplayValues():[];
 const target=reviews.filter(r=>r[0]==='TEST:order:001');
 if(target.length!==1)throw Error('Synthetic record missing or duplicate');
 const match=mappings.filter(r=>r[0]==='TEST:order:001');
 if(match.length>1)throw Error('Duplicate mapping records; stop');
 const approvedProducts=products.filter(r=>r[8]==='승인완료'&&r[5]!==''&&r[7]!=='');
 const ready=match.length===1&&match[0][2]!==''&&match[0][3]!==''&&match[0][4]!==''&&match[0][6]==='승인완료'&&match[0][10]==='대조완료'&&match[0][11]==='검토완료'&&approvedProducts.some(p=>p[0]===match[0][5]);
 // This stage deliberately does not validate ERP dog IDs or numeric price arithmetic.
 // Even if the staging fields are filled, production issuance remains disabled.
 const result={passed:true,productRows:products.length,approvedProductRows:approvedProducts.length,
   mappingRowsForSynthetic:match.length,stagingMappingFieldsReady:ready,
   erpDogIdVerified:false,priceArithmeticVerified:false,
   issuanceAllowed:false,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
