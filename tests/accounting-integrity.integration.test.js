const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ledger=[];let seq=0,locked=false;
const sheet={getLastRow:()=>ledger.length+1,getRange:(r,c,n=1,w=1)=>({
 getValues:()=>ledger.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+w)),
 getDisplayValues:()=>ledger.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+w).map(String)),
 setValue:v=>{ledger[r-2][c-1]=v}
})};
const ctx={Date,Number,String,Error,Math,JSON,isNaN,Session:{getEffectiveUser:()=>({getEmail:()=> 'operator@example.invalid'})},
 Utilities:{formatDate:(d,tz,fmt)=>fmt.includes('HH')?'2026-11-01 12:00:00':d.toISOString().slice(0,10)},
 SpreadsheetApp:{flush(){}},
 LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})}
};
vm.createContext(ctx);
for(const path of ['src/OperatorAudit.js','src/Accounting.js','src/Settlement.js'])vm.runInContext(fs.readFileSync(path,'utf8'),ctx,{filename:path});
ctx.mdRequired_=(v,n)=>{if(v==null||String(v).trim()==='')throw Error(n);return String(v).trim()};
ctx.mdCheckSetup=()=>{};ctx.mdSheet_=()=>sheet;ctx.mdId_=()=> 'TXN-'+(++seq);
ctx.mdFindById_=(_,id)=>ledger.findIndex(x=>x[0]===id)+2;
ctx.mdAppend_=(_,o)=>ledger.push([o['거래 ID'],o['거래일'],o['거래유형'],o['거래분류'],o['관련 ID'],o['거래내용'],o['입금액'],o['출금액'],o['결제수단'],o['거래상태'],o['처리자'],o['비고']]);
const entry=(type,amount,requestId,owner)=>({type,amount,requestId,owner,category:'테스트',description:'격리 검증',date:'2026-10-15',paymentMethod:'계좌이체'});
const sale=ctx.mdAddAccountingEntry(entry('매출',100001,'REQ-SALE0001'));
assert.equal(ledger.length,1);
assert.equal(ctx.mdAddAccountingEntry(entry('매출',100001,'REQ-SALE0001')).alreadyRecorded,true);
assert.equal(ledger.length,1,'repeat request must not duplicate revenue');
ctx.mdAddAccountingEntry(entry('지출',20000,'REQ-COST0001'));
ctx.mdAddAccountingEntry(entry('출자금',50000,'REQ-CAPITAL1','운영자 A'));
const preview=ctx.mdSettlementPreview({month:'2026-10',reserve:10000});
assert.equal(preview.monthProfit,80001);
assert.equal(preview.cashBalance,130001);
assert.equal(preview.distributable,80001);
assert.equal(preview.owners['운영자 A'],40000);
assert.equal(preview.owners['운영자 B'],40001);
assert.equal(ledger.length,3,'preview must not create a transaction');
assert.throws(()=>ctx.mdCancelAccountingEntry({transactionId:sale.transactionId,reason:'중복 입력 정정'}),/담당자/);
assert.throws(()=>ctx.mdCancelAccountingEntry({transactionId:sale.transactionId,reason:'x',operator:'운영자 A'}),/사유/);
assert.equal(ledger[0][9],'확정','invalid operator/reason must not cancel transaction');
assert.equal(ctx.mdCancelAccountingEntry({transactionId:sale.transactionId,reason:'중복 입력 정정',operator:'운영자 B'}).status,'취소');
assert.match(ledger[0][11],/운영자 B \/ 중복 입력 정정/);
assert.equal(ctx.mdCancelAccountingEntry({transactionId:sale.transactionId,reason:'중복 입력 정정',operator:'운영자 B'}).alreadyCancelled,true);
assert.equal(ctx.mdAccountingSummary('2026-10').totals.sales,0);
assert.equal(ctx.mdSettlementPreview({month:'2026-10'}).distributable,0);
assert.equal(ledger.length,3,'cancellation must preserve original record');
assert.equal(locked,false);
console.log('PASS accounting idempotency, cancellation, preview-only and 50:50 odd-won split');
