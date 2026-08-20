function buildEmojiPanel(){const es='😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😍 🥰 😘 😎 🤩 🥳 😏 😒 😔 😢 😭 😤 😡 🤯 😱 🥺 🤗 🤔 🫡 🤭 🤫 😴 🤤 🤢 🤮 😷 🤒 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💯 🔥 ✨ ⭐ ⚡ 👍 👎 👌 ✌️ 🤞 🤟 🤙 👋 🤝 👏 🙌 🫶 🙏 💪 👊 ✊ 🤜 🤛 🎉 🎊 🎁 🏆 ⚽ 🏀 🎮 🎯 🎲 🍕 🍔 🍟 🍩 ☕ 🚗 ✈️ 🚀 🏠 🌙 ☀️ 🌈 ✅ ❌ ⚠️'.split(' ');const p=$('emojiPanel');for(const e of es){const b=document.createElement('button');b.textContent=e;b.onclick=()=>{const t=$('messageInput');const s=t.selectionStart??t.value.length,en=t.selectionEnd??s;t.value=t.value.slice(0,s)+e+t.value.slice(en);t.selectionStart=t.selectionEnd=s+e.length;t.focus();resizeComposer()};p.appendChild(b)}}

async function register(){const name=$('usernameInput').value.trim().replace(/\s+/g,' ');$('registerErr').textContent='';if(!validName(name)){$('registerErr').textContent='Usa un nombre de 2 a 24 caracteres.';return}if(!crypto?.subtle){$('registerErr').textContent='Este navegador no soporta el cifrado necesario.';return}$('registerBtn').disabled=true;$('registerBtn').textContent='CREANDO…';try{identity=await generateIdentity(name);privateKey=await crypto.subtle.importKey('jwk',identity.privateJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);saveIdentity();$('registerModal').hidden=true;startApp()}catch(e){$('registerErr').textContent='No pude crear la identidad. Recarga e inténtalo otra vez.';$('registerBtn').disabled=false;$('registerBtn').textContent='ENTRAR A DUPI CHAT'}}
function startApp(){loadState();$('meName').textContent=identity.username;$('meAvatar').textContent=initials(identity.username);$('app').hidden=false;renderContacts();connectBrokers();publishPresence();clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>publishPresence(),30000);clearInterval(flushTimer);flushTimer=setInterval(()=>flushOutbox(),10000)}
function setTheme(mode){document.body.classList.toggle('dark',mode==='dark');storeSet('theme',mode)}

function bindUI(){
  $('registerBtn').onclick=register;$('usernameInput').onkeydown=e=>{if(e.key==='Enter')register()};
  $('refreshBtn').onclick=()=>{publishPresence();renderContacts();toast('Actualizando contactos…')};
  $('search').oninput=renderContacts;document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');filterMode=b.dataset.filter;renderContacts()});
  $('menuBtn').onclick=e=>{e.stopPropagation();$('menu').hidden=!$('menu').hidden};document.addEventListener('click',e=>{if(!e.target.closest('#menuBtn')&&!e.target.closest('#menu'))$('menu').hidden=true;if(!e.target.closest('#emojiPanel')&&!e.target.closest('#emojiBtn'))$('emojiPanel').hidden=true});
  $('sendBtn').onclick=sendMessage;$('messageInput').oninput=resizeComposer;$('messageInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}};
  $('backBtn').onclick=()=>{$('chat').classList.remove('open');closeGame()};$('gameBtn').onclick=showGamePicker;$('gameOverlay').onclick=e=>{if(e.target===$('gameOverlay'))closeGame()};
  $('emojiBtn').onclick=e=>{e.stopPropagation();if(!$('messageInput').disabled)$('emojiPanel').hidden=!$('emojiPanel').hidden};buildEmojiPanel();
  $('copyContactBtn').onclick=async()=>{try{await navigator.clipboard.writeText(contactCode());toast('Tu contacto fue copiado')}catch{prompt('Copia tu contacto:',contactCode())}};
  $('addContactBtn').onclick=async()=>{const code=prompt('Pega el código de contacto de la otra persona:');if(!code)return;try{const id=await importContactCode(code);toast('Contacto agregado');openChat(id)}catch(e){toast(e.message||'Código inválido',true)}};
  $('shareBtn').onclick=async()=>{const url=location.href.split('?')[0],text=`Únete a Dupi Chat. Mi contacto: ${contactCode()}`;try{if(navigator.share)await navigator.share({title:'Dupi Chat',text,url});else{await navigator.clipboard.writeText(`${text}\n${url}`);toast('Enlace y contacto copiados')}}catch{}};
  $('themeBtn').onclick=()=>setTheme(document.body.classList.contains('dark')?'light':'dark');
  $('renameBtn').onclick=()=>{const n=prompt('Nuevo nombre:',identity.username);if(n&&validName(n.trim())){identity.username=n.trim().slice(0,24);saveIdentity();$('meName').textContent=identity.username;$('meAvatar').textContent=initials(identity.username);publishPresence();renderContacts()}};
  $('logoutBtn').onclick=()=>{if(confirm('¿Borrar esta identidad y los datos locales de Dupi Chat?')){for(const c of clients.values())if(c.connected)mqttPublish(c,topicPresence(identity.id),'',{retain:true,qos:1});['identity','contacts','messages','games','invites','unread','outbox'].forEach(storeDel);location.reload()}};
  window.addEventListener('online',()=>{connectBrokers();publishPresence();flushOutbox()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&identity){publishPresence();flushOutbox();renderContacts()}});
}

async function boot(){
  bindUI();setTheme(storeGet('theme')||'light');
  if(!crypto?.subtle){setBoot('Este navegador no soporta Web Crypto. Usa Safari, Chrome o Firefox actualizado.');return}
  setBoot('Cargando el motor de conexión…');
  try{await loadMqtt()}catch{setBoot('No pude cargar el motor de conexión. Revisa Internet y recarga.');return}
  setBoot('Preparando tu sesión…');
  const ok=await importIdentity();$('boot').hidden=true;if(ok)startApp();else{$('app').hidden=false;$('registerModal').hidden=false}
  if(TEST_SLOT){window.__DUPI_TEST__={state:()=>({id:identity?.id,name:identity?.username,currentPeer,contacts:[...contacts.values()],messages:Object.fromEntries(messages),games:Object.fromEntries(games),outbox:Object.fromEntries(outbox),connected:connectedCount()}),openChat,contactCode,importContactCode,sendMessage}}
}
boot();
