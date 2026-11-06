'use strict';
function auditAttendance(bookings,events){
 const known=new Map(bookings.map(b=>[b.bookingId,b]));
 const issues=[];
 const groups=new Map();
 for(const event of events){if(!groups.has(event.bookingId))groups.set(event.bookingId,[]);groups.get(event.bookingId).push(event);}
 for(const [id,rows] of groups){
  const booking=known.get(id);
  if(!booking){issues.push({bookingId:id,code:'ORPHAN',severity:'error'});continue;}
  if(['취소','예약 취소','취소 완료','노쇼'].includes(booking.status))issues.push({bookingId:id,code:'CANCELLED_WITH_EVENTS',severity:'error'});
  let state='예약',last=-Infinity;const seen=new Set();
  for(const e of rows){const at=Date.parse(e.at);
   if(seen.has(e.eventId)||!Number.isFinite(at)||at<last){issues.push({bookingId:id,code:'DUPLICATE_OR_UNORDERED',severity:'error'});break;}
   seen.add(e.eventId);last=at;
   if(e.action==='check-in'&&state==='예약')state='등원 중';
   else if(e.action==='check-out'&&state==='등원 중')state='하원 완료';
   else {issues.push({bookingId:id,code:'INVALID_SEQUENCE',severity:'error'});break;}
  }
  if(state!=='예약'&&booking.status!==state)issues.push({bookingId:id,code:'STATUS_REVIEW',severity:'review',bookingStatus:booking.status,attendanceStatus:state});
 }
 return {readOnly:true,scannedBookings:bookings.length,scannedEvents:events.length,issues};
}
module.exports={auditAttendance};
