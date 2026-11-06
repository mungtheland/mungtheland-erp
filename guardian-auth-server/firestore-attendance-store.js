'use strict';
const PROJECT='mungtheland-guardian-test';
function createFirestoreAttendanceStore({db,projectId}){
 if(projectId!==PROJECT||db?.projectId!==PROJECT)throw Error('Test Firestore project only');
 const collection=db.collection('attendance_test_v1');
 const doc=id=>{if(!/^RSV-[A-Z0-9-]{1,64}$/.test(id))throw Error('Invalid booking ID');return collection.doc(id);};
 const parse=snap=>{
  if(!snap.exists)return {state:'예약',events:[]};
  const data=snap.data();
  if(!Array.isArray(data.events)||data.events.length>2||data.events.length!==(data.state==='등원 중'?1:data.state==='하원 완료'?2:-1))throw Error('Invalid attendance document');
  if(data.events[0]?.action!=='check-in'||(data.events.length===2&&data.events[1]?.action!=='check-out'))throw Error('Invalid attendance document');
  return data;
 };
 async function read(id){const data=parse(await doc(id).get());if(data.bookingId&&data.bookingId!==id)throw Error('Invalid attendance document');return data.events;}
 async function commitTransition({event,expectedState}){
  if(!['예약','등원 중'].includes(expectedState))throw Error('Invalid transition');
  const ref=doc(event.bookingId);
  await db.runTransaction(async tx=>{
   const data=parse(await tx.get(ref));
   if(data.bookingId&&data.bookingId!==event.bookingId)throw Error('Invalid attendance document');
   if(data.state!==expectedState||event.action!==(data.state==='예약'?'check-in':'check-out'))throw Error('Invalid transition');
   const events=[...data.events,event];
   tx.set(ref,{bookingId:event.bookingId,state:event.action==='check-in'?'등원 중':'하원 완료',events});
  });
 }
 return {read,commitTransition};
}
module.exports={createFirestoreAttendanceStore};
