/* Codex de campaña — conectado a Supabase */
const SB = window.supabase.createClient(
  'https://xsszobpirqgruyfnewus.supabase.co',
  'sb_publishable_RtJPtQosXcyZHtVJCTmpOA_lnNqIebj'
);

const TYPES={character:{l:'Personajes',s:'Personaje',c:'#D4A24C'},location:{l:'Lugares',s:'Lugar',c:'#4FA88B'},
 item:{l:'Objetos',s:'Objeto',c:'#A987C4'},faction:{l:'Facciones',s:'Facción',c:'#D46A6A'},
 creature:{l:'Criaturas',s:'Criatura',c:'#6C8FC7'}};
const ORDER=['character','faction','location','item','creature'];

let CAMPS=[], cur=null, D=[], byS={}, BL={}, ADJ={};
let st={tab:'home',ent:null,q:'',depth:2,editing:null,ac:null,acPick:null,toast:'',busy:false,view:'list'};
let hist=[]; // pila de navegación: {tab, ent}
const app=document.getElementById('app');
const esc=s=>(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const LK=/\[\[([a-z0-9\-]+)\]\]/g;

function openImg(url){
  if(!url)return;
  const d=document.createElement('div');
  d.className='lightbox';
  d.innerHTML=`<img src="${url}">`;
  d.onclick=()=>d.remove();
  document.body.appendChild(d);
}

function av(e,size,sq){
  if(!e)return'';
  const c=TYPES[e.t]?TYPES[e.t].c:'#8A94A6';
  if(e.img) return `<span class="av${sq?' sq':''}" style="width:${size}px;height:${size}px;background-image:url('${e.img}')"></span>`;
  const w=(e.n||'?').replace(/^(la|el|los|las)\s+/i,'').split(/\s+/).filter(x=>x.length>1);
  const ini=(w.length>1?w[0][0]+w[1][0]:(w[0]||'?').slice(0,2)).toUpperCase();
  return `<span class="av ph${sq?' sq':''}" style="width:${size}px;height:${size}px;background:${c}26;color:${c};border-color:${c}55;font-size:${Math.max(8,Math.round(size*.4))}px">${ini}</span>`;
}

/* ---------- índices derivados ---------- */
function snip(txt,slug){
  const m=(txt||'').match(new RegExp('[^.\\n]*\\[\\['+slug+'\\]\\][^.\\n]*'));
  return m?m[0].trim().replace(LK,(_,k)=>byS[k]?'§'+byS[k].n+'§':''):'';
}
function rebuild(){
  byS={};D.forEach(e=>byS[e.s]=e);
  BL={};ADJ={};D.forEach(e=>{BL[e.s]=[];ADJ[e.s]=new Set()});
  D.forEach(e=>{
    const seen=new Set();
    [[e.b,'desc'],[e.c,'ours']].forEach(([txt,where])=>{
      LK.lastIndex=0;let m;
      while((m=LK.exec(txt||''))){
        const t=m[1];if(!byS[t]||t===e.s||seen.has(t))continue;
        seen.add(t);BL[t].push({s:e.s,where,snip:snip(txt,t)});
        ADJ[e.s].add(t);ADJ[t].add(e.s);
      }
    });
  });
}
const b3=e=>(BL[e.s]||[]).length;

/* ---------- fuzzy ---------- */
function dl(a,b){
  const m=a.length,n=b.length,d=[];
  for(let i=0;i<=m;i++)d[i]=[i];
  for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
    const c=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[m][n];
}
function score(q,cand){
  q=nm(q);cand=nm(cand);if(!q)return 0;
  if(cand===q)return 1;
  if(cand.startsWith(q))return .96;
  const toks=cand.split(/\s+/);
  if(toks.some(t=>t.startsWith(q)))return .92;
  if(cand.includes(q))return .84;
  let best=0;
  [cand,...toks].forEach(t=>{if(Math.abs(t.length-q.length)>3)return;
    const v=1-dl(q,t)/Math.max(q.length,t.length,1);if(v>best)best=v});
  [cand,...toks].forEach(t=>{if(t.length<=q.length)return;
    const v=1-dl(q,t.slice(0,q.length))/q.length;if(v-.08>best)best=v-.08});
  return best;
}
function find(q,limit=7){
  if(!nm(q))return[];
  return D.map(e=>{let s=score(q,e.n),via=null;
    (e.a||[]).forEach(al=>{const v=score(q,al)-.02;if(v>s){s=v;via=al}});
    return{e,s,via}})
   .filter(x=>x.s>=.5).sort((a,b)=>b.s-a.s||a.e.n.length-b.e.n.length).slice(0,limit);
}

/* ---------- carga desde Supabase ---------- */
async function loadCamps(){
  const {data,error}=await SB.from('campaigns')
    .select('id,name,slug,blurb,party_name').order('created_at');
  if(error){toast('No se pudo conectar');return}
  CAMPS=data||[];
}
async function loadCamp(c){
  st.busy=true;r();
  const [ents,als]=await Promise.all([
    SB.from('entities')
      .select('id,slug,type,name,summary,body,notes,status,image_url,is_party')
      .eq('campaign_id',c.id).is('archived_at',null).order('name'),
    SB.from('entity_aliases').select('alias,entities!inner(campaign_id,slug)')
      .eq('entities.campaign_id',c.id)
  ]);
  const amap={};
  (als.data||[]).forEach(x=>{const s=x.entities.slug;(amap[s]=amap[s]||[]).push(x.alias)});
  D=(ents.data||[]).map(e=>({id:e.id,s:e.slug,t:e.type,n:e.name,sm:e.summary||'',
    b:e.body||'',c:e.notes||'',st:e.status,img:e.image_url,pc:e.is_party?1:0,a:amap[e.slug]||[]}));
  cur=c;rebuild();
  const top=D.slice().sort((a,b)=>b3(b)-b3(a))[0];
  st.ent=top?top.s:null;st.busy=false;
}

/* ---------- navegación ---------- */
const go=id=>{hist.push({tab:st.tab,ent:st.ent});st.ent=id;st.tab='ficha';st.editing=null;r();scrollTo(0,0)};
const tab=t=>{hist.push({tab:st.tab,ent:st.ent});st.tab=t;st.editing=null;st.q='';r();scrollTo(0,0)};
function back(){
  const prev=hist.pop();
  if(prev){st.tab=prev.tab;st.ent=prev.ent}
  else st.tab='idx';
  st.editing=null;r();scrollTo(0,0);
}
function toast(m){st.toast=m;r();setTimeout(()=>{st.toast='';r()},2800)}
async function setCamp(i){hist=[];await loadCamp(CAMPS[i]);st.tab='idx';st.q='';st.editing=null;r();scrollTo(0,0)}
function home(){hist=[];st.tab='home';st.q='';r();scrollTo(0,0)}

async function newCamp(){
  const el=document.getElementById('newc'),n=(el?el.value:'').trim();
  if(!n){toast('Poné un nombre primero');return}
  const slug=nm(n).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('c'+Date.now());
  const {data,error}=await SB.from('campaigns')
    .insert({name:n,slug,blurb:'Recién creada',is_public:true}).select().single();
  if(error){toast('No se pudo crear: '+error.message);return}
  CAMPS.push(data);await setCamp(CAMPS.length-1);toast('Campaña "'+n+'" creada');
}

function prose(txt){
  return (txt||'').split(/\n\n+/).filter(Boolean).map(p=>'<p>'+esc(p).replace(/\[\[([a-z0-9\-]+)\]\]/g,(m,k)=>{
    const e=byS[k];return e?`<span class="lc">${av(e,17)}<a class="link" style="color:${TYPES[e.t].c}" onclick="go('${k}')">${esc(e.n)}</a></span>`:m;
  })+'</p>').join('');
}

/* ================= HOME ================= */
function vHome(){
  return `<div class="page" style="padding-top:calc(30px + env(safe-area-inset-top))">
    <div class="eyebrow">Codex</div>
    <h1 style="margin-bottom:5px">Tus campañas</h1>
    <div class="hint">Cada una tiene sus propias fichas, su propio grafo y su propia memoria.</div>
    <div class="card">${CAMPS.length?CAMPS.map((c,i)=>`
      <div class="row" onclick="setCamp(${i})">
        <span class="dot" style="background:var(--character);margin-top:8px"></span>
        <div style="flex:1">
          <div style="font-family:var(--disp);font-size:19px;font-weight:600">${esc(c.name)}</div>
          <div class="rs">${esc(c.blurb||'')}</div></div>
        <span class="rc">→</span></div>`).join('')
      :`<div class="row"><div class="rs">Cargando…</div></div>`}</div>
    <div class="sec"><div class="sech">Empezar otra</div>
      <input class="sfield" id="newc" placeholder="Nombre de la campaña nueva">
      <button class="btn sec2" onclick="newCamp()">Crear campaña</button></div>
  </div>`;
}

/* ================= ÍNDICE ================= */
function rowHTML(e,via){
  return `<div class="row" onclick="go('${e.s}')">${av(e,30)}
    <div style="flex:1"><div class="rn">${esc(e.n)}</div>
      <div class="rs">${esc(e.sm)}${via?` · coincide con "${esc(via)}"`:''}</div></div>
    <span class="rc">${b3(e)}</span></div>`;
}
function cardHTML(e){
  return `<div class="ccard" onclick="go('${e.s}')">${av(e,64)}
    <div class="ccn">${esc(e.n)}</div>
    <div class="ccc">${b3(e)} menciones</div></div>`;
}
function group(list,via){
  if(st.view==='cards')return `<div class="cgrid">${list.map(e=>cardHTML(e)).join('')}</div>`;
  return `<div class="card">${list.map(e=>rowHTML(e,via)).join('')}</div>`;
}
function viewToggle(){
  return `<div style="display:flex;justify-content:flex-end;gap:6px;margin:0 0 16px">
    <button class="gbtn" style="${st.view==='list'?'background:var(--ivory);border-color:var(--ivory);color:var(--ink)':''}"
      onclick="st.view='list';r()">Lista</button>
    <button class="gbtn" style="${st.view==='cards'?'background:var(--ivory);border-color:var(--ivory);color:var(--ink)':''}"
      onclick="st.view='cards';r()">Cards</button>
  </div>`;
}
function vIdx(){
  const hits=find(st.q,40);
  const hitsBody = hits.length
    ? (st.view==='cards' ? `<div class="cgrid">${hits.map(({e})=>cardHTML(e)).join('')}</div>`
       : `<div class="card">${hits.map(({e,via})=>rowHTML(e,via)).join('')}</div>`)
    : `<div class="hint" style="padding:20px 0">Nada parecido a "${esc(st.q)}". Probá con menos letras.</div>`;
  const body = st.q.trim() ? hitsBody : (()=>{
        const pcs=D.filter(e=>e.pc);
        let out=pcs.length?`<div class="grp">
          <div class="grph" style="color:var(--ivory)">${esc(cur.party_name||'Nuestro grupo')}
            <span class="ct">${pcs.length}</span></div>
          ${group(pcs)}</div>`:'';
        out+=ORDER.map(t=>{
          const g=D.filter(e=>e.t===t&&!e.pc).sort((a,b)=>b3(b)-b3(a)||a.n.localeCompare(b.n));
          if(!g.length)return'';
          return `<div class="grp"><div class="grph" style="color:${TYPES[t].c}">
            ${TYPES[t].l}<span class="ct">${g.length}</span></div>
            ${group(g)}</div>`;
        }).join('');
        return out;
      })();
  return `<div class="top"><div class="topin">
      <button class="back" onclick="home()">‹ Campañas</button>
      <input class="sfield" placeholder="Buscar (aguanta errores de tipeo)" value="${esc(st.q)}"
        oninput="st.q=this.value;r();focusEnd()"></div></div>
    <div class="page">
      ${st.q.trim()?'':`<div class="eyebrow">Campaña</div><h1 style="margin-bottom:4px">${esc(cur.name)}</h1>
      <div class="hint">${D.length} fichas · ${Object.values(BL).reduce((a,b)=>a+b.length,0)} vínculos</div>`}
      ${D.length?viewToggle()+body:`<div class="card"><div class="row" onclick="edit(null)">
        <span class="dot" style="background:var(--location);margin-top:7px"></span>
        <div style="flex:1"><div class="rn">Crear la primera ficha</div>
        <div class="rs">Todavía no hay nada en esta campaña.</div></div></div></div>`}
    </div>`;
}

/* ================= FICHA ================= */
function vFicha(){
  const e=byS[st.ent],c=TYPES[e.t].c,bl=BL[e.s]||[];
  const rel=[...(ADJ[e.s]||[])].map(s=>byS[s]).filter(Boolean).sort((a,b)=>a.n.localeCompare(b.n));
  return `<div class="top"><div class="topin">
      <button class="back" onclick="back()">← Atrás</button>
      <button class="back" style="margin-left:auto" onclick="edit('${e.s}')">Editar</button>
    </div></div>
  <div class="page">
    <div class="pcbar">${e.img?`<span onclick="openImg('${e.img}')" style="cursor:pointer">${av(e,78)}</span>`:av(e,78)}
      <div><div class="eyebrow" style="color:${e.pc?'var(--ivory)':c};margin-bottom:2px">
        ${e.pc?esc(cur.party_name||'Nuestro grupo'):TYPES[e.t].s}</div>
        <h1 style="margin:0">${esc(e.n)}</h1></div></div>
    ${e.a&&e.a.length?`<div class="aka">también: ${e.a.map(esc).join(' · ')}</div>`:''}
    <div class="meta">${e.st?`<span class="chip">${esc(e.st)}</span>`:''}
      <span class="chip">${bl.length} menciones</span>
      <span class="chip">${rel.length} conexiones</span></div>
    <div class="prose">${prose(e.b)||'<p style="color:var(--dim)">Sin descripción todavía.</p>'}</div>
    ${e.c?`<div class="sec"><div class="sech">Con nosotros</div><div class="ours">${prose(e.c)}</div></div>`:''}
    ${bl.length?`<div class="sec"><div class="sech">Se lo menciona en</div>
      <div class="rail">${bl.map(b=>{const src=byS[b.s];const col=TYPES[src.t].c;
        return `<div class="bl" style="color:${col}" onclick="go('${b.s}')">
          <div class="blsrc">${esc(src.n)}${b.where==='ours'?' <span style="opacity:.55;font-weight:400">· con nosotros</span>':''}</div>
          <div class="blsnip">${esc(b.snip).replace(/§(.*?)§/g,'<em>$1</em>')}</div></div>`}).join('')}
      </div></div>`:''}
    ${rel.length?`<div class="sec"><div class="sech">Conectado con</div>
      <div class="card">${rel.map(x=>`<div class="row" onclick="go('${x.s}')">${av(x,26)}
        <div style="flex:1"><div class="rn">${esc(x.n)}</div></div>
        <span class="rc">${TYPES[x.t].s}</span></div>`).join('')}</div></div>`:''}
    <div class="sec"><button class="btn sec2" onclick="hist.push({tab:'ficha',ent:st.ent});st.tab='grafo';r()">Ver en el grafo</button></div>
  </div>`;
}

/* ================= EDITOR ================= */
function edit(slug){st.editing={slug,isNew:!slug};st.tab='ed';st.ac=null;st.acPick=null;r();scrollTo(0,0)}
function vEd(){
  const e=st.editing.slug?byS[st.editing.slug]:null,E=st.editing;
  const name=E.dn!==undefined?E.dn:(e?e.n:'');
  const bodyTxt=E.db!==undefined?E.db:(e?e.b:'');
  const noteTxt=E.dc!==undefined?E.dc:(e?e.c:'');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const isPc=E.pc!==undefined?E.pc:(e?!!e.pc:false);
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  const prev={n:name||'?',t:type,img};
  return `<div class="top"><div class="topin">
      <button class="back" onclick="${e?`go('${e.s}')`:`tab('idx')`}">← Cancelar</button>
      <span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--dim)">
        ${e?'EDITANDO':'FICHA NUEVA'}</span></div></div>
  <div class="page">
    <div class="eyebrow">Foto</div>
    <div style="display:flex;gap:13px;align-items:center;margin-bottom:20px">
      ${av(prev,58)}
      <div style="flex:1">
        <label class="btn sec2" style="margin:0;display:block;text-align:center">
          ${img?'Cambiar foto':'Elegir foto'}
          <input type="file" accept="image/*" style="display:none" onchange="upImg(event)"></label>
        ${img?`<button class="btn sec2" onclick="keepDraft();st.editing.img=null;r()">Quitar</button>`
             :`<div class="hint" style="margin:7px 0 0">Sin foto se usan las iniciales.</div>`}
      </div></div>

    <div class="eyebrow">Nombre</div>
    <input class="sfield" id="fn" value="${esc(name)}" placeholder="Nombre de la ficha">

    <div class="eyebrow" style="margin-top:18px">Tipo</div>
    <div class="gctl" style="padding:0">${ORDER.map(t=>`<button class="gbtn"
      style="${type===t?`background:${TYPES[t].c};border-color:${TYPES[t].c};color:var(--ink)`:`color:${TYPES[t].c};border-color:${TYPES[t].c}66`}"
      onclick="keepDraft();st.editing.type='${t}';r()">${TYPES[t].s}</button>`).join('')}</div>

    <button class="btn sec2" style="margin-top:13px;${isPc?'border-color:var(--ivory);color:var(--ivory)':''}"
      onclick="keepDraft();st.editing.pc=!st.editing.pc;r()">
      ${isPc?'✓ ':''}Es de ${esc(cur.party_name||'nuestro grupo')}</button>

    <div class="eyebrow" style="margin-top:20px">Descripción — qué es</div>
    <div class="acwrap">
      <div class="ed" id="edB" contenteditable="true" data-ph="Escribí acá. Poné @ para enlazar con otra ficha."
        oninput="onEd(this)" onkeyup="onEd(this)" onclick="onEd(this)">${toHTML(bodyTxt)}</div>
      ${st.ac&&st.ac.f==='edB'?acHTML():''}
    </div>
    <div class="eyebrow" style="margin-top:20px">Con nosotros — qué nos pasó</div>
    <div class="acwrap">
      <div class="ed" id="edC" contenteditable="true" style="min-height:130px"
        data-ph="Lo que hicimos, lo que sospechamos, lo que nos deben."
        oninput="onEd(this)" onkeyup="onEd(this)" onclick="onEd(this)">${toHTML(noteTxt)}</div>
      ${st.ac&&st.ac.f==='edC'?acHTML():''}
    </div>
    <div class="hint">Escribí @ y las primeras letras. Encuentra igual si le errás: probá @kasalander o @piedar.<br>
      Para sacar un nombre ya enlazado, tocalo una vez (queda marcado) y tocalo de nuevo. La tecla de borrar también funciona.</div>
    <button class="btn pri" onclick="save()">${st.busy?'Guardando…':'Guardar'}</button>
  </div>`;
}
function toHTML(txt){
  return esc(txt||'').replace(/\[\[([a-z0-9\-]+)\]\]/g,(m,k)=>{const e=byS[k];
    return e?`<span class="tok" contenteditable="false" data-s="${k}" style="color:${TYPES[e.t].c}">${av(e,15)}<span class="nmtx">${esc(e.n)}</span></span>`:m;
  }).replace(/\n/g,'<br>');
}
function fromDOM(el){
  let out='';
  (function walk(n){n.childNodes.forEach(k=>{
    if(k.nodeType===3)out+=k.textContent;
    else if(k.nodeName==='BR')out+='\n';
    else if(k.classList&&k.classList.contains('tok'))out+='[['+k.dataset.s+']]';
    else{if(k.nodeName==='DIV'&&out&&!out.endsWith('\n'))out+='\n';walk(k)}
  })})(el);
  return out.replace(/\u00A0/g,' ').trim();
}
function keepDraft(){
  const b=document.getElementById('edB'),c=document.getElementById('edC'),n=document.getElementById('fn');
  if(b)st.editing.db=fromDOM(b);
  if(c)st.editing.dc=fromDOM(c);
  if(n)st.editing.dn=n.value;
  if(st.editing.pc===undefined){const e=st.editing.slug?byS[st.editing.slug]:null;st.editing.pc=e?!!e.pc:false}
}
function shrink(file){
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();
      im.onload=()=>{const S=320,sc=Math.min(S/im.width,S/im.height,1);
        const w=Math.max(1,Math.round(im.width*sc)),h=Math.max(1,Math.round(im.height*sc));
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;
        cv.getContext('2d').drawImage(im,0,0,w,h);
        res(cv.toDataURL('image/jpeg',.82))};
      im.onerror=()=>rej();im.src=rd.result};
    rd.onerror=()=>rej();rd.readAsDataURL(file);
  });
}
async function upImg(ev){
  const f=ev.target.files&&ev.target.files[0];if(!f)return;
  keepDraft();
  try{st.editing.img=await shrink(f);r();toast('Foto lista — falta guardar')}
  catch(_){toast('No se pudo leer la imagen')}
}

