function loadMqtt(){
  if(window.mqtt?.connect){libraryReady=true;return Promise.resolve()}
  return new Promise((resolve,reject)=>{let i=0;const next=()=>{if(i>=MQTT_CDNS.length)return reject(new Error('No se pudo cargar MQTT'));const s=document.createElement('script');s.src=MQTT_CDNS[i++];s.async=true;let done=false;const t=setTimeout(()=>{if(done)return;done=true;s.remove();next()},9000);s.onload=()=>{if(done)return;done=true;clearTimeout(t);if(window.mqtt?.connect){libraryReady=true;resolve()}else next()};s.onerror=()=>{if(done)return;done=true;clearTimeout(t);next()};document.head.appendChild(s)};next()});
}

function topicPresence(id){return `${ROOT}/presence/${id}`}
function topicInbox(id,msgId){return `${ROOT}/inbox/${id}/${msgId}`}
function topicAck(id,msgId){return `${ROOT}/ack/${id}/${msgId}`}
function topicMatch(filter,topic){const a=filter.split('/'),b=topic.split('/');for(let i=0;i<a.length;i++){if(a[i]==='#')return true;if(b[i]===undefined)return false;if(a[i]!=='+'&&a[i]!==b[i])return false}return a.length===b.length}

function connectBrokers(){
  if(!libraryReady||!identity)return;
  for(const b of BROKERS){
    if(clients.has(b.id))continue;
    let client;
    try{
      client=window.mqtt.connect(b.url,{clientId:`d7${identity.id.replace(/[^a-zA-Z0-9]/g,'').slice(0,8)}${hex(randBytes(6))}`,protocolVersion:4,clean:true,reconnectPeriod:3500,connectTimeout:7000,keepalive:25,resubscribe:true});
    }catch(e){continue}
    const entry={id:b.id,url:b.url,client,connected:false};clients.set(b.id,entry);
    client.on('connect',()=>{entry.connected=true;setNet();subscribeClient(entry);publishPresence(entry);flushOutbox(entry)});
    client.on('reconnect',()=>{entry.connected=false;setNet()});
    client.on('close',()=>{entry.connected=false;setNet()});
    client.on('offline',()=>{entry.connected=false;setNet()});
    client.on('error',()=>{entry.connected=false;setNet()});
    client.on('message',(topic,payload,packet)=>handleBrokerMessage(entry,topic,payload,packet));
  }
  setTimeout(setNet,100);
}
function subscribeClient(entry){
  const topics=[topicPresence('+'),`${ROOT}/inbox/${identity.id}/+`,`${ROOT}/ack/${identity.id}/+`];
  for(const t of topics){try{entry.client.subscribe(t,{qos:1},()=>{})}catch{}}
}
function mqttPublish(entry,topic,payload,{retain=false,qos=1}={}){return new Promise(resolve=>{if(!entry?.connected)return resolve(false);try{entry.client.publish(topic,payload,{qos,retain},err=>resolve(!err))}catch{return resolve(false)}})}
async function publishAll(topic,payload,opts){const active=[...clients.values()].filter(c=>c.connected);if(!active.length)return false;const r=await Promise.all(active.map(c=>mqttPublish(c,topic,payload,opts)));return r.some(Boolean)}
function clearRetained(topic){for(const c of clients.values())if(c.connected)mqttPublish(c,topic,'',{retain:true,qos:1})}

