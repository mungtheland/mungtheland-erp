/** 독립형 Apps Script의 운영자 전용 웹앱 진입점. 배포 접근 권한을 제한해야 함. */
function doGet(){
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('멍더랜드 ERP')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
