'use strict';
const {reconcileBookingStatus}=require('./booking-status-reconciliation');
function createStaffArrivalHttpHandler({authenticateStaff,staffArrival,bookingRepository,staffAttendance,writeEnabled=false,attendanceWriteBookingId}){
 return async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const path=new URL(req.url,'http://localhost').pathname;
  const listing=path==='/api/staff/bookings';
  const attendance=/^\/api\/staff\/bookings\/(RSV-[A-Z0-9-]{1,64})\/attendance(?:\/(check-in|check-out))?$/.exec(path);
  const match=/^\/api\/staff\/bookings\/(RSV-[A-Z0-9-]{1,64})\/arrival-request(?:\/acknowledge)?$/.exec(path);
  if(!listing&&!match&&!attendance)return false;
  const ack=path.endsWith('/acknowledge');
  const transition=Boolean(attendance&&attendance[2]);
  if(((ack||transition)&&req.method!=='POST')||(!(ack||transition)&&req.method!=='GET')){send(405,{error:'Method not allowed'});return true;}
  const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!bearer){send(401,{error:'Authentication required'});return true;}
  let principal;
  try{principal=await authenticateStaff(bearer[1]);}
  catch(error){
   if(error?.code==='AUTH_TOKEN_EXPIRED'){send(401,{error:'Authentication expired',code:'AUTH_TOKEN_EXPIRED'});return true;}
   send(403,{error:'Access denied'});return true;
  }
  if(!principal||principal.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  if(ack&&!writeEnabled){send(503,{error:'Test write not enabled'});return true;}
  if(transition&&attendanceWriteBookingId!==undefined&&attendance[1]!==attendanceWriteBookingId){
   send(403,{error:'Attendance write is restricted to the selected test booking',code:'ATTENDANCE_WRITE_FAILED'});return true;
  }
  try{
   if(attendance){if(!staffAttendance)throw Error('Attendance unavailable');if(transition){send(200,{attendance:await staffAttendance.transition(principal,attendance[1],attendance[2],req.headers['x-attendance-request-id'])});}else{send(200,{attendance:await staffAttendance.get(principal,attendance[1])});}return true;}
   if(listing){
    if(!bookingRepository||typeof bookingRepository.listForStaff!=='function')throw Error('Listing unavailable');
    const bookings=await bookingRepository.listForStaff();
    const combined=staffAttendance?await Promise.all(bookings.map(async booking=>{
     const writeScope=attendanceWriteBookingId===undefined?{}:{attendanceWriteAllowed:booking.bookingId===attendanceWriteBookingId};
     try{
      const {state}=await staffAttendance.get(principal,booking.bookingId,{includePass:false});
      return {bookingId:booking.bookingId,...reconcileBookingStatus(booking.status,state),...writeScope};
     }catch(err){
      const invalidRecord=['INVALID_ATTENDANCE_HISTORY','INVALID_ATTENDANCE_DOCUMENT'].includes(err.code)
       ||(err.code==null&&['Invalid attendance history','Invalid attendance document'].includes(err.message));
      if(!invalidRecord)throw err;
      process.stderr.write('[staff-test] ATTENDANCE_RECORD_REVIEW bookingId='+booking.bookingId+'\n');
      return {bookingId:booking.bookingId,sourceStatus:booking.status,attendanceState:null,displayStatus:'출석 기록 확인 필요',mismatch:true,reason:'INVALID_ATTENDANCE_HISTORY',needsReview:true,attendanceError:true,...writeScope};
     }
    })):null;
    send(200,{bookings,...(combined?{combined}:{})});
    return true;
   }
   if(!ack){send(200,{request:await staffArrival.get(principal,match[1])});return true;}
   let raw='';
   for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Payload too large');}
   const data=JSON.parse(raw);
   const result=await staffArrival.acknowledge(principal,match[1],data.expectedRevision);
   send(200,result);
  }catch(err){
   if(err.message==='Revision conflict'||err.message==='Already acknowledged'){send(409,{error:'Revision conflict'});return true;}
   if(transition&&err.code==='ATTENDANCE_CLOCK_ROLLBACK'){
    send(409,{error:'Attendance event time precedes previous event',code:err.code});return true;
   }
   if(transition&&err.code==='ATTENDANCE_REQUEST_ID_CONFLICT'){
    send(409,{error:'Attendance request ID conflict',code:err.code});return true;
   }
   if(transition&&err.code==='INVALID_ATTENDANCE_REQUEST_ID'){
    send(400,{error:'Invalid attendance request ID',code:err.code});return true;
   }
   if(transition&&err.code==='ATTENDANCE_OUTCOME_UNKNOWN'){
    send(503,{error:'Attendance commit outcome unknown',code:err.code});return true;
   }
   if(listing){process.stderr.write('[staff-test] BOOKING_LIST_FAILED '+(err.code||err.name||'Error')+'\n');send(500,{error:'Booking list unavailable'});return true;}
   if(attendance){
    process.stderr.write('[staff-test] ATTENDANCE_FAILED code='+String(err.code||'none')+' name='+String(err.name||'Error')+'\n');
    const status=['Invalid transition','Booking status blocks attendance'].includes(err.message)?409:err.message==='Booking not found'?404:err.message==='Access denied'?403:503;
    const error=status===409?'Invalid transition':status===503?'Attendance store unavailable':'Attendance request rejected';
    const code=status===409?'ATTENDANCE_STATE_CONFLICT':'ATTENDANCE_WRITE_FAILED';
    send(status,{error,...(transition?{code}:{})});return true;
   }
   send(403,{error:'Request rejected'});
  }
  return true;
 };
}
module.exports={createStaffArrivalHttpHandler};
