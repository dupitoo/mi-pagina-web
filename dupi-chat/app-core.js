'use strict';

const VERSION=7;
const ROOT='dupi-chat-7-7f3a9d2e';
const TEST_SLOT=new URLSearchParams(location.search).get('__testSlot')||'';
const STORE_PREFIX=TEST_SLOT?`dupi_v7_test_${TEST_SLOT}_`:'dupi_v7_';
const BROKERS=[
  {id:'emqx',url:'wss://broker.emqx.io:8084/mqtt'},
  {id:'hive',url:'wss://broker.hivemq.com:8884/mqtt'},
  {id:'mosq',url:'wss://test.mosquitto.org:8081/mqtt'}
];
const MQTT_CDNS=[
  'https://cdnjs.cloudflare.com/ajax/libs/mqtt/5.15.1/mqtt.min.js',
  'https://unpkg.com/mqtt@5.15.1/dist/mqtt.min.js'
];
const MAX_MESSAGES=500;
const CONTACT_TTL=7*24*60*60*1000;
const ONLINE_MS=90*1000;
const OUTBOX_TTL=7*24*60*60*1000;
const $=id=>document.getElementById(id);

let identity=null;
let privateKey=null;
let contacts=new Map();
let messages=new Map();
let games=new Map();
let pendingInvites=new Map();
let unread=new Map();
let outbox=new Map();
let seen=new Set();
let processing=new Set();
let clients=new Map();
let keyCache=new Map();
let currentPeer=null;
let filterMode='all';
let libraryReady=false;
let heartbeatTimer=null;
let flushTimer=null;

const enc=new TextEncoder();
const dec=new TextDecoder();

