'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCheckInPassHttpHandler}=require('./checkin-pass-http');
const bookingId='RSV-TEST-HTTP-001',principal={role:'staff',status:'active',staffId:'STAFF-TEST-001'};
function setup({authorized=true,pending=false,binding=true}={}){
 let calls=0;
 const handler=createCheckInPassHttpHandler({
  authenticateStaff:async()=>authorized?principal:{role:'guardian',status:'active'},
  resolveTestPass:async()=>binding?{passId:'PASS-TEST-001',customerId:'CUS-TEST-001'}:null,
  coordinator:{checkInAndConsume:async args=>{calls++;assert.equal(args.passId,'PASS-TEST-001');assert.equal(args.customerId,'CUS-TEST-001');return {consumptionStatus:pending?'pending-reconciliation':'consumed',reconciliationRequired:pending};}}
 });
 async function request(method='POST',url='/api/staff/test-bookings/'+bookingId+'/check-in-with-pass',token='Bearer TEST'){
  const res={status:null,writeHead(code){this.status=code;},end(s){this.body=JSON.parse(s);}};
  const matched=await handler({url,method,headers:{authorization:token}},res);
  return {matched,status:res.status,body:res.body};
 }
 return {request,calls:()=>calls};
}
test('staff authorized request uses server-side pass mapping',async()=>{const h=setup();const r=await h.request();assert.equal(r.status,200);assert.equal(h.calls(),1);});
test('partial failure reports 202 reconciliation, not success',async()=>{const h=setup({pending:true});const r=await h.request();assert.equal(r.status,202);assert.equal(r.body.result.reconciliationRequired,true);});
test('guardian denied without calling coordinator',async()=>{const h=setup({authorized:false});assert.equal((await h.request()).status,403);assert.equal(h.calls(),0);});
test('missing bearer denied',async()=>{const h=setup();assert.equal((await h.request('POST',undefined,'')).status,401);});
test('missing server binding rejected',async()=>{const h=setup({binding:false});assert.equal((await h.request()).status,404);assert.equal(h.calls(),0);});
test('only POST allowed',async()=>{const h=setup();assert.equal((await h.request('GET')).status,405);});
test('non-test booking never matches',async()=>{const h=setup();assert.equal((await h.request('POST','/api/staff/test-bookings/RSV-PROD-001/check-in-with-pass')).matched,false);});
