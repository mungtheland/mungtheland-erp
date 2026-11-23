/** Pure intake review queue. No side effects, no ERP writes. */
function mdTallyBuildReviewQueue_(contracts,orders){
  const cs=contracts||[],os=orders||[],used=new Set(),seen=new Set(),items=[];
  const unique=(x)=>{if(seen.has(x.sourceId))return false;seen.add(x.sourceId);return true;};
  const contractList=cs.filter(unique);
  os.filter(unique).forEach(order=>{
    const candidates=contractList.filter(c=>mdTallyCandidateMatch_(c,order));
    const selected=candidates.length===1?candidates[0]:null;
    if(selected)used.add(selected.sourceId);
    const flags=[];
    if(!selected)flags.push(candidates.length>1?'복수 계약서 후보':'계약서 확인 필요');
    if(selected){
      if(!selected.flags.hasSignature)flags.push('서명 확인 필요');
      if(!selected.flags.contractConsent)flags.push('계약 동의 확인 필요');
      // Risk responses must be interpreted by a human. Never infer safe status from unknown wording.
      flags.push('행동·건강상태 직원 검토 필요');
    }
    if(order.discount&&order.discount!=='할인 신청 없음')flags.push('할인 자격 확인 필요');
    items.push({key:order.sourceId,orderId:order.sourceId,contractId:selected?selected.sourceId:'',
      candidateContractIds:candidates.map(c=>c.sourceId),guardian:order.guardian,dog:order.dog,
      service:order.service,product:order.product,discount:order.discount,
      status:'심사 필요',paymentConfirmed:false,erpWritten:false,flags});
  });
  contractList.filter(c=>!used.has(c.sourceId)).forEach(c=>{
    if(items.some(x=>x.candidateContractIds.includes(c.sourceId)))return;
    items.push({key:c.sourceId,orderId:'',contractId:c.sourceId,candidateContractIds:[],
      guardian:c.guardian,dog:c.dog,service:'',product:'',discount:'',
      status:'상품 신청 확인 필요',paymentConfirmed:false,erpWritten:false,flags:['상품 신청 확인 필요']});
  });
  return items;
}
