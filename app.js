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
/* La base acepta solo estos cuatro estados (o ninguno); acá van sus nombres */
const STATUS={alive:'Vivo',dead:'Muerto',missing:'Desaparecido',unknown:'Se desconoce'};
const STORDER=['alive','dead','missing','unknown'];
const ORDER=['character','faction','location','item','creature'];
/* nunca explota si la base trae un tipo que no conocemos */
const TY=e=>(e&&TYPES[e.t])||FALLBACK;
const TYT=t=>TYPES[t]||FALLBACK;

let CAMPS=[], cur=null, D=[], byS={}, BL={}, ADJ={}, EDGES=[];
let st={tab:'home',ent:null,q:'',editing:null,ecamp:null,hist:null,conf:null,dup:null,imp:null,me:null,pick:false,ac:null,acPick:null,
        busy:false,view:'list',err:''};
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
  const one=size<30;                                   // en chico, una sola letra
  const ini=initials(e.n,one);
  const cls='av'+(o.sq?' sq':'')+(o.ring?' ring':'')+(o.big?' big':'')+(o.gmring?' gmring':'');
  const fs=Math.max(9,Math.round(size*(one?.46:.38)));
  const img=e.img
    ? `<img src="${att(e.img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
    : '';
  /* decoración del Máster: chispas en órbita. --o es el radio, expresado como
     porcentaje del alto de la propia chispa, que es como CSS mide el origen
     de la rotación. Cada una con su velocidad y su desfase. */
  const orb=o.gmring&&size>=28
    ? `<span class="orb" aria-hidden="true">${
        [[5.5,0,560],[7.5,-1.8,470],[6.5,-3.4,640],[8.5,-0.9,520]]
        .map(([d,dl,r])=>`<i style="--d:${d}s;--dl:${dl}s;--o:${r}%"></i>`).join('')
      }</span>`
    : '';
  return `<span class="${cls}" style="--c:${c};width:${size}px;height:${size}px">`+
    `<span class="avi" style="font-size:${fs}px">${esc(ini)}</span>${img}${orb}</span>`;
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

/* ---------- ¿esta ficha ya existe? ----------
   Cada uno escribe los nombres como le suena y terminamos con Femwick y
   Fenwick como dos personajes distintos. Antes de crear una ficha nueva se
   avisa si hay alguna parecida, mirando también sus otros nombres.

   El umbral está medido contra las variantes que aparecen en nuestra bitácora:
   con .65 caza 18 de 21 y ninguna apunta a una ficha equivocada. Lo que queda
   afuera no lo puede resolver comparar letras: "Kike" no se parece a "Quique",
   ni "Raudoescolta" a "Nimblewright". Para eso están los otros nombres, que se
   cargan una vez y a partir de ahí sí los encuentra. */
const PARECIDO=.65;
function parecidas(nombre,excepto){
  if(nm(nombre).length<3)return[];
  return D.map(e=>{
    if(e.s===excepto)return null;
    let s=score(nombre,e.n),via=null;
    (e.a||[]).forEach(al=>{const v=score(nombre,al);if(v>s){s=v;via=al}});
    return s>=PARECIDO?{e,s,via}:null;
  }).filter(Boolean).sort((a,b)=>b.s-a.s).slice(0,4);
}
const porqueSeParece=x=>x.via
  ? 'También se la llama "'+esc(x.via)+'"'
  : esc(x.e.sm||TY(x.e).s);

/* ---------- carga desde Supabase ---------- */
async function loadCamps(){
  const {data,error}=await SB.from('campaigns')
    .select('id,name,slug,blurb,party_name,cover_url').order('created_at');
  if(error){st.err='No se pudo conectar con la base. Revisá la conexión y recargá.';toast('No se pudo conectar','err');return}
  st.err='';CAMPS=data||[];
}
async function loadCamp(c){
  st.busy=true;r();
  /* la portada se pide acá y no en loadCamps: es una imagen embebida y no
     tiene sentido bajar la de todas las campañas para listar nombres */
  const [ents,als,cov]=await Promise.all([
    SB.from('entities')
      .select('id,slug,type,name,summary,body,notes,status,image_url,is_party,is_gm,tags,updated_at,edited_by')
      .eq('campaign_id',c.id).is('archived_at',null).order('name'),
    SB.from('entity_aliases').select('alias,entities!inner(campaign_id,slug)')
      .eq('entities.campaign_id',c.id),
    SB.from('campaigns').select('cover_url').eq('id',c.id).single()
  ]);
  st.busy=false;
  if(ents.error){toast('No se pudieron cargar las fichas','err');return}
  c=Object.assign({},c,{cover_url:(cov.data&&cov.data.cover_url)||null});
  const amap={};
  (als.data||[]).forEach(x=>{const s=x.entities.slug;(amap[s]=amap[s]||[]).push(x.alias)});
  D=(ents.data||[]).map(e=>({id:e.id,s:e.slug,t:e.type,n:e.name,sm:e.summary||'',
    b:e.body||'',c:e.notes||'',st:e.status,tg:e.tags||[],up:e.updated_at,img:e.image_url,pc:e.is_party?1:0,gm:e.is_gm?1:0,eb:e.edited_by||null,a:amap[e.slug]||[]}));
  cur=c;rebuild();loadMe();
  G.pos={};G.sel=null;G.selEdge=null;limpiarCamino();  // arranca limpio en cada campaña
  if(!st.ent||!byS[st.ent]){
    const top=D.slice().sort((a,b)=>deg(b.s)-deg(a.s)||b3(b)-b3(a))[0];
    st.ent=top?top.s:null;
  }
}

/* ---------- quién soy ----------
   Sin login: es declarativo, sirve para atribuir cambios, no para restringir
   nada. Se guarda por campaña porque los personajes son de una campaña, y una
   sola vez: no se vuelve a preguntar en cada visita. */
const meKey=()=>'codex.me.'+(cur?cur.id:'');
function loadMe(){
  try{st.me=localStorage.getItem(meKey())||null}catch(_){st.me=null}
  if(st.me&&!byS[st.me])st.me=null;      // la ficha ya no existe
}
function setMe(slug){
  st.me=slug||null;
  try{slug?localStorage.setItem(meKey(),slug):localStorage.removeItem(meKey())}catch(_){}
  st.pick=false;r();
  if(slug)toast('Sos '+(byS[slug]?byS[slug].n:slug),'ok');
}
/* los que pueden ser "yo": el Máster primero, después el grupo */
const quienes=()=>D.filter(e=>e.gm).concat(D.filter(e=>e.pc&&!e.gm));
const yo=()=>st.me&&byS[st.me]||null;
const nombreDe=slug=>slug?(byS[slug]?byS[slug].n:slug):null;

function vPick(){
  const lista=quienes();
  return `<div class="dlgwrap"><div class="dlg">
    <div class="eyebrow">Antes de empezar</div>
    <h2 class="dlgh">¿Quién sos?</h2>
    <div class="dlgtx">Para saber quién escribió cada cosa. Se guarda en este
      navegador y no te lo vuelvo a preguntar.</div>
    ${lista.length?`<div class="card pickl">${lista.map(e=>`
      <div class="row" data-act="setme" data-v="${att(e.s)}">
        ${av(e,AV.md,e.gm?{gmring:1}:{})}
        <div class="grow"><div class="rn">${esc(e.n)}</div>
          <div class="rs">${e.gm?'Máster':esc(cur.party_name||'Del grupo')}</div></div>
        <span class="rc">${ic("arrow","r")}</span></div>`).join('')}</div>`
    :`<div class="hint">Todavía no hay personajes del grupo ni Máster. Marcá
      alguna ficha como del grupo o como Máster desde su editor.</div>`}
    <button class="btn sec2" data-act="pickskip">Ahora no</button>
  </div></div>`;
}

/* ---------- navegación ---------- */
function go(id){
  if(!byS[id])return;
  hist.push({tab:st.tab,ent:st.ent});
  if(hist.length>60)hist.shift();
  st.ent=id;st.tab='ficha';st.editing=null;st.ecamp=null;r();scrollTo(0,0);
}
function tab(t){
  hist.push({tab:st.tab,ent:st.ent});
  if(hist.length>60)hist.shift();
  st.tab=t;st.editing=null;st.ecamp=null;st.q='';r();scrollTo(0,0);
}
function back(){
  const prev=hist.pop();
  if(prev){st.tab=prev.tab;st.ent=prev.ent}else st.tab='idx';
  st.editing=null;st.ecamp=null;r();scrollTo(0,0);
}
async function setCamp(i){
  hist=[];st.ent=null;await loadCamp(CAMPS[i]);
  st.tab='idx';st.q='';st.editing=null;
  st.pick=!st.me&&quienes().length>0;
  r();scrollTo(0,0);
}
function home(){hist=[];st.tab='home';st.q='';r();scrollTo(0,0)}

/* ---------- toasts (sin re-render: antes borraban lo que estabas escribiendo) ---------- */
/* devuelve una función para cerrarlo antes de tiempo; con sticky no se va solo */
/* El portapapeles moderno solo anda en contexto seguro y con permiso; si no
   hay, se cae al truco viejo del textarea, que funciona en todos lados. */
function copiar(txt,aviso){
  const viejo=()=>{
    const t=document.createElement('textarea');
    t.value=txt;t.setAttribute('readonly','');
    t.style.cssText='position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(t);t.select();
    let ok=false;
    try{ok=document.execCommand('copy')}catch(_){}
    t.remove();
    toast(ok?(aviso||'Copiado'):'No pude copiar, seleccionalo a mano',ok?'ok':'err');
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>toast(aviso||'Copiado','ok'),viejo);
  }else viejo();
}
function toast(m,kind,sticky){
  const host=document.getElementById('toasts');if(!host)return()=>{};
  const d=document.createElement('div');
  d.className='toast'+(kind?' '+kind:'');
  d.textContent=m;host.appendChild(d);
  const cerrar=()=>{
    if(!d.isConnected)return;
    d.style.transition='opacity .25s';d.style.opacity='0';
    setTimeout(()=>d.remove(),260);
  };
  if(!sticky)setTimeout(cerrar,2800);
  return cerrar;
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
      /* dentro del párrafo va solo el nombre subrayado: el avatar acá metía
         ruido y cortaba la lectura. En el resto de la app sí se muestra. */
      return `<a class="men" data-go="${att(k)}" style="--c:${TY(e).c}"
        title="${att(TY(e).s)}">${esc(e.n)}</a>`;
    })+'</p>').join('');
}

/* ---------- portada estilo libro ----------
   Tapa vertical con lomo y sombra, no un avatar redondo. Si no hay imagen
   (o si falla), queda la tapa en blanco con las iniciales de la campaña. */
function book(c,extra){
  const cov=c&&c.cover_url;
  const cls='book'+(cov?'':' ph')+(extra?' '+extra:'');
  const img=cov?`<img src="${att(cov)}" alt="" loading="lazy" decoding="async"
    onerror="this.parentNode.classList.add('ph');this.remove()">`:'';
  return `<div class="${cls}"><span class="bkini">${esc(initials(c?c.n||c.name:'?'))}</span>${img}</div>`;
}

/* ================= HOME ================= */
function vHome(){
  const list = st.err
    ? `<div class="empty"><div class="ei">${ic("hazard")}</div><div class="et">Sin conexión</div>
       <div class="es">${esc(st.err)}</div></div>`
    : CAMPS.length
    ? CAMPS.map((c,i)=>`
      <div class="row" data-act="camp" data-v="${i}">
        ${book(c,'sm')}
        <div class="grow">
          <div class="campn">${esc(c.name)}</div>
          <div class="rs">${esc(c.blurb||'')}</div></div>
        <span class="rc">${ic("arrow","r")}</span></div>`).join('')
    : `<div class="row"><div class="skel" style="width:42px;height:63px;border-radius:2px 6px 6px 2px"></div>
       <div class="grow"><div class="skel" style="height:15px;width:45%"></div>
       <div class="skel" style="height:11px;width:70%;margin-top:8px"></div></div></div>`.repeat(3);
  return `<div class="page first">
    <div class="eyebrow">Codex</div>
    <h1>Tus campañas</h1>
    <div class="hint">Cada una tiene sus propias fichas, su propio grafo y su propia memoria.</div>
    <div class="card">${list}</div>
    <div class="sec"><div class="sech">Empezar otra</div>
      <input class="sfield" id="newc" placeholder="Nombre de la campaña nueva">
      <button class="btn sec2" data-act="newcamp">Crear campaña</button></div>
    <div class="credits">Iconos de <a href="https://game-icons.net/" target="_blank"
      rel="noopener">game-icons.net</a> (Lorc y Delapouite), bajo licencia
      <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.</div>
  </div>`;
}

/* ================= ÍNDICE ================= */
function rowHTML(e,via){
  return `<div class="row" data-go="${att(e.s)}">${av(e,AV.md,e.gm?{gmring:1}:{})}
    <div class="grow"><div class="rn">${esc(e.n)}</div>
      <div class="rs">${esc(e.sm)}${via?` · coincide con "${esc(via)}"`:''}</div></div>
    <span class="rc">${b3(e)}</span></div>`;
}
function cardHTML(e){
  return `<div class="ccard" data-go="${att(e.s)}" style="--c:${TY(e).c}">${av(e,AV.xl,e.gm?{gmring:1}:{})}
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
    : `<div class="empty"><div class="ei">${ic("search")}</div><div class="et">Nada parecido</div>
       <div class="es">No encontré nada como "${esc(st.q)}". Probá con menos letras.</div></div>`;
  const body = st.q.trim() ? hitsBody : (()=>{
    const gms=D.filter(e=>e.gm);
    let out=gms.length?`<div class="grp gmgrp">
      <div class="grph">Máster<span class="ct">${gms.length}</span></div>
      ${group(gms)}</div>`:'';
    const pcs=D.filter(e=>e.pc&&!e.gm);
    out+=pcs.length?`<div class="grp">
      <div class="grph" style="color:var(--ink)">${esc(cur.party_name||'Nuestro grupo')}
        <span class="ct">${pcs.length}</span></div>${group(pcs)}</div>`:'';
    out+=ORDER.map(t=>{
      const g=D.filter(e=>e.t===t&&!e.pc&&!e.gm).sort((a,b)=>b3(b)-b3(a)||a.n.localeCompare(b.n));
      if(!g.length)return'';
      return `<div class="grp"><div class="grph" style="color:${TYT(t).c}">
        ${TYT(t).l}<span class="ct">${g.length}</span></div>${group(g)}</div>`;
    }).join('');
    const rest=D.filter(e=>!e.pc&&!e.gm&&!TYPES[e.t]);
    if(rest.length)out+=`<div class="grp"><div class="grph" style="color:${FALLBACK.c}">
      ${FALLBACK.l}<span class="ct">${rest.length}</span></div>${group(rest)}</div>`;
    return out;
  })();
  const links=EDGES.length;
  const cov=cur.cover_url;
  /* la misma portada, desenfocada, hace de fondo del banner */
  const banner=st.q.trim()?'':`<div class="banner${cov?' has':''}"${
      cov?` style="--cover:url('${att(cov)}')"`:''}>
      <div class="bnin">
        ${book(cur)}
        <div class="bntx">
          <div class="eyebrow">Campaña</div>
          <h1>${esc(cur.name)}</h1>
          <div class="hint">${D.length} ficha${D.length===1?'':'s'} · ${links} vínculo${links===1?'':'s'}</div>
          <div class="bnact">
            ${quienes().length?`<button class="gbtn glass yo" data-act="pickme">${
              yo()?av(yo(),18,yo().gm?{gmring:1}:{})+'<span>'+esc(yo().n)+'</span>'
                 :'<span>¿Quién sos?</span>'}</button>`:''}
            <button class="gbtn glass" data-act="edcamp">Editar campaña</button>
            <button class="gbtn glass" data-act="importar">Importar notas</button>
            ${cov?'':`<label class="gbtn glass">Agregar portada
              <input type="file" accept="image/*" style="display:none" onchange="upCover(event)"></label>`}
          </div>
        </div>
      </div></div>`;
  return `<div class="top"><div class="topin">
      <button class="back" data-act="home">${ic("back")}Campañas</button>
      <label class="searchw">${ic('search')}
        <input class="sfield" id="q" placeholder="Buscar"
          value="${att(st.q)}" data-act="search" oninput="st.q=this.value;r()">
      </label></div></div>
    ${banner}
    <div class="page">
      ${D.length?`<div class="segrow">
        <div class="seg">
          <button class="${st.view==='list'?'on':''}" data-act="view" data-v="list">Lista</button>
          <button class="${st.view==='cards'?'on':''}" data-act="view" data-v="cards">Cards</button>
        </div></div>`+body
      :`<div class="empty"><div class="ei">${ic("scroll")}</div><div class="et">Campaña en blanco</div>
        <div class="es">Todavía no hay fichas acá. Creá la primera y empezá a enlazar.</div>
        <button class="btn pri narrow" data-act="new">Crear la primera ficha</button></div>`}
    </div>`;
}

