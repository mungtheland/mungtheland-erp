const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({});
for(const file of ['TallyIntakeStaging.js','TallyReviewQueue.js']){
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
}
const queue=(c,o)=>context.mdTallyBuildReviewQueue_(c,o);
const contract=(id,phone='01012345678',dog='보리')=>({source:'contract',sourceId:'contract:'+id,guardian:'홍길동',phone,dog,flags:{hasSignature:true,contractConsent:'동의합니다'}});
const order=(id,phone='010-1234-5678',dog='보리',discount='할인 신청 없음')=>({source:'order',sourceId:'order:'+id,guardian:'홍길동',phone,dog,service:'강아지 유치원',product:'8회권',discount});
test('one contract and one order create a review item',()=>{const rows=queue([contract('c1')],[order('o1')]);assert.equal(rows.length,1);assert.equal(rows[0].contractId,'contract:c1');assert.equal(rows[0].status,'심사 필요');assert.equal(rows[0].erpWritten,false)});
test('unmatched order is held',()=>{const rows=queue([],[order('o1')]);assert.equal(rows[0].contractId,'');assert.ok(rows[0].flags.includes('계약서 확인 필요'))});
test('contract without order is held',()=>{const rows=queue([contract('c1')],[]);assert.equal(rows[0].status,'상품 신청 확인 필요')});
test('multiple candidates never auto select',()=>{const rows=queue([contract('c1'),contract('c2')],[order('o1')]);assert.equal(rows[0].contractId,'');assert.equal(rows[0].candidateContractIds.length,2)});
test('discount requires review',()=>{const rows=queue([contract('c1')],[order('o1','01012345678','보리','멍친구 결합할인')]);assert.ok(rows[0].flags.includes('할인 자격 확인 필요'))});
test('duplicate submission ID does not create duplicate queue items',()=>{const rows=queue([contract('c1'),contract('c1')],[order('o1'),order('o1')]);assert.equal(rows.length,1)});
test('no payment or ERP confirmation from intake',()=>{const rows=queue([contract('c1')],[order('o1')]);assert.equal(rows[0].paymentConfirmed,false);assert.equal(rows[0].erpWritten,false)});
test('different phone cannot match',()=>{const rows=queue([contract('c1')],[order('o1','01099999999')]);assert.equal(rows[0].contractId,'')});