/* --- chips: borrar con toque doble o con la tecla --- */
function dropTok(t){
  const nx=t.nextSibling;
  if(nx&&nx.nodeType===3&&/^[\u00A0 ]/.test(nx.textContent))nx.textContent=nx.textContent.slice(1);
  t.remove();
}
function tokTap(ev){
  const t=ev.target.closest?ev.target.closest('.tok'):null;
  if(!t){document.querySelectorAll('.tok.sel').forEach(x=>x.classList.remove('sel'));return}
  ev.preventDefault();
  if(t.classList.contains('sel'))dropTok(t);
  else{document.querySelectorAll('.tok.sel').forEach(x=>x.classList.remove('sel'));t.classList.add('sel')}
}
function prevDeep(n){
  while(n&&!n.previousSibling&&n.parentNode&&!(n.parentNode.classList&&n.parentNode.classList.contains('ed')))n=n.parentNode;
  return n?n.previousSibling:null;
}
function killTok(e){
  if(e.inputType!=='deleteContentBackward'&&e.inputType!=='deleteWordBackward')return;
  const sel=getSelection();if(!sel.rangeCount||!sel.isCollapsed)return;
  const rg=sel.getRangeAt(0);let n=rg.startContainer,o=rg.startOffset,tgt=null;
  if(n.nodeType===3){if(o===0)tgt=prevDeep(n)}else tgt=n.childNodes[o-1];
  if(tgt&&tgt.nodeType===1&&tgt.classList&&tgt.classList.contains('tok')){e.preventDefault();dropTok(tgt)}
}
function wireEd(){
  ['edB','edC'].forEach(id=>{const el=document.getElementById(id);if(!el)return;
    el.addEventListener('beforeinput',killTok);el.addEventListener('click',tokTap)});
}

