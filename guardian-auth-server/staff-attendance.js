'use strict';
const {randomUUID}=require('node:crypto');
const {withBookingLock}=require('./booking-lock');
const {validateAttendanceHistory}=require('./attendance-history');
function createStaffAttendanceService({bookingRepository,store=null,clock=()=>new Date()}){
 const records=new Map();
 function authorize(principal){
  if(principal?.role!=='staff'||principal.status!=='active'||!/^STAFF-[A-Z0-9-]{1,64}$/.test(principal.staffId||''))throw Error('Access denied');
 }
 async function state(bookingId){
  const events=store?await store.read(bookingId):records.get(bookingId)||[];
  const state=validateAttendanceHistory(bookingId,events);
  const details=event=>event?{staffId:event.staffId,at:event.at}:null;
  return {bookingId,state,checkIn:details(events[0]),checkOut:details(events[1]),temporary:!store};
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
   // Fail closed on unknown or changed booking statuses until ERP mapping is explicitly approved.
   const bookingStatus=String(booking.status||'').trim();
   if(bookingStatus&&!['예약','등원 중'].includes(bookingStatus))throw Error('Booking status blocks attendance');
   const previous=await state(bookingId);
   if((action==='check-in'&&previous.state!=='예약')||(action==='check-out'&&previous.state!=='등원 중'))throw Error('Invalid transition');
   const event={eventId:'EVT-'+randomUUID(),bookingId,action,staffId:principal.staffId,at:clock().toISOString()};
   if(store&&typeof store.commitTransition==='function'){
    // A production adapter must atomically verify expectedState and append once.
    // No Google Sheets read-then-append is permitted through this interface.
    await store.commitTransition({event,expectedState:previous.state});
   }else if(store)await store.append(event);
   else records.set(bookingId,[...(records.get(bookingId)||[]),event]);
   return state(bookingId);
  });
 }
 return {get,transition};
}
module.exports={createStaffAttendanceService};
