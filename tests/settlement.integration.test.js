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
for(const f of ['src/OperatorAudit.js','src/SettlementV4.js','src/SettlementPayment.js','src/SettlementRepair.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
ctx.mdSettlementSnapshot_=()=> 'snapshot';
ledger.push(['TXN-CAP','2026-09-01','출자금','자본','', 'test',100000,0,'계좌이체','확정','tester','[OWNER:운영자 A]']);
settlements.push(['SET-1','2026-09',new Date(),'tester',0,100000,0,100000,70000,35000,35000,0,0,'확정','snapshot','test','','']);
const data={month:'2026-09',owner:'운영자 A',date:'2026-10-29',amount:10000,requestId:'REQ-12345678',operator:'운영자 A',reason:'정산 지급 확인'};
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
// Verify payout controls with fresh in-memory fixtures; no live ledger writes.
function resetFixture({cash=100000,reserve=0,paidA=0,paidB=0,limitA=35000,limitB=35000}={}){
 ledger.length=0;settlements.length=0;
 ledger.push(['TXN-CAP','2026-09-01','출자금','자본','','test',cash,0,'계좌이체','확정','tester','[OWNER:운영자 A]']);
 settlements.push(['SET-1','2026-09',new Date(),'tester',reserve,100000,0,100000,limitA+limitB,limitA,limitB,paidA,paidB,'확정','snapshot','test','','']);
}
const request=(id,amount=10000,owner='운영자 A')=>({month:'2026-09',owner,date:'2026-10-29',amount,requestId:'REQ-'+id,operator:'운영자 A',reason:'정산 지급 확인'});
resetFixture();
assert.throws(()=>ctx.mdRepairSettlementPayment({month:'2026-09',requestId:'REQ-12345678'}),/승인/);
assert.equal(ledger.length,1);
assert.throws(()=>ctx.mdSettlementPayment(request('TOOLARGE',35001)),/잔액 초과/);
assert.equal(ledger.length,1);
resetFixture({cash:12000,reserve:3000});
assert.throws(()=>ctx.mdSettlementPayment(request('CASHLOW1',10000)),/잔액이 부족/);
assert.equal(ledger.length,1);
resetFixture({cash:15000,reserve:5000});
assert.equal(ctx.mdSettlementPayment(request('CASHOK01',10000)).amount,10000);
assert.equal(ctx.mdSettlementPayment(request('CASHOK01',10000)).alreadyRecorded,true);
assert.equal(ledger.length,2);
resetFixture();
ctx.mdSettlementSnapshot_=()=> 'changed';
assert.throws(()=>ctx.mdSettlementPayment(request('CHANGED1')),/변경/);
assert.equal(ledger.length,1);
ctx.mdSettlementSnapshot_=()=> 'snapshot';
resetFixture();
const p=ctx.mdSettlementPayment(request('PARTIAL1'));
assert.equal(p.amount,10000);
// Simulate a partial write: ledger exists but settlement history was not recorded.
settlements[0][16]='';settlements[0][11]=0;
assert.throws(()=>ctx.mdSettlementPayment(request('PARTIAL1')),/이미 기록/);
assert.equal(ledger.length,2,'retry must not duplicate payout after partial write');
assert.equal(ctx.mdRepairSettlementPayment({month:'2026-09',requestId:'REQ-PARTIAL1',confirm:true}).repaired,true);
assert.equal(settlements[0][11],10000);
assert.equal(ctx.mdSettlementPayment(request('PARTIAL1')).alreadyRecorded,true);
resetFixture();
assert.equal(ctx.mdSettlementPayment(request('OWNERB01',5000,'운영자 B')).amount,5000);
assert.equal(ctx.mdSettlementStatus('2026-09').paidB,5000);
assert.equal(ctx.mdSettlementStatus('2026-09').inconsistent,false);

// Corrupted payout ledger must never be repaired automatically.
function partialFixture(id){
 resetFixture();
 ctx.mdSettlementPayment(request(id));
 settlements[0][11]=0;
 settlements[0][16]='';
 return ledger[1];
}
function rejectedRepair(id,pattern){
 const beforeLedger=JSON.stringify(ledger),beforeSettlement=JSON.stringify(settlements);
 assert.throws(()=>ctx.mdRepairSettlementPayment({month:'2026-09',requestId:'REQ-'+id,confirm:true}),pattern);
 assert.equal(JSON.stringify(ledger),beforeLedger,'rejected repair must not mutate ledger');
 assert.equal(JSON.stringify(settlements),beforeSettlement,'rejected repair must not mutate settlement');
}
let tx=partialFixture('DUPLICAT');
ledger.push([...tx.slice(0,12)]);
rejectedRepair('DUPLICAT',/유일하지/);
tx=partialFixture('WRONGAMT');
tx[7]=36000;
rejectedRepair('WRONGAMT',/한도 초과/);
tx=partialFixture('WRONGOWN');
tx[11]=tx[11].replace('[OWNER:운영자 A]','[OWNER:운영자 C]');
rejectedRepair('WRONGOWN',/속성 불일치/);
tx=partialFixture('WRONGSET');
tx[4]='SET-OTHER';
rejectedRepair('WRONGSET',/속성 불일치/);
tx=partialFixture('BADVALUE');
tx[7]=-100;
rejectedRepair('BADVALUE',/금액 오류/);
tx=partialFixture('MULTIPAY');
settlements[0][11]=500;
rejectedRepair('MULTIPAY',/복수 불일치/);
tx=partialFixture('SNAPSHOT');
ctx.mdSettlementSnapshot_=()=> 'changed';
rejectedRepair('SNAPSHOT',/원장 변경/);
ctx.mdSettlementSnapshot_=()=> 'snapshot';
console.log('PASS: reject duplicate, altered, misattributed and inconsistent payout repair requests');
console.log('PASS: payout, idempotency, overpayment guard, partial-write detection, repair, reconciliation');
