'use strict';
// Isolated single-booking reconciliation status. Derived from persisted Firestore
// attendance and consumption records, not from process-local failure flags.
function createTestPassReconciliationHttpHandler({authenticateStaff,db,bookingId,passId}){
 if(typeof authenticateStaff!=='function'||!db||!/^RSV-TEST-[A-Z0-9-]+$/.test(bookingId)||!/^PASS-TEST-[A-Z0-9-]+$/.test(passId))throw Error('Invalid isolated reconciliation dependencies');
 return async(req,res)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/api/staff/test-pass-reconciliation')return false;
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method!=='GET'){send(405,{error:'Method not allowed'});return true;}
  const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!token){send(401,{error:'Authentication required'});return true;}
  let principal;
  try{principal=await authenticateStaff(token[1]);}catch(_){send(403,{error:'Access denied'});return true;}
  if(principal?.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  try{
   const [a,c,p]=await Promise.all([
    db.collection('attendance_test_v1').doc(bookingId).get(),
    db.collection('pass_consumptions_test_v1').doc(bookingId).get(),
    db.collection('pass_ledger_test_v1').doc(passId).get()
   ]);
   const attendance=a.exists?a.data():null,consumption=c.exists?c.data():null,pass=p.exists?p.data():null;
   if(!pass||!Number.isInteger(pass.remaining))throw Error('Invalid test pass');
   const checkedIn=attendance?.bookingId===bookingId&&['등원 중','하원 완료'].includes(attendance.state)&&attendance.events?.[0]?.action==='check-in';
   const consumed=consumption?.bookingId===bookingId&&consumption.passId===passId;
   const status=checkedIn?(consumed?'completed':'pending'):'not-checked-in';
   send(200,{items:status==='pending'?[{bookingId,status,attendanceState:attendance.state,passId,remaining:pass.remaining}]:[],status,bookingId,remaining:pass.remaining});
  }catch(_){send(500,{error:'Unable to read test reconciliation status'});}
  return true;
 };
}
module.exports={createTestPassReconciliationHttpHandler};