/* ================= FICHA ================= */
function vFicha(){
  const e=byS[st.ent],c=TY(e).c,bl=BL[e.s]||[];
  const ho=e.gm?{big:1,gmring:1}:{big:1};
  const rel=[...(ADJ[e.s]||[])].map(s=>byS[s]).filter(Boolean)
    .sort((a,b)=>deg(b.s)-deg(a.s)||a.n.localeCompare(b.n));
  return `<div class="top"><div class="topin">
      <button class="back" data-act="back">${ic("back")}Atrás</button>
      <button class="back push" data-act="edit" data-v="${att(e.s)}">${ic('quill')}Editar</button>
    </div></div>
  <div class="page${e.gm?' gmpage':''}">
    ${e.gm?`<div class="gmfx" aria-hidden="true">${
      [[6,12,0],[9,28,-2.5],[7,45,-5],[11,62,-1.2],[8,78,-3.8],[10,90,-6.4],
       [7.5,20,-8],[9.5,70,-9.5]]
      .map(([d,x,dl])=>`<i style="--d:${d}s;--x:${x}%;--dl:${dl}s"></i>`).join('')
    }</div>`:''}
    <div class="hero">
      ${e.img?`<button class="avbtn" data-act="img" data-v="${att(e.s)}">${av(e,AV.hero,ho)}</button>`
             :av(e,AV.hero,ho)}
      <div class="grow">
        <div class="eyebrow" style="color:${e.gm?'var(--gm)':(e.pc?'var(--gold)':c)}">
          ${e.gm?'Máster de la partida':(e.pc?esc(cur.party_name||'Nuestro grupo'):esc(TY(e).s))}</div>
        <h1>${esc(e.n)}</h1></div></div>
    ${e.a&&e.a.length?`<div class="aka">también: ${e.a.map(esc).join(' · ')}</div>`:''}
    <div class="meta">${e.st?`<span class="chip acc" style="--c:${c}">${esc(STATUS[e.st]||e.st)}</span>`:''}
      ${(e.tg||[]).map(t=>`<span class="chip mine">${esc(t)}</span>`).join('')}
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
      ${ic('mesh')}Ver en el grafo</button>
      <button class="btn sec2" data-act="hist" data-v="${att(e.s)}">
      ${ic('time')}Historial de cambios</button></div>
  </div>`;
}

/* ================= EDITAR CAMPAÑA ================= */
function editCamp(){st.ecamp={};st.tab='edcamp';r();scrollTo(0,0)}
/* mismo criterio que el editor de fichas: rescatar lo tipeado antes de
   cualquier re-render, si no un toast o una subida de portada lo borran */
function keepCampDraft(){
  if(!st.ecamp)return;
  const g=id=>{const el=document.getElementById(id);return el?el.value:undefined};
  const n=g('cn'),b=g('cb'),p=g('cp');
  if(n!==undefined)st.ecamp.dn=n;
  if(b!==undefined)st.ecamp.db=b;
  if(p!==undefined)st.ecamp.dp=p;
}
function vEdCamp(){
  const E=st.ecamp;
  const name =E.dn!==undefined?E.dn:(cur.name||'');
  const blurb=E.db!==undefined?E.db:(cur.blurb||'');
  const party=E.dp!==undefined?E.dp:(cur.party_name||'');
  const cov=cur.cover_url;
  return `<div class="top"><div class="topin">
      <button class="back" data-act="cancelcamp">${ic("back")}Cancelar</button>
      <span class="tag push">EDITANDO CAMPAÑA</span></div></div>
  <div class="page">
    <div class="eyebrow">Portada</div>
    <div class="imgrow">
      ${book({name:name||'?',cover_url:cov})}
      <div class="grow">
        <div class="btnrow even">
          <label class="btn sec2">${cov?'Cambiar':'Elegir tapa'}
            <input type="file" accept="image/*" style="display:none" onchange="upCover(event)"></label>
          ${cov?`<button class="btn sec2" data-act="nocover">Quitar</button>`:''}
        </div>
        <div class="hint">Conviene una imagen vertical: se recorta en proporción
          de tapa de libro. La portada se guarda apenas la elegís.</div>
      </div></div>

    <div class="eyebrow mt">Nombre</div>
    <input class="sfield" id="cn" value="${att(name)}" placeholder="Nombre de la campaña">

    <div class="eyebrow mt">Descripción corta</div>
    <input class="sfield" id="cb" value="${att(blurb)}" placeholder="Una línea que la resuma">
    <div class="hint">Es lo que se lee debajo del nombre en la lista de campañas.</div>

    <div class="eyebrow mt">Cómo se llama el grupo</div>
    <input class="sfield" id="cp" value="${att(party)}" placeholder="Nuestro grupo">
    <div class="hint">Las fichas marcadas como del grupo se juntan bajo este título,
      en el índice y en cada ficha.</div>

    <div class="savebar"><button class="btn pri" data-act="savecamp" ${st.busy?'disabled':''}>
      ${st.busy?'Guardando…':'Guardar'}</button></div>
  </div>`;
}
async function saveCamp(){
  if(st.busy)return;
  keepCampDraft();
  const name=(st.ecamp.dn!==undefined?st.ecamp.dn:cur.name||'').trim();
  if(!name){toast('Falta el nombre','err');return}
  const blurb=(st.ecamp.db!==undefined?st.ecamp.db:cur.blurb||'').trim();
  const party=(st.ecamp.dp!==undefined?st.ecamp.dp:cur.party_name||'').trim();
  st.busy=true;r();
  const {error}=await SB.from('campaigns')
    .update({name,blurb,party_name:party||null}).eq('id',cur.id);
  st.busy=false;
  if(error){toast('No se guardó: '+error.message,'err');r();return}
  Object.assign(cur,{name,blurb,party_name:party||null});
  const i=CAMPS.findIndex(c=>c.id===cur.id);
  if(i>=0)CAMPS[i]=Object.assign({},CAMPS[i],{name,blurb,party_name:party||null});
  st.ecamp=null;st.tab='idx';r();scrollTo(0,0);
  toast('Campaña actualizada','ok');
}

