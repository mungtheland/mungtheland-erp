function mdSettlementSnapshot_(month){
 const sh=mdSheet_('회계관리'),last=sh.getLastRow();
 const rows=last<2?[]:sh.getRange(2,1,last-1,12).getDisplayValues();
 const selected=rows.filter(r=>r[0]&&String(r[1]).slice(0,7)<=month);
 return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(selected)));
}
function mdSettlementStatus(month){
 month=mdRequired_(month,'정산월');
 const sh=mdSheet_('_정산이력'),last=sh.getLastRow();
 const rows=last<2?[]:sh.getRange(2,1,last-1,18).getValues();
 const r=rows.find(x=>String(x[1])===month);
 if(!r)return {month,exists:false};
 const paidA=Number(r[11])||0,paidB=Number(r[12])||0;
 return {month,exists:true,id:String(r[0]),total:Number(r[8]),a:Number(r[9]),b:Number(r[10]),paidA,paidB,remainingA:Number(r[9])-paidA,remainingB:Number(r[10])-paidB,changed:String(r[14])!==mdSettlementSnapshot_(month),status:String(r[13])};
}
function mdConfirmSettlement(data){
 data=data||{};
 const month=mdRequired_(data.month,'정산월'),note=mdRequired_(data.note,'확정 메모');
 if(note.length<3)throw Error('확정 메모는 3자 이상 입력하세요.');
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  if(mdSettlementStatus(month).exists)throw Error('이미 확정된 정산월입니다.');
  const p=mdSettlementPreview({month,reserve:data.reserve});
  if(p.distributable<=0)throw Error('배분 가능 금액이 없습니다.');
  const id=mdId_('SET');
  mdSheet_('_정산이력').appendRow([id,month,new Date(),Session.getEffectiveUser().getEmail(),p.reserve,p.sales,p.costs,p.monthProfit,p.distributable,p.owners['운영자 A'],p.owners['운영자 B'],0,0,'확정',mdSettlementSnapshot_(month),note,'','']);
  return {id,month,total:p.distributable,owners:p.owners,status:'확정',paymentMade:false};
 }finally{lock.releaseLock();}
}
