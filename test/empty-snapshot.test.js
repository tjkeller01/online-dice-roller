const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),{createDiceServer}=require('../server');
async function until(fn){const end=Date.now()+3000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('restart integration timeout');}
test('reconnect to a restarted empty server clears history, latest result, breakdown and crit glow',async t=>{
 let app=createDiceServer(),w;
 t.after(async()=>{if(w){w.eval('socket.disconnect()');w.close();}await new Promise(r=>app.io.close(r));});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;
 const dom=await JSDOM.fromURL('http://127.0.0.1:'+port,{resources:'usable',runScripts:'dangerously',beforeParse(win){win.alert=()=>assert.fail('unexpected alert');}});w=dom.window;
 await until(()=>w.document.querySelector('.pool-count')&&w.eval('socket.connected'));
 w.Math.random=()=>0.999;w.document.querySelector('#rollBtn').click();
 await until(()=>w.document.querySelector('#totalScore').textContent==='20');assert.ok(w.document.querySelector('.crit-hit-glow'));
 w.eval('socket.disconnect()');await new Promise(r=>app.io.close(r));
 app=createDiceServer();await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 w.eval('socket.connect()');await until(()=>w.eval('socket.connected')&&w.document.querySelectorAll('.history-item').length===0);
 const d=w.document;assert.equal(d.querySelector('#totalScore').textContent,'--');assert.equal(d.querySelector('#resultLabel').textContent,'Waiting for a roll...');assert.equal(d.querySelector('#breakdown').textContent,'');assert.equal(d.querySelector('#displayContainer').className,'result-display');assert.match(d.querySelector('#historyList').textContent,/No rolls/);
});
