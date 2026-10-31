const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const files=fs.readdirSync('src');
for(const name of files.filter(n=>n.endsWith('.js'))){
  new vm.Script(fs.readFileSync(path.join('src',name),'utf8'),{filename:name});
}
for(const name of files.filter(n=>n.endsWith('.html'))){
  const html=fs.readFileSync(path.join('src',name),'utf8');
  const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((script,i)=>new vm.Script(script[1],{filename:name+':script'+i}));
}
console.log('PASS: all Apps Script JS and HTML inline scripts parse');