/* ================= EDITOR ================= */
function edit(slug){
  const e=slug?byS[slug]:null;
  /* objeto nuevo: sin _live, no arrastra borradores. Estado y etiquetas se
     copian de entrada porque se editan tocando botones, no escribiendo. */
  st.editing={slug:slug||null,isNew:!slug,
    stt:(e&&e.st)||null, tags:((e&&e.tg)||[]).slice(),
    als:((e&&e.a)||[]).slice(),
    base:(e&&e.up)||null};   // versión sobre la que estoy editando
  st.dup=null;
  st.tab='ed';st.ac=null;st.acPick=null;r();scrollTo(0,0);
}
function vEd(){
  const E=st.editing, e=E.slug?byS[E.slug]:null;
  const name=E.dn!==undefined?E.dn:(e?e.n:'');
  const bodyTxt=E.db!==undefined?E.db:(e?e.b:'');
  const noteTxt=E.dc!==undefined?E.dc:(e?e.c:'');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const isPc=E.pc!==undefined?!!E.pc:(e?!!e.pc:false);
  const isGm=E.gm!==undefined?!!E.gm:(e?!!e.gm:false);
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  const prev={n:name||'?',t:type,img};
  return `<div class="top"><div class="topin">
      <button class="back" data-act="cancel">${ic("back")}Cancelar</button>
      <span class="tag push">${e?'EDITANDO':'FICHA NUEVA'}</span></div></div>
  <div class="page">
    <div class="eyebrow">Retrato</div>
    <div class="imgrow">
      ${av(prev,AV.hero,isGm?{big:1,gmring:1}:{big:1})}
      <div class="grow">
        <div class="btnrow even">
          <label class="btn sec2">${img?'Cambiar':'Elegir foto'}
            <input type="file" accept="image/*" style="display:none" onchange="upImg(event)"></label>
          ${img?`<button class="btn sec2" data-act="noimg">Quitar</button>`:''}
        </div>
        ${img?'':`<div class="hint">Sin foto se usan las iniciales.</div>`}
      </div></div>

    <div class="eyebrow">Nombre</div>
    <input class="sfield" id="fn" value="${att(name)}" placeholder="Nombre de la ficha"
      oninput="onNombre(this)">
    <div id="dupw">${avisoParecidas(name)}</div>

    <div class="eyebrow mt">Otros nombres</div>
    <div class="tagbox">
      ${(E.als||[]).map((a,i)=>`<span class="tagch">${esc(a)}<button data-act="rmals"
        data-v="${i}" aria-label="Quitar ${att(a)}">✕</button></span>`).join('')}
      <input class="taginput" id="alsin" placeholder="Como también le decimos"
        onkeydown="alsKey(event)" onblur="alsAdd(this)">
    </div>
    <div class="hint">Apodos, apellidos sueltos, el nombre en inglés. Sirven para
      encontrarla al buscar y con @, y para que no se cree dos veces.</div>

    <div class="eyebrow mt">Tipo</div>
    <div class="btnrow">${ORDER.map(t=>`<button class="gbtn ${type===t?'on':''}"
      style="${type===t?'':`color:${TYT(t).c};border-color:${TYT(t).c}55`}"
      data-act="type" data-v="${t}">${esc(TYT(t).s)}</button>`).join('')}</div>

    <button class="btn sec2 ${isPc?'on':''}" data-act="pc">
      ${isPc?'✓ ':''}Es de ${esc(cur.party_name||'nuestro grupo')}</button>
    <button class="btn sec2 gm ${isGm?'on':''}" data-act="gm">
      ${isGm?'✓ ':''}Es el Máster</button>

    <div class="eyebrow mt">Estado</div>
    <div class="btnrow">
      <button class="gbtn ${!E.stt?'on':''}" data-act="stt" data-v="">Sin estado</button>
      ${STORDER.map(k=>`<button class="gbtn ${E.stt===k?'on':''}"
        data-act="stt" data-v="${k}">${esc(STATUS[k])}</button>`).join('')}
    </div>

    <div class="eyebrow mt">Etiquetas</div>
    <div class="tagbox">
      ${(E.tags||[]).map((t,i)=>`<span class="tagch">${esc(t)}<button data-act="rmtag"
        data-v="${i}" aria-label="Quitar ${att(t)}">✕</button></span>`).join('')}
      <input class="taginput" id="tagin" placeholder="Agregar etiqueta"
        onkeydown="tagKey(event)" onblur="tagAdd(this)">
    </div>
    <div class="hint">Escribí y presioná Enter. Va donde el estado no alcanza:
      "revivido", "nos debe plata", "no confiar".</div>

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
    <div class="savebar"><button class="btn pri" data-act="save" ${st.busy?'disabled':''}>
      ${st.busy?'Guardando…':'Guardar'}</button></div>
  </div>`;
}
/* El aviso se redibuja solo, sin volver a dibujar el editor entero: en cada
   tecla se perdería la posición del cursor dentro del campo. */
function onNombre(el){
  if(st.editing)st.editing.dn=el.value;
  const box=document.getElementById('dupw');
  if(box)box.innerHTML=avisoParecidas(el.value);
}
function avisoParecidas(nombre){
  const E=st.editing;if(!E)return '';
  const c=parecidas(nombre,E.slug);
  if(!c.length)return '';
  return `<div class="warn">
    <div class="warnh">${c.length===1?'Ya hay una ficha parecida':'Ya hay fichas parecidas'}</div>
    ${c.map(x=>`<div class="warnrow">${av(x.e,AV.sm)}
      <div class="grow"><div class="rn">${esc(x.e.n)}</div>
        <div class="rs">${porqueSeParece(x)}</div></div>
      <button class="gbtn" data-act="misma" data-v="${att(x.e.s)}">Es esta</button>
    </div>`).join('')}</div>`;
}

/* ---------- otros nombres ---------- */
function alsAdd(el){
  const v=(el.value||'').trim();
  el.value='';
  if(!v||!st.editing)return false;
  const E=st.editing, e=E.slug?byS[E.slug]:null;
  const propio=E.dn!==undefined?E.dn:(e?e.n:'');
  if(nm(v)===nm(propio))return false;         // el nombre principal no es "otro nombre"
  const a=E.als=E.als||[];
  if(a.some(x=>nm(x)===nm(v)))return false;   // no repetir
  a.push(v);return true;
}
function alsKey(ev){
  if(ev.key!=='Enter'&&ev.key!==',')return;
  ev.preventDefault();
  if(alsAdd(ev.target))r();
}

