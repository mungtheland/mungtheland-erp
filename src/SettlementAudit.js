/** Read-only audit of all confirmed settlements; no ledger mutations. */
function mdAuditSettlements(){
 const sh=mdSheet_('_정산이력'),last=sh.getLastRow();
 const rows=last<2?[]:sh.getRange(2,1,last-1,18).getValues();
 const report=rows.filter(r=>r[0]).map(r=>{
  const month=String(r[1]),status=mdSettlementStatus(month);
  return {month,id:String(r[0]),inconsistent:status.inconsistent,changed:status.changed,paidA:status.paidA,paidB:status.paidB,ledgerA:status.ledgerA,ledgerB:status.ledgerB};
 });
 const result={checked:report.length,passed:report.every(x=>!x.inconsistent&&!x.changed),report:report};
 Logger.log(JSON.stringify(result));
 return result;
}
