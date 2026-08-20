(()=>{
'use strict';

const V='v4';
const REACTION_PREFIX='__DUPI_REACT_V1__:';
const EMOJIS={
  '😀':['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','🤩','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫡','🤭','🫢','🫣','🤫','🤥','😶','🫠','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
  '❤️':['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','❣️','💌','💋','💯','💢','💥','💫','💦','💨','🕳️','💬','👁️‍🗨️','🗨️','🗯️','💭','💤'],
  '👍':['👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','🫵','✋','🤚','🖐️','🖖','👋','🤝','👏','🙌','🫶','👐','🤲','🙏','✍️','💪','🦾','🖕','👊','✊','🤛','🤜','🫷','🫸'],
  '🎉':['🎉','🎊','🎈','🎂','🎁','🏆','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🎮','🕹️','🎯','🎲','♟️','🧩','🎸','🎧','🎤','🎬','📸','🔥','✨','⭐','🌟','⚡','☀️','🌙','🌈','☁️','❄️'],
  '🐶':['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦄','🐝','🦋','🐌','🐞','🐠','🐬','🐳','🦈','🐊','🐍','🦖','🐙','🦀'],
  '🍕':['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍟','🍔','🍕','🌭','🥪','🌮','🌯','🍿','🍩','🍪','🎂','🍰','🧁','🍫','🍬','🍭','☕','🧃','🥤','🧋'],
  '🚗':['🚗','🚕','🚙','🚌','🏎️','🚓','🚑','🚒','🚚','🏍️','🚲','✈️','🚀','🛸','🚁','⛵','🚤','🏠','🏢','🏖️','🏝️','🏔️','🌋','🗽','🗼','🌃','🌉','🗺️','🧭'],
  '💡':['💡','📱','💻','⌚','📷','🔋','🔌','💎','🔑','🔒','🔓','🧲','🛠️','⚙️','🧰','🧪','🧬','🩺','💊','📚','✏️','📝','📌','📍','📎','🔗','✂️','✅','❌','⚠️','🚫','♻️','🔔','🔕','🔍','🔎']
};
const REACTIONS=['❤️','😂','😮','😢','😡','👍','🔥','🎉'];

const $=id=>document.getElementById(id);
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const get=(k,fallback=null)=>{try{const v=localStorage.getItem(k);return v===null?fallback:v}catch{return fallback}};
const set=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const getJson=(k,fallback)=>{try{return JSON.parse(get(k,''))??fallback}catch{return fallback}};
const setJson=(k,v)=>set(k,JSON.stringify(v));

let emojiPanel=null,searchBar=null,settings=null,reactionPop=null,scrollBtn=null;
let currentSearchIndex=-1,searchMatches=[];
let scanBusy=false,lastActiveChat='';

function waitReady(){
  if(!$('messageInput')||!$('messages')||!$('emojiBtn')||!$('chat'))return setTimeout(waitReady,120);
  if(!window.__dupiStarted)return setTimeout(waitReady,180);
  init();
}

function chatKey(){
  const name=($('chatName')?.textContent||'').trim();
  const status=($('chatStatus')?.textContent||'').trim();
  if(!name||name==='Selecciona un chat')return '';
  return `${name}|${status}`;
}
function activeChatName(){return ($('chatName')?.textContent||'').trim()}
function draftKey(){const k=chatKey();return k?`dupi_draft_${V}_${k}`:''}

function init(){
  if(window.__dupiEnhanced)return;window.__dupiEnhanced=true;
  document.body.classList.add('dupi-v4');
  applySavedAppearance();
  installHeaderButtons();
  installEmojiPicker();
  installSearch();
  installSettings();
  installDrafts();
  installUnreadObserver();
  installMessageEnhancements();
  installScrollButton();
  installContactPolish();
  cleanControlMessages();
}

function installHeaderButtons(){
  const head=qs('.chat-head');if(!head)return;
  const game=$('gameBtn');
  const search=document.createElement('button');search.className='game-btn v4-head-btn';search.id='chatSearchBtn';search.title='Buscar en este chat';search.textContent='⌕';
  const settingsBtn=document.createElement('button');settingsBtn.className='game-btn v4-head-btn';settingsBtn.id='v4SettingsBtn';settingsBtn.title='Personalizar';settingsBtn.textContent='⚙️';
  head.insertBefore(search,game);head.insertBefore(settingsBtn,game);
  search.addEventListener('click',toggleSearch);settingsBtn.addEventListener('click',openSettings);
  const menu=$('menu');if(menu){const b=document.createElement('button');b.textContent='✨ Personalizar Dupi Chat';b.addEventListener('click',openSettings);menu.insertBefore(b,menu.firstChild)}
}

function installEmojiPicker(){
  const btn=$('emojiBtn');btn.onclick=null;
  emojiPanel=document.createElement('div');emojiPanel.className='emoji-panel';emojiPanel.hidden=true;
  emojiPanel.innerHTML='<div class="emoji-head"><div class="emoji-search"><span>⌕</span><input id="emojiSearch" placeholder="Buscar emoji…"></div><button class="emoji-x" id="emojiClose">×</button></div><div class="emoji-tabs" id="emojiTabs"></div><div class="emoji-grid" id="emojiGrid"></div>';
  qs('.composer').appendChild(emojiPanel);
  const tabs=$('emojiTabs');Object.keys(EMOJIS).forEach((k,i)=>{const b=document.createElement('button');b.textContent=k;b.dataset.cat=k;if(i===0)b.classList.add('active');tabs.appendChild(b)});
  renderEmojiCategory(Object.keys(EMOJIS)[0]);
  tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;qsa('button',tabs).forEach(x=>x.classList.toggle('active',x===b));renderEmojiCategory(b.dataset.cat)});
  $('emojiSearch').addEventListener('input',e=>renderEmojiSearch(e.target.value));$('emojiClose').onclick=()=>emojiPanel.hidden=true;
  btn.addEventListener('click',e=>{e.stopPropagation();emojiPanel.hidden=!emojiPanel.hidden;if(!emojiPanel.hidden)$('emojiSearch').focus()});
  document.addEventListener('click',e=>{if(!emojiPanel.hidden&&!emojiPanel.contains(e.target)&&e.target!==btn)emojiPanel.hidden=true});
}
function allEmojis(){return [...new Set(Object.values(EMOJIS).flat())]}
function renderEmojiCategory(cat){renderEmojiButtons(EMOJIS[cat]||[])}
function renderEmojiSearch(q){q=q.trim();if(!q){const active=qs('#emojiTabs .active');return renderEmojiCategory(active?.dataset.cat||Object.keys(EMOJIS)[0])}const aliases={'amor':['❤️','🥰','😍','😘','💕'],'risa':['😂','🤣','😆','😁'],'triste':['😢','😭','🥺','😞'],'fuego':['🔥'],'fiesta':['🎉','🥳','🎊'],'juego':['🎮','🎲','🎯'],'carro':['🚗','🏎️','🚙'],'comida':['🍕','🍔','🍟'],'mano':['👍','👎','👏','🙏','✌️']};renderEmojiButtons(aliases[q.toLowerCase()]||allEmojis())}
function renderEmojiButtons(list){const grid=$('emojiGrid');grid.innerHTML='';const recent=getJson('dupi_recent_emojis_v4',[]);if(list.length>30&&recent.length){const lab=document.createElement('div');lab.className='emoji-label';lab.textContent='Recientes';grid.appendChild(lab);recent.slice(0,16).forEach(e=>grid.appendChild(emojiButton(e)));const lab2=document.createElement('div');lab2.className='emoji-label';lab2.textContent='Todos';grid.appendChild(lab2)}list.forEach(e=>grid.appendChild(emojiButton(e)))}
function emojiButton(e){const b=document.createElement('button');b.className='emoji-item';b.textContent=e;b.title=e;b.onclick=()=>insertEmoji(e);return b}
function insertEmoji(e){const t=$('messageInput');if(t.disabled)return;const s=t.selectionStart??t.value.length,en=t.selectionEnd??s;t.value=t.value.slice(0,s)+e+t.value.slice(en);t.selectionStart=t.selectionEnd=s+e.length;t.dispatchEvent(new Event('input',{bubbles:true}));t.focus();let r=getJson('dupi_recent_emojis_v4',[]).filter(x=>x!==e);r.unshift(e);setJson('dupi_recent_emojis_v4',r.slice(0,24))}

function installSearch(){
  searchBar=document.createElement('div');searchBar.className='chat-searchbar';searchBar.hidden=true;
  searchBar.innerHTML='<span>⌕</span><input id="chatSearchInput" placeholder="Buscar mensajes"><span class="search-count" id="searchCount"></span><button id="searchPrev">↑</button><button id="searchNext">↓</button><button id="searchClose">×</button>';
  const msg=$('messages');msg.parentNode.insertBefore(searchBar,msg);
  $('chatSearchInput').addEventListener('input',runChatSearch);$('searchPrev').onclick=()=>moveSearch(-1);$('searchNext').onclick=()=>moveSearch(1);$('searchClose').onclick=closeSearch;
}
function toggleSearch(){if(!chatKey())return;searchBar.hidden=!searchBar.hidden;if(!searchBar.hidden){$('chatSearchInput').focus();runChatSearch()}else clearSearch()}
function closeSearch(){searchBar.hidden=true;clearSearch()}
function messageText(el){return el?.children?.[0]?.textContent||''}
function runChatSearch(){clearSearch();const q=$('chatSearchInput').value.trim().toLowerCase();if(!q){$('searchCount').textContent='';return}searchMatches=qsa('.msg',$('messages')).filter(m=>!m.classList.contains('v4-control')&&messageText(m).toLowerCase().includes(q));searchMatches.forEach(m=>m.classList.add('search-hit'));currentSearchIndex=searchMatches.length?0:-1;$('searchCount').textContent=searchMatches.length?`1/${searchMatches.length}`:'0';focusSearchMatch()}
function clearSearch(){qsa('.search-hit',$('messages')).forEach(m=>m.classList.remove('search-hit','search-current'));searchMatches=[];currentSearchIndex=-1}
function moveSearch(d){if(!searchMatches.length)return;currentSearchIndex=(currentSearchIndex+d+searchMatches.length)%searchMatches.length;$('searchCount').textContent=`${currentSearchIndex+1}/${searchMatches.length}`;focusSearchMatch()}
function focusSearchMatch(){qsa('.search-current',$('messages')).forEach(m=>m.classList.remove('search-current'));const m=searchMatches[currentSearchIndex];if(m){m.classList.add('search-current');m.scrollIntoView({behavior:'smooth',block:'center'})}}

function installSettings(){
  settings=document.createElement('div');settings.className='v4-settings-overlay';settings.hidden=true;
  settings.innerHTML='<div class="v4-settings"><div class="settings-title"><div><b>✨ Personalizar Dupi Chat</b><small>Hazlo a tu gusto</small></div><button id="settingsClose">×</button></div><section><h3>Apariencia</h3><div class="setting-row"><span>Tema</span><div class="seg"><button data-theme="light">Claro</button><button data-theme="dark">Oscuro</button><button data-theme="system">Sistema</button></div></div><div class="setting-row"><span>Color</span><div class="accent-picks"><button data-accent="#00a884" style="--c:#00a884"></button><button data-accent="#7c5cff" style="--c:#7c5cff"></button><button data-accent="#ff4f81" style="--c:#ff4f81"></button><button data-accent="#258cff" style="--c:#258cff"></button><button data-accent="#ff8a00" style="--c:#ff8a00"></button></div></div><div class="setting-row"><span>Fondo del chat</span><div class="seg"><button data-wall="dots">Puntos</button><button data-wall="waves">Ondas</button><button data-wall="clean">Limpio</button></div></div><label class="toggle-row"><span>Modo compacto</span><input type="checkbox" id="compactToggle"><i></i></label></section><section><h3>Herramientas</h3><div class="settings-actions"><button id="exportChat">📄 Exportar chat actual</button><button id="copyChatLink">🔗 Copiar enlace de Dupi Chat</button><button id="resetLook">↺ Restablecer apariencia</button></div></section><p class="settings-note">Los ajustes visuales se guardan solo en este dispositivo.</p></div>';
  document.body.appendChild(settings);
  $('settingsClose').onclick=closeSettings;settings.addEventListener('click',e=>{if(e.target===settings)closeSettings()});
  qsa('[data-theme]',settings).forEach(b=>b.onclick=()=>{set('dupi_theme_v4',b.dataset.theme);applySavedAppearance();syncSettingButtons()});
  qsa('[data-accent]',settings).forEach(b=>b.onclick=()=>{set('dupi_accent_v4',b.dataset.accent);applySavedAppearance();syncSettingButtons()});
  qsa('[data-wall]',settings).forEach(b=>b.onclick=()=>{set('dupi_wall_v4',b.dataset.wall);applySavedAppearance();syncSettingButtons()});
  $('compactToggle').onchange=e=>{set('dupi_compact_v4',e.target.checked?'1':'0');applySavedAppearance()};
  $('exportChat').onclick=exportCurrentChat;$('copyChatLink').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);miniToast('Enlace copiado')}catch{}};
  $('resetLook').onclick=()=>{['dupi_theme_v4','dupi_accent_v4','dupi_wall_v4','dupi_compact_v4'].forEach(k=>{try{localStorage.removeItem(k)}catch{}});applySavedAppearance();syncSettingButtons()};
}
function openSettings(){settings.hidden=false;syncSettingButtons()}
function closeSettings(){settings.hidden=true}
function applySavedAppearance(){const theme=get('dupi_theme_v4','system'),accent=get('dupi_accent_v4','#00a884'),wall=get('dupi_wall_v4','dots'),compact=get('dupi_compact_v4','0')==='1';const dark=theme==='dark'||(theme==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);document.body.classList.toggle('dupi-dark',!!dark);document.body.classList.toggle('dupi-compact',compact);document.body.dataset.wall=wall;document.documentElement.style.setProperty('--g',accent);document.documentElement.style.setProperty('--dupi-accent',accent)}
function syncSettingButtons(){if(!settings)return;const theme=get('dupi_theme_v4','system'),accent=get('dupi_accent_v4','#00a884'),wall=get('dupi_wall_v4','dots');qsa('[data-theme]',settings).forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));qsa('[data-accent]',settings).forEach(b=>b.classList.toggle('active',b.dataset.accent===accent));qsa('[data-wall]',settings).forEach(b=>b.classList.toggle('active',b.dataset.wall===wall));$('compactToggle').checked=get('dupi_compact_v4','0')==='1'}
function exportCurrentChat(){const name=activeChatName();if(!chatKey())return miniToast('Abre un chat primero');const lines=[];qsa('.msg',$('messages')).forEach(m=>{if(m.classList.contains('v4-control'))return;const who=m.classList.contains('mine')?'Tú':name;const time=qs('.meta',m)?.textContent.trim()||'';lines.push(`[${time}] ${who}: ${messageText(m)}`)});const blob=new Blob([`Dupi Chat — conversación con ${name}\n\n${lines.join('\n')}`],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`DupiChat-${name.replace(/[^a-z0-9_-]+/gi,'_')}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function installDrafts(){const t=$('messageInput');t.addEventListener('input',()=>{const k=draftKey();if(!k)return;if(t.value)set(k,t.value);else try{localStorage.removeItem(k)}catch{}});$('sendBtn').addEventListener('click',()=>setTimeout(()=>{const k=draftKey();if(k&&!t.value)try{localStorage.removeItem(k)}catch{}},80));const obs=new MutationObserver(()=>{const k=chatKey();if(!k||k===lastActiveChat)return;lastActiveChat=k;const d=get(`dupi_draft_${V}_${k}`,'');if(!t.value&&d){t.value=d;t.dispatchEvent(new Event('input',{bubbles:true}))}});obs.observe($('chatName'),{childList:true,subtree:true,characterData:true});obs.observe($('chatStatus'),{childList:true,subtree:true,characterData:true})}

function installUnreadObserver(){const list=$('contactList');const obs=new MutationObserver(()=>queueMicrotask(scanContacts));obs.observe(list,{childList:true,subtree:true,characterData:true});list.addEventListener('click',e=>{const c=e.target.closest('.contact');if(!c)return;const name=qs('.row1 b',c)?.textContent||'';const u=getJson('dupi_unread_v4',{});delete u[name];setJson('dupi_unread_v4',u);setTimeout(scanContacts,20)});scanContacts()}
function scanContacts(){if(scanBusy)return;scanBusy=true;try{const unread=getJson('dupi_unread_v4',{}),snap=getJson('dupi_preview_v4',{}),active=activeChatName();qsa('.contact',$('contactList')).forEach(c=>{const name=qs('.row1 b',c)?.textContent||'',prev=qs('.preview',c)?.textContent||'';if(!name)return;const old=snap[name];if(old&&old!==prev&&active!==name&&!prev.startsWith('Reacción '))unread[name]=(unread[name]||0)+1;snap[name]=prev;let badge=qs('.v4-unread',c);if(unread[name]>0){if(!badge){badge=document.createElement('b');badge.className='v4-unread';qs('.row2',c)?.appendChild(badge)}badge.textContent=unread[name]>99?'99+':unread[name]}else badge?.remove();if(prev.includes(REACTION_PREFIX)){const p=prev.slice(prev.indexOf(REACTION_PREFIX)+REACTION_PREFIX.length);try{const d=JSON.parse(p);qs('.preview',c).textContent=`Reacción ${d.e||'❤️'}`}catch{}}});setJson('dupi_unread_v4',unread);setJson('dupi_preview_v4',snap);const total=Object.values(unread).reduce((a,b)=>a+Number(b||0),0);document.title=(total?`(${total}) `:'')+'Dupi Chat — Mensajería y juegos'}finally{scanBusy=false}}

function installMessageEnhancements(){const box=$('messages');const obs=new MutationObserver(()=>{cleanControlMessages();decorateMessages();if(!searchBar.hidden&&$('chatSearchInput').value)runChatSearch()});obs.observe(box,{childList:true,subtree:true,characterData:true});let timer=null;box.addEventListener('pointerdown',e=>{const m=e.target.closest('.msg');if(!m||m.classList.contains('v4-control'))return;timer=setTimeout(()=>showReactionPopup(m,e.clientX,e.clientY),520)});['pointerup','pointercancel','pointermove'].forEach(ev=>box.addEventListener(ev,()=>{clearTimeout(timer);timer=null}));box.addEventListener('dblclick',e=>{const m=e.target.closest('.msg');if(m&&!m.classList.contains('v4-control'))sendReaction(m,'❤️')});decorateMessages()}
function visibleMessageBubbles(){return qsa('.msg',$('messages')).filter(m=>!messageText(m).startsWith(REACTION_PREFIX))}
function messageIndex(m){return visibleMessageBubbles().indexOf(m)}
function showReactionPopup(m,x,y){reactionPop?.remove();reactionPop=document.createElement('div');reactionPop.className='reaction-pop';REACTIONS.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.onclick=()=>{sendReaction(m,e);reactionPop.remove()};reactionPop.appendChild(b)});const copy=document.createElement('button');copy.className='copy-reaction';copy.textContent='⧉';copy.title='Copiar mensaje';copy.onclick=async()=>{try{await navigator.clipboard.writeText(messageText(m));miniToast('Mensaje copiado')}catch{}reactionPop.remove()};reactionPop.appendChild(copy);document.body.appendChild(reactionPop);const r=reactionPop.getBoundingClientRect();reactionPop.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x-r.width/2))+'px';reactionPop.style.top=Math.max(8,Math.min(innerHeight-r.height-8,y-r.height-12))+'px';setTimeout(()=>document.addEventListener('pointerdown',closeReactionOnce,{once:true}),0)}
function closeReactionOnce(e){if(reactionPop&&!reactionPop.contains(e.target))reactionPop.remove()}
function sendReaction(m,e){const i=messageIndex(m);if(i<0)return;const input=$('messageInput');if(input.disabled)return;const draft=input.value;input.value=REACTION_PREFIX+JSON.stringify({i,e});input.dispatchEvent(new Event('input',{bubbles:true}));$('sendBtn').click();setTimeout(()=>{input.value=draft;input.dispatchEvent(new Event('input',{bubbles:true}));cleanControlMessages()},80)}
function cleanControlMessages(){const all=qsa('.msg',$('messages')),normal=[],controls=[];all.forEach(m=>{const t=messageText(m);if(t.startsWith(REACTION_PREFIX)){m.classList.add('v4-control');m.style.display='none';try{controls.push(JSON.parse(t.slice(REACTION_PREFIX.length)))}catch{}}else{m.classList.remove('v4-control');m.style.display='';normal.push(m)}});normal.forEach(m=>{qs('.v4-reactions',m)?.remove()});const map=new Map();controls.forEach(c=>{if(!Number.isInteger(c.i)||!c.e||!normal[c.i])return;const k=c.i;if(!map.has(k))map.set(k,{});const counts=map.get(k);counts[c.e]=(counts[c.e]||0)+1});map.forEach((counts,i)=>{const m=normal[i];if(!m)return;const bar=document.createElement('div');bar.className='v4-reactions';Object.entries(counts).forEach(([e,n])=>{const b=document.createElement('button');b.textContent=e+(n>1?` ${n}`:'');b.onclick=ev=>{ev.stopPropagation();sendReaction(m,e)};bar.appendChild(b)});m.appendChild(bar)})}
function decorateMessages(){qsa('.msg',$('messages')).forEach(m=>{if(m.classList.contains('v4-control'))return;m.title='Mantén pulsado para reaccionar o copiar · Doble toque = ❤️'})}

function installScrollButton(){scrollBtn=document.createElement('button');scrollBtn.className='scroll-bottom';scrollBtn.textContent='↓';scrollBtn.title='Ir al último mensaje';$('chat').appendChild(scrollBtn);scrollBtn.onclick=()=>$('messages').scrollTo({top:$('messages').scrollHeight,behavior:'smooth'});$('messages').addEventListener('scroll',()=>{const b=$('messages');scrollBtn.classList.toggle('show',b.scrollHeight-b.scrollTop-b.clientHeight>240)})}
function installContactPolish(){const list=$('contactList');list.addEventListener('pointerdown',e=>{const c=e.target.closest('.contact');if(c)c.classList.add('pressing')});['pointerup','pointercancel','pointerleave'].forEach(ev=>list.addEventListener(ev,e=>e.target.closest?.('.contact')?.classList.remove('pressing')))}
function miniToast(text){const host=$('toasts');if(!host)return;const d=document.createElement('div');d.className='toast';d.textContent=text;host.appendChild(d);setTimeout(()=>d.remove(),2400)}

if(window.matchMedia){try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(get('dupi_theme_v4','system')==='system')applySavedAppearance()})}catch{}}
waitReady();
})();
