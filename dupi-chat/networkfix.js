(()=>{
'use strict';

const EXTRA_RELAYS=[
  'wss://relay.nostr.band',
  'wss://nostr.mom',
  'wss://relay.nostr.bg'
];
const PUBLISH_TIMEOUT=6500;
const QUERY_TIMEOUT=9000;
let patched=false;

function mergeRelays(relays){
  return [...new Set([...(Array.isArray(relays)?relays:[]),...EXTRA_RELAYS])];
}
function withTimeout(promise,ms,label){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label||'relay timeout')),ms)});
  return Promise.race([Promise.resolve(promise),timeout]).finally(()=>clearTimeout(timer));
}
function patchTools(tools){
  if(patched||!tools?.SimplePool?.prototype)return;
  const proto=tools.SimplePool.prototype;
  const originalPublish=proto.publish;
  const originalQuerySync=proto.querySync;
  const originalSubscribe=proto.subscribe;
  if(typeof originalPublish!=='function'||typeof originalQuerySync!=='function'||typeof originalSubscribe!=='function')return;

  proto.publish=function(relays,event){
    let out;
    try{out=originalPublish.call(this,mergeRelays(relays),event)}catch(e){return [Promise.reject(e)]}
    return Array.from(out||[]).map(p=>withTimeout(p,PUBLISH_TIMEOUT,'publish timeout'));
  };
  proto.querySync=function(relays,filter,params){
    return withTimeout(originalQuerySync.call(this,mergeRelays(relays),filter,params),QUERY_TIMEOUT,'query timeout');
  };
  proto.subscribe=function(relays,filter,params){
    return originalSubscribe.call(this,mergeRelays(relays),filter,params);
  };
  patched=true;
  window.__dupiNetworkPatched=true;
}

if(window.NostrTools){
  patchTools(window.NostrTools);
}else{
  let value;
  try{
    Object.defineProperty(window,'NostrTools',{
      configurable:true,
      enumerable:true,
      get(){return value},
      set(v){
        value=v;
        patchTools(v);
        try{Object.defineProperty(window,'NostrTools',{value:v,writable:true,configurable:true,enumerable:true})}catch{}
      }
    });
  }catch{}
}

function watchdog(){
  const state=document.getElementById('netState');
  const refresh=document.getElementById('refreshBtn');
  if(!state||!refresh)return;
  const text=(state.textContent||'').toLowerCase();
  if(text.includes('conectando')||text.includes('reconectando')||text.includes('no pude actualizar')||text.includes('sin conexión')){
    const span=state.querySelector('span');
    if(span&&text.includes('conectando'))span.textContent='Reintentando…';
    if(!refresh.disabled)refresh.click();
  }
}
setTimeout(watchdog,10000);
setInterval(watchdog,30000);
window.addEventListener('online',()=>setTimeout(watchdog,800));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(watchdog,1000)});
})();
