'use strict';

function invalidHistory(reason){
 return Object.assign(new Error('Invalid attendance history'),{code:'INVALID_ATTENDANCE_HISTORY',reason});
}

function eventTime(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
 const at=Date.parse(value);
 if(!Number.isFinite(at))return NaN;
 const date=value.slice(0,10);
 return new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date?at:NaN;
}

function validateAttendanceHistory(bookingId,events){
 if(!Array.isArray(events)||events.length>2)throw invalidHistory('EVENT_COUNT');
 const seenIds=new Set();
 let previousAt=-Infinity;
 for(const [index,event] of events.entries()){
  const at=eventTime(event?.at);
  if(!event||event.bookingId!==bookingId||typeof event.eventId!=='string'||!event.eventId.trim()||
   typeof event.staffId!=='string'||!/^STAFF-[A-Z0-9-]{1,64}$/.test(event.staffId)||
   !Number.isFinite(at))throw invalidHistory('EVENT_FIELDS');
  if(event.action!==(index===0?'check-in':'check-out'))throw invalidHistory('EVENT_ORDER');
  if(seenIds.has(event.eventId))throw invalidHistory('DUPLICATE_EVENT');
  if(at<previousAt)throw invalidHistory('CLOCK_ROLLBACK');
  seenIds.add(event.eventId);previousAt=at;
 }
 return ['예약','등원 중','하원 완료'][events.length];
}

const requestIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const requestEventPattern=/^EVT-[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function attendanceRequestEventId(requestId){
 if(typeof requestId!=='string'||!requestIdPattern.test(requestId))
  throw Object.assign(new Error('Invalid attendance request ID'),{code:'INVALID_ATTENDANCE_REQUEST_ID'});
 // Reserve UUID version 8 for client request IDs. Legacy server event IDs use version 4.
 return 'EVT-'+requestId.slice(0,14)+'8'+requestId.slice(15);
}

function isAttendanceReplay(events,candidate){
 if(!requestEventPattern.test(candidate.eventId))return false;
 const saved=events.find(event=>event.eventId===candidate.eventId);
 if(!saved)return false;
 if(saved.action!==candidate.action||saved.staffId!==candidate.staffId)
  throw Object.assign(new Error('Attendance request ID conflict'),{code:'ATTENDANCE_REQUEST_ID_CONFLICT'});
 return true;
}

module.exports={validateAttendanceHistory,attendanceRequestEventId,isAttendanceReplay};
