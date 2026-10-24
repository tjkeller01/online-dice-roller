/* All variable content is assigned through DOM properties/textContent, never HTML. */
'use strict';
const socket = io();
const $ = id => document.getElementById(id);
const KEY = 'savedMultiPresetsProV6';
let rollMode = 'normal', history = [], presets = [];
function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
}
function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { alert('Device storage unavailable; changes remain in this tab only.'); } }
function readPreset(p) {
    if (!p || typeof p.name !== 'string' || p.name.length > 80) throw Error('Invalid preset');
    const config = Dice.setup({pools:p.pools,modifier:p.mod,mode:p.mode,exploding:p.exploding ?? false,alerts:p.alerts ?? false});
    return {name:p.name,pools:config.pools.map(pool => ({...pool,selectVal:[4,6,8,10,12,20,100].includes(pool.sides)?String(pool.sides):'custom'})),mod:config.modifier,mode:config.mode,exploding:config.exploding,alerts:config.alerts};
}
try {
    const raw = storageGet(KEY);
    if (raw && raw.length <= 100000) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) for (const p of parsed.slice(0,50)) { try { presets.push(readPreset(p)); } catch {} }
    }
} catch { /* Corrupt saved data must not stop the roller. */ }
$('username').value = (storageGet('diceUsername') || 'Anonymous Player').slice(0,80);
$('username').maxLength = 80; $('presetName').maxLength = 80;
$('username').addEventListener('input', () => storageSet('diceUsername', $('username').value));
function createDicePoolRow(count=1, selectedSize='6', customSize='') {
    if ($('diceBuilderList').children.length >= Dice.LIMITS.pools) return;
    const row = node('div', undefined, 'dice-pool-row');
    const label = node('span','Roll');
    label.style.cssText = 'font-size:0.9rem;color:var(--muted-text);font-weight:bold';
    const amount = node('input'); amount.type='number';amount.className='pool-count';amount.value=count;amount.min=1;amount.max=100;
    const select = node('select',undefined,'pool-size-select');
    for (const sides of ['4','6','8','10','12','20','100','custom']) {
        const option=node('option',sides==='custom'?'Custom size...':'d'+sides);option.value=sides;select.append(option);
    }
    select.value=selectedSize;
    const custom=node('input');custom.type='number';custom.className='custom-sides-input';custom.placeholder='Sides';custom.min=2;custom.max=10000;custom.value=customSize;
    const toggle=()=>custom.style.display=select.value==='custom'?'block':'none';select.addEventListener('change',toggle);toggle();
    const remove=node('button','×','btn-icon delete-pool-row-btn');remove.type='button';remove.addEventListener('click',()=>{if($('diceBuilderList').children.length>1)row.remove();});
    row.append(label,amount,select,custom,remove);$('diceBuilderList').append(row);
}
function current() {
    const pools=Array.from(document.querySelectorAll('.dice-pool-row'),row=>({count:Number(row.querySelector('.pool-count').value),sides:Number(row.querySelector('.pool-size-select').value==='custom'?row.querySelector('.custom-sides-input').value:row.querySelector('.pool-size-select').value)}));
    // Empty input is invalid rather than silently substituted with a default.
    if (!$('modifier').value || Array.from(document.querySelectorAll('.pool-count,.custom-sides-input')).some(el=>el.classList.contains('pool-count')&&!el.value)) throw Error('Enter whole numbers');
    return Dice.setup({pools,modifier:Number($('modifier').value),mode:rollMode,exploding:$('enableExploding').checked,alerts:$('enableAlerts').checked});
}
function guarded(fn) { return () => {try {fn();} catch(e) {alert(e.message);} }; }
let pendingRoll = null;
function rollStatus(state, text) {
    $('rollStatus').dataset.state=state; $('rollStatus').textContent=text;
}
function finishRoll(attempt, state, text) {
    if (pendingRoll !== attempt) return;
    clearTimeout(attempt.timer); pendingRoll=null; $('rollBtn').disabled=false;
    rollStatus(state,text);
}
$('addPoolBtn').addEventListener('click',()=>createDicePoolRow());
document.querySelectorAll('.adv-btn').forEach(btn=>btn.addEventListener('click',()=>{
    rollMode=btn.dataset.mode;document.querySelectorAll('.adv-btn').forEach(b=>b.classList.toggle('active',b===btn));
}));
$('rollBtn').addEventListener('click',()=>{
    if (pendingRoll) return;
    try {
    if (!socket.connected && socket.connected !== undefined) throw Error('Disconnected; wait for reconnection before rolling.');
    const result=Dice.generate({...current(),name:$('presetName').value.trim(),player:$('username').value.trim()||'Anonymous'});
    // Only the schema's input fields travel to the server. Display fields are derived there.
    const {player,name,mode,modifier,exploding,alerts,sets}=result;
    const attempt={};pendingRoll=attempt;$('rollBtn').disabled=true;
    rollStatus('pending','Roll pending server confirmation. Latest live result below is the last received room roll.');
    attempt.timer=setTimeout(()=>finishRoll(attempt,'failed','Roll not confirmed within 5 seconds; it may have reached the room. Check history before retrying.'),5000);
    socket.emit('playerRoll',{player,name,mode,modifier,exploding,alerts,sets},reply=>{
        if(reply?.ok===true)finishRoll(attempt,'accepted','Roll accepted by the server.');
        else finishRoll(attempt,'failed',reply?.reason==='rate-limit'?'Roll rejected: rate limit reached. Wait up to 10 seconds before retrying. Latest result is unchanged by this attempt.':'Roll rejected by the server. Check the setup and limits.');
    });
    } catch(e) {
        if(pendingRoll)finishRoll(pendingRoll,'failed',e.message);
        else rollStatus('failed',e.message);
    }
});
socket.on('disconnect',()=>{if(pendingRoll)finishRoll(pendingRoll,'failed','Disconnected: roll not confirmed; check history after reconnecting before retrying.');});
function badge(parent,text,kind){parent.append(node('span',text,'badge '+kind));}
function badges(parent,data){
    if(data.exploding)badge(parent,'Exploding','exploding');
    if(data.critsCount)badge(parent,'NAT 20 x'+data.critsCount,'crit-hit');
    if(data.missesCount)badge(parent,'NAT 1 x'+data.missesCount,'crit-miss');
}
function diceValues(parent,values,sides,alerts) {
    for(const v of values){let cls='die-val';if(alerts&&sides===20)cls+=v===20?' crit-success-text':v===1?' crit-fail-text':'';parent.append(node('span',v,cls),document.createTextNode(' '));}
}
function poolLine(parent,p,alerts) {
    parent.append(node('strong',`${p.base.length}d${p.sides}`),document.createTextNode(': '));diceValues(parent,p.base,p.sides,alerts);
    if(p.extra.length){const extra=node('span');extra.style.cssText='color:#6c5ce7;font-weight:bold';extra.append(document.createTextNode('+ Exploded: ['));diceValues(extra,p.extra,p.sides,alerts);extra.append(document.createTextNode(']'));parent.append(extra);}
}
function breakdown(parent,data) {
    parent.replaceChildren();
    if(data.mode==='normal') {
        for(const p of data.sets[0]){const line=node('div',undefined,'pool-breakdown-line');poolLine(line,p,data.alerts);parent.append(line);}
        if(data.modifier)parent.append(node('div',`Mod: ${data.modifier>=0?'+':''}${data.modifier}`,'pool-breakdown-line'));
    } else {
        for(const index of [data.kept,1-data.kept]){
            const kept=index===data.kept;const line=node('div',undefined,'pool-breakdown-line'+(kept?'':' dropped'));
            if(kept)line.style.color='var(--success-color)';line.append(node('strong',kept?'Kept: ':'Dropped: '));
            data.sets[index].forEach((p,i)=>{if(i)line.append(document.createTextNode(' | '));poolLine(line,p,data.alerts);});
            if(kept&&data.modifier)line.append(document.createTextNode(` ${data.modifier>=0?'+':''}${data.modifier}`));parent.append(line);
        }
    }
}
function receive(input) {try {const result=Dice.canonical(input);result.time=typeof input.time==='string'?input.time.slice(0,32):'';return result;}catch{return null;} }
function latest(data){
    $('displayContainer').className='result-display';
    const glow={'crit-success':'crit-hit-glow','crit-fail':'crit-miss-glow','crit-both':'crit-both-glow'}[data.alert];if(glow)$('displayContainer').classList.add(glow);
    $('resultLabel').replaceChildren(node('span',data.player,'player-tag'),document.createTextNode(' rolled '+data.title+' '));badges($('resultLabel'),data);
    $('totalScore').textContent=data.total;breakdown($('breakdown'),data);
}
function renderHistory(){
    $('historyList').replaceChildren();
    if(!history.length){$('historyList').append(node('div','No rolls logged yet.'));return;}
    for(const item of history){
        const row=node('div',undefined,'history-item'+(item.alert==='normal'?'':' '+item.alert+'-card'));
        const info=node('div'),title=node('div');info.style.cssText='min-width:0;overflow:hidden;text-overflow:ellipsis';title.append(node('span',item.player,'player-tag'),document.createTextNode(': '),node('strong',item.title));badges(title,item);
        const details=node('div');breakdown(details,item);
        info.append(title,node('div',item.time+' • '+details.textContent,'history-meta'));
        const total=node('div',item.total);total.style.cssText='font-size:1.5rem;font-weight:bold;min-width:40px;text-align:right';total.style.color=item.alert==='crit-success'?'var(--crit-success)':item.alert==='crit-fail'?'var(--crit-fail)':'var(--accent-color)';
        row.append(info,total);$('historyList').append(row);
    }
}
socket.on('initialHistory',input=>{
    if(!Array.isArray(input))return;history=input.slice(0,50).map(receive).filter(Boolean);renderHistory();
    if(history.length)latest(history[0]);
    else {
        $('displayContainer').className='result-display';
        $('resultLabel').textContent='Waiting for a roll...';
        $('totalScore').textContent='--';$('breakdown').replaceChildren();
        if(!pendingRoll)rollStatus('idle','Room history is empty.');
    }
});
socket.on('broadcastRoll',input=>{const data=receive(input);if(!data)return;latest(data);history.unshift(data);history=history.slice(0,50);renderHistory();});

