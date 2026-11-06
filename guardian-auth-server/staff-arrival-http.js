'use strict';
function createStaffArrivalHttpHandler({authenticateStaff,staffArrival,bookingRepository,writeEnabled=false}){
 return async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const path=new URL(req.url,'http://localhost').pathname;
  const listing=path==='/api/staff/bookings';
  const match=/^\/api\/staff\/bookings\/(RSV-[A-Z0-9-]{1,64})\/arrival-request(?:\/acknowledge)?$/.exec(path);
  if(!listing&&!match)return false;
  const ack=path.endsWith('/acknowledge');
  if((ack&&req.method!=='POST')||(!ack&&req.method!=='GET')){send(405,{error:'Method not allowed'});return true;}
  const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!bearer){send(401,{error:'Authentication required'});return true;}
  let principal;
  try{principal=await authenticateStaff(bearer[1]);}
  catch(_){send(403,{error:'Access denied'});return true;}
  if(!principal||principal.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  if(ack&&!writeEnabled){send(503,{error:'Test write not enabled'});return true;}
  try{
   if(listing){if(!bookingRepository||typeof bookingRepository.listForStaff!=='function')throw Error('Listing unavailable');send(200,{bookings:await bookingRepository.listForStaff()});return true;}
   if(!ack){send(200,{request:await staffArrival.get(principal,match[1])});return true;}
   let raw='';
   for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Payload too large');}
   const data=JSON.parse(raw);
   const result=await staffArrival.acknowledge(principal,match[1],data.expectedRevision);
   send(200,result);
  }catch(err){
   if(err.message==='Revision conflict'||err.message==='Already acknowledged'){send(409,{error:'Revision conflict'});return true;}
   if(listing){process.stderr.write('[staff-test] BOOKING_LIST_FAILED '+(err.code||err.name||'Error')+'\n');send(500,{error:'Booking list unavailable'});return true;}
   send(403,{error:'Request rejected'});
  }
  return true;
 };
}
module.exports={createStaffArrivalHttpHandler};
