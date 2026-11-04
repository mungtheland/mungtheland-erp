'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createArrivalRequestService,validate}=require('./arrival-request');
test('arrival fields validated',()=>{
 assert.equal(validate({mealTime:'12:30',foodProvided:'yes',mannerBelt:'no'}).mealTime,'12:30');
 assert.throws(()=>validate({mealTime:'25:99',foodProvided:'yes',mannerBelt:'no'}));
 assert.throws(()=>validate({foodProvided:'yes',mannerBelt:'no',notes:'x'.repeat(501)}));
});
test('other guardian cannot read or save request',async()=>{
 let accessed=false;
 const sheets={spreadsheets:{values:{get:async()=>{accessed=true;return {data:{values:[]}}},update:async()=>{accessed=true},append:async()=>{accessed=true}}}};
 const bookingRepository={findById:async()=>({bookingId:'RSV-TEST-001',customerId:'CUS-TEST-001'})};
 const service=createArrivalRequestService({sheets,bookingRepository});
 await assert.rejects(service.get('CUS-TEST-OTHER','RSV-TEST-001'),/Access denied/);
 await assert.rejects(service.save('CUS-TEST-OTHER','RSV-TEST-001',{foodProvided:'yes',mannerBelt:'yes'}),/Access denied/);
 assert.equal(accessed,false);
});
