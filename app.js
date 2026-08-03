/* ============================================================
   Codex de campaña — conectado a Supabase
   ============================================================ */
const SB = window.supabase.createClient(
  'https://xsszobpirqgruyfnewus.supabase.co',
  'sb_publishable_RtJPtQosXcyZHtVJCTmpOA_lnNqIebj'
);

const TYPES={
  character:{l:'Personajes',s:'Personaje',c:'#E0B25C'},
  location :{l:'Lugares'   ,s:'Lugar'    ,c:'#4FB795'},
  item     :{l:'Objetos'   ,s:'Objeto'   ,c:'#B48BD8'},
  faction  :{l:'Facciones' ,s:'Facción'  ,c:'#E0696E'},
  creature :{l:'Criaturas' ,s:'Criatura' ,c:'#6F9AD6'}
};
const FALLBACK={l:'Otros',s:'Ficha',c:'#94A0B3'};
const ORDER=['character','faction','location','item','creature'];
/* nunca explota si la base trae un tipo que no conocemos */
const TY=e=>(e&&TYPES[e.t])||FALLBACK;
const TYT=t=>TYPES[t]||FALLBACK;

let CAMPS=[], cur=null, D=[], byS={}, BL={}, ADJ={}, EDGES=[];
let st={tab:'home',ent:null,q:'',editing:null,ac:null,acPick:null,busy:false,view:'list',err:''};
let hist=[];
const app=document.getElementById('app');

/* ---------- utilidades ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const att=esc;                       // mismo escape, sirve para atributos
const nm=s=>String(s==null?'':s).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim();
const LK=/\[\[([a-z0-9\-]+)\]\]/g;
const slugify=s=>nm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/* ---------- avatares ----------
   Un solo componente para toda la app. Debajo van siempre las iniciales;
   la foto se dibuja encima y, si falla, se borra sola y quedan las iniciales.
   Ese era el motivo de los avatares "rotos".
   Los tamaños salen de esta escala y de ninguna otra parte. */
