const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const {createDiceServer}=require('../server');
async function until(fn){const end=Date.now()+2500;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error('DOM integration timeout');}
test('real HTTP scripts and Socket.IO connect two simulated DOM clients, roll and reconnect',async t=>{
 const app=createDiceServer();const windows=[],errors=[];
 t.after(async()=>{for(const w of windows){try{w.eval('socket.disconnect()');}catch{}w.close();}await new Promise(r=>app.io.close(r));});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.server.address().port;
 async function browser(){const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));const dom=await JSDOM.fromURL(url,{resources:'usable',runScripts:'dangerously',virtualConsole:console,beforeParse(w){w.alert=e=>errors.push(e);}});windows.push(dom.window);await until(()=>dom.window.document.querySelector('.pool-count')&&dom.window.eval('socket.connected'));return dom.window;}
 const first=await browser(),second=await browser();const d=first.document;
 first.Math.random=()=>0.999;d.querySelector('#username').value='<img src=x onerror=alert(1)>';d.querySelector('#presetName').value='Attack';d.querySelector('#modifier').value='3';d.querySelector('#rollBtn').click();
 await until(()=>second.document.querySelector('#totalScore').textContent==='23');
 assert.equal(second.document.querySelectorAll('#resultLabel img,#historyList img').length,0);assert.ok(second.document.querySelector('#resultLabel').textContent.includes('<img'));assert.ok(second.document.querySelector('#breakdown .crit-success-text'));
 first.eval('socket.disconnect()');first.eval('socket.connect()');await until(()=>first.eval('socket.connected')&&first.document.querySelectorAll('.history-item').length===1);
 // Shared history remains despite direct anonymous clear attempts.
 first.eval("socket.emit('clearSharedHistory')");const third=await browser();assert.equal(third.document.querySelectorAll('.history-item').length,1);
 assert.deepEqual(errors,[]);
});
