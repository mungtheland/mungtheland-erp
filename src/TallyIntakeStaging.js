/** Tally intake staging — pure normalization only. No spreadsheet writes or ERP mutations. */
const MD_TALLY_SOURCES = Object.freeze({
  contract: {spreadsheetId:'1p_kj7avwmGvF-QST3Az6-FXo-sQoin6MvwChOKZphbo', sheetName:'시트1'},
  order: {spreadsheetId:'1mupeRV4Qu6HCjNkkFH4vUpTvx8wBRh_1CpIwwpjvvnk', sheetName:'시트1'}
});
const MD_TALLY_FIELDS = Object.freeze({
  contract:{
    submissionId:'Submission ID',submittedAt:'Submitted at',
    guardian:'보호자 성함을 입력해 주세요.',phone:'보호자 휴대전화 번호를 입력해 주세요.',
    dog:'반려견 이름을 입력해 주세요.',bite:'과거 사람이나 다른 강아지를 실제로 문 적이 있나요?',
    attemptedBite:'다른 강아지나 사람을 실제로 물지는 않았지만, 물려고 하거나 공격적으로 달려든 적이 있나요?',
    resourceGuarding:'음식, 장난감, 휴식공간 등을 다른 강아지가 건드리거나 가까이 올 때 으르렁거리거나 공격적인 행동을 하나요?',
    contractConsent:'위 멍더랜드 이용계약서 제1조부터 제8조까지의 내용을 확인하고 동의합니다. (동의합니다)',
    signature:'본인은 위 신청서의 내용을 사실대로 작성하였으며, 멍더랜드 이용계약 및 필수 동의사항을 확인하고 이에 서명합니다.'
  },
  order:{
    submissionId:'Submission ID',submittedAt:'Submitted at',guardian:'보호자 성함',
    phone:'보호자 휴대전화 번호',dog:'반려견 이름',
    service:'어떤 서비스를 이용하시겠습니까?',product:'이용하실 상품을 선택해 주세요.',
    passCount:'정기권 이용 횟수를 선택해 주세요.',
    discount:'신청하실 할인 혜택을 선택해 주세요.',
    paymentMethod:'이용요금을 어떤 방법으로 결제하시겠습니까?'
  }
});
function mdTallyNormalizePhone_(value){return String(value||'').replace(/[^0-9]/g,'');}
function mdTallyNormalizeName_(value){return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();}
function mdTallyParseRow_(type,headers,row){
  if(!Object.prototype.hasOwnProperty.call(MD_TALLY_FIELDS,type))throw Error('Unknown Tally form');
  const map=MD_TALLY_FIELDS[type],idx={};
  headers.forEach((h,i)=>{if(idx[h]===undefined)idx[h]=i;});
  const missing=Object.entries(map).filter(([key,h])=>idx[h]===undefined).map(([key])=>key);
  if(missing.length)throw Error('Tally schema changed: '+type+' '+missing.join(','));
  const get=key=>String(row[idx[map[key]]]??'').trim();
  const submissionId=get('submissionId');
  if(!submissionId)throw Error('Tally submission ID missing');
  const out={source:type,sourceId:type+':'+submissionId,submissionId,
    submittedAt:get('submittedAt'),guardian:get('guardian'),phone:get('phone'),
    dog:get('dog'),matchKey:mdTallyNormalizePhone_(get('phone'))+'|'+mdTallyNormalizeName_(get('dog')),
    reviewStatus:'심사 필요'};
  if(type==='contract'){
    out.flags={bite:get('bite'),attemptedBite:get('attemptedBite'),
      resourceGuarding:get('resourceGuarding'),contractConsent:get('contractConsent'),
      hasSignature:Boolean(get('signature'))};
  }else{
    out.service=get('service');out.product=get('product');out.passCount=get('passCount');
    out.discount=get('discount');out.paymentMethod=get('paymentMethod');
  }
  return out;
}
/** Candidate match only. Never auto-approve or merge based on name/phone. */
function mdTallyCandidateMatch_(contract,order){
  if(contract.source!=='contract'||order.source!=='order')throw Error('Expected contract and order');
  return Boolean(contract.phone&&order.phone&&contract.dog&&order.dog&&
    mdTallyNormalizePhone_(contract.phone)===mdTallyNormalizePhone_(order.phone)&&
    mdTallyNormalizeName_(contract.dog)===mdTallyNormalizeName_(order.dog));
}
