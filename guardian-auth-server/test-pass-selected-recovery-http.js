'use strict';
// Isolated selected-booking recovery. Never trusts client-supplied pass/customer IDs.
// The ledger transaction validates committed check-in and prevents duplicate charges.
function createTestSelectedRecoveryHttpHandler({authenticateStaff,registry,passLedger,db}){
 if(typeof authenticateStaff!=='function'||typeof registry?.getBinding!=='function'||typeof passLedger?.consume!=='function'||!db)throw Error('Missing dependencies');
 return async(req,res)=>{
  const match=/^\/api\/staff\/test-pass-reconciliation\/((?:RSV-TEST-)[A-Z0-9-]{1,64})\/recover$/.exec(new URL(req.url,'http://localhost').pathname);
  if(!match)return false;
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
  const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!bearer){send(401,{error:'Authentication required'});return true;}
  let principal;
  try{principal=await authenticateStaff(bearer[1]);}catch(_){send(403,{error:'Access denied'});return true;}
  if(principal?.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  try{
   const binding=await registry.getBinding(match[1]);
   if(!binding){send(404,{error:'Test booking binding not found'});return true;}
   const attendanceSnap=await db.collection('attendance_test_v1').doc(match[1]).get();
   const attendance=attendanceSnap.exists?attendanceSnap.data():null;
   if(attendance?.bookingId!==match[1]||!['등원 중','하원 완료'].includes(attendance.state)||attendance.events?.[0]?.action!=='check-in'){
    send(409,{error:'No committed check-in to reconcile'});return true;
   }
   const result=await passLedger.consume(binding);
   send(200,{bookingId:match[1],status:result.alreadyConsumed?'already-consumed':'completed',remaining:result.remaining});
  }catch(_){send(409,{error:'Recovery rejected; verify test booking and pass state'});}
  return true;
 };
}
module.exports={createTestSelectedRecoveryHttpHandler};
