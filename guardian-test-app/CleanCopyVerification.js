/** Read-only preflight of the separate cleaned verification copy. Never mutate it. */
function mdVerifyCleanCopyReadOnly(){
  const id='1Foh-qM59-zJc0snD_DreFpjCVLxv7zp6c1X9-TfCuKk';
  const book=SpreadsheetApp.openById(id);
  const result=mdPreflightPassReadOnly(book);
  Logger.log('CLEAN_COPY_VERIFICATION: '+JSON.stringify(result));
  if(!result.ok)throw Error('검증용 사본 무결성 검사 실패: '+JSON.stringify(result.findings));
  return result;
}
