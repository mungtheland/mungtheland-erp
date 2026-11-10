/**
 * 격리 스프레드시트 전용: 이력 추가 후 / 이용권 변경 후 실패 주입 및 롤백 검증.
 * 실행 함수: mdRunPassRollbackTest
 * 운영 환경에서 호출 금지.
 */
function mdRunPassRollbackTest(){
  mdCheckSetup();
  const bookingSheet=mdSheet_('예약·등하원관리');
  const passSheet=mdSheet_('이용권관리');
  const ledger=mdSheet_('_이용권변동이력');
  const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  const results=[];
  ['AFTER_LEDGER_APPEND','AFTER_PASS_UPDATE'].forEach(point=>{
    const suffix=Utilities.getUuid().slice(0,8).toUpperCase();
    const bookingId='RSV-RB-'+suffix;
    const passId='PASS-RB-'+suffix;
    const dogId='DOG-RB-'+suffix;
    bookingSheet.appendRow([bookingId,today,dogId,'롤백테스트견',passId,
      '예약',new Date(),'','등원 중','미차감','격리 롤백 테스트']);
    passSheet.appendRow([passId,dogId,'PRODUCT-TEST','테스트 8회권',
      today,8,0,8,today,'',160000,0,160000,'완료','사용 가능']);
    SpreadsheetApp.flush();
    let error='';
    try{
      mdDeductPass({bookingId,passId,operator:'신송이',reason:'롤백 검증',
        testFailurePoint:point});
    }catch(e){error=String(e.message);}
    const booking=bookingSheet.getDataRange().getValues()
      .find(r=>String(r[0])===bookingId);
    const pass=passSheet.getDataRange().getValues()
      .find(r=>String(r[0])===passId);
    const last=ledger.getLastRow();
    const entries=last>1?ledger.getRange(2,1,last-1,10).getDisplayValues()
      .filter(r=>r[3]===passId&&r[4]===bookingId):[];
    const checks={
      injectedError:error.includes('TEST_INJECTED_FAILURE_'+point),
      usedRestored:Number(pass[6])===0,
      remainingRestored:Number(pass[7])===8,
      statusRestored:pass[14]==='사용 가능',
      bookingRestored:booking[9]==='미차감'&&booking[4]===passId,
      historyRemoved:entries.length===0
    };
    const ok=Object.values(checks).every(Boolean);
    results.push({point,bookingId,passId,ok,checks,error});
    Logger.log(JSON.stringify(results[results.length-1]));
    if(!ok)throw Error('롤백 무결성 실패: '+point+' / '+JSON.stringify(checks));
  });
  Logger.log(JSON.stringify({ok:true,results},null,2));
  return {ok:true,results};
}
