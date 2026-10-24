const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const {createDiceServer}=require('../server');
const publicDir=path.resolve(__dirname,'../public');
function boot(t){
 const dom=new JSDOM(fs.readFileSync(path.join(publicDir,'index.html'),'utf8'),{url:'http://127.0.0.1/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,handlers={},sent=[],alerts=[],timers=[];
 w.io=()=>({connected:true,on:(e,f)=>handlers[e]=f,emit:(...args)=>sent.push(args)});w.alert=x=>alerts.push(x);
 w.eval(fs.readFileSync(path.join(publicDir,'dice.js'),'utf8'));w.eval(fs.readFileSync(path.join(publicDir,'app.js'),'utf8'));
 w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};w.clearTimeout=()=>{};
 return {w,d:w.document,handlers,sent,alerts,timers};
}
test('roll feedback distinguishes pending, accepted, rejected, timeout and disconnect without alerts',t=>{
 const {d,handlers,sent,alerts,timers}=boot(t),button=d.querySelector('#rollBtn');
 button.click();assert.equal(d.querySelector('#rollStatus')?.dataset.state,'pending');assert.equal(button.disabled,true);
 assert.equal(typeof sent[0][2],'function');sent[0][2]({ok:true});assert.equal(d.querySelector('#rollStatus').dataset.state,'accepted');assert.equal(button.disabled,false);
 button.click();sent[1][2]({ok:false,reason:'rate-limit'});assert.equal(d.querySelector('#rollStatus').dataset.state,'failed');assert.match(d.querySelector('#rollStatus').textContent,/rate limit/i);
 button.click();assert.equal(timers.at(-1).ms,5000);timers.at(-1).fn();assert.match(d.querySelector('#rollStatus').textContent,/not confirmed/i);sent[2][2]({ok:true});assert.equal(d.querySelector('#rollStatus').dataset.state,'failed');
 button.click();handlers.disconnect();assert.match(d.querySelector('#rollStatus').textContent,/disconnect/i);assert.equal(button.disabled,false);
 for(let i=0;i<30;i++)handlers.rollRejected?.('attacker');assert.deepEqual(alerts,[]);
});
async function until(fn){const end=Date.now()+2500;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('feedback integration timeout');}
test('default 21st UI roll gets bounded rate feedback, does not replace accepted history',async t=>{
 const app=createDiceServer();let w;
 t.after(async()=>{if(w){w.eval('socket.disconnect()');w.close();}await new Promise(r=>app.io.close(r));});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const dom=await JSDOM.fromURL('http://127.0.0.1:'+app.server.address().port,{resources:'usable',runScripts:'dangerously',beforeParse(win){win.alert=()=>assert.fail('unexpected alert');}});w=dom.window;
 await until(()=>w.document.querySelector('.pool-count')&&w.eval('socket.connected'));
 const d=w.document;
 for(let i=0;i<20;i++){d.querySelector('#rollBtn').click();await until(()=>d.querySelectorAll('.history-item').length===i+1);}
 d.querySelector('#rollBtn').click();await until(()=>d.querySelector('#rollStatus')?.dataset.state==='failed');assert.match(d.querySelector('#rollStatus').textContent,/rate limit/i);assert.equal(d.querySelectorAll('.history-item').length,20);
 // The first over-budget attempt already consumed the single rate-limit reply allowance.
 let replies=0;w.testAck=()=>replies++;w.eval("for(let i=0;i<5;i++)socket.emit('playerRoll',{},window.testAck)");await new Promise(r=>setTimeout(r,80));assert.equal(replies,0);
});
