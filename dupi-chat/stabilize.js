(()=>{
'use strict';
const PREFIX='__DUPI_REACT_V1__:';
const REACTIONS=['❤️','😂','😮','😢','😡','👍','🔥','🎉'];
const $=id=>document.getElementById(id);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const qs=(s,r=document)=>r.querySelector(s);
let popup=null,busy=false;
function textOf(m){return m?.children?.[0]?.textContent||''}
function normalMessages(){return qsa('.msg',$('messages')).filter(m=>!textOf(m).startsWith(PREFIX))}
function indexOf(m){return normalMessages().indexOf(m)}
function toast(t){const h=$('toasts');if(!h)return;const d=document.createElement('div');d.className='toast';d.textContent=t;h.appendChild(d);setTimeout(()=>d.remove(),2200)}
function sendReaction(m,e){const i=indexOf(m);if(i<0)return;const input=$('messageInput');if(!input||input.disabled)return;const draft=input.value;input.value=PREFIX+JSON.stringify({i,e});input.dispatchEvent(new Event('input',{bubbles:true}));$('sendBtn').click();setTimeout(()=>{input.value=draft;input.dispatchEvent(new Event('input',{bubbles:true}))},90)}
function renderReactions(){
  if(busy)return;busy=true;
  try{
    const all=qsa('.msg',$('messages')),normal=[],controls=[];
    all.forEach(m=>{const t=textOf(m);if(t.startsWith(PREFIX)){m.classList.add('v4-control');m.style.display='none';try{controls.push(JSON.parse(t.slice(PREFIX.length)))}catch{}}else{m.classList.remove('v4-control');m.style.display='';normal.push(m)}});
    const map=new Map();controls.forEach(c=>{if(!Number.isInteger(c.i)||!c.e||!normal[c.i])return;if(!map.has(c.i))map.set(c.i,{});const o=map.get(c.i);o[c.e]=(o[c.e]||0)+1});
    normal.forEach((m,i)=>{m.title='Mantén pulsado para reaccionar/copiar · Doble toque = ❤️';const counts=map.get(i)||{},sig=JSON.stringify(counts);if(m.dataset.stableReactSig===sig)return;m.dataset.stableReactSig=sig;qs('.v4-reactions',m)?.remove();if(!Object.keys(counts).length)return;const bar=document.createElement('div');bar.className='v4-reactions';Object.entries(counts).forEach(([e,n])=>{const b=document.createElement('button');b.textContent=e+(n>1?` ${n}`:'');b.onclick=ev=>{ev.stopPropagation();sendReaction(m,e)};bar.appendChild(b)});m.appendChild(bar)});
  }finally{busy=false}
}
function showPopup(m,x,y){popup?.remove();popup=document.createElement('div');popup.className='reaction-pop';REACTIONS.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.onclick=()=>{sendReaction(m,e);popup.remove()};popup.appendChild(b)});const copy=document.createElement('button');copy.className='copy-reaction';copy.textContent='⧉';copy.title='Copiar';copy.onclick=async()=>{try{await navigator.clipboard.writeText(textOf(m));toast('Mensaje copiado')}catch{}popup.remove()};popup.appendChild(copy);document.body.appendChild(popup);const r=popup.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x-r.width/2))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-r.height-8,y-r.height-12))+'px';setTimeout(()=>document.addEventListener('pointerdown',e=>{if(popup&&!popup.contains(e.target))popup.remove()},{once:true}),0)}
function attach(){
  const old=$('messages');if(!old)return setTimeout(attach,120);
  const fresh=old.cloneNode(true);old.replaceWith(fresh);
  let timer=null;
  fresh.addEventListener('pointerdown',e=>{const m=e.target.closest('.msg');if(!m||m.classList.contains('v4-control'))return;timer=setTimeout(()=>showPopup(m,e.clientX,e.clientY),520)});
  ['pointerup','pointercancel','pointermove'].forEach(ev=>fresh.addEventListener(ev,()=>{clearTimeout(timer);timer=null}));
  fresh.addEventListener('dblclick',e=>{const m=e.target.closest('.msg');if(m&&!m.classList.contains('v4-control'))sendReaction(m,'❤️')});
  fresh.addEventListener('scroll',()=>{const b=fresh,s=qs('.scroll-bottom');if(s)s.classList.toggle('show',b.scrollHeight-b.scrollTop-b.clientHeight>240)});
  let queued=false;const obs=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;renderReactions()})});obs.observe(fresh,{childList:true,subtree:true,characterData:true});
  renderReactions();
}
function wait(){if(!window.__dupiEnhanced)return setTimeout(wait,120);attach()}
wait();
})();
