'use strict';
const {planPassAdjustment}=require('./isolated-sheets-pass-transition');
const ID='1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY';
// Adapter contract: lock exclusively covers every writer to this workbook; reads happen AFTER lock acquisition.
// No Firestore writes. Do not use this with a remote Node-only lock: it cannot serialize Apps Script writers.
async function adjustIsolatedPass({adapter,spreadsheetId,bookingId,passId,type,today,operator,reason=''}) {
 if(spreadsheetId!==ID||!/^RSV-TEST-[A-Z0-9-]+$/.test(bookingId)||!/^PASS-TEST-[A-Z0-9-]+$/.test(passId))throw Error('ISOLATION_GUARD');
 if(!['차감','복구'].includes(type)||!operator||type==='복구'&&!reason)throw Error('INVALID_REQUEST');
 if(!adapter||typeof adapter.withExclusiveWorkbookLock!=='function')throw Error('LOCK_REQUIRED');
 return adapter.withExclusiveWorkbookLock(async()=>{
  const state=await adapter.readCurrent({spreadsheetId,bookingId,passId});
  if(!state||state.ambiguous)throw Error('AMBIGUOUS_OR_MISSING_ROWS');
  const plan=planPassAdjustment({...state,type,today});
  if(!plan.write)return {decision:plan.decision,writes:0,remaining:plan.remaining};
  const entry={...plan.history,id:await adapter.newHistoryId(),operator,reason};
  // Adapter must persist all related rows + audit entry as a recoverable unit.
  // On uncertain commit, do NOT retry blindly; reconcile using the unique entry ID.
  try{
   await adapter.commitWithRecovery({spreadsheetId,bookingId,passId,plan,entry});
  }catch(e){
   throw Error('COMMIT_UNCERTAIN_RECONCILE_REQUIRED: '+e.message);
  }
  const after=await adapter.readCurrent({spreadsheetId,bookingId,passId});
  if(!after||after.ambiguous||after.pass.used!==plan.used||after.pass.remaining!==plan.remaining||
     after.booking.deduction!==plan.bookingDeduction||
     !after.history.some(x=>x.id===entry.id&&x.type===type))throw Error('POST_COMMIT_RECONCILE_REQUIRED');
  return {decision:plan.decision,writes:1,remaining:plan.remaining,historyId:entry.id};
 });
}
module.exports={adjustIsolatedPass,TEST_SPREADSHEET_ID:ID};
