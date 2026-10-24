/* Shared numeric schema and bounded client dice engine. No HTML or code evaluation. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Dice=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const LIMITS=Object.freeze({pools:8,count:100,sides:10000,base:200,expanded:400,chain:32,modifier:100000,text:80,history:50,message:32768});
 const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 function text(v){if(typeof v!=='string'||v.length>LIMITS.text)throw Error('Text must be at most 80 characters');return v.trim();}
 function setup(input){
  if(!object(input)||!['normal','advantage','disadvantage'].includes(input.mode)||!integer(input.modifier,-LIMITS.modifier,LIMITS.modifier)||typeof input.exploding!=='boolean'||typeof input.alerts!=='boolean'||!Array.isArray(input.pools)||input.pools.length<1||input.pools.length>LIMITS.pools)throw Error('Invalid roll setup');
  const pools=input.pools.map(p=>{if(!object(p)||!integer(p.count,1,LIMITS.count)||!integer(p.sides,2,LIMITS.sides))throw Error('Dice require 1–100 dice and 2–10000 sides');return {count:p.count,sides:p.sides};});
  if(pools.reduce((n,p)=>n+p.count,0)*(input.mode==='normal'?1:2)>LIMITS.base)throw Error('Too many dice (200 across all sets)');
  return {pools,mode:input.mode,modifier:input.modifier,exploding:input.exploding,alerts:input.alerts};
 }
 function canonical(input){
  if(!object(input)||!Array.isArray(input.sets)||!Array.isArray(input.sets[0]))throw Error('Invalid roll data');
  const config=setup({...input,pools:input.sets[0].map(p=>({count:object(p)&&Array.isArray(p.base)?p.base.length:0,sides:object(p)?p.sides:0}))});
  if(input.sets.length!==(config.mode==='normal'?1:2))throw Error('Invalid sets');
  let expanded=0;
  const sets=input.sets.map(set=>{
   if(!Array.isArray(set)||set.length!==config.pools.length)throw Error('Invalid pools');
   return set.map((p,i)=>{
    const expected=config.pools[i];
    if(!object(p)||p.sides!==expected.sides||!Array.isArray(p.base)||p.base.length!==expected.count||!Array.isArray(p.extra)||p.extra.length>LIMITS.expanded)throw Error('Invalid dice');
    const values=p.base.concat(p.extra);expanded+=values.length;
    if(expanded>LIMITS.expanded||values.some(v=>!integer(v,1,p.sides)))throw Error('Invalid dice values or expanded limit exceeded');
    if(!config.exploding&&p.extra.length)throw Error('Unexpected explosions');
    if(config.exploding){let cursor=0;for(const v of p.base){if(v!==p.sides)continue;let next=v,chain=1;while(next===p.sides){if(cursor>=p.extra.length||chain++>=LIMITS.chain)throw Error('Invalid or excessive explosion chain');next=p.extra[cursor++];}}if(cursor!==p.extra.length)throw Error('Unexpected explosion dice');}
    return {sides:p.sides,base:p.base.slice(),extra:p.extra.slice()};
   });
  });
  const sums=sets.map(s=>s.reduce((n,p)=>n+p.base.concat(p.extra).reduce((a,b)=>a+b,0),config.modifier));
  const kept=config.mode==='normal'?0:config.mode==='advantage'?(sums[0]>=sums[1]?0:1):(sums[0]<=sums[1]?0:1);
  let critsCount=0,missesCount=0;
  if(config.alerts)for(const p of sets[kept])if(p.sides===20)for(const v of p.base.concat(p.extra)){if(v===20)critsCount++;if(v===1)missesCount++;}
  const name=text(input.name),player=text(input.player)||'Anonymous';
  let formula=config.pools.map(p=>`${p.count}d${p.sides}${config.exploding?'!':''}`).join(' + ');
  if(config.modifier)formula+=` ${config.modifier>=0?'+':'-'} ${Math.abs(config.modifier)}`;
  if(config.mode!=='normal')formula+=` (${config.mode})`;
  return {player,name,mode:config.mode,modifier:config.modifier,exploding:config.exploding,alerts:config.alerts,sets,kept,total:sums[kept],critsCount,missesCount,alert:critsCount&&missesCount?'crit-both':critsCount?'crit-success':missesCount?'crit-fail':'normal',title:name?`${name} [${formula}]`:formula};
 }
 function generate(input,random=Math.random){
  const config=setup(input);let expanded=0;
  function die(sides){if(++expanded>LIMITS.expanded)throw Error('Expanded dice limit reached; roll cancelled');const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw Error('Invalid random source');return Math.floor(r*sides)+1;}
  const sets=Array.from({length:config.mode==='normal'?1:2},()=>config.pools.map(p=>{
   const base=[],extra=[];for(let i=0;i<p.count;i++){let v=die(p.sides);base.push(v);let chain=1;while(config.exploding&&v===p.sides){if(chain++>=LIMITS.chain)throw Error('Explosion chain limit reached; roll cancelled');v=die(p.sides);extra.push(v);}}return {sides:p.sides,base,extra};
  }));
  return canonical({...config,player:input.player,name:input.name,sets});
 }
 return {LIMITS,setup,canonical,generate};
});
