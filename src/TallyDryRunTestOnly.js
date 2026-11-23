/** Run this first in an isolated Apps Script project. Reads Tally sources; does not write. */
function mdTallyDryRun_TEST_ONLY(){
  const contracts=mdTallyReadSource_('contract');
  const orders=mdTallyReadSource_('order');
  const items=mdTallyBuildReviewQueue_(contracts,orders);
  const duplicates=(records)=>records.length-new Set(records.map(x=>x.sourceId)).size;
  const summary={
    contractRows:contracts.length,orderRows:orders.length,
    duplicateContractIds:duplicates(contracts),duplicateOrderIds:duplicates(orders),
    reviewItems:items.length,matchedCandidates:items.filter(x=>x.contractId&&x.orderId).length,
    unmatchedOrders:items.filter(x=>x.orderId&&!x.contractId).length,
    unmatchedContracts:items.filter(x=>x.contractId&&!x.orderId).length,
    needsStaffReview:items.filter(x=>x.status==='심사 필요').length,
    writesPerformed:0
  };
  // Deliberately no guardian names, dog names, phone numbers, signatures or source IDs in logs.
  console.log(JSON.stringify(summary));
  return summary;
}
