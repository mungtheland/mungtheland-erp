const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const bookings=[];
let idCounter=0, lockHeld=false, lockCalls=0;
const lock={waitLock(){assert.equal(lockHeld,false,'lock must be exclusive');lockHeld=true;lockCalls++;},releaseLock(){lockHeld=false;}};
const bookingSheet={
  getLastRow:()=>bookings.length+1,
  getRange:(row,col,height=1,width=1)=>({
    getDisplayValues:()=>bookings.slice(row-2,row-2+height).map(r=>r.slice(col-1,col-1+width).map(String))
  })
};
const dogSheet={getRange:()=>({getDisplayValue:()=> '코코'})};
const ctx={Date,Number,String,Error,JSON,isNaN,LockService:{getScriptLock:()=>lock}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/Code.js','utf8'),ctx);
ctx.mdRequired_=(value,label)=>{if(value==null||String(value).trim()==='')throw Error(label+' required');return String(value).trim();};
ctx.mdCheckSetup=()=>{};
ctx.mdSheet_=name=>name==='고객·반려견관리'?dogSheet:bookingSheet;
ctx.mdFindById_=()=>2;
ctx.mdId_=()=> 'R'+(++idCounter);
ctx.mdAppend_=(_,record)=>{bookings.push([record['예약 ID'],record['이용일'],record['반려견 ID'],record['반려견명'],record['이용권 ID'],record['예약상태'],'','',record['출석상태'],record['차감상태'],record['비고']]);};
const create=(date,dogId='D1')=>ctx.mdCreateBooking({dogId,date});
assert.throws(()=>create('2026-02-30'),/올바른 이용일/);
assert.throws(()=>create('2026-13-01'),/올바른 이용일/);
assert.throws(()=>create('2026-11-1'),/올바른 이용일/);
assert.equal(bookings.length,0,'invalid dates must not create records');
assert.equal(create('2026-11-02').bookingId,'R1');
assert.throws(()=>create('2026-11-02'),/이미 존재/,'repeat click must not create another booking');
assert.equal(bookings.length,1);
bookings[0][1]='2026. 11. 2.';
assert.throws(()=>create('2026-11-02'),/이미 존재/,'localized display dates must match ISO dates');
bookings[0][1]='2026.11.2';
assert.throws(()=>create('2026-11-02'),/이미 존재/,'localized dates without spaces must match');
assert.equal(create('2026-11-03').bookingId,'R2','different date is allowed');
assert.equal(create('2026-11-02','D2').bookingId,'R3','different dog is allowed');
bookings[0][5]='예약취소';
assert.equal(create('2026-11-02').bookingId,'R4','cancelled booking does not block rebooking');
assert.throws(()=>create('2026-11-02'),/이미 존재/,'rebooking must still be duplicate-protected');
assert.equal(bookings.length,4);
assert.equal(lockHeld,false,'all locks must be released');
assert.equal(lockCalls,8,'valid requests should each acquire lock');
console.log('PASS: repeat booking submissions, date variants, cancellation and locking');

const passRows=[['PASS-1','D1',8],['PASS-OTHER','D2',8],['PASS-DUPLICATE','D1',8],['PASS-DUPLICATE','D1',8]];
const passSheet={
  getLastRow:()=>passRows.length+1,
  getRange:(row,col,height,width)=>({
    getDisplayValues:()=>passRows.slice(row-2,row-2+height).map(r=>r.slice(col-1,col-1+width).map(String))
  })
};
const bookingFixtureSheet=ctx.mdSheet_;
ctx.mdSheet_=name=>name==='이용권관리'?passSheet:bookingFixtureSheet(name);

test('booking connects a valid pass without consuming a use',()=>{
  const before=structuredClone(passRows);
  ctx.mdCreateBooking({dogId:'D1',date:'2026-11-04',passId:'PASS-1'});
  assert.equal(bookings.at(-1)[4],'PASS-1');
  assert.equal(bookings.at(-1)[9],'미차감');
  assert.deepEqual(passRows,before);
  assert.equal(lockHeld,false);
});

for(const [passId,date,error] of [
  ['PASS-MISSING','2026-11-05',/이용권을 찾을 수 없습니다/],
  ['PASS-OTHER','2026-11-06',/반려견이 다릅니다/],
  ['PASS-DUPLICATE','2026-11-07',/이용권 ID가 중복/]
]){
  test(`booking rejects ${passId} without writing`,()=>{
    const bookingCount=bookings.length;
    assert.throws(()=>ctx.mdCreateBooking({dogId:'D1',date,passId}),error);
    assert.equal(bookings.length,bookingCount);
    assert.equal(lockHeld,false);
  });
}
