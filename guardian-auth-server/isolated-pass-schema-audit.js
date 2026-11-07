'use strict';
/**
 * Read-only isolated workbook schema audit. No production spreadsheet access,
 * no cell values beyond row 1, no Firestore writes, no personal data output.
 */
const {google}=require('googleapis');
const {TEST_SPREADSHEET_ID}=require('./isolated-sheets-bookings');
const EXPECTED={
 '예약·등하원관리':['예약 ID','이용일','반려견 ID',null,'이용권 ID','예약상태',null,null,'출석상태','차감상태'],
 '이용권관리':['이용권 ID','반려견 ID','상품 ID','상품명','구매일','총 횟수','사용 횟수','잔여 횟수','시작일','만료일','판매금액','할인금액','결제금액','결제상태','이용권상태'],
 '_이용권변동이력':[null,null,null,null,null,null,null,null,null,null]
};
async function audit({sheets,spreadsheetId=TEST_SPREADSHEET_ID}){
 if(spreadsheetId!==TEST_SPREADSHEET_ID)throw Error('Only isolated test spreadsheet allowed');
 const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets.properties.title'});
 const available=new Set((meta.data?.sheets||[]).map(x=>x.properties?.title).filter(Boolean));
 const results=[];
 for(const [name,expected] of Object.entries(EXPECTED)){
  if(!available.has(name)){results.push({sheet:name,found:false,reason:'SHEET_NOT_PRESENT_IN_ISOLATED_WORKBOOK'});continue;}
  try{
   const range="'"+name.replace(/'/g,"''")+"'!A1:O1";
   const response=await sheets.spreadsheets.values.get({spreadsheetId,range,valueRenderOption:'FORMATTED_VALUE'});
   const headers=response.data?.values?.[0]||[];
   const issues=expected.flatMap((label,i)=>label&&headers[i]!==label?[{column:i+1,expected:label,actual:headers[i]||'(empty)'}]:[]);
   results.push({sheet:name,found:true,headerCount:headers.length,issues,headers});
  }catch(e){
   if(e.code===400||e.code===404)results.push({sheet:name,found:true,readable:false,error:'Sheet exists but header read failed'});
   else throw e;
  }
 }
 return {project:'mungtheland-guardian-test',spreadsheetId,readOnly:true,writesPerformed:0,
  compatible:results.every(x=>x.found&&x.readable!==false&&x.issues.length===0),sheets:results};
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!=='mungtheland-guardian-test'||process.env.MD_RUN_READONLY_SCHEMA_AUDIT!=='YES')throw Error('Explicit isolated read-only audit opt-in required');
 const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
 const sheets=google.sheets({version:'v4',auth});
 const result=await audit({sheets});
 console.log(JSON.stringify(result,null,2));
 if(!result.compatible)console.log('[schema-audit] REVIEW REQUIRED: schema differences; no writes performed');
 else console.log('[schema-audit] PASS: isolated sheet headers match expected positions; no writes performed');
}
if(require.main===module)main().catch(e=>{console.error('[schema-audit] FAIL:',e.message);process.exitCode=1;});
module.exports={audit,EXPECTED};
