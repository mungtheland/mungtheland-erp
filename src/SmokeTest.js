/** Test-only. Run mdRunSmokeTest manually. Never use actual customer data. */
function mdRunSmokeTest(){
  const props=PropertiesService.getScriptProperties();
  const key='MD_SMOKE_TEST_V1';
  const prior=props.getProperty(key);
  if(prior){Logger.log('이미 테스트 완료: '+prior);return JSON.parse(prior);}
  const dog=mdRegisterDog({
    guardianName:'[TEST] 보호자',phone:'010-0000-0000',
    dogName:'[TEST] 멍더',breed:'테스트견',notes:'ERP 테스트 전용. 실제 고객 아님'
  });
  const date=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  const booking=mdCreateBooking({dogId:dog.dogId,date:date,notes:'[TEST] ERP 테스트 예약'});
  const firstIn=mdCheckIn(booking.bookingId);
  const repeatIn=mdCheckIn(booking.bookingId);
  const firstOut=mdCheckOut(booking.bookingId);
  const repeatOut=mdCheckOut(booking.bookingId);
  if(!firstIn.checkedIn||!repeatIn.alreadyCheckedIn||!firstOut.checkedOut||!repeatOut.alreadyCheckedOut)
    throw Error('중복 등하원 방지 검증 실패');
  const result={ok:true,dogId:dog.dogId,customerId:dog.customerId,bookingId:booking.bookingId,
    checkInIdempotent:true,checkOutIdempotent:true,
    note:'테스트 데이터 1건씩 생성됨. 실제 고객 데이터 아님.'};
  props.setProperty(key,JSON.stringify(result));
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
