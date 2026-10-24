const {test}=require('node:test'),assert=require('node:assert/strict');
const Dice=require('../public/dice');
const setup=(overrides={})=>({player:'Player',name:'',pools:[{count:1,sides:20}],modifier:0,mode:'normal',exploding:false,alerts:true,...overrides});
const result=(overrides={})=>({player:'Player',name:'',mode:'normal',modifier:0,exploding:false,alerts:true,sets:[[{sides:20,base:[20,1],extra:[]}]],...overrides});
test('engine normal multi-pool/modifier/crit both and alerts off',()=>{
 const values=[.999,0,.5];const d=Dice.generate(setup({pools:[{count:2,sides:20},{count:1,sides:6}],modifier:-3}),()=>values.shift());
 assert.equal(d.total,22);assert.equal(d.alert,'crit-both');assert.equal(d.critsCount,1);assert.equal(d.missesCount,1);
 assert.equal(Dice.canonical({...d,alerts:false}).alert,'normal');
});
test('engine advantage/disadvantage select whole set, ties keep first',()=>{
 const sets=[[{sides:20,base:[20],extra:[]}],[{sides:20,base:[1],extra:[]}]];
 assert.equal(Dice.canonical(result({mode:'advantage',sets})).kept,0);
 const d=Dice.canonical(result({mode:'disadvantage',sets,modifier:-2}));assert.equal(d.total,-1);assert.equal(d.alert,'crit-fail');
 assert.equal(Dice.canonical(result({mode:'advantage',sets:[sets[0],sets[0]]})).kept,0);
});
test('explosions generated and validated, chain budget cancels without unbounded loop',()=>{
 const vals=[.999,.999,0];const d=Dice.generate(setup({exploding:true}),()=>vals.shift());
 assert.deepEqual(d.sets[0][0].extra,[20,1]);assert.equal(d.total,41);assert.equal(d.alert,'crit-both');
 let calls=0;assert.throws(()=>Dice.generate(setup({exploding:true}),()=>{calls++;return .999;}),/chain limit/);assert.equal(calls,32);
 for(const extra of [[],[20],[2,3]])assert.throws(()=>Dice.canonical(result({exploding:true,sets:[[{sides:20,base:[20],extra}]]})));
});
test('strict schema rejects strings, nonfinite, fractional, negative, oversized and mismatched pools',()=>{
 for(const count of [0,-1,1.5,101,'2',Infinity,NaN])assert.throws(()=>Dice.generate(setup({pools:[{count,sides:6}]})));
 for(const sides of [0,1,-2,1.5,10001,'6',Infinity])assert.throws(()=>Dice.generate(setup({pools:[{count:1,sides}]})));
 assert.throws(()=>Dice.generate(setup({pools:Array(9).fill({count:1,sides:6})})));
 assert.throws(()=>Dice.generate(setup({mode:'advantage',pools:[{count:100,sides:6},{count:1,sides:6}]})));
 for(const modifier of [NaN,Infinity,100001,'2',1.5])assert.throws(()=>Dice.generate(setup({modifier})));
 for(const input of [null,[],{},result({name:'x'.repeat(81)}),result({sets:[[{sides:20,base:['20'],extra:[]}]]}),result({sets:[[{sides:20,base:[1],extra:[2]}]]}),result({mode:'advantage',sets:[[{sides:20,base:[1],extra:[]}],[{sides:6,base:[1],extra:[]}]]})])assert.throws(()=>Dice.canonical(input));
});
test('expanded-roll budget bounds all pools and sets together',()=>{
 let calls=0;
 assert.throws(()=>Dice.generate(setup({pools:[{count:100,sides:2}],exploding:true}),()=>{calls++;return calls%5===0?0:.9;}),/Expanded/);
 assert.equal(calls,400);
 const p={sides:2,base:Array(100).fill(2),extra:Array(100).fill([2,2,2,1]).flat()};
 assert.throws(()=>Dice.canonical(result({exploding:true,sets:[[p]]})),/expanded/);
});
