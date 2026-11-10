/**
 * Pure in-memory regression tests. No spreadsheet writes, no production access.
 * Run mdRunPreflightFixtureTest in the isolated GAS project.
 */
function mdRunPreflightFixtureTest(){
  const names={
    '예약·등하원관리':['예약 ID','이용일','반려견 ID','반려견명','이용권 ID','예약상태','등원시간','하원시간','출석상태','차감상태','비고'],
    '이용권관리':['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'],
    '_이용권변동이력':['이력 ID','처리일시','처리유형','이용권 ID','예약 ID','변동 횟수','변경 전 잔여','변경 후 잔여','처리자','사유']
  };
  const makeRows=()=>({
    '예약·등하원관리':[['B-1','','DOG-1','','P-1','','','','','차감','']],
    '이용권관리':[['P-1','DOG-1','','','','3','1','2','','','','','','','']],
    '_이용권변동이력':[['H-1','','차감','P-1','B-1','1','3','2','','']]
  });
  const mock=(rows)=>{
    return {
      getId:()=> 'IN_MEMORY_FIXTURE',
      getSheetByName:(name)=>{
        if(!Object.prototype.hasOwnProperty.call(names,name))return null;
        const data=[names[name]].concat(rows[name]||[]);
        return {
          getLastRow:()=>data.length,
          getRange:(row,col,height,width)=>({
            getDisplayValues:()=>data.slice(row-1,row-1+height).map(r=>Array.from({length:width},(_,i)=>String(r[col-1+i]??'')))
          })
        };
      }
    };
  };
  const cases=[
    {name:'valid',change:()=>{},expect:[]},
    {name:'duplicate_booking',change:r=>r['예약·등하원관리'].push(r['예약·등하원관리'][0].slice()),expect:['DUPLICATE_ID']},
    {name:'dog_mismatch',change:r=>r['예약·등하원관리'][0][2]='DOG-OTHER',expect:['DOG_MISMATCH']},
    {name:'missing_pass',change:r=>r['예약·등하원관리'][0][4]='P-MISSING',expect:['MISSING_LINKED_PASS','DEDUCTION_LEDGER_MISMATCH']},
    {name:'ledger_mismatch',change:r=>r['_이용권변동이력'][0][2]='복구',expect:['DEDUCTION_LEDGER_MISMATCH','INVALID_HISTORY_NET']},
    {name:'pass_counts',change:r=>r['이용권관리'][0][7]='9',expect:['PASS_COUNT_MISMATCH']},
    {name:'duplicate_history',change:r=>r['_이용권변동이력'].push(r['_이용권변동이력'][0].slice()),expect:['DUPLICATE_ID','INVALID_HISTORY_NET']},
    {name:'unknown_status',change:r=>r['예약·등하원관리'][0][9]='오류상태',expect:['UNKNOWN_DEDUCTION_STATUS','UNEXPECTED_ACTIVE_HISTORY']}
  ];
  const failures=[];
  let passed=0;
  cases.forEach(test=>{
    const rows=makeRows();
    test.change(rows);
    const result=mdPreflightPassReadOnly(mock(rows));
    const codes=result.findings.map(f=>f.code);
    const correctOk=result.ok===(test.expect.length===0);
    const hasAll=test.expect.every(code=>codes.includes(code));
    if(correctOk&&hasAll)passed++;
    else failures.push({name:test.name,expected:test.expect,actual:codes,ok:result.ok});
  });
  const output={suite:'PASS_PREFLIGHT_FIXTURES',passed,total:cases.length,ok:failures.length===0,failures};
  Logger.log(JSON.stringify(output));
  if(!output.ok)throw Error('Preflight fixture test failed: '+JSON.stringify(output));
  return output;
}
