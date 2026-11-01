/** Prototype-only environment guard. Never deploy this branch to the live Apps Script. */
function mdGuardianTestBook_(){
  const props=PropertiesService.getScriptProperties();
  const testId=String(props.getProperty('MD_GUARDIAN_TEST_SPREADSHEET_ID')||'').trim();
  if(!testId)throw Error('Isolated guardian test spreadsheet not configured');
  if(testId===MD_SPREADSHEET_ID)throw Error('Refusing production spreadsheet as guardian test target');
  return SpreadsheetApp.openById(testId);
}
function mdGuardianTestSetupCheck_(){
  const book=mdGuardianTestBook_();
  const required=['고객·반려견관리','예약·등하원관리','보호자등원요청'];
  const missing=required.filter(name=>!book.getSheetByName(name));
  return {ok:missing.length===0,missing,spreadsheetId:book.getId()};
}

function mdGuardianTestSheet_(name){
  const sheet=mdGuardianTestBook_().getSheetByName(name);
  if(!sheet)throw Error('Required isolated test sheet missing: '+name);
  return sheet;
}
