'use strict';
// Opt-in isolated staff HTTP endpoint. No passId/customerId accepted from clients.
// Mapping is server-owned, and this handler is not mounted in production.
function createCheckInPassHttpHandler({authenticateStaff,coordinator,resolveTestPass}){
 if(typeof authenticateStaff!=='function'||!coordinator||typeof resolveTestPass!=='function')throw Error('Missing dependencies');
 return async function(req,res){
  const path=new URL(req.url,'http://localhost').pathname;
  const match=/^\/api\/staff\/test-bookings\/(RSV-TEST-[A-Z0-9-]{1,64})\/check-in-with-pass$/.exec(path);
  if(!match)return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
  const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!bearer){send(401,{error:'Authentication required'});return true;}
  let principal;
  try{principal=await authenticateStaff(bearer[1]);}catch(_){send(403,{error:'Access denied'});return true;}
  if(principal?.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  try{
   const binding=await resolveTestPass(match[1]);
   if(!binding||!/^PASS-TEST-[A-Z0-9-]{1,64}$/.test(binding.passId||'')||!/^CUS-TEST-[A-Z0-9-]+$/.test(binding.customerId||'')){send(404,{error:'Test pass binding unavailable'});return true;}
   const result=await coordinator.checkInAndConsume({principal,bookingId:match[1],passId:binding.passId,customerId:binding.customerId});
   send(result.reconciliationRequired?202:200,{result});return true;
  }catch(error){
   const code=error.message==='Booking not found'?404:error.message==='Staff access required'?403:409;
   send(code,{error:'Check-in request rejected'});return true;
  }
 };
}
module.exports={createCheckInPassHttpHandler};