const AV={xs:18,sm:28,md:36,lg:44,xl:56,hero:72};
function initials(name,one){
  const w=String(name||'?').replace(/^(la|el|los|las|the)\s+/i,'')
    .split(/\s+/).filter(x=>x.length>1);
  if(one) return ((w[0]||name||'?')[0]||'?').toUpperCase();
  return (w.length>1 ? w[0][0]+w[1][0] : (w[0]||name||'?').slice(0,2)).toUpperCase();
}
function av(e,size,o){
  if(!e) return '';
  o=o||{};
  const c=TY(e).c;
  /* size 'em': el avatar se mide en relación al texto que lo rodea. Lo usan las
     menciones en línea, que tienen que seguir el cuerpo del párrafo. */
  const em=size==='em';
  const one=em||size<30;                               // en chico, una sola letra
  const ini=initials(e.n,one);
  const cls='av'+(em?' em':'')+(o.sq?' sq':'')+(o.ring?' ring':'')+(o.big?' big':'');
  const style=em?`--c:${c}`:`--c:${c};width:${size}px;height:${size}px`;
  const ifs=em?'':` style="font-size:${Math.max(9,Math.round(size*(one?.46:.38)))}px"`;
  const img=e.img
    ? `<img src="${att(e.img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
    : '';
  return `<span class="${cls}" style="${style}"><span class="avi"${ifs}>${esc(ini)}</span>${img}</span>`;
}

/* ---------- índices derivados ---------- */
function snip(txt,slug){
  const m=String(txt||'').match(new RegExp('[^.\\n]*\\[\\['+slug+'\\]\\][^.\\n]*'));
  return m ? m[0].trim().replace(LK,(_,k)=>byS[k]?'§'+byS[k].n+'§':'') : '';
}
function rebuild(){
  byS={};D.forEach(e=>byS[e.s]=e);
  BL={};ADJ={};D.forEach(e=>{BL[e.s]=[];ADJ[e.s]=new Set()});
  const wmap={};
  D.forEach(e=>{
    const seen=new Set();
    [[e.b,'desc'],[e.c,'ours']].forEach(([txt,where])=>{
      LK.lastIndex=0;let m;
      while((m=LK.exec(txt||''))){
        const t=m[1];
        if(!byS[t]||t===e.s||seen.has(t))continue;
        seen.add(t);
        BL[t].push({s:e.s,where,snip:snip(txt,t)});
        ADJ[e.s].add(t);ADJ[t].add(e.s);
        const k=e.s<t?e.s+'|'+t:t+'|'+e.s;
        wmap[k]=(wmap[k]||0)+1;
      }
    });
  });
  EDGES=Object.keys(wmap).map(k=>{const[a,b]=k.split('|');return{a,b,w:wmap[k]}});
}
const b3=e=>(BL[e.s]||[]).length;
const deg=s=>(ADJ[s]||{size:0}).size||0;

/* ---------- búsqueda difusa ---------- */
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
  if(error){st.err='No se pudo conectar con la base. Revisá la conexión y recargá.';toast('No se pudo conectar','err');return}
  st.err='';CAMPS=data||[];
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
  st.busy=false;
  if(ents.error){toast('No se pudieron cargar las fichas','err');return}
  const amap={};
  (als.data||[]).forEach(x=>{const s=x.entities.slug;(amap[s]=amap[s]||[]).push(x.alias)});
  D=(ents.data||[]).map(e=>({id:e.id,s:e.slug,t:e.type,n:e.name,sm:e.summary||'',
    b:e.body||'',c:e.notes||'',st:e.status,img:e.image_url,pc:e.is_party?1:0,a:amap[e.slug]||[]}));
  cur=c;rebuild();
  G.pos={};G.sel=null;                 // el grafo arranca limpio en cada campaña
  if(!st.ent||!byS[st.ent]){
    const top=D.slice().sort((a,b)=>deg(b.s)-deg(a.s)||b3(b)-b3(a))[0];
    st.ent=top?top.s:null;
  }
}

/* ---------- navegación ---------- */
function go(id){
  if(!byS[id])return;
  hist.push({tab:st.tab,ent:st.ent});
  if(hist.length>60)hist.shift();
  st.ent=id;st.tab='ficha';st.editing=null;r();scrollTo(0,0);
}
function tab(t){
  hist.push({tab:st.tab,ent:st.ent});
  if(hist.length>60)hist.shift();
  st.tab=t;st.editing=null;st.q='';r();scrollTo(0,0);
}
function back(){
  const prev=hist.pop();
  if(prev){st.tab=prev.tab;st.ent=prev.ent}else st.tab='idx';
  st.editing=null;r();scrollTo(0,0);
}
async function setCamp(i){
  hist=[];st.ent=null;await loadCamp(CAMPS[i]);
  st.tab='idx';st.q='';st.editing=null;r();scrollTo(0,0);
}
function home(){hist=[];st.tab='home';st.q='';r();scrollTo(0,0)}

/* ---------- toasts (sin re-render: antes borraban lo que estabas escribiendo) ---------- */
function toast(m,kind){
  const host=document.getElementById('toasts');if(!host)return;
  const d=document.createElement('div');
  d.className='toast'+(kind?' '+kind:'');
  d.textContent=m;host.appendChild(d);
  setTimeout(()=>{d.style.opacity='0';d.style.transition='opacity .25s';
    setTimeout(()=>d.remove(),260)},2800);
}

async function newCamp(){
  const el=document.getElementById('newc'),n=(el?el.value:'').trim();
  if(!n){toast('Poné un nombre primero','err');return}
  const slug=slugify(n)||('c'+Date.now());
  const {data,error}=await SB.from('campaigns')
    .insert({name:n,slug,blurb:'Recién creada',is_public:true}).select().single();
  if(error){toast('No se pudo crear: '+error.message,'err');return}
  CAMPS.push(data);await setCamp(CAMPS.length-1);toast('Campaña "'+n+'" creada','ok');
}

/* ---------- prosa con menciones ---------- */
function prose(txt){
  return String(txt||'').split(/\n\n+/).filter(Boolean).map(p=>
    '<p>'+esc(p).replace(LK,(m,k)=>{
      const e=byS[k];
      if(!e)return m;
      return `<a class="men" data-go="${att(k)}" style="--c:${TY(e).c}" title="${att(TY(e).s)}">`+
             av(e,'em')+`<span class="mtx">${esc(e.n)}</span></a>`;
    })+'</p>').join('');
}

/* ================= HOME ================= */
function vHome(){
  const list = st.err
    ? `<div class="empty"><div class="ei">⚠</div><div class="et">Sin conexión</div>
       <div class="es">${esc(st.err)}</div></div>`
    : CAMPS.length
    ? CAMPS.map((c,i)=>`
      <div class="row" data-act="camp" data-v="${i}">
        <span class="dot" style="color:var(--gold);background:var(--gold)"></span>
        <div class="grow">
          <div class="campn">${esc(c.name)}</div>
          <div class="rs">${esc(c.blurb||'')}</div></div>
        <span class="rc">→</span></div>`).join('')
    : `<div class="row"><div class="grow"><div class="skel" style="height:15px;width:45%"></div>
       <div class="skel" style="height:11px;width:70%;margin-top:8px"></div></div></div>`.repeat(3);
  return `<div class="page first">
    <div class="eyebrow">Codex</div>
    <h1>Tus campañas</h1>
    <div class="hint">Cada una tiene sus propias fichas, su propio grafo y su propia memoria.</div>
    <div class="card">${list}</div>
    <div class="sec"><div class="sech">Empezar otra</div>
      <input class="sfield" id="newc" placeholder="Nombre de la campaña nueva">
      <button class="btn sec2" data-act="newcamp">Crear campaña</button></div>
  </div>`;
}

/* ================= ÍNDICE ================= */
function rowHTML(e,via){
  return `<div class="row" data-go="${att(e.s)}">${av(e,AV.md)}
    <div class="grow"><div class="rn">${esc(e.n)}</div>
      <div class="rs">${esc(e.sm)}${via?` · coincide con "${esc(via)}"`:''}</div></div>
    <span class="rc">${b3(e)}</span></div>`;
}
function cardHTML(e){
  return `<div class="ccard" data-go="${att(e.s)}" style="--c:${TY(e).c}">${av(e,AV.xl,{ring:1})}
    <div class="ccn">${esc(e.n)}</div>
    <div class="ccc">${b3(e)} menc.</div></div>`;
}
function group(list,via){
  if(st.view==='cards')return `<div class="cgrid">${list.map(e=>cardHTML(e)).join('')}</div>`;
  return `<div class="card">${list.map(e=>rowHTML(e,via)).join('')}</div>`;
}
function vIdx(){
  const hits=find(st.q,40);
  const hitsBody = hits.length
    ? (st.view==='cards' ? `<div class="cgrid">${hits.map(({e})=>cardHTML(e)).join('')}</div>`
       : `<div class="card">${hits.map(({e,via})=>rowHTML(e,via)).join('')}</div>`)
    : `<div class="empty"><div class="ei">🔍</div><div class="et">Nada parecido</div>
       <div class="es">No encontré nada como "${esc(st.q)}". Probá con menos letras.</div></div>`;
  const body = st.q.trim() ? hitsBody : (()=>{
    const pcs=D.filter(e=>e.pc);
    let out=pcs.length?`<div class="grp">
      <div class="grph" style="color:var(--ink)">${esc(cur.party_name||'Nuestro grupo')}
        <span class="ct">${pcs.length}</span></div>${group(pcs)}</div>`:'';
    out+=ORDER.map(t=>{
      const g=D.filter(e=>e.t===t&&!e.pc).sort((a,b)=>b3(b)-b3(a)||a.n.localeCompare(b.n));
      if(!g.length)return'';
      return `<div class="grp"><div class="grph" style="color:${TYT(t).c}">
        ${TYT(t).l}<span class="ct">${g.length}</span></div>${group(g)}</div>`;
    }).join('');
    const rest=D.filter(e=>!e.pc&&!TYPES[e.t]);
    if(rest.length)out+=`<div class="grp"><div class="grph" style="color:${FALLBACK.c}">
      ${FALLBACK.l}<span class="ct">${rest.length}</span></div>${group(rest)}</div>`;
    return out;
  })();
  const links=EDGES.length;
  return `<div class="top"><div class="topin">
      <button class="back" data-act="home">‹ Campañas</button>
      <input class="sfield" id="q" placeholder="Buscar (aguanta errores de tipeo)"
        value="${att(st.q)}" data-act="search" oninput="st.q=this.value;r()"></div></div>
    <div class="page">
      ${st.q.trim()?'':`<div class="eyebrow">Campaña</div>
      <h1>${esc(cur.name)}</h1>
      <div class="hint">${D.length} ficha${D.length===1?'':'s'} · ${links} vínculo${links===1?'':'s'}</div>`}
      ${D.length?`<div class="segrow">
        <div class="seg">
          <button class="${st.view==='list'?'on':''}" data-act="view" data-v="list">Lista</button>
          <button class="${st.view==='cards'?'on':''}" data-act="view" data-v="cards">Cards</button>
        </div></div>`+body
      :`<div class="empty"><div class="ei">📜</div><div class="et">Campaña en blanco</div>
        <div class="es">Todavía no hay fichas acá. Creá la primera y empezá a enlazar.</div>
        <button class="btn pri narrow" data-act="new">Crear la primera ficha</button></div>`}
    </div>`;
}

/* ================= FICHA ================= */
function vFicha(){
  const e=byS[st.ent],c=TY(e).c,bl=BL[e.s]||[];
  const rel=[...(ADJ[e.s]||[])].map(s=>byS[s]).filter(Boolean)
    .sort((a,b)=>deg(b.s)-deg(a.s)||a.n.localeCompare(b.n));
  return `<div class="top"><div class="topin">
      <button class="back" data-act="back">← Atrás</button>
      <button class="back push" data-act="edit" data-v="${att(e.s)}">Editar</button>
    </div></div>
  <div class="page">
    <div class="hero">
      ${e.img?`<button class="avbtn" data-act="img" data-v="${att(e.s)}">${av(e,AV.hero,{big:1})}</button>`
             :av(e,AV.hero,{big:1})}
      <div class="grow">
        <div class="eyebrow" style="color:${e.pc?'var(--gold)':c}">
          ${e.pc?esc(cur.party_name||'Nuestro grupo'):esc(TY(e).s)}</div>
        <h1>${esc(e.n)}</h1></div></div>
    ${e.a&&e.a.length?`<div class="aka">también: ${e.a.map(esc).join(' · ')}</div>`:''}
    <div class="meta">${e.st?`<span class="chip acc" style="--c:${c}">${esc(e.st)}</span>`:''}
      <span class="chip">${bl.length} menciones</span>
      <span class="chip">${rel.length} conexiones</span></div>
    <div class="prose">${prose(e.b)||'<p style="color:var(--dim)">Sin descripción todavía.</p>'}</div>
    ${e.c?`<div class="sec"><div class="sech">Con nosotros</div>
      <div class="ours">${prose(e.c)}</div></div>`:''}
    ${bl.length?`<div class="sec"><div class="sech">Se lo menciona en</div>
      <div class="rail">${bl.map(b=>{const src=byS[b.s];if(!src)return'';
        return `<div class="bl" style="color:${TY(src).c}" data-go="${att(b.s)}">
          <div class="blsrc">${av(src,AV.xs)}<span>${esc(src.n)}</span>${
            b.where==='ours'?'<span class="blnote">· con nosotros</span>':''}</div>
          <div class="blsnip">${esc(b.snip).replace(/§(.*?)§/g,'<em>$1</em>')}</div></div>`}).join('')}
      </div></div>`:''}
    ${rel.length?`<div class="sec"><div class="sech">Conectado con</div>
      <div class="card">${rel.map(x=>`<div class="row" data-go="${att(x.s)}">${av(x,AV.sm)}
        <div class="grow"><div class="rn">${esc(x.n)}</div>
        <div class="rs">${esc(x.sm)}</div></div>
        <span class="rc">${esc(TY(x).s)}</span></div>`).join('')}</div></div>`:''}
    <div class="sec"><button class="btn sec2" data-act="graphof" data-v="${att(e.s)}">
      Ver en el grafo</button></div>
  </div>`;
}

/* ================= EDITOR ================= */
function edit(slug){
  st.editing={slug:slug||null,isNew:!slug};   // objeto nuevo: sin _live, no arrastra borradores
  st.tab='ed';st.ac=null;st.acPick=null;r();scrollTo(0,0);
}
function vEd(){
  const E=st.editing, e=E.slug?byS[E.slug]:null;
  const name=E.dn!==undefined?E.dn:(e?e.n:'');
  const bodyTxt=E.db!==undefined?E.db:(e?e.b:'');
  const noteTxt=E.dc!==undefined?E.dc:(e?e.c:'');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const isPc=E.pc!==undefined?!!E.pc:(e?!!e.pc:false);
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  const prev={n:name||'?',t:type,img};
  return `<div class="top"><div class="topin">
      <button class="back" data-act="cancel">← Cancelar</button>
      <span class="tag push">${e?'EDITANDO':'FICHA NUEVA'}</span></div></div>
  <div class="page">
    <div class="eyebrow">Retrato</div>
    <div class="imgrow">
      ${av(prev,AV.hero,{big:1})}
      <div class="grow">
        <div class="btnrow even">
          <label class="btn sec2">${img?'Cambiar':'Elegir foto'}
            <input type="file" accept="image/*" style="display:none" onchange="upImg(event)"></label>
          ${img?`<button class="btn sec2" data-act="noimg">Quitar</button>`:''}
        </div>
        ${img?'':`<div class="hint">Sin foto se usan las iniciales.</div>`}
      </div></div>

    <div class="eyebrow">Nombre</div>
    <input class="sfield" id="fn" value="${att(name)}" placeholder="Nombre de la ficha">

    <div class="eyebrow mt">Tipo</div>
    <div class="btnrow">${ORDER.map(t=>`<button class="gbtn ${type===t?'on':''}"
      style="${type===t?'':`color:${TYT(t).c};border-color:${TYT(t).c}55`}"
      data-act="type" data-v="${t}">${esc(TYT(t).s)}</button>`).join('')}</div>

    <button class="btn sec2 ${isPc?'on':''}" data-act="pc">
      ${isPc?'✓ ':''}Es de ${esc(cur.party_name||'nuestro grupo')}</button>

    <div class="eyebrow mt">Descripción — qué es</div>
    <div class="acwrap">
      <div class="ed" id="edB" contenteditable="true"
        data-ph="Escribí acá. Poné @ para enlazar con otra ficha."
        oninput="onEd(this)" onkeyup="onEd(this)" onclick="onEd(this)">${toHTML(bodyTxt)}</div>
    </div>
    <div class="eyebrow mt">Con nosotros — qué nos pasó</div>
    <div class="acwrap">
      <div class="ed short" id="edC" contenteditable="true"
        data-ph="Lo que hicimos, lo que sospechamos, lo que nos deben."
        oninput="onEd(this)" onkeyup="onEd(this)" onclick="onEd(this)">${toHTML(noteTxt)}</div>
    </div>
    <div class="hint">Escribí @ y las primeras letras. Encuentra igual si le errás.<br>
      Para sacar un nombre ya enlazado, tocalo una vez (queda marcado) y tocalo de nuevo.
      La tecla de borrar también funciona.</div>
    <button class="btn pri" data-act="save" ${st.busy?'disabled':''}>
      ${st.busy?'Guardando…':'Guardar'}</button>
  </div>`;
}
function toHTML(txt){
  return esc(txt||'').replace(LK,(m,k)=>{const e=byS[k];
    return e?`<span class="tok" contenteditable="false" data-s="${att(k)}" style="--c:${TY(e).c}">`+
      av(e,'em')+`<span class="mtx">${esc(e.n)}</span></span>`:m;
  }).replace(/\n/g,'<br>');
}
function fromDOM(el){
  if(!el)return'';
  let out='';
  (function walk(n){n.childNodes.forEach(k=>{
    if(k.nodeType===3)out+=k.textContent;
    else if(k.nodeName==='BR')out+='\n';
    else if(k.classList&&k.classList.contains('tok'))out+='[['+k.dataset.s+']]';
    else{if(k.nodeName==='DIV'&&out&&!out.endsWith('\n'))out+='\n';walk(k)}
  })})(el);
  return out.replace(/\u00a0/g,' ').trim();
}
/* guarda lo tipeado en el estado para que ningún re-render lo pise */
function keepDraft(){
  if(!st.editing)return;
  const b=document.getElementById('edB'),c=document.getElementById('edC'),n=document.getElementById('fn');
  if(b)st.editing.db=fromDOM(b);
  if(c)st.editing.dc=fromDOM(c);
  if(n)st.editing.dn=n.value;
  if(st.editing.pc===undefined){
    const e=st.editing.slug?byS[st.editing.slug]:null;st.editing.pc=e?!!e.pc:false;
  }
}
function shrink(file){
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();
      im.onload=()=>{const S=384,sc=Math.min(S/im.width,S/im.height,1);
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
  try{st.editing.img=await shrink(f);r();toast('Foto lista — falta guardar','ok')}
  catch(_){toast('No se pudo leer la imagen','err')}
}

/* --- chips de mención dentro del editor --- */
function dropTok(t){
  const nx=t.nextSibling;
  if(nx&&nx.nodeType===3&&/^[\u00a0 ]/.test(nx.textContent))nx.textContent=nx.textContent.slice(1);
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
  while(n&&!n.previousSibling&&n.parentNode&&
        !(n.parentNode.classList&&n.parentNode.classList.contains('ed')))n=n.parentNode;
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
function acInner(){
  const{q,hits}=st.ac;
  if(st.acPick!==null&&st.acPick!==undefined)
    return `<div class="tp">${ORDER.map(t=>
      `<button class="tpb" style="--c:${TYT(t).c}" onmousedown="event.preventDefault()"
        data-act="mknew" data-v="${t}">${esc(TYT(t).s)}</button>`).join('')}
      <div class="tpq">¿Qué tipo es "${esc(q)}"?</div></div>`;
  const rows=hits.map(({e,via,s})=>
    `<div class="acr" onmousedown="event.preventDefault()" data-act="pick" data-v="${att(e.s)}">
      ${av(e,AV.sm)}<div class="grow"><div class="acn">${esc(e.n)}</div>
      <div class="acs">${esc(TY(e).s).toUpperCase()}${via?' · POR "'+esc(via).toUpperCase()+'"':''}${
        s<.9?' · APROX':''}</div></div></div>`).join('');
  const create=q.trim()
    ? `<div class="acr" onmousedown="event.preventDefault()" data-act="acnew">
        <span class="dot" style="color:var(--location);background:var(--location)"></span>
        <div class="acnew">Crear ficha "${esc(q)}"</div></div>`:'';
  return rows+create||`<div class="hint">Seguí escribiendo…</div>`;
}
function pick(slug){
  const c=caretQ();if(!c)return;
  const e=byS[slug];if(!e)return;
  const rg=document.createRange();rg.setStart(c.node,c.from);rg.setEnd(c.node,c.to);rg.deleteContents();
  const sp=document.createElement('span');
  sp.className='tok';sp.contentEditable='false';sp.dataset.s=slug;
  sp.style.setProperty('--c',TY(e).c);
  sp.innerHTML=av(e,'em')+`<span class="mtx">${esc(e.n)}</span>`;
  const sep=document.createTextNode('\u00a0');
  rg.insertNode(sep);rg.insertNode(sp);
  const nr=document.createRange();nr.setStartAfter(sep);nr.collapse(true);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(nr);
  st.ac=null;st.acPick=null;paintAC();
}
async function mkNew(type){
  const name=String(st.acPick||'').trim();
  if(!name)return;
  const slug=slugify(name)||('f'+Date.now());
  if(!byS[slug]){
    const {data,error}=await SB.from('entities').insert({
      campaign_id:cur.id,slug,type,name:name.charAt(0).toUpperCase()+name.slice(1),
      summary:'Ficha nueva, falta completar.',body:'',notes:''}).select().single();
    if(error){toast('No se pudo crear: '+error.message,'err');return}
    D.push({id:data.id,s:data.slug,t:type,n:data.name,sm:data.summary||'',
      b:'',c:'',st:data.status||null,img:data.image_url||null,pc:0,a:[]});
    rebuild();
  }
  pick(slug);toast('Ficha "'+name+'" creada','ok');
}

function autoSummary(body){
  const plain=String(body||'').replace(LK,(_,k)=>byS[k]?byS[k].n:'').replace(/\s+/g,' ').trim();
  if(!plain)return'Sin descripción todavía.';
  const first=plain.split(/(?<=[.!?])\s/)[0];
  return (first.length>4&&first.length<=140?first:plain.slice(0,120)).trim();
}
async function save(){
  if(st.busy)return;
  const nameEl=document.getElementById('fn');
  const name=nameEl?nameEl.value.trim():'';
  if(!name){toast('Falta el nombre','err');return}
  const body=fromDOM(document.getElementById('edB'));
  const notes=fromDOM(document.getElementById('edC'));
  const E=st.editing;
  const e=E.slug?byS[E.slug]:null;
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const pc=E.pc!==undefined?!!E.pc:(e?!!e.pc:false);
  const summary=autoSummary(body);
  const before=e?new Set([...(ADJ[e.s]||[])]):new Set();
  st.busy=true;r();
  let res;
  if(e&&e.id){
    res=await SB.from('entities').update({name,body,notes,type,summary,image_url:img,is_party:pc})
      .eq('id',e.id).select().single();
  }else{
    let slug=slugify(name)||('f'+Date.now());
    if(byS[slug])slug=slug+'-'+Date.now().toString(36).slice(-4);
    res=await SB.from('entities').insert({campaign_id:cur.id,slug,type,name,summary,
      body,notes,image_url:img,is_party:pc}).select().single();
  }
  st.busy=false;
  if(res.error){toast('No se guardó: '+res.error.message,'err');r();return}
  await loadCamp(cur);
  st.ent=res.data.slug;st.editing=null;st.tab='ficha';
  const added=[...(ADJ[st.ent]||[])].filter(x=>!before.has(x)).length;
  r();scrollTo(0,0);
  toast(added?`Guardado · ${added} vínculo${added>1?'s':''} nuevo${added>1?'s':''}`:'Guardado','ok');
}

/* ---------- lightbox ---------- */
function openImg(slug){
  const e=byS[slug];if(!e||!e.img)return;
  const d=document.createElement('div');
  d.className='lightbox';
  d.innerHTML=`<button class="lbx" aria-label="Cerrar">✕</button><img src="${att(e.img)}" alt="${att(e.n)}">`;
  const close=()=>{d.remove();removeEventListener('keydown',onk)};
  const onk=ev=>{if(ev.key==='Escape')close()};
  d.onclick=close;addEventListener('keydown',onk);
  document.body.appendChild(d);
}

/* ============================================================
   GRAFO
   Motor propio: cámara con zoom/paneo, simulación con enfriado,
   avatares dibujados en el canvas, resaltado de vecinos,
   filtros por tipo y modo "toda la campaña".
   ============================================================ */
const G={
  cv:null,cx:null,W:0,H:0,dpr:1,
  nodes:[],edges:[],map:{},pos:{},
  cam:{x:0,y:0,k:1},
  alpha:0,raf:null,autofit:true,
  sel:null,selUser:false,hot:null,
  drag:null,panning:null,moved:false,downNode:null,
  depth:2,mode:'ego',off:new Set(),full:false,
  ro:null,pts:new Map(),pinch:null
};
const IMGC={};                                  // cache de imágenes para el canvas
function gImg(url){
  if(!url)return null;
  const c=IMGC[url];
  if(c!==undefined)return c||null;
  IMGC[url]=null;
  const im=new Image();
  im.onload =()=>{IMGC[url]=im;gPaint()};
  im.onerror=()=>{IMGC[url]=false};
  im.src=url;
  return null;
}
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;

function vGrafo(){
  if(!D.length)return `<div class="top"><div class="topin">
      <button class="back" data-act="back">← Atrás</button></div></div>
    <div class="empty"><div class="ei">🕸</div><div class="et">Nada que dibujar</div>
    <div class="es">Creá algunas fichas y enlazalas con @ para ver el grafo.</div></div>`;
  if(!byS[st.ent]){const top=D.slice().sort((a,b)=>deg(b.s)-deg(a.s))[0];st.ent=top?top.s:null}
  const opts=D.slice().sort((a,b)=>a.n.localeCompare(b.n))
    .map(x=>`<option value="${att(x.s)}"${x.s===st.ent?' selected':''}>${esc(x.n)}</option>`).join('');
  return `<div class="top"><div class="topin">
      <button class="back" data-act="back">← Atrás</button>
      <select class="sfield" id="gsel" data-act="center">${opts}</select>
    </div></div>
  <div class="gwrap" id="gwrap">
    <canvas id="cv"></canvas>
    <div class="gzoom">
      <button data-act="zoom" data-v="in" aria-label="Acercar">
        <svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg></button>
      <button data-act="zoom" data-v="out" aria-label="Alejar">
        <svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button>
      <button data-act="fit" aria-label="Encuadrar" title="Encuadrar">
        <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      <button data-act="reheat" aria-label="Reordenar" title="Reordenar">
        <svg viewBox="0 0 24 24"><path d="M20 11A8 8 0 0 0 6.3 5.7L4 8"/><path d="M4 4v4h4"/>
          <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16"/><path d="M20 20v-4h-4"/></svg></button>
      <button data-act="full" aria-label="Pantalla completa" title="Pantalla completa">
        <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg></button>
    </div>
    <div class="ghint" id="ghint">tocá un nodo para verlo · arrastrá para mover · rueda o pellizco para zoom</div>
    <div id="gcard"></div>
  </div>
  <div class="gctl" id="gctl">${gControls()}</div>
  <div class="glegend" id="glegend">${gLegend()}</div>
  <div class="page"><div class="hint" id="gstat"></div></div>`;
}
function gControls(){
  const b=(v,l,on)=>`<button class="gbtn ${on?'on':''}" data-act="gmode" data-v="${v}">${l}</button>`;
  return b('1','1 salto',G.mode==='ego'&&G.depth===1)+
         b('2','2 saltos',G.mode==='ego'&&G.depth===2)+
         b('3','3 saltos',G.mode==='ego'&&G.depth===3)+
         b('all','Todo',G.mode==='all');
}
function gLegend(){
  return ORDER.map(t=>`<button class="lgb ${G.off.has(t)?'off':''}" style="--c:${TYT(t).c}"
    data-act="gtype" data-v="${t}"><span class="sw"></span>${esc(TYT(t).l)}</button>`).join('');
}

function gBuild(reheat){
  const center=st.ent;
  let ids;
  if(G.mode==='all')ids=D.map(e=>e.s);
  else{
    const seen={},q=[[center,0]];seen[center]=0;
    while(q.length){const[id,d]=q.shift();if(d>=G.depth)continue;
      (ADJ[id]||[]).forEach(n=>{if(!(n in seen)){seen[n]=d+1;q.push([n,d+1])}})}
    ids=Object.keys(seen);
  }
  ids=ids.filter(id=>byS[id]&&(id===center||!G.off.has(byS[id].t)));
  const set=new Set(ids);
  const dg={};ids.forEach(i=>dg[i]=0);
  const edges=EDGES.filter(e=>set.has(e.a)&&set.has(e.b));
  edges.forEach(e=>{dg[e.a]++;dg[e.b]++});
  const n=ids.length,rad=70+Math.sqrt(n)*26;
  G.nodes=ids.map((id,i)=>{
    const p=G.pos[id],e=byS[id],ang=i/Math.max(1,n)*Math.PI*2;
    gImg(e.img);
    return{id,e,
      x:p?p.x:(id===center?0:Math.cos(ang)*rad+(Math.random()-.5)*14),
      y:p?p.y:(id===center?0:Math.sin(ang)*rad+(Math.random()-.5)*14),
      vx:0,vy:0,d:dg[id]||0,root:id===center,
      r:id===center?16:Math.min(15,6.5+Math.sqrt(dg[id]||0)*2.3)};
  });
  G.map={};G.nodes.forEach(n2=>G.map[n2.id]=n2);
  G.edges=edges;
  if(G.sel&&!G.map[G.sel])G.sel=null;
  const stat=document.getElementById('gstat');
  if(stat)stat.innerHTML=G.mode==='all'
    ? `Toda la campaña: ${n} fichas, ${edges.length} vínculos. Centro: <b style="color:var(--gold)">${esc(byS[center]?byS[center].n:'—')}</b>.`
    : `${n} ficha${n===1?'':'s'} a ${G.depth} salto${G.depth>1?'s':''} de <b style="color:var(--gold)">${esc(byS[center]?byS[center].n:'—')}</b> · ${edges.length} vínculos.`;
  if(reheat!==false){G.alpha=1;G.autofit=true;gLoop()}
}

function gTick(){
  const N=G.nodes,n=N.length;
  if(!n)return;
  const rep=1500+n*26, link=76+Math.min(70,n*.9);
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const a=N[i],b=N[j];
    let dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
    if(d2<1){dx=Math.random()-.5;dy=Math.random()-.5;d2=1}
    const d=Math.sqrt(d2);
    let f=rep/d2;
    const minD=a.r+b.r+16;
    if(d<minD)f+=(minD-d)*.8;               // evita que se pisen los avatares
    const fx=dx/d*f,fy=dy/d*f;
    a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy;
  }
  G.edges.forEach(e=>{
    const a=G.map[e.a],b=G.map[e.b];if(!a||!b)return;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.01;
    const target=link/(1+Math.min(3,(e.w||1)-1)*.18);
    const f=(d-target)*.035,fx=dx/d*f,fy=dy/d*f;
    a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;
  });
  N.forEach(nd=>{
    nd.vx-=nd.x*.011;nd.vy-=nd.y*.011;      // gravedad hacia el centro
    if(nd===G.drag){nd.vx=nd.vy=0;G.pos[nd.id]={x:nd.x,y:nd.y};return}
    nd.vx*=.82;nd.vy*=.82;
    nd.x+=nd.vx*G.alpha;nd.y+=nd.vy*G.alpha;
    G.pos[nd.id]={x:nd.x,y:nd.y};
  });
  G.alpha*=.973;
  if(G.alpha<.006)G.alpha=0;
}
function gFit(pad){
  pad=pad||52;
  if(!G.nodes.length||!G.W)return;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  G.nodes.forEach(n=>{x0=Math.min(x0,n.x-n.r);y0=Math.min(y0,n.y-n.r);
    x1=Math.max(x1,n.x+n.r);y1=Math.max(y1,n.y+n.r)});
  const w=Math.max(1,x1-x0),h=Math.max(1,y1-y0);
  const bottom=(G.sel&&G.map[G.sel])?92:0;    // deja aire para la tarjeta flotante
  G.cam.k=Math.max(.22,Math.min((G.W-pad*2)/w,(G.H-pad*2-bottom)/h,1.9));
  G.cam.x=G.W/2-((x0+x1)/2)*G.cam.k;
  G.cam.y=(G.H-bottom)/2-((y0+y1)/2)*G.cam.k;
}
function gZoom(f,px,py){
  const c=G.cam,k=Math.max(.18,Math.min(3.2,c.k*f));
  px=px===undefined?G.W/2:px;py=py===undefined?G.H/2:py;
  c.x=px-(px-c.x)*(k/c.k);c.y=py-(py-c.y)*(k/c.k);c.k=k;
  G.autofit=false;gPaint();
}
const wx=sx=>(sx-G.cam.x)/G.cam.k, wy=sy=>(sy-G.cam.y)/G.cam.k;
const sxf=x=>x*G.cam.k+G.cam.x, syf=y=>y*G.cam.k+G.cam.y;

function gDraw(){
  const cx=G.cx;if(!cx)return;
  const {W,H,dpr,cam}=G;
  cx.setTransform(dpr,0,0,dpr,0,0);
  cx.clearRect(0,0,W,H);
  /* solo atenuamos el resto cuando el usuario está mirando un nodo a propósito:
     al entrar al grafo se ve todo con la misma fuerza */
  const focus=G.hot||(G.selUser?G.sel:null);
  const near=focus?new Set([focus,...(ADJ[focus]||[])]):null;

  /* --- aristas, en coordenadas del mundo --- */
  cx.save();cx.translate(cam.x,cam.y);cx.scale(cam.k,cam.k);
  cx.lineCap='round';
  const grad=G.edges.length<=260;
  G.edges.forEach(e=>{
    const a=G.map[e.a],b=G.map[e.b];if(!a||!b)return;
    const on=!near||(near.has(e.a)&&near.has(e.b));
    const hi=near&&(e.a===focus||e.b===focus);
    cx.globalAlpha=hi?.95:(on?.45:.13);
    cx.lineWidth=(hi?1.9:1.15)/cam.k*Math.min(2.2,1+((e.w||1)-1)*.35);
    if(grad&&hi){
      const g=cx.createLinearGradient(a.x,a.y,b.x,b.y);
      g.addColorStop(0,TY(a.e).c);g.addColorStop(1,TY(b.e).c);cx.strokeStyle=g;
    }else cx.strokeStyle=hi?'#C9D2E0':'#57647A';
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y;
    cx.beginPath();cx.moveTo(a.x,a.y);
    cx.quadraticCurveTo(mx-dy*.06,my+dx*.06,b.x,b.y);
    cx.stroke();
  });

  /* --- nodos --- */
  cx.globalAlpha=1;
  G.nodes.forEach(n=>{
    const on=!near||near.has(n.id);
    const c=TY(n.e).c,r=n.r;
    cx.globalAlpha=on?1:.3;
    if(n.root||n.id===G.sel){                       // aro exterior
      cx.beginPath();cx.arc(n.x,n.y,r+5.5/cam.k+3,0,6.2832);
      cx.strokeStyle=c;cx.globalAlpha=on?.42:.14;cx.lineWidth=2/cam.k+1;cx.stroke();
      cx.globalAlpha=on?1:.3;
    }
    const im=gImg(n.e.img);
    cx.save();
    cx.beginPath();cx.arc(n.x,n.y,r,0,6.2832);
    if(im&&im.naturalWidth){
      cx.clip();
      const s=Math.min(im.naturalWidth,im.naturalHeight);
      cx.drawImage(im,(im.naturalWidth-s)/2,(im.naturalHeight-s)/2,s,s,n.x-r,n.y-r,r*2,r*2);
      cx.restore();
      cx.beginPath();cx.arc(n.x,n.y,r,0,6.2832);
      cx.strokeStyle=c;cx.lineWidth=1.6/cam.k+.6;cx.stroke();
    }else{
      cx.fillStyle=c;cx.fill();cx.restore();
      if(r*cam.k>9){                                 // inicial dentro del nodo
        cx.fillStyle='rgba(13,16,21,.82)';
        cx.font='600 '+(r*1.05)+"px 'JetBrains Mono',monospace";
        cx.textAlign='center';cx.textBaseline='middle';
        cx.fillText(initials(n.e.n,true),n.x,n.y+r*.04);
      }
    }
  });
  cx.restore();

  /* --- etiquetas, en coordenadas de pantalla para que no se deformen --- */
  cx.setTransform(dpr,0,0,dpr,0,0);
  cx.textAlign='center';cx.textBaseline='middle';
  const showAll=G.nodes.length<=28||cam.k>=1.25;
  /* los nodos más importantes eligen lugar primero; el resto cede si se pisa */
  const cands=[];
  G.nodes.forEach(n=>{
    const strong=n.root||n.id===G.sel||n.id===G.hot;
    const on=!near||near.has(n.id);
    if(!on&&!strong)return;
    if(!strong&&!showAll&&!(near&&on))return;
    const x=sxf(n.x),y=syf(n.y);
    if(x<-90||x>W+90||y<-40||y>H+40)return;
    cands.push({n,strong,on,x,y});
  });
  cands.sort((a,b)=>(b.strong-a.strong)||(b.n.d-a.n.d));
  /* los círculos ocupan lugar: una etiqueta no se dibuja encima de otro nodo
     (el suyo propio no cuenta, si no ninguna encontraría lugar) */
  const placed=G.nodes.map(n=>{
    const r=n.r*cam.k+2,x=sxf(n.x),y=syf(n.y);
    return{id:n.id,x0:x-r,x1:x+r,y0:y-r,y1:y+r};
  });
  const clashes=(rc,self)=>placed.some(p=>
    p.id!==self&&rc.x0<p.x1&&rc.x1>p.x0&&rc.y0<p.y1&&rc.y1>p.y0);
  cands.forEach(({n,strong,on,x,y})=>{
    cx.font=(strong?'600 12.5px ':'500 11px ')+"'Inter Tight',system-ui,sans-serif";
    const t=n.e.n,w=cx.measureText(t).width,ph=strong?17:15;
    const off=n.r*cam.k+ph/2+7;
    let rc=null;
    for(const dy of [off,-off]){                 // primero debajo, si no arriba
      const cy=y+dy;
      const t2={x0:x-w/2-7,x1:x+w/2+7,y0:cy-ph/2-2,y1:cy+ph/2+2,cy};
      if(!clashes(t2,n.id)){rc=t2;break}
    }
    if(!rc){
      if(!strong)return;                          // los secundarios se callan
      rc={x0:x-w/2-7,x1:x+w/2+7,y0:y+off-ph/2-2,y1:y+off+ph/2+2,cy:y+off};
    }
    placed.push(rc);
    cx.globalAlpha=on?1:.3;
    cx.fillStyle='rgba(13,16,21,.78)';
    cx.beginPath();
    if(cx.roundRect)cx.roundRect(x-w/2-6,rc.cy-ph/2,w+12,ph,ph/2);
    else cx.rect(x-w/2-6,rc.cy-ph/2,w+12,ph);
    cx.fill();
    cx.fillStyle=strong?'#EDE7DA':'rgba(237,231,218,.74)';
    cx.fillText(t,x,rc.cy+.5);
  });
  cx.globalAlpha=1;
}
function gPaint(){if(!G.raf)gDraw()}
function gLoop(){
  if(G.raf)cancelAnimationFrame(G.raf);
  const step=()=>{
    if(REDUCED){for(let i=0;i<80&&G.alpha>0;i++)gTick();G.alpha=0}
    else gTick();
    if(G.autofit)gFit();
    gDraw();
    if(G.alpha>0||G.drag){G.raf=requestAnimationFrame(step)}
    else{G.raf=null;G.autofit=false}
  };
  G.raf=requestAnimationFrame(step);
}
function gStop(){
  if(G.raf){cancelAnimationFrame(G.raf);G.raf=null}
  if(G.ro){G.ro.disconnect();G.ro=null}
}
function gSize(){
  const cv=G.cv;if(!cv)return;
  const wrap=cv.parentNode;
  const W=wrap.clientWidth;
  const H=G.full?wrap.clientHeight:Math.max(300,Math.min(Math.round(innerHeight*.56),560));
  const dpr=Math.min(2.5,devicePixelRatio||1);
  G.W=W;G.H=H;G.dpr=dpr;
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  cv.style.height=H+'px';
  G.cx=cv.getContext('2d');
}
function gHit(sx,sy){
  const x=wx(sx),y=wy(sy);
  let best=null,bd=1e9;
  for(const n of G.nodes){
    const d=Math.hypot(n.x-x,n.y-y);
    const rr=Math.max(n.r,14/G.cam.k);
    if(d<rr&&d<bd){bd=d;best=n}
  }
  return best;
}
function gCard(){
  const host=document.getElementById('gcard');if(!host)return;
  const n=G.sel&&G.map[G.sel];
  const hint=document.getElementById('ghint');
  if(!n){host.innerHTML='';if(hint)hint.hidden=false;return}
  if(hint)hint.hidden=true;              // si no, la tarjeta lo tapa
  const e=n.e;
  host.innerHTML=`<div class="gcard">${av(e,AV.lg,{ring:1})}
    <div class="grow">
      <div class="gcn">${esc(e.n)}</div>
      <div class="gcs">${esc(TY(e).s)} · ${n.d} vínculo${n.d===1?'':'s'}</div></div>
    <button class="gco" data-go="${att(e.s)}">Abrir</button>
    <button class="gcx" data-act="gclose" aria-label="Cerrar">✕</button></div>`;
}
function gCenter(slug){
  if(!byS[slug])return;
  st.ent=slug;G.sel=slug;G.selUser=false;gBuild();gCard();
  const sel=document.getElementById('gsel');if(sel&&sel.value!==slug)sel.value=slug;
}
function gWire(){
  const cv=G.cv;if(!cv)return;
  const at=ev=>{const b=cv.getBoundingClientRect();
    return{x:ev.clientX-b.left,y:ev.clientY-b.top}};

  cv.onpointerdown=ev=>{
    cv.setPointerCapture(ev.pointerId);
    const p=at(ev);G.pts.set(ev.pointerId,p);
    if(G.pts.size===2){
      const[a,b]=[...G.pts.values()];
      G.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      G.drag=null;G.panning=null;return;
    }
    G.moved=false;
    const n=gHit(p.x,p.y);
    G.downNode=n;
    if(n){G.drag=n;G.alpha=Math.max(G.alpha,.36);gLoop()}
    else{G.panning={x:p.x,y:p.y,cx:G.cam.x,cy:G.cam.y};cv.classList.add('grabbing')}
  };
  cv.onpointermove=ev=>{
    const p=at(ev);
    if(G.pts.has(ev.pointerId))G.pts.set(ev.pointerId,p);
    if(G.pinch&&G.pts.size===2){
      const[a,b]=[...G.pts.values()];
      const d=Math.hypot(a.x-b.x,a.y-b.y)||1;
      gZoom(d/G.pinch.d,G.pinch.x,G.pinch.y);
      G.pinch.d=d;G.moved=true;return;
    }
    if(G.drag){
      ev.preventDefault();
      if(Math.hypot(sxf(G.drag.x)-p.x,syf(G.drag.y)-p.y)>4)G.moved=true;
      G.drag.x=wx(p.x);G.drag.y=wy(p.y);G.drag.vx=G.drag.vy=0;
      G.autofit=false;return;
    }
    if(G.panning){
      G.cam.x=G.panning.cx+(p.x-G.panning.x);
      G.cam.y=G.panning.cy+(p.y-G.panning.y);
      if(Math.hypot(p.x-G.panning.x,p.y-G.panning.y)>4){G.moved=true;G.autofit=false}
      gPaint();return;
    }
    const h=gHit(p.x,p.y);
    const id=h?h.id:null;
    cv.classList.toggle('pointing',!!h);
    if(id!==G.hot){G.hot=id;gPaint()}
  };
  const end=ev=>{
    G.pts.delete(ev.pointerId);
    if(G.pts.size<2)G.pinch=null;
    cv.classList.remove('grabbing');
    const wasNode=G.downNode,moved=G.moved;
    G.drag=null;G.panning=null;G.downNode=null;
    if(wasNode&&!moved){
      if(G.sel===wasNode.id)go(wasNode.id);       // segundo toque abre la ficha
      else{G.sel=wasNode.id;G.selUser=true;gCard();gPaint()}
    }else if(!wasNode&&!moved&&G.sel){G.sel=null;G.selUser=false;gCard();gPaint()}
  };
  cv.onpointerup=end;cv.onpointercancel=end;
  cv.onpointerleave=()=>{if(!G.drag&&!G.panning&&G.hot){G.hot=null;gPaint()}};
  cv.ondblclick=ev=>{const b=cv.getBoundingClientRect();
    const n=gHit(ev.clientX-b.left,ev.clientY-b.top);if(n)go(n.id)};
  cv.onwheel=ev=>{ev.preventDefault();const b=cv.getBoundingClientRect();
    gZoom(Math.pow(.999,ev.deltaY),ev.clientX-b.left,ev.clientY-b.top)};
  cv.oncontextmenu=ev=>ev.preventDefault();

  G.ro=new ResizeObserver(()=>{const h=G.H;gSize();
    if(h!==G.H||true){if(G.autofit)gFit();gDraw()}});
  G.ro.observe(cv.parentNode);
}
function gMount(){
  G.cv=document.getElementById('cv');if(!G.cv)return;
  gSize();gWire();
  G.sel=G.sel&&byS[G.sel]?G.sel:null;
  gBuild();gCard();
}
function gFull(){
  G.full=!G.full;
  const w=document.getElementById('gwrap');if(!w)return;
  w.classList.toggle('full',G.full);
  document.body.style.overflow=G.full?'hidden':'';
  requestAnimationFrame(()=>{gSize();gFit();gDraw()});
}

/* ============================================================
   SHELL
   ============================================================ */
const IC={
  idx:'<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  grafo:'<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="17" r="2.4"/><circle cx="19" cy="17" r="2.4"/><path d="M10.5 7 6.6 14.8M13.5 7l3.9 7.8M7.4 17h9.2"/>',
  nueva:'<path d="M12 5v14M5 12h14"/>'
};
let RENDERED=null;
function snapFocus(){
  const a=document.activeElement;
  if(!a||!a.id||a===document.body)return null;
  const o={id:a.id};
  try{o.s=a.selectionStart;o.e=a.selectionEnd}catch(_){}
  return o;
}
function restFocus(f){
  if(!f)return;
  const el=document.getElementById(f.id);if(!el||el===document.activeElement)return;
  try{el.focus({preventScroll:true});
    if(f.s!=null&&el.setSelectionRange)el.setSelectionRange(f.s,f.e)}catch(_){}
}
function r(){
  /* si veníamos del editor, primero rescatamos lo tipeado */
  if(RENDERED==='ed'&&st.editing&&st.editing._live)keepDraft();
  if(RENDERED==='grafo')gStop();
  if(G.full){G.full=false;document.body.style.overflow=''}
  const f=snapFocus();
  const navEl=document.querySelector('.nav');
  if(st.tab==='home'||!cur){
    app.innerHTML=vHome();navEl.style.display='none';RENDERED='home';restFocus(f);return;
  }
  navEl.style.display='';
  if((st.tab==='ficha'||st.tab==='grafo')&&!byS[st.ent]&&st.tab!=='grafo')st.tab='idx';
  if(st.tab==='ficha'&&!byS[st.ent])st.tab='idx';
  if(st.tab==='ed'&&!st.editing)st.tab='idx';
  const v={idx:vIdx,ficha:vFicha,grafo:vGrafo,ed:vEd}[st.tab]||vIdx;
  app.innerHTML=v();
  const on=st.tab==='grafo'?'grafo':(st.tab==='ed'?'nueva':'idx');
  document.getElementById('nav').innerHTML=[['idx','Índice'],['grafo','Grafo'],['nueva','Nueva']]
    .map(([k,l])=>`<button class="nb ${on===k?'on':''}" data-act="nav" data-v="${k}">
      <svg viewBox="0 0 24 24">${IC[k]}</svg>${l}</button>`).join('');
  RENDERED=st.tab;
  if(st.tab==='ed'){wireEd();st.editing._live=true}
  if(st.tab==='grafo')requestAnimationFrame(gMount);
  restFocus(f);
}

/* ---------- un solo manejador de clicks para toda la app ---------- */
const ACT={
  home,back,
  nav:v=>{if(v==='nueva')edit(null);else tab(v)},
  camp:v=>setCamp(+v),
  newcamp:newCamp,
  view:v=>{st.view=v;r()},
  edit:v=>edit(v),
  new:()=>edit(null),
  cancel:()=>{const E=st.editing;st.editing=null;
    if(E&&E.slug&&byS[E.slug]){st.tab='ficha';st.ent=E.slug;r();scrollTo(0,0)}else tab('idx')},
  save,
  type:v=>{keepDraft();st.editing.type=v;r()},
  pc:()=>{keepDraft();st.editing.pc=!st.editing.pc;r()},
  noimg:()=>{keepDraft();st.editing.img=null;r()},
  img:v=>openImg(v),
  pick:v=>pick(v),
  acnew:()=>{if(st.ac){st.acPick=st.ac.q;paintAC()}},
  mknew:v=>mkNew(v),
  graphof:v=>{hist.push({tab:'ficha',ent:st.ent});st.ent=v;G.sel=v;G.selUser=false;
    st.tab='grafo';r();scrollTo(0,0)},
  gmode:v=>{
    if(v==='all')G.mode='all';else{G.mode='ego';G.depth=+v}
    G.pos={};document.getElementById('gctl').innerHTML=gControls();gBuild();gCard();
  },
  gtype:v=>{
    if(G.off.has(v))G.off.delete(v);else G.off.add(v);
    document.getElementById('glegend').innerHTML=gLegend();gBuild();gCard();
  },
  reheat:()=>{G.pos={};gBuild();},
  zoom:v=>gZoom(v==='in'?1.3:1/1.3),
  fit:()=>{G.autofit=false;gFit();gDraw()},
  full:gFull,
  gclose:()=>{G.sel=null;G.selUser=false;gCard();gPaint()},
  center:()=>{},
  search:()=>{}
};
document.addEventListener('click',ev=>{
  const t=ev.target.closest&&ev.target.closest('[data-go],[data-act]');
  if(!t)return;
  if(t.dataset.go!==undefined){go(t.dataset.go);return}
  const fn=ACT[t.dataset.act];
  if(fn)fn(t.dataset.v,t,ev);
});
document.addEventListener('change',ev=>{
  const t=ev.target;
  if(t&&t.id==='gsel')gCenter(t.value);
});
addEventListener('resize',()=>{if(st.tab==='grafo'&&G.cv){gSize();if(G.autofit)gFit();gDraw()}});
addEventListener('keydown',ev=>{
  if(st.tab!=='grafo')return;
  if(ev.key==='Escape'&&G.full)gFull();
  else if(ev.key==='+'||ev.key==='=')gZoom(1.25);
  else if(ev.key==='-')gZoom(1/1.25);
  else if(ev.key==='0'){G.autofit=false;gFit();gDraw()}
});

(async()=>{r();await loadCamps();r()})();
