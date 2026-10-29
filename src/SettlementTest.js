function mdSettlementSelfTest(){
 const p=mdSettlementPreview({month:'2099-12',reserve:0});
 const s=mdSettlementStatus('2099-12');
 if(s.exists)throw Error('테스트 대상 월에 기존 정산이 있습니다.');
 if(p.distributable<0)throw Error('배분 가능 금액 오류');
 if(p.owners['운영자 A']+p.owners['운영자 B']!==p.distributable)throw Error('배분액 합계 오류');
 if(Math.abs(p.owners['운영자 A']-p.owners['운영자 B'])>1)throw Error('50:50 배분 오류');
 return {passed:true,readOnly:true,checks:4};
}