function renderPresets(){
    $('presetContainer').replaceChildren();
    if(!presets.length){$('presetContainer').append(node('div','No saved profiles.'));return;}
    presets.forEach((preset,index)=>{
        const row=node('div',undefined,'preset-row'),info=node('div',undefined,'preset-info');info.append(node('strong',preset.name));
        if(preset.mode!=='normal')badge(info,preset.mode.slice(0,3),preset.mode==='advantage'?'adv':'dis');if(preset.exploding)badge(info,'!','exploding');
        info.addEventListener('click',()=>{
            $('diceBuilderList').replaceChildren();preset.pools.forEach(p=>createDicePoolRow(p.count,p.selectVal,p.selectVal==='custom'?p.sides:''));
            $('modifier').value=preset.mod;rollMode=preset.mode;$('enableExploding').checked=preset.exploding;$('enableAlerts').checked=preset.alerts;$('presetName').value=preset.name;
            document.querySelectorAll('.adv-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===rollMode));
        });
        const remove=node('button','×','preset-delete');remove.addEventListener('click',()=>{presets.splice(index,1);storageSet(KEY,JSON.stringify(presets));renderPresets();});row.append(info,remove);$('presetContainer').append(row);
    });
}
$('savePresetBtn').addEventListener('click',guarded(()=>{
    if(presets.length>=50)throw Error('Maximum 50 saved setups');const config=current();let name=$('presetName').value.trim();
    if(!name)name=config.pools.map(p=>`${p.count}d${p.sides}`).join('+')+(config.modifier?`${config.modifier>=0?'+':''}${config.modifier}`:'');
    presets.push(readPreset({name,pools:config.pools,mod:config.modifier,mode:config.mode,exploding:config.exploding,alerts:config.alerts}));storageSet(KEY,JSON.stringify(presets));renderPresets();$('presetName').value='';
}));
createDicePoolRow(1,'20');renderPresets();
