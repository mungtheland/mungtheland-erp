/** Isolated Apps Script test fixtures. Only call from a SEPARATE test project. */
function mdGuardianRunIsolationSmokeTest_(){
 const book=mdGuardianTestBook_();
 if(book.getId()===MD_SPREADSHEET_ID)throw Error('Production target blocked');
 const required=['고객·반려견관리','예약·등하원관리','보호자등원요청'];
 const missing=required.filter(n=>!book.getSheetByName(n));
 if(missing.length)throw Error('Missing test sheets: '+missing.join(', '));
 const headers=mdGuardianTestSheet_('보호자등원요청').getRange(1,1,1,MD_GR_HEADERS_.length).getDisplayValues()[0];
 if(headers.some((h,i)=>h!==MD_GR_HEADERS_[i]))throw Error('Request sheet headers differ');
 const valid=mdValidateGuardianRequest_({mealTime:'12:30',foodBrought:'yes',mannerBelt:'na',condition:'normal',notes:'test'});
 if(valid.meal!=='12:30'||valid.belt!=='na')throw Error('Validation failed');
 let rejected=false;
 try{mdValidateGuardianRequest_({foodBrought:'yes',mannerBelt:'invalid',condition:'normal'});}catch(e){rejected=true;}
 if(!rejected)throw Error('Invalid belt not rejected');
 return {ok:true,testSpreadsheetId:book.getId(),checks:['isolated id','required sheets','headers','valid input','invalid belt rejection']};
}