function storeGet(k){try{return localStorage.getItem(STORE_PREFIX+k)}catch{return null}}
function storeSet(k,v){try{localStorage.setItem(STORE_PREFIX+k,v)}catch{}}
function storeDel(k){try{localStorage.removeItem(STORE_PREFIX+k)}catch{}}
function parse(s,fallback=null){try{return JSON.parse(s)}catch{return fallback}}
function now(){return Date.now()}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function initials(n){return (n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()}
function randBytes(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return a}
function hex(a){return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')}
function randomId(){return crypto.randomUUID?crypto.randomUUID():`${Date.now().toString(36)}-${hex(randBytes(10))}`}
function b64u(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
function b64uText(s){return b64u(enc.encode(s))}
function unb64uText(s){return dec.decode(unb64u(s))}
function fmtTime(ms){return new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fmtDay(ms){const d=new Date(ms),t=new Date();if(d.toDateString()===t.toDateString())return'HOY';const y=new Date();y.setDate(y.getDate()-1);if(d.toDateString()===y.toDateString())return'AYER';return d.toLocaleDateString()}
function toast(text,bad=false){const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=text;$('toasts').appendChild(d);setTimeout(()=>d.remove(),3400)}
function setBoot(text){$('bootText').textContent=text}
function connectedCount(){return [...clients.values()].filter(x=>x.connected).length}
function setNet(){const n=connectedCount(),el=$('netState');if(n){el.className='net ok';el.innerHTML=`<i></i>Conectado${n>1?` · ${n} redes`:''}`}else{el.className='net bad';el.innerHTML='<i></i>Sin conexión'}}
function peerName(id){return contacts.get(id)?.username||`Usuario ${String(id||'').slice(0,6)}`}
function online(c){return !!c?.lastSeen&&(now()-c.lastSeen)<ONLINE_MS}
function validName(n){return typeof n==='string'&&n.trim().length>=2&&n.trim().length<=24}
function isP256Jwk(j){return j&&j.kty==='EC'&&j.crv==='P-256'&&typeof j.x==='string'&&typeof j.y==='string'}

async function idFromPublicJwk(jwk){const raw=enc.encode(`${jwk.crv}.${jwk.x}.${jwk.y}`);const h=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));return b64u(h.subarray(0,18))}
async function generateIdentity(username){
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const priv=await crypto.subtle.exportKey('jwk',pair.privateKey);
  const id=await idFromPublicJwk(pub);
  return {v:VERSION,id,username:username.trim().slice(0,24),publicJwk:pub,privateJwk:priv,createdAt:now()};
}
async function importIdentity(){
  const x=parse(storeGet('identity'));
  if(!x||x.v!==VERSION||!x.id||!validName(x.username)||!isP256Jwk(x.publicJwk)||!x.privateJwk)return false;
  try{
    const expected=await idFromPublicJwk(x.publicJwk);if(expected!==x.id)return false;
    privateKey=await crypto.subtle.importKey('jwk',x.privateJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
    identity=x;return true;
  }catch{return false}
}
function saveIdentity(){if(identity)storeSet('identity',JSON.stringify(identity))}

function loadState(){
  contacts=new Map((parse(storeGet('contacts'),[])||[]).filter(c=>c?.id).map(c=>[c.id,c]));
  const mo=parse(storeGet('messages'),{})||{};messages=new Map(Object.entries(mo).map(([k,v])=>[k,Array.isArray(v)?v.slice(-MAX_MESSAGES):[]]));
  const go=parse(storeGet('games'),{})||{};games=new Map(Object.entries(go));
  const io=parse(storeGet('invites'),{})||{};pendingInvites=new Map(Object.entries(io).filter(([,v])=>v&&now()-(v.ts||0)<24*60*60*1000));
  const uo=parse(storeGet('unread'),{})||{};unread=new Map(Object.entries(uo).map(([k,v])=>[k,Number(v)||0]));
  const oo=parse(storeGet('outbox'),{})||{};outbox=new Map(Object.entries(oo).filter(([,v])=>v&&now()-(v.createdAt||0)<OUTBOX_TTL));
}
function saveContacts(){storeSet('contacts',JSON.stringify([...contacts.values()].slice(0,1500)))}
function saveMessages(){const o={};for(const[k,v]of messages)o[k]=v.slice(-MAX_MESSAGES);storeSet('messages',JSON.stringify(o))}
function saveGames(){const g={};for(const[k,v]of games)g[k]=v;storeSet('games',JSON.stringify(g));const i={};for(const[k,v]of pendingInvites)i[k]=v;storeSet('invites',JSON.stringify(i))}
function saveUnread(){const o={};for(const[k,v]of unread)o[k]=v;storeSet('unread',JSON.stringify(o))}
function saveOutbox(){const o={};for(const[k,v]of outbox)o[k]=v;storeSet('outbox',JSON.stringify(o))}

function addMessage(peer,msg){
  let arr=messages.get(peer)||[];const i=arr.findIndex(x=>x.id===msg.id);
  if(i>=0)arr[i]={...arr[i],...msg};else arr.push(msg);
  arr.sort((a,b)=>a.ts-b.ts);if(arr.length>MAX_MESSAGES)arr=arr.slice(-MAX_MESSAGES);messages.set(peer,arr);saveMessages();
}
function latest(peer){const a=messages.get(peer)||[];return a[a.length-1]||null}
function setUnread(peer,n){unread.set(peer,Math.max(0,n|0));saveUnread()}

async function getSharedKey(peerId,peerPub){
  const cacheId=`${peerId}:${peerPub.x}:${peerPub.y}`;if(keyCache.has(cacheId))return keyCache.get(cacheId);
  const expected=await idFromPublicJwk(peerPub);if(expected!==peerId)throw new Error('Identidad de contacto inválida');
  const pub=await crypto.subtle.importKey('jwk',peerPub,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:pub},privateKey,256));
  const ids=[identity.id,peerId].sort().join('|');const context=enc.encode(`DUPI7|${ids}`);
  const joined=new Uint8Array(bits.length+context.length);joined.set(bits);joined.set(context,bits.length);
  const digest=await crypto.subtle.digest('SHA-256',joined);
  const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
  keyCache.set(cacheId,key);return key;
}
async function makeEnvelope(peer,inner,msgId=randomId()){
  if(!peer?.id||!isP256Jwk(peer.publicJwk))throw new Error('Contacto sin clave pública');
  const key=await getSharedKey(peer.id,peer.publicJwk),iv=randBytes(12),ts=now();
  const aadText=`${VERSION}|${identity.id}|${peer.id}|${msgId}|${ts}`;
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aadText)},key,enc.encode(JSON.stringify(inner))));
  return {v:VERSION,msgId,from:identity.id,to:peer.id,fromKey:identity.publicJwk,iv:b64u(iv),ct:b64u(ct),ts};
}
async function openEnvelope(env){
  if(!env||env.v!==VERSION||env.to!==identity.id||!env.msgId||!env.from||!isP256Jwk(env.fromKey))throw new Error('Sobre inválido');
  const expected=await idFromPublicJwk(env.fromKey);if(expected!==env.from)throw new Error('Remitente inválido');
  const key=await getSharedKey(env.from,env.fromKey),iv=unb64u(env.iv),ct=unb64u(env.ct);
  const aadText=`${VERSION}|${env.from}|${env.to}|${env.msgId}|${env.ts}`;
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(aadText)},key,ct);
  return parse(dec.decode(plain));
}

function contactCode(){return 'DUPI7-'+b64uText(JSON.stringify({v:VERSION,id:identity.id,username:identity.username,pub:identity.publicJwk}))}
async function importContactCode(code){
  code=(code||'').trim();if(!code.startsWith('DUPI7-'))throw new Error('Código no válido');
  const d=parse(unb64uText(code.slice(6)));if(!d||d.v!==VERSION||!d.id||!validName(d.username)||!isP256Jwk(d.pub))throw new Error('Código no válido');
  if(await idFromPublicJwk(d.pub)!==d.id)throw new Error('Código alterado');
  if(d.id===identity.id)throw new Error('Ese es tu propio contacto');
  upsertContact({id:d.id,username:d.username,publicJwk:d.pub,lastSeen:0,manual:true});return d.id;
}
function upsertContact(c){
  if(!c?.id||c.id===identity?.id||!isP256Jwk(c.publicJwk)||!validName(c.username))return;
  const old=contacts.get(c.id)||{};contacts.set(c.id,{...old,...c,username:c.username.trim().slice(0,24),lastSeen:Math.max(Number(old.lastSeen)||0,Number(c.lastSeen)||0)});saveContacts();renderContacts();if(currentPeer===c.id)renderHeader();
}