/* --- autocompletado @ --- */
function caretQ(){
  const sel=getSelection();if(!sel.rangeCount)return null;
  const rg=sel.getRangeAt(0);if(rg.startContainer.nodeType!==3)return null;
  const before=rg.startContainer.textContent.slice(0,rg.startOffset);
  const m=before.match(/@([\p{L}\p{N}]*(?:[ ][\p{L}\p{N}]*)?)$/u);
  if(!m)return null;
  return{node:rg.startContainer,from:rg.startOffset-m[0].length,to:rg.startOffset,q:m[1]};
}
function onEd(el){
  const c=caretQ();
  st.ac=c?{f:el.id,q:c.q,hits:find(c.q)}:null;
  if(!c)st.acPick=null;
  paintAC();
}
function paintAC(){
  document.querySelectorAll('.ac').forEach(n=>n.remove());
  if(!st.ac)return;
  const host=document.getElementById(st.ac.f);if(!host)return;
  const d=document.createElement('div');d.className='ac';d.innerHTML=acInner();
  host.parentNode.appendChild(d);
}
const acHTML=()=>`<div class="ac">${acInner()}</div>`;
function acInner(){
  const{q,hits}=st.ac;
  if(st.acPick!==null&&st.acPick!==undefined)return `<div class="tp">${ORDER.map(t=>
    `<button class="tpb" style="color:${TYPES[t].c}" onmousedown="event.preventDefault()"
      onclick="mkNew('${t}')">${TYPES[t].s}</button>`).join('')}
    <div style="width:100%;font-family:var(--mono);font-size:10px;color:var(--dim);padding-top:4px">
      ¿Qué tipo es "${esc(q)}"?</div></div>`;
  const rows=hits.map(({e,via,s})=>`<div class="acr" onmousedown="event.preventDefault()" onclick="pick('${e.s}')">
      ${av(e,26)}<div style="flex:1"><div class="acn">${esc(e.n)}</div>
      <div class="acs">${TYPES[e.t].s.toUpperCase()}${via?' · POR "'+esc(via).toUpperCase()+'"':''}${s<.9?' · APROX':''}</div></div>
    </div>`).join('');
  const create=q.trim()?`<div class="acr" onmousedown="event.preventDefault()" onclick="st.acPick='${esc(q)}';paintAC()">
      <span class="dot" style="background:var(--location)"></span>
      <div class="acnew">Crear ficha "${esc(q)}"</div></div>`:'';
  return rows+create||`<div class="hint" style="padding:14px">Seguí escribiendo…</div>`;
}
function pick(slug){
  const c=caretQ();if(!c)return;
  const rg=document.createRange();rg.setStart(c.node,c.from);rg.setEnd(c.node,c.to);rg.deleteContents();
  const e=byS[slug];
  const sp=document.createElement('span');
  sp.className='tok';sp.contentEditable='false';sp.dataset.s=slug;
  sp.style.color=TYPES[e.t].c;sp.innerHTML=av(e,15)+`<span class="nmtx">${esc(e.n)}</span>`;
  const sep=document.createTextNode('\u00A0');
  rg.insertNode(sep);rg.insertNode(sp);
  const nr=document.createRange();nr.setStartAfter(sep);nr.collapse(true);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(nr);
  st.ac=null;st.acPick=null;paintAC();
}
async function mkNew(type){
  const name=String(st.acPick).trim();
  const slug=nm(name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('f'+Date.now());
  if(!byS[slug]){
    const {data,error}=await SB.from('entities').insert({
      campaign_id:cur.id,slug,type,name:name.charAt(0).toUpperCase()+name.slice(1),
      summary:'Ficha nueva, falta completar.',body:'',notes:''}).select().single();
    if(error){toast('No se pudo crear: '+error.message);return}
    D.push({id:data.id,s:slug,t:type,n:data.name,sm:data.summary,b:'',c:'',a:[],pc:0});
    rebuild();
  }
  pick(slug);toast('Ficha "'+name+'" creada');
}

async function save(){
  const nameEl=document.getElementById('fn');
  const name=nameEl?nameEl.value.trim():'';
  if(!name){toast('Falta el nombre');return}
  const body=fromDOM(document.getElementById('edB'));
  const notes=fromDOM(document.getElementById('edC'));
  const E=st.editing;
  const e=E.slug?byS[E.slug]:null;
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const pc=E.pc!==undefined?!!E.pc:(e?!!e.pc:false);
  const summary=(e&&e.sm)?e.sm:(body.replace(LK,(_,k)=>byS[k]?byS[k].n:'').slice(0,80)||'Sin descripción.');
  st.busy=true;r();
  let res;
  if(e&&e.id){
    res=await SB.from('entities').update({name,body,notes,type,image_url:img,is_party:pc})
      .eq('id',e.id).select().single();
  }else{
    const slug=nm(name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('f'+Date.now());
    res=await SB.from('entities').insert({campaign_id:cur.id,slug,type,name,summary,
      body,notes,image_url:img,is_party:pc}).select().single();
  }
  st.busy=false;
  if(res.error){toast('No se guardó: '+res.error.message);r();return}
  const before=e?new Set([...(ADJ[e.s]||[])]):new Set();
  await loadCamp(cur);
  st.ent=res.data.slug;st.editing=null;st.tab='ficha';
  const added=[...(ADJ[st.ent]||[])].filter(x=>!before.has(x)).length;
  toast(added?`Guardado · ${added} vínculo${added>1?'s':''} nuevo${added>1?'s':''}`:'Guardado');
}

/* ================= GRAFO ================= */
function vGrafo(){
  const e=byS[st.ent];
  const opts=D.slice().sort((a,b)=>a.n.localeCompare(b.n))
    .map(x=>`<option value="${x.s}" ${x.s===e.s?'selected':''}>${esc(x.n)}</option>`).join('');
  return `<div class="top"><div class="topin">
      <button class="back" onclick="back()">← Atrás</button>
      <select class="sfield" style="flex:1" onchange="st.ent=this.value;r()">${opts}</select>
    </div></div>
  <div class="gwrap"><canvas id="cv"></canvas>
    <div class="ghint">tocá un nodo para abrirlo · arrastrá para acomodar</div></div>
  <div class="gctl">${[1,2,3].map(d=>`<button class="gbtn"
    style="${st.depth===d?'background:var(--ivory);border-color:var(--ivory);color:var(--ink)':''}"
    onclick="st.depth=${d};r()">${d} salto${d>1?'s':''}</button>`).join('')}</div>
  <div class="page"><div class="hint">Centro: ${esc(e.n)}. A 3 saltos se satura — por eso el grafo es una vista de apoyo, no la principal.</div></div>`;
}
let raf=null;
function graph(){
  const cv=document.getElementById('cv');if(!cv)return;
  const seen={[st.ent]:0},q=[[st.ent,0]];
  while(q.length){const[id,d]=q.shift();if(d>=st.depth)continue;
    (ADJ[id]||[]).forEach(n=>{if(!(n in seen)){seen[n]=d+1;q.push([n,d+1])}})}
  const ids=Object.keys(seen),E2=[];
  ids.forEach(a=>(ADJ[a]||[]).forEach(b=>{if(seen[b]!==undefined&&a<b)E2.push([a,b])}));
  const W=cv.clientWidth,H=Math.min(Math.round(innerHeight*.46),430),dpr=devicePixelRatio||1;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.height=H+'px';
  const cx=cv.getContext('2d');cx.scale(dpr,dpr);
  const N=ids.map((id,i)=>({id,x:W/2+Math.cos(i/ids.length*6.28)*70+Math.random()*8,
    y:H/2+Math.sin(i/ids.length*6.28)*70+Math.random()*8,vx:0,vy:0,root:id===st.ent}));
  const M=Object.fromEntries(N.map(n=>[n.id,n]));let drag=null,moved=false;
  const rep=ids.length>24?1500:2600,lnk=ids.length>24?60:82;
  function tick(){
    for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){
      const a=N[i],b=N[j],dx=b.x-a.x,dy=b.y-a.y;let d2=dx*dx+dy*dy||.01;
      const d=Math.sqrt(d2),f=rep/d2;a.vx-=dx/d*f;a.vy-=dy/d*f;b.vx+=dx/d*f;b.vy+=dy/d*f}
    E2.forEach(([x,y])=>{const a=M[x],b=M[y];if(!a||!b)return;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.01,f=(d-lnk)*.032;
      a.vx+=dx/d*f;a.vy+=dy/d*f;b.vx-=dx/d*f;b.vy-=dy/d*f});
    N.forEach(n=>{n.vx+=(W/2-n.x)*.007;n.vy+=(H/2-n.y)*.007;
      if(n===drag)return;n.vx*=.86;n.vy*=.86;n.x+=n.vx;n.y+=n.vy;
      n.x=Math.max(24,Math.min(W-24,n.x));n.y=Math.max(24,Math.min(H-24,n.y))})}
  function draw(){
    cx.clearRect(0,0,W,H);
    cx.strokeStyle='rgba(138,148,166,.28)';cx.lineWidth=1;
    E2.forEach(([x,y])=>{const a=M[x],b=M[y];if(!a||!b)return;
      cx.beginPath();cx.moveTo(a.x,a.y);cx.lineTo(b.x,b.y);cx.stroke()});
    N.forEach(n=>{const e=byS[n.id];if(!e)return;const c=TYPES[e.t].c,rr=n.root?11:(ids.length>24?5:7);
      if(n.root){cx.strokeStyle=c;cx.globalAlpha=.35;cx.lineWidth=1.5;
        cx.beginPath();cx.arc(n.x,n.y,rr+7,0,6.29);cx.stroke();cx.globalAlpha=1}
      cx.fillStyle=c;cx.beginPath();cx.arc(n.x,n.y,rr,0,6.29);cx.fill();
      if(ids.length<=26||n.root){cx.fillStyle=n.root?'#E8E3D9':'rgba(232,227,217,.7)';
        cx.font=(n.root?'600 13px ':'500 10.5px ')+"'Inter Tight',sans-serif";
        cx.textAlign='center';cx.fillText(e.n,n.x,n.y+rr+13)}})}
  function loop(){tick();draw();raf=requestAnimationFrame(loop)}
  if(raf)cancelAnimationFrame(raf);loop();
  const at=ev=>{const b=cv.getBoundingClientRect(),t=ev.touches?ev.touches[0]:ev;
    return{x:t.clientX-b.left,y:t.clientY-b.top}};
  const dn=ev=>{const p=at(ev);drag=N.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<22);moved=false;if(drag)ev.preventDefault()};
  const mv=ev=>{if(!drag)return;ev.preventDefault();const p=at(ev);
    if(Math.hypot(p.x-drag.x,p.y-drag.y)>4)moved=true;drag.x=p.x;drag.y=p.y;drag.vx=drag.vy=0};
  const up=()=>{if(drag&&!moved)go(drag.id);drag=null};
  cv.ontouchstart=dn;cv.ontouchmove=mv;cv.ontouchend=up;
  cv.onmousedown=dn;cv.onmousemove=mv;cv.onmouseup=up;cv.onmouseleave=()=>drag=null;
}

