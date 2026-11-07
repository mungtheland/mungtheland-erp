'use strict';
// Read-only parity gate for the existing Apps Script pass ledger and the
// isolated Firestore prototype. No mutation or cross-system synchronization.
function inspectPassParity({booking,pass,history,firestorePass,consumption}){
 const issues=[];
 if(!booking||!pass||!Array.isArray(history))throw Error('Trusted booking, pass, history required');
 const bookingId=String(booking.bookingId||''),passId=String(pass.passId||'');
 if(!bookingId||!passId)throw Error('Booking and pass IDs required');
 if(String(booking.dogId||'')!==String(pass.dogId||''))issues.push('DOG_MISMATCH');
 if(booking.passId&&booking.passId!==passId)issues.push('BOOKING_PASS_MISMATCH');
 const total=pass.totalCount,used=pass.usedCount,remaining=pass.remainingCount;
 if(![total,used,remaining].every(Number.isSafeInteger)||total<1||used<0||remaining<0||used+remaining!==total)issues.push('INVALID_SHEETS_BALANCE');
 if(pass.paymentStatus!=='완료')issues.push('PAYMENT_NOT_CONFIRMED');
 if(!['사용 가능','소진'].includes(pass.status))issues.push('PASS_NOT_ACTIVE');
 const date=String(booking.visitDate||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))issues.push('INVALID_VISIT_DATE');
 if(pass.startDate&&date<pass.startDate)issues.push('BEFORE_PASS_START');
 if(pass.expiryDate&&date>pass.expiryDate)issues.push('AFTER_PASS_EXPIRY');
 const entries=history.filter(x=>x.bookingId===bookingId&&x.passId===passId);
 if(entries.some(x=>!['차감','복구'].includes(x.type)))issues.push('UNKNOWN_HISTORY_ACTION');
 const net=entries.reduce((n,x)=>n+(x.type==='차감'?1:x.type==='복구'?-1:0),0);
 if(net<0||net>1)issues.push('INVALID_SHEETS_HISTORY');
 const sheetDeducted=net===1||booking.deductionStatus==='차감';
 if((net===1)!==(booking.deductionStatus==='차감'))issues.push('SHEETS_LEDGER_STATUS_MISMATCH');
 if(firestorePass){
  if(firestorePass.passId!==passId)issues.push('FIRESTORE_PASS_ID_MISMATCH');
  if(!Number.isSafeInteger(firestorePass.remaining)||firestorePass.remaining!==remaining)issues.push('BALANCE_MISMATCH');
 }
 if(consumption){
  if(consumption.bookingId!==bookingId||consumption.passId!==passId)issues.push('FIRESTORE_CONSUMPTION_MISMATCH');
  if(!sheetDeducted)issues.push('CROSS_LEDGER_DEDUCTION_MISMATCH');
 }else if(sheetDeducted&&firestorePass)issues.push('CROSS_LEDGER_DEDUCTION_MISMATCH');
 return {bookingId,passId,readOnly:true,canEnableFirestoreWrites:false,issues,compatible:issues.length===0,
  recommendation:'Keep Apps Script/Sheets as sole operational pass ledger until a separately approved migration and atomicity plan.'};
}
module.exports={inspectPassParity};
