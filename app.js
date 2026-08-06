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
/* Los cinco de arriba son los que vienen puestos, pero no alcanzan para todo:
   una casa noble no es una facción. Cualquier ficha puede llevar un tipo
   propio; el nombre se guarda como slug y se le arma un color estable a
   partir de él, para que el mismo tipo tenga siempre el mismo. */
/* El tono sale del nombre, con la saturación y la claridad fijas en los
   valores de los cinco que vienen puestos: así un tipo propio nunca
   desentona, y con 360 tonos dos tipos distintos casi nunca chocan. Una
   paleta corta hacía que "casa noble" y "deidad" salieran del mismo color. */
/* ---------- atributos de personaje ----------
   Solo en fichas de tipo Personaje. Las listas son sugerencias y no reglas: se
   puede escribir cualquier otra cosa y se guarda igual, nada más que sin icono.
   El nivel y las estadísticas quedan afuera a propósito: esto es un códice, no
   una hoja de personaje, y son datos que envejecen en una sesión. */
/* Las palabras que cambian con el género llevan las dos terminaciones entre
   llaves: "Muert{o|a}", "Palad{ín|ina}". El género se elige en la ficha pero no
   se muestra en ningún lado: existe solo para que concuerden. Sin dato gana el
   masculino, que es el genérico. */
const gen=(t,g)=>String(t==null?'':t)
  .replace(/\{([^|}]*)\|([^}]*)\}/g,(_,m,f)=>g==='f'?f:m);
const GENERO={m:'Masculino',f:'Femenino'};
const RAZAS={humano:'Human{o|a}',elfo:'Elf{o|a}',semielfo:'Semielf{o|a}',
  enano:'Enan{o|a}',mediano:'Median{o|a}',gnomo:'Gnom{o|a}',semiorco:'Semiorc{o|a}',
  tiefling:'Tiefling',draconido:'Dracónid{o|a}',warforged:'Warforged'};
const CLASES={barbaro:'Bárbar{o|a}',bardo:'Bard{o|a}',brujo:'Bruj{o|a}',
  clerigo:'Clérig{o|a}',druida:'Druida',explorador:'Explorador{|a}',
  guerrero:'Guerrer{o|a}',hechicero:'Hechicer{o|a}',mago:'Mag{o|a}',
  monje:'Monj{e|a}',paladin:'Palad{ín|ina}',picaro:'Pícar{o|a}'};
const ALINE={lb:'Legal buen{o|a}',nb:'Neutral buen{o|a}',cb:'Caótic{o|a} buen{o|a}',
  ln:'Legal neutral',nn:'Neutral',cn:'Caótic{o|a} neutral',
  lm:'Legal mal{o|a}',nm:'Neutral mal{o|a}',cm:'Caótic{o|a} mal{o|a}'};
const TRASF={acolito:'Acólit{o|a}',artesano:'Artesan{o|a}',artista:'Artista',
  criminal:'Criminal',ermitano:'Ermitañ{o|a}',forastero:'Foraster{o|a}',
  heroe:'H{éroe|eroína} del pueblo',huerfano:'Huérfan{o|a}',marinero:'Mariner{o|a}',
  noble:'Noble',sabio:'Sabi{o|a}',soldado:'Soldad{o|a}'};
/* El estado dejó de ser una columna con una sola opción: es una etiqueta más,
   así una ficha puede estar muerta Y revivida, que es lo que pasa en la mesa.
   "Vivo" no está a propósito: si no dice lo contrario, está viva. */
const ETIQ={muerto:'Muert{o|a}',revivido:'Revivid{o|a}',
  desaparecido:'Desaparecid{o|a}',encarcelado:'Encarcelad{o|a}'};
const ETORDER=['muerto','revivido','desaparecido','encarcelado'];

/* El orden es el que se ve, en la ficha y en el editor. "en" dice en qué tipos
   de ficha tiene sentido pedirlo: una facción no tiene raza y un lugar no tiene
   trasfondo, así que ahí ni se ofrecen. Agregar un atributo a otro tipo es
   sumarlo a esa lista y nada más. */
const ATRIB=[
  {k:'raza',        l:'Raza',        tb:RAZAS,  ic:v=>'raza-'+v,  ui:'chips', en:['character']},
  {k:'clase',       l:'Clase',       tb:CLASES, ic:v=>'clase-'+v, ui:'chips', en:['character']},
  /* el alineamiento va en desplegable y no en botones: son nueve y todos
     llevarían la misma balanza, que repetida nueve veces es ruido */
  {k:'alineamiento',l:'Alineamiento',tb:ALINE,  ic:()=>'align',   ui:'lista', en:['character']},
  {k:'trasfondo',   l:'Trasfondo',   tb:TRASF,  ic:v=>'trasf-'+v, icoDef:'trasf-otro',
                                                                  ui:'chips', en:['character']},
  /* no se muestra: solo hace concordar las palabras */
  {k:'genero',      l:'Género',      tb:GENERO,                   ui:'lista', en:['character'],
   oculto:true}
];
const atrDeTipo=t=>ATRIB.filter(a=>a.en.indexOf(t)>=0);
const tieneEtiq=(e,k)=>((e&&e.tg)||[]).some(t=>nm(t)===k);
/* Lo que se escribe se guarda con la clave de la lista cuando coincide con
   alguna, y tal cual cuando no. Así "elfo", "Elfo" y "ELFO" son la misma cosa
   y se pueden contar juntas, pero nada impide poner algo de tu mesa. */
/* Lo escrito se guarda con la clave de la lista cuando coincide con alguna
   —en cualquiera de sus dos géneros— y tal cual cuando no. */
function claveAtr(tb,v){
  const t=nm(v);if(!t)return '';
  for(const k in tb)
    if(nm(k)===t||nm(gen(tb[k],'m'))===t||nm(gen(tb[k],'f'))===t)return k;
  return String(v).trim().slice(0,80);
}
const etiqAtr=(tb,v,g)=>gen((tb&&tb[v])||v,g);
function iconoAtr(a,v){
  if(!a.ic)return '';
  return GI[a.ic(v)]?a.ic(v):(a.icoDef||'');
}
/* los que tienen algo cargado y se muestran, en orden */
const atrsDe=e=>ATRIB.filter(a=>!a.oculto&&e&&e.at&&e.at[a.k]);
/* las etiquetas de la lista y las propias, cada grupo por su lado */
const etiqsDe=e=>ETORDER.filter(k=>(e&&e.tg||[]).some(t=>nm(t)===k));
const libresDe=e=>((e&&e.tg)||[]).filter(t=>ETORDER.indexOf(nm(t))<0);

/* La fila: atributos, después el estado, después lo que cada uno agregó.
   Se usa igual en la ficha y en el repaso de la importación, así lo que se ve
   antes de escribir es lo mismo que va a quedar. */
function chipsAtr(e){
  const g=e&&e.at&&e.at.genero;
  const p=[];
  atrsDe(e).forEach(a=>{const v=e.at[a.k];
    p.push([iconoAtr(a,v),etiqAtr(a.tb,v,g),a.l]);});
  etiqsDe(e).forEach(k=>p.push(['etiq-'+k,gen(ETIQ[k],g),'Estado']));
  libresDe(e).forEach(t=>p.push(['',t,'Etiqueta']));
  if(!p.length)return '';
  return `<span class="atrs">${p.map(([i,txt,rot])=>
    `<span class="atr" title="${att(rot)}">${i&&GI[i]?ic(i):''}${esc(txt)}</span>`
  ).join('')}</span>`;
}
/* se quitan los vacíos: la base no acepta cadenas en blanco */
function limpiarAtrs(at){
  const o={};ATRIB.forEach(a=>{const v=at&&at[a.k];if(v)o[a.k]=String(v).slice(0,80)});
  return o;
}
const hashN=t=>{let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))>>>0;return h};
const colorDe=t=>'hsl('+(hashN(t)%360)+' 52% 63%)';
const deslug=t=>{const x=String(t||'').replace(/-/g,' ').trim();
  return x?x[0].toUpperCase()+x.slice(1):FALLBACK.l};
/* La base acepta solo estos cuatro estados (o ninguno); acá van sus nombres */
/* La columna status ya no se escribe: el estado vive en las etiquetas. Esto
   queda solo para leer las versiones viejas del historial, que sí la tienen. */
const STATUS={alive:'Vivo',dead:'Muerto',missing:'Desaparecido',unknown:'Se desconoce'};
const ORDER=['character','faction','location','item','creature'];
/* nunca explota si la base trae un tipo que no conocemos: le arma uno */
function TYT(t){
  if(TYPES[t])return TYPES[t];
  if(!t)return FALLBACK;
  const l=deslug(t);
  return {l,s:l,c:colorDe(t),propio:true};
}
const TY=e=>TYT(e&&e.t);
/* los tipos propios que de verdad se están usando en esta campaña */
function tiposPropios(){
  const vistos={};
  D.forEach(e=>{if(e.t&&!TYPES[e.t])vistos[e.t]=(vistos[e.t]||0)+1});
  return Object.keys(vistos).sort((a,b)=>vistos[b]-vistos[a]||a.localeCompare(b));
}
const tiposTodos=()=>ORDER.concat(tiposPropios());

let CAMPS=[], cur=null, D=[], byS={}, BL={}, ADJ={}, EDGES=[];
/* relaciones con nombre: {de, a, l} en slugs. Van aparte de EDGES porque
   una relación declarada no es lo mismo que una mención suelta. */
let REL=[], RELK={}, GRPK={};
let st={tab:'home',ent:null,q:'',editing:null,ecamp:null,hist:null,conf:null,dup:null,del:null,fus:null,imp:null,me:null,pick:false,ac:null,acPick:null,
        busy:false,view:'list',err:''};
let hist=[];
const app=document.getElementById('app');

/* ---------- utilidades ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const att=esc;                       // mismo escape, sirve para atributos
/* Tiene que dar exactamente lo mismo que norm() en la base, que es lo que
   calcula la columna normalized de los otros nombres:
   minúsculas, sin acentos, espacios seguidos colapsados en uno, sin bordes.
   Si difieren, el índice único de la base considera iguales dos cosas que la
   app cree distintas y el guardado falla. */
