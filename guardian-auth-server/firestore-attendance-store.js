'use strict';
const {validateAttendanceHistory,isAttendanceReplay}=require('./attendance-history');
const PROJECT='mungtheland-guardian-test';
const EMULATOR_PROJECT='demo-mungtheland-attendance';
const LOOPBACK='127.0.0.1', EMULATOR_PORT=18879;
const EMULATOR_HOST=LOOPBACK+':'+EMULATOR_PORT;
function createFirestoreAttendanceStore({db,projectId}){
 if(projectId!==PROJECT||db?.projectId!==PROJECT)throw Error('Test Firestore project only');
 return attendanceStore(db);
}
function createEmulatorAttendanceStore(db){
 // Fail closed if the installed SDK changes how it specifies the resolved endpoint.
 const settings=db?._settings;
 if(process.env.FIRESTORE_EMULATOR_HOST!==EMULATOR_HOST||db?.projectId!==EMULATOR_PROJECT||
  settings?.servicePath!==LOOPBACK||settings.port!==EMULATOR_PORT||settings.ssl!==false)
  throw Error('Isolated attendance emulator only');
 return attendanceStore(db);
}
function attendanceStore(db){
 const collection=db.collection('attendance_test_v1');
 const doc=id=>{if(!/^RSV-[A-Z0-9-]{1,64}$/.test(id))throw Error('Invalid booking ID');return collection.doc(id);};
 const parse=(snap,id)=>{
  if(!snap.exists)return {state:'예약',events:[]};
  const data=snap.data();
  if(!data||data.bookingId!==id||!Array.isArray(data.events)||
   data.events.length!==(data.state==='등원 중'?1:data.state==='하원 완료'?2:-1))
   throw Object.assign(new Error('Invalid attendance document'),{code:'INVALID_ATTENDANCE_DOCUMENT'});
  validateAttendanceHistory(id,data.events);
  return data;
 };
 async function read(id){return parse(await doc(id).get(),id).events;}
 async function commitTransition({event,expectedState}){
  if(!['예약','등원 중'].includes(expectedState))throw Error('Invalid transition');
  if(typeof event?.bookingId!=='string')throw Object.assign(new Error('Invalid attendance history'),{code:'INVALID_ATTENDANCE_HISTORY'});
  const candidate={...event};
  const ref=doc(candidate.bookingId);
  return db.runTransaction(async tx=>{
   const data=parse(await tx.get(ref),candidate.bookingId);
   if(isAttendanceReplay(data.events,candidate))return data.events;
   if(data.state!==expectedState||candidate.action!==(data.state==='예약'?'check-in':'check-out'))
    throw Object.assign(new Error('Invalid transition'),{code:'ATTENDANCE_STATE_CONFLICT'});
   const events=[...data.events,candidate];
   let state;
   try{state=validateAttendanceHistory(candidate.bookingId,events);}
   catch(error){
    if(error.reason==='CLOCK_ROLLBACK')
     throw Object.assign(new Error('Attendance event time precedes previous event'),{code:'ATTENDANCE_CLOCK_ROLLBACK'});
    throw error;
   }
   tx.set(ref,{...data,bookingId:candidate.bookingId,state,events});
   return events;
  });
 }
 return {read,commitTransition};
}
module.exports={createFirestoreAttendanceStore,createEmulatorAttendanceStore,EMULATOR_PROJECT,EMULATOR_HOST};
