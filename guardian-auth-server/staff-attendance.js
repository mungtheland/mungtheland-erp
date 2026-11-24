'use strict';
const {randomUUID}=require('node:crypto');
const {withBookingLock}=require('./booking-lock');
const {validateAttendanceHistory,attendanceRequestEventId,isAttendanceReplay}=require('./attendance-history');
function createStaffAttendanceService({bookingRepository,store=null,clock=()=>new Date()}){
 const records=new Map();
 function authorize(principal){
  if(principal?.role!=='staff'||principal.status!=='active'||!/^STAFF-[A-Z0-9-]{1,64}$/.test(principal.staffId||''))throw Error('Access denied');
 }
 const readEvents=async bookingId=>store?await store.read(bookingId):records.get(bookingId)||[];
 function state(bookingId,events){
  const state=validateAttendanceHistory(bookingId,events);
  const details=event=>event?{staffId:event.staffId,at:event.at}:null;
  return {bookingId,state,checkIn:details(events[0]),checkOut:details(events[1]),temporary:!store};
 }
 async function get(principal,bookingId){
  authorize(principal);
  const booking=await bookingRepository.findById(bookingId);
  if(!booking)throw Error('Booking not found');
  return state(bookingId,await readEvents(bookingId));
 }
 async function transition(principal,bookingId,action,requestId){
  authorize(principal);
  const eventId=requestId===undefined?'EVT-'+randomUUID():attendanceRequestEventId(requestId);
  return withBookingLock(bookingId,async()=>{
   if(action!=='check-in'&&action!=='check-out')throw Error('Invalid action');
   const booking=await bookingRepository.findById(bookingId);
   if(!booking)throw Error('Booking not found');
   const events=await readEvents(bookingId);
   const previous=state(bookingId,events);
   const candidate={eventId,bookingId,action,staffId:principal.staffId};
   if(isAttendanceReplay(events,candidate))return previous;
   // Fail closed on unknown or changed booking statuses until ERP mapping is explicitly approved.
   const bookingStatus=String(booking.status||'').trim();
   if(bookingStatus&&!['예약','등원 중'].includes(bookingStatus))throw Error('Booking status blocks attendance');
   if((action==='check-in'&&previous.state!=='예약')||(action==='check-out'&&previous.state!=='등원 중'))throw Error('Invalid transition');
   const event={...candidate,at:clock().toISOString()};
   const nextEvents=[...events,event];
   if(!store?.commitTransition){
    // Validate before an append or memory update, where no transaction can check the history.
    if(events.length&&Date.parse(event.at)<Date.parse(events[events.length-1].at))
     throw Object.assign(new Error('Attendance event time precedes previous event'),{code:'ATTENDANCE_CLOCK_ROLLBACK'});
    validateAttendanceHistory(bookingId,nextEvents);
   }
   let committedEvents=nextEvents;
   if(store&&typeof store.commitTransition==='function'){
    try{
     committedEvents=await store.commitTransition({event,expectedState:previous.state});
     if(!Array.isArray(committedEvents))throw Error('Missing committed attendance history');
    }catch(error){
     if(['ATTENDANCE_STATE_CONFLICT','ATTENDANCE_REQUEST_ID_CONFLICT','ATTENDANCE_CLOCK_ROLLBACK',
      'INVALID_ATTENDANCE_HISTORY','INVALID_ATTENDANCE_DOCUMENT',7,16,'permission-denied','unauthenticated'].includes(error?.code))throw error;
     throw Object.assign(new Error('Attendance commit outcome unknown',{cause:error}),{code:'ATTENDANCE_OUTCOME_UNKNOWN'});
    }
   }else if(store){
    try{await store.append(event);}
    catch(error){throw Object.assign(new Error('Attendance commit outcome unknown',{cause:error}),{code:'ATTENDANCE_OUTCOME_UNKNOWN'});}
   }else records.set(bookingId,nextEvents);
   return state(bookingId,committedEvents);
  });
 }
 return {get,transition};
}
module.exports={createStaffAttendanceService};
