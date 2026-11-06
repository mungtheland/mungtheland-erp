'use strict';
// Isolated, process-local attendance simulation. Never writes to any spreadsheet.
// Records disappear on server restart; not suitable for production.
function createStaffAttendanceService({bookingRepository,clock=()=>new Date()}){
 const records=new Map();
 function authorize(principal){
  if(principal?.role!=='staff'||principal.status!=='active'||!/^STAFF-[A-Z0-9-]{1,64}$/.test(principal.staffId||''))throw Error('Access denied');
 }
 async function get(principal,bookingId){
  authorize(principal);
  const booking=await bookingRepository.findById(bookingId);
  if(!booking)throw Error('Booking not found');
  return {bookingId,state:records.get(bookingId)?.state||'예약',checkIn:records.get(bookingId)?.checkIn||null,checkOut:records.get(bookingId)?.checkOut||null,temporary:true};
 }
 async function transition(principal,bookingId,action){
  authorize(principal);
  if(action!=='check-in'&&action!=='check-out')throw Error('Invalid action');
  const booking=await bookingRepository.findById(bookingId);
  if(!booking)throw Error('Booking not found');
  const previous=records.get(bookingId)||{state:'예약',checkIn:null,checkOut:null};
  if((action==='check-in'&&previous.state!=='예약')||(action==='check-out'&&previous.state!=='등원 중'))throw Error('Invalid transition');
  const timestamp=clock().toISOString();
  const next=action==='check-in'?{...previous,state:'등원 중',checkIn:{staffId:principal.staffId,at:timestamp}}:{...previous,state:'하원 완료',checkOut:{staffId:principal.staffId,at:timestamp}};
  records.set(bookingId,next);
  return {bookingId,...next,temporary:true};
 }
 return {get,transition};
}
module.exports={createStaffAttendanceService};
