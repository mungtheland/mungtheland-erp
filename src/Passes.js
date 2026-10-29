/** 이용권 관리 V1. 결제·회계·출석 차감 자동 연동은 의도적으로 비활성화. */
function mdPassDate_(v,label){
  if(!v)return '';
  const s=String(v).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error(label+'은 yyyy-MM-dd 형식이어야 합니다.');
  const [y,m,d]=s.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error(label+'이 유효하지 않습니다.');
  return s;
}
function mdPassMoney_(v,label){
  if(v===undefined||v===null||v==='')return 0;
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<0)throw Error(label+'은 0 이상의 정수여야 합니다.');
  return n;
}
function mdRegisterPass(data){
  data=data||{};
  const dogId=mdRequired_(data.dogId,'반려견 ID');
  const product=mdRequired_(data.productName,'상품명');
  const count=Number(data.totalCount);
  if(!Number.isSafeInteger(count)||count<1||count>1000)throw Error('총 횟수는 1~1000 사이 정수여야 합니다.');
  const start=mdPassDate_(data.startDate,'시작일');
  const end=mdPassDate_(data.expiryDate,'만료일');
  if(start&&end&&start>end)throw Error('만료일이 시작일보다 빠릅니다.');
  const price=mdPassMoney_(data.price,'판매금액');
  const discount=mdPassMoney_(data.discount,'할인금액');
  if(discount>price)throw Error('할인금액이 판매금액보다 클 수 없습니다.');
  const paid=data.paymentStatus==='완료';
  if(!['미결제','완료'].includes(data.paymentStatus||'미결제'))throw Error('결제상태가 올바르지 않습니다.');
  if(paid&&data.confirmPaid!==true)throw Error('결제 완료를 확인한 경우에만 완료로 등록하세요.');
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    mdCheckSetup();
    const dogs=mdSheet_('고객·반려견관리');
    if(mdFindById_(dogs,dogId)<0)throw Error('등록되지 않은 반려견 ID입니다.');
    const passId=mdId_('PASS');
    mdAppend_('이용권관리',{
      '이용권 ID':passId,'반려견 ID':dogId,'상품 ID':'',
      '상품명':product,'구매일':new Date(),'총 횟수':count,
      '사용 횟수':0,'잔여 횟수':count,'시작일':start,'만료일':end,
      '판매금액':price,'할인금액':discount,'결제금액':price-discount,
      '결제상태':paid?'완료':'미결제','이용권상태':paid?'사용 가능':''
    });
    return {passId:passId,dogId:dogId,totalCount:count,remainingCount:count,
      paymentStatus:paid?'완료':'미결제',automaticDeduction:false,
      accountingRecorded:false};
  }finally{lock.releaseLock();}
}
function mdListPasses(dogId){
  const s=mdSheet_('이용권관리'),last=s.getLastRow();
  if(last<2)return [];
  const q=String(dogId||'').trim();
  return s.getRange(2,1,last-1,15).getDisplayValues()
    .filter(r=>r[0]&&(!q||r[1]===q))
    .slice(-100).reverse()
    .map(r=>({passId:r[0],dogId:r[1],productName:r[3],purchaseDate:r[4],
      totalCount:Number(r[5])||0,usedCount:Number(r[6])||0,remainingCount:Number(r[7])||0,
      startDate:r[8],expiryDate:r[9],price:Number(String(r[10]).replace(/,/g,''))||0,
      discount:Number(String(r[11]).replace(/,/g,''))||0,
      paymentAmount:Number(String(r[12]).replace(/,/g,''))||0,
      paymentStatus:r[13],status:r[14]}));
}
