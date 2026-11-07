'use strict';
// Pure isolated prototype: no Sheets writes, no production data, no Firestore writes.
// A single booking may consume at most one pass visit, regardless of repeated event reads.
function projectAttendance({bookingId,events,pass}){
 if(!/^RSV-[A-Z0-9-]{1,64}$/.test(bookingId||''))throw Error('Invalid booking');
 if(!Array.isArray(events)||!pass||!Number.isInteger(pass.total)||!Number.isInteger(pass.remaining)||pass.total<0||pass.remaining<0||pass.remaining>pass.total)throw Error('Invalid input');
 const ordered=[...events].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 let state='예약',checkIn=null,checkOut=null;
 const seen=new Set();
 for(const e of ordered){
  if(e.bookingId!==bookingId||typeof e.eventId!=='string'||seen.has(e.eventId)||!Number.isFinite(Date.parse(e.at)))throw Error('Invalid event');
  seen.add(e.eventId);
  if(e.action==='check-in'&&state==='예약'){state='등원 중';checkIn=e;}
  else if(e.action==='check-out'&&state==='등원 중'){state='하원 완료';checkOut=e;}
  else throw Error('Invalid attendance sequence');
 }
 // Existing pass consumption is supplied by the caller. This function never mutates it.
 const alreadyConsumed=Array.isArray(pass.consumedBookingIds)&&pass.consumedBookingIds.includes(bookingId);
 const shouldConsume=Boolean(checkIn)&&!alreadyConsumed;
 if(shouldConsume&&pass.remaining===0)throw Error('Insufficient pass balance');
 return Object.freeze({
  bookingId,state,
  pass:{before:pass.remaining,after:pass.remaining-Number(shouldConsume),shouldConsume,consumptionKey:'PASS:'+bookingId},
  guardianDiary:{
   bookingId,
   status:state,
   checkInAt:checkIn?.at||null,
   checkOutAt:checkOut?.at||null,
   // No photos, notes or health claims are synthesized from attendance.
   photos:[],notes:null,
   source:'attendance-only-prototype'
  }
 });
}
module.exports={projectAttendance};
