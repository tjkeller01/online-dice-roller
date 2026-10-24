const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');
const {io:client}=require('socket.io-client');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const once=(s,event)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('timeout '+event)),1500);s.once(event,x=>{clearTimeout(t);resolve(x)});});
async function fixture(t,options={}){
 const filename=path.resolve(__dirname,'../server.js');
 let src=fs.readFileSync(filename,'utf8');
 let app;
 if(src.includes('createDiceServer')) app=require(filename).createDiceServer(options);
 else {
  // Original entrypoint is evaluated without its listen call, then bound ONLY to loopback.
  src=src.replace(/server\.listen\(PORT,[\s\S]*$/, 'module.exports={server,io};');
  const context={require:createRequire(filename),__dirname:path.dirname(filename),module:{exports:{}},console:{log(){}},process};
  vm.runInNewContext(src,context,{filename});app=context.module.exports;
 }
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const sockets=[];t.after(async()=>{sockets.forEach(s=>s.disconnect());await new Promise(r=>app.io.close(r));});
 async function connect(){const s=client('http://127.0.0.1:'+app.server.address().port,{transports:['websocket'],reconnection:false});sockets.push(s);const h=once(s,'initialHistory');await once(s,'connect');return {s,history:await h};}
 return {app,connect};
}
function roll(overrides={}) {return {player:'Player',name:'Attack',mode:'normal',modifier:2,exploding:false,alerts:true,sets:[[{sides:20,base:[20],extra:[]}]],...overrides};}
async function send(s,data){const p=once(s,'broadcastRoll');s.emit('playerRoll',data);return p;}
test('schema rejects arbitrary HTML/malformed data without broadcast or history',async t=>{
 const {connect}=await fixture(t);const {s}=await connect();let broadcasts=0;s.on('broadcastRoll',()=>broadcasts++);
 for(const bad of [{htmlDetails:'<img src=x onerror=alert(1)>'},null,roll({sets:[[{sides:1,base:[1],extra:[]}]]}),roll({sets:[[{sides:20,base:[21],extra:[]}]]}),roll({modifier:1.5}),roll({mode:'bogus'})]) s.emit('playerRoll',bad);
 await delay(100);assert.equal(broadcasts,0);const p=once(s,'initialHistory');s.emit('requestSync');assert.deepEqual(await p,[]);
});
test('known numeric fields canonicalized; totals, crits and kept set derived',async t=>{
 const {connect}=await fixture(t);const {s}=await connect();
 const data=await send(s,roll({htmlDetails:'<svg/onload=alert(1)>',total:-999,alert:'wrong',unknown:'drop'}));
 assert.equal(data.total,22);assert.equal(data.critsCount,1);assert.equal(data.alert,'crit-success');assert.equal(data.htmlDetails,undefined);assert.equal(data.unknown,undefined);assert.equal(data.title,'Attack [1d20 + 2]');
 const adv=await send(s,roll({mode:'advantage',sets:[[{sides:20,base:[1],extra:[]}],[{sides:20,base:[20],extra:[]}]]}));
 assert.equal(adv.total,22);assert.equal(adv.kept,1);assert.equal(adv.missesCount,0);
});
test('anonymous clear denied and reconnect retains bounded canonical history',async t=>{
 const {connect}=await fixture(t,{rateLimit:100});const {s}=await connect();
 for(let i=0;i<52;i++)await send(s,roll({name:'Roll '+i,htmlDetails:'unsafe'}));
 let cleared=false;s.on('historyCleared',()=>cleared=true);s.emit('clearSharedHistory');await delay(60);
 const {history}=await connect();assert.equal(cleared,false);assert.equal(history.length,50);assert.equal(history[0].name,'Roll 51');assert.equal(history[49].name,'Roll 2');assert.equal(history[0].htmlDetails,undefined);
});
test('small combined rate budget limits rolls/sync/invalid events and recovers',async t=>{
 const {connect}=await fixture(t,{rateLimit:3,rateWindowMs:120});const {s}=await connect();
 await send(s,roll());s.emit('playerRoll',null);const sync=once(s,'initialHistory');s.emit('requestSync');await sync;
 let broadcasts=0;s.on('broadcastRoll',()=>broadcasts++);s.emit('playerRoll',roll());await delay(50);assert.equal(broadcasts,0);
 await delay(100);await send(s,roll());assert.equal(broadcasts,1);
});
test('transport message size cap disconnects oversized message; later valid client works',async t=>{
 const {connect}=await fixture(t);const {s}=await connect();const disconnected=once(s,'disconnect');s.emit('playerRoll',roll({unknown:'x'.repeat(33000)}));await disconnected;
 const other=await connect();assert.equal(other.history.length,0);assert.equal((await send(other.s,roll())).total,22);
});
module.exports={fixture,roll,send,once,delay};
