/** 오늘 예약 화면용 이용권 조회: 예약 ID로 반려견을 서버에서 식별. */
function mdListBookingPasses(bookingId){
  bookingId=mdRequired_(bookingId,'예약 ID');
  const sheet=mdSheet_('예약·등하원관리');
  const row=mdFindById_(sheet,bookingId);
  if(row<2)throw Error('예약을 찾을 수 없습니다.');
  const dogId=String(sheet.getRange(row,3).getValue());
  return mdListPasses(dogId);
}
