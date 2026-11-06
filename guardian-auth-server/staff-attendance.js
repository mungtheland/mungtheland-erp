'use strict';
const {randomUUID}=require('node:crypto');
const {withBookingLock}=require('./booking-lock');
function createStaffAttendanceService({bookingRepository,store=null,clock=()=>new Date()}){
 const records=new Map();
 function authorize(principal){
  if(principal?.role!=='staff'||principal.status!=='active'||!/^STAFF-[A-Z0-9-]{1,64}$/.test(principal.staffId||''))throw Error('Access denied');
 }
 async function state(bookingId){
  const events=store?await store.read(bookingId):records.get(bookingId)||[];
  let result={bookingId,state:'예약',checkIn:null,checkOut:null,temporary:!store};
  for(const event of events){
   if(event.action==='check-in'&&result.state==='예약'){result={...result,state:'등원 중',checkIn:{staffId:event.staffId,at:event.at}};}
   else if(event.action==='check-out'&&result.state==='등원 중'){result={...result,state:'하원 완료',checkOut:{staffId:event.staffId,at:event.at}};}
   else throw Error('Invalid attendance history');
  }
  return result;
 }
 async function get(principal,bookingId){
  authorize(principal);
  const booking=await bookingRepository.findById(bookingId);
  if(!booking)throw Error('Booking not found');
  return state(bookingId);
 }
 async function transition(principal,bookingId,action){
  authorize(principal);
  return withBookingLock(bookingId,async()=>{
   if(action!=='check-in'&&action!=='check-out')throw Error('Invalid action');
   const booking=await bookingRepository.findById(bookingId);
   if(!booking)throw Error('Booking not found');
   const previous=await state(bookingId);
   if((action==='check-in'&&previous.state!=='예약')||(action==='check-out'&&previous.state!=='등원 중'))throw Error('Invalid transition');
   const event={eventId:'EVT-'+randomUUID(),bookingId,action,staffId:principal.staffId,at:clock().toISOString()};
   if(store)await store.append(event);
   else records.set(bookingId,[...(records.get(bookingId)||[]),event]);
   return state(bookingId);
  });
 }
 return {get,transition};
}
module.exports={createStaffAttendanceService};
