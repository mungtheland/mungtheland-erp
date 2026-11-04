'use strict';
const {createGuardianBookingReader}=require('./read-booking');
/**
 * Framework-independent GET /api/guardian/bookings/:bookingId handler.
 * Dependencies must be trusted server-side implementations. No CORS wildcard,
 * public account linking, or client-supplied customerId is permitted.
 * Deployment requires authenticated account mapping and read-only ERP adapter.
 */
function createGuardianBookingHttpHandler({authenticateGuardian,bookingRepository}){
 const read=createGuardianBookingReader({authenticateGuardian,bookingRepository});
 return async function handle(req,res){
  const send=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));};
  if(req.method!=='GET')return send(405,{error:'Method not allowed'});
  const url=new URL(req.url,'http://localhost');
  const isList=url.pathname==='/api/guardian/bookings';
  const match=/^\/api\/guardian\/bookings\/(RSV-[A-Z0-9-]{1,64})$/.exec(url.pathname);
  if(!match&&!isList)return send(404,{error:'Not found'});
  const header=req.headers.authorization;
  const bearer=typeof header==='string'&&/^Bearer ([^\s]+)$/.exec(header);
  if(!bearer)return send(401,{error:'Authentication required'});
  try{
   if(isList){
    if(typeof bookingRepository.findByCustomerId!=='function')throw Error('Unavailable');
    const principal=await authenticateGuardian(bearer[1]);
    if(!principal||principal.role!=='guardian'||!principal.customerId)throw Error('Access denied');
    process.stderr.write('[guardian-test] LIST_SHEETS_START\n');
    const bookings=await bookingRepository.findByCustomerId(principal.customerId);
    process.stderr.write('[guardian-test] LIST_SHEETS_OK\n');
    return send(200,{bookings:bookings.map(b=>({bookingId:b.bookingId,dogName:b.dogName,visitDate:b.visitDate,status:b.status}))});
   }
   const booking=await read({idToken:bearer[1],bookingId:match[1]});
   return send(200,{booking});
  }catch(_){
   // Deliberately avoid leaking account/booking existence or stack traces.
   return send(403,{error:'Access denied'});
  }
 };
}
module.exports={createGuardianBookingHttpHandler};
