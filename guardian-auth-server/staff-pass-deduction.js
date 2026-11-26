'use strict';

const SCOPE='local-sheets';
const REVIEW='NEEDS_REVIEW';
const terminal=new Set(['COMPLETED','NOT_REQUIRED']);

// The port runs the same workbook-locking code as manual adjustments. A remote
// client requires a separately authorized transport and workbook identity.
function createStaffPassDeduction(ledger){
 if(ledger?.scope!==SCOPE||typeof ledger.deduct!=='function'||typeof ledger.inspect!=='function')
  throw Error('Isolated Sheets pass ledger required');

 const commandFor=event=>({key:`${SCOPE}:${event.bookingId}`,event});
 const verified=result=>terminal.has(result?.status)?result.status:REVIEW;
 async function inspect(event){
  if(!event)return 'PENDING';
  try{return verified(await ledger.inspect(commandFor(event)));}
  catch{return REVIEW;}
 }

 async function afterCheckIn(store,event){
  const command=commandFor(event);
  let claimed;
  try{claimed=await store.claimPassDeduction({bookingId:event.bookingId,eventId:event.eventId,key:command.key});}
  catch{return REVIEW;} // An uncertain claim must never authorize dispatch.
  if(!claimed)return inspect(event);

  let status=REVIEW;
  try{status=verified(await ledger.deduct(command));}
  catch{/* The ledger can resolve an uncertain write on a subsequent read. */}
  try{await store.finishPassDeduction({bookingId:event.bookingId,eventId:event.eventId,key:command.key,status});}
  catch{/* The persisted claim still prevents resubmission. */}
  return status;
 }
 return {inspect,afterCheckIn};
}

module.exports={createStaffPassDeduction};