function presencePayload(){return JSON.stringify({v:VERSION,id:identity.id,username:identity.username,pub:identity.publicJwk,lastSeen:now()})}
function publishPresence(one=null){if(!identity)return;const payload=presencePayload(),topic=topicPresence(identity.id);if(one)mqttPublish(one,topic,payload,{retain:true,qos:1});else publishAll(topic,payload,{retain:true,qos:1})}
async function handlePresence(topic,text){
  if(!text)return;const d=parse(text);if(!d||d.v!==VERSION||!d.id||d.id===identity.id||!validName(d.username)||!isP256Jwk(d.pub))return;
  try{if(await idFromPublicJwk(d.pub)!==d.id)return}catch{return}
  upsertContact({id:d.id,username:d.username,publicJwk:d.pub,lastSeen:Number(d.lastSeen)||0});
}
async function handleBrokerMessage(entry,topic,payload){
  const text=payload?.toString?payload.toString():String(payload??'');
  if(topicMatch(topicPresence('+'),topic)){handlePresence(topic,text);return}
  const inboxPrefix=`${ROOT}/inbox/${identity.id}/`;if(topic.startsWith(inboxPrefix)){if(!text){return}await handleInbox(topic,text);return}
  const ackPrefix=`${ROOT}/ack/${identity.id}/`;if(topic.startsWith(ackPrefix)){if(!text)return;handleAck(topic,text);return}
}
async function handleInbox(topic,text){
  let env=parse(text);if(!env||env.to!==identity.id){clearRetained(topic);return}
  if(seen.has(env.msgId)){clearRetained(topic);await sendAck(env);return}
  if(processing.has(env.msgId)){clearRetained(topic);return}
  processing.add(env.msgId);
  try{
    const inner=await openEnvelope(env);if(!inner||typeof inner.type!=='string')throw new Error('Contenido inválido');
    seen.add(env.msgId);if(seen.size>2000)seen=new Set([...seen].slice(-1200));
    upsertContact({id:env.from,username:contacts.get(env.from)?.username||`Usuario ${env.from.slice(0,6)}`,publicJwk:env.fromKey,lastSeen:contacts.get(env.from)?.lastSeen||0});
    if(inner.type==='chat'){
      const text=String(inner.text??'').slice(0,4000);if(text){addMessage(env.from,{id:env.msgId,sender:env.from,text,ts:Number(inner.ts)||env.ts,status:'delivered'});if(currentPeer!==env.from){setUnread(env.from,(unread.get(env.from)||0)+1);toast(`${peerName(env.from)}: ${text.slice(0,55)}${text.length>55?'…':''}`)}renderContacts();if(currentPeer===env.from)renderMessages()}
    }else if(inner.type==='game'){handleGamePacket(env.from,inner.packet,env.msgId)}
    await sendAck(env);
  }catch(e){console.warn('Dupi decrypt/process error',e)}finally{processing.delete(env.msgId);clearRetained(topic)}
}
async function sendAck(env){const payload=JSON.stringify({v:VERSION,msgId:env.msgId,from:identity.id,to:env.from,ts:now()});await publishAll(topicAck(env.from,env.msgId),payload,{retain:true,qos:1})}
function handleAck(topic,text){const a=parse(text);if(!a||a.v!==VERSION||a.to!==identity.id||!a.msgId)return;const rec=outbox.get(a.msgId);if(!rec||rec.peerId!==a.from){clearRetained(topic);return}outbox.delete(a.msgId);saveOutbox();const arr=messages.get(a.from)||[];const m=arr.find(x=>x.id===a.msgId);if(m){m.status='delivered';saveMessages();if(currentPeer===a.from)renderMessages();renderContacts()}clearRetained(topic)}

async function queueSecure(peerId,inner,msgId=randomId()){
  const peer=contacts.get(peerId);if(!peer)throw new Error('Contacto no encontrado');
  const env=await makeEnvelope(peer,inner,msgId),topic=topicInbox(peerId,msgId);const rec={peerId,topic,envelope:env,createdAt:now(),lastTry:0,tries:0};outbox.set(msgId,rec);saveOutbox();await publishOutboxRecord(rec);return msgId;
}
async function publishOutboxRecord(rec,only=null){rec.lastTry=now();rec.tries=(rec.tries||0)+1;saveOutbox();const payload=JSON.stringify(rec.envelope);if(only)return mqttPublish(only,rec.topic,payload,{retain:true,qos:1});return publishAll(rec.topic,payload,{retain:true,qos:1})}
async function flushOutbox(one=null){for(const [id,rec] of [...outbox]){if(now()-rec.createdAt>OUTBOX_TTL){outbox.delete(id);continue}if(one||now()-(rec.lastTry||0)>8000)await publishOutboxRecord(rec,one)}saveOutbox()}

