// DOM simulation only: no native browser binary/module was available.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const fs=require('node:fs'),path=require('node:path');
const publicDir=path.resolve(__dirname,'../public');
function boot(t,stored={}){
 const dom=new JSDOM(fs.readFileSync(path.join(publicDir,'index.html'),'utf8'),{url:'http://127.0.0.1/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,handlers={},sent=[],errors=[];
 w.io=()=>({on:(e,f)=>handlers[e]=f,emit:(e,d)=>sent.push([e,d])});w.alert=x=>errors.push(x);
 // Bound the observer too: old exploding-d1 code must never spin without a fixture budget.
 let randomCalls=0;w.Math.random=()=>{if(++randomCalls>64)throw Error('Fixture random budget exhausted');return 0.5;};
 for(const [k,v]of Object.entries(stored))w.localStorage.setItem(k,v);
 for(const script of w.document.querySelectorAll('script')){
  const src=script.getAttribute('src');if(src&&src.startsWith('/socket.io/'))continue;
  w.eval(src?fs.readFileSync(path.join(publicDir,src),'utf8'):script.textContent);
 }
 w.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {w,d:w.document,handlers,sent,errors};
}
const payload=()=>({player:'<img src=x onerror=alert(1)>',name:'<svg/onload=alert(1)>',mode:'normal',modifier:2,exploding:false,alerts:true,sets:[[{sides:20,base:[20],extra:[]}]],htmlDetails:'<img src=x onerror=alert(2)>',title:'<svg/onload=alert(3)>',total:999});
test('incoming malicious text remains text in latest result and history; no HTML sink',t=>{
 const {d,handlers}=boot(t);handlers.broadcastRoll(payload());handlers.initialHistory([payload()]);
 assert.equal(d.querySelectorAll('#resultLabel img,#historyList img,#breakdown img,#resultLabel svg,#historyList svg').length,0);
 assert.ok(d.querySelector('#resultLabel').textContent.includes('<img'));assert.equal(d.querySelector('#totalScore').textContent,'22');
 assert.ok(d.querySelector('#breakdown .crit-success-text'));assert.equal(d.querySelector('#clearHistoryBtn')?.disabled??true,true);
});
test('reviewed history layout containment and Node 24 support remain explicit',t=>{
 const {d,handlers}=boot(t);handlers.broadcastRoll(payload());
 const info=d.querySelector('.history-item').firstElementChild;
 assert.equal(info.style.minWidth,'0');assert.equal(info.style.overflow,'hidden');assert.equal(info.style.textOverflow,'ellipsis');
});
test('Node 24 support is declared',()=>{
 assert.equal(require('../package.json').engines?.node,'24.x');
});
test('malformed storage and wrong-shaped presets cannot break initialization',t=>{
 for(const stored of ['{','{}','[null,{"name":"x"}]']){const {d}=boot(t,{savedMultiPresetsProV6:stored});assert.equal(d.querySelectorAll('.dice-pool-row').length,1);}
});
test('presets keep legacy key/setup but render malicious names as text',t=>{
 const preset={name:'<img src=x onerror=alert(1)>',pools:[{count:2,sides:6,selectVal:'6'}],mod:-2,mode:'advantage',exploding:false,alerts:true};
 const {d,w}=boot(t,{savedMultiPresetsProV6:JSON.stringify([preset]),diceUsername:'Player'});
 assert.equal(d.querySelectorAll('#presetContainer img').length,0);d.querySelector('.preset-info').click();
 assert.equal(d.querySelector('.pool-count').value,'2');assert.equal(d.querySelector('#modifier').value,'-2');assert.equal(d.querySelector('#username').value,'Player');
 d.querySelector('#savePresetBtn').click();assert.equal(JSON.parse(w.localStorage.getItem('savedMultiPresetsProV6')).length,2);
});
test('invalid custom d1 and fractional input rejected; valid multi-pool advantage emits structured numeric sets',t=>{
 const {d,w,sent}=boot(t);const select=d.querySelector('.pool-size-select');select.value='custom';d.querySelector('.custom-sides-input').value='1';d.querySelector('#enableExploding').checked=true;d.querySelector('#rollBtn').click();assert.equal(sent.length,0);
 d.querySelector('.custom-sides-input').value='6';d.querySelector('.pool-count').value='1.5';d.querySelector('#rollBtn').click();assert.equal(sent.length,0);
 d.querySelector('.pool-count').value='1';d.querySelector('#enableExploding').checked=false;d.querySelector('#addPoolBtn').click();d.querySelector('[data-mode=advantage]').click();w.Math.random=()=>0.5;d.querySelector('#rollBtn').click();
 assert.equal(sent.length,1);assert.equal(sent[0][0],'playerRoll');assert.equal(sent[0][1].sets.length,2);assert.equal(sent[0][1].sets[0].length,2);assert.equal(sent[0][1].htmlDetails,undefined);
});
