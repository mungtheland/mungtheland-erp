'use strict';
// Read-only status reconciliation: Firestore attendance is authoritative for display
// once attendance events exist; never silently overwrite the Sheets source.
function reconcileBookingStatus(sourceStatus,attendanceState){
 const source=String(sourceStatus||'').trim();
 const attendance=String(attendanceState||'').trim();
 if(!['예약','등원 중','하원 완료'].includes(attendance))throw Error('Unknown attendance state');
 const known=['예약','등원 중','하원 완료'].includes(source);
 return Object.freeze({
  sourceStatus:source,attendanceState:attendance,
  displayStatus:attendance,
  mismatch:!known||source!==attendance,
  reason:!known?'UNKNOWN_SOURCE_STATUS':source!==attendance?'SOURCE_ATTENDANCE_DIFFER':'MATCH',
  // Diagnostic only; no automatic Sheets writes or state repair.
  needsReview:!known||source!==attendance
 });
}
module.exports={reconcileBookingStatus};
