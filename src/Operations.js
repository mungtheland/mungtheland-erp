/** 운영 화면 조회 API: 읽기 전용. 개인정보는 운영자 전용 웹앱에서만 조회. */
function mdToday_(){return Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');}
function mdDateText_(value){
  if(value instanceof Date)return Utilities.formatDate(value,'Asia/Seoul','yyyy-MM-dd');
  const s=String(value||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:s.replace(/\./g,'-').replace(/\s/g,'').slice(0,10);
}
function mdTimeText_(value){
  return value instanceof Date?Utilities.formatDate(value,'Asia/Seoul','HH:mm'):(value?String(value):'');
}
function mdListDogs(query){
  const s=mdSheet_('고객·반려견관리'),last=s.getLastRow();
  if(last<2)return [];
  const q=String(query||'').trim().toLowerCase();
  return s.getRange(2,1,last-1,16).getDisplayValues()
    .filter(r=>r[0]&&r[15]!=='삭제'&&(!q||[r[2],r[3],r[4],r[0]].some(v=>String(v).toLowerCase().includes(q))))
    .slice(0,100).map(r=>({dogId:r[0],customerId:r[1],guardianName:r[2],phone:r[3],dogName:r[4],breed:r[5],status:r[15]}));
}
function mdListBookings(date){
  const day=mdRequired_(date||mdToday_(),'이용일');
  const s=mdSheet_('예약·등하원관리'),last=s.getLastRow();
  if(last<2)return [];
  return s.getRange(2,1,last-1,11).getValues()
    .filter(r=>r[0]&&mdDateText_(r[1])===day)
    .map(r=>({bookingId:String(r[0]),date:day,dogId:String(r[2]),dogName:String(r[3]),bookingStatus:String(r[5]),checkIn:mdTimeText_(r[6]),checkOut:mdTimeText_(r[7]),attendance:String(r[8]),deduction:String(r[9]),notes:String(r[10]||'')}));
}
function mdDashboardData(date){
  const day=date||mdToday_();
  const bookings=mdListBookings(day);
  return {date:day,bookings:bookings,total:bookings.length,
    checkedIn:bookings.filter(x=>x.attendance==='등원 중').length,
    checkedOut:bookings.filter(x=>x.attendance==='하원').length,
    notArrived:bookings.filter(x=>x.attendance==='미등원').length};
}
