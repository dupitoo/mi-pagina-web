(()=>{
'use strict';

const RELAYS=['wss://relay.damus.io','wss://nos.lol','wss://relay.snort.social','wss://relay.primal.net'];
const APP_TAG='dupi-chat-html-v2';
const PROFILE_KIND=30078;
const GIFT_WRAP_KIND=1059;
const GAME_PREFIX='__DUPI_GAME_V3__:';
const STORAGE_VERSION='v3';
const MAX_MESSAGES_PER_CHAT=500;

const $=id=>document.getElementById(id);
const mem={};
let N,pool;
let sk=null,pk=null,username='';
let currentPeer=null;
let contacts=new Map();
let messages=new Map();
let games=new Map();
let pendingInvites=new Map();
let seenWraps=new Set();
let profileSub=null,dmSub=null,presenceTimer=null;
let filterMode='all';
let historyLoading=false;

function storeGet(k){try{return localStorage.getItem(k)}catch{return mem[k]??null}}
function storeSet(k,v){try{localStorage.setItem(k,v)}catch{mem[k]=v}}
function storeDel(k){try{localStorage.removeItem(k)}catch{delete mem[k]}}
function storageKey(kind){return `dupi_chat_${kind}_${STORAGE_VERSION}_${pk}`}

function loadLib(){
  if(window.NostrTools)return start();
  let i=0;
  const urls=['https://unpkg.com/nostr-tools@2.23.5/lib/nostr.bundle.js','https://cdn.jsdelivr.net/npm/nostr-tools@2.23.5/lib/nostr.bundle.js'];
  const next=()=>{
    if(i>=urls.length){$('bootText').textContent='No pude cargar la red de mensajería. Revisa Internet y recarga.';return}
    const s=document.createElement('script');
    let done=false;
    const timer=setTimeout(()=>{if(done)return;done=true;try{s.remove()}catch{};next()},8000);
    s.src=urls[i++];s.async=true;
    s.onload=()=>{if(done)return;done=true;clearTimeout(timer);window.NostrTools?start():next()};
    s.onerror=()=>{if(done)return;done=true;clearTimeout(timer);next()};
    document.head.appendChild(s);
  };
  next();
}

function start(){
  if(window.__dupiStarted)return;
  window.__dupiStarted=true;
  N=window.NostrTools;
  if(!N?.SimplePool||!N?.nip17||!N?.generateSecretKey||!N?.getPublicKey||!N?.finalizeEvent){$('bootText').textContent='El motor cargó incompleto. Recarga la página.';return}
  pool=new N.SimplePool();
  if(!Promise.any){Promise.any=ps=>new Promise((resolve,reject)=>{let errors=[],left=0;for(const p of ps){left++;Promise.resolve(p).then(resolve,e=>{errors.push(e);if(!--left)reject(errors)})}if(!left)reject(errors)})}
  bindUI();
  if(loadIdentity())startApp();else $('registerModal').hidden=false;
  $('bootNote').classList.add('ok');
}

function hex(a){return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')}
function fromHex(s){if(!/^[0-9a-f]{64}$/i.test(s))throw new Error('bad key');return new Uint8Array(s.match(/.{2}/g).map(x=>parseInt(x,16)))}
function now(){return Math.floor(Date.now()/1000)}
function short(x){return x?x.slice(0,6):'------'}
function parseJson(s){try{return JSON.parse(s)}catch{return null}}
function initials(n){return(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const a=new Uint8Array(16);crypto.getRandomValues(a);return hex(a)}
function fmtTime(ts){return new Date(ts*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fmtDay(ts){const d=new Date(ts*1000),t=new Date();if(d.toDateString()===t.toDateString())return'HOY';const y=new Date();y.setDate(y.getDate()-1);return d.toDateString()===y.toDateString()?'AYER':d.toLocaleDateString()}
function toast(text,bad=false){const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=text;$('toasts').appendChild(d);setTimeout(()=>d.remove(),3400)}
function setNet(cls,text){$('netState').className='net '+cls;$('netState').querySelector('span').textContent=text}
function peerName(peer){return contacts.get(peer)?.username||'Usuario '+short(peer)}
function isOnline(c){return!!c?.lastSeen&&now()-c.lastSeen<150}

function saveIdentity(){storeSet('dupi_chat_identity',JSON.stringify({sk:hex(sk),username}))}
function loadIdentity(){const x=parseJson(storeGet('dupi_chat_identity')||'');if(!x?.sk||!x?.username)return false;try{sk=fromHex(x.sk);pk=N.getPublicKey(sk);username=x.username;return true}catch{return false}}

function saveMessages(){
  if(!pk)return;
  const obj={};
  for(const [peer,arr] of messages)obj[peer]=arr.slice(-MAX_MESSAGES_PER_CHAT);
  storeSet(storageKey('messages'),JSON.stringify(obj));
}
function loadMessages(){
  const obj=parseJson(storeGet(storageKey('messages'))||'{}')||{};
  messages=new Map();
  for(const [peer,arr] of Object.entries(obj))if(Array.isArray(arr))messages.set(peer,arr.slice(-MAX_MESSAGES_PER_CHAT));
}
function saveContacts(){
  if(!pk)return;
  const arr=[...contacts.values()].filter(c=>c.pubkey!==pk).slice(0,1000);
  storeSet(storageKey('contacts'),JSON.stringify(arr));
}
function loadContacts(){
  const arr=parseJson(storeGet(storageKey('contacts'))||'[]');
  if(!Array.isArray(arr))return;
  for(const c of arr){if(c?.pubkey&&c.pubkey!==pk)contacts.set(c.pubkey,c)}
}
function saveGames(){
  if(!pk)return;
  const obj={};for(const [peer,g] of games)obj[peer]=g;
  storeSet(storageKey('games'),JSON.stringify(obj));
  const inv={};for(const [peer,p] of pendingInvites)inv[peer]=p;
  storeSet(storageKey('game_invites'),JSON.stringify(inv));
}
function loadGames(){
  const obj=parseJson(storeGet(storageKey('games'))||'{}')||{};
  games=new Map(Object.entries(obj));
  const inv=parseJson(storeGet(storageKey('game_invites'))||'{}')||{};
  pendingInvites=new Map(Object.entries(inv));
  for(const [peer,p] of [...pendingInvites])if(!p?.createdAt||now()-p.createdAt>1800)pendingInvites.delete(peer);
}
function clearPrivateCache(){if(!pk)return;for(const k of ['messages','contacts','games','game_invites'])storeDel(storageKey(k))}

function addOrUpdateMessage(peer,msg){
  let arr=messages.get(peer)||[];
  const idx=arr.findIndex(m=>m.id===msg.id);
  if(idx>=0)arr[idx]={...arr[idx],...msg};else arr.push(msg);
  arr.sort((a,b)=>a.created_at-b.created_at);
  if(arr.length>MAX_MESSAGES_PER_CHAT)arr=arr.slice(-MAX_MESSAGES_PER_CHAT);
  messages.set(peer,arr);
  saveMessages();
}

async function publishEvent(ev){
  try{await Promise.any(pool.publish(RELAYS,ev));setNet('ok','Conectado');return true}
  catch{setNet('bad','Sin conexión');return false}
}

async function publishProfile(){
  if(!sk)return;
  const ev=N.finalizeEvent({kind:PROFILE_KIND,created_at:now(),tags:[['d','profile'],['t',APP_TAG]],content:JSON.stringify({username,lastSeen:now(),app:APP_TAG})},sk);
  await publishEvent(ev);ingestProfile(ev);
}
function ingestProfile(ev){
  if(ev.kind!==PROFILE_KIND||!ev.tags.some(t=>t[0]==='t'&&t[1]===APP_TAG))return;
  const d=parseJson(ev.content);if(!d?.username)return;
  const old=contacts.get(ev.pubkey);if(old&&old.eventTime>ev.created_at)return;
  contacts.set(ev.pubkey,{pubkey:ev.pubkey,username:String(d.username).slice(0,24),lastSeen:Number(d.lastSeen||ev.created_at),eventTime:ev.created_at});
  saveContacts();renderContacts();if(currentPeer===ev.pubkey)renderChatHeader();
}
async function refreshProfiles(){
  if(!sk)return;$('refreshBtn').disabled=true;
  try{const evs=await pool.querySync(RELAYS,{kinds:[PROFILE_KIND],'#t':[APP_TAG],limit:500});evs.forEach(ingestProfile);setNet('ok','Conectado')}
  catch{setNet('bad','No pude actualizar')}
  $('refreshBtn').disabled=false;
}
function subscribeProfiles(){try{profileSub?.close?.()}catch{}profileSub=pool.subscribe(RELAYS,{kinds:[PROFILE_KIND],'#t':[APP_TAG],since:now()-2592000},{onevent:ingestProfile})}

function peerFromRumor(r){if(r.pubkey===pk){const p=r.tags.find(t=>t[0]==='p'&&t[1]!==pk);return p?.[1]||null}return r.pubkey}
function targetOfWrap(w){return w.tags?.find(t=>t[0]==='p')?.[1]||null}

async function publishPrivate(peer,text){
  const wraps=N.nip17.wrapManyEvents(sk,[{publicKey:peer}],text);
  const outcomes=[];
  for(const w of wraps)outcomes.push({target:targetOfWrap(w),ok:await publishEvent(w),wrap:w});
  return {wraps,outcomes,recipientOk:outcomes.some(x=>x.target===peer&&x.ok),selfWrap:wraps.find(w=>targetOfWrap(w)===pk)||null};
}

async function ingestWrap(ev,{history=false}={}){
  if(seenWraps.has(ev.id))return;seenWraps.add(ev.id);
  try{
    const r=N.nip17.unwrapEvent(ev,sk);if(r.kind!==14)return;
    const peer=peerFromRumor(r);if(!peer||peer===pk)return;
    if(r.content.startsWith(GAME_PREFIX)){
      const p=parseJson(r.content.slice(GAME_PREFIX.length));if(p)handleGamePacket(p,peer,{history,fromSelf:r.pubkey===pk});
      return;
    }
    addOrUpdateMessage(peer,{id:r.id,sender:r.pubkey,text:r.content,created_at:r.created_at,status:'sent'});
    if(!contacts.has(peer))contacts.set(peer,{pubkey:peer,username:'Usuario '+short(peer),lastSeen:0,eventTime:0});
    saveContacts();renderContacts();if(currentPeer===peer)renderMessages();
  }catch{}
}
function subscribeDMs(){try{dmSub?.close?.()}catch{}dmSub=pool.subscribe(RELAYS,{kinds:[GIFT_WRAP_KIND],'#p':[pk],since:now()-2592000},{onevent:ev=>ingestWrap(ev,{history:false})})}
async function loadHistory(){
  historyLoading=true;
  try{const evs=await pool.querySync(RELAYS,{kinds:[GIFT_WRAP_KIND],'#p':[pk],limit:1500});evs.sort((a,b)=>a.created_at-b.created_at);for(const e of evs)await ingestWrap(e,{history:true})}catch{}
  historyLoading=false;saveMessages();saveGames();
}

async function sendMessage(){
  const text=$('messageInput').value.trim();if(!text||!currentPeer)return;if(text.length>4000)return toast('Mensaje demasiado largo',true);
  const peer=currentPeer;$('sendBtn').disabled=true;
  try{
    const wraps=N.nip17.wrapManyEvents(sk,[{publicKey:peer}],text);
    const selfWrap=wraps.find(w=>targetOfWrap(w)===pk);
    let localId=uuid(),created=now();
    if(selfWrap){try{const r=N.nip17.unwrapEvent(selfWrap,sk);localId=r.id;created=r.created_at}catch{}}
    addOrUpdateMessage(peer,{id:localId,sender:pk,text,created_at:created,status:'sending'});
    $('messageInput').value='';resizeComposer();renderMessages();renderContacts();
    let recipientOk=false;
    for(const w of wraps){const ok=await publishEvent(w);if(targetOfWrap(w)===peer&&ok)recipientOk=true}
    addOrUpdateMessage(peer,{id:localId,status:recipientOk?'sent':'failed'});
    if(!recipientOk)toast('El mensaje quedó guardado, pero no pude entregarlo todavía.',true);
    renderMessages();renderContacts();
  }catch{toast('No pude enviar. El mensaje no se perdió.',true)}
  $('sendBtn').disabled=false;
}

function latest(peer){const a=messages.get(peer)||[];return a[a.length-1]||null}
function renderContacts(){
  const q=$('search').value.trim().toLowerCase();
  let list=[...contacts.values()].filter(c=>c.pubkey!==pk);
  if(filterMode==='online')list=list.filter(isOnline);
  if(q)list=list.filter(c=>c.username.toLowerCase().includes(q)||c.pubkey.includes(q));
  list.sort((a,b)=>(latest(b.pubkey)?.created_at||0)-(latest(a.pubkey)?.created_at||0)||(b.lastSeen||0)-(a.lastSeen||0));
  $('contactList').innerHTML='';
  if(!list.length){$('contactList').innerHTML='<div class="empty-list"><strong>No hay usuarios todavía</strong>Comparte el enlace y toca ↻ cuando la otra persona entre.</div>';return}
  for(const c of list){
    const m=latest(c.pubkey),el=document.createElement('div');el.className='contact'+(currentPeer===c.pubkey?' active':'');
    const preview=m?((m.sender===pk?'Tú: ':'')+m.text):'@'+short(c.pubkey);
    el.innerHTML=`<div class="avatar">${esc(initials(c.username))}</div><div class="contact-main"><div class="row1"><b>${esc(c.username)}</b><time>${m?fmtTime(m.created_at):''}</time></div><div class="row2"><span class="preview">${esc(preview)}</span><span><i class="online-dot ${isOnline(c)?'on':''}"></i>${isOnline(c)?'online':''}</span></div></div>`;
    el.onclick=()=>openChat(c.pubkey);$('contactList').appendChild(el);
  }
}
function openChat(peer){
  currentPeer=peer;$('welcome').hidden=true;$('chat').classList.add('open');$('messageInput').disabled=false;$('sendBtn').disabled=false;$('gameBtn').disabled=false;
  renderContacts();renderChatHeader();renderMessages();
  const g=games.get(peer);if(g&&['active','waiting'].includes(g.status))requestGameSync(peer,g.match);
  const inv=pendingInvites.get(peer);if(inv&&now()-inv.createdAt<1800)setTimeout(()=>showIncomingInvite(peer,inv),50);
}
function renderChatHeader(){const c=contacts.get(currentPeer);if(!c)return;$('chatAvatar').textContent=initials(c.username);$('chatName').textContent=c.username;$('chatStatus').textContent=isOnline(c)?'en línea':'@'+short(c.pubkey)}
function renderMessages(){
  const box=$('messages'),arr=messages.get(currentPeer)||[];box.innerHTML='';let day='';
  for(const m of arr){
    const d=fmtDay(m.created_at);if(d!==day){day=d;const s=document.createElement('div');s.className='date-pill';s.textContent=d;box.appendChild(s)}
    const e=document.createElement('div');e.className='msg '+(m.sender===pk?'mine':'theirs');
    const tx=document.createElement('span');tx.textContent=m.text;
    const meta=document.createElement('span');meta.className='meta';
    const mark=m.sender===pk?(m.status==='failed'?' ⚠':m.status==='sending'?' …':' <span class="ticks">✓✓</span>'):'';
    meta.innerHTML=fmtTime(m.created_at)+mark;e.append(tx,meta);box.appendChild(e);
  }
  if(!arr.length){const s=document.createElement('div');s.className='date-pill';s.textContent='Inicio del chat';box.appendChild(s)}
  requestAnimationFrame(()=>box.scrollTop=box.scrollHeight);
}
function resizeComposer(){const t=$('messageInput');t.style.height='42px';t.style.height=Math.min(t.scrollHeight,120)+'px'}

async function register(){
  const name=$('usernameInput').value.trim().replace(/\s+/g,' ');$('registerErr').textContent='';
  if(name.length<2){$('registerErr').textContent='Pon al menos 2 letras.';return}
  sk=N.generateSecretKey();pk=N.getPublicKey(sk);username=name.slice(0,24);saveIdentity();$('registerModal').hidden=true;await startApp();
}
async function startApp(){
  $('meName').textContent=username;$('meAvatar').textContent=initials(username);setNet('','Conectando…');
  loadMessages();loadContacts();loadGames();
  contacts.set(pk,{pubkey:pk,username,lastSeen:now(),eventTime:now()});
  renderContacts();subscribeProfiles();subscribeDMs();
  await Promise.allSettled([publishProfile(),refreshProfiles(),loadHistory()]);
  clearInterval(presenceTimer);presenceTimer=setInterval(publishProfile,60000);renderContacts();if(currentPeer)renderMessages();
}

const gameName=t=>({ttt:'Tres en raya',rps:'Piedra, papel o tijera',c4:'Conecta 4'})[t]||'Juego';
const gameEmoji=t=>({ttt:'❌⭕',rps:'✊✋✌️',c4:'🔴🟡'})[t]||'🎮';
function randomMatch(){const a=new Uint8Array(10);crypto.getRandomValues(a);return hex(a)}
function closeGame(){$('gameOverlay').hidden=true}
function openGameOverlay(){$('gameOverlay').hidden=false}
function participants(g){return[g.host,g.guest]}
function scoreOf(g,id){return Number(g.scores?.[id]||0)}
function baseGame(type,peer,match,host,guest){
  const common={v:3,type,peer,match,host,guest,status:'active',round:1,seq:0,scores:{[host]:0,[guest]:0},updatedAt:now()};
  if(type==='ttt')return{...common,board:Array(9).fill(''),turn:host,over:false,winner:null,draw:false};
  if(type==='c4')return{...common,board:Array(42).fill(''),turn:host,over:false,winner:null,draw:false,winCells:[]};
  return{...common,choices:{[host]:null,[guest]:null},resolved:false,winner:null,draw:false};
}
function cloneGame(g){return JSON.parse(JSON.stringify(g))}
function saveGame(peer,g){games.set(peer,cloneGame(g));saveGames();if(currentPeer===peer&&$('gameOverlay')&&!$('gameOverlay').hidden)renderGame(g)}
async function sendGamePacket(peer,packet){
  const p={...packet,v:3,ts:now(),sender:pk};
  const res=await publishPrivate(peer,GAME_PREFIX+JSON.stringify(p));
  if(!res.recipientOk)toast('La jugada quedó guardada, pero el otro jugador parece desconectado.',true);
  return res.recipientOk;
}
function requestGameSync(peer,match){if(match)sendGamePacket(peer,{op:'sync-request',match})}
function gameSnapshot(g){return cloneGame(g)}
function handleGamePacket(p,peer,{history=false,fromSelf=false}={}){
  if(!p||p.v!==3||!p.op||!p.match)return;
  if(p.sender&&p.sender!==pk&&p.sender!==peer)return;
  let g=games.get(peer);
  if(p.op==='invite'){
    if(fromSelf){if(!g||g.match!==p.match){g={...baseGame(p.type,peer,p.match,pk,peer),status:'waiting',createdAt:p.ts};saveGame(peer,g)}return}
    const newer=g&&g.updatedAt&&(g.updatedAt>(p.ts||0));if(newer&&g.match!==p.match)return;
    const inv={match:p.match,type:p.type,host:peer,guest:pk,createdAt:p.ts||now()};pendingInvites.set(peer,inv);saveGames();
    if(!history&&!historyLoading&&currentPeer===peer)showIncomingInvite(peer,inv);else if(!history&&!historyLoading)toast(`${peerName(peer)} te invitó a ${gameName(p.type)} 🎮`);return;
  }
  if(p.op==='decline'){if(g&&g.match===p.match){g.status='declined';g.updatedAt=p.ts||now();saveGame(peer,g)}pendingInvites.delete(peer);saveGames();if(!history)toast(`${peerName(peer)} rechazó la invitación.`);return}
  if(p.op==='accept'){pendingInvites.delete(peer);saveGames();if(!g||g.match!==p.match)g=baseGame(p.type,peer,p.match,p.host||pk,p.guest||peer);g.status='active';g.updatedAt=p.ts||now();saveGame(peer,g);if(!history)toast(`${peerName(peer)} aceptó. ¡A jugar!`);return}
  if(p.op==='sync-request'){if(fromSelf)return;if(g&&g.match===p.match)sendGamePacket(peer,{op:'snapshot',match:g.match,type:g.type,state:gameSnapshot(g)});return}
  if(p.op==='snapshot'){if(!p.state||p.state.match!==p.match)return;const incoming=p.state;if(!g||g.match!==p.match||Number(incoming.seq||0)>=Number(g.seq||0)||Number(incoming.round||0)>Number(g.round||0)){incoming.peer=peer;saveGame(peer,incoming)}return}
  if(!g||g.match!==p.match)return;
  if(p.op==='state'){const s=p.state;if(!s||s.match!==g.match)return;if(Number(s.seq||0)>Number(g.seq||0)||Number(s.round||0)>Number(g.round||0)){s.peer=peer;saveGame(peer,s)}return}
  if(p.op==='rps-choice'){if(g.type!=='rps'||g.status!=='active'||p.round!==g.round||!['rock','paper','scissors'].includes(p.choice))return;if(!participants(g).includes(p.actor))return;if(!g.choices)g.choices={[g.host]:null,[g.guest]:null};if(!g.choices[p.actor])g.choices[p.actor]=p.choice;resolveRps(g);g.updatedAt=p.ts||now();saveGame(peer,g);return}
  if(p.op==='new-round'){if(p.round<=g.round)return;resetRound(g,p.round);saveGame(peer,g)}
}
function showGamePicker(){
  if(!currentPeer)return toast('Abre un chat primero.',true);
  const g=games.get(currentPeer),inv=pendingInvites.get(currentPeer);
  $('gameCard').innerHTML=`<div class="game-top"><h2>🎮 Juegos con ${esc(peerName(currentPeer))}</h2><button class="game-close" id="gc">×</button></div><p class="game-sub">Elige un juego. La invitación y las jugadas viajan por el mismo chat privado.</p>${inv?`<button class="game-action" id="pendingInvite" style="width:100%;margin-bottom:10px">📨 Ver invitación a ${esc(gameName(inv.type))}</button>`:''}${g&&['active','waiting'].includes(g.status)?'<button class="game-action ghost" id="resumeGame" style="width:100%;margin-bottom:12px">▶ Continuar partida actual</button>':''}<div class="game-grid"><button class="game-choice" data-g="ttt"><span class="gi">❌⭕</span><span><b>Tres en raya</b><small>Por turnos</small></span></button><button class="game-choice" data-g="rps"><span class="gi">✊✋✌️</span><span><b>Piedra, papel o tijera</b><small>Elección simultánea</small></span></button><button class="game-choice" data-g="c4"><span class="gi">🔴🟡</span><span><b>Conecta 4</b><small>Por turnos</small></span></button></div>`;
  openGameOverlay();$('gc').onclick=closeGame;document.querySelectorAll('.game-choice').forEach(b=>b.onclick=()=>inviteGame(b.dataset.g));if($('resumeGame'))$('resumeGame').onclick=()=>renderGame(g);if($('pendingInvite'))$('pendingInvite').onclick=()=>showIncomingInvite(currentPeer,inv);
}
async function inviteGame(type){const peer=currentPeer,match=randomMatch();const g=baseGame(type,peer,match,pk,peer);g.status='waiting';g.createdAt=now();g.updatedAt=now();saveGame(peer,g);renderGame(g);await sendGamePacket(peer,{op:'invite',match,type,host:pk,guest:peer})}
function showIncomingInvite(peer,inv){if(!inv||currentPeer!==peer)return;$('gameCard').innerHTML=`<div class="game-top"><h2>${gameEmoji(inv.type)} Invitación</h2><button class="game-close" id="gc">×</button></div><p class="game-sub"><b>${esc(peerName(peer))}</b> quiere jugar <b>${esc(gameName(inv.type))}</b> contigo.</p><div class="game-actions"><button class="game-action" id="acceptGame">Aceptar</button><button class="game-action ghost" id="declineGame">Ahora no</button></div>`;openGameOverlay();$('gc').onclick=closeGame;$('acceptGame').onclick=()=>acceptInvite(peer,inv);$('declineGame').onclick=()=>declineInvite(peer,inv)}
async function acceptInvite(peer,inv){pendingInvites.delete(peer);const g=baseGame(inv.type,peer,inv.match,inv.host,pk);g.status='active';saveGame(peer,g);renderGame(g);await sendGamePacket(peer,{op:'accept',match:g.match,type:g.type,host:g.host,guest:g.guest});await sendGamePacket(peer,{op:'snapshot',match:g.match,type:g.type,state:gameSnapshot(g)})}
async function declineInvite(peer,inv){pendingInvites.delete(peer);saveGames();closeGame();await sendGamePacket(peer,{op:'decline',match:inv.match,type:inv.type})}
function renderGame(g){if(!g)return showGamePicker();const meScore=scoreOf(g,pk),themScore=scoreOf(g,g.peer);let body='';if(g.status==='waiting')body=`<div class="game-status pulse">Esperando a que ${esc(peerName(g.peer))} acepte…</div>`;else if(g.status==='declined')body='<div class="game-status">Invitación rechazada.</div>';else if(g.type==='ttt')body=renderTtt(g);else if(g.type==='c4')body=renderC4(g);else body=renderRps(g);$('gameCard').innerHTML=`<div class="game-top"><h2>${gameEmoji(g.type)} ${esc(gameName(g.type))}</h2><button class="game-close" id="gc">×</button></div><div class="scoreline"><span>Tú: <b>${meScore}</b></span><span>${esc(peerName(g.peer))}: <b>${themScore}</b></span><span>Ronda ${g.round}</span></div>${body}<div class="game-actions"><button class="game-action ghost" id="syncGame">↻ Sincronizar</button><button class="game-action ghost" id="newGameInvite">Cambiar juego</button></div>`;openGameOverlay();$('gc').onclick=closeGame;$('syncGame').onclick=()=>{requestGameSync(g.peer,g.match);toast('Sincronizando partida…')};$('newGameInvite').onclick=showGamePicker;bindRenderedGame(g)}
function renderTtt(g){const status=gameStatusText(g),buttons=g.board.map((v,i)=>`<button data-cell="${i}" ${g.status!=='active'||g.over||g.turn!==pk||v?'disabled':''}>${v==='X'?'❌':v==='O'?'⭕':''}</button>`).join('');return `<div class="game-status">${esc(status)}</div><div class="ttt">${buttons}</div>${g.over?'<div class="game-actions"><button class="game-action" id="nextRound">Otra ronda</button></div>':''}`}
function renderC4(g){const status=gameStatusText(g),cells=g.board.map((v,i)=>`<button data-col="${i%7}" class="${v==='R'?'red':v==='Y'?'yellow':''} ${g.winCells?.includes(i)?'win':''}" ${g.status!=='active'||g.over||g.turn!==pk?'disabled':''}></button>`).join('');return `<div class="game-status">${esc(status)}</div><div class="c4">${cells}</div>${g.over?'<div class="game-actions"><button class="game-action" id="nextRound">Otra ronda</button></div>':''}`}
function renderRps(g){const my=g.choices?.[pk]||null,their=g.choices?.[g.peer]||null;let status='Elige tu jugada';if(my&&!their)status='Esperando la jugada del otro…';if(g.resolved)status=rpsResultText(g);const opts=[['rock','✊'],['paper','✋'],['scissors','✌️']].map(([k,e])=>`<button data-rps="${k}" class="${my===k?'sel':''}" ${my||g.resolved||g.status!=='active'?'disabled':''}>${e}</button>`).join('');const reveal=g.resolved?`<div class="rps-reveal"><span>${rpsEmoji(my)}</span><span>VS</span><span>${rpsEmoji(their)}</span></div>`:'';return `<div class="game-status">${esc(status)}</div><div class="rps">${opts}</div>${reveal}${g.resolved?'<div class="game-actions"><button class="game-action" id="nextRound">Otra ronda</button></div>':''}`}
function bindRenderedGame(g){if(g.type==='ttt')document.querySelectorAll('[data-cell]').forEach(b=>b.onclick=()=>tttMove(g,Number(b.dataset.cell)));if(g.type==='c4')document.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>c4Move(g,Number(b.dataset.col)));if(g.type==='rps')document.querySelectorAll('[data-rps]').forEach(b=>b.onclick=()=>rpsMove(g,b.dataset.rps));if($('nextRound'))$('nextRound').onclick=()=>newRound(g)}
function gameStatusText(g){if(g.status==='waiting')return'Esperando aceptación…';if(g.over){if(g.draw)return'Empate';return g.winner===pk?'¡Ganaste! 🎉':`${peerName(g.peer)} ganó esta ronda`}return g.turn===pk?'Tu turno':`Turno de ${peerName(g.peer)}`}
function markFor(g,id){if(g.type==='ttt')return id===g.host?'X':'O';return id===g.host?'R':'Y'}
function checkTtt(board){const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(const w of wins)if(board[w[0]]&&board[w[0]]===board[w[1]]&&board[w[1]]===board[w[2]])return w;return null}
async function tttMove(g,cell){if(g.status!=='active'||g.over||g.turn!==pk||g.board[cell])return;g.board[cell]=markFor(g,pk);const win=checkTtt(g.board);if(win){g.over=true;g.winner=pk;g.scores[pk]=(g.scores[pk]||0)+1}else if(g.board.every(Boolean)){g.over=true;g.draw=true}else g.turn=g.peer;g.seq++;g.updatedAt=now();saveGame(g.peer,g);await sendGamePacket(g.peer,{op:'state',match:g.match,type:g.type,state:gameSnapshot(g)})}
function checkC4(board){const dirs=[[1,0],[0,1],[1,1],[1,-1]];for(let r=0;r<6;r++)for(let c=0;c<7;c++){const v=board[r*7+c];if(!v)continue;for(const[dC,dR]of dirs){const cells=[];let ok=true;for(let k=0;k<4;k++){const cc=c+dC*k,rr=r+dR*k;if(cc<0||cc>=7||rr<0||rr>=6||board[rr*7+cc]!==v){ok=false;break}cells.push(rr*7+cc)}if(ok)return cells}}return null}
async function c4Move(g,col){if(g.status!=='active'||g.over||g.turn!==pk)return;let row=-1;for(let r=5;r>=0;r--)if(!g.board[r*7+col]){row=r;break}if(row<0)return;g.board[row*7+col]=markFor(g,pk);const win=checkC4(g.board);if(win){g.over=true;g.winner=pk;g.winCells=win;g.scores[pk]=(g.scores[pk]||0)+1}else if(g.board.every(Boolean)){g.over=true;g.draw=true}else g.turn=g.peer;g.seq++;g.updatedAt=now();saveGame(g.peer,g);await sendGamePacket(g.peer,{op:'state',match:g.match,type:g.type,state:gameSnapshot(g)})}
function rpsEmoji(x){return x==='rock'?'✊':x==='paper'?'✋':x==='scissors'?'✌️':'❔'}
function rpsWinner(a,b){if(a===b)return null;if((a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper'))return'first';return'second'}
function resolveRps(g){if(g.resolved)return;const a=g.choices?.[g.host],b=g.choices?.[g.guest];if(!a||!b)return;const w=rpsWinner(a,b);g.resolved=true;g.draw=!w;g.winner=w==='first'?g.host:w==='second'?g.guest:null;if(g.winner)g.scores[g.winner]=(g.scores[g.winner]||0)+1;g.over=true}
function rpsResultText(g){if(g.draw)return'Empate 🤝';return g.winner===pk?'¡Ganaste! 🎉':`${peerName(g.peer)} ganó esta ronda`}
async function rpsMove(g,choice){if(g.status!=='active'||g.resolved||g.choices?.[pk])return;g.choices[pk]=choice;resolveRps(g);g.updatedAt=now();saveGame(g.peer,g);await sendGamePacket(g.peer,{op:'rps-choice',match:g.match,type:g.type,round:g.round,actor:pk,choice})}
function resetRound(g,round){g.round=round;g.over=false;g.winner=null;g.draw=false;g.seq++;g.updatedAt=now();if(g.type==='ttt'){g.board=Array(9).fill('');g.turn=round%2===1?g.host:g.guest}else if(g.type==='c4'){g.board=Array(42).fill('');g.turn=round%2===1?g.host:g.guest;g.winCells=[]}else{g.choices={[g.host]:null,[g.guest]:null};g.resolved=false}}
async function newRound(g){resetRound(g,g.round+1);saveGame(g.peer,g);await sendGamePacket(g.peer,{op:'new-round',match:g.match,type:g.type,round:g.round});await sendGamePacket(g.peer,{op:'snapshot',match:g.match,type:g.type,state:gameSnapshot(g)})}

function bindUI(){
  $('registerBtn').onclick=register;$('usernameInput').onkeydown=e=>{if(e.key==='Enter')register()};
  $('refreshBtn').onclick=async()=>{await publishProfile();await refreshProfiles();toast('Usuarios actualizados')};
  $('search').oninput=renderContacts;
  document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');filterMode=b.dataset.filter;renderContacts()});
  $('sendBtn').onclick=sendMessage;$('messageInput').oninput=resizeComposer;$('messageInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}};
  $('backBtn').onclick=()=>{$('chat').classList.remove('open');closeGame()};
  $('emojiBtn').onclick=()=>{if(!$('messageInput').disabled){$('messageInput').value+=' 😊';resizeComposer();$('messageInput').focus()}};
  $('menuBtn').onclick=e=>{e.stopPropagation();$('menu').hidden=!$('menu').hidden};document.addEventListener('click',()=>$('menu').hidden=true);
  $('shareBtn').onclick=async()=>{try{navigator.share?await navigator.share({title:'Dupi Chat',text:'Únete a Dupi Chat',url:location.href}):await navigator.clipboard.writeText(location.href)}catch{}};
  $('copyIdBtn').onclick=async()=>{try{await navigator.clipboard.writeText(pk);toast('ID copiado')}catch{}};
  $('renameBtn').onclick=()=>{const n=prompt('Nuevo nombre:',username);if(n&&n.trim().length>1){username=n.trim().slice(0,24);saveIdentity();$('meName').textContent=username;$('meAvatar').textContent=initials(username);publishProfile()}};
  $('logoutBtn').onclick=()=>{if(confirm('¿Borrar la identidad y el historial local de este navegador?')){clearPrivateCache();storeDel('dupi_chat_identity');location.reload()}};
  $('gameBtn').onclick=showGamePicker;$('gameOverlay').onclick=e=>{if(e.target===$('gameOverlay'))closeGame()};
  window.addEventListener('online',()=>{setNet('','Reconectando…');publishProfile();refreshProfiles();if(currentPeer){const g=games.get(currentPeer);if(g)requestGameSync(currentPeer,g.match)}});
  window.addEventListener('offline',()=>setNet('bad','Sin Internet'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&sk){publishProfile();refreshProfiles();if(currentPeer){const g=games.get(currentPeer);if(g)requestGameSync(currentPeer,g.match)}}});
  if(window.visualViewport){const f=()=>document.documentElement.style.setProperty('--vvh',visualViewport.height+'px');visualViewport.addEventListener('resize',f);visualViewport.addEventListener('scroll',f);f()}
}

loadLib();
})();