const nm=s=>String(s==null?'':s).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
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
  /* Una relación con nombre también es un vínculo, aunque los textos no se
     nombren. Y pesa más que una mención suelta: alguien la escribió a
     propósito. Se guarda aparte para poder dibujarlas distinto. */
  RELK={};
  REL.forEach(x=>{
    if(!byS[x.de]||!byS[x.a]||x.de===x.a)return;
    ADJ[x.de].add(x.a);ADJ[x.a].add(x.de);
    const k=x.de<x.a?x.de+'|'+x.a:x.a+'|'+x.de;
    if(!wmap[k])wmap[k]=1;
    (RELK[k]=RELK[k]||[]).push(x);
  });
  /* Los del grupo andan juntos: que su conexión dependa de que alguien la
     haya escrito es un accidente del texto, no la realidad de la mesa. Se
     conectan todos con todos, aparte, para poder dibujarlos distinto. */
  GRPK={};
  const party=D.filter(e=>e.pc&&!e.gm).map(e=>e.s);
  for(let i=0;i<party.length;i++)for(let j=i+1;j<party.length;j++){
    const a=party[i],b=party[j];
    ADJ[a].add(b);ADJ[b].add(a);
    const k=a<b?a+'|'+b:b+'|'+a;
    if(!wmap[k])wmap[k]=1;
    GRPK[k]=1;
  }
  EDGES=Object.keys(wmap).map(k=>{const[a,b]=k.split('|');
    return{a,b,w:wmap[k],rel:!!RELK[k],grp:!!GRPK[k]}});
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
  /* Comparar contra una sola palabra suelta de un nombre compuesto (p. ej.
     el apellido de un alias con dos palabras) es más débil que comparar
     contra el nombre entero: si el resto del nombre no se parece en nada,
     no alcanza con que esa palabra sí. Por eso resta .08, lo mismo que ya
     restaba el otro camino. Sin la resta, "Lalwen" pasaba el umbral contra
     "Halden" —la mitad del alias "Nicolás Halden"— por pura coincidencia de
     letras, aunque no suenan ni remotamente parecidos. */
  [cand,...toks].forEach(t=>{if(Math.abs(t.length-q.length)>3)return;
    const v=1-dl(q,t)/Math.max(q.length,t.length,1);
    const penal=(t!==cand&&toks.length>1)?.08:0;
    if(v-penal>best)best=v-penal});
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
  const [ents,als,rel,cov]=await Promise.all([
    SB.from('entities')
      .select('id,slug,type,name,summary,body,notes,image_url,is_party,is_gm,tags,attrs,created_at,updated_at,edited_by')
      .eq('campaign_id',c.id).is('archived_at',null).order('name'),
    SB.from('entity_aliases').select('alias,entities!inner(campaign_id,slug)')
      .eq('entities.campaign_id',c.id),
    SB.from('relationships').select('id,from_entity_id,to_entity_id,label')
      .eq('campaign_id',c.id),
    SB.from('campaigns').select('cover_url').eq('id',c.id).single()
  ]);
  st.busy=false;
  if(ents.error){toast('No se pudieron cargar las fichas','err');return}
  c=Object.assign({},c,{cover_url:(cov.data&&cov.data.cover_url)||null});
  const amap={};
  (als.data||[]).forEach(x=>{const s=x.entities.slug;(amap[s]=amap[s]||[]).push(x.alias)});
  D=(ents.data||[]).map(e=>({id:e.id,s:e.slug,t:e.type,n:e.name,sm:e.summary||'',
    b:e.body||'',c:e.notes||'',tg:e.tags||[],at:e.attrs||{},up:e.updated_at,cr:e.created_at,img:e.image_url,pc:e.is_party?1:0,gm:e.is_gm?1:0,eb:e.edited_by||null,a:amap[e.slug]||[]}));
  /* las relaciones vienen por id de ficha; se pasan a slug, que es con lo que
     trabaja todo el resto de la app */
  const porId={};D.forEach(e=>{porId[e.id]=e.s});
  REL=(rel.data||[]).map(x=>({id:x.id,de:porId[x.from_entity_id],
    a:porId[x.to_entity_id],l:x.label})).filter(x=>x.de&&x.a);
  cur=c;rebuild();loadMe();
  G.pos={};G.sel=null;G.selEdge=null;G.tag=null;cargarPins();  // arranca limpio
  if(!st.ent||!byS[st.ent]){
    /* si dijiste quién sos, el grafo y la primera ficha arrancan en vos; si no,
       en la que más conexiones tiene */
    const top=D.slice().sort((a,b)=>deg(b.s)-deg(a.s)||b3(b)-b3(a))[0];
    st.ent=(st.me&&byS[st.me])?st.me:(top?top.s:null);
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
    <div class="eyebrow">Juramento del códice</div>
    <h2 class="dlgh">¿Quién osa alterar las escrituras?</h2>
    <div class="dlgtx">Cada crónica en este códice requiere la firma de su autor. Selecciona tu identidad o arriésgate a que tus palabras se pierdan en el olvido.</div>
    ${lista.length?`<div class="card pickl">${lista.map(e=>`
      <div class="row" data-act="setme" data-v="${att(e.s)}">
        ${av(e,AV.md,e.gm?{gmring:1}:{})}
        <div class="grow"><div class="rn">${esc(e.n)}</div>
          <div class="rs">${e.gm?'Máster':esc(cur.party_name||'Del grupo')}</div></div>
        <span class="rc">${ic("arrow","r")}</span></div>`).join('')}</div>`
    :`<div class="hint">Todavía no hay personajes del grupo ni Máster. Marcá
      alguna ficha como del grupo o como Máster desde su editor.</div>`}
    <button class="btn sec2" data-act="pickskip">Continuar sin dejar rastro</button>
  </div></div>`;
}

/* ---------- navegación ----------
   El que scrollea es #app, no el documento. En iOS el rebote del scroll del
   documento arrastra con él a los elementos fijos y la navegación de abajo se
   despega; con el scroll adentro de un contenedor eso no puede pasar. */
/* Scrollea el documento, pero se lee y se escribe también en #app por si
   alguna vez vuelve a ser él el que scrollea. */
function scrollAhora(){
  const a=document.getElementById('app');
  return Math.round(scrollY||(a&&a.scrollTop)||0);
}
function irY(y){
  const a=document.getElementById('app');
  if(a)a.scrollTop=y||0;
  try{scrollTo(0,y||0)}catch(_){}
}
const alTope=()=>irY(0);
/* La app nunca cambia de página, así que el navegador no tenía nada que
   desandar: el gesto de volver del teléfono (deslizar desde el borde en iOS,
   el atrás del sistema en Android) sacaba del códice de una. Ahora cada
   pantalla que se abre deja su entrada en el historial, con la vista adentro.
   De paso la dirección queda escrita, así que recargar te devuelve donde
   estabas en vez de a la lista de campañas, y un link a una ficha se comparte. */
const verActual=()=>{
  const v={tab:st.tab,ent:st.ent,camp:cur?cur.id:null};
  /* en el grafo se recuerda también qué nodo estaba tocado: al volver aparece
     la misma tarjeta abierta y no el grafo pelado */
  if(st.tab==='grafo'&&G.sel)v.sel=G.sel;
  return v;
};
const campSlug=c=>String((c&&(c.slug||c.id))||'');
function rutaDe(){
  if(!cur||st.tab==='home')return '#/';
  const c=encodeURIComponent(campSlug(cur));
  if(st.tab==='ficha'&&st.ent)return '#/'+c+'/f/'+encodeURIComponent(st.ent);
  if(st.tab==='grafo')return '#/'+c+'/grafo'+(st.ent?'/'+encodeURIComponent(st.ent):'');
  /* editor, historial e importador son de paso: no tienen dirección propia,
     se muestran sobre la del índice */
  return '#/'+c;
}
function leerRuta(){
  let p;
  try{p=(location.hash||'').replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent)}
  catch(_){return null}
  if(!p.length)return null;
  if(p[1]==='f')return {camp:p[0],tab:'ficha',ent:p[2]||null};
  if(p[1]==='grafo')return {camp:p[0],tab:'grafo',ent:p[2]||null};
  return {camp:p[0],tab:'idx',ent:null};
}
function marcarNav(){try{history.pushState({v:verActual()},'',rutaDe())}catch(_){}}
function sellarNav(){try{history.replaceState({v:verActual()},'',rutaDe())}catch(_){}}
/* la pila interna sólo sirve para saber si el botón de atrás tiene a dónde ir;
   el que manda es el historial del navegador */
function apilar(){
  /* La entrada que estamos por dejar se vuelve a sellar con el scroll donde
     está: al volver a ella se cae en el mismo lugar y no arriba de todo. */
  const y=scrollAhora();
  hist.push(Object.assign(verActual(),{y}));
  if(hist.length>60)hist.shift();
  try{history.replaceState({v:Object.assign(verActual(),{y})},'')}catch(_){}
}

/* Ir a donde ya estás no es navegar: si dejara entrada, el historial juntaría
   dos iguales pegadas y el siguiente Atrás no cambiaría nada. */
function go(id){
  if(!byS[id])return;
  if(st.tab==='ficha'&&st.ent===id&&!st.editing){r();alTope();return}
  apilar();
  st.ent=id;st.tab='ficha';st.editing=null;st.ecamp=null;r();alTope();marcarNav();
}
function tab(t){
  if(st.tab===t&&!st.editing&&!st.ecamp){st.q='';r();alTope();return}
  apilar();
  st.tab=t;st.editing=null;st.ecamp=null;st.q='';r();alTope();marcarNav();
}
/* El botón de atrás y el gesto tienen que hacer lo mismo, así que el botón
   delega en el historial y todo termina en popstate, en un solo lugar. */
function back(){
  if(hist.length){history.back();return}
  st.tab=cur?'idx':'home';st.editing=null;st.ecamp=null;r();alTope();sellarNav();
}

/* Cerrar una pantalla que se abrió sobre otra —el editor, el historial, el
   importador— es volver, no avanzar: tiene que consumir la entrada que dejó
   al abrirse. Antes se reemplazaba esa entrada por la vista de destino y el
   historial quedaba con dos iguales pegadas, así que el primer toque de Atrás
   no cambiaba nada y había que tocar dos veces.
   Con "vista" se impone a dónde llegar (la ficha recién guardada, el índice);
   sin ella se vuelve a donde se estaba antes de abrir. */
let ALVOLVER=null;
function cerrar(vista){
  st.editing=null;st.ecamp=null;st.imp=null;st.hist=null;st.dup=null;st.conf=null;
  const v=vista?Object.assign({camp:cur?cur.id:null,ent:st.ent},vista):null;
  if(!hist.length){
    if(v)aplicarVista(v).then(sellarNav);else{r();alTope();sellarNav()}
    return;
  }
  ALVOLVER=v;
  try{history.back()}
  catch(_){ALVOLVER=null;if(v)aplicarVista(v).then(sellarNav)}
}
async function aplicarVista(v){
  st.editing=null;st.ecamp=null;st.conf=null;st.dup=null;
  st.imp=null;st.hist=null;st.ac=null;st.q='';
  if(!v||!v.camp||v.tab==='home'){st.tab='home';r();alTope();return}
  if(!cur||cur.id!==v.camp){
    const c=CAMPS.filter(x=>x.id===v.camp)[0];
    if(!c){st.tab='home';r();alTope();return}
    st.ent=v.ent;await loadCamp(c);
    st.pick=!st.me&&quienes().length>0;
  }
  if(v.ent&&byS[v.ent])st.ent=v.ent;
  if(v.tab==='grafo'&&v.sel&&byS[v.sel]){G.sel=v.sel;G.selUser=true;G.selEdge=null}
  st.tab=v.tab;r();
  /* después de pintar, para que el alto del contenido ya exista */
  const y=v.y||0;irY(y);requestAnimationFrame(()=>irY(y));
}
addEventListener('popstate',ev=>{
  if(hist.length)hist.pop();
  /* si veníamos de cerrar una pantalla, manda el destino que pidió */
  const forzada=ALVOLVER;ALVOLVER=null;
  if(forzada){aplicarVista(forzada).then(sellarNav);return}
  const v=(ev.state&&ev.state.v)||null;
  if(v){aplicarVista(v);return}
  /* entrada sin estado nuestro (llegaste por un link pegado, o el navegador
     restauró la sesión): se reconstruye desde la dirección */
  const rt=leerRuta();
  if(!rt){aplicarVista(null);return}
  const c=CAMPS.filter(x=>campSlug(x)===rt.camp)[0];
  aplicarVista(c?{tab:rt.tab,ent:rt.ent,camp:c.id}:null);
});

async function setCamp(i){
  apilar();st.ent=null;await loadCamp(CAMPS[i]);
  st.tab='idx';st.q='';st.editing=null;
  st.pick=!st.me&&quienes().length>0;
  r();alTope();marcarNav();
}
function home(){apilar();st.tab='home';st.q='';r();alTope();marcarNav()}

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
      rel="noopener">game-icons.net</a> (Lorc, Delapouite, Felbrigg y sbed), bajo licencia
      <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.</div>
  </div>`;
}

/* ================= ÍNDICE ================= */
function rowHTML(e,via){
  return `<div class="row${e.gm?' gmrow':''}" data-go="${att(e.s)}">${av(e,AV.md,e.gm?{gmring:1}:{})}
    <div class="grow"><div class="rn">${esc(e.n)}</div>
      <div class="rs">${esc(e.sm)}${via?` · coincide con "${esc(via)}"`:''}</div></div>
    <span class="rc">${b3(e)}</span></div>`;
}
function cardHTML(e){
  return `<div class="ccard${e.gm?' gmcard':''}" data-go="${att(e.s)}" style="--c:${TY(e).c}">${
    e.gm?'<span class="gmaura" aria-hidden="true"></span>':''}${av(e,AV.xl,e.gm?{gmring:1}:{})}
    <div class="ccn">${esc(e.n)}</div>
    <div class="ccc">${(()=>{
      /* En la tarjeta pesa más saber qué es el personaje que cuántas veces se
         lo nombra; si no tiene atributos cargados sigue yendo el conteo. */
      const A=atrsDe(e).filter(a=>a.k==='raza'||a.k==='clase');
      const g=e.at&&e.at.genero;
      return A.length?A.map(a=>esc(etiqAtr(a.tb,e.at[a.k],g))).join(' · ')
                     :b3(e)+' menc.';
    })()}</div></div>`;
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
    /* alfabético en cada grupo: la lista se lee buscando un nombre, no el
       más mencionado */
    const abc=(a,b)=>a.n.localeCompare(b.n,'es');
    const gms=D.filter(e=>e.gm).sort(abc);
    let out=gms.length?`<div class="grp gmgrp">
      <div class="grph">Máster<span class="ct">${gms.length}</span></div>
      ${group(gms)}</div>`:'';
    const pcs=D.filter(e=>e.pc&&!e.gm).sort(abc);
    out+=pcs.length?`<div class="grp">
      <div class="grph" style="color:var(--ink)">${esc(cur.party_name||'Nuestro grupo')}
        <span class="ct">${pcs.length}</span></div>${group(pcs)}</div>`:'';
    out+=tiposTodos().map(t=>{
      const g=D.filter(e=>e.t===t&&!e.pc&&!e.gm).sort(abc);
      if(!g.length)return'';
      return `<div class="grp"><div class="grph" style="color:${TYT(t).c}">
        ${TYT(t).l}<span class="ct">${g.length}</span></div>${group(g)}</div>`;
    }).join('');
    /* solo quedan acá las que no tienen tipo ninguno */
    const rest=D.filter(e=>!e.pc&&!e.gm&&!e.t).sort(abc);
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
      <button class="back" data-act="home">${ic("camp")}Campañas</button>
      <label class="searchw">
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
  /* alfabético y no por cantidad de vínculos: la lista se lee buscando un
     nombre, y para eso el orden tiene que ser el del abecedario */
  const rel=[...(ADJ[e.s]||[])].map(s=>byS[s]).filter(Boolean)
    .sort((a,b)=>a.n.localeCompare(b.n,'es'));
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
    ${e.a&&e.a.length?`<div class="aka">también: ${e.a.slice()
      .sort((x,y)=>x.localeCompare(y,'es')).map(esc).join(' · ')}</div>`:''}
    ${/* Todo lo que describe a la ficha en una sola fila —atributos, estado y
          lo que cada uno agregó—, y los dos conteos en otra. Si no hay nada
          cargado la primera no aparece: la mayoría de los NPC van a estar
          vacíos y no tienen por qué verse incompletos. */
      chipsAtr(e)}
    <div class="atrs cuenta">
      <span class="atr">${ic('menciones')}${bl.length} menciones</span>
      <span class="atr">${ic('link')}${rel.length} conexiones</span></div>
    <div class="prose">${prose(e.b)||'<p style="color:var(--dim)">Sin descripción todavía.</p>'}</div>
    ${e.c?`<div class="sec"><div class="sech">Comentarios</div>
      <div class="ours">${prose(e.c)}</div></div>`:''}
    ${bl.length?`<div class="sec"><div class="sech">Se lo menciona en</div>
      <div class="rail">${bl.map(b=>{const src=byS[b.s];if(!src)return'';
        return `<div class="bl" style="color:${TY(src).c}" data-go="${att(b.s)}">
          <div class="blsrc">${av(src,AV.xs)}<span>${esc(src.n)}</span>${
            b.where==='ours'?'<span class="blnote">· en comentarios</span>':''}</div>
          <div class="blsnip">${esc(b.snip).replace(/§(.*?)§/g,'<em>$1</em>')}</div></div>`}).join('')}
      </div></div>`:''}
    ${rel.length?`<div class="sec"><div class="sech">Conectado con</div>
      <div class="card">${rel.map(x=>`<div class="row" data-go="${att(x.s)}">${av(x,AV.sm)}
        <div class="grow"><div class="rn">${esc(x.n)}</div>
        <div class="rs">${esc(x.sm)}</div></div>
        <span class="rc">${esc(TY(x).s)}</span></div>`).join('')}</div></div>`:''}
    <div class="sec"><button class="btn sec2" data-act="graphof" data-v="${att(e.s)}">
      Ver en el grafo</button>
      <button class="btn sec2" data-act="hist" data-v="${att(e.s)}">
      Historial de cambios</button></div>
  </div>`;
}

/* ================= EDITAR CAMPAÑA ================= */
function editCamp(){apilar();st.ecamp={};st.tab='edcamp';r();alTope();marcarNav()}
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
      <button class="back" data-act="cancelcamp">Cancelar</button>
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

    ${vTiposPropios()}

    <div class="savebar"><button class="btn pri" data-act="savecamp" ${st.busy?'disabled':''}>
      ${st.busy?'Guardando…':'Guardar'}</button></div>
  </div>`;
}
/* ---------- administrar los tipos propios ----------
   Un tipo propio existe mientras alguna ficha lo use, así que para sacar uno
   mal escrito habría que ir ficha por ficha, sin siquiera saber cuáles son.
   Acá se ven todos con su cuenta, y se pueden renombrar o borrar pasando sus
   fichas a otro tipo. Los cinco que vienen puestos no se tocan. */
function vTiposPropios(){
  const propios=tiposPropios();
  if(!propios.length)return '';
  const E=st.ecamp;
  const cuantas=t=>D.filter(e=>e.t===t).length;
  return `<div class="eyebrow mt">Tipos propios</div>
    <div class="card">${propios.map(t=>{
      const n=cuantas(t), abierto=E.tipo===t;
      return `<div class="row tprow${abierto?' open':''}">
        <div class="impcab" style="padding:0;width:100%">
          <span class="dot" style="color:${TYT(t).c};background:currentColor"></span>
          <div class="grow"><div class="rn">${esc(TYT(t).l)}</div>
            <div class="rs">${n} ficha${n===1?'':'s'}</div></div>
          <button class="gbtn" data-act="tpabrir" data-v="${att(t)}">
            ${abierto?'Cerrar':'Cambiar'}</button>
        </div>
        ${abierto?`<div class="impdet" style="padding-left:calc(8px + var(--s3))">
          <div class="impcampo"><div class="impcr">Renombrarlo</div>
            <div class="btnrow even" style="margin-top:var(--s2)">
              <input class="sfield" id="tpren" value="${att(TYT(t).l)}">
              <button class="btn sec2" data-act="tprenombrar" data-v="${att(t)}">Cambiar</button>
            </div></div>
          <div class="impcampo"><div class="impcr">O pasar sus ${n} ficha${n===1?'':'s'} a</div>
            <div class="btnrow" style="margin-top:var(--s2)">${
              tiposTodos().filter(o=>o!==t).map(o=>`<button class="gbtn"
                style="color:${TYT(o).c};border-color:${TYT(o).c}55"
                data-act="tpmover" data-v="${att(t)}" data-a="${att(o)}">${esc(TYT(o).s)}</button>`).join('')}
            </div>
            <div class="hint">El tipo desaparece solo cuando ninguna ficha lo usa.</div>
          </div>
        </div>`:''}
      </div>`;
    }).join('')}</div>`;
}
/* Las dos operaciones son la misma: reescribir el tipo de todas las fichas
   que lo tenían. Renombrar es moverlas al nombre nuevo. */
