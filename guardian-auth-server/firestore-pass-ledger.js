'use strict';
/**
 * Isolated Firestore pass ledger. Explicitly initialized test passes only.
 * Atomic decrement + deterministic booking consumption document in one transaction.
 * No production collections, Sheets writes or automatic linkage to attendance API.
 */
const PROJECT='mungtheland-guardian-test';
const PASS=/^PASS-TEST-[A-Z0-9-]{1,64}$/;
const BOOKING=/^RSV-[A-Z0-9-]{1,64}$/;
function createIsolatedPassLedger({db,projectId}){
 if(projectId!==PROJECT||db?.projectId!==PROJECT)throw Error('Isolated test Firestore only');
 const passes=db.collection('pass_ledger_test_v1');
 const attendance=db.collection('attendance_test_v1');
 const consumed=db.collection('pass_consumptions_test_v1');
 function validate(passId,bookingId){if(!PASS.test(passId||'')||!BOOKING.test(bookingId||''))throw Error('Invalid test identifiers');}
 function checkPass(p){if(!p||!Number.isInteger(p.total)||!Number.isInteger(p.remaining)||p.total<1||p.remaining<0||p.remaining>p.total||!/^CUS-TEST-[A-Z0-9-]+$/.test(p.customerId||''))throw Error('Invalid test pass');}
 async function consume({passId,bookingId,customerId}){
  validate(passId,bookingId);
  if(!/^CUS-TEST-[A-Z0-9-]+$/.test(customerId||''))throw Error('Invalid customer');
  const passRef=passes.doc(passId),attendanceRef=attendance.doc(bookingId),consumeRef=consumed.doc(bookingId);
  return db.runTransaction(async tx=>{
   // Read all documents before any writes, as required by Firestore transactions.
   const [passSnap,attendanceSnap,consumeSnap]=await Promise.all([tx.get(passRef),tx.get(attendanceRef),tx.get(consumeRef)]);
   if(!passSnap.exists)throw Error('Test pass not initialized');
   const pass=passSnap.data();checkPass(pass);
   if(pass.customerId!==customerId)throw Error('Pass owner mismatch');
   if(consumeSnap.exists){
    const prior=consumeSnap.data();
    if(prior.bookingId!==bookingId||prior.passId!==passId||prior.customerId!==customerId)throw Error('Booking already consumed with different pass');
    return {bookingId,passId,remaining:pass.remaining,consumed:false,alreadyConsumed:true};
   }
   if(!attendanceSnap.exists)throw Error('No committed check-in');
   const record=attendanceSnap.data();
   if(record.bookingId!==bookingId||!['등원 중','하원 완료'].includes(record.state)||!Array.isArray(record.events)||record.events[0]?.action!=='check-in'||record.events[0]?.bookingId!==bookingId)throw Error('No valid check-in');
   if(pass.remaining===0)throw Error('Insufficient pass balance');
   tx.update(passRef,{remaining:pass.remaining-1});
   tx.create(consumeRef,{bookingId,passId,customerId,checkInEventId:record.events[0].eventId,consumedAt:new Date().toISOString()});
   return {bookingId,passId,remaining:pass.remaining-1,consumed:true,alreadyConsumed:false};
  });
 }
 return {consume};
}
module.exports={createIsolatedPassLedger};
