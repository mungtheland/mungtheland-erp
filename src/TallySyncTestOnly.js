/**
 * TEST ONLY: Tally source sheets -> isolated review queue.
 * Dependencies: TallyIntakeStaging.js and TallyReviewQueue.js.
 * This file is NOT deployed. Never writes to Tally or production ERP.
 */
const MD_TALLY_STAGING_ID = '1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8';
const MD_TALLY_STAGING_TAB = '통합접수대장';
const MD_TALLY_MAX_ROWS = 5000;
const MD_TALLY_HEADERS = ['접수키','상품신청 ID','입소계약 ID','접수일시','보호자명(테스트)',
  '반려견명(테스트)','서비스','상품','할인신청','계약서 연결','행동·건강 검토',
  '할인 검토','접수상태','결제확인','ERP반영','검토자','검토일시','비고'];

function mdTallyReadSource_(type) {
  const spec=MD_TALLY_SOURCES[type];
  if(!spec)throw Error('Unknown source');
  const sheet=SpreadsheetApp.openById(spec.spreadsheetId).getSheetByName(spec.sheetName);
  if(!sheet)throw Error('Tally tab not found: '+type);
  const count=sheet.getLastRow();
  if(count<2)return [];
  if(count>MD_TALLY_MAX_ROWS+1)throw Error('Tally row limit exceeded; review pagination');
  const cols=sheet.getLastColumn();
  const rows=sheet.getRange(1,1,count,cols).getDisplayValues();
  return rows.slice(1).filter(r=>r[0]).map(r=>mdTallyParseRow_(type,rows[0],r));
}
/** Append-only. Existing review rows, including human edits, are never overwritten. */
function mdTallySyncReviewQueue_TEST_ONLY() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw Error('Another Tally sync is running');
  try {
    const sheet=SpreadsheetApp.openById(MD_TALLY_STAGING_ID).getSheetByName(MD_TALLY_STAGING_TAB);
    if(!sheet)throw Error('Review tab not found');
    const actual=sheet.getRange(1,1,1,MD_TALLY_HEADERS.length).getDisplayValues()[0];
    if(actual.some((x,i)=>x!==MD_TALLY_HEADERS[i]))throw Error('Review headers changed; no writes');
    const existing=sheet.getLastRow()>1?
      sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().map(r=>r[0]):[];
    const keys=new Set(existing.filter(Boolean));
    const contracts=mdTallyReadSource_('contract');
    const orders=mdTallyReadSource_('order');
    const items=mdTallyBuildReviewQueue_(contracts,orders);
    const rows=items.filter(x=>!keys.has(x.key)).map(x=>[
      x.key,x.orderId,x.contractId,'',x.guardian,x.dog,x.service,x.product,x.discount,
      x.contractId?'후보 연결(직원확인)':'미연결',
      x.flags.filter(f=>/행동|건강|서명|동의|계약서/.test(f)).join(' / '),
      x.flags.filter(f=>/할인/.test(f)).join(' / '),
      '심사 필요','미확인','미반영','','',x.flags.join(' / ')
    ]);
    if(rows.length){
      const start=sheet.getLastRow()+1;
      if(start+rows.length-1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),start+rows.length-1-sheet.getMaxRows());
      sheet.getRange(start,1,rows.length,MD_TALLY_HEADERS.length).setValues(rows);
    }
    // No personal details in execution logs.
    return {readContracts:contracts.length,readOrders:orders.length,appended:rows.length,existing:keys.size};
  }finally{lock.releaseLock();}
}
