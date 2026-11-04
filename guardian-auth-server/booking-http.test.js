'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGuardianBookingHttpHandler}=require('./booking-http');
function makeResponse(){
 return {headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};
}
async function call({method='GET',url='/api/guardian/bookings/RSV-TEST-001',authorization='Bearer token',owner='CUS-TEST-001',principal='CUS-TEST-001'}={}){
 const res=makeResponse();
 const handler=createGuardianBookingHttpHandler({
  authenticateGuardian:async token=>{if(token!=='token')throw Error('Invalid');return {role:'guardian',customerId:principal};},
  bookingRepository:{findById:async()=>({bookingId:'RSV-TEST-001',customerId:owner,dogName:'테스트견',visitDate:'2026-11-04',status:'reserved',internalNote:'private'})}
 });
 await handler({method,url,headers:{authorization}},res);
 return res;
}
test('owned booking returns allowlisted fields',async()=>{
 const r=await call();assert.equal(r.statusCode,200);
 assert.deepEqual(Object.keys(r.body.booking).sort(),['bookingId','dogName','status','visitDate']);
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('other guardian cannot read booking',async()=>{const r=await call({principal:'CUS-OTHER'});assert.equal(r.statusCode,403);});
test('no bearer token denied',async()=>{const r=await call({authorization:''});assert.equal(r.statusCode,401);});
test('bad bearer token denied',async()=>{const r=await call({authorization:'Bearer invalid'});assert.equal(r.statusCode,403);});
test('unsupported method denied',async()=>{const r=await call({method:'POST'});assert.equal(r.statusCode,405);});
test('unknown route denied',async()=>{const r=await call({url:'/api/guardian/bookings/../../admin'});assert.equal(r.statusCode,404);});
