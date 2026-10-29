// Browser-like UI test in JSDOM. All Apps Script calls are mocked; no production data access.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('src/Index.html','utf8');
const errors=[],calls=[];
const dog={dogId:'DOG-UI',dogName:'테스트견',guardianName:'테스트 보호자'};
const pass={passId:'PASS-UI',dogId:'DOG-UI',productName:'주 2회',totalCount:3,remainingCount:2,usedCount:1,paymentStatus:'완료',status:'사용 가능',startDate:'2020-01-01',expiryDate:'2099-12-31'};
const history=[{at:'2026-10-29',type:'차감',bookingId:'RSV-UI',before:3,after:2,reason:''}];
const handlers={mdListDogs:()=>[dog],mdListPasses:()=>[pass],mdListBookings:()=>[],mdListDogBookings:()=>[],mdListBookingChoices:()=>[],mdPassHistory:()=>history};
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.invalid/',virtualConsole:vc,beforeParse(window){
 window.HTMLElement.prototype.scrollIntoView=function(){};
 const makeRunner=(success,failure)=>new Proxy({},{
  get(_,key){
   if(key==='withSuccessHandler')return cb=>makeRunner(cb,failure);
   if(key==='withFailureHandler')return cb=>makeRunner(success,cb);
   return (...args)=>{calls.push({method:String(key),args});if(!(key in handlers)){failure?.(new Error('Unexpected call '+String(key)));return;}success?.(handlers[key](...args));};
  }
 });
 window.google={script:{run:makeRunner(null,null)}};
 window.confirm=()=>true;
}});
const {document,Event}=dom.window;
function el(q){const x=document.querySelector(q);assert.ok(x,'Missing '+q);return x;}
el('[data-tab="passes"]').click();
assert.ok(el('#passes').classList.contains('active'),'Pass tab not active');
el('#passDogSearch').value='테스트';
el('#passDogSearch').dispatchEvent(new Event('input',{bubbles:true}));
assert.equal(el('#passDogSelect').options.length,2);
el('#passDogSelect').value='DOG-UI';
el('#passDogSelect').dispatchEvent(new Event('change',{bubbles:true}));
assert.equal(el('#passForm input[name="dogId"]').value,'DOG-UI');
el('#passRefresh').click();
assert.match(el('#passRows').textContent,/잔여 2 \/ 3회/);
assert.match(el('#passRows').textContent,/사용 가능/);
assert.ok(el('#passRows').querySelector('.pass-history')===null);
const historyButton=[...el('#passRows').querySelectorAll('button')].find(b=>b.textContent.includes('이력'));
assert.ok(historyButton);
historyButton.click();
assert.match(el('#passRows .pass-history').textContent,/RSV-UI/);
assert.match(el('#passRows .pass-history').textContent,/3 → 2회/);
historyButton.click();
assert.equal(el('#passRows .pass-history'),null);
assert.ok(calls.some(c=>c.method==='mdPassHistory'&&c.args[0]==='PASS-UI'));
assert.deepEqual(errors,[]);
console.log('PASS: UI tab, dog search, selection, pass lookup, status, history toggle (mocked)');