async function moverTipo(de,a){
  const fichas=D.filter(e=>e.t===de);
  if(!fichas.length)return;
  if(!a||a===de)return;
  st.busy=true;r();
  const {error}=await SB.from('entities').update({type:a,edited_by:st.me||null})
    .in('id',fichas.map(e=>e.id));
  st.busy=false;
  if(error){toast('No se pudo cambiar: '+error.message,'err');r();return}
  await loadCamp(cur);
  st.ecamp.tipo=null;r();
  toast(fichas.length+' ficha'+(fichas.length===1?'':'s')+' a «'+TYT(a).l+'»','ok');
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
  cerrar({tab:'idx'});
  toast('Campaña actualizada','ok');
}

/* ================= EDITOR ================= */
/* Instantánea comparable del estado del editor. Guardar (arriba, en una
   ficha que ya existe) solo se habilita si esto cambió respecto de cuando
   se abrió: así un chip que se prende y se apaga de nuevo, o abrir y cerrar
   sin tocar nada, no dejan el botón habilitado por las dudas. */
function firmaEd(E,e){
  const name=(E.dn!==undefined?E.dn:(e?e.n:'')).trim();
  const body=E.db!==undefined?E.db:(e?e.b:'');
  const notes=E.dc!==undefined?E.dc:(e?e.c:'');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const isPc=E.pc!==undefined?!!E.pc:(e?!!e.pc:false);
  const isGm=E.gm!==undefined?!!E.gm:(e?!!e.gm:false);
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  return JSON.stringify({name,body,notes,img,isPc,isGm,type,
    at:limpiarAtrs(E.at||{}),
    tags:(E.tags||[]).slice().sort(),
    als:(E.als||[]).slice().sort(),
    rels:(E.rels||[]).map(x=>x.a+'|'+x.l).sort()});
}
function edit(slug){
  const e=slug?byS[slug]:null;
  /* objeto nuevo: sin _live, no arrastra borradores. Estado y etiquetas se
     copian de entrada porque se editan tocando botones, no escribiendo. */
  st.editing={slug:slug||null,isNew:!slug,
    tags:((e&&e.tg)||[]).slice(),
    at:Object.assign({},(e&&e.at)||{}),
    als:((e&&e.a)||[]).slice(),
    rels:e?REL.filter(x=>x.de===e.s).map(x=>({id:x.id,a:x.a,l:x.l})):[],
    base:(e&&e.up)||null};   // versión sobre la que estoy editando
  st.editing.orig=firmaEd(st.editing,e);
  st.dup=null;
  apilar();st.tab='ed';st.ac=null;st.acPick=null;r();alTope();marcarNav();
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
  /* Guardar solo se habilita si hay algo distinto de cuando se abrió. En una
     ficha nueva no aplica —no hay "antes" con que comparar— así que sigue
     con el botón de siempre, abajo del todo. */
  const dirty=e?firmaEd(E,e)!==E.orig:true;
  /* Tres pestañas y no una página larga: quién es (retrato, nombre, tipo,
     grupo, vínculos), cómo es (atributos, estado, etiquetas) y qué se
     escribió (descripción, comentarios). Guardar queda siempre a la vista,
     no es de ninguna pestaña en particular. */
  const T=E.edtab||'id';
  const tabs=[['id','Identidad'],['det','Detalles'],['tx','Texto']];

  const identidad=`
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

    <div class="eyebrow mt">Nombre</div>
    <input class="sfield" id="fn" value="${att(name)}" placeholder="Nombre de la ficha"
      oninput="onNombre(this)">
    <div id="dupw">${avisoParecidas(name)}</div>

    <div class="eyebrow mt">Tipo</div>
    <div class="btnrow">${
      /* el tipo que tenga esta ficha entra siempre, aunque sea el único que
         lo use y todavía no esté guardado */
      tiposTodos().concat(type&&tiposTodos().indexOf(type)<0?[type]:[])
      .map(t=>`<button class="gbtn ${type===t?'on':''}"
        style="${type===t?'':`color:${TYT(t).c};border-color:${TYT(t).c}55`}"
        data-act="type" data-v="${t}">${esc(TYT(t).s)}</button>`).join('')}
      <button class="gbtn ico" data-act="tiponuevo"
        aria-label="Crear otro tipo" title="Crear otro tipo">${ic('mas')}</button></div>
    ${E.tipoNuevo?`<div class="relnew">
      <input class="sfield" id="tipoN" placeholder="Casa noble, deidad, taberna…"
        onkeydown="tipoKey(event)" autofocus>
      <div class="hint">Queda disponible para el resto de las fichas.</div>
    </div>`:''}
    <div class="hint">Decide qué más te va a pedir: un lugar no es del grupo
      ni tiene raza o clase, así que directamente no se ofrece.</div>

    <div class="eyebrow mt">Otros nombres</div>
    <div class="tagbox">
      ${(E.als||[]).map((a,i)=>`<span class="tagch">${esc(a)}<button data-act="rmals"
        data-v="${i}" aria-label="Quitar ${att(a)}">${ic('x')}</button></span>`).join('')}
      <input class="taginput" id="alsin" placeholder="Como también le decimos"
        onkeydown="alsKey(event)" onblur="alsAdd(this)">
    </div>
    <div class="hint">Apodos, apellidos sueltos, el nombre en inglés. Sirven para
      encontrarla al buscar y con @, y para que no se cree dos veces.</div>

    <div class="eyebrow mt">Vínculos</div>
    ${(E.rels||[]).length?`<div class="card">${E.rels.map((x,i)=>{
      const o=byS[x.a];
      return `<div class="row relrow">
        <div class="grow"><span class="rell">${esc(x.l)}</span>
          <span class="relf">${o?esc(o.n):esc(x.a)}</span></div>
        <button class="gbtn ico" data-act="rmrel" data-v="${i}"
          aria-label="Quitar">${ic('x')}</button></div>`;
    }).join('')}</div>`:''}
    <div class="relnew">
      <input class="sfield" id="relL" placeholder="es amigo de, le debe plata, traicionó a"
        onkeydown="relKey(event)">
      <div class="btnrow even">
        <select class="sfield" id="relT">${
          D.filter(x=>x.s!==E.slug).sort((a,b)=>a.n.localeCompare(b.n))
           .map(x=>`<option value="${att(x.s)}">${esc(x.n)}</option>`).join('')}</select>
        <button class="btn sec2" data-act="reladd">Agregar</button>
      </div>
    </div>
    <div class="hint">Van del lado de esta ficha hacia la otra: "Fenwick →
      le debe plata a → Yagra". En el grafo la línea muestra el nombre.</div>

    ${/* "es del grupo/Máster" es cosa de personajes. Si una ficha ya tenía
         algo de esto marcado y le cambiaron el tipo por error, se sigue
         viendo para poder sacárselo — la misma salida de emergencia que
         usan los atributos. */
      (type==='character'||isPc||isGm)?`
    <button class="btn sec2 ${isPc?'on':''}" data-act="pc">
      ${isPc?ic('check'):''}Es de ${esc(cur.party_name||'nuestro grupo')}</button>
    <button class="btn sec2 gm ${isGm?'on':''}" data-act="gm">
      ${isGm?ic('check'):''}Es el Máster</button>`:''}
    ${e?`<div class="sec">
      <button class="btn sec2" data-act="fusion" data-v="${att(e.s)}">
        Es la misma que otra ficha</button>
      <div class="hint">Junta las dos: el texto, los otros nombres, los vínculos
        y las menciones se mudan a la que elijas, y esta se archiva.</div>
      <button class="btn peligro mt" data-act="borrar" data-v="${att(e.s)}">
        Borrar ficha</button>
      <div class="hint">Deja de aparecer en todos lados. No se borra de la base:
        si te arrepentís, avisame y la traigo de vuelta.</div></div>`:''}`;

  const detalles=`
    ${(()=>{
      /* Solo para personajes de la partida: al resto (NPCs, aliados, rivales)
         no le interesan estos datos. La sección igual aparece si la ficha ya
         tiene atributos cargados y se le sacó el tipo o el "es del grupo": si
         no, no habría manera de vaciarlos. */
      const AT=E.at||{};
      /* Los que corresponden a este tipo (solo si es del grupo), más
         cualquiera que la ficha ya tenga cargado. */
      const hay=isPc?atrDeTipo(type):[];
      const V=ATRIB.filter(a=>hay.indexOf(a)>=0||AT[a.k]);
      if(!V.length)return '';
      const G=AT.genero;
      const chips=(a,tb)=>`<div class="eyebrow mt">${esc(a.l)}</div>
        <div class="btnrow">
          <button class="gbtn ${AT[a.k]?'':'on'}" data-act="atr"
            data-v="${a.k}:">Sin ${esc(a.l.toLowerCase())}</button>
          ${Object.keys(tb).map(k=>`<button class="gbtn ${AT[a.k]===k?'on':''}"
            data-act="atr" data-v="${a.k}:${k}">${
            iconoAtr(a,k)?ic(iconoAtr(a,k)):''}${esc(gen(tb[k],G))}</button>`).join('')}
          ${AT[a.k]&&!tb[AT[a.k]]
            ? `<button class="gbtn on" data-act="atr" data-v="${a.k}:${att(AT[a.k])}"
                >${esc(AT[a.k])}</button>`:''}
          <button class="gbtn ico" data-act="atrotro" data-v="${a.k}"
            aria-label="Otra ${att(a.l.toLowerCase())}"
            title="Otra ${att(a.l.toLowerCase())}">${ic('mas')}</button>
        </div>
        ${E.atNuevo===a.k?`<div class="relnew">
          <input class="sfield" id="atN" placeholder="Lo que uses en tu mesa"
            onkeydown="atrKey(event,'${a.k}')" autofocus>
          <div class="hint">Se guarda tal cual, sin icono.</div></div>`:''}`;
      const libre=a=>`<div class="eyebrow mt">${esc(a.l)}</div>
        <input class="sfield" data-at="${a.k}" list="dl-${a.k}"
          value="${att(etiqAtr(a.tb,AT[a.k],G)||'')}"
          placeholder="${esc(Object.values(a.tb).slice(0,3).map(v=>gen(v,G)).join(', '))}…"
          oninput="atrEscrito(this)">
        <datalist id="dl-${a.k}">${Object.values(a.tb)
          .map(v=>`<option value="${att(gen(v,G))}">`).join('')}</datalist>`;
      /* Cada atributo se dibuja según cómo se elige: los que tienen icono van
         como botones, el alineamiento como desplegable —son nueve y con nueve
         dibujos distintos sería ruido— y el resto como texto con sugerencias. */
      const desple=a=>`<div class="eyebrow mt">${esc(a.l)}</div>
        <select class="sfield" data-at="${a.k}" onchange="atrEscrito(this)">
          <option value="">Sin ${esc(a.l.toLowerCase())}</option>
          ${Object.keys(a.tb).map(k=>`<option value="${k}"${
            AT[a.k]===k?' selected':''}>${esc(gen(a.tb[k],G))}</option>`).join('')}
        </select>`;
      const pinta=a=>({chips:chips,lista:desple,texto:libre}[a.ui]||libre)(a,a.tb);
      return `<div id="atrib">
        ${V.map(pinta).join('')}
        <div class="hint">Todos son opcionales. Los que dejes vacíos no se
          muestran en la ficha.</div>
      </div>`;
    })()}

    ${(()=>{
      /* Personajes y criaturas: a un Lugar o un Objeto no les pasan cosas
         como "muerto" o "encarcelado". Misma salida de emergencia que el
         resto: si ya tenía alguna marcada, se sigue viendo. */
      const yaTiene=ETORDER.some(k=>tieneEtiq({tg:E.tags},k));
      if(type!=='character'&&type!=='creature'&&!yaTiene)return '';
      const g=(E.at||{}).genero;
      return `<div class="eyebrow mt">Qué le pasó</div>
    <div class="btnrow">${
      /* Varias a la vez: alguien puede estar muerto y revivido, o revivido y
         encarcelado. "Vivo" no está a propósito: si no dice lo contrario, lo
         está. */
      ETORDER.map(k=>`<button class="gbtn ${tieneEtiq({tg:E.tags},k)?'on':''}"
        data-act="etiq" data-v="${k}">${ic('etiq-'+k)}${esc(gen(ETIQ[k],g))}</button>`).join('')}</div>`;
    })()}

    <div class="eyebrow mt">Otras etiquetas</div>
    <div class="tagbox">
      ${(E.tags||[]).map((t,i)=>ETORDER.indexOf(nm(t))>=0?''
        :`<span class="tagch">${esc(t)}<button data-act="rmtag"
        data-v="${i}" aria-label="Quitar ${att(t)}">${ic('x')}</button></span>`).join('')}
      <input class="taginput" id="tagin" placeholder="Agregar etiqueta"
        onkeydown="tagKey(event)" onblur="tagAdd(this)">
    </div>
    <div class="hint">Escribí y presioná Enter. Va donde las de arriba no
      alcanzan: "nos debe plata", "no confiar". Estas van sin dibujo; si alguna
      se repite mucho, la sumamos a la lista con el suyo.</div>`;

  const texto=`
    <div class="eyebrow">Descripción — qué es</div>
    <div class="acwrap">
      <div class="ed" id="edB" contenteditable="true"
        data-ph="Escribí acá. Poné @ para enlazar con otra ficha."
        oninput="onEd(this)" onkeyup="onEd(this)" onclick="onEd(this)">${toHTML(bodyTxt)}</div>
    </div>
    <div class="eyebrow mt">Comentarios — qué nos pasó con esto</div>
    <div class="acwrap">
      <div class="ed short" id="edC" contenteditable="true"
        data-ph="Lo que hicimos, lo que sospechamos, lo que nos deben."
        oninput="onEd(this)" onkeyup="onEd(this)" onclick="onEd(this)">${toHTML(noteTxt)}</div>
    </div>
    <div class="hint">Escribí @ y las primeras letras. Encuentra igual si le errás.<br>
      Para sacar un nombre ya enlazado, tocalo una vez (queda marcado) y tocalo de nuevo.
      La tecla de borrar también funciona.</div>`;

  return `<div class="top"><div class="topin">
      <button class="back" data-act="cancel">Cancelar</button>
      ${e?`<button class="back pri push" id="edsave" data-act="save"
          ${(st.busy||!dirty)?'disabled':''}>${st.busy?'Guardando…':'Guardar'}</button>`
        :`<span class="tag push">FICHA NUEVA</span>`}</div></div>
  <div class="page">
    <div class="segrow"><div class="seg">${
      tabs.map(([k,l])=>`<button class="${T===k?'on':''}"
        data-act="edtab" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>
    ${T==='id'?identidad:T==='det'?detalles:texto}
    ${e?'':`<div class="savebar"><button class="btn pri" data-act="save" ${st.busy?'disabled':''}>
      ${st.busy?'Guardando…':'Guardar'}</button></div>`}
  </div>`;
}

/* ---------- fusionar dos fichas ----------
   Cuando la misma persona quedó cargada dos veces —pasa cuando el nombre viene
   escrito distinto y nadie lo ató a tiempo—, borrar la duplicada no alcanza:
   se perderían su texto y las menciones que otras fichas le hacen. Fusionar
   muda todo a la que se queda y recién ahí archiva la otra.

   Lo que se muda, y en este orden: los nombres, el texto, los datos que
   falten, las etiquetas, los vínculos con nombre y —la parte que es fácil
   olvidar— los [[enlaces]] que el resto de las fichas le hacían. */
function planFusion(muereS,sobreS){
  const m=byS[muereS], s=byS[sobreS];
  if(!m||!s||m.s===s.s)return null;
  /* el texto de la que se va se reescribe primero: si nombraba a la que se
     queda, o a sí misma, todo termina apuntando al mismo lado */
  const remap=t=>String(t||'').split('[['+muereS+']]').join('[['+sobreS+']]');
  const nombres=[m.n].concat(m.a||[])
    .filter(x=>nm(x)!==nm(s.n)&&!(s.a||[]).some(y=>nm(y)===nm(x)))
    .filter((x,i,arr)=>arr.findIndex(y=>nm(y)===nm(x))===i);
  const cuerpo=parrafosNuevos(s.b,remap(m.b));
  const notas=parrafosNuevos(s.c,remap(m.c));
  const atrs={};ATRIB.forEach(a=>{
    const v=m.at&&m.at[a.k];if(v&&!(s.at&&s.at[a.k]))atrs[a.k]=v});
  const etiq=(m.tg||[]).filter(t=>!(s.tg||[]).some(y=>nm(y)===nm(t)));
  /* los vínculos se repuntan; se tiran los que quedarían apuntando a sí misma
     o repitiendo uno que la que se queda ya tiene */
  const mios=REL.filter(x=>x.de===muereS||x.a===muereS);
  const mueven=[],sobran=[];
  mios.forEach(x=>{
    const de=x.de===muereS?sobreS:x.de, a=x.a===muereS?sobreS:x.a;
    if(de===a)return sobran.push(x);
    if(REL.some(y=>y!==x&&y.de===de&&y.a===a&&nm(y.l)===nm(x.l)))return sobran.push(x);
    mueven.push({rel:x,de,a});
  });
  const textos=D.filter(o=>o.s!==muereS&&o.s!==sobreS&&
    (String(o.b||'')+String(o.c||'')).indexOf('[['+muereS+']]')>=0);
  return {m,s,remap,nombres,cuerpo,notas,atrs,etiq,mueven,sobran,textos};
}
async function fusionar(muereS,sobreS){
  const P=planFusion(muereS,sobreS);
  if(!P||st.busy)return;
  st.busy=true;r();
  const fallos=[];
  const cae=e=>{if(e)fallos.push(e.message||String(e))};
  try{
    /* 1. la que se queda: texto, resumen si no tenía, datos y etiquetas */
    const upd={edited_by:st.me||null};
    if(P.cuerpo.length)upd.body=(P.s.b||'').trim()
      ?P.s.b.trimEnd()+'\n\n'+P.cuerpo.join('\n\n'):P.cuerpo.join('\n\n');
    if(P.notas.length)upd.notes=(P.s.c||'').trim()
      ?P.s.c.trimEnd()+'\n\n'+P.notas.join('\n\n'):P.notas.join('\n\n');
    if(!P.s.sm&&P.m.sm)upd.summary=P.m.sm;
    if(Object.keys(P.atrs).length)upd.attrs=Object.assign({},P.s.at||{},P.atrs);
    if(P.etiq.length)upd.tags=(P.s.tg||[]).concat(P.etiq);
    cae((await SB.from('entities').update(upd).eq('id',P.s.id)).error);

    /* 2. los nombres de la que se va pasan a ser otros nombres de la que queda */
    if(P.nombres.length)cae(await guardarAlias(P.s.id,(P.s.a||[]).concat(P.nombres),P.s.a||[]));

    /* 3. los vínculos se repuntan uno por uno; los que sobran se van */
    for(const x of P.mueven)
      cae((await SB.from('relationships').update({
        from_entity_id:byS[x.de].id,to_entity_id:byS[x.a].id}).eq('id',x.rel.id)).error);
    if(P.sobran.length)
      cae((await SB.from('relationships').delete().in('id',P.sobran.map(x=>x.id))).error);

    /* 4. las menciones del resto de las fichas apuntan a la que queda */
    for(const o of P.textos)
      cae((await SB.from('entities').update({
        body:P.remap(o.b),notes:P.remap(o.c),edited_by:st.me||null}).eq('id',o.id)).error);

    /* 5. y recién ahora se archiva */
    cae((await SB.from('entities').update({
      archived_at:new Date().toISOString(),edited_by:st.me||null}).eq('id',P.m.id)).error);
  }catch(err){fallos.push(err.message||String(err))}
  st.busy=false;st.fus=null;st.editing=null;
  await loadCamp(cur);
  st.ent=sobreS;cerrar({tab:'ficha',ent:sobreS});
  if(fallos.length)toast('Se fusionó a medias: '+fallos[0],'err');
  else toast(P.m.n+' se fusionó con '+P.s.n,'ok');
}
function vFus(){
  const F=st.fus, m=byS[F.slug];
  if(!m){st.fus=null;return ''}
  const P=F.cand?planFusion(F.slug,F.cand):null;
  const cands=parecidas(m.n,m.s);
  const linea=(rot,txt)=>txt?`<div class="dlgbox"><div class="dlgl">${esc(rot)}</div>
    <div class="dlgv">${txt}</div></div>`:'';
  return `<div class="dlgwrap"><div class="dlg">
    <div class="eyebrow">Fusionar</div>
    <h2 class="dlgh">¿Con cuál se junta ${esc(m.n)}?</h2>
    <div class="dlgtx">Todo lo de ${esc(m.n)} se muda a la que elijas —el texto,
      los otros nombres, los vínculos y las menciones que le hacen las demás—
      y ${esc(m.n)} se archiva. No se pierde nada.</div>
    ${cands.length?`<div class="card">${cands.map(x=>`
      <div class="row${F.cand===x.e.s?' on':''}" data-act="fuscand" data-v="${att(x.e.s)}">
        ${av(x.e,AV.md)}
        <div class="grow"><div class="rn">${esc(x.e.n)}</div>
          <div class="rs">${porqueSeParece(x)}</div></div>
        <span class="rc">${F.cand===x.e.s?ic('check'):ic('arrow','r')}</span></div>`).join('')}</div>`:''}
    <div class="eyebrow mt">${cands.length?'O buscala en la lista':'Elegí con cuál'}</div>
    <select class="sfield" data-act="fussel" onchange="ACT.fuscand(this.value)">
      <option value="">Elegí una ficha…</option>
      ${D.filter(x=>x.s!==m.s).sort((a,b)=>a.n.localeCompare(b.n,'es'))
        .map(x=>`<option value="${att(x.s)}"${F.cand===x.s?' selected':''}
          >${esc(x.n)}</option>`).join('')}
    </select>
    ${P?`<div class="eyebrow mt">Qué se muda</div>
      ${linea('Otros nombres',P.nombres.map(esc).join(' · '))}
      ${linea('Párrafos de descripción',P.cuerpo.length||'')}
      ${linea('Párrafos de comentarios',P.notas.length||'')}
      ${linea('Vínculos con nombre',P.mueven.length||'')}
      ${linea('Fichas que la nombran',P.textos.length?P.textos.map(o=>esc(o.n)).join(' · '):'')}
      ${!P.nombres.length&&!P.cuerpo.length&&!P.notas.length&&!P.mueven.length&&!P.textos.length
        ? '<div class="hint">No trae nada nuevo: se archiva y listo.</div>':''}
      ${P.sobran.length?`<div class="hint">${P.sobran.length} vínculo${
        P.sobran.length===1?'':'s'} se descarta${P.sobran.length===1?'':'n'}:
        quedaría${P.sobran.length===1?'':'n'} apuntando a sí misma o repetido${
        P.sobran.length===1?'':'s'}.</div>`:''}
      <button class="btn pri" data-act="fusok"${st.busy?' disabled':''}>
        ${st.busy?'Fusionando…':'Fusionar con '+esc(byS[F.cand].n)}</button>`
      :'<div class="hint">Elegí una para ver qué se muda.</div>'}
    <button class="btn sec2" data-act="fusno">Cancelar</button>
  </div></div>`;
}

/* ---------- borrar una ficha ----------
   No se borra de verdad: se marca como archivada y deja de aparecer. Así una
   equivocación se deshace desde la base sin haber perdido nada.
   Lo que sí hay que decir antes es a quién le va a dejar un agujero: las
   menciones que le hacen otras fichas quedan escritas como [[slug]] a la
   vista, porque ya no hay ficha a la que apuntar. */
function pedirBorrar(slug){
  const e=byS[slug];if(!e)return;
  const mencionan=D.filter(o=>o.s!==slug&&
    (String(o.b||'')+String(o.c||'')).indexOf('[['+slug+']]')>=0);
  const vinculos=REL.filter(x=>x.de===slug||x.a===slug).length;
  st.del={slug,mencionan:mencionan.map(o=>o.n),vinculos};
  r();
}
function vDel(){
  const B=st.del, e=byS[B.slug];
  if(!e){st.del=null;return ''}
  return `<div class="dlgwrap"><div class="dlg">
    <div class="eyebrow">Borrar</div>
    <h2 class="dlgh">¿Borrar ${esc(e.n)}?</h2>
    <div class="dlgtx">Deja de aparecer en el índice, en el grafo y en las
      búsquedas. No se borra de la base: si te arrepentís se puede traer de
      vuelta.</div>
    ${B.mencionan.length?`<div class="dlgbox">
      <div class="dlgl">La nombran ${B.mencionan.length} ficha${B.mencionan.length===1?'':'s'}</div>
      <div class="dlgv">${B.mencionan.slice(0,6).map(esc).join(' · ')}${
        B.mencionan.length>6?' y '+(B.mencionan.length-6)+' más':''}</div>
    </div>
    <div class="hint">En esas fichas el nombre va a quedar escrito sin enlace.
      Si en realidad es la misma que otra, conviene fusionarlas en vez de
      borrarla: así el texto y las menciones se mudan.</div>`:''}
    ${B.vinculos?`<div class="hint">También se van sus ${B.vinculos} vínculo${
      B.vinculos===1?'':'s'} con nombre.</div>`:''}
    <button class="btn sec2" data-act="fusion" data-v="${att(B.slug)}"
      >Mejor fusionarla con otra</button>
    <button class="btn peligro" data-act="delok"${st.busy?' disabled':''}>
      ${st.busy?'Borrando…':'Borrar '+esc(e.n)}</button>
    <button class="btn sec2" data-act="delno">Dejarla</button>
  </div></div>`;
}
async function borrarFicha(slug){
  const e=byS[slug];if(!e||st.busy)return;
  st.busy=true;r();
  const {error}=await SB.from('entities')
    .update({archived_at:new Date().toISOString(),edited_by:st.me||null})
    .eq('id',e.id);
  st.busy=false;
  if(error){toast('No se pudo borrar: '+error.message,'err');r();return}
  st.del=null;st.editing=null;
  await loadCamp(cur);
  st.ent=null;cerrar({tab:'idx'});
  toast(e.n+' se borró','ok');
}
/* El aviso se redibuja solo, sin volver a dibujar el editor entero: en cada
   tecla se perdería la posición del cursor dentro del campo. */
function onNombre(el){
  if(st.editing)st.editing.dn=el.value;
  const box=document.getElementById('dupw');
  if(box)box.innerHTML=avisoParecidas(el.value);
  syncSave();
}
/* Prende o apaga el botón de Guardar de arriba a medida que se escribe, sin
   redibujar el editor —eso también perdería el cursor, esta vez en la
   descripción o los comentarios. */
function syncSave(){
  if(!st.editing)return;
  const btn=document.getElementById('edsave');
  if(!btn)return;
  keepDraft();
  const e=st.editing.slug?byS[st.editing.slug]:null;
  const dirty=e?firmaEd(st.editing,e)!==st.editing.orig:true;
  btn.disabled=!!st.busy||!dirty;
}
/* Solo al crear: si ya existe la ficha, este aviso rápido cambia el borrador
   entero por el de la otra ficha, sin la vista previa que sí tiene "Es la
   misma que otra ficha". Editando una que ya existe, ese atajo queda
   demasiado brusco —y encima competía con esa otra opción, que hace lo
   mismo con más cuidado— así que ahí el único camino es ese botón. */
function avisoParecidas(nombre){
  const E=st.editing;if(!E||!E.isNew)return '';
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
/* ---------- tipos propios ---------- */
/* La base guarda el tipo como slug y no acepta más de 60. Un nombre largo
   entraría igual pero volvería con un error de la base en vez de un aviso. */
const slugTipo=v=>slugify(String(v||'')).slice(0,60).replace(/-$/,'');
function tipoAdd(){
  const el=document.getElementById('tipoN');
  if(!el||!st.editing)return false;
  const bruto=(el.value||'').trim();
  if(!bruto){toast('Escribí cómo se llama el tipo','err');return false}
  const t=slugTipo(bruto);
  if(!t){toast('Ese nombre no sirve como tipo','err');return false}
  keepDraft();
  st.editing.type=t;st.editing.tipoNuevo=false;
  return true;
}
/* Lo escrito a mano se guarda al toque y sin redibujar: si re-renderizara
   perdería el foco a mitad de una palabra. */
function atrEscrito(el){
  if(!st.editing)return;
  const k=el.getAttribute('data-at');
  const a=ATRIB.filter(x=>x.k===k)[0];if(!a)return;
  st.editing.at=st.editing.at||{};
  const v=claveAtr(a.tb,el.value);
  if(v)st.editing.at[k]=v;else delete st.editing.at[k];
  syncSave();
}
function atrKey(ev,k){
  if(ev.key!=='Enter')return;
  ev.preventDefault();
  const a=ATRIB.filter(x=>x.k===k)[0];
  const v=claveAtr(a&&a.tb,ev.target.value);
  keepDraft();
  st.editing.at=st.editing.at||{};
  if(v)st.editing.at[k]=v;else delete st.editing.at[k];
  st.editing.atNuevo=null;r();
}
function tipoKey(ev){
  if(ev.key!=='Enter')return;
  ev.preventDefault();
  if(tipoAdd())r();
}

/* ---------- vínculos con nombre ---------- */
function relAdd(){
  const E=st.editing;if(!E)return false;
  const li=document.getElementById('relL'), ti=document.getElementById('relT');
  if(!li||!ti)return false;
  const l=(li.value||'').trim(), a=ti.value;
  if(!l){toast('Escribí qué relación es','err');return false}
  if(!a||!byS[a])return false;
  const r=E.rels=E.rels||[];
  if(r.some(x=>x.a===a&&nm(x.l)===nm(l)))return false;   // ya está
  r.push({a,l});
  li.value='';
  return true;
}
function relKey(ev){
  if(ev.key!=='Enter')return;
  ev.preventDefault();
  if(relAdd())r();
}
/* Las relaciones viven en su propia tabla, así que se guardan aparte de la
   ficha. Cambiar el texto de una es sacarla y poner otra: el índice único es
   por origen, destino y nombre. */
async function guardarRel(id,quedan,tenia){
  const igual=(x,y)=>x.a===y.a&&nm(x.l)===nm(y.l);
  const nuevos=(quedan||[]).filter(x=>x.a&&x.l&&byS[x.a]&&!(tenia||[]).some(y=>igual(x,y)));
  const fuera=(tenia||[]).filter(y=>!(quedan||[]).some(x=>igual(x,y)));
  if(nuevos.length){
    const {error}=await SB.from('relationships').insert(nuevos.map(x=>({
      campaign_id:cur.id,from_entity_id:id,to_entity_id:byS[x.a].id,label:x.l})));
    if(error)return error;
  }
  if(fuera.length){
    const {error}=await SB.from('relationships').delete().in('id',fuera.map(x=>x.id));
    if(error)return error;
  }
  return null;
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
  /* los campos de atributo escriben solos al tipear, pero si el render llega
     antes que el evento (pegar, autocompletar del teclado) se rescatan acá */
  document.querySelectorAll('#atrib [data-at]').forEach(el=>{
    const k=el.getAttribute('data-at'), a=ATRIB.filter(x=>x.k===k)[0];
    if(!a)return;
    st.editing.at=st.editing.at||{};
    const v=claveAtr(a.tb,el.value);
    if(v)st.editing.at[k]=v;else delete st.editing.at[k];
  });
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
  syncSave();
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
      b:'',c:'',tg:data.tags||[],img:data.image_url||null,pc:0,a:[]});
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
  /* Nombre, cuerpo y comentarios pueden vivir en pestañas que ahora mismo no
     están en pantalla —Guardar es de afuera de las tres—, así que no hay que
     leerlos del DOM sino del borrador. keepDraft() rescata primero lo que sí
     está a la vista. */
  keepDraft();
  const E=st.editing;
  const e=E.slug?byS[E.slug]:null;
  const name=(E.dn!==undefined?E.dn:(e?e.n:'')).trim();
  if(!name){toast('Falta el nombre','err');return}
  const body=E.db!==undefined?E.db:(e?e.b:'');
  const notes=E.dc!==undefined?E.dc:(e?e.c:'');
  const type=E.type!==undefined?E.type:(e?e.t:'character');
  const img=E.img!==undefined?E.img:(e?e.img:null);
  const pc=E.pc!==undefined?!!E.pc:(e?!!e.pc:false);
  const gm=E.gm!==undefined?!!E.gm:(e?!!e.gm:false);
  const summary=autoSummary(body);
  // una etiqueta a medio escribir en el campo también cuenta
  tagAdd(document.getElementById('tagin')||{value:''});
  alsAdd(document.getElementById('alsin')||{value:''});
  const tags=(E.tags||[]).slice();
  /* Antes de crear una ficha nueva: si hay alguna parecida, se pregunta. Solo
     al crear — renombrar una que ya existe es otra cosa, y si en verdad es la
     misma que otra ficha ya cargada, "Es la misma que otra ficha" hace ese
     trabajo con vista previa. E.igual queda marcado si ya dijo que es otra. */
  if(!e&&!E.igual){
    const c=parecidas(name,null);
    if(c.length){st.dup={name,cands:c};r();return}
  }
  const before=e?new Set([...(ADJ[e.s]||[])]):new Set();
  const campo={name,body,notes,type,summary,tags,image_url:img,
    attrs:limpiarAtrs(E.at),is_party:pc,is_gm:gm,edited_by:st.me||null};
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
  const relErr=await guardarRel(res.data.id,E.rels||[],
    e?REL.filter(x=>x.de===e.s).map(x=>({id:x.id,a:x.a,l:x.l})):[]);
  await loadCamp(cur);
  if(alErr)toast('La ficha se guardó, los otros nombres no: '+alErr.message,'err');
  else if(relErr)toast('La ficha se guardó, los vínculos no: '+relErr.message,'err');
  st.ent=res.data.slug;
  const added=[...(ADJ[st.ent]||[])].filter(x=>!before.has(x)).length;
  cerrar({tab:'ficha',ent:res.data.slug});
  toast(added?`Guardado · ${added} vínculo${added>1?'s':''} nuevo${added>1?'s':''}`:'Guardado','ok');
}

/* Los otros nombres viven en su propia tabla, así que van aparte de la ficha.
   Se comparan por su forma normalizada, que es la misma con la que buscan el
   buscador y el @, y la misma que calcula la base.
   normalized no se manda: es una columna generada, la escribe la base sola a
   partir del alias, y mandarla es un error. */
async function guardarAlias(id,quedan,tenia){
  const q=(quedan||[]).map(x=>x.trim()).filter(Boolean), t=tenia||[];
  const nuevos=q.filter(x=>!t.some(y=>nm(y)===nm(x)));
  const fuera=t.filter(y=>!q.some(x=>nm(x)===nm(y)));
  if(nuevos.length){
    const {error}=await SB.from('entity_aliases')
      .insert(nuevos.map(a=>({entity_id:id,alias:a})));
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
  const N={slug,isNew:false,base:d.up,
    dn:d.n, db:sumarTexto(d.b,(V.db||'').trim()), dc:sumarTexto(d.c,(V.dc||'').trim()),
    /* los atributos de la que ya existe mandan; lo del borrador solo completa */
    at:Object.assign({},V.at||{},d.at||{}),
    tags:(d.tg||[]).slice(), als:(d.a||[]).slice()};
  (V.tags||[]).forEach(t=>{if(!N.tags.some(x=>nm(x)===nm(t)))N.tags.push(t)});
  (V.als||[]).forEach(a=>{if(!N.als.some(x=>nm(x)===nm(a)))N.als.push(a)});
  const viejo=(V.dn||'').trim();
  if(viejo&&nm(viejo)!==nm(d.n)&&!N.als.some(x=>nm(x)===nm(viejo)))N.als.push(viejo);
  st.dup=null;st.editing=N;st.ac=null;st.acPick=null;
  /* sin esto el próximo render rescataría el borrador del DOM viejo y pisaría
     lo que acabamos de armar */
  RENDERED=null;
  st.tab='ed';r();alTope();
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
'  "comentarios":"Qué pasó entre él y nosotros.",',
'  "raza":"humano", "clase":"bardo",',
'  "alineamiento":"cn", "trasfondo":"artista"',
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
'  "comentarios": lo que pasó con el grupo.',
'- Los cuatro últimos son solo para "character" y solo si las notas lo dicen:',
'  raza: humano, elfo, semielfo, enano, mediano, gnomo, semiorco, tiefling,',
'  draconido — o lo que digan las notas si es otra cosa.',
'  clase: barbaro, bardo, brujo, clerigo, druida, explorador, guerrero,',
'  hechicero, mago, monje, paladin, picaro.',
'  alineamiento: lb, nb, cb, ln, nn, cn, lm, nm, cm (legal/neutral/caótico +',
'  bueno/neutral/malo). trasfondo: una palabra.',
'- Si algo no está en las notas, dejá el campo vacío. No inventes nada.',
'  La raza y la clase de un NPC casi nunca están escritas: no las adivines.',
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
  apilar();st.imp={paso:'pegar',txt:'',plan:null,err:''};
  st.tab='imp';r();alTope();marcarNav();
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
    /* solo los que corresponden a ese tipo: en un lugar o un objeto no
       significan nada, aunque la AI los mande igual */
    const at={};
    atrDeTipo(tipo).forEach(a=>{
      const v=claveAtr(a.tb,f[a.k]);
      if(v)at[a.k]=v;
    });
    items.push({
      nombre,tipo,als,at,
      resumen:String(f.resumen||f.summary||'').trim(),
      cuerpo:String(f.descripcion||f.body||'').trim(),
      /* conNosotros es como se llamaba antes: sigue entrando por si alguien
         guardó el texto viejo del prompt */
      notas:String(f.comentarios||f.conNosotros||f.notes||'').trim(),
      e:e||(dudas.length?dudas[0].e:null),
      duda:!e&&dudas.length>0,
      /* las otras candidatas quedan a mano por si la primera no era */
      cands:dudas.map(d=>d.e),
      abierto:false,
      acc:(e||dudas.length)?'sumar':'crear'
    });
  }
  if(!items.length)return{err:'Las fichas que vinieron no tienen nombre.'};
  return{items};
}

/* Un texto se compara sin sus enlaces: la ficha lo tiene guardado como
   [[slug]] y lo que viene de la AI trae el nombre escrito. */
const sinEnlaces=t=>nm(String(t||'').replace(LK,(_,k)=>byS[k]?byS[k].n:k));
/* Los párrafos de "extra" que la ficha todavía no tiene, en orden. */
function parrafosNuevos(base,extra){
  if(!extra)return [];
  const tengo={};
  String(base||'').split(/\n\n+/).forEach(p=>{const k=sinEnlaces(p);if(k)tengo[k]=1});
  const out=[];
  String(extra).split(/\n\n+/).forEach(p=>{
    const t=p.trim(), k=sinEnlaces(t);
    if(!k||tengo[k])return;
    tengo[k]=1;out.push(t);
  });
  return out;
}
/* Agrega al final solo lo que falte. Sin esto, aplicar dos veces la misma
   importación duplicaba todo: pasó de verdad y dejó 28 bloques repetidos en
   18 fichas. Se compara párrafo por párrafo y no el bloque entero, porque
   entre una pasada y otra el texto pudo haber crecido. */
function sumarTexto(base,extra){
  const b=String(base||''), nue=parrafosNuevos(b,extra);
  if(!nue.length)return b;
  return b.trim()?b.trimEnd()+'\n\n'+nue.join('\n\n'):nue.join('\n\n');
}

/* Los atributos que la importación agregaría a una ficha que ya existe: solo
   los que ella todavía no tiene. Lo cargado a mano gana siempre. */
function atrsNuevos(x,e){
  const o={};
  ATRIB.forEach(a=>{
    const v=x.at&&x.at[a.k];
    if(v&&!(e.at&&e.at[a.k]))o[a.k]=v;
  });
  return o;
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
          body:cuerpo,notes:notas,attrs:limpiarAtrs(x.at),edited_by:st.me||null
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
        const suma=(base,extra)=>sumarTexto(base,liga(extra,e.s));
        const upd={body:suma(e.b,x.cuerpo),notes:suma(e.c,x.notas),
                   edited_by:st.me||null};
        if(!e.sm&&x.resumen)upd.summary=x.resumen;
        /* no pisa lo que ya tenga cargado: solo completa los que están vacíos */
        const atN=atrsNuevos(x,e);
        if(Object.keys(atN).length)upd.attrs=Object.assign({},e.at||{},atN);
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
  cerrar({tab:'idx'});
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

  /* Los nombres que la app va a reconocer dentro del texto se marcan acá
     mismo, con el mismo buscador que corre al aplicar: así lo que se ve en el
     repaso es exactamente lo que va a quedar enlazado. Entran también las
     fichas que se crean en esta misma importación, que todavía no existen. */
  const previa=(()=>{
    const porNacer=P.filter(x=>x.acc==='crear');
    const pend={};
    porNacer.forEach((x,i)=>{pend['nueva-'+i]=x.nombre});
    const mapa=indiceNombres(porNacer.map((x,i)=>({n:x.nombre,s:'nueva-'+i,a:x.als})));
    return (txt,propio)=>enlazar(txt||'',mapa,propio)
      .split(/(\[\[[a-z0-9\-]+\]\])/)
      .map(t=>{
        const m=t.match(/^\[\[([a-z0-9\-]+)\]\]$/);
        if(!m)return esc(t);
        const e=byS[m[1]];
        if(e)return `<span class="impmen" style="--c:${TY(e).c}">${esc(e.n)}</span>`;
        if(pend[m[1]])return `<span class="impmen nueva">${esc(pend[m[1]])}</span>`;
        return esc(t);
      }).join('');
  })();

  /* Un trozo de texto que se va a agregar, tal como va a quedar. Se muestra
     entero y no recortado: el que revisa tiene que poder leer lo que firma. */
  const trozo=(rot,txt,propio)=>{
    if(!txt)return '';
    return `<div class="impcampo">
      <div class="impcr">${esc(rot)}</div>
      <div class="impct">${previa(txt,propio)}</div></div>`;
  };
  const detalle=x=>{
    if(x.acc==='nada')return `<div class="impdet"><div class="impnada">
      Esta ficha se saltea. Nada de lo que trae se va a escribir.</div></div>`;

    if(x.acc==='crear'){
      const t=TYT(x.tipo);
      return `<div class="impdet">
        <div class="impcampo"><div class="impcr">Se crea como</div>
          <div class="impct"><span class="tipoch" style="--c:${t.c}">${esc(t.s)}</span></div></div>
        ${Object.keys(x.at||{}).length?`<div class="impcampo">
          <div class="impcr">Atributos que le pone</div>
          <div class="impct">${chipsAtr({at:x.at})}</div></div>`:''}
        ${x.als.length?`<div class="impcampo"><div class="impcr">También se la va a llamar</div>
          <div class="impct">${x.als.map(esc).join(' · ')}</div></div>`:''}
        ${trozo('Su resumen va a decir',x.resumen)}
        ${trozo('Su descripción va a decir',x.cuerpo)}
        ${trozo('Sus comentarios van a decir',x.notas)}
        ${!x.resumen&&!x.cuerpo&&!x.notas
          ? `<div class="impnada">Viene sin texto: se crearía la ficha vacía,
               solo con el nombre.</div>`:''}
      </div>`;
    }

    /* sumar: lo importante es qué se agrega y qué queda intacto */
    const e=x.e;
    const alsNuevos=x.als.filter(a=>nm(a)!==nm(e.n)&&!(e.a||[]).some(y=>nm(y)===nm(a)));
    const alsYa=x.als.filter(a=>!alsNuevos.includes(a));
    /* lo que de verdad falta: si la ficha ya tiene ese párrafo no se muestra
       ni se escribe, así aplicar dos veces la misma importación no repite */
    const cuerpoN=parrafosNuevos(e.b,x.cuerpo).join('\n\n');
    const notasN=parrafosNuevos(e.c,x.notas).join('\n\n');
    const yaTenia=(x.cuerpo&&!cuerpoN)||(x.notas&&!notasN);
    const nada=!cuerpoN&&!notasN&&!alsNuevos.length&&!(x.resumen&&!e.sm)
      &&!Object.keys(atrsNuevos(x,e)).length;
    return `<div class="impdet">
      ${x.duda?`<div class="impcampo"><div class="impcr">¿Cuál es?</div>
        <div class="impelegir">${x.cands.map(c=>`
          <div class="impop ${c.s===e.s?'on':''}" data-act="impelegir"
               data-v="${att(c.s)}" data-i="${P.indexOf(x)}">
            ${av(c,AV.sm)}<div class="grow"><div class="rn">${esc(c.n)}</div>
              <div class="rs">${esc(c.sm||TY(c).s)}</div></div></div>`).join('')}
          <div class="impop nueva" data-act="impacc" data-v="${P.indexOf(x)}">
            <div class="grow"><div class="rn">Ninguna: crear «${esc(x.nombre)}» aparte</div></div>
          </div>
        </div></div>`:''}
      ${nada
        ? `<div class="impnada">No trae nada que ${esc(e.n)} no tenga ya.
             ${x.cuerpo||x.notas?'Este texto ya está escrito en la ficha. ':''
             }Tocar el botón la saltea.</div>`
        : `<div class="impaviso">Lo que ${esc(e.n)} ya tiene no se toca:
            todo esto se agrega al final.${yaTenia
              ? ' Los párrafos que ya estaban no se repiten.':''}</div>
          ${alsNuevos.length?`<div class="impcampo">
            <div class="impcr">Se le van a agregar estos nombres</div>
            <div class="impct">${alsNuevos.map(esc).join(' · ')}${
              alsYa.length?`<span class="impya"> (${alsYa.map(esc).join(' · ')} ya los tenía)</span>`:''}</div></div>`
            :(alsYa.length?`<div class="impcampo"><div class="impcr">Nombres que ya tenía</div>
              <div class="impct impya">${alsYa.map(esc).join(' · ')}</div></div>`:'')}
          ${(()=>{
            const n=atrsNuevos(x,e), ya=ATRIB.filter(a=>x.at&&x.at[a.k]&&!n[a.k]);
            if(!Object.keys(n).length&&!ya.length)return '';
            return `<div class="impcampo">
              <div class="impcr">${Object.keys(n).length
                ? 'Atributos que le completa' : 'Atributos que ya tenía'}</div>
              <div class="impct">${chipsAtr({at:n})}${ya.length
                ? `<span class="impya">${Object.keys(n).length?' · ':''}${ya.map(a=>
                    esc(a.l.toLowerCase())).join(', ')}: ya los tenía cargados</span>`:''}</div></div>`;
          })()}
          ${x.resumen&&!e.sm?`<div class="impcampo">
            <div class="impcr">Se le va a poner resumen, porque no tenía</div>
            <div class="impct">${previa(x.resumen,e.s)}</div></div>`:''}
          ${trozo('Se agrega al final de la descripción',cuerpoN,e.s)}
          ${trozo('Se agrega al final de los comentarios',notasN,e.s)}`}
    </div>`;
  };

  const fila=(x,i)=>{
    const et={crear:'Crear',sumar:'Sumar',nada:'Saltear'}[x.acc];
    /* el renglón dice en castellano qué va a pasar, sin que haya que abrirlo */
    const linea=x.acc==='nada'
      ? '<span class="impest">No se toca</span>'
      : x.acc==='crear'
      ? `<span class="impest nuevo">Ficha nueva</span> · ${esc(TYT(x.tipo).s)}`
      : x.duda
      ? `<span class="impest duda">¿Es la misma que ${esc(x.e.n)}?</span>`
      : nm(x.e.n)===nm(x.nombre)
      ? '<span class="impest ya">Ya existe</span> · se le agrega lo que trae'
      : `<span class="impest ya">Ya existe como ${esc(x.e.n)}</span> · se le agrega lo que trae`;
    return `<div class="improw${x.acc==='nada'?' off':''}${x.abierto?' open':''}">
      <div class="impcab">
        <span class="dot" style="color:${TYT(x.tipo).c};background:currentColor"></span>
        <div class="grow" data-act="impver" data-v="${i}">
          <div class="rn">${esc(x.nombre)}</div>
          <div class="rs">${linea}</div>
        </div>
        <button class="accch ${x.acc}" data-act="impacc" data-v="${i}">${et}</button>
      </div>
      <button class="impver" data-act="impver" data-v="${i}"
        aria-expanded="${x.abierto?'true':'false'}">${
        x.abierto?'Ocultar el detalle':'Ver qué se escribe'}${ic('arrow')}</button>
      ${x.abierto?detalle(x):''}
    </div>`;
  };
  const nuevas=cuenta('crear'), suman=cuenta('sumar'), fuera=cuenta('nada');
  const dudas=P.filter(x=>x.duda&&x.acc==='sumar').length;
  return cab+`<div class="page">
    <div class="eyebrow">Paso 2</div>
    <h1>Revisá antes de escribir</h1>
    <div class="hint">
      ${(()=>{
        /* Se dice lo que va a pasar, no una tabla de números: los que están en
           cero no se nombran, que decir \"0 sin tocar\" hacía dudar de si algo
           se estaba tocando o no. */
        const p=[];
        if(nuevas)p.push(`crear <b>${nuevas}</b> ficha${nuevas===1?'':'s'} nueva${nuevas===1?'':'s'}`);
        if(suman)p.push(`ampliar <b>${suman}</b> que ya existe${suman===1?'':'n'}`);
        if(!p.length)return 'No quedó nada marcado para escribir.';
        const frase=p.length===2?p[0]+' y '+p[1]:p[0];
        return `Al aplicar se van a ${frase}.`
          +(fuera?` Las otras <b>${fuera}</b> quedan como están.`:'');
      })()}<br>
      Los nombres <span class="impmen">subrayados</span> ya tienen ficha y van a
      quedar enlazados solos.
      ${dudas?`<br><b class="impwarn">${dudas} sin confirmar:</b> me pareció que ya
        existían pero no estoy seguro. Abrilas y decidí.`:''}
    </div>
    <button class="btn sec2" data-act="impvolver">Volver a pegar</button>
    <div class="card mt">${P.map(fila).join('')}</div>
    <div class="savebar"><button class="btn pri" data-act="impaplicar"${st.busy?' disabled':''}>
      ${st.busy?'Guardando…':'Aplicar'}</button></div>
  </div>`;
}

/* ================= HISTORIAL ================= */
async function openHist(slug){
  const e=byS[slug];if(!e)return;
  apilar();st.ent=slug;st.hist={slug,rows:null};st.tab='hist';r();alTope();marcarNav();
  const {data,error}=await SB.from('entity_revisions')
    .select('id,name,summary,body,notes,status,tags,attrs,edited_by,replaced_at')
    .eq('entity_id',e.id).order('replaced_at',{ascending:false});
  if(error){toast('No se pudo leer el historial','err');st.hist.rows=[];r();return}
  st.hist.rows=data||[];r();
}
/* estado, atributos y etiquetas de una versión, como chips chicos */
function marcas(status,tags,at){
  const ch=[], g=at&&at.genero;
  /* status solo aparece en versiones anteriores a que el estado pasara a ser
     una etiqueta; en las nuevas siempre viene vacío */
  if(status)ch.push(`<span class="hchip acc">${esc(STATUS[status]||status)}</span>`);
  /* con el rótulo delante: acá no hay icono ni lugar para adivinar si "Noble"
     es el trasfondo o una etiqueta que alguien puso */
  atrsDe({at}).forEach(a=>ch.push(`<span class="hchip">${esc(a.l)}: ${
    esc(etiqAtr(a.tb,at[a.k]))}</span>`));
  (tags||[]).forEach(t=>ch.push(`<span class="hchip">${
    esc(ETIQ[nm(t)]?gen(ETIQ[nm(t)],g):t)}</span>`));
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
       el resumen, las notas o cualquier otro dato de la ficha.</div></div>`
    : `<div class="card">
        <div class="row hrow"><div class="grow">
          <div class="rn">Versión actual</div>
          <div class="rs">${esc(plano(e.b))||'Sin descripción'}</div>
          ${marcas(null,e.tg,e.at)}
          ${e.eb?`<div class="hwhen">por ${esc(nombreDe(e.eb))}</div>`:''}</div></div>
        ${H.rows.map(v=>`<div class="row hrow"><div class="grow">
          <div class="rn">${esc(v.name||e.n)}</div>
          <div class="rs">${esc(plano(v.body))||'Sin descripción'}</div>
          ${v.tags===null
            ? '<div class="hwhen">estado y etiquetas no registrados</div>'
            : marcas(v.status,v.tags,v.attrs)}
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
        descripción, notas, estado, etiquetas y atributos. La foto no queda registrada.
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
  if(v.tags!==null&&v.tags!==undefined){
    /* la versión puede ser anterior a la mudanza: ahí el estado viene en su
       columna vieja y se restaura como la etiqueta que le corresponde */
    const t=(v.tags||[]).slice();
    const eq={dead:'muerto',missing:'desaparecido'}[v.status];
    if(eq&&!t.some(x=>nm(x)===eq))t.push(eq);
    upd.tags=t;
  }
  /* lo mismo con los atributos, que se empezaron a registrar después */
  if(v.attrs!==null&&v.attrs!==undefined)upd.attrs=v.attrs;
  const {error}=await SB.from('entities').update(upd).eq('id',e.id);
  st.busy=false;
  if(error){toast('No se pudo restaurar: '+error.message,'err');r();return}
  await loadCamp(cur);
  cerrar({tab:'ficha',ent:H.slug});
  toast('Versión restaurada','ok');
}

