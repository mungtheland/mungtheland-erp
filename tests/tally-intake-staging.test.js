const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/TallyIntakeStaging.js'),'utf8'),ctx);
const parse=(...args)=>ctx.mdTallyParseRow_(...args);
const match=(...args)=>ctx.mdTallyCandidateMatch_(...args);
const contractHeaders=[
'Submission ID','Submitted at','보호자 성함을 입력해 주세요.','보호자 휴대전화 번호를 입력해 주세요.',
'반려견 이름을 입력해 주세요.','과거 사람이나 다른 강아지를 실제로 문 적이 있나요?',
'다른 강아지나 사람을 실제로 물지는 않았지만, 물려고 하거나 공격적으로 달려든 적이 있나요?',
'음식, 장난감, 휴식공간 등을 다른 강아지가 건드리거나 가까이 올 때 으르렁거리거나 공격적인 행동을 하나요?',
'위 멍더랜드 이용계약서 제1조부터 제8조까지의 내용을 확인하고 동의합니다. (동의합니다)',
'본인은 위 신청서의 내용을 사실대로 작성하였으며, 멍더랜드 이용계약 및 필수 동의사항을 확인하고 이에 서명합니다.'
];
const orderHeaders=[
'Submission ID','Submitted at','보호자 성함','보호자 휴대전화 번호','반려견 이름',
'어떤 서비스를 이용하시겠습니까?','이용하실 상품을 선택해 주세요.',
'정기권 이용 횟수를 선택해 주세요.','신청하실 할인 혜택을 선택해 주세요.',
'이용요금을 어떤 방법으로 결제하시겠습니까?'
];
const c=()=>parse('contract',contractHeaders,['C-001','2026-11-23','홍길동','010-1234-5678','보리','아니요','아니요','아니요','동의합니다','signed']);
const o=()=>parse('order',orderHeaders,['O-001','2026-11-23','홍길동','01012345678','보리','강아지 유치원','정기권','8회권','할인 신청 없음','계좌이체']);
test('contract parsing and risk fields',()=>{const x=c();assert.equal(x.sourceId,'contract:C-001');assert.equal(x.flags.hasSignature,true);assert.equal(x.flags.bite,'아니요');assert.equal(x.reviewStatus,'심사 필요')});
test('order parsing and pricing remains unapproved',()=>{const x=o();assert.equal(x.passCount,'8회권');assert.equal(x.paymentMethod,'계좌이체');assert.equal(x.reviewStatus,'심사 필요');assert.equal(x.paymentStatus,undefined)});
test('candidate match normalizes phone',()=>assert.equal(match(c(),o()),true));
test('candidate mismatch is not linked',()=>{const x=o();x.dog='다른개';assert.equal(match(c(),x),false)});
test('missing header fails closed',()=>assert.throws(()=>parse('order',orderHeaders.slice(1),[]),/schema changed/));
test('missing submission ID fails closed',()=>assert.throws(()=>parse('order',orderHeaders,['']),/submission ID missing/));
test('unknown source fails closed',()=>assert.throws(()=>parse('other',[],[]),/Unknown/));
test('missing signature is visible for review',()=>{const row=['C-002','','홍길동','01012345678','보리','예','예','예','동의합니다',''];const x=parse('contract',contractHeaders,row);assert.equal(x.flags.hasSignature,false);assert.equal(x.flags.bite,'예');assert.equal(x.reviewStatus,'심사 필요')});
test('same dog name different phone is not linked',()=>{const x=o();x.phone='01000000000';assert.equal(match(c(),x),false)});
test('source IDs are namespaced',()=>assert.notEqual(c().sourceId,o().sourceId));
