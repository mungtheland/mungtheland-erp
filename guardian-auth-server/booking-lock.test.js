'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withBookingLock}=require('./booking-lock');
test('same booking operations are serialized even when first awaits',async()=>{
 const events=[];
 let unblock;
 const gate=new Promise(resolve=>{unblock=resolve});
 const first=withBookingLock('RSV-TEST-001',async()=>{events.push('first-start');await gate;events.push('first-end')});
 const second=withBookingLock('RSV-TEST-001',async()=>{events.push('second-start')});
 await Promise.resolve();
 assert.deepEqual(events,['first-start']);
 unblock();
 await Promise.all([first,second]);
 assert.deepEqual(events,['first-start','first-end','second-start']);
});
test('failed operation releases booking lock',async()=>{
 await assert.rejects(withBookingLock('RSV-TEST-001',async()=>{throw Error('failure')}),/failure/);
 assert.equal(await withBookingLock('RSV-TEST-001',async()=>42),42);
});
