/**
 * TEST ONLY. Verifies the approved 10% + 10% additive discount policy
 * against the isolated product catalog. Never writes to ERP or staging.
 */
function mdCombinedDiscountSelfTest_TEST_ONLY(){
 const book=SpreadsheetApp.openById('1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8');
 const catalog=book.getSheetByName('상품기준_테스트');
 const policy=book.getSheetByName('할인정책_테스트');
 if(!catalog||!policy)throw Error('Test catalog/policy missing');
 const productRows=catalog.getLastRow()>1?catalog.getRange(2,1,catalog.getLastRow()-1,10).getValues():[];
 const policyRows=policy.getLastRow()>1?policy.getRange(2,1,policy.getLastRow()-1,7).getValues():[];
 const byCode=Object.fromEntries(policyRows.map(r=>[r[0],r]));
 for(const code of ['COMPANION','MULTIDOG']){
   const p=byCode[code];
   if(!p||Number(p[2])!==0.1||p[4]!=='중복 가능 · 합산 최대 20%'||p[5]!=='정책확정')
     throw Error('Discount policy not approved: '+code);
 }
 if(productRows.length!==21)throw Error('Unexpected catalog size');
 const ids=new Set();
 let checked=0;
 for(const p of productRows){
   if(!p[0]||ids.has(p[0]))throw Error('Missing/duplicate product key');
   ids.add(p[0]);
   const amount=Number(p[7]);
   if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid price: '+p[0]);
   const discount=amount*0.2, payable=amount-discount;
   if(!Number.isSafeInteger(discount)||!Number.isSafeInteger(payable))
     throw Error('Won rounding policy needed: '+p[0]);
   if(payable!==Math.round(amount*0.8))throw Error('Arithmetic mismatch: '+p[0]);
   checked++;
 }
 const example=productRows.find(p=>p[0]==='D-08-W1');
 if(!example||Number(example[7])!==228000)throw Error('Reference product missing/changed');
 const result={passed:true,policy:'ADDITIVE_10_PLUS_10',totalDiscountRate:0.2,
   catalogProductsChecked:checked,exampleBase:228000,exampleDiscount:45600,
   examplePayable:182400,productionIssuanceEnabled:false,productionWrites:0};
 console.log(JSON.stringify(result));return result;
}