/* ================= shell ================= */
const IC={idx:'<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
 grafo:'<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="17" r="2.4"/><circle cx="19" cy="17" r="2.4"/><path d="M10.5 7 6.6 14.8M13.5 7l3.9 7.8M7.4 17h9.2"/>',
 nueva:'<path d="M12 5v14M5 12h14"/>'};
function r(){
  if(raf){cancelAnimationFrame(raf);raf=null}
  const navEl=document.querySelector('.nav');
  const T=st.toast?`<div class="toast">${esc(st.toast)}</div>`:'';
  if(st.tab==='home'||!cur){app.innerHTML=vHome()+T;navEl.style.display='none';return}
  navEl.style.display='';
  if((st.tab==='ficha'||st.tab==='grafo')&&!byS[st.ent])st.tab='idx';
  const v={idx:vIdx,ficha:vFicha,grafo:vGrafo,ed:vEd}[st.tab]||vIdx;
  app.innerHTML=v()+T;
  const on=st.tab==='grafo'?'grafo':(st.tab==='ed'?'nueva':'idx');
  document.getElementById('nav').innerHTML=[['idx','Índice'],['grafo','Grafo'],['nueva','Nueva']]
    .map(([k,l])=>`<button class="nb ${on===k?'on':''}"
      onclick="${k==='nueva'?'edit(null)':`tab('${k}')`}">
      <svg viewBox="0 0 24 24">${IC[k]}</svg>${l}</button>`).join('');
  if(st.tab==='ed')wireEd();
  if(st.tab==='grafo')requestAnimationFrame(graph);
}
function focusEnd(){const i=document.querySelector('.sfield');if(i){i.focus();const v=i.value;i.value='';i.value=v}}
addEventListener('resize',()=>{if(st.tab==='grafo')graph()});

(async()=>{r();await loadCamps();r()})();
