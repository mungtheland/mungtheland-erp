'use strict';
/**
 * Test-only check-in/pass coordinator. The two Firestore transactions are NOT atomic
 * together. A committed check-in with failed deduction is reported as pending
 * reconciliation; retrying the same booking can complete the deduction safely.
 * No production API is wired to this module.
 */
function createCheckInPassCoordinator({attendance,passLedger}){
 if(!attendance||!passLedger)throw Error('Attendance and pass ledger required');
 async function checkInAndConsume({principal,bookingId,passId,customerId}){
  if(principal?.role!=='staff'||principal.status!=='active')throw Error('Staff access required');
  let state=await attendance.get(principal,bookingId);
  if(state.state==='예약'){
   try{state=await attendance.transition(principal,bookingId,'check-in');}
   catch(error){
    // Another staff may have committed check-in concurrently. Re-read to
    // distinguish a valid race from a genuine failure.
    state=await attendance.get(principal,bookingId);
    if(state.state!=='등원 중'&&state.state!=='하원 완료')throw error;
   }
  }
  if(state.state!=='등원 중'&&state.state!=='하원 완료')throw Error('Attendance not eligible for pass consumption');
  try{
   const consumption=await passLedger.consume({passId,bookingId,customerId});
   return {bookingId,attendanceState:state.state,consumptionStatus:consumption.alreadyConsumed?'already-consumed':'consumed',remaining:consumption.remaining,reconciliationRequired:false};
  }catch(error){
   // Fail visibly. Do not report a successful combined operation or undo
   // the real attendance event. A retry can recover using the ledger's
   // deterministic booking ID, but mismatched pass/owner needs review.
   return {bookingId,attendanceState:state.state,consumptionStatus:'pending-reconciliation',reconciliationRequired:true,errorCode:'PASS_CONSUMPTION_FAILED'};
  }
 }
 return {checkInAndConsume};
}
module.exports={createCheckInPassCoordinator};