function toHTML(txt){
  return esc(txt||'').replace(LK,(m,k)=>{const e=byS[k];
    return e?`<span class="tok" contenteditable="false" data-s="${att(k)}"`+
      ` style="--c:${TY(e).c}">${esc(e.n)}</span>`:m;
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
/* ---------- etiquetas ---------- */
function tagAdd(el){
  const v=(el.value||'').trim();
  el.value='';
  if(!v||!st.editing)return false;
  const t=st.editing.tags=st.editing.tags||[];
  if(t.some(x=>nm(x)===nm(v)))return false;   // no repetir
  t.push(v);return true;
}
function tagKey(ev){
  if(ev.key!=='Enter'&&ev.key!==',')return;
  ev.preventDefault();
  if(tagAdd(ev.target))r();
}

function shrink(file,max,q){
  const S=max||384, Q=q||.82;
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();
      im.onload=()=>{const sc=Math.min(S/im.width,S/im.height,1);
        const w=Math.max(1,Math.round(im.width*sc)),h=Math.max(1,Math.round(im.height*sc));
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;
        cv.getContext('2d').drawImage(im,0,0,w,h);
        res(cv.toDataURL('image/jpeg',Q))};
      im.onerror=()=>rej();im.src=rd.result};
    rd.onerror=()=>rej();rd.readAsDataURL(file);
  });
}
/* ---------- portada de la campaña ---------- */
async function saveCover(url){
  const {error}=await SB.from('campaigns').update({cover_url:url}).eq('id',cur.id);
  if(error){toast('No se pudo guardar la portada: '+error.message,'err');return}
  cur.cover_url=url;
  /* la lista de campañas tiene su propia copia: sin esto la home seguiría
     mostrando la tapa vieja hasta recargar */
  const i=CAMPS.findIndex(c=>c.id===cur.id);
  if(i>=0)CAMPS[i]=Object.assign({},CAMPS[i],{cover_url:url});
  r();
  toast(url?'Portada actualizada':'Portada quitada','ok');
}
async function upCover(ev){
  const f=ev.target.files&&ev.target.files[0];if(!f)return;
  ev.target.value='';                       // permite volver a elegir el mismo archivo
  const listo=toast('Procesando la imagen…',null,true);
  let url;
  try{url=await shrink(f,900,.78)}          // tapa de libro: se ve chica y desenfocada de fondo
  catch(_){listo();toast('No se pudo leer la imagen','err');return}
  listo();
  await saveCover(url);
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
  sp.textContent=e.n;
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
async function save(pisar){
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
  const gm=E.gm!==undefined?!!E.gm:(e?!!e.gm:false);
  const summary=autoSummary(body);
  // una etiqueta a medio escribir en el campo también cuenta
  tagAdd(document.getElementById('tagin')||{value:''});
  alsAdd(document.getElementById('alsin')||{value:''});
  const status=E.stt||null, tags=(E.tags||[]).slice();
  /* Antes de crear una ficha nueva: si hay alguna parecida, se pregunta. Solo
     al crear — renombrar una que ya existe es otra cosa y ahí el aviso de
     arriba alcanza. E.igual queda marcado si ya dijo que es otra. */
  if(!e&&!E.igual){
    const c=parecidas(name,null);
    if(c.length){st.dup={name,cands:c};r();return}
  }
  const before=e?new Set([...(ADJ[e.s]||[])]):new Set();
  const campo={name,body,notes,type,summary,status,tags,image_url:img,
    is_party:pc,is_gm:gm,edited_by:st.me||null};
  st.busy=true;r();
  let res;
  if(e&&e.id){
    /* Guardado con testigo: solo escribe si la ficha sigue en la versión que
       tenía cuando la abrí. Si alguien guardó en el medio no devuelve filas y
       lo resolvemos preguntando, en vez de pisarlo sin avisar. */
    let q=SB.from('entities').update(campo).eq('id',e.id);
    if(!pisar&&E.base)q=q.eq('updated_at',E.base);
    res=await q.select();
    if(!res.error&&(!res.data||!res.data.length)){
      st.busy=false;
      return conflicto(e,campo,before);
    }
    res.data=res.data&&res.data[0];
  }else{
    let slug=slugify(name)||('f'+Date.now());
    if(byS[slug])slug=slug+'-'+Date.now().toString(36).slice(-4);
    res=await SB.from('entities').insert({campaign_id:cur.id,slug,...campo}).select().single();
  }
  st.busy=false;
  if(res.error){toast('No se guardó: '+res.error.message,'err');r();return}
  const alErr=await guardarAlias(res.data.id,E.als||[],e?e.a:[]);
  await loadCamp(cur);
  if(alErr)toast('La ficha se guardó, los otros nombres no: '+alErr.message,'err');
  st.ent=res.data.slug;st.editing=null;st.tab='ficha';
  const added=[...(ADJ[st.ent]||[])].filter(x=>!before.has(x)).length;
  r();scrollTo(0,0);
  toast(added?`Guardado · ${added} vínculo${added>1?'s':''} nuevo${added>1?'s':''}`:'Guardado','ok');
}

/* Los otros nombres viven en su propia tabla, así que van aparte de la ficha.
   Se comparan por su forma normalizada, que es la misma con la que buscan el
   buscador y el @, y también la que guarda la columna normalized. */
async function guardarAlias(id,quedan,tenia){
  const q=(quedan||[]).map(x=>x.trim()).filter(Boolean), t=tenia||[];
  const nuevos=q.filter(x=>!t.some(y=>nm(y)===nm(x)));
  const fuera=t.filter(y=>!q.some(x=>nm(x)===nm(y)));
  if(nuevos.length){
    const {error}=await SB.from('entity_aliases')
      .insert(nuevos.map(a=>({entity_id:id,alias:a,normalized:nm(a)})));
    if(error)return error;
  }
  if(fuera.length){
    const {error}=await SB.from('entity_aliases').delete()
      .eq('entity_id',id).in('normalized',fuera.map(nm));
    if(error)return error;
  }
  return null;
}

/* ---------- "es esta": seguir sobre la ficha que ya está ----------
   No crea nada ni pisa nada: pasa el borrador a la ficha que ya existe, con
   lo escrito agregado al final y el nombre que se venía tipeando como otro
   nombre suyo. Queda todo a la vista en el editor; recién se escribe cuando
   la persona aprieta Guardar. */
function usarLaQueEsta(slug){
  const d=byS[slug];
  if(!d||!st.editing)return;
  keepDraft();
  const V=st.editing;
  if(V.slug===slug){st.dup=null;r();return}   // ya estoy en esa
  const suma=(base,extra)=>!extra?(base||''):((base||'').trim()?base.trimEnd()+'\n\n'+extra:extra);
  const N={slug,isNew:false,base:d.up,
    dn:d.n, db:suma(d.b,(V.db||'').trim()), dc:suma(d.c,(V.dc||'').trim()),
    stt:V.slug?d.st||null:(V.stt||d.st||null),
    tags:(d.tg||[]).slice(), als:(d.a||[]).slice()};
  (V.tags||[]).forEach(t=>{if(!N.tags.some(x=>nm(x)===nm(t)))N.tags.push(t)});
  (V.als||[]).forEach(a=>{if(!N.als.some(x=>nm(x)===nm(a)))N.als.push(a)});
  const viejo=(V.dn||'').trim();
  if(viejo&&nm(viejo)!==nm(d.n)&&!N.als.some(x=>nm(x)===nm(viejo)))N.als.push(viejo);
  st.dup=null;st.editing=N;st.ac=null;st.acPick=null;
  /* sin esto el próximo render rescataría el borrador del DOM viejo y pisaría
     lo que acabamos de armar */
  RENDERED=null;
  st.tab='ed';r();scrollTo(0,0);
  toast('Seguís sobre '+d.n+'. Revisá y guardá.','ok');
}
function vDup(){
  const c=st.dup.cands;
  return `<div class="dlgwrap"><div class="dlg">
    <div class="eyebrow">Antes de crearla</div>
    <h2 class="dlgh">${c.length===1?'Ya hay una ficha parecida':'Ya hay fichas parecidas'}</h2>
    <div class="dlgtx">Estás por crear «${esc(st.dup.name)}». Si es la misma que
      alguna de estas, tocala: lo que escribiste se suma ahí y «${esc(st.dup.name)}»
      le queda como otro nombre. Todavía no se guarda nada.</div>
    <div class="card">${c.map(x=>`<div class="row" data-act="misma" data-v="${att(x.e.s)}">
      ${av(x.e,AV.md)}
      <div class="grow"><div class="rn">${esc(x.e.n)}</div>
        <div class="rs">${porqueSeParece(x)}</div></div>
      <span class="rc">${ic('arrow','r')}</span></div>`).join('')}</div>
    <button class="btn sec2" data-act="dupcrear">No, es otra: crearla igual</button>
    <button class="btn sec2" data-act="dupvolver">Seguir editando</button>
  </div></div>`;
}

/* ---------- conflicto: alguien guardó mientras yo editaba ---------- */
function cuando(iso){
  if(!iso)return '';
  const d=new Date(iso), s=(Date.now()-d.getTime())/1000;
  if(s<60)return 'recién';
  if(s<3600)return 'hace '+Math.round(s/60)+' min';
  if(s<86400)return 'hace '+Math.round(s/3600)+' h';
  return d.toLocaleDateString('es',{day:'numeric',month:'short'})+
    ' '+d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
}
async function conflicto(e,campo,before){
  /* traigo la versión que hay ahora para poder mostrar de qué se trata */
  const {data}=await SB.from('entities')
    .select('name,summary,updated_at,edited_by').eq('id',e.id).single();
  const otro=data||{};
  st.conf={id:e.id,campo,before,slug:e.s,otro};
  r();
}
function vConf(){
  const C=st.conf,o=C.otro||{};
  return `<div class="dlgwrap"><div class="dlg">
    <div class="eyebrow">Guardado en conflicto</div>
    <h2 class="dlgh">${o.edited_by?esc(nombreDe(o.edited_by))+' guardó esta ficha':'Alguien más guardó esta ficha'}</h2>
    <div class="dlgtx">Mientras la editabas, ${o.edited_by?esc(nombreDe(o.edited_by)):'otra persona'} guardó cambios
      ${o.updated_at?'('+esc(cuando(o.updated_at))+')':''}. Si guardás lo tuyo,
      lo de esa persona se reemplaza.</div>
    <div class="dlgbox">
      <div class="dlgl">Lo que hay ahora</div>
      <div class="dlgv">${esc(o.name||'')}${o.summary?' · '+esc(o.summary):''}</div>
    </div>
    <div class="hint">Se guarda la versión anterior igual, así que nada se
      pierde: podés recuperarla desde el historial de la ficha.</div>
    <button class="btn pri" data-act="confpisar">Guardar lo mío igual</button>
    <button class="btn sec2" data-act="confver">Descartar y ver lo que hay</button>
    <button class="btn sec2" data-act="confvolver">Seguir editando</button>
  </div></div>`;
}

/* ============================================================
   IMPORTAR NOTAS
   La bitácora la escribe cada uno a su manera y en primera persona. En vez de
   interpretar prosa acá, se le da un texto para que se lo pase a su propia AI
   y devuelva una lista de fichas. Esto recibe esa lista, la compara con lo que
   ya hay y muestra qué va a pasar antes de tocar nada.
   ============================================================ */
const PROMPT=[
'Tengo notas de una partida de rol escritas a mano, en desorden y en primera',
'persona. Convertilas en fichas para un codex de campaña.',
'',
'Devolveme SOLO un JSON con esta forma, sin texto alrededor:',
'',
'{"fichas":[{',
'  "nombre":"Volothamp Geddarm",',
'  "tipo":"character",',
'  "otrosNombres":["Volo","Volos"],',
'  "resumen":"Escritor. Nos pidió ayuda para encontrar a su amigo Floon.",',
'  "descripcion":"Quién es y qué se sabe de él.",',
'  "conNosotros":"Qué pasó entre él y nosotros."',
'}]}',
'',
'Reglas:',
'- "tipo" es uno de: character, location, item, faction, creature.',
'- Una ficha por cosa, no una por cada vez que aparece.',
'- Si un mismo nombre está escrito de varias formas (Femwick, Femwin), elegí',
'  la más frecuente como "nombre" y poné TODAS las demás en "otrosNombres".',
'  Esto es lo más importante: sin eso quedan fichas duplicadas.',
'- En "otrosNombres" van también apodos, apellidos sueltos y el nombre en',
'  otro idioma si aparece.',
'- "resumen": una línea. "descripcion": qué es, en tercera persona.',
'  "conNosotros": lo que pasó con el grupo.',
'- Si algo no está en las notas, dejá el campo vacío. No inventes nada.',
'- Lo que en las notas es sospecha o teoría va con esas palabras ("se rumorea',
'  que", "creemos que"), nunca como un hecho.',
'- Ignorá lo que no sea del mundo de la partida: reglas y mecánicas, tiradas,',
'  niveles, links, canciones, listas sueltas de objetos.',
'- Escribí en castellano rioplatense, sin adornos.',
'',
'Las notas son estas:',
'',
''].join('\n');

const IMPTIPOS={character:1,location:1,item:1,faction:1,creature:1};
function importar(){
  st.imp={paso:'pegar',txt:'',plan:null,err:''};
  st.tab='imp';r();scrollTo(0,0);
}

/* ---------- enlazado automático ----------
   Las notas vienen en texto plano, así que sin esto se crean las fichas pero
   ningún vínculo, que es la mitad de la gracia. Se buscan los nombres
   conocidos dentro del texto y se convierten en enlaces.
   El plegado conserva la longitud (una vocal acentuada sigue midiendo uno),
   así que las posiciones del texto plegado valen sobre el original. */
const fold=s=>String(s==null?'':s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g,'');
const LETRA=/[a-z0-9]/;
function indiceNombres(extra){
  const m=[];
  const meter=(txt,slug)=>{
    const n=fold(txt).trim();
    /* menos de cuatro letras engancha cualquier cosa: "Fen" adentro de
       "Fenwick", "Lif" adentro de media palabra */
    if(n.length>=4)m.push({n,slug});
  };
  D.forEach(e=>{meter(e.n,e.s);(e.a||[]).forEach(a=>meter(a,e.s))});
  (extra||[]).forEach(x=>{meter(x.n,x.s);(x.a||[]).forEach(a=>meter(a,x.s))});
  return m.sort((a,b)=>b.n.length-a.n.length);   // gana el más largo
}
function enlazar(txt,mapa,propio){
  if(!txt)return txt||'';
  const hay=fold(txt), marcas=[];
  for(const m of mapa){
    if(m.slug===propio)continue;
    let i=0;
    while((i=hay.indexOf(m.n,i))>=0){
      const a=i, b=i+m.n.length;
      const antes=a?hay[a-1]:'', desp=b<hay.length?hay[b]:'';
      if(!LETRA.test(antes)&&!LETRA.test(desp))marcas.push([a,b,m.slug]);
      i=b;
    }
  }
  if(!marcas.length)return txt;
  /* Gana el match más largo, aunque empiece después: en "la Piedra de Golorr"
     el alias "la piedra" arranca antes, y por orden de aparición se quedaba
     con el lugar y dejaba colgando " de Golorr". */
  marcas.sort((x,y)=>(y[1]-y[0])-(x[1]-x[0])||x[0]-y[0]);
  const firmes=[];
  for(const mk of marcas)
    if(!firmes.some(f=>mk[0]<f[1]&&f[0]<mk[1]))firmes.push(mk);
  firmes.sort((x,y)=>x[0]-y[0]);
  let out='', fin=0;
  for(const mk of firmes){
    out+=txt.slice(fin,mk[0])+'[['+mk[2]+']]';
    fin=mk[1];
  }
  return out+txt.slice(fin);
}

/* ---------- leer lo que devolvió la AI ---------- */
function leerPlan(txt){
  let crudo=String(txt||'').trim();
  if(!crudo)return{err:'Pegá lo que te devolvió la AI.'};
  /* suele venir envuelto en un bloque de código, y a veces con una frase
     antes y otra después */
  const cerca=crudo.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(cerca)crudo=cerca[1].trim();
  const a=crudo.indexOf('{'), b=crudo.lastIndexOf('}');
  if(a<0||b<a)return{err:'Esto no parece el JSON que pide el texto de arriba.'};
  let j;
  try{j=JSON.parse(crudo.slice(a,b+1))}
  catch(e){return{err:'El JSON viene cortado o mal formado: '+e.message}}
  const lista=Array.isArray(j)?j:(j.fichas||j.entities||[]);
  if(!Array.isArray(lista)||!lista.length)return{err:'No encontré ninguna ficha adentro.'};

  const items=[];
  for(const f of lista){
    const nombre=String(f.nombre||f.name||'').trim();
    if(!nombre)continue;
    const als=[].concat(f.otrosNombres||f.aliases||[])
      .map(x=>String(x||'').trim())
      .filter((x,i,arr)=>x&&nm(x)!==nm(nombre)&&arr.findIndex(y=>nm(y)===nm(x))===i);
    const tipo=IMPTIPOS[f.tipo]?f.tipo:(IMPTIPOS[f.type]?f.type:'character');
    /* exacta por el nombre o por alguno de sus otros nombres: es la misma y
       no hay nada que preguntar */
    const nombres=[nombre].concat(als).map(nm);
    const e=D.find(x=>nombres.indexOf(nm(x.n))>=0
      ||(x.a||[]).some(al=>nombres.indexOf(nm(al))>=0));
    const dudas=e?[]:parecidas(nombre,null);
    items.push({
      nombre,tipo,als,
      resumen:String(f.resumen||f.summary||'').trim(),
      cuerpo:String(f.descripcion||f.body||'').trim(),
      notas:String(f.conNosotros||f.notes||'').trim(),
      e:e||(dudas.length?dudas[0].e:null),
      duda:!e&&dudas.length>0,
      acc:(e||dudas.length)?'sumar':'crear'
    });
  }
  if(!items.length)return{err:'Las fichas que vinieron no tienen nombre.'};
  return{items};
}

/* ---------- aplicar ---------- */
async function aplicarImp(){
  if(st.busy)return;
  const P=st.imp.plan.filter(x=>x.acc!=='nada');
  if(!P.length){toast('No hay nada marcado','err');return}
  st.busy=true;r();

  /* Los slugs de las que se van a crear se calculan antes de escribir nada,
     así el enlazado puede apuntar a fichas que todavía no existen. */
  const usados={};
  D.forEach(e=>{usados[e.s]=1});
  const nuevas=P.filter(x=>x.acc==='crear');
  nuevas.forEach(x=>{
    let sl=slugify(x.nombre)||('f'+Math.random().toString(36).slice(2,7));
    while(usados[sl])sl+='-'+Math.random().toString(36).slice(2,5);
    usados[sl]=1;x.slug=sl;
  });
  const mapa=indiceNombres(nuevas.map(x=>({n:x.nombre,s:x.slug,a:x.als})));
  const liga=(t,propio)=>enlazar(t,mapa,propio);

  let creadas=0,sumadas=0,alias=0;
  const fallos=[];
  for(const x of P){
    try{
      if(x.acc==='crear'){
        const cuerpo=liga(x.cuerpo,x.slug), notas=liga(x.notas,x.slug);
        const res=await SB.from('entities').insert({
          campaign_id:cur.id,slug:x.slug,name:x.nombre,type:x.tipo,
          summary:x.resumen||autoSummary(cuerpo),
          body:cuerpo,notes:notas,edited_by:st.me||null
        }).select().single();
        if(res.error)throw res.error;
        creadas++;
        if(x.als.length){
          const er=await guardarAlias(res.data.id,x.als,[]);
          if(er)throw er;
          alias+=x.als.length;
        }
      }else{
        const e=x.e;
        if(!e)continue;
        const suma=(base,extra)=>{
          const t=liga(extra,e.s);
          if(!t)return base||'';
          return (base||'').trim()?base.trimEnd()+'\n\n'+t:t;
        };
        const upd={body:suma(e.b,x.cuerpo),notes:suma(e.c,x.notas),
                   edited_by:st.me||null};
        if(!e.sm&&x.resumen)upd.summary=x.resumen;
        const res=await SB.from('entities').update(upd).eq('id',e.id);
        if(res.error)throw res.error;
        sumadas++;
        const faltan=x.als.filter(a=>nm(a)!==nm(e.n)
          &&!(e.a||[]).some(y=>nm(y)===nm(a)));
        if(faltan.length){
          const er=await guardarAlias(e.id,(e.a||[]).concat(faltan),e.a||[]);
          if(er)throw er;
          alias+=faltan.length;
        }
      }
    }catch(err){fallos.push(x.nombre+': '+(err.message||err))}
  }
  st.busy=false;
  await loadCamp(cur);
  st.imp=null;st.tab='idx';r();scrollTo(0,0);
  if(fallos.length)toast(fallos.length+' no entraron. '+fallos[0],'err');
  else toast(creadas+' nuevas · '+sumadas+' ampliadas'+
    (alias?' · '+alias+' nombres':''),'ok');
}

/* ---------- pantalla ---------- */
function vImp(){
  const I=st.imp;
  const cab='<div class="top"><div class="topin">'+
    '<button class="back" data-act="impsalir">'+ic('back')+'Salir</button>'+
    '<span class="tag push">IMPORTAR</span></div></div>';
  if(I.paso==='pegar')return cab+`<div class="page">
    <div class="eyebrow">Paso 1</div>
    <h1>Traer notas</h1>
    <div class="hint">Copiá el texto de abajo, pasáselo a tu AI junto con tus
      notas, y pegá acá lo que te devuelva. No se escribe nada hasta que
      revises qué va a pasar.</div>
    <button class="btn sec2" data-act="impprompt">${ic('scroll')}Copiar el texto para la AI</button>
    <div class="eyebrow mt">Lo que te devolvió</div>
    <textarea class="ta" id="impta" placeholder="Pegá acá la respuesta">${esc(I.txt||'')}</textarea>
    ${I.err?`<div class="warn"><div class="warnh">No pude leerlo</div>
      <div class="rs">${esc(I.err)}</div></div>`:''}
    <button class="btn pri" data-act="impleer">Revisar</button>
  </div>`;

  const P=I.plan;
  const cuenta=k=>P.filter(x=>x.acc===k).length;
  const fila=(x,i)=>{
    const et={crear:'Crear',sumar:'Sumar',nada:'Omitir'}[x.acc];
    /* el destino va en el renglón y no en el chip: "Sumar a Los Zhentarim"
       no entra a lo ancho y se cortaba al medio */
    const sub=x.acc==='sumar'
      ? `<div class="rs dest">Se suma a ${esc(x.e.n)}${x.duda?' <span class="dudach">¿es la misma?</span>':''}</div>`
      : (x.resumen||x.cuerpo)
        ? `<div class="rs">${esc((x.resumen||x.cuerpo).slice(0,90))}</div>`:'';
    return `<div class="row improw${x.acc==='nada'?' off':''}" data-act="impacc" data-v="${i}">
      <span class="dot" style="color:${TYT(x.tipo).c};background:currentColor"></span>
      <div class="grow">
        <div class="rn">${esc(x.nombre)}</div>
        ${sub}
        ${x.als.length?`<div class="rs dim">también: ${x.als.map(esc).join(' · ')}</div>`:''}
      </div>
      <span class="accch ${x.acc}">${et}</span></div>`;
  };
  return cab+`<div class="page">
    <div class="eyebrow">Paso 2</div>
    <h1>Qué va a pasar</h1>
    <div class="hint">${cuenta('crear')} fichas nuevas · ${cuenta('sumar')} se
      amplían · ${cuenta('nada')} sin tocar. Tocá una fila para cambiarla.
      Los nombres que el codex ya conoce quedan enlazados solos.</div>
    <button class="btn sec2" data-act="impvolver">Volver a pegar</button>
    <div class="card mt">${P.map(fila).join('')}</div>
    <div class="savebar"><button class="btn pri" data-act="impaplicar"${st.busy?' disabled':''}>
      ${st.busy?'Guardando…':'Aplicar'}</button></div>
  </div>`;
}

/* ================= HISTORIAL ================= */
async function openHist(slug){
  const e=byS[slug];if(!e)return;
  hist.push({tab:st.tab,ent:st.ent});
  st.ent=slug;st.hist={slug,rows:null};st.tab='hist';r();scrollTo(0,0);
  const {data,error}=await SB.from('entity_revisions')
    .select('id,name,summary,body,notes,status,tags,edited_by,replaced_at')
    .eq('entity_id',e.id).order('replaced_at',{ascending:false});
  if(error){toast('No se pudo leer el historial','err');st.hist.rows=[];r();return}
  st.hist.rows=data||[];r();
}
/* estado y etiquetas de una versión, como chips chicos */
function marcas(status,tags){
  const ch=[];
  if(status)ch.push(`<span class="hchip acc">${esc(STATUS[status]||status)}</span>`);
  (tags||[]).forEach(t=>ch.push(`<span class="hchip">${esc(t)}</span>`));
  return ch.length?`<div class="hmarks">${ch.join('')}</div>`:'';
}
function vHist(){
  const e=byS[st.ent], H=st.hist;
  const plano=t=>String(t||'').replace(LK,(_,k)=>byS[k]?byS[k].n:'').replace(/\s+/g,' ').trim();
  const cuerpo=H.rows===null
    ? `<div class="card">${'<div class="row"><div class="grow"><div class="skel" style="height:13px;width:38%"></div><div class="skel" style="height:11px;width:80%;margin-top:8px"></div></div></div>'.repeat(3)}</div>`
    : !H.rows.length
    ? `<div class="empty"><div class="ei">${ic("hourglass")}</div><div class="et">Sin versiones anteriores</div>
       <div class="es">Se guarda una cada vez que cambia el nombre, la descripción,
       el resumen o las notas.</div></div>`
    : `<div class="card">
        <div class="row hrow"><div class="grow">
          <div class="rn">Versión actual</div>
          <div class="rs">${esc(plano(e.b))||'Sin descripción'}</div>
          ${marcas(e.st,e.tg)}
          ${e.eb?`<div class="hwhen">por ${esc(nombreDe(e.eb))}</div>`:''}</div></div>
        ${H.rows.map(v=>`<div class="row hrow"><div class="grow">
          <div class="rn">${esc(v.name||e.n)}</div>
          <div class="rs">${esc(plano(v.body))||'Sin descripción'}</div>
          ${v.tags===null
            ? '<div class="hwhen">estado y etiquetas no registrados</div>'
            : marcas(v.status,v.tags)}
          <div class="hwhen">${esc(cuando(v.replaced_at))}${v.edited_by?' · por '+esc(nombreDe(v.edited_by)):''}</div></div>
          <button class="gbtn" data-act="restaurar" data-v="${att(v.id)}">Restaurar</button>
          </div>`).join('')}
      </div>`;
  return `<div class="top"><div class="topin">
      <button class="back" data-act="back">${ic("back")}Atrás</button>
      <span class="tag push">HISTORIAL</span></div></div>
    <div class="page">
      <div class="eyebrow">${esc(TY(e).s)}</div>
      <h1>${esc(e.n)}</h1>
      <div class="hint">Cada guardado deja la versión anterior acá.
        Restaurar no borra nada: lo de ahora queda como una versión más.</div>
      ${cuerpo}
      ${H.rows&&H.rows.length?`<div class="hint">Se guarda nombre, resumen,
        descripción, notas, estado y etiquetas. La foto no queda registrada.
        ${H.rows.some(v=>v.tags===null)?'Las versiones marcadas como no '+
          'registradas son anteriores a que se guardaran estado y etiquetas: '+
          'al restaurarlas esos dos campos quedan como están.':''}</div>`:''}
    </div>`;
}
async function restaurar(id){
  const H=st.hist, v=(H.rows||[]).find(x=>x.id===id), e=byS[H.slug];
  if(!v||!e)return;
  st.busy=true;r();
  const upd={name:v.name,summary:v.summary,body:v.body,notes:v.notes};
  /* tags NULL marca una revisión anterior a que se registraran estos campos:
     ahí no se sabe qué había, así que se dejan como están en vez de borrarlos */
  if(v.tags!==null&&v.tags!==undefined){upd.status=v.status||null;upd.tags=v.tags}
  const {error}=await SB.from('entities').update(upd).eq('id',e.id);
  st.busy=false;
  if(error){toast('No se pudo restaurar: '+error.message,'err');r();return}
  await loadCamp(cur);
  st.ent=H.slug;st.hist=null;st.tab='ficha';r();scrollTo(0,0);
  toast('Versión restaurada','ok');
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
  sel:null,selUser:false,hot:null,selEdge:null,
  picking:false,path:null,pathA:null,pathB:null,
  drag:null,panning:null,moved:false,downNode:null,
  depth:2,mode:'ego',off:new Set(),full:false,panel:false,
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
      <button class="back" data-act="back">${ic("back")}Atrás</button></div></div>
    <div class="empty"><div class="ei">${ic("mesh")}</div><div class="et">Nada que dibujar</div>
    <div class="es">Creá algunas fichas y enlazalas con @ para ver el grafo.</div></div>`;
  if(!byS[st.ent]){const top=D.slice().sort((a,b)=>deg(b.s)-deg(a.s))[0];st.ent=top?top.s:null}
  const opts=D.slice().sort((a,b)=>a.n.localeCompare(b.n))
    .map(x=>`<option value="${att(x.s)}"${x.s===st.ent?' selected':''}>${esc(x.n)}</option>`).join('');
  return `<div class="top"><div class="topin">
      <button class="back" data-act="back">${ic("back")}Atrás</button>
      <select class="sfield" id="gsel" data-act="center">${opts}</select>
    </div></div>
  <div class="gwrap" id="gwrap">
    <canvas id="cv"></canvas>
    <div class="gzoom">
      <button data-act="zoom" data-v="in" aria-label="Acercar">${ic('mas')}</button>
      <button data-act="zoom" data-v="out" aria-label="Alejar">${ic('menos')}</button>
      <button data-act="fit" aria-label="Encuadrar" title="Encuadrar">${ic('crosshair')}</button>
      <button data-act="reheat" aria-label="Reordenar" title="Reordenar">${ic('cycle')}</button>
      <button data-act="full" aria-label="${G.full?'Salir de pantalla completa':'Pantalla completa'}"
        title="${G.full?'Salir de pantalla completa':'Pantalla completa'}">${ic(G.full?'contract':'expand')}</button>
    </div>
    <div class="ghint" id="ghint">tocá un nodo o una línea · arrastrá para mover · rueda o pellizco para zoom</div>
    <div id="gcard"></div>
  </div>
  <div class="gctl" id="gctl">${gControls()}</div>
  <div class="glegend" id="glegend">${gLegend()}</div>
  <div class="page"><div class="hint" id="gstat"></div>
    <button class="btn sec2 ${G.panel?'on':''}" data-act="gsalud">
      ${ic('crosshair')}${G.panel?'Ocultar':'Qué falta trabajar'}</button>
    <div id="gsalud">${G.panel?vSalud():''}</div>
  </div>`;
}
function gControls(){
  const b=(v,l,on)=>`<button class="gbtn ${on?'on':''}" data-act="gmode" data-v="${v}">${l}</button>`;
  return b('1','1 salto',G.mode==='ego'&&G.depth===1)+
         b('2','2 saltos',G.mode==='ego'&&G.depth===2)+
         b('3','3 saltos',G.mode==='ego'&&G.depth===3)+
         b('all','Todo',G.mode==='all');
}
function gLegend(){
  const tipos=ORDER.map(t=>`<button class="lgb ${G.off.has(t)?'off':''}" style="--c:${TYT(t).c}"
    data-act="gtype" data-v="${t}"><span class="sw"></span>${esc(TYT(t).l)}</button>`).join('');
  /* las marcas de estado se explican solo si hay alguna en pantalla */
  const marca=(k,l)=>D.some(e=>e.st===k)
    ? `<span class="lgn"><i class="mk ${k}"></i>${l}</span>`:'';
  return tipos+marca('dead','muerto')+marca('missing','desaparecido');
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
  /* la línea elegida puede haber quedado fuera del recorte o del filtro */
  if(G.selEdge&&!G.edges.some(e=>e.a===G.selEdge.a&&e.b===G.selEdge.b))G.selEdge=null;
  if(G.path&&G.path.some(id=>!byS[id]))limpiarCamino();
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
  /* con una línea elegida el foco son sus dos puntas; con un camino, toda la
     cadena. Si no, el nodo mirado y sus vecinos. */
  const cam2=G.path&&G.path.length?new Set(G.path):null;
  const arCam=cam2?aristasDelCamino():null;
  const near=cam2?cam2
    :(G.selEdge?new Set([G.selEdge.a,G.selEdge.b])
    :(focus?new Set([focus,...(ADJ[focus]||[])]):null));

  /* --- aristas, en coordenadas del mundo --- */
  cx.save();cx.translate(cam.x,cam.y);cx.scale(cam.k,cam.k);
  cx.lineCap='round';
  const grad=G.edges.length<=260;
  G.edges.forEach(e=>{
    const a=G.map[e.a],b=G.map[e.b];if(!a||!b)return;
    const on=!near||(near.has(e.a)&&near.has(e.b));
    const hi=arCam?arCam.has(clavePar(e.a,e.b))
      :(G.selEdge?(e.a===G.selEdge.a&&e.b===G.selEdge.b)
      :(near&&(e.a===focus||e.b===focus)));
    cx.globalAlpha=hi?.95:(on?.45:.13);
    cx.lineWidth=(hi?1.9:1.15)/cam.k*Math.min(2.2,1+((e.w||1)-1)*.35);
    if(arCam&&hi){
      /* el camino va todo del mismo color: degradado por tipo se leía como
         tramos sueltos y no como una cadena */
      cx.strokeStyle='#E0B25C';cx.lineWidth=2.4/cam.k;
    }else if(grad&&hi){
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
    /* El Máster: un aro propio, sin animar. Acá se dibujan decenas de nodos
       por cuadro, no es lugar para las chispas que lleva en el índice. */
    if(n.e.gm){
      cx.beginPath();cx.arc(n.x,n.y,r+2.5/cam.k+2,0,6.2832);
      cx.strokeStyle='#E8C572';cx.globalAlpha=on?.9:.28;
      cx.lineWidth=1.6/cam.k+.7;cx.stroke();
      cx.globalAlpha=on?1:.3;
    }
    /* Lo que le pasó al personaje se tiene que ver acá y no solo adentro de la
       ficha: al alejarse se lee de una cuántos quedaron en el camino.
       "Se desconoce" no se marca a propósito: es lo mismo que no saber nada,
       que es como está la mayoría. */
    if(n.e.st==='dead'){
      cx.beginPath();cx.arc(n.x,n.y,r,0,6.2832);
      cx.fillStyle='rgba(13,16,21,.6)';cx.fill();
      const d=r*.7;
      cx.strokeStyle='#C3CBD8';cx.globalAlpha=on?.95:.3;
      cx.lineWidth=1.5/cam.k+.5;cx.lineCap='round';
      cx.beginPath();cx.moveTo(n.x-d,n.y+d);cx.lineTo(n.x+d,n.y-d);cx.stroke();
      cx.globalAlpha=on?1:.3;
    }else if(n.e.st==='missing'){
      cx.save();
      cx.setLineDash([3.2/cam.k,3.2/cam.k]);
      cx.beginPath();cx.arc(n.x,n.y,r+3/cam.k+1.5,0,6.2832);
      cx.strokeStyle=c;cx.globalAlpha=on?.85:.26;
      cx.lineWidth=1.4/cam.k+.5;cx.stroke();
      cx.restore();
      cx.globalAlpha=on?1:.3;
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
/* La línea no es recta: se dibuja con una curva que se aparta un 6% del
   medio. Con la distancia al segmento recto el toque erraba justo en el
   medio de las líneas largas, así que se muestrea la misma curva. */
function gHitEdge(sx,sy){
  const x=wx(sx),y=wy(sy), tope=11/G.cam.k;
  let best=null,bd=tope;
  for(const e of G.edges){
    const a=G.map[e.a],b=G.map[e.b];if(!a||!b)continue;
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y;
    const qx=mx-dy*.06,qy=my+dx*.06;                 // control de la curva
    let px=a.x,py=a.y;
    for(let i=1;i<=12;i++){
      const t=i/12,u=1-t;
      const cxp=u*u*a.x+2*u*t*qx+t*t*b.x, cyp=u*u*a.y+2*u*t*qy+t*t*b.y;
      const d=distSeg(x,y,px,py,cxp,cyp);
      if(d<bd){bd=d;best=e}
      px=cxp;py=cyp;
    }
  }
  return best;
}
function distSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1, l2=dx*dx+dy*dy;
  if(!l2)return Math.hypot(px-x1,py-y1);
  let t=((px-x1)*dx+(py-y1)*dy)/l2;
  t=t<0?0:t>1?1:t;
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}

/* ---------- por qué existe una línea ----------
   La frase del texto donde uno nombra al otro. Sale del cuerpo y las notas
   que ya están cargados y no de la tabla mentions, así nunca queda desfasada
   de lo que la ficha dice ahora. */
function partirFrases(t){
  const s=String(t||''), out=[];
  let ini=0;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    const corta=c==='\n'||
      ((c==='.'||c==='!'||c==='?'||c==='…')&&(i+1>=s.length||/\s/.test(s[i+1])));
    if(!corta)continue;
    const f=s.slice(ini,i+1).trim();
    if(f)out.push(f);
    ini=i+1;
  }
  const resto=s.slice(ini).trim();
  if(resto)out.push(resto);
  return out;
}
/* ---------- qué falta trabajar ----------
   Nodos puente: si sacás uno, el grafo se parte en dos. En una campaña suele
   ser el personaje que sostiene dos tramas a la vez, y casi siempre nadie se
   dio cuenta. Es distinto de "el que más aparece": mide de qué depende el
   resto, no cuánto se lo nombra.
   Tarjan clásico. Con decenas de fichas la recursión no es problema. */
function puentes(){
  const disc={},low={},padre={},art=new Set();
  let t=0;
  const dfs=u=>{
    disc[u]=low[u]=++t;
    let hijos=0;
    for(const v of (ADJ[u]||[])){
      if(!disc[v]){
        hijos++;padre[v]=u;dfs(v);
        low[u]=Math.min(low[u],low[v]);
        if(padre[u]!==undefined&&low[v]>=disc[u])art.add(u);
      }else if(v!==padre[u])low[u]=Math.min(low[u],disc[v]);
    }
    if(padre[u]===undefined&&hijos>1)art.add(u);   // la raíz, con otra regla
  };
  D.forEach(e=>{if(!disc[e.s])dfs(e.s)});
  return [...art].sort((a,b)=>deg(b)-deg(a));
}
function vSalud(){
  const sueltas=D.filter(e=>deg(e.s)===0);
  const mudas=D.filter(e=>deg(e.s)>0&&b3(e)===0);
  const pts=puentes().map(s=>byS[s]).filter(Boolean);
  const viejas=D.filter(e=>e.up).sort((a,b)=>new Date(a.up)-new Date(b.up)).slice(0,5);
  const bloque=(titulo,lista,pie,extra)=>lista.length?`<div class="sec">
    <div class="sech">${titulo}<span class="ct">${lista.length}</span></div>
    <div class="hint">${pie}</div>
    <div class="card">${lista.slice(0,12).map(e=>`
      <div class="row" data-act="gcentrar" data-v="${att(e.s)}">
        ${av(e,AV.sm)}
        <div class="grow"><div class="rn">${esc(e.n)}</div>
          <div class="rs">${esc(e.sm||TY(e).s)}</div></div>
        <span class="rc">${extra?esc(extra(e)):''}</span></div>`).join('')}</div>
  </div>`:'';
  const cuerpo=
    bloque('Sueltas',sueltas,'No están enlazadas con nada. Escribí @ en alguna ficha para conectarlas.')+
    bloque('Nadie las nombra',mudas,'Ellas mencionan a otras, pero nadie las menciona a ellas. Son puntas sueltas de la historia.')+
    bloque('Sostienen el mapa',pts,'Si sacaras una, el grafo se partiría en dos. Suelen ser las que atan dos tramas.',e=>deg(e.s)+' vínc.')+
    bloque('Hace más que no se tocan',viejas,'Las últimas en haberse editado.',e=>cuando(e.up));
  return cuerpo||`<div class="hint">Nada para señalar: todas las fichas están
    conectadas y al día.</div>`;
}

/* ---------- camino entre dos fichas ----------
   "¿Cómo llegamos de este a este otro?" es la pregunta que uno hace en la
   mesa. Anchura sobre todos los vínculos, no solo los que están dibujados:
   el camino corto puede pasar por fichas que el recorte de saltos dejó
   afuera, y decir que no hay camino cuando sí lo hay sería mentir. */
function caminoEntre(a,b){
  if(!byS[a]||!byS[b])return null;
  if(a===b)return[a];
  const prev={},vis={};vis[a]=1;
  const q=[a];
  for(let i=0;i<q.length;i++){
    const cur=q[i];
    for(const nx of (ADJ[cur]||[])){
      if(vis[nx])continue;
      vis[nx]=1;prev[nx]=cur;
      if(nx===b){
        const out=[b];let c=b;
        while(c!==a){c=prev[c];out.unshift(c)}
        return out;
      }
      q.push(nx);
    }
  }
  return null;
}
const clavePar=(a,b)=>a<b?a+'|'+b:b+'|'+a;
function aristasDelCamino(){
  const s=new Set();
  const p=G.path;
  if(!p)return s;
  for(let i=0;i<p.length-1;i++)s.add(clavePar(p[i],p[i+1]));
  return s;
}
function limpiarCamino(){
  G.picking=false;G.path=null;G.pathA=null;G.pathB=null;
}
function pedirCamino(){
  if(!G.sel)return;
  G.pathA=G.sel;G.pathB=null;G.path=null;G.picking=true;
  G.selEdge=null;
  gCard();gPaint();
}
function cerrarCamino(destino){
  G.pathB=destino;G.picking=false;
  G.path=caminoEntre(G.pathA,destino);
  /* si el camino pasa por fichas que el recorte no dibuja, se abre a toda la
     campaña: de nada sirve resaltar una cadena con eslabones invisibles */
  if(G.path&&G.path.some(id=>!G.map[id])){
    G.mode='all';G.pos={};gBuild();
    const c=document.getElementById('gctl');if(c)c.innerHTML=gControls();
  }
  G.sel=null;G.selUser=false;
  gCard();gPaint();
}

function porQue(aId,bId){
  const out=[];
  const mirar=(de,hacia)=>{
    const e=byS[de];if(!e)return;
    [['Descripción',e.b],['Con nosotros',e.c]].forEach(par=>{
      const marca='[['+hacia+']]';
      if(!par[1]||par[1].indexOf(marca)<0)return;
      partirFrases(par[1]).forEach(f=>{
        if(f.indexOf(marca)>=0&&out.length<4)out.push({de,campo:par[0],f});
      });
    });
  };
  mirar(aId,bId);mirar(bId,aId);
  return out;
}
function gCard(){
  const host=document.getElementById('gcard');if(!host)return;
  const hint=document.getElementById('ghint');
  /* G.path en null quiere decir dos cosas distintas: que todavía no se buscó,
     o que se buscó y no hay. Lo que dice que hubo búsqueda es el destino. */
  if(G.picking||G.pathB){
    if(hint)hint.hidden=true;
    const a=byS[G.pathA];
    if(!a){limpiarCamino();return gCard()}
    if(G.picking){
      host.innerHTML=`<div class="gcard gpcard">
        <button class="gcx" data-act="gclose" aria-label="Cancelar">✕</button>
        <div class="gehead"><span class="gpq">Desde</span>
          <span class="genom" style="color:${TY(a).c}">${esc(a.n)}</span></div>
        <div class="gpmsg">Tocá la otra ficha para ver cómo se conectan.</div>
      </div>`;
      return;
    }
    const b=byS[G.pathB];
    if(!b){limpiarCamino();return gCard()}
    if(!G.path){
      host.innerHTML=`<div class="gcard gpcard">
        <button class="gcx" data-act="gclose" aria-label="Cerrar">✕</button>
        <div class="gehead">
          <span class="genom" style="color:${TY(a).c}">${esc(a.n)}</span>
          <span class="gelin"></span>
          <span class="genom" style="color:${TY(b).c}">${esc(b.n)}</span></div>
        <div class="gpmsg">No hay ningún camino entre las dos. Todavía nada las
          conecta, ni de a saltos.</div>
      </div>`;
      return;
    }
    const pasos=G.path.length-1;
    host.innerHTML=`<div class="gcard gpcard">
      <button class="gcx" data-act="gclose" aria-label="Cerrar">✕</button>
      <div class="gpmsg">${pasos} paso${pasos===1?'':'s'} de distancia</div>
      <div class="gpcad">${G.path.map((id,i)=>{
        const e=byS[id];
        return (i?'<span class="gpar">→</span>':'')+
          `<span class="gpnodo" data-go="${att(id)}">${av(e,AV.xs)}
             <span style="color:${TY(e).c}">${esc(e.n)}</span></span>`;
      }).join('')}</div>
    </div>`;
    return;
  }
  if(G.selEdge){
    const E=G.selEdge, a=byS[E.a], b=byS[E.b];
    if(!a||!b){G.selEdge=null;return gCard()}
    if(hint)hint.hidden=true;
    const razones=porQue(E.a,E.b);
    const pinta=f=>esc(f).replace(LK,(m,k)=>{
      const e=byS[k];if(!e)return '';
      return (k===E.a||k===E.b)
        ? `<b style="color:${TY(e).c}">${esc(e.n)}</b>`:esc(e.n);
    });
    host.innerHTML=`<div class="gcard gecard">
      <button class="gcx" data-act="gclose" aria-label="Cerrar">✕</button>
      <div class="gehead">
        <span class="genom" style="color:${TY(a).c}" data-go="${att(a.s)}">${esc(a.n)}</span>
        <span class="gelin"></span>
        <span class="genom" style="color:${TY(b).c}" data-go="${att(b.s)}">${esc(b.n)}</span>
      </div>
      ${razones.length
        ? `<div class="gewhy">${razones.map(x=>`<div class="gefr">
             <span class="gede">${esc(byS[x.de].n)} · ${esc(x.campo)}</span>
             ${pinta(x.f)}</div>`).join('')}</div>`
        : `<div class="gewhy"><div class="gefr dim">Se nombran, pero no encontré
             la frase. Puede que el enlace esté en el resumen.</div></div>`}
    </div>`;
    return;
  }
  const n=G.sel&&G.map[G.sel];
  if(!n){host.innerHTML='';if(hint)hint.hidden=false;return}
  if(hint)hint.hidden=true;              // si no, la tarjeta lo tapa
  const e=n.e;
  host.innerHTML=`<div class="gcard">${av(e,AV.lg,{ring:1})}
    <div class="grow">
      <div class="gcn">${esc(e.n)}</div>
      <div class="gcs">${esc(TY(e).s)} · ${n.d} vínculo${n.d===1?'':'s'}</div></div>
    <button class="gco sec" data-act="gpath" title="Camino hasta otra ficha">Camino</button>
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
    if(wasNode&&!moved&&G.picking){
      /* estamos eligiendo el destino del camino */
      if(wasNode.id!==G.pathA)cerrarCamino(wasNode.id);
      return;
    }
    if(wasNode&&!moved){
      if(G.path)limpiarCamino();
      if(G.sel===wasNode.id&&!G.selEdge)go(wasNode.id);  // segundo toque abre la ficha
      else{G.sel=wasNode.id;G.selUser=true;G.selEdge=null;gCard();gPaint()}
    }else if(!wasNode&&!moved){
      /* en el vacío no hay nodo, pero puede haber una línea debajo */
      const p=at(ev), ar=gHitEdge(p.x,p.y);
      if(ar){G.selEdge={a:ar.a,b:ar.b};G.sel=null;G.selUser=false;gCard();gPaint()}
      else if(G.sel||G.selEdge||G.path||G.picking){
        G.sel=null;G.selUser=false;G.selEdge=null;limpiarCamino();gCard();gPaint()}
    }
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
  /* el botón cambia de sentido: al entrar muestra cómo salir */
  const b=w.querySelector('[data-act="full"]');
  if(b){const t=G.full?'Salir de pantalla completa':'Pantalla completa';
    b.innerHTML=ic(G.full?'contract':'expand');b.title=t;b.setAttribute('aria-label',t)}
  requestAnimationFrame(()=>{gSize();gFit();gDraw()});
}

/* ============================================================
   SHELL
   ============================================================ */
/* pestaña -> icono. El índice es un libro abierto, el grafo la telaraña de
   vínculos y la ficha nueva la pluma con la que se escribe. */
const NAV=[['idx','Índice','book'],['grafo','Grafo','mesh'],['nueva','Nueva','quill']];
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
  if(RENDERED==='edcamp'&&st.ecamp)keepCampDraft();
  if(RENDERED==='imp'&&st.imp){const t=document.getElementById('impta');if(t)st.imp.txt=t.value}
  if(RENDERED==='grafo')gStop();
  if(G.full){G.full=false;document.body.style.overflow=''}
  const f=snapFocus();
  const navEl=document.querySelector('.nav');
  const dlgEl=document.getElementById('dialogs');
  if(st.tab==='home'||!cur){
    app.innerHTML=vHome();dlgEl.innerHTML='';
    navEl.style.display='none';RENDERED='home';restFocus(f);return;
  }
  navEl.style.display='';
  if((st.tab==='ficha'||st.tab==='grafo')&&!byS[st.ent]&&st.tab!=='grafo')st.tab='idx';
  if(st.tab==='ficha'&&!byS[st.ent])st.tab='idx';
  if(st.tab==='ed'&&!st.editing)st.tab='idx';
  if(st.tab!=='ed')st.dup=null;   // el aviso de parecidas es cosa del editor
  if(st.tab==='edcamp'&&!st.ecamp)st.tab='idx';
  if(st.tab==='hist'&&(!st.hist||!byS[st.ent]))st.tab='idx';
  if(st.tab==='imp'&&!st.imp)st.tab='idx';
  const v={idx:vIdx,ficha:vFicha,grafo:vGrafo,ed:vEd,edcamp:vEdCamp,hist:vHist,imp:vImp}[st.tab]||vIdx;
  app.innerHTML=v();
  dlgEl.innerHTML=(st.conf?vConf():'')+(st.dup?vDup():'')+(st.pick?vPick():'');
  const on=st.tab==='grafo'?'grafo':(st.tab==='ed'?'nueva':'idx');
  document.getElementById('nav').innerHTML=NAV
    .map(([k,l,i])=>`<button class="nb ${on===k?'on':''}" data-act="nav" data-v="${k}">
      ${ic(i)}${l}</button>`).join('');
  RENDERED=st.tab;
  if(st.tab==='ed'){wireEd();st.editing._live=true}
  if(st.tab==='grafo')requestAnimationFrame(gMount);
  restFocus(f);syncNavH();
}
/* La navegación no siempre mide lo mismo (safe-area del teléfono, tamaño de
   fuente del sistema), y de ese alto dependen el relleno de la página y dónde
   se apoya la barra de guardar. Con un valor fijo quedaba un hueco
   transparente entre el botón y la navegación, y por ahí se veía el texto. */
