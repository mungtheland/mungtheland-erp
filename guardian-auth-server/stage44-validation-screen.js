'use strict';

const {randomBytes}=require('node:crypto');

const title='44단계 출석 저장 검증';
const html=`<!doctype html>
<html lang="ko"><meta charset="utf-8"><title>${title}</title>
<h1>${title}</h1>
<form id="mapping">
  <label>기존 직원 이메일 또는 UID <input id="identifier" required autocomplete="off"></label>
  <label>승인된 직원 ID <input id="staff" required autocomplete="off"></label>
  <button>계정 확인</button>
</form>
<form id="login" hidden>
  <label>Firebase 비밀번호 <input id="password" type="password" required autocomplete="off"></label>
  <button>로그인 및 승인된 출석 검증</button>
</form>
<p id="result" role="status"></p>
<script type="module" src="/client.js"></script></html>`;

function clientScript(firebaseConfig,nonce){
  return `import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,inMemoryPersistence,setPersistence,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const auth=getAuth(initializeApp(${JSON.stringify(firebaseConfig)}));
const nonce=${JSON.stringify(nonce)};
await setPersistence(auth,inMemoryPersistence);
const field=id=>document.getElementById(id);
const show=message=>{field('result').textContent=message;};
const post=(path,options={})=>fetch(path,{
  ...options,method:'POST',headers:{...options.headers,'X-ERP-Nonce':nonce}
});
let email;
field('mapping').onsubmit=async event=>{
  event.preventDefault();
  try{
    const response=await post('/prepare',{
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({identifier:field('identifier').value.trim(),staffId:field('staff').value.trim()})
    });
    if(!response.ok){show((await response.json()).code);return;}
    ({email}=await response.json());
    field('mapping').reset();
    field('mapping').hidden=true;
    field('login').hidden=false;
    show('계정 확인 완료. 기존 비밀번호를 입력하세요.');
  }catch{show('계정 확인 요청 실패');}
};
field('login').onsubmit=async event=>{
  event.preventDefault();
  const password=field('password').value;
  field('password').value='';
  try{
    await signInWithEmailAndPassword(auth,email,password);
  }catch{show('Firebase 로그인 실패');return;}
  try{
    const response=await post('/run',{headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken()}});
    const result=await response.json();
    show(response.ok?result.outcome:result.code);
  }catch{show('실행 응답 확인 실패');}
  finally{await signOut(auth);}
};
`;
}

function createStage44ValidationScreen({firebaseConfig,origin,prepare,authenticate,execute,log=()=>{}}){
  const nonce=randomBytes(24).toString('hex');
  const client=clientScript(firebaseConfig,nonce);
  const host=new URL(origin).host;
  let started=false;
  return async(req,res)=>{
    const send=(status,type,body)=>{
      res.writeHead(status,{
        'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; script-src 'self' https://www.gstatic.com; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; form-action 'self'; frame-ancestors 'none'"
      });
      res.end(body);
    };
    const json=(status,body)=>send(status,'application/json; charset=utf-8',JSON.stringify(body));
    const reject=(status,code)=>{log({status,code});json(status,{code});};
    if(req.headers.host!==host)return reject(403,'HOST_MISMATCH');
    if(req.method==='GET'&&req.url==='/')return send(200,'text/html; charset=utf-8',html);
    if(req.method==='GET'&&req.url==='/client.js')return send(200,'text/javascript; charset=utf-8',client);
    if(req.method!=='POST'||!['/prepare','/run'].includes(req.url))return reject(404,'ROUTE_NOT_FOUND');
    if(req.headers.origin!==origin)return reject(403,'ORIGIN_MISMATCH');
    if(req.headers['x-erp-nonce']!==nonce)return reject(403,'CONFIRMATION_MISMATCH');
    if(req.url==='/prepare'){
      try{
        let body='';
        for await(const bytes of req){
          body+=bytes;
          if(body.length>2048)return reject(400,'INVALID_PREPARE_INPUT');
        }
        return json(200,{email:await prepare(JSON.parse(body))});
      }catch{return reject(400,'PREPARE_FAILED');}
    }
    if(started)return reject(409,'RUN_ALREADY_STARTED');
    const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');
    if(!bearer)return reject(401,'AUTH_REQUIRED');
    started=true;
    try{
      const principal=await authenticate(bearer[1]);
      if(principal?.role!=='staff'||principal.status!=='active')throw Error('Staff required');
    }catch{
      started=false;
      return reject(403,'AUTH_FAILED');
    }
    log({status:200,code:'RUN_ENTERED'});
    try{return json(200,{outcome:await execute(req.headers.authorization)});}
    catch{return reject(500,'RUN_FAILED');}
  };
}

module.exports={createStage44ValidationScreen};
