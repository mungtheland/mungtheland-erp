'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {readTestServerSettings,assertCloudAttendanceClient}=require('./local-server');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');

const project='mungtheland-guardian-test';
const testBooking='RSV-TEST-FIXTURE';
const defaults={GOOGLE_CLOUD_PROJECT:project};
const cloud={...defaults,MD_TEST_ATTENDANCE_FIRESTORE:'enabled',MD_TEST_ATTENDANCE_BOOKING_ID:testBooking};

test('memory mode stays the default; legacy isolated Sheets opt-in still works',()=>{
 assert.deepEqual(readTestServerSettings(defaults),{
  firestoreEnabled:false,arrivalWriteEnabled:false,attendancePersistEnabled:false
 });
 assert.equal(readTestServerSettings({...defaults,MD_TEST_ATTENDANCE_PERSIST:'enabled'}).attendancePersistEnabled,true);
 assert.throws(()=>readTestServerSettings({}),/Wrong Google Cloud project/);
 assert.throws(()=>readTestServerSettings({...cloud,GOOGLE_CLOUD_PROJECT:'demo-mungtheland-attendance'}),/Wrong Google Cloud project/);
});

test('cloud mode pins a single synthetic booking and refuses simultaneous Sheets writes',()=>{
 assert.deepEqual(readTestServerSettings(cloud),{
  firestoreEnabled:true,arrivalWriteEnabled:false,attendancePersistEnabled:false,attendanceWriteBookingId:testBooking
 });
 for(const key of ['MD_TEST_ATTENDANCE_PERSIST','MD_TEST_ARRIVAL_WRITE']){
  assert.throws(()=>readTestServerSettings({...cloud,[key]:'enabled'}),/Sheets writes/);
 }
 for(const booking of [undefined,'RSV-OTHER','RSV-TEST-','RSV-TEST-ONE,RSV-TEST-TWO']){
  assert.throws(()=>readTestServerSettings({...cloud,MD_TEST_ATTENDANCE_BOOKING_ID:booking}),/explicit test booking/);
 }
});

test('cloud mode refuses emulator and ambiguous project options',()=>{
 for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']){
  assert.throws(()=>readTestServerSettings({...cloud,[key]:'127.0.0.1:18879'}),/emulator/);
 }
 for(const override of [{FIREBASE_CONFIG:'{}'},{GCLOUD_PROJECT:'other-project'}]){
  assert.throws(()=>readTestServerSettings({...cloud,...override}),/unambiguous project/);
 }
 assert.equal(readTestServerSettings({...cloud,GCLOUD_PROJECT:project}).firestoreEnabled,true);
});

test('target verification rejects unsafe Firestore endpoints and database IDs',()=>{
 const target={projectId:project,databaseId:'(default)',_settings:{}};
 assert.doesNotThrow(()=>assertCloudAttendanceClient(target));
 assert.doesNotThrow(()=>assertCloudAttendanceClient({...target,_settings:{servicePath:'firestore.googleapis.com',ssl:true,port:443}}));
 for(const settings of [{ssl:false},{servicePath:'127.0.0.1'},{port:18879},undefined]){
  assert.throws(()=>assertCloudAttendanceClient({...target,_settings:settings}),/Unexpected Firestore/);
 }
 for(const override of [{projectId:'other-project'},{databaseId:'other-database'}]){
  assert.throws(()=>assertCloudAttendanceClient({...target,...override}),/Unexpected Firestore/);
 }
});

test('cloud booking restriction blocks all other writes and preserves read access',async()=>{
 const calls=[];
 const handler=createStaffArrivalHttpHandler({
  attendanceWriteBookingId:testBooking,
  authenticateStaff:async()=>({role:'staff',status:'active'}),
  staffAttendance:{
   async get(_,id){calls.push(['read',id]);return {state:'예약'};},
   async transition(_,id,action){calls.push([action,id]);return {state:'등원 중'};}
  }
 });
 async function request(id,method,action=''){
  let status,body;
  await handler({method,url:'/api/staff/bookings/'+id+'/attendance'+action,headers:{authorization:'Bearer fixture'}},{
   writeHead(value){status=value;},end(value){body=JSON.parse(value);}
  });
  return {status,body};
 }
 for(const action of ['/check-in','/check-out']){
  const result=await request('RSV-TEST-OTHER','POST',action);
  assert.equal(result.status,403);
  assert.equal(result.body.code,'ATTENDANCE_WRITE_FAILED');
 }
 assert.equal((await request('RSV-TEST-OTHER','GET')).status,200);
 assert.equal((await request(testBooking,'POST','/check-in')).status,200);
 assert.deepEqual(calls,[['read','RSV-TEST-OTHER'],['check-in',testBooking]]);
});
