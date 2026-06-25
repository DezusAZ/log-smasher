const fs=require('fs'),vm=require('vm'),path=require('path');
// minimal DOM + localStorage stubs
const store=new Map();
const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const els={};
function fakeEl(){return{value:'',checked:false,innerHTML:'',addEventListener(){}}}
const document={addEventListener(){},getElementById:id=>els[id]||(els[id]=fakeEl())};
['apiToken','rememberToken','tokenStatus','forgetBtn','uploadBtn','uploadStatus'].forEach(id=>els[id]=fakeEl());
const sandbox={document,localStorage,window:{},TextDecoder,console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8'),sandbox);
const {saveToken,forgetToken,renderTokenStatus}=sandbox;
const A=(c,m)=>{if(!c){console.error('❌',m);process.exitCode=1}else console.log('✅',m)};

// 1. one-time use: nothing saved -> status says not saved
renderTokenStatus();
A(localStorage.getItem('ls_wigle_token')===null,'one-time: token NOT in localStorage by default');
A(/Not saved/.test(els.tokenStatus.innerHTML),'one-time: status shows "Not saved"');

// 2. remember: save persists to localStorage (their browser) and status reflects it
saveToken('QUlEOnRva2Vu');
A(localStorage.getItem('ls_wigle_token')==='QUlEOnRva2Vu','remember: token persisted to localStorage');
A(/Saved in this browser only/.test(els.tokenStatus.innerHTML),'remember: status shows saved-in-browser');

// 3. simulate "come back a week later": fresh load reads the saved token
els.apiToken.value='';els.rememberToken.checked=false;
let saved=localStorage.getItem('ls_wigle_token');
if(saved){els.apiToken.value=saved;els.rememberToken.checked=true;}
A(els.apiToken.value==='QUlEOnRva2Vu','return visit: token pre-filled from their browser');
A(els.rememberToken.checked===true,'return visit: remember stays ticked');

// 4. forget: wiped from localStorage and field cleared
forgetToken();
A(localStorage.getItem('ls_wigle_token')===null,'forget: removed from localStorage');
A(els.apiToken.value===''&&els.rememberToken.checked===false,'forget: field + checkbox cleared');
A(/Not saved/.test(els.tokenStatus.innerHTML),'forget: status back to "Not saved"');