function syncNavH(){
  const n=document.querySelector('.nav');
  if(!n||n.style.display==='none')return;
  const h=n.offsetHeight;
  if(h)document.documentElement.style.setProperty('--navh',h+'px');
}

/* ---------- un solo manejador de clicks para toda la app ---------- */
const ACT={
  home,back,
  nav:v=>{if(v==='nueva')edit(null);else tab(v)},
  camp:v=>setCamp(+v),
  newcamp:newCamp,
  view:v=>{st.view=v;r()},
  nocover:()=>saveCover(null),
  edcamp:editCamp,
  savecamp:saveCamp,
  hist:v=>openHist(v),
  restaurar:v=>restaurar(v),
  confpisar:()=>{st.conf=null;save(true)},
  confver:()=>{const s2=st.conf.slug;st.conf=null;st.editing=null;
    loadCamp(cur).then(()=>{st.ent=s2;st.tab='ficha';r();scrollTo(0,0)})},
  confvolver:()=>{st.conf=null;r()},
  cancelcamp:()=>{st.ecamp=null;st.tab='idx';r();scrollTo(0,0)},
  edit:v=>edit(v),
  new:()=>edit(null),
  cancel:()=>{const E=st.editing;st.editing=null;
    if(E&&E.slug&&byS[E.slug]){st.tab='ficha';st.ent=E.slug;r();scrollTo(0,0)}else tab('idx')},
  save,
  type:v=>{keepDraft();st.editing.type=v;r()},
  stt:v=>{keepDraft();st.editing.stt=v||null;r()},
  rmtag:v=>{keepDraft();(st.editing.tags||[]).splice(+v,1);r()},
  rmals:v=>{keepDraft();(st.editing.als||[]).splice(+v,1);r()},
  misma:v=>usarLaQueEsta(v),
  dupcrear:()=>{st.editing.igual=true;st.dup=null;save()},
  dupvolver:()=>{st.dup=null;r()},
  importar,
  impsalir:()=>{st.imp=null;tab('idx')},
  impvolver:()=>{st.imp.paso='pegar';st.imp.err='';r();scrollTo(0,0)},
  impprompt:()=>copiar(PROMPT,'Texto copiado. Pegáselo a tu AI con tus notas.'),
  impleer:()=>{
    const t=document.getElementById('impta');
    const res=leerPlan(t?t.value:'');
    if(res.err){st.imp.err=res.err;r();return}
    st.imp.plan=res.items;st.imp.err='';st.imp.paso='revisar';r();scrollTo(0,0);
  },
  /* cada toque cambia qué se va a hacer con esa fila */
  impacc:v=>{
    const x=st.imp.plan[+v];if(!x)return;
    const ciclo=x.e?(x.duda?['sumar','crear','nada']:['sumar','nada'])
                   :['crear','nada'];
    x.acc=ciclo[(ciclo.indexOf(x.acc)+1)%ciclo.length];r();
  },
  impaplicar:aplicarImp,
  pc:()=>{keepDraft();st.editing.pc=!st.editing.pc;r()},
  gm:()=>{keepDraft();st.editing.gm=!st.editing.gm;r()},
  pickme:()=>{st.pick=true;r()},
  setme:v=>setMe(v),
  pickskip:()=>{st.pick=false;r()},
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
  gclose:()=>{G.sel=null;G.selUser=false;G.selEdge=null;limpiarCamino();gCard();gPaint()},
  gpath:pedirCamino,
  gsalud:()=>{G.panel=!G.panel;r()},
  gcentrar:v=>{gCenter(v);G.panel=false;r();scrollTo(0,0)},
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
addEventListener('resize',()=>{syncNavH();
  if(st.tab==='grafo'&&G.cv){gSize();if(G.autofit)gFit();gDraw()}});
addEventListener('keydown',ev=>{
  if(st.tab!=='grafo')return;
  if(ev.key==='Escape'&&G.full)gFull();
  else if(ev.key==='+'||ev.key==='=')gZoom(1.25);
  else if(ev.key==='-')gZoom(1/1.25);
  else if(ev.key==='0'){G.autofit=false;gFit();gDraw()}
});

(async()=>{r();await loadCamps();r()})();
