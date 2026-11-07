'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {adjustIsolatedPass:adjust,TEST_SPREADSHEET_ID:ID}=require('./isolated-sheets-pass-locked');
function fixture(){
 const state={booking:{bookingId:'RSV-TEST-NEW-003',dogId:'DOG-TEST-001',passId:'PASS-TEST-NEW-003',status:'예약',checkedInAt:'2026-11-07 09:00',attendance:'등원 중',deduction:'미차감',date:'2026-11-07'},
 pass:{passId:'PASS-TEST-NEW-003',dogId:'DOG-TEST-001',total:8,used:0,remaining:8,payment:'완료',status:'사용 가능',start:'2026-11-07',expiry:'2026-12-31'},history:[]};
 let commits=0,lock=Promise.resolve();
 const adapter={withExclusiveWorkbookLock(fn){const next=lock.then(fn);lock=next.catch(()=>{});return next;},
  async readCurrent(){return structuredClone(state);},async newHistoryId(){return 'HIS-TEST-'+(commits+1);},
  async commitWithRecovery({plan,entry}){commits++;state.pass.used=plan.used;state.pass.remaining=plan.remaining;state.pass.status=plan.passStatus;state.booking.deduction=plan.bookingDeduction;state.history.push(entry);}};
 const args={adapter,spreadsheetId:ID,bookingId:state.booking.bookingId,passId:state.pass.passId,type:'차감',today:'2026-11-07',operator:'STAFF-TEST-001'};
 return {state,adapter,args,getCommits:()=>commits};
}
test('locked deduction updates pass, booking and history',async()=>{const f=fixture();const r=await adjust(f.args);assert.equal(r.remaining,7);assert.equal(f.state.history.length,1);});
test('sequential duplicate is no-op',async()=>{const f=fixture();await adjust(f.args);const r=await adjust(f.args);assert.equal(r.writes,0);assert.equal(f.getCommits(),1);});
test('concurrent duplicate serialized under shared lock',async()=>{const f=fixture();const r=await Promise.all([adjust(f.args),adjust(f.args)]);assert.deepEqual(r.map(x=>x.writes).sort(),[0,1]);assert.equal(f.getCommits(),1);});
test('restore once with audit reason',async()=>{const f=fixture();await adjust(f.args);const r=await adjust({...f.args,type:'복구',reason:'테스트 취소'});assert.equal(r.remaining,8);assert.equal(f.state.history.length,2);});
test('rejects production workbook',async()=>{const f=fixture();await assert.rejects(adjust({...f.args,spreadsheetId:'production'}),/ISOLATION_GUARD/);});
test('rejects missing lock',async()=>{const f=fixture();await assert.rejects(adjust({...f.args,adapter:{}}),/LOCK_REQUIRED/);});
test('failed commit requires reconciliation and not blind retry',async()=>{const f=fixture();f.adapter.commitWithRecovery=async()=>{throw Error('simulated failure')};await assert.rejects(adjust(f.args),/COMMIT_UNCERTAIN_RECONCILE_REQUIRED/);});