/* ---------- lightbox ---------- */
function openImg(slug){
  const e=byS[slug];if(!e||!e.img)return;
  const d=document.createElement('div');
  d.className='lightbox';
  d.innerHTML=`<button class="lbx" aria-label="Cerrar">${ic('x')}</button><img src="${att(e.img)}" alt="${att(e.n)}">`;
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
  depth:1,mode:'ego',off:new Set(),full:false,
  verGrupos:false,grupos:null,pin:new Set(),tag:null,
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
      <button id="ggroupsbtn" data-act="ggrupos" class="${G.verGrupos?'on':''}"
        aria-label="${G.verGrupos?'Ocultar grupos':'Mostrar grupos'}"
        title="${G.verGrupos?'Ocultar grupos':'Mostrar grupos'}"
        aria-pressed="${G.verGrupos}">${ic('grupos')}</button>
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
  <div class="gacc" id="gacc">${gAcciones()}</div>
  <div class="page">${(()=>{
      const nv=novedades();
      if(!nv)return '';
      const p1=nv.nuevas.length?nv.nuevas.length+' ficha'+(nv.nuevas.length===1?'':'s')+' nueva'+(nv.nuevas.length===1?'':'s'):'';
      const p2=nv.tocadas.length?nv.tocadas.length+' cambiada'+(nv.tocadas.length===1?'':'s'):'';
      return `<div class="nov"><span class="novt">Novedades del códice</span>
        Desde tu última visita (${esc(cuando(nv.desde))}):
        ${esc([p1,p2].filter(Boolean).join(' · '))}.
        <div class="novl">${nv.nuevas.concat(nv.tocadas).slice(0,8).map(e=>
          `<span class="novn" data-act="gcentrar" data-v="${att(e.s)}"
            style="color:${TY(e).c}">${esc(e.n)}</span>`).join('')}</div></div>`;
    })()}<div class="hint" id="gstat"></div>
  </div>`;
}
/* refresca las tres filas de abajo sin volver a dibujar la pantalla */
function gRefrescar(){
  const c=document.getElementById('gctl');if(c)c.innerHTML=gControls();
  const l=document.getElementById('glegend');if(l)l.innerHTML=gLegend();
  const a=document.getElementById('gacc');if(a)a.innerHTML=gAcciones();
}

/* Debajo del grafo conviven tres cosas distintas que antes se veían iguales:
   elegir hasta dónde llega (una sola opción), prender y apagar qué se muestra
   (varias a la vez), y hacer algo (acciones). Van separadas y rotuladas. */
function gControls(){
  const b=(v,l,on)=>`<button class="${on?'on':''}" data-act="gmode" data-v="${v}">${l}</button>`;
  return `<div class="gfila">
      <span class="gfr">Saltos desde la ficha</span>
      <div class="seg gseg">
        ${b('1','1',G.mode==='ego'&&G.depth===1)}
        ${b('2','2',G.mode==='ego'&&G.depth===2)}
        ${b('3','3',G.mode==='ego'&&G.depth===3)}
        ${b('all','Todo',G.mode==='all')}
      </div>
    </div>`;
}
/* las acciones van juntas y al final, para que no se confundan con los filtros */
function gAcciones(){
  return `<div class="gfila acciones">
    <button class="gbtn" data-act="gexport">${ic('scroll')}Guardar imagen</button>
    ${G.pin.size?`<button class="gbtn" data-act="gsoltar">
      Soltar ${G.pin.size} clavada${G.pin.size===1?'':'s'}</button>`:''}
  </div>`;
}
function gLegend(){
  const tipos=tiposTodos().map(t=>`<button class="lgb ${G.off.has(t)?'off':'on'}"
    style="--c:${TYT(t).c}" data-act="gtype" data-v="${t}"
    aria-pressed="${!G.off.has(t)}"><span class="sw"></span>${esc(TYT(t).l)}</button>`).join('');
  const tags=etiquetasUsadas();
  return `<div class="gfila">
      <span class="gfr">Qué se muestra</span>
      <div class="gchips">${tipos}</div>
    </div>
    ${tags.length?`<div class="gfila">
      <span class="gfr">Solo con la etiqueta</span>
      <div class="gchips">${tags.map(t=>`<button class="lgb tag ${G.tag===t?'on':''}"
        data-act="gtag" data-v="${att(t)}" aria-pressed="${G.tag===t}"
        >#${esc(t)}</button>`).join('')}</div>
    </div>`:''}`;
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
  if(G.tag)ids=ids.filter(id=>id===center||(byS[id].tg||[]).some(t=>nm(t)===nm(G.tag)));
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
  G.grupos=G.verGrupos?detectarGrupos(G.nodes,edges):null;
  G.edges=edges;
  if(G.sel&&!G.map[G.sel])G.sel=null;
  /* la línea elegida puede haber quedado fuera del recorte o del filtro */
  if(G.selEdge&&!G.edges.some(e=>e.a===G.selEdge.a&&e.b===G.selEdge.b))G.selEdge=null;
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
    if(G.pin.has(nd.id)){nd.vx=nd.vy=0;G.pos[nd.id]={x:nd.x,y:nd.y};return}
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
  /* con una línea elegida el foco son sus dos puntas; si no, el nodo mirado
     y sus vecinos */
  const near=G.selEdge?new Set([G.selEdge.a,G.selEdge.b])
    :(focus?new Set([focus,...(ADJ[focus]||[])]):null);

  /* --- aristas, en coordenadas del mundo --- */
  cx.save();cx.translate(cam.x,cam.y);cx.scale(cam.k,cam.k);
  if(G.verGrupos)dibujarGrupos(cx,cam);
  cx.lineCap='round';
  const grad=G.edges.length<=260;
  G.edges.forEach(e=>{
    const a=G.map[e.a],b=G.map[e.b];if(!a||!b)return;
    const on=!near||(near.has(e.a)&&near.has(e.b));
    const hi=G.selEdge?(e.a===G.selEdge.a&&e.b===G.selEdge.b)
      :(near&&(e.a===focus||e.b===focus));
    cx.globalAlpha=hi?.95:(on?.45:.13);
    cx.lineWidth=(hi?1.9:1.15)/cam.k*Math.min(2.2,1+((e.w||1)-1)*.35);
    if(grad&&hi){
      const g=cx.createLinearGradient(a.x,a.y,b.x,b.y);
      g.addColorStop(0,TY(a.e).c);g.addColorStop(1,TY(b.e).c);cx.strokeStyle=g;
    }else cx.strokeStyle=hi?'#C9D2E0':(e.rel?'#7C8AA2':'#57647A');
    /* una relación que alguien escribió a propósito pesa más que una mención
       suelta, así que se ve un poco más firme */
    if(e.rel&&!hi)cx.globalAlpha=Math.min(1,cx.globalAlpha*1.5);
    /* la del grupo es contexto y no novedad: va punteada y al fondo, si no
       cinco personajes hacen una maraña que tapa lo que sí pasó */
    const soloGrupo=e.grp&&!e.rel&&e.w<=1;
    if(soloGrupo&&!hi){
      cx.globalAlpha*=.5;cx.setLineDash([5/cam.k,4/cam.k]);
    }
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y;
    cx.beginPath();cx.moveTo(a.x,a.y);
    cx.quadraticCurveTo(mx-dy*.06,my+dx*.06,b.x,b.y);
    cx.stroke();
    if(soloGrupo)cx.setLineDash([]);
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
    if(G.pin.has(n.id)){
      /* un puntito arriba a la derecha marca los que están clavados */
      const d=r*.72;
      cx.beginPath();cx.arc(n.x+d,n.y-d,2.2/cam.k+1,0,6.2832);
      cx.fillStyle='#EDE7DA';cx.globalAlpha=on?.9:.28;cx.fill();
      cx.globalAlpha=on?1:.3;
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
    if(tieneEtiq(n.e,'muerto')){
      cx.beginPath();cx.arc(n.x,n.y,r,0,6.2832);
      cx.fillStyle='rgba(13,16,21,.6)';cx.fill();
      const d=r*.7;
      cx.strokeStyle='#C3CBD8';cx.globalAlpha=on?.95:.3;
      cx.lineWidth=1.5/cam.k+.5;cx.lineCap='round';
      cx.beginPath();cx.moveTo(n.x-d,n.y+d);cx.lineTo(n.x+d,n.y-d);cx.stroke();
      cx.globalAlpha=on?1:.3;
    }else if(tieneEtiq(n.e,'desaparecido')){
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

  /* Nombres de los vínculos, al final y por encima de todo. Son pocos y los
     escribió alguien a propósito, así que ganan el lugar; entran en el mismo
     anti-choque que los nombres de las fichas para no pisarse entre ellos. */
  const conNombre=G.edges.filter(e=>e.rel);
  if(conNombre.length&&(cam.k>=.85||G.selEdge)&&conNombre.length<=45){
    cx.font="500 10px 'JetBrains Mono',monospace";
    conNombre.forEach(e=>{
      const a=G.map[e.a],b=G.map[e.b];if(!a||!b)return;
      const elegida=G.selEdge&&e.a===G.selEdge.a&&e.b===G.selEdge.b;
      if(!elegida&&near&&!(near.has(e.a)&&near.has(e.b)))return;
      const rs=RELK[clavePar(e.a,e.b)]||[];
      if(!rs.length)return;
      /* el nombre va donde pasa la curva, no sobre la recta */
      const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y;
      const qx=mx-dy*.06,qy=my+dx*.06;
      const enT=t2=>{const u=1-t2;
        return[(u*u*a.x+2*u*t2*qx+t2*t2*b.x)*cam.k+cam.x,
               (u*u*a.y+2*u*t2*qy+t2*t2*b.y)*cam.k+cam.y]};
      let t=rs[0].l;
      if(rs.length>1)t+=' +'+(rs.length-1);
      if(t.length>26)t=t.slice(0,25)+'…';
      const w=cx.measureText(t).width, h=14;
      /* el medio de la línea suele caer encima de un nodo o de su nombre;
         se prueban unos cuantos lugares sobre la curva y a los costados
         antes de renunciar */
      const nx=-dy/(Math.hypot(dx,dy)||1), ny=dx/(Math.hypot(dx,dy)||1);
      let sx=0,sy=0,caja=null;
      for(const t2 of [.5,.38,.62]){
        const [cxp,cyp]=enT(t2);
        for(const d of [0,13,-13]){
          const X=cxp+nx*d, Y=cyp+ny*d;
          /* G.W y G.H ya vienen en píxeles CSS, que es en lo que están
             estas coordenadas: dividirlos por dpr dejaba la ventana a
             menos de la mitad y ninguna etiqueta entraba nunca */
          if(X<-60||Y<-20||X>W+60||Y>H+20)continue;
          const c2={x0:X-w/2-5,x1:X+w/2+5,y0:Y-h/2,y1:Y+h/2};
          if(elegida||!clashes(c2,null)){sx=X;sy=Y;caja=c2;break}
        }
        if(caja)break;
      }
      if(!caja)return;                     // no entra en ningún lado: no ensucia
      placed.push(caja);
      cx.globalAlpha=elegida?1:.9;
      cx.fillStyle='rgba(13,16,21,.9)';
      cx.beginPath();
      if(cx.roundRect)cx.roundRect(caja.x0,caja.y0,w+10,h,7);
      else cx.rect(caja.x0,caja.y0,w+10,h);
      cx.fill();
      cx.strokeStyle='rgba(224,178,92,.35)';cx.lineWidth=1;cx.stroke();
      cx.fillStyle=elegida?'#EDE7DA':'#B6A489';
      cx.fillText(t,sx,sy+.5);
    });
    cx.globalAlpha=1;
  }

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
  /* 14px de margen: una línea es un objetivo finito para un dedo */
  const x=wx(sx),y=wy(sy), tope=14/G.cam.k;
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
/* ---------- micro-interacciones del grafo ---------- */

/* Nodos clavados: al arrastrar uno queda fijo donde lo soltaste, para poder
   armarse el mapa a mano en vez de aceptar el que salga. Se guardan por
   campaña en el navegador, así sobreviven a recargar. */
const pinKey=()=>'codex.pin.'+(cur?cur.id:'');
function cargarPins(){
  try{G.pin=new Set(JSON.parse(localStorage.getItem(pinKey())||'[]'))}
  catch(_){G.pin=new Set()}
}
function guardarPins(){
  try{localStorage.setItem(pinKey(),JSON.stringify([...G.pin]))}catch(_){}
}
function soltarPins(){
  G.pin.clear();guardarPins();
  G.alpha=Math.max(G.alpha,.5);gLoop();
  toast('Se soltaron todos','ok');
  gRefrescar();
}

/* La cámara viaja hasta el nodo en vez de aparecer ya encima: ubica mucho
   mejor de dónde a dónde se fue. */
function volarA(id,k){
  const n=G.map[id];if(!n||!G.W)return;
  const destino={k:k||Math.max(G.cam.k,.95)};
  destino.x=G.W/2-n.x*destino.k;
  destino.y=G.H/2-n.y*destino.k;
  if(REDUCED){Object.assign(G.cam,destino);gPaint();return}
  const desde={...G.cam}, t0=performance.now(), dur=420;
  const paso=()=>{
    const t=Math.min(1,(performance.now()-t0)/dur);
    const e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;   // suave en las dos puntas
    G.cam.k=desde.k+(destino.k-desde.k)*e;
    G.cam.x=desde.x+(destino.x-desde.x)*e;
    G.cam.y=desde.y+(destino.y-desde.y)*e;
    gDraw();
    if(t<1)requestAnimationFrame(paso);
  };
  G.autofit=false;
  requestAnimationFrame(paso);
}

/* Qué cambió desde la última vez que miré este grafo. */
const visKey=()=>'codex.vis.'+(cur?cur.id:'');
function marcarVisita(){
  try{localStorage.setItem(visKey(),String(Date.now()))}catch(_){}
}
function ultimaVisita(){
  try{const v=+localStorage.getItem(visKey());return v>0?v:0}catch(_){return 0}
}
function novedades(){
  const t=ultimaVisita();
  if(!t)return null;
  const nuevas=D.filter(e=>e.cr&&new Date(e.cr).getTime()>t);
  const tocadas=D.filter(e=>e.up&&new Date(e.up).getTime()>t&&
    !(e.cr&&new Date(e.cr).getTime()>t));
  if(!nuevas.length&&!tocadas.length)return null;
  return {nuevas,tocadas,desde:t};
}

/* Guardar el grafo como imagen para tirarlo al grupo. El canvas ya está
   dibujado: se copia sobre un fondo opaco, porque si no sale transparente y
   en cualquier chat se ve negro sobre negro. */
function exportarGrafo(){
  const cv=G.cv;if(!cv)return;
  try{
    const out=document.createElement('canvas');
    out.width=cv.width;out.height=cv.height;
    const c2=out.getContext('2d');
    c2.fillStyle='#0D1015';c2.fillRect(0,0,out.width,out.height);
    c2.drawImage(cv,0,0);
    /* una firma discreta, que si no la imagen suelta no dice de qué es */
    c2.setTransform(G.dpr,0,0,G.dpr,0,0);
    c2.font="500 11px 'JetBrains Mono',monospace";
    c2.fillStyle='rgba(149,161,180,.75)';
    c2.textAlign='right';c2.textBaseline='bottom';
    c2.fillText((cur&&cur.name||'Codex')+' · '+G.nodes.length+' fichas',G.W-12,G.H-10);
    out.toBlob(b=>{
      if(!b){toast('No pude generar la imagen','err');return}
      const u=URL.createObjectURL(b);
      const a=document.createElement('a');
      a.href=u;a.download=(slugify(cur&&cur.name||'codex')||'codex')+'-grafo.png';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(u),4000);
      toast('Imagen guardada','ok');
    },'image/png');
  }catch(err){toast('No pude generar la imagen: '+err.message,'err')}
}

/* Etiquetas que se usan en la campaña, para poder filtrar por ellas. */
function etiquetasUsadas(){
  const c={};
  D.forEach(e=>(e.tg||[]).forEach(t=>{c[t]=(c[t]||0)+1}));
  return Object.keys(c).sort((a,b)=>c[b]-c[a]||a.localeCompare(b)).slice(0,10);
}

/* ---------- grupos que se formaron solos ----------
   Propagación de etiquetas: cada ficha se queda con el grupo más votado por
   sus vecinas, pesando cada voto por la fuerza del vínculo, hasta que nadie
   cambia. Es de lo más simple que funciona y no necesita saber de antemano
   cuántos grupos hay.
   El orden y los desempates van por nombre y no al azar, así el mismo grafo
   da siempre los mismos grupos: si cambiaran de color en cada dibujo no se
   podría leer nada. */
function detectarGrupos(nodos,aristas){
  const ids=nodos.map(n=>n.id).sort();
  if(ids.length<3)return null;
  const vec={};ids.forEach(i=>vec[i]=[]);
  aristas.forEach(e=>{
    if(!vec[e.a]||!vec[e.b])return;
    vec[e.a].push([e.b,e.w||1]);vec[e.b].push([e.a,e.w||1]);
  });
  const g={};ids.forEach(i=>g[i]=i);
  for(let paso=0;paso<24;paso++){
    let cambio=false;
    for(const id of ids){
      const votos={};
      for(const [n,w] of vec[id])votos[g[n]]=(votos[g[n]]||0)+w;
      let mejor=g[id],max=votos[g[id]]||0;
      /* recorrido ordenado: el desempate cae siempre del mismo lado */
      Object.keys(votos).sort().forEach(k=>{
        if(votos[k]>max){max=votos[k];mejor=k}
      });
      if(mejor!==g[id]){g[id]=mejor;cambio=true}
    }
    if(!cambio)break;
  }
  const porGrupo={};
  ids.forEach(i=>{(porGrupo[g[i]]=porGrupo[g[i]]||[]).push(i)});
  /* los grupos de menos de tres no son un grupo, son una pareja suelta */
  return Object.keys(porGrupo).filter(k=>porGrupo[k].length>=3)
    .sort((a,b)=>porGrupo[b].length-porGrupo[a].length)
    .map(k=>porGrupo[k]);
}
const TINTES=['#E0B25C','#4FB795','#B48BD8','#E0696E','#6F9AD6','#D8B36F','#7FD1B9'];
/* envolvente convexa (cadena monótona de Andrew) */
function envolvente(pts){
  if(pts.length<3)return pts.slice();
  const p=pts.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  const cruz=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const abajo=[],arriba=[];
  for(const q of p){
    while(abajo.length>=2&&cruz(abajo[abajo.length-2],abajo[abajo.length-1],q)<=0)abajo.pop();
    abajo.push(q);
  }
  for(let i=p.length-1;i>=0;i--){
    const q=p[i];
    while(arriba.length>=2&&cruz(arriba[arriba.length-2],arriba[arriba.length-1],q)<=0)arriba.pop();
    arriba.push(q);
  }
  abajo.pop();arriba.pop();
  return abajo.concat(arriba);
}
function dibujarGrupos(cx,cam){
  const gr=G.grupos;
  if(!gr||!gr.length)return;
  gr.forEach((ids,i)=>{
    const pts=ids.map(id=>G.map[id]).filter(Boolean).map(n=>({x:n.x,y:n.y}));
    if(pts.length<3)return;
    const h=envolvente(pts);
    if(h.length<3)return;
    /* se infla desde el centro para que la mancha no corte los nodos */
    const cxm=h.reduce((s,q)=>s+q.x,0)/h.length;
    const cym=h.reduce((s,q)=>s+q.y,0)/h.length;
    const margen=34/cam.k+18;
    const inf=h.map(q=>{
      const d=Math.hypot(q.x-cxm,q.y-cym)||1;
      return{x:q.x+(q.x-cxm)/d*margen, y:q.y+(q.y-cym)/d*margen};
    });
    const c=TINTES[i%TINTES.length];
    cx.beginPath();
    cx.moveTo(inf[0].x,inf[0].y);
    /* esquinas redondeadas con el punto medio del lado siguiente */
    for(let k=0;k<inf.length;k++){
      const a=inf[k], b=inf[(k+1)%inf.length];
      cx.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);
    }
    cx.closePath();
    cx.globalAlpha=.075;cx.fillStyle=c;cx.fill();
    cx.globalAlpha=.28;cx.strokeStyle=c;cx.lineWidth=1.2/cam.k;
    cx.setLineDash([6/cam.k,5/cam.k]);cx.stroke();cx.setLineDash([]);
    cx.globalAlpha=1;
  });
}

const clavePar=(a,b)=>a<b?a+"|"+b:b+"|"+a;

function porQue(aId,bId){
  const out=[];
  const mirar=(de,hacia)=>{
    const e=byS[de];if(!e)return;
    [['Descripción',e.b],['Comentarios',e.c]].forEach(par=>{
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
  if(G.selEdge){
    const E=G.selEdge, a=byS[E.a], b=byS[E.b];
    if(!a||!b){G.selEdge=null;return gCard()}
    if(hint)hint.hidden=true;
    const clave=clavePar(E.a,E.b);
    const rels=RELK[clave]||[], grupo=!!GRPK[clave];
    const razones=porQue(E.a,E.b);
    /* el título dice de qué clase es la conexión: sin eso la tarjeta mostraba
       un renglón suelto y no se entendía qué estabas mirando */
    const titulo=rels.length?(rels.length>1?'Vínculos':'Vínculo')
      :razones.length?'Se nombran'
      :grupo?'Del mismo grupo':'Conectadas';
    const pinta=f=>esc(f).replace(LK,(m,k)=>{
      const e=byS[k];if(!e)return '';
      return (k===E.a||k===E.b)
        ? `<b style="color:${TY(e).c}">${esc(e.n)}</b>`:esc(e.n);
    });
    host.innerHTML=`<div class="gcard gecard">
      <button class="gcx" data-act="gclose" aria-label="Cerrar">${ic('x')}</button>
      <div class="eyebrow">${titulo}</div>
      <div class="gehead">
        <span class="genom" style="color:${TY(a).c}" data-go="${att(a.s)}">${esc(a.n)}</span>
        <span class="geic">${ic(rels.length?'link':grupo&&!razones.length?'grupo':'link')}</span>
        <span class="genom" style="color:${TY(b).c}" data-go="${att(b.s)}">${esc(b.n)}</span>
      </div>
      ${rels.length?`<div class="gerels">${rels.map(x=>`<div class="gerel">
        <b style="color:${TY(byS[x.de]).c}">${esc(byS[x.de].n)}</b>
        <span class="gerl">${esc(x.l)}</span>${ic('arrow','r')}
        <b style="color:${TY(byS[x.a]).c}">${esc(byS[x.a].n)}</b></div>`).join('')}</div>`:''}
      ${razones.length?`<div class="gewhy">${razones.map(x=>`<div class="gefr">
        <span class="gede">${esc(byS[x.de].n)} · ${esc(x.campo)}</span>
        ${pinta(x.f)}</div>`).join('')}</div>`:''}
      ${grupo&&!rels.length&&!razones.length
        ? `<div class="gewhy"><div class="gefr dim">Los dos son de
             ${esc(cur.party_name||'nuestro grupo')}. Todos los del grupo quedan
             conectados entre sí, sin que haga falta escribirlo.</div></div>`
        : (!rels.length&&!razones.length
          ? `<div class="gewhy"><div class="gefr dim">Se nombran, pero no encontré
               la frase. Puede que el enlace esté en el resumen.</div></div>`:'')}
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
    <button class="gco" data-go="${att(e.s)}">Abrir</button>
    <button class="gcx" data-act="gclose" aria-label="Cerrar">${ic('x')}</button></div>`;
}
function gCenter(slug){
  if(!byS[slug])return;
  st.ent=slug;G.sel=slug;G.selUser=false;gBuild();gCard();
  requestAnimationFrame(()=>volarA(slug));
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
    if(wasNode&&moved&&G.drag===wasNode){
      /* lo moviste a propósito: se queda ahí */
      G.pin.add(wasNode.id);guardarPins();
      gRefrescar();
    }
    G.drag=null;G.panning=null;G.downNode=null;
    if(wasNode&&!moved){
      /* tocar un nodo solo lo selecciona. Antes el segundo toque abría la
         ficha y se disparaba sin querer al mirar un retrato o seguir un hilo;
         para abrir está el botón de la tarjeta. */
      G.sel=wasNode.id;G.selUser=true;G.selEdge=null;gCard();gPaint();
    }else if(!wasNode&&!moved){
      /* en el vacío no hay nodo, pero puede haber una línea debajo */
      const p=at(ev), ar=gHitEdge(p.x,p.y);
      if(ar){G.selEdge={a:ar.a,b:ar.b};G.sel=null;G.selUser=false;gCard();gPaint()}
      else if(G.sel||G.selEdge){
        G.sel=null;G.selUser=false;G.selEdge=null;gCard();gPaint()}
    }
  };
  cv.onpointerup=end;cv.onpointercancel=end;
  cv.onpointerleave=()=>{if(!G.drag&&!G.panning&&G.hot){G.hot=null;gPaint()}};
  cv.ondblclick=ev=>{const b=cv.getBoundingClientRect();
    const n=gHit(ev.clientX-b.left,ev.clientY-b.top);
    if(n)go(n.id);
    else{G.autofit=true;gFit();gDraw()}};      // en el vacío, encuadra
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
  const app=document.getElementById('app');
  document.documentElement.classList.toggle('trabado',G.full);
  /* el botón cambia de sentido: al entrar muestra cómo salir */
  const b=w.querySelector('[data-act="full"]');
  if(b){const t=G.full?'Salir de pantalla completa':'Pantalla completa';
    b.innerHTML=ic(G.full?'contract':'expand');b.title=t;b.setAttribute('aria-label',t)}
  requestAnimationFrame(()=>{gSize();gFit();gDraw()});
}

/* ============================================================
   SHELL
   ============================================================ */
/* pestaña -> icono. "idx"/"grafo"/"nueva" siguen siendo las claves internas
   (st.tab, rutas, etc.); lo único que cambia acá es lo que se ve: Códice,
   Urdimbre y Forja son los nombres temáticos de Índice, Grafo y Ficha nueva. */
const NAV=[['idx','Códice','idx'],['grafo','Urdimbre','grafo'],['nueva','Forja','nueva']];
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
/* Al entrar por una dirección que apunta a una ficha hay que pedir las
   campañas y después la campaña: dos viajes. Sin esto, en el medio se dibujaba
   la lista de campañas y recién después la ficha, así que recargar mostraba un
   parpadeo de la pantalla principal. */
let ARRANCANDO=false;
/* Un esqueleto con la forma de la pantalla que viene, no un bloque cualquiera:
   si va a abrir una ficha se ve el retrato y el nombre donde van a estar, y si
   va al índice se ve una lista. Así la espera no cambia de forma al terminar. */
function vCarga(tab){
  const barra=(w,h,mt)=>`<div class="skel" style="height:${h}px;width:${w};${
    mt?'margin-top:'+mt+'px':''}"></div>`;
  const fila='<div class="row"><div class="skel rd" style="width:38px;height:38px"></div>'+
    '<div class="grow">'+barra('42%',13)+barra('72%',11,8)+'</div></div>';
  /* la barra de arriba también, para que al llegar el contenido no salte */
  const arriba=`<div class="top"><div class="topin">
    <div class="skel" style="width:96px;height:var(--h-md);border-radius:var(--r2)"></div>
    <div class="grow"></div>
    <div class="skel" style="width:96px;height:var(--h-md);border-radius:var(--r2)"></div>
  </div></div>`;
  if(tab==='ficha')return arriba+`<div class="page">
    <div class="imgrow"><div class="skel rd" style="width:72px;height:72px"></div>
      <div class="grow">${barra('30%',11)}${barra('64%',26,10)}</div></div>
    ${barra('44%',13,20)}
    <div style="margin-top:24px">${barra('100%',13)}${barra('96%',13,10)}${barra('58%',13,10)}</div>
  </div>`;
  return `<div class="page first">${barra('52%',26)}${barra('34%',13,12)}
    <div class="card" style="margin-top:24px">${fila.repeat(5)}</div></div>`;
}
function r(){
  if(ARRANCANDO){
    app.innerHTML=vCarga(ARRANCANDO);
    const nv=document.querySelector('.nav');if(nv)nv.style.display='none';
    RENDERED='carga';return;
  }
  /* si veníamos del editor, primero rescatamos lo tipeado */
  if(RENDERED==='ed'&&st.editing&&st.editing._live)keepDraft();
  if(RENDERED==='edcamp'&&st.ecamp)keepCampDraft();
  if(RENDERED==='imp'&&st.imp){const t=document.getElementById('impta');if(t)st.imp.txt=t.value}
  if(RENDERED==='grafo'){gStop();marcarVisita()}
  if(G.full){G.full=false;document.documentElement.classList.remove('trabado')}
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
  dlgEl.innerHTML=(st.conf?vConf():'')+(st.dup?vDup():'')+(st.del?vDel():'')
    +(st.fus?vFus():'')+(st.pick?vPick():'');
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
  tpabrir:v=>{keepCampDraft();st.ecamp.tipo=st.ecamp.tipo===v?null:v;r()},
  tpmover:(v,el)=>{keepCampDraft();moverTipo(v,el.getAttribute('data-a'))},
  tprenombrar:v=>{
    keepCampDraft();
    const el=document.getElementById('tpren');
    const nuevo=slugTipo((el&&el.value)||'');
    if(!nuevo){toast('Escribí el nombre nuevo','err');return}
    if(nuevo===v){st.ecamp.tipo=null;r();return}
    moverTipo(v,nuevo);
  },
  hist:v=>openHist(v),
  restaurar:v=>restaurar(v),
  confpisar:()=>{st.conf=null;save(true)},
  confver:()=>{const s2=st.conf.slug;st.conf=null;st.editing=null;
    loadCamp(cur).then(()=>cerrar({tab:'ficha',ent:s2}))},
  confvolver:()=>{st.conf=null;r()},
  cancelcamp:()=>cerrar({tab:'idx'}),
  edit:v=>edit(v),
  borrar:v=>pedirBorrar(v),
  fusion:v=>{st.fus={slug:v,cand:null};st.del=null;r()},
  fuscand:v=>{st.fus.cand=v||null;r()},
  fusok:()=>fusionar(st.fus.slug,st.fus.cand),
  fusno:()=>{st.fus=null;r()},
  delok:()=>borrarFicha(st.del.slug),
  delno:()=>{st.del=null;r()},
  new:()=>edit(null),
  /* sin destino: vuelve a donde se estaba antes de abrir el editor */
  cancel:()=>cerrar(),
  save,
  type:v=>{keepDraft();st.editing.type=v;r()},
  edtab:v=>{keepDraft();st.editing.edtab=v;r()},
  /* data-v viene como "clase:mago"; sin valor, lo borra */
  atr:v=>{keepDraft();
    const i=v.indexOf(':'), k=v.slice(0,i), x=v.slice(i+1);
    st.editing.at=st.editing.at||{};
    if(!x||st.editing.at[k]===x)delete st.editing.at[k];else st.editing.at[k]=x;
    st.editing.atNuevo=null;r()},
  /* prende o apaga una etiqueta de la lista, sin tocar las propias */
  etiq:v=>{keepDraft();
    const T=st.editing.tags||(st.editing.tags=[]);
    const i=T.findIndex(t=>nm(t)===v);
    if(i>=0)T.splice(i,1);else T.push(v);
    r()},
  atrotro:v=>{keepDraft();
    st.editing.atNuevo=st.editing.atNuevo===v?null:v;r()},

  rmtag:v=>{keepDraft();(st.editing.tags||[]).splice(+v,1);r()},
  rmals:v=>{keepDraft();(st.editing.als||[]).splice(+v,1);r()},
  rmrel:v=>{keepDraft();(st.editing.rels||[]).splice(+v,1);r()},
  reladd:()=>{if(relAdd())r()},
  tiponuevo:()=>{keepDraft();st.editing.tipoNuevo=!st.editing.tipoNuevo;r()},
  tipoadd:()=>{if(tipoAdd())r()},
  misma:v=>usarLaQueEsta(v),
  dupcrear:()=>{st.editing.igual=true;st.dup=null;save()},
  dupvolver:()=>{st.dup=null;r()},
  importar,
  /* salir del importador también es cerrar: no deja una entrada más */
  impsalir:()=>cerrar({tab:'idx'}),
  impvolver:()=>{st.imp.paso='pegar';st.imp.err='';r();alTope()},
  impprompt:()=>copiar(PROMPT,'Texto copiado. Pegáselo a tu AI con tus notas.'),
  impleer:()=>{
    const t=document.getElementById('impta');
    const res=leerPlan(t?t.value:'');
    if(res.err){st.imp.err=res.err;r();return}
    st.imp.plan=res.items;st.imp.err='';st.imp.paso='revisar';r();alTope();
  },
  /* cada toque del botón cambia qué se va a hacer con esa fila */
  impacc:v=>{
    const x=st.imp.plan[+v];if(!x)return;
    const ciclo=x.e?(x.duda?['sumar','crear','nada']:['sumar','nada'])
                   :['crear','nada'];
    x.acc=ciclo[(ciclo.indexOf(x.acc)+1)%ciclo.length];r();
  },
  /* abrir una fila para ver qué se escribe */
  impver:v=>{const x=st.imp.plan[+v];if(x){x.abierto=!x.abierto;r()}},
  /* de las parecidas, elegir cuál es */
  impelegir:(v,el)=>{
    const i=+el.getAttribute('data-i'), x=st.imp.plan[i];
    if(!x||!byS[v])return;
    x.e=byS[v];x.acc='sumar';r();
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
    st.tab='grafo';r();alTope();marcarNav()},
  gmode:v=>{
    if(v==='all')G.mode='all';else{G.mode='ego';G.depth=+v}
    G.pos={};gRefrescar();gBuild();gCard();
  },
  gtype:v=>{
    if(G.off.has(v))G.off.delete(v);else G.off.add(v);
    gRefrescar();gBuild();gCard();
  },
  reheat:()=>{G.pos={};gBuild();},
  fit:()=>{G.autofit=false;gFit();gDraw()},
  full:gFull,
  gclose:()=>{G.sel=null;G.selUser=false;G.selEdge=null;gCard();gPaint()},
  gsoltar:soltarPins,
  /* al soltar o prender grupos hay que redibujar esa fila */
  gexport:exportarGrafo,
  gtag:v=>{G.tag=(G.tag===v?null:v);G.pos={};gBuild();
    gRefrescar();gFit();gPaint();},
  ggrupos:()=>{G.verGrupos=!G.verGrupos;
    G.grupos=G.verGrupos?detectarGrupos(G.nodes,G.edges):null;
    gRefrescar();gPaint();
    /* el botón vive en .gzoom, que gRefrescar() no toca — se prende solo */
    const gb=document.getElementById('ggroupsbtn');
    if(gb){gb.classList.toggle('on',G.verGrupos);
      const t=G.verGrupos?'Ocultar grupos':'Mostrar grupos';
      gb.title=t;gb.setAttribute('aria-label',t);gb.setAttribute('aria-pressed',G.verGrupos)}
    if(G.verGrupos)toast((G.grupos&&G.grupos.length||0)+' grupos',null);},
  gcentrar:v=>{gCenter(v);r();alTope()},
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

(async()=>{
  /* si la dirección apunta a algún lado, se abre eso y no la lista */
  const rt=leerRuta();
  ARRANCANDO=rt?rt.tab:false;
  r();await loadCamps();
  const c=rt&&CAMPS.filter(x=>campSlug(x)===rt.camp)[0];
  if(c){
    st.ent=rt.ent;await loadCamp(c);
    if(rt.ent&&!byS[rt.ent])toast('Esa ficha ya no está','err');
    st.tab=rt.tab;st.q='';
    st.pick=!st.me&&quienes().length>0;
  }
  ARRANCANDO=false;
  r();sellarNav();
})();