async function sendMessage(){
  const input=$('messageInput'),text=input.value.trim();if(!currentPeer||!text)return;if(text.length>4000)return toast('El mensaje es demasiado largo',true);
  const peer=currentPeer,msgId=randomId();addMessage(peer,{id:msgId,sender:identity.id,text,ts:now(),status:'sending'});input.value='';resizeComposer();renderMessages();renderContacts();
  try{await queueSecure(peer,{type:'chat',text,ts:now()},msgId);const m=(messages.get(peer)||[]).find(x=>x.id===msgId);if(m){m.status=connectedCount()?'sent':'queued';saveMessages();renderMessages()}}
  catch(e){const m=(messages.get(peer)||[]).find(x=>x.id===msgId);if(m){m.status='failed';saveMessages();renderMessages()}toast(e.message||'No pude preparar el mensaje',true)}
}

function renderContacts(){
  const q=$('search').value.trim().toLowerCase();let list=[...contacts.values()].filter(c=>c.id!==identity?.id);
  list=list.filter(c=>c.manual||online(c)||now()-(c.lastSeen||0)<CONTACT_TTL||messages.has(c.id));
  if(filterMode==='online')list=list.filter(online);if(q)list=list.filter(c=>(c.username||'').toLowerCase().includes(q)||c.id.toLowerCase().includes(q));
  list.sort((a,b)=>{const ma=latest(a.id)?.ts||0,mb=latest(b.id)?.ts||0;if(mb!==ma)return mb-ma;return (b.lastSeen||0)-(a.lastSeen||0)});
  const box=$('contactList');box.innerHTML='';
  if(!list.length){box.innerHTML='<div class="empty"><b>No hay contactos todavía</b>Abre Dupi Chat en el otro teléfono. Si no aparece, usa “Agregar contacto por código” en el menú.</div>';return}
  for(const c of list){const m=latest(c.id),n=unread.get(c.id)||0,el=document.createElement('div');el.className='contact'+(currentPeer===c.id?' active':'');const preview=m?`${m.sender===identity.id?'Tú: ':''}${m.text}`:(c.manual?'Contacto agregado':'Usuario de Dupi Chat');el.innerHTML=`<div class="avatar">${esc(initials(c.username))}</div><div class="contact-main"><div class="row1"><b>${esc(c.username)}</b><time>${m?fmtTime(m.ts):''}</time></div><div class="row2"><span class="preview">${esc(preview)}</span><span>${n?`<b class="badge">${n>99?'99+':n}</b>`:`<i class="dot ${online(c)?'on':''}"></i>${online(c)?'online':''}`}</span></div></div>`;el.onclick=()=>openChat(c.id);box.appendChild(el)}
}
function openChat(peer){if(!contacts.has(peer))return;currentPeer=peer;setUnread(peer,0);$('welcome').hidden=true;$('chat').classList.add('open');$('messageInput').disabled=false;$('sendBtn').disabled=false;$('gameBtn').disabled=false;renderContacts();renderHeader();renderMessages();const inv=pendingInvites.get(peer);if(inv)showInvite(peer,inv);const g=games.get(peer);if(g&&g.status==='active')sendGame(peer,{op:'sync-request',matchId:g.matchId})}
function renderHeader(){const c=contacts.get(currentPeer);if(!c)return;$('chatAvatar').textContent=initials(c.username);$('chatName').textContent=c.username;$('chatStatus').textContent=online(c)?'en línea':`ID ${c.id.slice(0,8)}`}
function renderMessages(){const box=$('messages'),arr=messages.get(currentPeer)||[];box.innerHTML='';let day='';for(const m of arr){const d=fmtDay(m.ts);if(d!==day){day=d;const s=document.createElement('div');s.className='day';s.textContent=d;box.appendChild(s)}const e=document.createElement('div');e.className='msg '+(m.sender===identity.id?'mine':'theirs');const t=document.createElement('span');t.textContent=m.text;const meta=document.createElement('span');meta.className='meta';let mark='';if(m.sender===identity.id){mark=m.status==='delivered'?' <span class="ticks">✓✓</span>':m.status==='failed'?' <span class="failed">⚠</span>':m.status==='queued'?' ⏳':' ✓'}meta.innerHTML=fmtTime(m.ts)+mark;e.append(t,meta);box.appendChild(e)}if(!arr.length){const s=document.createElement('div');s.className='day';s.textContent='Inicio del chat';box.appendChild(s)}requestAnimationFrame(()=>box.scrollTop=box.scrollHeight)}
function resizeComposer(){const t=$('messageInput');t.style.height='42px';t.style.height=Math.min(t.scrollHeight,120)+'px'}

