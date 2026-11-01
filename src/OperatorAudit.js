/** Explicit human operator identity for a shared Google login.
 * This is an operator declaration, not cryptographic authentication.
 */
function mdAuditOperator_(data){
 const operator=String((data||{}).operator||'').trim();
 if(!['신송이','정소영'].includes(operator))throw Error('처리 담당자(신송이/B)를 선택하세요.');
 return operator;
}
function mdAuditReason_(data,label){
 const reason=String((data||{}).reason||'').trim();
 if(reason.length<3)throw Error((label||'처리')+' 사유를 3자 이상 입력하세요.');
 return reason.replace(/[\[\]\r\n]/g,' ').slice(0,300);
}
