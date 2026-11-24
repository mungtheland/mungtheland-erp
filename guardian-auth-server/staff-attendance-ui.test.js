'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');

const html=readFileSync(join(__dirname,'staff-local-test.html'),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm,'');
const date='2026-11-24';
const otherDate='2026-11-25';

class Element{
 children=[];dataset={};value='';hidden=false;
 set textContent(value){this.children=[];this.text=value;}
 get textContent(){return this.text;}
 append(...elements){this.children.push(...elements);}
 replaceChildren(){this.textContent='';}
}

test('attendance cards isolate detail errors and synchronize summary, filters and transitions',async()=>{
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,new Element());
  return elements.get(id);
 };
 const bookings=['RSV-HTTP','RSV-NETWORK','RSV-RECOVER','RSV-OTHER'].map(bookingId=>({
  bookingId,visitDate:bookingId==='RSV-OTHER'?otherDate:date,status:'예약'
 }));
 const combined=bookings.map(({bookingId})=>({
  bookingId,attendanceState:bookingId==='RSV-RECOVER'?null:'예약',attendanceError:bookingId==='RSV-RECOVER'
 }));
 const response=(body,status=200)=>({ok:status===200,status,json:async()=>body});
 let state='등원 중';
 const fetch=async(url,options)=>{
  if(url==='/api/staff/bookings')return response({bookings,combined});
  if(url.endsWith('/arrival-request'))return response({request:null});
  if(url.endsWith('/RSV-HTTP/attendance'))return response({},503);
  if(url.endsWith('/RSV-NETWORK/attendance'))throw Error('Network failure');
  if(url.endsWith('/RSV-RECOVER/attendance/check-out')){
   assert.equal(options.method,'POST');state='하원 완료';return response({attendance:{state}});
  }
  if(url.endsWith('/RSV-RECOVER/attendance'))return response({attendance:{state}});
  if(url.endsWith('/RSV-OTHER/attendance'))return response({attendance:{state:'예약'}});
  assert.fail('Unexpected request '+url);
 };
 vm.runInNewContext(script,{
  document:{getElementById:element,createElement:()=>new Element()},
  initializeApp:()=>({}),getAuth:()=>({currentUser:{getIdToken:async()=>'mock'}}),fetch
 });
 const visitDate=element('visit-date'),filter=element('attendance-filter');
 const cards=()=>element('booking-list').children;
 const summary=()=>Object.fromEntries(element('booking-summary').children.map(
  ({children:[label,value]})=>[label.textContent,Number(value.textContent)]
 ));
 visitDate.value=date;filter.value='all';
 await element('list').onclick();
 assert.equal(cards().length,3);
 const [http,network,recovered]=cards();
 assert.match(http.children[6].textContent,/HTTP 503/);
 assert.match(network.children[6].textContent,/출석 조회 중 오류 발생/);
 for(const card of [http,network]){
  assert.equal(card.children[2].textContent,'등하원: 출석 기록 확인 필요');
  assert.equal(card.children[7].disabled,true);
  assert.equal(card.children[8].disabled,true);
 }
 assert.equal(recovered.children[2].textContent,'등하원: 등원 중');
 assert.deepEqual(summary(),{'전체 예약':3,'미등원':0,'등원 중':1,'하원 완료':0,'출석 확인 필요':2,'직원 확인 대기':0});
 const search=element('booking-search');
 search.value='rsv-network';search.oninput();
 assert.deepEqual(cards().map(card=>Boolean(card.hidden)),[true,false,true]);
 search.value='';search.oninput();
 filter.value='등원 중';filter.onchange();
 assert.deepEqual(cards().map(card=>Boolean(card.hidden)),[true,true,false]);
 assert.equal(recovered.children[8].disabled,false);
 await recovered.children[8].onclick();
 assert.equal(recovered.children[2].textContent,'등하원: 하원 완료');
 assert.equal(recovered.children[8].disabled,true);
 assert.equal(Boolean(recovered.hidden),true);
 assert.deepEqual(summary(),{'전체 예약':3,'미등원':0,'등원 중':0,'하원 완료':1,'출석 확인 필요':2,'직원 확인 대기':0});
 visitDate.value=otherDate;filter.value='all';await visitDate.onchange();
 assert.equal(cards().length,1);
 assert.match(cards()[0].children[1].textContent,/RSV-OTHER/);
 assert.deepEqual(summary(),{'전체 예약':1,'미등원':1,'등원 중':0,'하원 완료':0,'출석 확인 필요':0,'직원 확인 대기':0});
});
