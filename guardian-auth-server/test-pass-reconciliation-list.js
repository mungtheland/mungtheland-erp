'use strict';
// Test-only multi-booking reconciliation. Bindings are server-owned and persisted.
// No customer-provided pass IDs; no production collections; bounded reads.
const PROJECT='mungtheland-guardian-test';
const BOOKING=/^RSV-TEST-[A-Z0-9-]{1,64}$/;
const PASS=/^PASS-TEST-[A-Z0-9-]{1,64}$/;
const CUSTOMER=/^CUS-TEST-[A-Z0-9-]+$/;
const COLLECTION='pass_reconciliation_bindings_test_v1';
function createTestReconciliationRegistry({db,projectId}){
 if(projectId!==PROJECT||db?.projectId!==PROJECT)throw Error('Isolated Firestore only');
 const bindings=db.collection(COLLECTION);
 async function register({bookingId,passId,customerId}){
  if(!BOOKING.test(bookingId)||!PASS.test(passId)||!CUSTOMER.test(customerId))throw Error('Invalid isolated identifiers');
  const ref=bindings.doc(bookingId);
  await db.runTransaction(async tx=>{
   const existing=await tx.get(ref);
   if(existing.exists){
    const prior=existing.data();
    if(prior.passId!==passId||prior.customerId!==customerId)throw Error('Booking binding conflict');
   }else tx.create(ref,{bookingId,passId,customerId,createdAt:new Date().toISOString()});
  });
 }
 async function getBinding(bookingId){
  if(!BOOKING.test(bookingId||''))return null;
  const snap=await bindings.doc(bookingId).get();
  if(!snap.exists)return null;
  const value=snap.data();
  if(value.bookingId!==bookingId||!PASS.test(value.passId||'')||!CUSTOMER.test(value.customerId||''))throw Error('Invalid binding');
  return {bookingId,passId:value.passId,customerId:value.customerId};
 }
 async function list({limit=100}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid limit');
  const snaps=await bindings.orderBy('createdAt','desc').limit(limit).get();
  const results=await Promise.all(snaps.docs.map(async bindingSnap=>{
   const binding=bindingSnap.data();
   if(!BOOKING.test(binding.bookingId||'')||!PASS.test(binding.passId||'')||!CUSTOMER.test(binding.customerId||''))return {bookingId:bindingSnap.id,status:'invalid-binding'};
   const [a,c,p]=await Promise.all([
    db.collection('attendance_test_v1').doc(binding.bookingId).get(),
    db.collection('pass_consumptions_test_v1').doc(binding.bookingId).get(),
    db.collection('pass_ledger_test_v1').doc(binding.passId).get()
   ]);
   const attendance=a.exists?a.data():null,consumption=c.exists?c.data():null,pass=p.exists?p.data():null;
   const checkedIn=attendance?.bookingId===binding.bookingId&&['등원 중','하원 완료'].includes(attendance.state)&&attendance.events?.[0]?.action==='check-in';
   const consumed=consumption?.bookingId===binding.bookingId&&consumption.passId===binding.passId&&consumption.customerId===binding.customerId;
   const status=!pass||pass.customerId!==binding.customerId?'invalid-binding':checkedIn?(consumed?'completed':'pending'):'not-checked-in';
   return {bookingId:binding.bookingId,passId:binding.passId,attendanceState:attendance?.state||'예약',remaining:Number.isInteger(pass?.remaining)?pass.remaining:null,status};
  }));
  return {items:results.filter(x=>x.status==='pending'),checked:results.length,hasMore:snaps.size===limit,invalidCount:results.filter(x=>x.status==='invalid-binding').length};
 }
 return {register,list,getBinding};
}
function createTestReconciliationListHttpHandler({authenticateStaff,registry}){
 if(typeof authenticateStaff!=='function'||typeof registry?.list!=='function')throw Error('Missing dependencies');
 return async(req,res)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/api/staff/test-pass-reconciliation-list')return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='GET'){send(405,{error:'Method not allowed'});return true;}
  const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
  if(!token){send(401,{error:'Authentication required'});return true;}
  let principal;
  try{principal=await authenticateStaff(token[1]);}catch(_){send(403,{error:'Access denied'});return true;}
  if(principal?.role!=='staff'||principal.status!=='active'){send(403,{error:'Access denied'});return true;}
  try{send(200,await registry.list());}catch(_){send(500,{error:'Unable to list isolated reconciliation records'});}
  return true;
 };
}
module.exports={createTestReconciliationRegistry,createTestReconciliationListHttpHandler};
