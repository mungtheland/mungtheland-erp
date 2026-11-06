'use strict';
function createStaffArrivalHttpHandler({authenticateStaff,staffArrival,bookingRepository,staffAttendance,writeEnabled=false}){
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
  catch(_){send(403,{error:'Access denied'});return true;}
  if(!principal||principal.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  if(ack&&!writeEnabled){send(503,{error:'Test write not enabled'});return true;}
  try{
   if(attendance){if(!staffAttendance)throw Error('Attendance unavailable');if(transition){send(200,{attendance:await staffAttendance.transition(principal,attendance[1],attendance[2])});}else{send(200,{attendance:await staffAttendance.get(principal,attendance[1])});}return true;}
   if(listing){if(!bookingRepository||typeof bookingRepository.listForStaff!=='function')throw Error('Listing unavailable');const bookings=await bookingRepository.listForStaff();const combined=staffAttendance?await Promise.all(bookings.map(async booking=>({bookingId:booking.bookingId,sourceStatus:booking.status||'',attendanceState:(await staffAttendance.get(principal,booking.bookingId)).state}))):null;send(200,{bookings,...(combined?{combined}:{})});return true;}
   if(!ack){send(200,{request:await staffArrival.get(principal,match[1])});return true;}
   let raw='';
   for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Payload too large');}
   const data=JSON.parse(raw);
   const result=await staffArrival.acknowledge(principal,match[1],data.expectedRevision);
   send(200,result);
  }catch(err){
   if(err.message==='Revision conflict'||err.message==='Already acknowledged'){send(409,{error:'Revision conflict'});return true;}
   if(listing){process.stderr.write('[staff-test] BOOKING_LIST_FAILED '+(err.code||err.name||'Error')+'\n');send(500,{error:'Booking list unavailable'});return true;}
   if(attendance){process.stderr.write('[staff-test] ATTENDANCE_FAILED code='+String(err.code||'none')+' name='+String(err.name||'Error')+'\n');const status=['Invalid transition','Booking status blocks attendance'].includes(err.message)?409:err.message==='Booking not found'?404:err.message==='Access denied'?403:503;send(status,{error:status===409?'Invalid transition':status===503?'Attendance store unavailable':'Attendance request rejected'});return true;}
   send(403,{error:'Request rejected'});
  }
  return true;
 };
}
module.exports={createStaffArrivalHttpHandler};
