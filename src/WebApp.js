/** 운영자 전용 웹앱. HTML 템플릿의 최신 여부를 응답 전에 확인한다. */
function doGet(e){
  const html=HtmlService.createHtmlOutputFromFile('Index');
  const content=html.getContent();
  if(content.indexOf('id="activeOperator"')===-1){
    throw new Error('ERP HTML 배포 불일치: Index.html에 activeOperator가 없습니다. Apps Script 프로젝트 및 배포 버전을 확인하세요.');
  }
  return html.setTitle('멍더랜드 ERP')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
/** 읽기 전용: Apps Script 편집기에서 실행하여 실제 Index.html 포함 여부를 확인. */
function mdWebAppHtmlDiagnostics(){
  const content=HtmlService.createHtmlOutputFromFile('Index').getContent();
  const result={
    hasOperatorSelector:content.indexOf('id="activeOperator"')!==-1,
    hasOperatorValidation:content.indexOf('function auditOperator()')!==-1,
    htmlLength:content.length,
    mode:'READ_ONLY'
  };
  Logger.log(JSON.stringify(result));
  return result;
}
