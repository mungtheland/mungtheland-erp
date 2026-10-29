function mdSettlementSelfTest(){
 const p=mdSettlementPreview({month:'2099-12',reserve:0});
 const s=mdSettlementStatus('2099-12');
 if(s.exists)throw Error('테스트 대상 월에 기존 정산이 있습니다.');
 if(p.distributable<0)throw Error('배분 가능 금액 오류');
 if(p.owners['운영자 A']+p.owners['운영자 B']!==p.distributable)throw Error('배분액 합계 오류');
 if(Math.abs(p.owners['운영자 A']-p.owners['운영자 B'])>1)throw Error('50:50 배분 오류');
 return {passed:true,readOnly:true,checks:4};
}

/** Pure in-memory settlement scenario checks; no spreadsheet mutations. */
function mdSettlementScenarioTest(){
 const equal=(actual,expected,label)=>{if(actual!==expected)throw Error(label+': '+actual+' != '+expected);};
 const state={sales:100000,costs:20000,cash:80000,reserve:10000,paidA:0,paidB:0,requests:{}};
 const profit=state.sales-state.costs;
 const total=Math.min(Math.max(0,profit),Math.max(0,state.cash-state.reserve));
 const entitlement={A:Math.floor(total/2),B:total-Math.floor(total/2)};
 equal(total,70000,'배분 가능액');equal(entitlement.A,35000,'A 지분');equal(entitlement.B,35000,'B 지분');
 const pay=(owner,amount,request)=>{
  if(state.requests[request])return 'duplicate';
  if(amount<=0||amount>entitlement[owner]-state['paid'+owner])return 'rejected';
  if(amount>state.cash)return 'rejected';
  state.requests[request]=true;state['paid'+owner]+=amount;state.cash-=amount;return 'recorded';
 };
 equal(pay('A',10000,'one'),'recorded','A 일부 지급');
 equal(pay('A',10000,'one'),'duplicate','중복 요청 차단');
 equal(pay('A',26000,'over'),'rejected','잔액 초과 차단');
 equal(pay('A',25000,'two'),'recorded','A 잔액 지급');
 equal(pay('B',35000,'three'),'recorded','B 전액 지급');
 equal(state.paidA+state.paidB,total,'최종 지급액');
 equal(state.cash,10000,'유보금 유지');
 return {passed:true,mode:'in-memory',checks:9,scenario:{sales:100000,costs:20000,reserve:10000,distributable:total,paidA:state.paidA,paidB:state.paidB,remainingCash:state.cash}};
}
