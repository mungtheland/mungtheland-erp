'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedSheetsBookingRepository,TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
function mock(){
 const calls=[];
 const sheets={spreadsheets:{values:{get:async args=>{
  calls.push(args);
  if(args.range.includes('예약·등하원관리'))return {data:{values:[['예약 ID'],['RSV-TEST-001','','DOG-TEST-001','','','예약']]}};
  if(args.range.includes('고객·반려견관리'))return {data:{values:[['반려견 ID','고객 ID'],['DOG-TEST-001','CUS-TEST-001']]}};
  throw Error('Unknown sheet');
 }}}};
 return {sheets,calls};
}
test('only isolated test spreadsheet accepted',()=>{
 assert.throws(()=>createIsolatedSheetsBookingRepository({sheets:mock().sheets,spreadsheetId:'production'}),/Isolated/);
});
test('booking ownership derived from dog sheet, not browser',async()=>{
 const m=mock(),repo=createIsolatedSheetsBookingRepository({sheets:m.sheets});
 const b=await repo.findById('RSV-TEST-001');
 assert.deepEqual(b,{bookingId:'RSV-TEST-001',customerId:'CUS-TEST-001',dogName:'DOG-TEST-001',visitDate:'',status:'예약'});
 assert.equal(m.calls.length,2);
 assert.ok(m.calls.every(c=>c.spreadsheetId===TEST_SPREADSHEET_ID));
 assert.ok(m.calls.every(c=>c.valueRenderOption==='FORMATTED_VALUE'));
});
test('nonexistent booking denied',async()=>assert.equal(await createIsolatedSheetsBookingRepository({sheets:mock().sheets}).findById('RSV-OTHER'),null));
test('invalid booking ID denied before sheet read',async()=>{
 const m=mock();
 assert.equal(await createIsolatedSheetsBookingRepository({sheets:m.sheets}).findById('../../other'),null);
 assert.equal(m.calls.length,0);
});
