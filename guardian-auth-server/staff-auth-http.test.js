'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStaffAuthenticator}=require('./staff-authenticate');
const {createStaffArrivalHttpHandler}=require('./staff-arrival-http');
test('staff auth requires verified Firebase identity and server-approved staff mapping',async()=>{
 const now=Math.floor(Date.now()/1000);
 const claims={uid:'uid-staff',sub:'uid-staff',aud:'test-project',iss:'https://securetoken.google.com/test-project',email:'staff@example.test',email_verified:true,exp:now+3600};
 const auth=createStaffAuthenticator({firebaseAuth:{verifyIdToken:async()=>claims},accountStore:{findByFirebaseUid:async uid=>uid==='uid-staff'?{staffId:'STAFF-TEST-001',email:'staff@example.test',status:'active'}:null},projectId:'test-project'});
 assert.deepEqual({...await auth('x'.repeat(120))},{role:'staff',status:'active',staffId:'STAFF-TEST-001'});
 claims.email_verified=false;
 await assert.rejects(auth('x'.repeat(120)),/Authentication failed/);
});
test('staff API rejects missing token and guardian role without accessing data',async()=>{
 let reads=0;
 const handler=createStaffArrivalHttpHandler({authenticateStaff:async()=>({role:'guardian',status:'active'}),staffArrival:{get:async()=>{reads++}}});
 async function request(headers){let status;const res={writeHead:s=>{status=s},end:()=>{}};await handler({url:'/api/staff/bookings/RSV-TEST-001/arrival-request',method:'GET',headers},res);return status}
 assert.equal(await request({}),401);
 assert.equal(await request({authorization:'Bearer valid'}),403);
 assert.equal(reads,0);
});
