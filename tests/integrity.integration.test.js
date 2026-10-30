const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={Map,Set,String,Number};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/IntegrityAudit.js','utf8'),ctx);
const base=()=>({
 '고객·반려견관리':[['D1']],
 '예약·등하원관리':[['R1','2026-10-30','D1','Dog','P1','예약',new Date(),'','등원 중','차감']],
 '이용권관리':[['P1','D1','','','','8',1,7]],
 '_이용권변동이력':[['H1',new Date(),'차감','P1','R1',-1,8,7]]
});
assert.equal(ctx.mdAnalyzeIntegrity_(base()).ok,true);
let d=base();d['이용권관리'][0][7]=8;
assert.ok(ctx.mdAnalyzeIntegrity_(d).issues.some(x=>x.code==='PASS_COUNT_INVALID'));
d=base();d['예약·등하원관리'][0][9]='미차감';
assert.ok(ctx.mdAnalyzeIntegrity_(d).issues.some(x=>x.code==='BOOKING_HISTORY_MISMATCH'));
d=base();d['예약·등하원관리'][0][8]='하원';
assert.ok(ctx.mdAnalyzeIntegrity_(d).issues.some(x=>x.code==='ATTENDANCE_MISMATCH'));
d=base();d['고객·반려견관리']=[];
assert.ok(ctx.mdAnalyzeIntegrity_(d).issues.some(x=>x.code==='BOOKING_DOG_MISSING'));
console.log('PASS: read-only integrity audit scenarios');
