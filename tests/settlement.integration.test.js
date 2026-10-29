const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ledger=[],settlements=[];
function sheet(rows){return {getLastRow:()=>rows.length+1,getRange:(r,c,n=1,w=1)=>({getValues:()=>rows.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+w)),getDisplayValues:()=>rows.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+w).map(String)),getValue:()=>rows[r-2][c-1],setValue:v=>{rows[r-2][c-1]=v}}),appendRow:r=>rows.push(r)}}
const ctx={console,Number,String,Error,Date,Math,JSON,RegExp,
 mdRequired_:(v,n)=>{if(!v)throw Error(n);return String(v)},
 mdSheet_:n=>sheet(n==='회계관리'?ledger:settlements),
 mdSettlementSnapshot_:()=> 'snapshot',
 mdSettlementPreview:()=>({cashBalance:100000}),
 mdId_:()=> 'TXN-1',
 mdAppend_:(n,o)=>ledger.push([o['거래 ID'],o['거래일'],o['거래유형'],o['거래분류'],o['관련 ID'],o['거래내용'],o['입금액'],o['출금액'],o['결제수단'],o['거래상태'],o['처리자'],o['비고']]),
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Session:{getEffectiveUser:()=>({getEmail:()=> 'test@example.invalid'})}
};
vm.createContext(ctx);
for(const f of ['src/SettlementV4.js','src/SettlementPayment.js','src/SettlementRepair.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
ctx.mdSettlementSnapshot_=()=> 'snapshot';
ledger.push(['TXN-CAP','2026-09-01','출자금','자본','', 'test',100000,0,'계좌이체','확정','tester','[OWNER:운영자 A]']);
settlements.push(['SET-1','2026-09',new Date(),'tester',0,100000,0,100000,70000,35000,35000,0,0,'확정','snapshot','test','','']);
const data={month:'2026-09',owner:'운영자 A',date:'2026-10-29',amount:10000,requestId:'REQ-12345678'};
const first=ctx.mdSettlementPayment(data);
assert.equal(first.amount,10000);assert.equal(ledger.length,2);assert.equal(settlements[0][11],10000);
assert.equal(ctx.mdSettlementPayment(data).alreadyRecorded,true);assert.equal(ledger.length,2);
assert.throws(()=>ctx.mdSettlementPayment({...data,amount:26000,requestId:'REQ-87654321'}),/잔액 초과/);
assert.equal(ctx.mdSettlementStatus('2026-09').inconsistent,false);
settlements[0][11]=0;
assert.throws(()=>ctx.mdSettlementPayment(data),/불일치/);
assert.equal(ctx.mdRepairSettlementPayment({month:'2026-09',requestId:data.requestId,confirm:true}).repaired,true);
assert.equal(settlements[0][11],10000);
assert.equal(ctx.mdSettlementStatus('2026-09').inconsistent,false);
assert.equal(ctx.mdRepairSettlementPayment({month:'2026-09',requestId:data.requestId,confirm:true}).alreadyReconciled,true);
console.log('PASS: payout, idempotency, overpayment guard, partial-write detection, repair, reconciliation');
