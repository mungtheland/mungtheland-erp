/** 반려견별 예약 선택 목록. ID를 직접 입력하지 않는 운영 화면용. */
function mdListDogBookings(dogId){
  dogId=mdRequired_(dogId,'반려견 ID');
  const sheet=mdSheet_('예약·등하원관리'),last=sheet.getLastRow();
  if(last<2)return [];
  return sheet.getRange(2,1,last-1,11).getDisplayValues()
    .filter(r=>r[2]===dogId&&r[0]&&!['취소','예약취소'].includes(r[5]))
    .map(r=>({bookingId:r[0],date:r[1],dogId:r[2],dogName:r[3],
      bookingStatus:r[5],passLinked:!!r[4],checkedIn:!!r[6],checkedOut:!!r[7],
      attendance:r[8],deduction:r[9]}))
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100);
}
