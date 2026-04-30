﻿var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Photos de fond — page de connexion. Remplacer par des URLs hébergées en production.
var LOGIN_PHOTOS = [
  { url: 'https://images.unsplash.com/photo-1663354863356-18a03be40a53?q=80&w=2070&auto=format', credit: 'Photo : Unsplash' },
  { url: 'https://images.unsplash.com/photo-1606206591513-adbfbdd7a177?q=80&w=2070&auto=format', credit: 'Photo : Unsplash' },
  { url: 'https://images.unsplash.com/photo-1606206522398-de3bd05b1615?q=80&w=2070&auto=format', credit: 'Photo : Unsplash' },
  { url: '/img/img1inspq.jpg', credit: 'Photo : INSPQ - Procédure de collecte et d’envoi d’échantillons sanguins' },
  { url: 'https://cdn.pixabay.com/photo/2018/06/26/05/08/lab-3498584_1280.jpg', credit: 'Photo : fernandozhiminaicela / Pixabay' },
  { url: 'https://images.pexels.com/photos/8442572/pexels-photo-8442572.jpeg?_gl=1*8njumv*_ga*MTczOTMwMDM1MC4xNzc3MjUyNTA0*_ga_8JE65Q40S6*czE3NzczOTcwMTkkbzIkZzEkdDE3NzczOTcxMzgkajExJGwwJGgw', credit: 'Photo : Pavel Danilyuk / Pexels' },
];

// Etat local
var CFG = {name:'Traçabilité OPTILAB',subtitle:'Application de suivi des envois',alarmR:18,alarmP:5,temperatures:[{icon:'🌡',label:'Température pièce'},{icon:'❄',label:'Frigo (2–8°C)'},{icon:'🧊',label:'Congelé (−20°C)'}],transporters:['Livraison ML','Guépard','Commissionnaire interne','Taxi','Autre'],messages:{login:'',home:''},badges:{'En transit':{bg:'#D7EEF9',color:'#1B6E94'},'Reçu':{bg:'#E1F2E8',color:'#2E8B57'},'En attente':{bg:'#FBEFD7',color:'#B97309'},'Problème':{bg:'#FBE3E1',color:'#B3261E'},'Perdu':{bg:'#FCE7F3',color:'#9D174D'}},customCss:'',printBordereau:true,hsilpBordereauFormat:'bordereau',bordereau:{titre:"OPTILAB — Bordereau d'envoi",pli:'✄ Plier ici — Fold here',canutec:'1-613-996-6666',warnSize:true,activeFormat:'folded',formats:[{id:'folded',nom:'Lettre pliée',desc:'Étiquette d\'envoi (haut) + Bordereau informatif (bas), plier en deux'},{id:'bordereau',nom:'Bordereau seul — Lettre',desc:'Page lettre 8½ × 11 po : code-barres et tableau d\'informations, sans étiquette d\'expédition'},{id:'etiquette',nom:'Étiquette seule',desc:'Uniquement la partie étiquette : pictogrammes, adresses et départements'},{id:'pochette',nom:'Pochette colis — Lettre pliée',desc:'Optimisé pour pochette transparente 8×10 po : expéditeurs/pictos/temp visibles à gauche, bordereau plié à l\'intérieur'},{id:'grille',nom:'Grille colis — Pochette 8×10 po',desc:'Étiquette en grille : Destinataire | Température — Expéditeur | Départements — Pictogrammes pleine largeur'}],specTypes:[{id:'exempt',label:'Spécimen humain exempté',shape:'box',line1:'SPÉCIMEN HUMAIN EXEMPTÉ',subtitle:'EXEMPT HUMAN SPECIMEN',note:'IATA P650 · 2.6.2.2',isDgr:false},{id:'cat_b',label:'Catégorie B — UN 3373',shape:'diamond',line1:'BIOLOGICAL SUBSTANCE,',line2:'CATEGORY B',line1_fr:'SUBSTANCE BIOLOGIQUE,',line2_fr:'CATÉGORIE B',un:'UN 3373',isDgr:true},{id:'cat_a',label:'Catégorie A — UN 2814',shape:'diamond',icon:'biohazard',line1:'INFECTIOUS SUBSTANCE',line1_fr:'SUBSTANCE INFECTIEUSE',un:'UN 2814',classe:'6',isDgr:true}]}};
var BADGE_STATUTS=[{label:'En transit',cls:'bt'},{label:'Reçu',cls:'br'},{label:'En attente',cls:'ba'},{label:'Problème',cls:'bp2'},{label:'Perdu',cls:'bperdu'}];
var CU=null,LABS=[],E=[],ULST=[],ST='',SD=[],CRI=-1,EUI=null,_rtCh=null,SGSP='exempt',SGSC=false;
var SILP_NO_LIST=false;   // checkbox "pas de liste" — intra-grappe
// ── HORS-GRAPPE ──────────────────────────────────────────────────────────────
var HG_MODE=false,EXT_LABS=[],EHG=[];
var HGS_ST='',HGS_SGC=false,HGS_LISTS=[];
var HGS_NO_LIST=false;    // checkbox "pas de liste" — hors-grappe
var _hgPrintData=null,_hgFaxId=null,_hgFaxConforme=null;
var _hgEditId=null,_hgEditST='',_hgEditSGC=false,_hgEditLists=[];
var E_ENVOI_ID=null,E_ST='',E_SD=[],E_SGC=false;

// ── SECURITY: XSS sanitization ───────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

var PCLS=['tp-0','tp-1','tp-2','tp-3','tp-4'];
var DEPTS=[{id:'BIOCHIMIE',label:'Biochimie',short:'Bio',cls:'db-bio'},{id:'HEMATOLOGIE',label:'Hématologie/BDS',short:'Hémato',cls:'db-hema'},{id:'MICROBIOLOGIE',label:'Microbiologie/Séro',short:'Micro',cls:'db-micro'},{id:'PATHOLOGIE',label:'Pathologie/Cyto',short:'Patho',cls:'db-patho'}];

// Utilitaires
function fdt(iso){if(!iso)return'—';var d=new Date(iso);return d.toLocaleDateString('fr-CA',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});}
function fdo(iso){if(!iso)return'';return new Date(iso).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
function dk(iso){if(!iso)return'0000-00-00';var d=new Date(iso);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function thrs(e){if(!e.tsEnvoi)return null;var en=e.tsRecep?new Date(e.tsRecep):new Date();return(en-new Date(e.tsEnvoi))/3600000;}
function ft(h){if(h===null)return'—';var hh=Math.floor(h);var mm=Math.round((h-hh)*60);return hh+'h'+String(mm).padStart(2,'0');}
function tl(t){var f=CFG.temperatures.find(function(x){return x.label===t;});return f?f.icon+' '+f.label:t;}
function tlS(t){var f=CFG.temperatures.find(function(x){return x.label===t;});return f?f.icon+' '+f.label.split(' ')[0]:t;}
function bc(s){return s==='En transit'?'bt':s==='Reçu'?'br':s==='En attente'?'ba':s==='Perdu'?'bperdu':'bp2';}
function isAlarmR(e){var h=thrs(e);return h!==null&&h>CFG.alarmR&&e.statut==='En transit';}
function isAlarmP(e){var h=thrs(e);return h!==null&&CFG.alarmP&&h>CFG.alarmP*24&&e.statut==='En transit';}
function rowCls(e){if(e.statut==='Perdu')return'row-perdu';if(e.statut==='Problème')return'row-probleme';return isAlarmP(e)?'ar-lost':isAlarmR(e)?'ar':'';}
function isAlert(e){return isAlarmR(e)||isAlarmP(e)||e.statut==='Perdu'||e.statut==='Problème';}
function renderLegend(elId,arr){var leg=document.getElementById(elId);if(!leg)return;var haR=arr.some(isAlarmR),haAP=arr.some(isAlarmP),haP=arr.some(function(e){return e.statut==='Problème';}),haLost=arr.some(function(e){return e.statut==='Perdu';});if(!haR&&!haAP&&!haP&&!haLost){leg.innerHTML='';return;}var rows=[];if(haR)rows.push('<div class="rleg-row ar-row"><span class="badge bt">En transit</span><span class="talarm">⚠ '+CFG.alarmR+'h+</span><span class="rleg-desc">Transit supérieur à '+CFG.alarmR+'h</span></div>');if(haAP)rows.push('<div class="rleg-row ar-lost-row"><span class="badge bt">En transit</span><span class="talarm-lost">⚠ '+(CFG.alarmP*24)+'h+</span><span class="rleg-desc">Potentiellement perdu — transit &gt; '+CFG.alarmP+' jours</span></div>');if(haP)rows.push('<div class="rleg-row prob-row"><span class="badge bp2">Problème</span><span class="rleg-desc">Envoi avec problème signalé</span></div>');if(haLost)rows.push('<div class="rleg-row perdu-row"><span class="badge bperdu">Perdu</span><span class="rleg-desc">Colis déclaré perdu</span></div>');leg.innerHTML='<details class="rleg"><summary class="rleg-title">Légende</summary><div class="rleg-rows">'+rows.join('')+'</div></details>';}

function fmtCP(v){var s=v.replace(/\s/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);return s.length>3?s.slice(0,3)+' '+s.slice(3):s;}
function fmtTel(v){var d=v.replace(/\D/g,'').slice(0,10);if(!d)return'';if(d.length<=3)return'('+d;if(d.length<=6)return'('+d.slice(0,3)+') '+d.slice(3);return'('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6);}
function modSep(t){return '<div style="grid-column:1/-1;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);padding-top:12px;margin-top:2px;border-top:1px solid var(--b3)">'+t+'</div>';}
function rl(r){if(r==='admin')return'Administrateur';if(r==='superviseur_grappe')return'Sup. Grappe';if(r==='superviseur_labo')return'Sup. Labo';return'Technicien';}
function rb(r){if(r==='admin')return'badm';if(r==='superviseur_grappe')return'bsg';if(r==='superviseur_labo')return'bsl';return'btech';}
function isAdmin(){return CU&&CU.role==='admin';}
function isG(){return CU&&(CU.role==='superviseur_grappe'||CU.role==='admin');}
function isS(){return CU&&(CU.role==='superviseur_labo'||CU.role==='superviseur_grappe'||CU.role==='admin');}
function dbh(d){if(!d||!d.length)return'<span style="color:var(--t3);font-size:11px">—</span>';return d.map(function(x){var i=DEPTS.find(function(q){return q.id===x;});return i?'<span class="db '+i.cls+'">'+i.short+'</span>':'';}).join('');}
function dlbl(d){if(!d||!d.length)return'—';return d.map(function(x){var i=DEPTS.find(function(q){return q.id===x;});return i?i.label:x;}).join(', ');}
function ban(id,msg,t){toast(msg,t==='e'?'e':'s');}
function tcell(e){var h=thrs(e);var svg='<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 7v2.5M8 11v.5"/></svg>';if(isAlarmP(e))return'<span class="talarm talarm-lost">'+svg+ft(h)+'</span>';if(isAlarmR(e))return'<span class="talarm">'+svg+ft(h)+'</span>';return'<span class="'+(h!==null&&h>CFG.alarmR*0.7?'twarn':'tok')+'">'+ft(h)+'</span>';}
function spin(on){document.getElementById('spinner').classList.toggle('done',!on);}
function showScr(s){['scr-login','scr-cpw'].forEach(function(id){var el=document.getElementById(id);el.classList.toggle('gone',id!=='scr-'+s);});document.getElementById('scr-app').classList.toggle('on',s==='app');}

// Branding
function applyBranding(){
  var m={'l-name':CFG.name,'l-sub':CFG.subtitle,'cpw-appname':CFG.name,'cp-name':CFG.name,'sb-name':CFG.name.replace('Envois - ',''),'sb-sub':CFG.subtitle};
  Object.keys(m).forEach(function(id){var el=document.getElementById(id);if(el)el.textContent=m[id];});
  document.getElementById('ptitle').textContent=CFG.name;
}
function mdToHtml(s){
  if(!s)return'';
  // 1. Échapper le HTML brut
  s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // 2. Titres
  s=s.replace(/^### (.+)$/gm,'<strong style="font-size:1.05em">$1</strong>');
  s=s.replace(/^## (.+)$/gm,'<strong style="font-size:1.1em">$1</strong>');
  s=s.replace(/^# (.+)$/gm,'<strong style="font-size:1.15em">$1</strong>');
  // 3. Gras / italique
  s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/__(.+?)__/g,'<strong>$1</strong>');
  s=s.replace(/\*(.+?)\*/g,'<em>$1</em>');
  s=s.replace(/_(.+?)_/g,'<em>$1</em>');
  // 4. Code inline
  s=s.replace(/`(.+?)`/g,'<code style="background:rgba(0,0,0,.08);padding:1px 5px;border-radius:3px;font-family:var(--fm);font-size:.92em">$1</code>');
  // 5. Liens (bloque javascript:, data:, vbscript:)
  s=s.replace(/\[(.+?)\]\((.+?)\)/g,function(m,txt,url){
    if(/^(javascript|data|vbscript):/i.test(url.trim()))return esc(txt);
    return'<a href="'+url+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">'+txt+'</a>';
  });
  // 6. Séparateur
  s=s.replace(/^---$/gm,'<hr style="border:none;border-top:1px solid currentColor;opacity:.25;margin:6px 0">');
  // 7. Listes
  s=s.replace(/^[*-] (.+)$/gm,'<li>$1</li>');
  s=s.replace(/((<li>.*?<\/li>\n?)+)/g,function(m){return'<ul style="margin:4px 0 4px 18px;padding:0">'+m+'</ul>';});
  // 8. Sauts de ligne
  s=s.replace(/\n/g,'<br>');
  return s;
}
function initLoginBg(){
  var el=document.getElementById('login-bg');
  var cpwEl=document.getElementById('cpw-bg');
  if(!el||!LOGIN_PHOTOS.length)return;
  var entry=LOGIN_PHOTOS[Math.floor(Math.random()*LOGIN_PHOTOS.length)];
  var url=typeof entry==='string'?entry:entry.url;
  var credit=typeof entry==='string'?'':entry.credit||'';
  ['login-credit','cpw-credit'].forEach(function(id){var el=document.getElementById(id);if(el){el.textContent=credit;el.style.display=credit?'inline-flex':'none';}});
  var img=new Image();
  img.onload=function(){
    el.style.backgroundImage='url('+url+')';el.classList.add('loaded');
    if(cpwEl){cpwEl.style.backgroundImage='url('+url+')';cpwEl.classList.add('loaded');}
  };
  img.onerror=function(){el.classList.add('loaded');if(cpwEl)cpwEl.classList.add('loaded');};
  img.src=url;
}

function applyMessages(){
  var lm=document.getElementById('login-msg');lm.innerHTML=mdToHtml(CFG.messages.login);lm.style.display=CFG.messages.login?'block':'none';
  var aside=document.getElementById('login-aside');if(aside)aside.style.display=CFG.messages.login?'flex':'none';
  var hm=document.getElementById('home-msg');hm.innerHTML=mdToHtml(CFG.messages.home);hm.style.display=CFG.messages.home?'block':'none';
}

// Init
document.addEventListener('DOMContentLoaded',async function(){
  initTheme();
  initLoginBg();
  applyBranding();
  setupKeyboard();
  setupConfirmModal();
  try{
    var ses=(await sb.auth.getSession()).data.session;
    if(ses){await loadProfileAndInit(ses.user.id);}
    else{await loadConfig();spin(false);showScr('login');}
  }catch(e){
    console.error('[OPTILAB] init:',e);
    spin(false);showScr('login');
  }
});

// Chargement config depuis Supabase
async function loadConfig(){
  var r;try{r=await sb.from('app_config').select('key,value');}catch(e){return;}
  if(r.error)return;
  function unquote(v){if(typeof v==='string'&&v.length>=2&&v[0]==='"'&&v[v.length-1]==='"'){try{return JSON.parse(v);}catch(e){}}return v;}
  r.data.forEach(function(row){
    if(row.key==='app_name')CFG.name=unquote(row.value);
    if(row.key==='app_subtitle')CFG.subtitle=unquote(row.value);
    if(row.key==='alarm_hours')CFG.alarmR=Number(row.value)||18;
    if(row.key==='alarm_days')CFG.alarmP=Number(row.value)||5;
    if(row.key==='temperatures')CFG.temperatures=row.value;
    if(row.key==='transporters')CFG.transporters=row.value;
    if(row.key==='msg_login')CFG.messages.login=unquote(row.value);
    if(row.key==='msg_home')CFG.messages.home=unquote(row.value);
    if(row.key==='badge_colors'&&row.value&&typeof row.value==='object')CFG.badges=row.value;
    if(row.key==='custom_css')CFG.customCss=unquote(row.value)||'';
    if(row.key==='print_bordereau')CFG.printBordereau=row.value!==false&&row.value!=='false';
    if(row.key==='hsilp_bordereau_format')CFG.hsilpBordereauFormat=typeof row.value==='string'?row.value.replace(/^"|"$/g,''):'bordereau';
    if(row.key==='hgrappe_enabled_labs')CFG.hgrappeEnabledLabs=Array.isArray(row.value)?row.value:[];
    if(row.key==='hgrappe_bordereau_format')CFG.hgrappeFormat=typeof row.value==='string'?row.value.replace(/^"|"$/g,''):'bordereau';
    if(row.key==='hgrappe_alarm_days')CFG.hgrappeAlarmDays=Number(row.value)||3;
    if(row.key==='hgrappe_auto_close_days')CFG.hgrappeAutoCloseDays=Number(row.value)||10;
    if(row.key==='hgrappe_confirm_by_numero')CFG.hgrappeConfirmByNumero=row.value!==false&&row.value!=='false';
    if(row.key==='bordereau_cfg'&&row.value&&typeof row.value==='object'){
      var _codeFmts=CFG.bordereau.formats; // formats définis dans le code (toujours à jour)
      CFG.bordereau=Object.assign({},CFG.bordereau,row.value);
      // Restaurer les formats du code en appliquant uniquement les surcharges de nom/desc de la DB
      if(Array.isArray(row.value.formats)){row.value.formats.forEach(function(sf){var cf=_codeFmts.find(function(f){return f.id===sf.id;});if(cf){if(sf.nom)cf.nom=sf.nom;if(sf.desc)cf.desc=sf.desc;}});}
      CFG.bordereau.formats=_codeFmts; // toujours tous les formats du code
      if(!Array.isArray(CFG.bordereau.specTypes))CFG.bordereau.specTypes=[];
    }
  });
  if(!CFG.hgrappeEnabledLabs)CFG.hgrappeEnabledLabs=[];
  if(!CFG.hgrappeFormat)CFG.hgrappeFormat='bordereau';
  if(!CFG.hgrappeAlarmDays)CFG.hgrappeAlarmDays=3;
  if(!CFG.hgrappeAutoCloseDays)CFG.hgrappeAutoCloseDays=10;
  if(CFG.hgrappeConfirmByNumero===undefined)CFG.hgrappeConfirmByNumero=true;
  applyBranding();applyMessages();applyBadges();applyCustomCss();
  var elL=document.getElementById('cfg-msg-login');if(elL){elL.value=CFG.messages.login;mdeUpdate('login');}
  var elH=document.getElementById('cfg-msg-home');if(elH){elH.value=CFG.messages.home;mdeUpdate('home');}
  var bT=document.getElementById('brd-titre');if(bT)bT.value=CFG.bordereau.titre;
  var bP=document.getElementById('brd-pli');if(bP)bP.value=CFG.bordereau.pli;
  var bC=document.getElementById('brd-canutec');if(bC)bC.value=CFG.bordereau.canutec;
  var bW=document.getElementById('brd-warn-size');if(bW)bW.checked=CFG.bordereau.warnSize!==false;
  if(document.getElementById('spec-list'))renderCfgSpec();
  if(document.getElementById('fmt-list'))renderCfgFormats();
  if(document.getElementById('hsilp-fmt-list'))renderCfgHsilpFormat();
}

// Chargement labos
async function loadLabs(){
  try{var r=await sb.from('laboratories').select('id,name,adresse,adresse2,ville,province,code_postal,pays,telephone,default_refrigerant,fax_bio_hema,fax_micro,fax_patho,fax_general').eq('active',true).order('name');if(!r.error)LABS=r.data||[];}catch(e){}
}
async function loadExtLabs(){
  try{var r=await sb.from('external_labs').select('id,name,parent_id,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text,active').eq('active',true).order('name');if(!r.error)EXT_LABS=r.data||[];}catch(e){}
}
async function loadEnvoisHG(){
  try{
    var r=await sb.from('envois_hgrappe').select('*,exp_lab:exp_labo_id(name,adresse,ville,code_postal,telephone,fax_bio_hema,fax_micro,fax_patho,fax_general),dest_lab:dest_ext_lab_id(id,name,parent_id,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text,parent:parent_id(id,name,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text))').order('ts_envoi',{ascending:false});
    if(!r.error)EHG=(r.data||[]).map(function(row){var dl=row.dest_lab||null;var destName=dl?dl.name:'';var destParent=dl&&dl.parent?dl.parent:null;return{id:row.id,numero:row.numero,source:row.source,exp:row.exp_lab?row.exp_lab.name:'',dest:destName,destLab:dl,expId:row.exp_labo_id,destId:row.dest_ext_lab_id,expLab:row.exp_lab||{},temp:row.temperature,transporteur:row.transporteur,tubes:row.nb_echantillons,numerosSilp:row.numeros_silp||[],statut:row.statut,notes:row.notes||'',creePar:row.cree_par_nom||'',creeParId:row.cree_par_id,typeSpecimen:row.type_specimen||'exempt',glaceSeche:row.glace_seche||false,confirmToken:row.confirm_token,confirmMethod:row.confirm_method,confirmConforme:row.confirm_conforme,confirmNcTypes:row.confirm_nc_types||[],confirmCommentaire:row.confirm_commentaire||'',confirmRecuPar:row.confirm_recu_par||'',tsConfirm:row.ts_confirm,tsEnvoi:row.ts_envoi};});
  }catch(e){}
  await autoCloseHGEnvois();
}
// Passe automatiquement au statut "Aucune réponse reçue" après le seuil configuré
async function autoCloseHGEnvois(){
  var threshold=CFG.hgrappeAutoCloseDays||10;
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-threshold);
  var toClose=EHG.filter(function(e){return e.statut==='En transit'&&!e.tsConfirm&&new Date(e.tsEnvoi)<cutoff;});
  if(!toClose.length)return;
  var ids=toClose.map(function(e){return e.id;});
  var r=await sb.from('envois_hgrappe').update({statut:'Aucune réponse reçue'}).in('id',ids);
  if(!r.error){
    // Mettre à jour en mémoire sans reload complet
    toClose.forEach(function(e){e.statut='Aucune réponse reçue';});
  }
}

// Chargement envois
async function loadEnvois(){
  try{
    var r=await sb.from('envois').select('*,exp_lab:exp_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone),dest_lab:dest_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone)').order('ts_envoi',{ascending:false});
    if(!r.error)E=(r.data||[]).map(function(row){return{id:row.id,numero:row.numero_liste,exp:row.exp_lab?row.exp_lab.name:'',dest:row.dest_lab?row.dest_lab.name:'',expId:row.exp_labo_id,destId:row.dest_labo_id,expAdresse:row.exp_lab?row.exp_lab.adresse||'':'',expAdresse2:row.exp_lab?row.exp_lab.adresse2||'':'',expVille:row.exp_lab?row.exp_lab.ville||'':'',expProvince:row.exp_lab?row.exp_lab.province||'':'',expCodePostal:row.exp_lab?row.exp_lab.code_postal||'':'',expPays:row.exp_lab?row.exp_lab.pays||'':'',expTel:row.exp_lab?row.exp_lab.telephone||'':'',destAdresse:row.dest_lab?row.dest_lab.adresse||'':'',destAdresse2:row.dest_lab?row.dest_lab.adresse2||'':'',destVille:row.dest_lab?row.dest_lab.ville||'':'',destProvince:row.dest_lab?row.dest_lab.province||'':'',destCodePostal:row.dest_lab?row.dest_lab.code_postal||'':'',destPays:row.dest_lab?row.dest_lab.pays||'':'',destTel:row.dest_lab?row.dest_lab.telephone||'':'',temp:row.temperature,transporteur:row.transporteur,tubes:row.nb_echantillons,depts:row.departements||[],statut:row.statut,notes:row.notes||'',creePar:row.cree_par_nom||'',creeParId:row.cree_par_id||null,recepPar:row.recep_par_nom||'',recepObs:row.recep_obs||'',tsEnvoi:row.ts_envoi,tsRecep:row.ts_recep,typeSpecimen:row.type_specimen||'exempt',glaceSeche:row.glace_seche||false};});
  }catch(e){}
}

// Auth
// ── LOGIN RATE LIMITING ───────────────────────────────────────────────────────
var _loginAttempts = 0;
var _loginLocked = false;
var _loginLockUntil = 0;

async function doLogin(){
  var id=document.getElementById('lid').value.trim(),pw=document.getElementById('lpw').value;
  if(!id||!pw)return;
  // Rate limiting
  if(_loginLocked && Date.now() < _loginLockUntil) {
    var secs = Math.ceil((_loginLockUntil - Date.now())/1000);
    var el=document.getElementById('lerr');
    el.textContent='Trop de tentatives. Réessayez dans '+secs+' secondes.';
    el.style.display='block';return;
  }
  spin(true);
  try{
    var r=await sb.auth.signInWithPassword({email:id.toLowerCase()+'@optilab.internal',password:pw});
    if(r.error){
      spin(false);
      _loginAttempts++;
      if(_loginAttempts>=5){_loginLocked=true;_loginLockUntil=Date.now()+30000;_loginAttempts=0;setTimeout(function(){_loginLocked=false;},30000);}
      var el=document.getElementById('lerr');
      el.textContent=_loginAttempts>=3?'Identifiants incorrects. Encore '+Math.max(0,5-_loginAttempts)+' tentative(s) avant verrouillage.':'Identifiants incorrects ou compte désactivé.';
      el.style.display='block';setTimeout(function(){el.style.display='none';},4000);return;
    }
    _loginAttempts=0;_loginLocked=false;
    await loadProfileAndInit(r.data.user.id);
  }catch(e){
    console.error('[OPTILAB] login:',e);
    spin(false);
    var el=document.getElementById('lerr');
    el.textContent='Erreur réseau. Vérifiez votre connexion et réessayez.';
    el.style.display='block';setTimeout(function(){el.style.display='none';},6000);
  }
}
async function loadProfileAndInit(uid){
  try{
    var r=await sb.from('profiles').select('*,lab:labo_id(id,name)').eq('id',uid).single();
    if(r.error||!r.data){try{await sb.auth.signOut();}catch(e){}spin(false);showScr('login');return;}
    var p=r.data;
    if(!p.active){try{await sb.auth.signOut();}catch(e){}spin(false);var el=document.getElementById('lerr');el.textContent='Compte désactivé.';el.style.display='block';return;}
    if(p.must_change_password){CU=p;spin(false);showScr('cpw');return;}
    await finishLogin(p);
  }catch(e){
    console.error('[OPTILAB] loadProfile:',e);
    try{await sb.auth.signOut();}catch(e){}
    spin(false);showScr('login');
  }
}
async function savePw(){
  var p1=document.getElementById('npw1').value,p2=document.getElementById('npw2').value,el=document.getElementById('cperr');
  if(!p1){el.textContent='Saisissez un mot de passe.';el.style.display='block';return;}
  if(!CU.is_test&&p1.length<8){el.textContent='Le mot de passe doit contenir au moins 8 caractères.';el.style.display='block';return;}
  if(p1!==p2){el.textContent='Les mots de passe ne correspondent pas.';el.style.display='block';return;}
  spin(true);
  try{
    var r=await sb.auth.updateUser({password:p1});
    if(r.error){spin(false);el.textContent=r.error.message;el.style.display='block';return;}
    await sb.from('profiles').update({must_change_password:false}).eq('id',CU.id);
    CU.must_change_password=false;await finishLogin(CU);
  }catch(e){
    console.error('[OPTILAB] savePw:',e);
    spin(false);el.textContent='Erreur réseau. Réessayez.';el.style.display='block';
  }
}
async function finishLogin(p){
  try{
  CU=p;
  await Promise.all([loadConfig(),loadLabs(),loadEnvois()]);
  var ini=p.nom.split(' ').map(function(x){return x[0]||'';}).slice(0,2).join('').toUpperCase();
  var av=document.getElementById('uav');av.textContent=ini||p.nom[0].toUpperCase();
  av.className='uav'+(p.role==='admin'?' sa':p.role==='superviseur_grappe'?' sg':p.role==='superviseur_labo'?' sl':'');
  var laboName=p.lab?p.lab.name:'Global';
  document.getElementById('uname').textContent=p.nom;
  document.getElementById('ulabo').textContent=laboName+' · '+rl(p.role);
  document.getElementById('lexp').value=laboName;
  var _hLexp=document.getElementById('h-lexp');if(_hLexp)_hLexp.value=laboName;
  document.getElementById('rlabo').textContent=laboName;
  document.getElementById('rpar').value=p.nom;
  document.getElementById('nav-utilisateurs').classList.toggle('gone',!isS());
  document.getElementById('nav-config').classList.toggle('gone',!isAdmin());
  document.getElementById('nav-sep-admin').classList.toggle('gone',!isS());
  document.getElementById('nav-stl-admin').classList.toggle('gone',!isS());
  document.getElementById('cfg-name').value=CFG.name;
  document.getElementById('cfg-sub').value=CFG.subtitle;
  document.getElementById('cfg-alarm-r').value=CFG.alarmR;
  document.getElementById('cfg-alarm-p').value=CFG.alarmP;
  document.getElementById('cfg-print-bordereau').checked=CFG.printBordereau;
  document.getElementById('cfg-msg-login').value=CFG.messages.login;
  document.getElementById('cfg-msg-home').value=CFG.messages.home;
  mdeUpdate('login');mdeUpdate('home');
  var bT=document.getElementById('brd-titre');if(bT)bT.value=CFG.bordereau.titre;
  var bP=document.getElementById('brd-pli');if(bP)bP.value=CFG.bordereau.pli;
  var bC=document.getElementById('brd-canutec');if(bC)bC.value=CFG.bordereau.canutec;
  var bW=document.getElementById('brd-warn-size');if(bW)bW.checked=CFG.bordereau.warnSize!==false;
  renderCfgSpec();renderCfgFormats();renderCfgHsilpFormat();
  var td=new Date(),fd=new Date(td);fd.setDate(fd.getDate()-30);
  document.getElementById('pfrom').value=fd.toISOString().slice(0,10);
  document.getElementById('pto').value=td.toISOString().slice(0,10);
  document.getElementById('hfrom').value=fd.toISOString().slice(0,10);
  document.getElementById('hto').value=td.toISOString().slice(0,10);
  populateSels();updateExpAddr();subscribeRT();
  if(p.theme){document.documentElement.setAttribute('data-theme',p.theme);localStorage.setItem('optilab-theme',p.theme);}
  updateThemeBtn();
  var _panel=sessionStorage.getItem('optilab-panel')||'nouveau';
  if(_panel==='utilisateurs'&&!isS())_panel='nouveau';
  if(_panel==='config'&&!isAdmin())_panel='nouveau';
  spin(false);showScr('app');initHGMode();sp(_panel);initNlistValidation();
  }catch(e){
    console.error('[OPTILAB] finishLogin:',e);
    spin(false);showScr('login');
  }
}
async function doLogout(){
  if(_rtCh){sb.removeChannel(_rtCh);_rtCh=null;}
  await sb.auth.signOut();CU=null;E=[];LABS=[];
  document.getElementById('lid').value='';document.getElementById('lpw').value='';
  document.getElementById('lerr').style.display='none';
  document.getElementById('rresult').style.display='none';
  document.getElementById('rnum').value='';closeGMod();showScr('login');
}

// Temps réel
function subscribeRT(){
  if(_rtCh){sb.removeChannel(_rtCh);_rtCh=null;}
  _rtCh=sb.channel('envois-rt')
    .on('postgres_changes',{event:'*',schema:'public',table:'envois'},async function(){
      await loadEnvois();var a=document.querySelector('.panel.active');if(!a)return;
      if(a.id==='panel-historique'){renderTable();uStats();}
      if(a.id==='panel-resume')renderResume();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'envois_hgrappe'},async function(){
      await loadEnvoisHG();var a=document.querySelector('.panel.active');if(!a)return;
      if(a.id==='panel-hg-confirmations')renderHGConfirmations();
      if(a.id==='panel-hg-historique')renderHGHistorique();
      if(a.id==='panel-hg-resume')renderHGResume();
    })
    .subscribe();
}

// Navigation
function sp(n){
  // Rediriger les anciens panels fusionnés
  if(n==='hsilp')n='nouveau';
  if(n==='hg-hsilp')n='hg-silp';
  // Vérifier que le panel existe (sessionStorage peut contenir une valeur obsolète)
  if(!document.getElementById('panel-'+n))n=HG_MODE?'hg-silp':'nouveau';
  sessionStorage.setItem('optilab-panel',n);
  document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nbtn').forEach(function(b){b.classList.remove('active');});
  document.getElementById('panel-'+n).classList.add('active');
  var navEl=document.getElementById('nav-'+n);if(navEl)navEl.classList.add('active');
  document.getElementById('uchip-btn').classList.toggle('active',n==='moncompte');
  if(n==='historique'){renderTable();uStats();}
  if(n==='resume')renderResume();
  if(n==='utilisateurs')loadUsersAndRender();
  if(n==='config'){renderCfgLabs();renderCfgTemps();renderCfgTrans();renderCfgBadges();renderCfgTheme();renderCfgHgrappe();}
  if(n==='moncompte')renderMonCompte();
  if(n==='hg-silp')initHgSilpForm();
  if(n==='hg-confirmations')renderHGConfirmations();
  if(n==='hg-resume')renderHGResume();
  if(n==='hg-historique')renderHGHistorique();
}

// Sélecteurs
function buildLdestOpts(){
  var opts=document.getElementById('ldest-opts');opts.innerHTML='';
  LABS.forEach(function(l){
    if(CU.labo_id&&l.id===CU.labo_id)return;
    var el=document.createElement('div');el.className='sel-opt';el.textContent=l.name;el.setAttribute('data-id',l.id);
    el.onmousedown=function(e){e.preventDefault();pickLdest(l.id,l.name);};
    opts.appendChild(el);
  });
}
function filterLdest(){
  var q=document.getElementById('ldest-input').value.toLowerCase();
  document.getElementById('ldest').value='';
  document.querySelectorAll('#ldest-opts .sel-opt').forEach(function(el){el.style.display=el.textContent.toLowerCase().includes(q)?'':'none';});
  openLdestDrop();
}
function openLdestDrop(){document.getElementById('ldest-opts').classList.add('open');}
function closeLdestDrop(){document.getElementById('ldest-opts').classList.remove('open');}
function pickLdest(id,name){document.getElementById('ldest').value=id;document.getElementById('ldest-input').value=name;closeLdestDrop();updateDestAddr(id);}
function populateSels(){
  buildLdestOpts();
  var ts=document.getElementById('trans'),ft2=document.getElementById('ftrans');
  ts.innerHTML='<option value="">— Sélectionner —</option>';ft2.innerHTML='<option value="">Tous</option>';
  CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;ts.appendChild(o);var o2=document.createElement('option');o2.value=t;o2.textContent=t;ft2.appendChild(o2);});
  var rs=document.getElementById('rls');rs.innerHTML='';
  if(isG()){rs.classList.remove('gone');LABS.forEach(function(l){var o=document.createElement('option');o.value=l.id;o.textContent=l.name;rs.appendChild(o);});if(CU.labo_id)rs.value=CU.labo_id;}
  else rs.classList.add('gone');
  var ul=document.getElementById('uflabo');ul.innerHTML='<option value="">— Sélectionner —</option>';
  (isG()?LABS:LABS.filter(function(l){return l.id===CU.labo_id;})).forEach(function(l){var o=document.createElement('option');o.value=l.id;o.textContent=l.name;ul.appendChild(o);});
  var tspec=document.getElementById('tspec');
  if(tspec){var prev=tspec.value;tspec.innerHTML='';CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;tspec.appendChild(o);});if(prev&&tspec.querySelector('option[value="'+prev+'"]'))tspec.value=prev;SGSP=tspec.value;}
  renderTempPills();
}
function renderTempPills(){
  var c=document.getElementById('tpills-c');c.innerHTML='';
  CFG.temperatures.forEach(function(t,i){var cls=PCLS[i%PCLS.length];var el=document.createElement('div');el.className='tpill';el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);el.onclick=(function(lbl,pc){return function(){sTemp(lbl,pc);};})(t.label,cls);c.appendChild(el);});ST='';
}
function sTemp(lbl,pc){
  ST=lbl;SGSC=false;
  document.querySelectorAll('.tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=CFG.temperatures.find(function(t){return t.label===lbl;});
  var gs=document.getElementById('glace-section');
  if(gs){
    if(tCfg&&tCfg.ask_glace){gs.style.display='';var expLab=CU&&LABS.find(function(l){return l.id===CU.labo_id;});var defRef=expLab&&expLab.default_refrigerant;if(defRef==='glace_seche'){SGSC=true;setGlace(true);}else if(defRef==='sachet'){SGSC=false;setGlace(false);}else{SGSC=null;}}
    else{gs.style.display='none';SGSC=false;}
  }
}
function setGlace(val){
  SGSC=val;
  var btnO=document.getElementById('btn-glace-oui'),btnN=document.getElementById('btn-glace-non');
  if(btnO)btnO.style.outline=val?'2px solid var(--brand-azure-deep)':'';
  if(btnN)btnN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}
function tDept(d){var ix=SD.indexOf(d);if(ix===-1)SD.push(d);else SD.splice(ix,1);var cm={BIOCHIMIE:'dp-bio',HEMATOLOGIE:'dp-hema',MICROBIOLOGIE:'dp-micro',PATHOLOGIE:'dp-patho'};DEPTS.forEach(function(x){var el=document.getElementById('dp-'+x.id);el.className='dpill '+cm[x.id]+(SD.indexOf(x.id)!==-1?' on':'');});}
function fmtLabAddr(lab){if(!lab)return'';var parts=[];if(lab.adresse)parts.push(lab.adresse);if(lab.ville||lab.code_postal)parts.push([lab.ville,lab.code_postal].filter(Boolean).join(' '));if(lab.telephone)parts.push(lab.telephone);return parts.join(' · ');}
function updateExpAddr(){var el=document.getElementById('lexp-addr');if(!el)return;var expLab=LABS.find(function(l){return l.id===CU.labo_id;})||{};el.textContent=fmtLabAddr(expLab);}
function updateDestAddr(labId){var el=document.getElementById('ldest-addr');if(!el)return;if(!labId){el.textContent='';return;}var lab=LABS.find(function(l){return l.id===labId;})||{};el.textContent=fmtLabAddr(lab);}

// Créer envoi
async function saveEnvoi(){
  var smsg=document.getElementById('smsg');if(smsg)smsg.style.display='';
  // Cas "pas de liste SILP" : le modal a déjà été confirmé au coche, on sauvegarde directement
  if(SILP_NO_LIST){
    var destId0=document.getElementById('ldest').value,tr0=document.getElementById('trans').value;
    if(!destId0){ban('serr','Veuillez sélectionner un laboratoire destinataire.','e');return;}
    if(!ST){ban('serr','Veuillez sélectionner une température d\'envoi.','e');return;}
    var tCfg0=CFG.temperatures.find(function(t){return t.label===ST;});
    if(tCfg0&&tCfg0.ask_glace&&SGSC===null){ban('serr','Veuillez sélectionner le type de réfrigérant (glace sèche ou sachet).','e');return;}
    if(!tr0){ban('serr','Veuillez sélectionner un transporteur.','e');return;}
    if(!SD.length){ban('serr','Veuillez sélectionner au moins un département.','e');return;}
    await _doSaveEnvoiHsilp();
    return;
  }
  var destId=document.getElementById('ldest').value,tr=document.getElementById('trans').value,num=document.getElementById('nlist').value.trim();
  if(!destId){ban('serr','Veuillez sélectionner un laboratoire destinataire.','e');return;}
  if(!ST){ban('serr','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=CFG.temperatures.find(function(t){return t.label===ST;});
  if(tCfg&&tCfg.ask_glace&&SGSC===null){ban('serr','Veuillez sélectionner le type de réfrigérant (glace sèche ou sachet).','e');return;}
  if(!tr){ban('serr','Veuillez sélectionner un transporteur.','e');return;}
  if(!SD.length){ban('serr','Veuillez sélectionner au moins un département.','e');return;}
  if(!num){ban('serr','Le numéro de liste de repérage est obligatoire.','e');return;}
  if(!/^\d+$/.test(num)){ban('serr','Le numéro de liste de repérage doit contenir uniquement des chiffres.','e');return;}
  if(E.find(function(e){return e.numero===num;})){ban('serr','Ce numéro de liste de repérage correspond déjà à un envoi.','e');return;}
  var tubes=parseInt(document.getElementById('ntub').value)||null;
  var specEl=document.getElementById('tspec');var spec=specEl?specEl.value:'exempt';
  var r=await sb.from('envois').insert({numero_liste:num,exp_labo_id:CU.labo_id,dest_labo_id:destId,temperature:ST,transporteur:tr,nb_echantillons:tubes,departements:SD.slice(),statut:'En transit',notes:document.getElementById('notes').value,cree_par_id:CU.id,cree_par_nom:CU.nom,ts_envoi:new Date().toISOString(),type_specimen:spec,glace_seche:SGSC===true});
  if(r.error){ban('serr','Erreur : '+r.error.message,'e');return;}
  var destLab=LABS.find(function(l){return l.id===destId;})||{};
  var expLab=LABS.find(function(l){return l.id===CU.labo_id;})||{};
  var _saved={numero:num,exp:CU.lab?CU.lab.name:'—',dest:destLab.name||'—',temp:ST,transporteur:tr,tubes:tubes,depts:SD.slice(),notes:document.getElementById('notes').value.trim(),creePar:CU.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:SGSC===true,expAdresse:expLab.adresse||'',expAdresse2:expLab.adresse2||'',expVille:expLab.ville||'',expProvince:expLab.province||'',expCodePostal:expLab.code_postal||'',expPays:expLab.pays||'',expTel:expLab.telephone||'',destAdresse:destLab.adresse||'',destAdresse2:destLab.adresse2||'',destVille:destLab.ville||'',destProvince:destLab.province||'',destCodePostal:destLab.code_postal||'',destPays:destLab.pays||'',destTel:destLab.telephone||''};
  _printData=_saved;
  resetForm();
  showSuccessModal(num);
}
async function _doSaveEnvoiHsilp(){
  var destId=document.getElementById('ldest').value,tr=document.getElementById('trans').value;
  var tubes=parseInt(document.getElementById('ntub').value)||null;
  var specEl=document.getElementById('tspec');var spec=specEl?specEl.value:'exempt';
  var r=await sb.rpc('create_envoi_hsilp',{
    p_exp_labo_id:CU.labo_id,p_dest_labo_id:destId,
    p_temperature:ST,p_transporteur:tr,p_nb_echantillons:tubes,
    p_departements:SD.slice(),p_notes:document.getElementById('notes').value,
    p_cree_par_id:CU.id,p_cree_par_nom:CU.nom,
    p_type_specimen:spec,p_glace_seche:SGSC===true
  });
  if(r.error){ban('serr','Erreur : '+r.error.message,'e');return;}
  var num=r.data;
  var destLab=LABS.find(function(l){return l.id===destId;})||{};
  var expLab=LABS.find(function(l){return l.id===CU.labo_id;})||{};
  _printData={numero:num,exp:CU.lab?CU.lab.name:'—',dest:destLab.name||'—',
    temp:ST,transporteur:tr,tubes:tubes,depts:SD.slice(),
    notes:document.getElementById('notes').value.trim(),creePar:CU.nom,
    tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:SGSC===true,
    expAdresse:expLab.adresse||'',expAdresse2:expLab.adresse2||'',expVille:expLab.ville||'',expProvince:expLab.province||'',expCodePostal:expLab.code_postal||'',expPays:expLab.pays||'',expTel:expLab.telephone||'',
    destAdresse:destLab.adresse||'',destAdresse2:destLab.adresse2||'',destVille:destLab.ville||'',destProvince:destLab.province||'',destCodePostal:destLab.code_postal||'',destPays:destLab.pays||'',destTel:destLab.telephone||''};
  resetForm();
  showSuccessModalHsilp(num);
}
var _printData=null;
function printBordereauFromEnvoi(id){
  var e=E.find(function(x){return x.id===id;});if(!e)return;
  _printData={numero:e.numero,exp:e.exp,dest:e.dest,temp:e.temp,transporteur:e.transporteur,tubes:e.tubes,depts:e.depts||[],notes:e.notes||'',creePar:e.creePar||'',tsEnvoi:e.tsEnvoi,typeSpecimen:e.typeSpecimen||'exempt',glaceSeche:e.glaceSeche||false,expAdresse:e.expAdresse||'',expAdresse2:e.expAdresse2||'',expVille:e.expVille||'',expProvince:e.expProvince||'',expCodePostal:e.expCodePostal||'',expPays:e.expPays||'',expTel:e.expTel||'',destAdresse:e.destAdresse||'',destAdresse2:e.destAdresse2||'',destVille:e.destVille||'',destProvince:e.destProvince||'',destCodePostal:e.destCodePostal||'',destPays:e.destPays||'',destTel:e.destTel||''};
  var fmt=e.numero&&e.numero.indexOf('HSILP')===0?CFG.hsilpBordereauFormat||'bordereau':undefined;
  printBordereau(fmt);
}
async function reprintHGDocsFromEnvoi(id){
  var e=EHG.find(function(x){return x.id===id;});if(!e)return;
  var dl=e.destLab||null;
  var destDispName=dl?(dl.parent?(dl.parent.name+'\n'+dl.name):(dl.name||e.dest)):(e.dest||'—');
  _hgPrintData={
    numero:e.numero,token:e.confirmToken,source:e.source,
    exp:e.exp,dest:destDispName,destLab:dl,temp:e.temp,transporteur:e.transporteur,tubes:e.tubes,
    numerosSilp:e.numerosSilp||[],notes:e.notes||'',creePar:e.creePar||'',
    tsEnvoi:e.tsEnvoi,typeSpecimen:e.typeSpecimen||'exempt',glaceSeche:e.glaceSeche||false,
    expLab:e.expLab||{}
  };
  closeGMod();
  await printHGDocs();
}
function printBordereau(overrideFormat,returnHtml){
  var d=_printData;if(!d)return returnHtml?'':undefined;
  function xe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // Barcode
  var tmpSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  tmpSvg.id='_bc_tmp_brd';tmpSvg.style.display='none';document.body.appendChild(tmpSvg);
  try{JsBarcode('#_bc_tmp_brd',d.numero,{format:'CODE128',width:2,height:55,displayValue:true,fontSize:12,margin:6});}catch(ex){}
  var barcodeSvg=tmpSvg.outerHTML;document.body.removeChild(tmpSvg);

  var date=d.tsEnvoi?new Date(d.tsEnvoi).toLocaleString('fr-CA',{dateStyle:'long',timeStyle:'short'}):'—';
  var tCfg=CFG.temperatures.find(function(t){return t.label===d.temp;})||{};
  var hasDryIce=d.glaceSeche===true&&!!tCfg.ask_glace;
  // Lookup specimen type from config
  var stCfg=CFG.bordereau.specTypes.find(function(t){return t.id===d.typeSpecimen;})||CFG.bordereau.specTypes[0]||{id:d.typeSpecimen,label:d.typeSpecimen,shape:'box',isDgr:false};
  var isDgr=!!stCfg.isDgr;

  // Détection du format actif (overrideFormat pour Hors SILP)
  var fmt=overrideFormat||CFG.bordereau.activeFormat||'folded';

  // Label size — plus grand dans le format pochette (colonne dédiée de 96mm)
  var isSpecDiamond=stCfg.shape==='diamond';
  // specLabel est toujours affiché (boîte ou losange) — compte comme 1 picto au même titre qu'un losange
  var labN=1+(hasDryIce?1:0);
  var labMm=fmt==='pochette'?(labN>=2?45:80):fmt==='grille'?(labN>=2?38:43):(labN>=2?50:62);
  var labSz=labMm+'mm';
  var sizeOk=labMm>=100;

  // Temperature mention
  var tempMention=tCfg.ask_glace?(d.glaceSeche?(tCfg.mention_glace_oui||'Congelé : Glace sèche comme réfrigérant'):(tCfg.mention_glace_non||'Congelé : Sachet réfrigérant')):(tCfg.mention||d.temp);

  var specLabel=mkSpecLabel(stCfg,labSz,fmt==='grille'&&!stCfg.isDgr&&!hasDryIce);
  var dryIceLabel=hasDryIce?mkDryIceLabel(labSz):'';

  // Temperature box — taille de texte adaptée à la longueur de la mention
  var tc=d.temp.indexOf('Frigo')!==-1?'#1B6E94':d.temp.indexOf('Congelé')!==-1?'#1C3A52':'#222';
  var tRange=(d.temp.match(/\(([^)]+)\)/)||[])[1]||'';
  var tLen=tempMention.length;
  var tFs=tLen<=12?'26pt':tLen<=20?'22pt':tLen<=32?'17pt':'13pt';
  var tempBox='<div style="flex:1;border:3px solid '+tc+';padding:5mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box">'
    +'<div style="font-size:'+tFs+';font-weight:900;color:'+tc+';line-height:1.25">'+xe(tempMention)+'</div>'
    +(tRange?'<div style="font-size:10pt;color:'+tc+';margin-top:2mm;opacity:.75">'+xe(tRange)+'</div>':'')
    +(hasDryIce?'<div style="font-size:7.5pt;color:#666;margin-top:3mm;border-top:.5px solid #ccc;padding-top:2mm;width:100%">CARBON DIOXIDE, SOLID — UN 1845 — Classe 9</div>':'')
    +'</div>';

  // align-items:center centre verticalement la boîte temp avec le pictogramme
  var regRow='<div style="display:flex;gap:4mm;align-items:center;flex-shrink:1;min-height:0">'
    +specLabel+dryIceLabel+tempBox+'</div>';

  // CANUTEC (required for Cat A; good practice for Cat B)
  var canutec=isDgr
    ?'<div style="margin-top:2.5mm;padding:1.5mm 3mm;background:#FFF8E1;border:1px solid #F5C518;border-radius:1mm;font-family:Arial,Helvetica,sans-serif;font-size:8pt;display:flex;align-items:center;justify-content:center;gap:2mm;flex-shrink:0">'
      +'<span style="font-weight:700">Urgences 24h / Emergency 24h&nbsp;:</span>'
      +'<span style="font-weight:900;font-size:10pt;color:#B8860B">CANUTEC '+xe(CFG.bordereau.canutec)+'</span>'
      +'</div>'
    :'';

  // Warning — only when labels are smaller than the regulatory 100mm minimum
  var warn=((isDgr||hasDryIce)&&labN>0&&!sizeOk&&CFG.bordereau.warnSize!==false)
    ?'<div style="margin-top:1.5mm;font-size:6.5pt;color:#AA0000;font-style:italic;line-height:1.4;font-family:Arial,Helvetica,sans-serif;flex-shrink:0">'
      +'&#9888; Pictogrammes affich&#233;s &#224; '+labMm+'mm (taille r&#233;glementaire&nbsp;: 100mm). Si n&#233;cessaire, apposer les &#233;tiquettes homologu&#233;es 100&#215;100mm (RTMD/IATA) sur l\'emballage ext&#233;rieur.'
      +'</div>'
    :'';

  // Departments
  var DLIST=[{id:'BIOCHIMIE',lbl:'Biochimie'},{id:'HEMATOLOGIE',lbl:'H&#233;matologie / BDS'},{id:'MICROBIOLOGIE',lbl:'Microbiologie / S&#233;ro'},{id:'PATHOLOGIE',lbl:'Pathologie / Cyto'}];
  var dpts=d.depts||[];
  var deptsHtml=DLIST.map(function(dep){
    var on=dpts.indexOf(dep.id)!==-1;
    var cs='display:inline-flex;align-items:center;justify-content:center;width:4.5mm;height:4.5mm;border:1.5px solid #333;border-radius:.5mm;font-size:9pt;font-weight:900;flex-shrink:0;'+(on?'background:#1C3A52;color:white;border-color:#1C3A52;':'');
    return '<div style="display:flex;align-items:center;gap:2.5mm;padding:1.5mm 0;border-bottom:.3px solid #eee;font-size:10pt;font-family:Arial,Helvetica,sans-serif"><div style="'+cs+'">'+(on?'&#x2713;':'')+'</div><span>'+dep.lbl+'</span></div>';
  }).join('');
  deptsHtml='<div style="display:flex;align-items:center;gap:2.5mm;padding:2mm 0;margin-bottom:1mm;border-bottom:1px solid #bbb;font-size:10pt;font-weight:700;font-family:Arial,Helvetica,sans-serif"><div style="width:4.5mm;height:4.5mm;border:1.5px solid #333;border-radius:.5mm;flex-shrink:0"></div><span>Analyses STAT</span></div>'+deptsHtml;

  // Addresses
  function mkAddr(a,v,cp,tel,a2,prov,pays){var l=[];if(a)l.push(xe(a));if(a2)l.push(xe(a2));if(v){var pr=prov!==undefined?prov:'Qc';l.push(xe(v)+(pr&&cp?' ('+xe(pr)+') '+xe(cp):pr?' ('+xe(pr)+')':cp?' '+xe(cp):''));}else if(cp){l.push(xe(cp));}if(pays)l.push(xe(pays));if(tel)l.push('T&#233;l.&nbsp;: '+xe(tel));return l.join('<br>');}
  var destAddr=mkAddr(d.destAdresse,d.destVille,d.destCodePostal,d.destTel,d.destAdresse2,d.destProvince,d.destPays);
  var _ePrv=d.expProvince||'Qc';
  var expAddrLine=[xe(d.expAdresse||''),d.expAdresse2?xe(d.expAdresse2):'',xe(d.expVille||'')+(d.expVille?' ('+xe(_ePrv)+')'+(d.expCodePostal?' '+xe(d.expCodePostal):''):''),d.expPays?xe(d.expPays):'',d.expTel?xe(d.expTel):''].filter(Boolean).join(' &#183; ');

  // Info table (bottom half)
  var depStr=dpts.map(function(x){return x.charAt(0)+x.slice(1).toLowerCase();}).join(', ')||'&#8212;';
  var rows=[
    ['Exp&#233;diteur',xe(d.exp)],
    ['Destinataire',xe(d.dest).replace(/\n/g,'<br>')],
    ['Date d\'envoi',xe(date)],
    ['Temp&#233;rature',xe(d.temp)],
    ['Type de sp&#233;cimen',xe(stCfg.label||d.typeSpecimen)],
    hasDryIce?['R&#233;frig&#233;rant','Glace s&#232;che (UN 1845)']:(tCfg.ask_glace?['R&#233;frig&#233;rant','Sachet r&#233;frig&#233;rant']:null),
    ['Transporteur',xe(d.transporteur)],
    ['D&#233;partement(s)',depStr],
    ['&#201;chantillons',d.tubes||'&#8212;'],
    ['Cr&#233;&#233; par',xe(d.creePar)],
    isDgr?['Urgence 24h','CANUTEC &#8212; '+xe(CFG.bordereau.canutec)]:null,
  ].filter(Boolean).map(function(r){return'<tr><th>'+r[0]+'</th><td>'+r[1]+'</td></tr>';}).join('');
  var notesRow=d.notes?'<tr><th>Notes</th><td style="white-space:pre-wrap">'+xe(d.notes)+'</td></tr>':'';

  // Dispatch selon le format actif
  var html, ifrW='215.9mm', ifrH='279.4mm';
  if(fmt==='grille'){
    html=brdHtmlGrille(d,xe,date,barcodeSvg,rows,notesRow,specLabel,dryIceLabel,hasDryIce,tempMention,tRange,tc,isDgr,labMm,sizeOk,expAddrLine,destAddr);
  }else if(fmt==='pochette'){
    html=brdHtmlPochette(d,xe,date,barcodeSvg,rows,notesRow,specLabel,dryIceLabel,hasDryIce,tempMention,tRange,tc,isDgr,labMm,sizeOk,expAddrLine,destAddr);
  }else if(fmt==='bordereau'){
    html=brdHtmlBordereauSeul(xe,date,d.numero,barcodeSvg,rows,notesRow);
  }else if(fmt==='etiquette'){
    ifrH='160mm';
    html=brdHtmlEtiquetteSeule(d,xe,regRow,canutec,warn,deptsHtml,destAddr,expAddrLine);
  }else{
    html=brdHtmlFolded(d,xe,date,barcodeSvg,rows,notesRow,regRow,canutec,warn,deptsHtml,destAddr,expAddrLine);
  }
  if(returnHtml)return html;
  var ifr=document.createElement('iframe');
  ifr.style.cssText='position:fixed;top:-9999px;left:-9999px;width:'+ifrW+';height:'+ifrH+';border:none';
  document.body.appendChild(ifr);
  ifr.contentDocument.open();ifr.contentDocument.write(html);ifr.contentDocument.close();
  ifr.contentWindow.focus();
  setTimeout(function(){ifr.contentWindow.print();setTimeout(function(){document.body.removeChild(ifr);},500);},300);
}

// ── PICTO BUILDERS ───────────────────────────────────────────────────────────
// Pure SVG — viewBox fixe, taille CSS width/height → scale parfait à toute taille
var _AF="Arial,Helvetica,sans-serif";
var _SYM="'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols2',sans-serif";

function mkSpecLabel(st,sz,wide){
  var l1=st.line1||'',l2=st.line2||'';

  if(st.shape==='diamond'){
    var base='<svg style="display:block;width:'+sz+';height:'+sz+';max-width:100%;flex-shrink:0" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'
      +'<polygon points="100,5 195,100 100,195 5,100" fill="white" stroke="black" stroke-width="7"/>';

    if(st.icon==='biohazard'){
      return base
        +'<text x="100" y="86" text-anchor="middle" font-family="'+_SYM+'" font-size="52" fill="black">&#x2623;</text>'
        +(l1?'<text x="100" y="113" text-anchor="middle" font-family="'+_AF+'" font-size="11" font-weight="bold" fill="black">'+esc(l1)+'</text>':'')
        +(st.line1_fr?'<text x="100" y="127" text-anchor="middle" font-family="'+_AF+'" font-size="8.5" fill="#555">'+esc(st.line1_fr)+'</text>':'')
        +(st.un?'<text x="100" y="149" text-anchor="middle" font-family="'+_AF+'" font-size="15" font-weight="900" fill="black">'+esc(st.un)+'</text>':'')
        +(st.classe?'<text x="100" y="181" text-anchor="middle" font-family="'+_AF+'" font-size="13" font-weight="900" fill="black">'+esc(st.classe)+'</text>':'')
        +'</svg>';
    }

    return base
      +(l1?'<text x="100" y="82" text-anchor="middle" font-family="'+_AF+'" font-size="13" font-weight="bold" fill="black" textLength="138" lengthAdjust="spacingAndGlyphs">'+esc(l1)+'</text>':'')
      +(l2?'<text x="100" y="97" text-anchor="middle" font-family="'+_AF+'" font-size="13" font-weight="bold" fill="black">'+esc(l2)+'</text>':'')
      +(st.line1_fr?'<text x="100" y="114" text-anchor="middle" font-family="'+_AF+'" font-size="9.5" fill="#555" textLength="140" lengthAdjust="spacingAndGlyphs">'+esc(st.line1_fr)+'</text>':'')
      +(st.line2_fr?'<text x="100" y="127" text-anchor="middle" font-family="'+_AF+'" font-size="9.5" fill="#555">'+esc(st.line2_fr)+'</text>':'')
      +(st.un?'<text x="100" y="150" text-anchor="middle" font-family="'+_AF+'" font-size="17" font-weight="900" fill="black">'+esc(st.un)+'</text>':'')
      +(st.classe?'<text x="100" y="182" text-anchor="middle" font-family="'+_AF+'" font-size="13" font-weight="900" fill="black">'+esc(st.classe)+'</text>':'')
      +'</svg>';
  }

  // Box — exempté ou personnalisé
  var full=(l1+(l2?' '+l2:'')).trim();
  var words=full.split(' ');
  var split=full.length>16&&words.length>=2;
  var mid=Math.ceil(words.length/2);
  var tl1=split?words.slice(0,mid).join(' '):full;
  var tl2=split?words.slice(mid).join(' '):'';
  var maxLen=Math.max(tl1.length,tl2.length||0);
  var bFs=Math.min(26,Math.floor(170/(maxLen*0.72)));
  var tlB=function(t){return' textLength="'+Math.min(Math.round(t.length*bFs*0.72),168)+'" lengthAdjust="spacingAndGlyphs"';};

  if(wide){
    var wFs=Math.min(28,Math.floor(360/(full.length*0.75)));
    var wTL=Math.min(Math.round(full.length*wFs*0.72),360);
    return '<svg style="display:block;width:100%;flex-shrink:0" viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">'
      +'<rect x="4" y="4" width="392" height="72" fill="white" stroke="black" stroke-width="5"/>'
      +(full?'<text x="200" y="36" text-anchor="middle" font-family="'+_AF+'" font-size="'+wFs+'" font-weight="900" fill="black" textLength="'+wTL+'" lengthAdjust="spacingAndGlyphs">'+esc(full)+'</text>':'')
      +(st.subtitle?'<text x="200" y="54" text-anchor="middle" font-family="'+_AF+'" font-size="14" font-style="italic" fill="#444">'+esc(st.subtitle)+'</text>':'')
      +(st.note?'<line x1="80" y1="62" x2="320" y2="62" stroke="#ccc" stroke-width="1"/>':'')
      +(st.note?'<text x="200" y="73" text-anchor="middle" font-family="'+_AF+'" font-size="10" fill="#888">'+esc(st.note)+'</text>':'')
      +'</svg>';
  }

  var y1=split?70:84;var y2=split?y1+bFs+4:0;
  var ySub=(split?y2:y1)+20;var yLine=ySub+14;var yNote=yLine+18;
  return '<svg style="display:block;width:'+sz+';height:'+sz+';max-width:100%;flex-shrink:0" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'
    +'<rect x="4" y="4" width="192" height="192" fill="white" stroke="black" stroke-width="7"/>'
    +(tl1?'<text x="100" y="'+y1+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+bFs+'" font-weight="900" fill="black"'+tlB(tl1)+'>'+esc(tl1)+'</text>':'')
    +(tl2?'<text x="100" y="'+y2+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+bFs+'" font-weight="900" fill="black"'+tlB(tl2)+'>'+esc(tl2)+'</text>':'')
    +(st.subtitle?'<text x="100" y="'+ySub+'" text-anchor="middle" font-family="'+_AF+'" font-size="13" font-style="italic" fill="#444">'+esc(st.subtitle)+'</text>':'')
    +(st.note?'<line x1="30" y1="'+yLine+'" x2="170" y2="'+yLine+'" stroke="#ccc" stroke-width="1"/>':'')
    +(st.note?'<text x="100" y="'+yNote+'" text-anchor="middle" font-family="'+_AF+'" font-size="11" fill="#888">'+esc(st.note)+'</text>':'')
    +'</svg>';
}

function mkDryIceLabel(sz){
  return '<svg style="display:block;width:'+sz+';height:'+sz+';max-width:100%;flex-shrink:0" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'
    +'<clipPath id="bcp"><polygon points="100,5 195,100 5,100"/></clipPath>'
    +'<polygon points="100,5 195,100 100,195 5,100" fill="white" stroke="black" stroke-width="6"/>'
    +'<g clip-path="url(#bcp)">'
      +'<rect x="0" y="0" width="200" height="100" fill="white"/>'
      +'<rect x="18" y="0" width="27" height="100" fill="black"/>'
      +'<rect x="72" y="0" width="27" height="100" fill="black"/>'
      +'<rect x="126" y="0" width="27" height="100" fill="black"/>'
      +'<rect x="180" y="0" width="20" height="100" fill="black"/>'
    +'</g>'
    +'<polygon points="100,5 195,100 100,195 5,100" fill="none" stroke="black" stroke-width="6"/>'
    +'<text x="100" y="152" text-anchor="middle" font-family="'+_AF+'" font-size="42" font-weight="900" fill="black">9</text>'
    +'<text x="100" y="166" text-anchor="middle" font-family="'+_AF+'" font-size="9" fill="black">UN 1845</text>'
    +'</svg>';
}

// ── RENDERERS DE FORMAT ───────────────────────────────────────────────────────
var _brdPrint='@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
var _brdTable='table{width:100%;border-collapse:collapse}'
  +'th{text-align:left;font-weight:600;color:#555;padding:2px 8px 2px 0;width:110px;vertical-align:top;font-size:9pt}'
  +'td{padding:2px 0;border-bottom:.5px solid #eee;font-size:10pt}';
function _brdHead(num,xe){return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Bordereau &#8212; '+xe(num)+'</title><style>';}

// Affichage du nom de destination sur l'étiquette : parent (gros) + enfant (plus petit) si présent
// d.dest contient '\n' quand un sous-labo HG est sélectionné
function fmtDestLabel(dest, xe){
  var parts=(dest||'').split('\n');
  if(parts.length<2)return xe(dest||'—');
  return '<span style="display:block">'+xe(parts[0])+'</span>'
        +'<span style="display:block;font-size:.68em;font-weight:600;opacity:.72;margin-top:.8mm;letter-spacing:.01em">'+xe(parts[1])+'</span>';
}

// Format 1 — Lettre pliée (défaut) : étiquette haut + bordereau bas
function brdHtmlFolded(d,xe,date,barcodeSvg,rows,notesRow,regRow,canutec,warn,deptsHtml,destAddr,expAddrLine){
  var _hgt=d.isHG&&!!d.destLabelText;
  var _hgBox='<div id="hg-dept-box" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4mm"><div id="hg-dept-txt" style="font-weight:900;color:#1C3A52;text-align:center;word-break:normal;line-height:1.3;hyphens:none;overflow-wrap:normal;max-width:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div>';
  var _hgScript=_hgt?'<script>(function(){var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");if(!b||!t)return;function f(){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}setTimeout(f,50);})();<\/script>':'';
  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:8mm}'
    +'html,body{height:100%;width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column}'
    +'.etiq{height:50%;flex-shrink:0;padding:6mm 9mm 3mm 9mm;display:flex;flex-direction:column;overflow:visible}'
    +'.abot{margin-top:auto}.sep{border:none;border-top:.8px solid #bbb;margin:2.5mm 0;flex-shrink:0}'
    +'.ar{display:flex;gap:5mm;align-items:stretch;max-height:72mm;overflow:hidden}'
    +'.db{flex:1;border:2px solid #222;border-radius:1.5mm;padding:3mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.dc{width:58mm;flex:none;border:1px solid #ddd;border-radius:1.5mm;padding:3mm;overflow:hidden}'
    +'.fold{flex-shrink:0;height:0;border-top:2px dashed #777;position:relative}'
    +'.flbl{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:white;padding:0 3mm;font-size:7pt;color:#999;white-space:nowrap}'
    +'.bord{flex:1;padding:7mm 9mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.bh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1C3A52;padding-bottom:2.5mm;margin-bottom:3mm;flex-shrink:0}'
    +'.bt2{font-size:15pt;font-weight:700;color:#1C3A52}.bd{font-size:9pt;color:#666}'
    +'.bc{text-align:center;margin-bottom:2.5mm;flex-shrink:0}.bc svg{max-width:180px}'
    +_brdTable+_brdPrint
    +'</style></head><body>'
    +'<div class="etiq">'
      +regRow+canutec+warn
      +'<div class="abot"><hr class="sep">'
        +'<div class="ar">'
          +'<div class="db">'
            +'<div id="fld-dname" style="font-size:15pt;font-weight:700;text-transform:uppercase;line-height:1.2;margin-bottom:2mm;font-family:Arial,Helvetica,sans-serif">'+fmtDestLabel(d.dest,xe)+'</div>'
            +'<div id="fld-daddr" style="font-size:12pt;line-height:1.55;color:#222;font-family:Arial,Helvetica,sans-serif">'+destAddr+'</div>'
          +'</div>'
          +(_hgt?'<div class="dc" style="display:flex;flex-direction:column">'+_hgBox+'</div>':'<div class="dc"><div style="font-size:7pt;font-weight:700;text-transform:uppercase;color:#aaa;letter-spacing:.05em;margin-bottom:2mm;font-family:Arial,Helvetica,sans-serif">D&#233;partement(s)</div>'+deptsHtml+'</div>')
        +'</div>'
        +'<div style="margin-top:3mm;padding-top:2mm;border-top:.5px solid #ccc;font-size:7.5pt;color:#666;font-family:Arial,Helvetica,sans-serif">'
          +'<div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:.5mm">Exp&#233;diteur</div>'
          +'<div>'+xe(d.exp)+(expAddrLine?' &#8212; '+expAddrLine:'')+'</div>'
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div class="fold"><span class="flbl">'+xe(CFG.bordereau.pli)+'</span></div>'
    +'<div class="bord">'
      +'<div class="bh"><div class="bt2">'+xe(CFG.bordereau.titre)+'</div><div class="bd">'+xe(date)+'</div></div>'
      +'<div class="bc">'+barcodeSvg+'</div>'
      +'<table><tbody>'+rows+notesRow+'</tbody></table>'
    +'</div>'
    +'<script>(function(){setTimeout(function(){'
    +'var dn=document.getElementById("fld-dname"),da=document.getElementById("fld-daddr"),dc=dn&&dn.closest(".db");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.9;for(var ns=15;ns>=8;ns--){var as=Math.max(7,Math.round(ns*0.8));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    +'var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");'
    +'if(b&&t){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}'
    +'},50);})()</scr'+'ipt>'
    +'</body></html>';
}

// Format 2 — Bordereau seul (Lettre portrait) : code-barres + tableau, sans étiquette
function brdHtmlBordereauSeul(xe,date,numero,barcodeSvg,rows,notesRow){
  return _brdHead(numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:14mm 16mm}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111}'
    +'.bh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #1C3A52;padding-bottom:3.5mm;margin-bottom:7mm}'
    +'.bt2{font-size:18pt;font-weight:700;color:#1C3A52}.bd{font-size:10pt;color:#666}'
    +'.bc{text-align:center;margin-bottom:7mm}.bc svg{max-width:240px}'
    +'th{text-align:left;font-weight:600;color:#555;padding:3.5px 10px 3.5px 0;width:140px;vertical-align:top;font-size:10pt}'
    +'td{padding:3.5px 0;border-bottom:.5px solid #eee;font-size:11pt}'
    +'table{width:100%;border-collapse:collapse}'
    +_brdPrint
    +'</style></head><body>'
    +'<div class="bh"><div class="bt2">'+xe(CFG.bordereau.titre)+'</div><div class="bd">'+xe(date)+'</div></div>'
    +'<div class="bc">'+barcodeSvg+'</div>'
    +'<table><tbody>'+rows+notesRow+'</tbody></table>'
    +'</body></html>';
}

// Format 3 — Étiquette seule (demi-lettre) : pictos + adresses + départements
function brdHtmlEtiquetteSeule(d,xe,regRow,canutec,warn,deptsHtml,destAddr,expAddrLine){
  var _hgt=d.isHG&&!!d.destLabelText;
  var _hgBox='<div id="hg-dept-box" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4mm"><div id="hg-dept-txt" style="font-weight:900;color:#1C3A52;text-align:center;word-break:normal;line-height:1.3;hyphens:none;overflow-wrap:normal;max-width:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div>';
  var _hgScript=_hgt?'<script>(function(){var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");if(!b||!t)return;function f(){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}setTimeout(f,50);})();<\/script>':'';
  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:8mm}'
    +'html,body{width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111}'
    +'.etiq{padding:6mm 9mm 4mm 9mm;display:flex;flex-direction:column}'
    +'.sep{border:none;border-top:.8px solid #bbb;margin:2.5mm 0}'
    +'.ar{display:flex;gap:5mm;align-items:stretch;max-height:72mm;overflow:hidden}'
    +'.db{flex:1;border:2px solid #222;border-radius:1.5mm;padding:3mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.dc{width:58mm;flex:none;border:1px solid #ddd;border-radius:1.5mm;padding:3mm;overflow:hidden}'
    +_brdPrint
    +'</style></head><body>'
    +'<div class="etiq">'
      +regRow+canutec+warn
      +'<div style="margin-top:auto"><hr class="sep">'
        +'<div class="ar">'
          +'<div class="db">'
            +'<div id="etq-dname" style="font-size:15pt;font-weight:700;text-transform:uppercase;line-height:1.2;margin-bottom:2mm">'+fmtDestLabel(d.dest,xe)+'</div>'
            +'<div id="etq-daddr" style="font-size:12pt;line-height:1.55;color:#222">'+destAddr+'</div>'
          +'</div>'
          +(_hgt?'<div class="dc" style="display:flex;flex-direction:column">'+_hgBox+'</div>':'<div class="dc"><div style="font-size:7pt;font-weight:700;text-transform:uppercase;color:#aaa;letter-spacing:.05em;margin-bottom:2mm">D&#233;partement(s)</div>'+deptsHtml+'</div>')
        +'</div>'
        +'<div style="margin-top:3mm;padding-top:2mm;border-top:.5px solid #ccc;font-size:7.5pt;color:#666">'
          +'<div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aaa;margin-bottom:.5mm">Exp&#233;diteur</div>'
          +'<div>'+xe(d.exp)+(expAddrLine?' &#8212; '+expAddrLine:'')+'</div>'
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div style="border-top:1.5px dashed #ccc;margin:0 9mm;padding-top:2mm;font-size:7pt;color:#bbb;text-align:center">&#9988; D&#233;couper ici</div>'
    +'<script>(function(){setTimeout(function(){'
    +'var dn=document.getElementById("etq-dname"),da=document.getElementById("etq-daddr"),dc=dn&&dn.closest(".db");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.9;for(var ns=15;ns>=8;ns--){var as=Math.max(7,Math.round(ns*0.8));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    +'var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");'
    +'if(b&&t){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}'
    +'},50);})()</scr'+'ipt>'
    +'</body></html>';
}

// Format 4 — Pochette colis (Lettre pliée, optimisé visibilité externe)
// Colonne gauche : dest (prominent) + expéditeur | Colonne droite : pictos + temp
// Bande depts/STAT en pied | Pli au milieu | Bordereau scannable caché en bas
function brdHtmlPochette(d,xe,date,barcodeSvg,rows,notesRow,specLabel,dryIceLabel,hasDryIce,tempMention,tRange,tc,isDgr,labMm,sizeOk,expAddrLine,destAddr){
  var _hgt=d.isHG&&!!d.destLabelText;
  var _hgBox='<div id="hg-dept-box" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4mm"><div id="hg-dept-txt" style="font-weight:900;color:#1C3A52;text-align:center;word-break:normal;line-height:1.3;hyphens:none;overflow-wrap:normal;max-width:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div>';
  var _hgScript=_hgt?'<script>(function(){var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");if(!b||!t)return;function f(){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}setTimeout(f,50);})();<\/script>':'';
  var dpts=d.depts||[];
  var DLIST=[{id:'BIOCHIMIE',lbl:'Biochimie'},{id:'HEMATOLOGIE',lbl:'H&#233;matologie'},{id:'MICROBIOLOGIE',lbl:'Microbiologie'},{id:'PATHOLOGIE',lbl:'Pathologie'}];

  // Bande pied : départements en ligne horizontale
  var deptsRow='<div style="display:flex;align-items:center;gap:2mm;font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;flex-wrap:wrap">'
    +'<div style="display:flex;align-items:center;gap:1.5mm;font-weight:700;margin-right:1mm">'
      +'<div style="width:5mm;height:5mm;border:1.5px solid #333;border-radius:.5mm;flex-shrink:0"></div>'
      +'<span>Analyses STAT</span>'
    +'</div>'
    +'<span style="color:#ddd">&#124;</span>';
  DLIST.forEach(function(dep){
    var on=dpts.indexOf(dep.id)!==-1;
    var cs=on?'background:#1C3A52;color:white;border-color:#1C3A52;':'';
    deptsRow+='<div style="display:flex;align-items:center;gap:1.5mm">'
      +'<div style="display:inline-flex;align-items:center;justify-content:center;width:5mm;height:5mm;border:1.5px solid #333;border-radius:.5mm;flex-shrink:0;font-size:8.5pt;font-weight:900;'+cs+'">'+(on?'&#x2713;':'')+'</div>'
      +'<span>'+dep.lbl+'</span></div>';
  });
  deptsRow+='</div>';

  // Colonne droite : si deux losanges → côte à côte pour libérer la hauteur
  var tLen=tempMention.length;
  var tFs=tLen<=12?'26pt':tLen<=20?'22pt':tLen<=30?'17pt':'13pt';
  var safeCol='';
  if(specLabel&&hasDryIce&&dryIceLabel){
    safeCol+='<div style="display:flex;gap:3mm;align-items:center;width:100%">'+specLabel+dryIceLabel+'</div>';
  }else if(specLabel){
    safeCol+=specLabel;
  }else if(hasDryIce&&dryIceLabel){
    safeCol+=dryIceLabel;
  }
  safeCol+='<div style="border:3px solid '+tc+';padding:4mm;text-align:center;width:100%;box-sizing:border-box;margin-top:3mm;font-family:Arial,Helvetica,sans-serif">'
    +'<div style="font-size:'+tFs+';font-weight:900;color:'+tc+';line-height:1.25">'+xe(tempMention)+'</div>'
    +(tRange?'<div style="font-size:10pt;color:'+tc+';margin-top:1.5mm;opacity:.75">'+xe(tRange)+'</div>':'')
    +(hasDryIce?'<div style="font-size:7pt;color:#666;margin-top:2mm;border-top:.5px solid #ccc;padding-top:1.5mm">CARBON DIOXIDE, SOLID — UN 1845</div>':'')
    +'</div>';
  // CANUTEC et warning dans la colonne gauche (pas dans safeCol)
  var pochetteCanutec=isDgr
    ?'<div style="margin-top:3mm;padding:1.5mm 2.5mm;background:#FFF8E1;border:1px solid #F5C518;border-radius:1mm;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;display:flex;align-items:center;justify-content:center;gap:2mm">'
      +'<span style="font-weight:700">Urgences 24h&nbsp;:</span>'
      +'<span style="font-weight:900;font-size:9pt;color:#B8860B">CANUTEC '+xe(CFG.bordereau.canutec)+'</span>'
      +'</div>'
    :'';
  var pochetteWarn=((isDgr||hasDryIce)&&labMm<100&&CFG.bordereau.warnSize!==false&&(specLabel||hasDryIce))
    ?'<div style="margin-top:1.5mm;font-size:5.5pt;color:#AA0000;font-style:italic;line-height:1.4;font-family:Arial,Helvetica,sans-serif">&#9888; Pictogrammes &#224; '+labMm+'mm (r&#233;gl. 100mm). Si n&#233;cessaire, apposer les &#233;tiquettes homologu&#233;es 100&#215;100mm sur le colis.</div>'
    :'';

  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:8mm}'
    +'html,body{height:100%;width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column}'
    +'.etq{height:50%;flex-shrink:0;padding:6mm 9mm 3mm 9mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.main{display:flex;gap:5mm;flex:1;min-height:0}'
    +'.col-a{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}'
    +'.col-s{width:98mm;flex:none;display:flex;flex-direction:column;align-items:center}'
    +'.dfoot{padding:3mm 0 0;border-top:.8px solid #bbb;flex-shrink:0}'
    +'.fold{flex-shrink:0;height:0;border-top:2px dashed #777;position:relative}'
    +'.flbl{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:white;padding:0 3mm;font-size:7pt;color:#999;white-space:nowrap}'
    +'.bord{flex:1;padding:7mm 9mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.bh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1C3A52;padding-bottom:2.5mm;margin-bottom:3mm;flex-shrink:0}'
    +'.bt2{font-size:15pt;font-weight:700;color:#1C3A52}.bd{font-size:9pt;color:#666}'
    +'.bc{text-align:center;margin-bottom:2.5mm;flex-shrink:0}.bc svg{max-width:200px}'
    +_brdTable+_brdPrint
    +'</style></head><body>'

    +'<div class="etq">'
      +'<div class="main">'
        // Colonne gauche : DESTINATION uniquement
        +'<div class="col-a">'
          +'<div id="pch-dname" style="font-size:18pt;font-weight:900;text-transform:uppercase;line-height:1.15;margin-bottom:3mm;font-family:Arial,Helvetica,sans-serif;color:#1C3A52">'+fmtDestLabel(d.dest,xe)+'</div>'
          +'<div id="pch-daddr" style="font-size:13pt;line-height:1.6;color:#222;font-family:Arial,Helvetica,sans-serif">'+destAddr+'</div>'
        +'</div>'
        // Colonne droite : PICTOS + TEMPÉRATURE
        +'<div class="col-s">'+safeCol+'</div>'
      +'</div>'
      // Expéditeur — toujours sous la rangée principale, jamais superposé
      +'<div style="padding-top:2.5mm;border-top:.5px solid #ccc;margin-top:3mm;font-family:Arial,Helvetica,sans-serif">'
        +'<div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1mm">Exp&#233;diteur</div>'
        +'<div style="font-size:9pt;font-weight:600;color:#333">'+xe(d.exp)+'</div>'
        +(expAddrLine?'<div style="font-size:8.5pt;color:#666;margin-top:.5mm">'+expAddrLine+'</div>':'')
      +'</div>'
      +pochetteCanutec
      +pochetteWarn
      // Bande pied : DÉPARTEMENTS + STAT (ou texte HG)
      +(_hgt?'<div class="dfoot" style="min-height:14mm;max-height:55mm;display:flex;flex-direction:column;overflow:hidden">'+_hgBox+'</div>':'<div class="dfoot">'+deptsRow+'</div>')
    +'</div>'

    +'<div class="fold"><span class="flbl">'+xe(CFG.bordereau.pli)+'</span></div>'

    +'<div class="bord">'
      +'<div class="bh"><div class="bt2">'+xe(CFG.bordereau.titre)+'</div><div class="bd">'+xe(date)+'</div></div>'
      +'<div class="bc">'+barcodeSvg+'</div>'
      +'<table><tbody>'+rows+notesRow+'</tbody></table>'
    +'</div>'
    +'<script>(function(){setTimeout(function(){'
    +'var dn=document.getElementById("pch-dname"),da=document.getElementById("pch-daddr"),dc=dn&&dn.closest(".col-a");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.9;for(var ns=18;ns>=8;ns--){var as=Math.max(7,Math.round(ns*0.72));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    +'var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");'
    +'if(b&&t){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}'
    +'},50);})()</scr'+'ipt>'
    +'</body></html>';
}
// Format 5 — Grille colis (Lettre US pliée, grille CSS 2×3)
// dest | rt(urgence+temp) / exp | depts / pictos(full)
function brdHtmlGrille(d,xe,date,barcodeSvg,rows,notesRow,specLabel,dryIceLabel,hasDryIce,tempMention,tRange,tc,isDgr,labMm,sizeOk,expAddrLine,destAddr){
  var _hgt=d.isHG&&!!d.destLabelText;
  var _hgBox='<div id="hg-dept-box" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4mm"><div id="hg-dept-txt" style="font-weight:900;color:#1C3A52;text-align:center;word-break:normal;line-height:1.3;hyphens:none;overflow-wrap:normal;max-width:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div>';
  var _hgScript=_hgt?'<script>(function(){var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");if(!b||!t)return;function f(){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}setTimeout(f,50);})();<\/script>':'';
  var dpts=d.depts||[];
  var DLIST=[
    {id:'BIOCHIMIE',lbl:'Biochimie'},
    {id:'HEMATOLOGIE',lbl:'H&#233;matologie / BDS'},
    {id:'MICROBIOLOGIE',lbl:'Microbiologie / S&#233;ro'},
    {id:'PATHOLOGIE',lbl:'Pathologie / Cyto'}
  ];

  // Cellule rt (top-right, 48mm) : Départements
  var tLen=tempMention.length;
  var tFs=tLen<=12?'24pt':tLen<=20?'19pt':tLen<=30?'15pt':'12pt';
  var rtCell='<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:2mm;font-family:Arial,Helvetica,sans-serif;padding:4mm 4mm 0 4mm">D&#233;partements</div>';
  rtCell+='<div style="padding:0 4mm;font-family:Arial,Helvetica,sans-serif">'
    +'<div style="display:flex;align-items:center;gap:2.5mm;margin-bottom:3mm">'
      +'<div style="width:9mm;height:9mm;border:2.5px solid #1C3A52;border-radius:.5mm;flex-shrink:0"></div>'
      +'<span style="font-size:18pt;font-weight:900;color:#1C3A52">Analyses STAT</span>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:2mm 2mm">';
  DLIST.forEach(function(dep){
    var on=dpts.indexOf(dep.id)!==-1;
    var cs=on?'background:#1C3A52;color:white;border-color:#1C3A52;':'';
    rtCell+='<div style="display:flex;align-items:center;gap:2mm;min-width:0">'
      +'<div style="display:inline-flex;align-items:center;justify-content:center;width:8mm;height:8mm;border:2px solid #333;border-radius:.5mm;flex-shrink:0;font-size:11pt;font-weight:900;'+cs+'">'+(on?'&#x2713;':'')+'</div>'
      +'<span style="font-size:12pt;line-height:1.3;flex:1;min-width:0">'+dep.lbl+'</span>'
    +'</div>';
  });
  rtCell+='</div></div>';

  // Cellule dept (mid-right, 34mm) : Température sans bordure + CANUTEC si DGR
  var deptCell='<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1.5mm;font-family:Arial,Helvetica,sans-serif">Temp&#233;rature</div>';
  deptCell+='<div style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-family:Arial,Helvetica,sans-serif">'
    +'<div>'
      +'<div style="font-size:'+tFs+';font-weight:900;color:'+tc+';line-height:1.2">'+xe(tempMention)+'</div>'
      +(tRange?'<div style="font-size:9pt;color:'+tc+';margin-top:1mm;opacity:.75">'+xe(tRange)+'</div>':'')
      +(hasDryIce?'<div style="font-size:6pt;color:#666;margin-top:1mm">CO&#x2082; SOLID — UN 1845</div>':'')
    +'</div>'
  +'</div>';
  // CANUTEC en haut de la cellule température (avant le texte)
  if(isDgr) deptCell='<div style="flex-shrink:0;padding:1.5mm 2mm;background:#FFF8E1;border:1px solid #F5C518;border-radius:1mm;font-family:Arial,Helvetica,sans-serif;font-size:6.5pt;display:flex;align-items:center;justify-content:center;gap:1.5mm;margin-bottom:2mm">'
    +'<span style="font-weight:700">Urgences 24h&nbsp;:</span>'
    +'<span style="font-weight:900;color:#B8860B">CANUTEC '+xe(CFG.bordereau.canutec)+'</span>'
    +'</div>'+deptCell;

  // Avertissement réglementaire — placé en bas de la cellule expéditeur
  var warnHtml=((isDgr||hasDryIce)&&labMm<100&&CFG.bordereau.warnSize!==false&&(specLabel||hasDryIce))
    ?'<div style="margin-top:auto;padding-top:2mm;font-size:5pt;color:#AA0000;font-style:italic;font-family:Arial,Helvetica,sans-serif;line-height:1.3">&#9888; Pictogrammes &#224; '+labMm+'mm (r&#233;gl. 100mm). Si n&#233;cessaire, apposer les &#233;tiquettes homologu&#233;es 100&#215;100mm sur le colis.</div>'
    :'';
  // Cellule picto : losanges/boîte centrés
  var pictoContent='';
  if(!isDgr&&specLabel&&!hasDryIce){
    // Exempt seul : boîte pleine largeur
    pictoContent=specLabel;
  }else if(specLabel||hasDryIce){
    pictoContent+='<div style="display:flex;gap:4mm;align-items:center;justify-content:center;flex-wrap:wrap">';
    if(specLabel) pictoContent+=specLabel;
    if(hasDryIce&&dryIceLabel) pictoContent+=dryIceLabel;
    pictoContent+='</div>';
  }

  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:8mm}'
    +'html,body{height:100%;width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column}'
    +'.etq{height:50%;flex-shrink:0;display:grid;overflow:hidden;'
      +'grid-template-areas:"dest rt" "exp dept" "picto picto";'
      +'grid-template-columns:1fr 1fr;'
      +'grid-template-rows:minmax(0,3fr) minmax(0,1.5fr) minmax(0,2.5fr)}'
    +'.cell-dest{grid-area:dest;padding:4mm 4mm 2mm 5mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-rt{grid-area:rt;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-exp{grid-area:exp;padding:3mm 4mm 2mm 5mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-dept{grid-area:dept;padding:3mm 4mm 2mm 4mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-picto{grid-area:picto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3mm;overflow:hidden}'
    +'.fold{flex-shrink:0;height:0;border-top:2px dashed #777;position:relative}'
    +'.flbl{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:white;padding:0 3mm;font-size:7pt;color:#999;white-space:nowrap}'
    +'.bord{flex:1;padding:7mm 9mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.bh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1C3A52;padding-bottom:2.5mm;margin-bottom:3mm;flex-shrink:0}'
    +'.bt2{font-size:15pt;font-weight:700;color:#1C3A52}.bd{font-size:9pt;color:#666}'
    +'.bc{text-align:center;margin-bottom:2.5mm;flex-shrink:0}.bc svg{max-width:200px}'
    +_brdTable+_brdPrint
    +'</style></head><body>'

    +'<div class="etq">'
      +'<div class="cell-dest">'
        +'<div style="font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1.5mm">Destinataire</div>'
        +'<div id="gc-dname" style="font-size:20pt;font-weight:900;color:#1C3A52;line-height:1.2;margin-bottom:2mm">'+fmtDestLabel(d.dest,xe)+'</div>'
        +'<div id="gc-daddr" style="font-size:13pt;line-height:1.6;color:#333">'+destAddr+'</div>'
      +'</div>'
      +(_hgt?'<div class="cell-rt">'+_hgBox+'</div>':'<div class="cell-rt">'+rtCell+'</div>')
      +'<div class="cell-exp">'
        +'<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1mm">Exp&#233;diteur</div>'
        +'<div style="font-size:10.5pt;font-weight:700;color:#333;line-height:1.25;margin-bottom:1.5mm">'+xe(d.exp)+'</div>'
        +(expAddrLine?'<div style="font-size:8.5pt;line-height:1.55;color:#555">'+expAddrLine+'</div>':'')
        +warnHtml
      +'</div>'
      +'<div class="cell-dept">'+deptCell+'</div>'
      +'<div class="cell-picto"><div id="gc-picto" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%">'+pictoContent+'</div></div>'
    +'</div>'

    +'<div class="fold"><span class="flbl">'+xe(CFG.bordereau.pli)+'</span></div>'

    +'<div class="bord">'
      +'<div class="bh"><div class="bt2">'+xe(CFG.bordereau.titre)+'</div><div class="bd">'+xe(date)+'</div></div>'
      +'<div class="bc">'+barcodeSvg+'</div>'
      +'<table><tbody>'+rows+notesRow+'</tbody></table>'
    +'</div>'

    +'<script>(function(){setTimeout(function(){'
    // 1 — Destination : nom + adresse
    +'var dn=document.getElementById("gc-dname"),da=document.getElementById("gc-daddr"),dc=dn&&dn.closest(".cell-dest");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.9;for(var ns=20;ns>=9;ns--){var as=Math.max(7,Math.round(ns*0.65));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    // 2 — Boîte HG
    +'var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");'
    +'if(b&&t){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}'
    // 3 — Picto : scale si débordement
    +'var gp=document.getElementById("gc-picto"),pc=gp&&gp.closest(".cell-picto");'
    +'if(gp&&pc){var ph=pc.clientHeight,pw=pc.clientWidth,sh=gp.scrollHeight,sw=gp.scrollWidth;'
    +'if(sh>ph*0.95||sw>pw*0.95){var sc=Math.min(ph*0.95/sh,pw*0.95/sw);gp.style.transform="scale("+sc+")";gp.style.transformOrigin="center center";}}'
    +'},50);})()</scr'+'ipt>'
    +'</body></html>';
}
function resetForm(){document.getElementById('ldest').value='';document.getElementById('ldest-input').value='';updateDestAddr('');document.getElementById('nlist').value='';document.getElementById('notes').value='';document.getElementById('trans').value='';document.getElementById('ntub').value='';ST='';SD=[];SGSP='exempt';SGSC=false;var ts=document.getElementById('tspec');if(ts)ts.value='exempt';var gs=document.getElementById('glace-section');if(gs)gs.style.display='none';document.querySelectorAll('.tpill').forEach(function(el){el.className='tpill';});var cm={BIOCHIMIE:'dp-bio',HEMATOLOGIE:'dp-hema',MICROBIOLOGIE:'dp-micro',PATHOLOGIE:'dp-patho'};DEPTS.forEach(function(x){document.getElementById('dp-'+x.id).className='dpill '+cm[x.id];});
  // Reset checkbox "pas de liste SILP"
  SILP_NO_LIST=false;var cb=document.getElementById('no-silp-cb');if(cb)cb.checked=false;
  var w=document.getElementById('nlist-wrap'),warn=document.getElementById('no-silp-warn'),nw=document.getElementById('no-silp-num-wrap');
  if(w)w.style.display='';if(warn)warn.style.display='none';if(nw)nw.style.display='none';}

// Réception
function showRlabErr(title,sub){var el=document.getElementById('rlab-err');document.getElementById('rlab-err-title').textContent=title;var s=document.getElementById('rlab-err-sub');s.textContent=sub||'';s.style.display=sub?'':'none';el.style.display='flex';var rn=document.getElementById('rnum');rn.focus();rn.select();}
function rechercher(){
  var v=document.getElementById('rnum').value.trim();document.getElementById('rresult').style.display='none';document.getElementById('obsreq').style.display='none';document.getElementById('rlab-err').style.display='none';
  if(!v){ban('rerr','Veuillez saisir un numéro de liste de repérage.','e');return;}
  var idx=E.findIndex(function(e){return e.numero===v;});
  if(idx===-1){showRlabErr('Numéro de liste introuvable','"'+v+'" ne correspond à aucun envoi enregistré.');return;}
  var e=E[idx];
  if(CU.labo_id&&e.destId!==CU.labo_id){showRlabErr('Cet envoi n\'est pas destiné à votre laboratoire','Destiné à : '+e.dest);return;}
  if(e.statut==='Reçu'){ban('rerr','Cet envoi a déjà été réceptionné'+(e.recepPar?' par '+e.recepPar:'')+'.','e');var rn=document.getElementById('rnum');rn.focus();rn.select();return;}
  if(e.statut==='Problème'){ban('rerr','Un problème a déjà été signalé pour cet envoi'+(e.recepPar?' par '+e.recepPar:'')+'.','e');var rn2=document.getElementById('rnum');rn2.focus();rn2.select();return;}
  CRI=idx;document.getElementById('robs').value='';document.getElementById('robs').style.borderColor='';
  var h=thrs(e);var al=h!==null&&h>CFG.alarmR;
  document.getElementById('rdet').innerHTML='<div class="irow"><span>N° liste</span><span style="font-family:var(--fm)">'+esc(e.numero)+'</span></div><div class="irow"><span>Expéditeur</span><span>'+esc(e.exp)+'</span></div><div class="irow"><span>Température</span><span>'+esc(tl(e.temp))+'</span></div>'+(e.depts&&e.depts.length?'<div class="irow"><span>Département(s)</span><span>'+dlbl(e.depts)+'</span></div>':'')+'<div class="irow"><span>Transporteur</span><span>'+esc(e.transporteur)+'</span></div>'+(e.tubes?'<div class="irow"><span>Échantillons</span><span>'+e.tubes+'</span></div>':'')+'<div class="irow"><span>Envoyé le</span><span>'+fdt(e.tsEnvoi)+'</span></div>'+(al?'<div class="irow"><span style="color:var(--te)">⚠ Transit</span><span style="color:var(--te)">'+ft(h)+' — dépasse '+CFG.alarmR+' h</span></div>':'')+(e.notes?'<div class="irow"><span>Notes envoi</span><span>'+esc(e.notes)+'</span></div>':'');
  document.getElementById('rresult').style.display='block';
}
async function confirmer(){if(CRI===-1)return;var e=E[CRI];var r=await sb.from('envois').update({statut:'Reçu',ts_recep:new Date().toISOString(),recep_par_nom:CU.nom,recep_obs:document.getElementById('robs').value}).eq('id',e.id);if(r.error){ban('rerr','Erreur : '+r.error.message,'e');return;}ban('rsuc','Réception confirmée pour l\'envoi '+e.numero+'.','s');document.getElementById('rresult').style.display='none';var rn=document.getElementById('rnum');rn.value='';CRI=-1;rn.focus();}
async function signaler(){if(CRI===-1)return;var obs=document.getElementById('robs').value.trim();if(!obs){document.getElementById('obsreq').style.display='inline';document.getElementById('robs').style.borderColor='var(--bd2)';ban('rerr','Un commentaire est obligatoire pour signaler un problème.','e');return;}document.getElementById('robs').style.borderColor='';var e=E[CRI];var r=await sb.from('envois').update({statut:'Problème',ts_recep:new Date().toISOString(),recep_par_nom:CU.nom,recep_obs:obs}).eq('id',e.id);if(r.error){ban('rerr','Erreur : '+r.error.message,'e');return;}ban('rsuc','Problème signalé pour l\'envoi '+e.numero+'.','s');document.getElementById('rresult').style.display='none';var rn=document.getElementById('rnum');rn.value='';CRI=-1;rn.focus();}

// Détail modal
async function showGMod(id){
  var e=E.find(function(x){return x.id===id;});if(!e)return;
  var h=thrs(e);var alD=isAlarmP(e);var al=isAlarmR(e);
  var transitStyle=alD?'color:#991B1B;font-weight:700':al?'color:var(--te)':'';
  var stCfgI=CFG.bordereau.specTypes.find(function(t){return t.id===e.typeSpecimen;})||{label:e.typeSpecimen||'—'};
  var tCfgI=CFG.temperatures.find(function(t){return t.label===e.temp;});
  var showRefI=tCfgI&&tCfgI.ask_glace;
  document.getElementById('gmod-body').innerHTML=
    '<div class="df"><span>N° liste</span><span style="font-family:var(--fm)">'+esc(e.numero)+'</span></div>'+
    '<div class="df"><span>Statut</span><span><span class="badge '+bc(e.statut)+'">'+esc(e.statut)+'</span></span></div>'+
    modSep('Parties')+
    '<div class="df"><span>Expéditeur</span><span>'+esc(e.exp)+'</span></div>'+
    '<div class="df"><span>Destinataire</span><span>'+esc(e.dest)+'</span></div>'+
    '<div class="df"><span>Transporteur</span><span>'+esc(e.transporteur)+'</span></div>'+
    modSep('Spécimen &amp; transport')+
    '<div class="df"><span>Type de spécimen</span><span>'+esc(stCfgI.label)+'</span></div>'+
    (showRefI?'<div class="df"><span>Réfrigérant</span><span>'+(e.glaceSeche?'🧊 Glace sèche (UN 1845)':'❄️ Sachet réfrigérant')+'</span></div>':'')+
    '<div class="df"><span>Température</span><span>'+esc(tl(e.temp))+'</span></div>'+
    '<div class="df full"><span>Département(s)</span><span>'+dlbl(e.depts)+'</span></div>'+
    (e.tubes?'<div class="df"><span>Échantillons</span><span>'+e.tubes+'</span></div>':'')+
    modSep('Traçabilité')+
    '<div class="df"><span>Créé par</span><span>'+esc(e.creePar||'—')+'</span></div>'+
    '<div class="df"><span>Envoyé le</span><span>'+fdt(e.tsEnvoi)+'</span></div>'+
    '<div class="df"><span>Réceptionné le</span><span>'+fdt(e.tsRecep)+'</span></div>'+
    (e.recepPar?'<div class="df"><span>Réceptionné par</span><span>'+esc(e.recepPar)+'</span></div>':'')+
    '<div class="df"><span>Transit</span><span style="'+transitStyle+'">'+ft(h)+(alD?' ⚠ Potentiellement perdu':al?' ⚠':'')+'</span></div>'+
    (e.notes||e.recepObs?modSep('Notes'):'')+
    (e.notes?'<div class="df full"><span>Notes d\'envoi</span><span>'+esc(e.notes)+'</span></div>':'')+
    (e.recepObs?'<div class="df full"><span>Observations réception</span><span style="color:var(--te)">'+esc(e.recepObs)+'</span></div>':'')+
    '<div id="gmod-audit"></div>';
  var footer=document.getElementById('gmod-footer');
  footer.innerHTML='';
  var canDeclare=isG()||(CU.role==='superviseur_labo'&&(e.expId===CU.labo_id||e.destId===CU.labo_id));
  var isHsilpE=e.numero&&e.numero.indexOf('HSILP')===0;
  var canPrint=(isHsilpE||CFG.printBordereau)&&e.expId===CU.labo_id&&e.statut==='En transit';
  var canModify=e.statut!=='Reçu'&&e.statut!=='Perdu'&&e.statut!=='Problème'&&(e.creeParId===CU.id||isG()||(isS()&&e.expId===CU.labo_id));
  var btns=[];
  if(canPrint)btns.push('<button class="bsm bsms" style="display:inline-flex;align-items:center;gap:5px" onclick="printBordereauFromEnvoi(\''+e.id+'\')"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6H2a1 1 0 00-1 1v5a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2"/><rect x="4" y="1" width="8" height="7" rx="1"/><path d="M4 11h8v4H4z"/></svg>Imprimer le bordereau</button>');
  if(canModify)btns.push('<button class="bsm bsmi" style="display:inline-flex;align-items:center;gap:5px" onclick="openEditEnvoi(\''+e.id+'\')"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3l9-9z"/><path d="M9 4l3 3"/></svg>Modifier l\'envoi</button>');
  if(canDeclare&&e.statut!=='Reçu'&&e.statut!=='Perdu'&&e.statut!=='Problème')btns.push('<button class="bsm bsmd" style="display:inline-flex;align-items:center;gap:5px" onclick="declarerPerdu(\''+e.id+'\')"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10v1"/></svg>Déclarer perdu</button>');
  if(btns.length)footer.innerHTML='<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--b3);display:flex;justify-content:flex-end;gap:8px">'+btns.join('')+'</div>';
  document.getElementById('gmod').classList.add('show');
  // Chargement asynchrone du dernier audit
  try{
    var ar=await sb.from('envois_audit').select('changed_by_nom,changed_at').eq('table_name','envois').eq('record_id',id).eq('action','UPDATE').order('changed_at',{ascending:false}).limit(1);
    var auditEl=document.getElementById('gmod-audit');
    if(!ar.error&&ar.data&&ar.data.length&&auditEl){
      var la=ar.data[0];
      auditEl.innerHTML='<div class="df full" style="margin-top:6px;padding-top:6px;border-top:0.5px solid var(--b3)"><span style="color:var(--warning)">✎ Modifié</span><span style="color:var(--t2)">'+esc(la.changed_by_nom)+' — '+fdt(la.changed_at)+'</span></div>';
    }
  }catch(ex){}
}
function closeGMod(){document.getElementById('gmod').classList.remove('show');}
async function declarerPerdu(id){
  var e=E.find(function(x){return x.id===id;});if(!e)return;
  if(!await confirm2('Déclarer l\'envoi '+e.numero+' perdu','Cet envoi sera marqué comme perdu. Cette action ne peut pas être annulée.','Déclarer perdu'))return;
  var r=await sb.from('envois').update({statut:'Perdu',ts_recep:new Date().toISOString(),recep_par_nom:CU.nom,recep_obs:'Déclaré perdu par '+CU.nom}).eq('id',e.id);
  if(r.error){toast('Erreur : '+r.error.message,'e');return;}
  toast('Envoi '+e.numero+' déclaré perdu.','s');
  closeGMod();
}

// Résumé
function switchRTab(t){
  ['sent','recv','done'].forEach(function(k){
    document.getElementById('rtab-'+k).classList.toggle('active',t===k);
    document.getElementById('rtab-panel-'+k).classList.toggle('gone',t!==k);
  });
}
function getResData(){var laboId=isG()?document.getElementById('rls').value:CU.labo_id;var laboName=(LABS.find(function(l){return l.id===laboId;})||{name:''}).name;var fv=document.getElementById('pfrom').value,tv=document.getElementById('pto').value,fd=document.getElementById('rdept').value;var fd2=fv?new Date(fv+'T00:00:00'):new Date(0),td2=tv?new Date(tv+'T23:59:59'):new Date();var grpF=document.getElementById('rgroup').value;function ir(e){var ts=grpF==='recep'?(e.tsRecep||e.tsEnvoi):e.tsEnvoi;return new Date(ts)>=fd2&&new Date(ts)<=td2;}function md(e){return!fd||(e.depts&&e.depts.indexOf(fd)!==-1);}var sent=E.filter(function(e){return e.expId===laboId&&ir(e)&&md(e);}).sort(function(a,b){return new Date(b.tsEnvoi)-new Date(a.tsEnvoi);});var recv=E.filter(function(e){return e.destId===laboId&&ir(e)&&md(e);}).sort(function(a,b){return new Date(b.tsEnvoi)-new Date(a.tsEnvoi);});var pending=recv.filter(function(e){return e.statut==='En transit'||e.statut==='En attente';});var done=recv.filter(function(e){return e.statut==='Reçu'||e.statut==='Problème'||e.statut==='Perdu';});return{laboId:laboId,laboName:laboName,sent:sent,recv:recv,pending:pending,done:done};}
function renderResume(){if(!CU)return;var d=getResData();if(_resumeAlerts){d.sent=d.sent.filter(isAlert);d.pending=d.pending.filter(isAlert);d.done=d.done.filter(isAlert);}document.getElementById('rtitle').textContent='Résumé — '+d.laboName;document.getElementById('rsc').textContent=d.sent.length;document.getElementById('rrc').textContent=d.pending.length;document.getElementById('rdc').textContent=d.done.length;var all=d.sent.concat(d.recv);renderLegend('rtable-legend',all);;var grp=document.getElementById('rgroup').value;function gbd(arr,field){var g={};arr.forEach(function(e){var k=field==='recep'?(e.tsRecep?dk(e.tsRecep):'sans-date'):dk(e.tsEnvoi);if(!g[k])g[k]=[];g[k].push(e);});return Object.entries(g).sort(function(a,b){if(a[0]==='sans-date')return-1;if(b[0]==='sans-date')return 1;return b[0].localeCompare(a[0]);});}function ds(k,c){var lbl=k==='sans-date'?'Non réceptionné':fdo(k+'T12:00:00');return'<tr class="dsep"><td colspan="'+c+'">'+lbl+'</td></tr>';}function showRTable(key,rows,emptyMsg,emptyHint){var tbl=document.getElementById(key+'-table'),emp=document.getElementById(key+'-empty');if(!rows.length){tbl.classList.add('gone');emp.classList.remove('gone');emp.innerHTML='<div class="empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>'+emptyMsg+'</p><span>'+emptyHint+'</span></div>';}else{emp.classList.add('gone');tbl.classList.remove('gone');document.getElementById(key).innerHTML=rows.join('');}}
var sg=gbd(d.sent,grp);showRTable('rsent',sg.map(function(g){return ds(g[0],12)+g[1].map(function(e){return'<tr class="'+rowCls(e)+'" onclick="showGMod(\''+e.id+'\')" style="cursor:pointer"><td style="font-family:var(--fm);font-size:11px;color:var(--ti)">'+esc(e.numero)+'</td><td>'+esc(e.dest)+'</td><td>'+dbh(e.depts)+'</td><td>'+tlS(e.temp)+'</td><td>'+esc(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2);text-align:center">'+(e.tubes||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+esc(e.creePar||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td><td><span class="badge '+bc(e.statut)+'">'+esc(e.statut)+'</span></td><td style="font-size:11px;color:var(--t2)">'+fdt(e.tsRecep)+'</td><td style="font-size:11px;color:var(--t2)">'+esc(e.recepPar||'—')+'</td><td>'+tcell(e)+'</td></tr>';}).join('');}), 'Aucun envoi pour cette période','Modifiez les filtres de date ou de département');var rg=gbd(d.pending,grp);showRTable('rrecv',rg.map(function(g){return ds(g[0],9)+g[1].map(function(e){return'<tr class="'+rowCls(e)+'" onclick="showGMod(\''+e.id+'\')" style="cursor:pointer"><td style="font-family:var(--fm);font-size:11px;color:var(--ti)">'+esc(e.numero)+'</td><td>'+esc(e.exp)+'</td><td>'+dbh(e.depts)+'</td><td>'+tlS(e.temp)+'</td><td>'+esc(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2);text-align:center">'+(e.tubes||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td><td><span class="badge '+bc(e.statut)+'">'+esc(e.statut)+'</span></td><td>'+tcell(e)+'</td></tr>';}).join('');}), 'Aucun colis en attente de réception','Tous les colis ont été réceptionnés ou modifiez les filtres');var dg=gbd(d.done,'recep');showRTable('rdone',dg.map(function(g){return ds(g[0],10)+g[1].map(function(e){return'<tr class="'+rowCls(e)+'" onclick="showGMod(\''+e.id+'\')" style="cursor:pointer"><td style="font-family:var(--fm);font-size:11px;color:var(--ti)">'+esc(e.numero)+'</td><td>'+esc(e.exp)+'</td><td>'+dbh(e.depts)+'</td><td>'+tlS(e.temp)+'</td><td>'+esc(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2);text-align:center">'+(e.tubes||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td><td style="font-size:11px;color:var(--t2)">'+fdt(e.tsRecep)+'</td><td style="font-size:11px;color:var(--t2)">'+esc(e.recepPar||'—')+'</td><td>'+tcell(e)+'</td></tr>';}).join('');}), 'Aucun colis réceptionné pour cette période','Modifiez les filtres de date ou de département');}

// PDF dropdown
function togglePdfDrop(e){e.stopPropagation();document.getElementById('pdf-drop-menu').classList.toggle('open');}
document.addEventListener('click',function(){var m=document.getElementById('pdf-drop-menu');if(m)m.classList.remove('open');});

// PDF
function pdfStr(s){
  if(!s)return'';
  return String(s)
    .replace(/−/g,'-')   // signe moins Unicode → tiret
    .replace(/–/g,'-')   // tiret demi-cadratin
    .replace(/—/g,'-')   // tiret cadratin
    .replace(/[^\x00-\xFF]/g,'?'); // tout autre hors Latin-1
}
function exportPDF(orient){
  document.getElementById('pdf-drop-menu').classList.remove('open');
  if(!window.jspdf||!window.jspdf.jsPDF){alert('Librairie PDF non disponible.');return;}
  var d=getResData();
  var fv=document.getElementById('pfrom').value,tv=document.getElementById('pto').value,fd=document.getElementById('rdept').value;
  var portrait=orient==='portrait';
  var grpPdf=document.getElementById('rgroup').value;
  var doc=new window.jspdf.jsPDF({orientation:portrait?'portrait':'landscape',format:'letter'});
  var pw=doc.internal.pageSize.getWidth();

  // En-tête
  doc.setFillColor(24,95,165);doc.rect(0,0,pw,28,'F');
  doc.setTextColor(255,255,255);doc.setFontSize(14);doc.setFont(undefined,'bold');
  doc.text(CFG.name+' — Récapitulatif',14,11);
  doc.setFontSize(9);doc.setFont(undefined,'normal');
  doc.text(d.laboName,14,18);
  var grpLabel=grpPdf==='recep'?'Groupé par date de réception':'Groupé par date d\'envoi';
  doc.text('Période : '+(fv||'—')+' au '+(tv||'—')+(fd?' | Dépt : '+fd:'')+' | '+grpLabel+'   Généré le '+fdt(new Date().toISOString())+' par '+CU.nom,14,24);
  doc.setTextColor(0,0,0);

  function sepRow(k,nc){
    var lbl=k==='sans-date'?'Non réceptionné':fdo(k+'T12:00:00');
    return[{content:lbl,colSpan:nc,styles:{fillColor:[232,231,228],textColor:[65,64,60],fontStyle:'bold',fontSize:8,cellPadding:{top:5,bottom:5,left:10,right:5}}}];
  }
  function noteRow(txt,nc,bg,tc){
    return[{content:txt,colSpan:nc,styles:{fillColor:bg,textColor:tc,fontStyle:'italic',fontSize:7.5,cellPadding:{top:2,bottom:3,left:18,right:6}}}];
  }
  function subRow(parts,nc){
    return[{content:parts.join('   '),colSpan:nc,styles:{fillColor:[245,247,250],textColor:[90,100,110],fontSize:7,fontStyle:'italic',cellPadding:{top:2,bottom:2,left:16,right:6}}}];
  }
  function buildRows(list,type){
    var nc=portrait?8:(type==='s'?12:11);
    var rows=[],prevDay=null;
    list.forEach(function(e){
      var day=grpPdf==='recep'?(e.tsRecep?dk(e.tsRecep):'sans-date'):dk(e.tsEnvoi);
      if(day!==prevDay){rows.push(sepRow(day,nc));prevDay=day;}
      var h=thrs(e);var al=h!==null&&h>CFG.alarmR;
      var fth=al?{content:ft(h)+' (!)',styles:{textColor:[150,30,30],fontStyle:'bold'}}:ft(h);
      var temp=pdfStr(e.temp),trans=pdfStr(e.transporteur),dest=pdfStr(e.dest),exp=pdfStr(e.exp),depts=pdfStr(dlbl(e.depts)),cpar=pdfStr(e.creePar||''),rpar=pdfStr(e.recepPar||'');
      var tr;
      if(portrait){
        if(type==='s') tr=[e.numero,dest,temp,trans,fdt(e.tsEnvoi),e.statut,fdt(e.tsRecep),fth];
        else           tr=[e.numero,exp, temp,trans,fdt(e.tsEnvoi),e.statut,fdt(e.tsRecep),fth];
        // sous-ligne infos secondaires
        var sub=[];
        if(depts)sub.push('D\xe9pt : '+depts);
        if(e.tubes)sub.push('Ech. : '+e.tubes);
        if(type==='s'&&cpar)sub.push('Cr\xe9\xe9 par : '+cpar);
        if(rpar)sub.push('R\xe9ceptionn\xe9 par : '+rpar);
        if(sub.length)rows.push(tr,subRow(sub,nc));
        else rows.push(tr);
      }else{
        if(type==='s') tr=[e.numero,dest,depts,temp,trans,e.tubes||'-',cpar,fdt(e.tsEnvoi),e.statut,fdt(e.tsRecep),rpar,fth];
        else           tr=[e.numero,exp, depts,temp,trans,e.tubes||'-',fdt(e.tsEnvoi),e.statut,fdt(e.tsRecep),rpar,fth];
        rows.push(tr);
      }
      if(e.notes)rows.push(noteRow(pdfStr('Notes : '+e.notes),nc,[238,246,255],[40,60,110]));
      if(e.recepObs)rows.push(noteRow(pdfStr('Observations r\xe9ception : '+e.recepObs),nc,[255,235,235],[150,30,30]));
    });
    return rows;
  }

  var hS=portrait
    ?['N\xb0 liste','Destinataire','Temp\xe9rature','Transporteur','Date envoi','Statut','R\xe9ceptionn\xe9 le','Transit']
    :['N\xb0 liste','Destinataire','D\xe9partement(s)','Temp\xe9rature','Transporteur','Ech.','Cr\xe9\xe9 par','Date envoi','Statut','R\xe9ceptionn\xe9 le','R\xe9ceptionn\xe9 par','Transit'];
  var hR=portrait
    ?['N\xb0 liste','Exp\xe9diteur','Temp\xe9rature','Transporteur','Date envoi','Statut','R\xe9ceptionn\xe9 le','Transit']
    :['N\xb0 liste','Exp\xe9diteur','D\xe9partement(s)','Temp\xe9rature','Transporteur','Ech.','Date envoi','Statut','R\xe9ceptionn\xe9 le','R\xe9ceptionn\xe9 par','Transit'];

  var tblStyles={fontSize:portrait?8.5:8,cellPadding:portrait?{top:4,bottom:4,left:4,right:3}:3,overflow:'linebreak'};
  doc.setFontSize(11);doc.setFont(undefined,'bold');
  doc.text('Colis envoy\xe9s ('+d.sent.length+')',14,36);
  doc.autoTable({startY:39,head:[hS],body:buildRows(d.sent,'s'),styles:tblStyles,headStyles:{fillColor:[24,95,165],textColor:255,fontStyle:'bold',fontSize:portrait?8.5:8},alternateRowStyles:{fillColor:[247,251,255]}});

  var y=doc.lastAutoTable.finalY+10;
  if(y>doc.internal.pageSize.getHeight()-60){doc.addPage();y=18;}
  doc.setFontSize(11);doc.setFont(undefined,'bold');
  doc.text('Colis re\xe7us / \xe0 r\xe9ceptionner ('+d.recv.length+')',14,y);
  doc.autoTable({startY:y+3,head:[hR],body:buildRows(d.recv,'r'),styles:tblStyles,headStyles:{fillColor:[15,110,86],textColor:255,fontStyle:'bold',fontSize:portrait?8.5:8},alternateRowStyles:{fillColor:[245,252,248]}});

  var labCode=d.laboName.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,5);
  var dateFrom=(fv||'').replace(/-/g,'');
  var dateTo=(tv||'').replace(/-/g,'');
  doc.save(labCode+'_'+(dateFrom||'00000000')+'_'+(dateTo||'99999999')+'.pdf');
}

// Historique
var _histTab='sent';
var _histAlerts=false;
var _resumeAlerts=false;
function toggleHistAlerts(){_histAlerts=!_histAlerts;document.getElementById('hist-alert-btn').classList.toggle('alert-btn-on',_histAlerts);renderTable();}
function toggleResumeAlerts(){_resumeAlerts=!_resumeAlerts;document.getElementById('resume-alert-btn').classList.toggle('alert-btn-on',_resumeAlerts);renderResume();}
function switchHistTab(t){
  _histTab=t;
  ['sent','recv','done'].forEach(function(k){document.getElementById('htab-'+k).classList.toggle('active',t===k);});
  document.getElementById('fstat').value='';
  renderTable();
}
function renderTable(){
  var lid=CU?CU.labo_id:null;
  var base=!lid?E:_histTab==='sent'?E.filter(function(e){return e.expId===lid;}):_histTab==='recv'?E.filter(function(e){return e.destId===lid&&(e.statut==='En transit'||e.statut==='En attente');}):E.filter(function(e){return e.destId===lid&&(e.statut==='Reçu'||e.statut==='Problème'||e.statut==='Perdu');});
  if(lid){document.getElementById('htsc').textContent=E.filter(function(e){return e.expId===lid;}).length;document.getElementById('htrc').textContent=E.filter(function(e){return e.destId===lid&&(e.statut==='En transit'||e.statut==='En attente');}).length;document.getElementById('htdc').textContent=E.filter(function(e){return e.destId===lid&&(e.statut==='Reçu'||e.statut==='Problème'||e.statut==='Perdu');}).length;}
  if(_histAlerts)base=base.filter(isAlert);
  var q=document.getElementById('search').value.toLowerCase(),fs=document.getElementById('fstat').value,fd=document.getElementById('fdept').value,ft2=document.getElementById('ftrans').value;
  var hfv=document.getElementById('hfrom').value,htv=document.getElementById('hto').value;
  var hfd=hfv?new Date(hfv+'T00:00:00'):new Date(0),htd=htv?new Date(htv+'T23:59:59'):new Date(8640000000000000);
  var f=base.filter(function(e){var m=!q||(e.numero+e.exp+e.dest+e.temp+e.transporteur+(e.depts||[]).join(' ')).toLowerCase().includes(q);var dm=!fd||(e.depts&&e.depts.indexOf(fd)!==-1);var dr=!hfv&&!htv||new Date(e.tsEnvoi)>=hfd&&new Date(e.tsEnvoi)<=htd;return m&&(!fs||e.statut===fs)&&dm&&(!ft2||e.transporteur===ft2)&&dr;});
  var countEl=document.getElementById('hist-count');if(countEl)countEl.textContent=f.length+' résultat'+(f.length!==1?'s':'');
  document.getElementById('tbody').innerHTML=f.map(function(e){return'<tr class="'+rowCls(e)+'" style="cursor:pointer" onclick="showGMod(\''+e.id+'\')"><td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+esc(e.numero)+'</td><td>'+esc(e.exp)+'</td><td>'+esc(e.dest)+'</td><td>'+dbh(e.depts)+'</td><td>'+tlS(e.temp)+'</td><td>'+esc(e.transporteur)+'</td><td>'+(e.tubes||'—')+'</td><td><span class="badge '+bc(e.statut)+'">'+esc(e.statut)+'</span></td><td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td><td>'+tcell(e)+'</td></tr>';}).join('');
  renderLegend('htable-legend',f);
  uStats();}

// Mon compte
function renderMonCompte(){
  if(!CU)return;
  document.getElementById('mc-nom').textContent=CU.nom||'—';
  document.getElementById('mc-empid').textContent=CU.employee_id||'—';
  document.getElementById('mc-labo').textContent=(CU.lab?CU.lab.name:null)||'—';
  document.getElementById('mc-role').innerHTML='<span class="badge '+rb(CU.role)+'">'+rl(CU.role)+'</span>';
  var statut='<span class="badge bact">Actif</span>';
  if(CU.is_test)statut+=' <span class="badge" style="background:var(--warning-soft);color:var(--warning);margin-left:4px">Test</span>';
  document.getElementById('mc-statut').innerHTML=statut;
  var themeLabel=CU.theme==='dark'?'Sombre':CU.theme==='light'?'Clair':'Système (OS)';
  var mcThemeEl=document.getElementById('mc-theme');
  if(mcThemeEl)mcThemeEl.textContent=themeLabel;
  var createdEl=document.getElementById('mc-created');
  if(createdEl)createdEl.textContent=(CU.created_by?CU.created_by+' — ':'')+( CU.created_at?fdt(CU.created_at):'—');
  var updatedEl=document.getElementById('mc-updated');
  if(updatedEl)updatedEl.textContent=(CU.updated_by?CU.updated_by+' — ':'')+( CU.updated_at?fdt(CU.updated_at):'—');
  var pwCard=document.getElementById('mc-pw-card'),pwTest=document.getElementById('mc-pw-test');
  if(pwCard)pwCard.style.display=CU.is_test?'none':'';
  if(pwTest)pwTest.style.display=CU.is_test?'':'none';
  document.getElementById('mc-pw1').value='';
  document.getElementById('mc-pw2').value='';
  document.getElementById('mc-suc').style.display='none';
  document.getElementById('mc-err').style.display='none';
}
async function saveMcPw(){
  var p1=document.getElementById('mc-pw1').value,p2=document.getElementById('mc-pw2').value;
  var err=document.getElementById('mc-err'),suc=document.getElementById('mc-suc');
  err.style.display='none';suc.style.display='none';
  if(CU.is_test){err.textContent='Compte de test — changement de mot de passe désactivé.';err.style.display='block';return;}
  if(!p1){err.textContent='Saisissez un nouveau mot de passe.';err.style.display='block';return;}
  if(p1.length<8){err.textContent='Le mot de passe doit contenir au moins 8 caractères.';err.style.display='block';return;}
  if(p1!==p2){err.textContent='Les mots de passe ne correspondent pas.';err.style.display='block';return;}
  var btn=document.querySelector('#panel-moncompte .bp');btn.classList.add('btn-loading');
  var r=await sb.auth.updateUser({password:p1});
  btn.classList.remove('btn-loading');
  if(r.error){err.textContent='Erreur : '+r.error.message;err.style.display='block';return;}
  document.getElementById('mc-pw1').value='';document.getElementById('mc-pw2').value='';
  suc.textContent='Mot de passe mis à jour avec succès.';suc.style.display='block';
  setTimeout(function(){suc.style.display='none';},4000);
}

// Utilisateurs
async function loadUsersAndRender(){var q=sb.from('profiles').select('*,lab:labo_id(name)');if(!isG())q=q.eq('labo_id',CU.labo_id);var r=await q.order('nom');if(!r.error)ULST=r.data||[];renderUT();}
function renderUT(){
  document.getElementById('ultitle').textContent=isG()?'Tous les utilisateurs':'Utilisateurs — '+(CU.lab?CU.lab.name:'');
  document.getElementById('utbody').innerHTML=ULST.map(function(u){
    var me=u.id===CU.id,ca=(isAdmin()&&me)||(isS()&&!me&&(isG()||(u.role!=='superviseur_grappe'&&u.role!=='admin')));
    var laboName=u.lab?u.lab.name:'—';
    var pw=u.must_change_password?'<span style="color:var(--tw);font-size:12px">⚠</span>':'<span style="color:var(--ts);font-size:12px">✓</span>';
    var nameCell=esc(u.nom)+(me?' <span style="font-size:10px;color:var(--t3)">(moi)</span>':'')+(u.is_test?' <span class="badge" style="background:var(--warning-soft);color:var(--warning);font-size:9px">Test</span>':'');
    var auditCreated=u.created_by?('<div style="font-size:10px;color:var(--t2)">'+esc(u.created_by)+'</div><div style="font-size:10px;color:var(--t3)">'+fdt(u.created_at)+'</div>'):'<span style="font-size:10px;color:var(--t3)">—</span>';
    var auditUpdated=u.updated_by?('<div style="font-size:10px;color:var(--t2);margin-top:4px">'+esc(u.updated_by)+'</div><div style="font-size:10px;color:var(--t3)">'+fdt(u.updated_at)+'</div>'):'';
    return'<tr class="'+(u.active?'':'drow')+'">'
      +'<td style="font-family:var(--fm);font-size:11px">'+esc(u.employee_id)+'</td>'
      +'<td>'+nameCell+'</td>'
      +'<td style="font-size:12px">'+esc(laboName)+'</td>'
      +'<td><span class="badge '+rb(u.role)+'">'+rl(u.role)+'</span></td>'
      +'<td><span class="badge '+(u.active?'bact':'bina')+'">'+(u.active?'Actif':'Inactif')+'</span></td>'
      +'<td style="text-align:center">'+pw+'</td>'
      +'<td style="line-height:1.3">'+auditCreated+auditUpdated+'</td>'
      +'<td style="overflow:visible;white-space:nowrap">'+(ca?(u.active?'<button class="bsm bsmi" onclick="openEditU(\''+u.id+'\')" style="margin-right:4px">Modifier</button>':'')+(me?'':('<button class="bsm '+(u.active?'bsmd':'bsms')+'" onclick="togU(\''+u.id+'\','+(!u.active)+')">'+(u.active?'Désactiver':'Activer')+'</button>')):'<span style="color:var(--t3);font-size:11px">—</span>')+'</td>'
      +'</tr>';
  }).join('');
}
function openAddU(){
  EUI=null;
  document.getElementById('uftitle').textContent='Ajouter un utilisateur';
  document.getElementById('ufsave').textContent='Ajouter';
  document.getElementById('ufid').value='';document.getElementById('ufid').readOnly=false;
  document.getElementById('ufnom').value='';document.getElementById('ufpw').value='';
  document.getElementById('uflabo').value=isG()?'':CU.labo_id;
  var rs=document.getElementById('ufrole');
  rs.innerHTML='<option value="technicien">Technicien</option><option value="superviseur_labo">Superviseur Labo</option>'+(isG()?'<option value="superviseur_grappe">Superviseur Grappe</option>':'')+(isAdmin()?'<option value="admin">Administrateur</option>':'');
  rs.value='technicien';
  document.getElementById('ufag').classList.add('gone');
  var ufTest=document.getElementById('uf-is-test');if(ufTest)ufTest.checked=false;
  var ufTestWrap=document.getElementById('uf-test-wrap');if(ufTestWrap)ufTestWrap.classList.toggle('gone',!isAdmin());
  var ufAudit=document.getElementById('uf-audit-info');if(ufAudit)ufAudit.classList.add('gone');
  document.getElementById('uform').classList.add('show');
}
function openEditU(id){
  var u=ULST.find(function(x){return x.id===id;});if(!u)return;
  EUI=id;
  document.getElementById('uftitle').textContent='Modifier — '+u.nom;
  document.getElementById('ufsave').textContent='Enregistrer';
  document.getElementById('ufid').value=u.employee_id;document.getElementById('ufid').readOnly=true;
  document.getElementById('ufnom').value=u.nom;document.getElementById('ufpw').value='';
  document.getElementById('uflabo').value=u.labo_id||'';
  var rs=document.getElementById('ufrole');
  rs.innerHTML='<option value="technicien">Technicien</option><option value="superviseur_labo">Superviseur Labo</option>'+(isG()?'<option value="superviseur_grappe">Superviseur Grappe</option>':'')+(isAdmin()?'<option value="admin">Administrateur</option>':'');
  rs.value=u.role;
  document.getElementById('ufag').classList.remove('gone');
  document.getElementById('ufact').value=String(u.active);
  var ufTest=document.getElementById('uf-is-test');if(ufTest)ufTest.checked=!!u.is_test;
  var ufTestWrap=document.getElementById('uf-test-wrap');if(ufTestWrap)ufTestWrap.classList.toggle('gone',!isAdmin());
  var ufAudit=document.getElementById('uf-audit-info');
  if(ufAudit){
    var lines=[];
    if(u.created_by||u.created_at)lines.push('<span style="font-size:11px;color:var(--t3)">Créé par '+esc(u.created_by||'?')+' le '+fdt(u.created_at)+'</span>');
    if(u.updated_by||u.updated_at)lines.push('<span style="font-size:11px;color:var(--t3)">Modifié par '+esc(u.updated_by||'?')+' le '+fdt(u.updated_at)+'</span>');
    if(lines.length){ufAudit.innerHTML=lines.join('<br>');ufAudit.classList.remove('gone');}
    else ufAudit.classList.add('gone');
  }
  document.getElementById('uform').classList.add('show');
}
function cancelUF(){document.getElementById('uform').classList.remove('show');EUI=null;}
async function callEdge(action,payload){try{var ses=(await sb.auth.getSession()).data.session;var r=await fetch(EDGE_URL+'/manage-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ses.access_token},body:JSON.stringify({action:action,payload:payload})});return await r.json();}catch(err){return{error:err.message};}}
async function saveUser(){
  var id=document.getElementById('ufid').value.trim(),nom=document.getElementById('ufnom').value.trim(),laboId=document.getElementById('uflabo').value,role=document.getElementById('ufrole').value,pw=document.getElementById('ufpw').value;
  var isTest=isAdmin()&&!!(document.getElementById('uf-is-test')||{}).checked;
  if(!id||!nom||!laboId){ban('uerr','Veuillez remplir tous les champs obligatoires.','e');return;}
  var now=new Date().toISOString();
  if(EUI){
    var upd={nom:nom,labo_id:laboId,role:role,active:document.getElementById('ufact').value==='true',is_test:isTest,updated_by:CU.nom,updated_at:now};
    var r=await sb.from('profiles').update(upd).eq('id',EUI);
    if(r.error){ban('uerr','Erreur : '+r.error.message,'e');return;}
    if(pw){
      var u=ULST.find(function(x){return x.id===EUI;})||{};
      if(!u.is_test&&!isTest&&pw.length<8){ban('uerr','Le mot de passe doit contenir au moins 8 caractères.','e');return;}
      var res=await callEdge('reset_password',{profile_id:EUI,new_password:pw});
      if(!res.success){ban('uerr','Profil mis à jour. Erreur MDP : '+(res.error||''),'e');return;}
    }
    if(EUI===CU.id){CU.nom=nom;CU.labo_id=laboId;CU.role=role;CU.is_test=isTest;document.getElementById('uname').textContent=nom;var ln=(LABS.find(function(l){return l.id===laboId;})||{name:''}).name;document.getElementById('ulabo').textContent=ln+' · '+rl(role);document.getElementById('lexp').value=ln;}
    ban('usuc','Utilisateur '+nom+' modifié.'+(pw?' Nouveau MDP enregistré.':''),'s');
  }else{
    if(!pw){ban('uerr','Veuillez définir un mot de passe temporaire.','e');return;}
    if(!isTest&&pw.length<8){ban('uerr','Le mot de passe doit contenir au moins 8 caractères.','e');return;}
    var res2=await callEdge('create',{employee_id:id,password:pw,nom:nom,labo_id:laboId,role:role});
    if(!res2.success){ban('uerr','Erreur : '+(res2.error||'Impossible de créer l\'utilisateur.'),'e');return;}
    await sb.from('profiles').update({is_test:isTest,created_by:CU.nom,created_at:now,updated_by:CU.nom,updated_at:now}).eq('employee_id',id);
    ban('usuc','Utilisateur '+nom+' créé. Changement MDP requis.','s');
  }
  cancelUF();await loadUsersAndRender();
}
async function togU(id,active){var res=await callEdge('toggle_active',{profile_id:id,active:active});if(res.success){var u=ULST.find(function(x){return x.id===id;});if(u){u.active=active;}ban('usuc',(u?u.nom:'Utilisateur')+(active?' réactivé.':' désactivé.'),'s');renderUT();}else ban('uerr','Erreur : '+(res.error||''),'e');}

// Éditeur Markdown
function mdeUpdate(key){
  var ta=document.getElementById('cfg-msg-'+key);
  var prev=document.getElementById('mde-'+key+'-prev');
  if(!prev)return;
  var html=mdToHtml(ta.value);
  prev.innerHTML=html||'<span class="mde-empty">Aperçu…</span>';
}
function mdeWrap(key,before,after){
  var ta=document.getElementById('cfg-msg-'+key);
  var s=ta.selectionStart,e=ta.selectionEnd;
  var sel=ta.value.substring(s,e)||'texte';
  ta.value=ta.value.substring(0,s)+before+sel+after+ta.value.substring(e);
  ta.selectionStart=s+before.length;
  ta.selectionEnd=s+before.length+sel.length;
  ta.focus();mdeUpdate(key);
}
function mdeLink(key){
  var ta=document.getElementById('cfg-msg-'+key);
  var s=ta.selectionStart,e=ta.selectionEnd;
  var sel=ta.value.substring(s,e)||'texte';
  var ins='['+sel+'](https://)';
  ta.value=ta.value.substring(0,s)+ins+ta.value.substring(e);
  ta.selectionStart=s+sel.length+3;
  ta.selectionEnd=s+ins.length-1;
  ta.focus();mdeUpdate(key);
}
function mdeLinePrefix(key,prefix){
  var ta=document.getElementById('cfg-msg-'+key);
  var s=ta.selectionStart;
  var ls=ta.value.lastIndexOf('\n',s-1)+1;
  ta.value=ta.value.substring(0,ls)+prefix+ta.value.substring(ls);
  ta.selectionStart=ta.selectionEnd=s+prefix.length;
  ta.focus();mdeUpdate(key);
}
function mdeBlock(key,text){
  var ta=document.getElementById('cfg-msg-'+key);
  var s=ta.selectionStart;
  var pre=s>0&&ta.value[s-1]!=='\n'?'\n':'';
  var ins=pre+text+'\n';
  ta.value=ta.value.substring(0,s)+ins+ta.value.substring(s);
  ta.selectionStart=ta.selectionEnd=s+ins.length;
  ta.focus();mdeUpdate(key);
}

// Thème clair / sombre
var _SVG_SUN='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
var _SVG_MOON='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
function initTheme(){
  var saved=localStorage.getItem('optilab-theme');
  if(saved)document.documentElement.setAttribute('data-theme',saved);
  updateThemeBtn();
}
function _isDarkNow(){
  var cur=document.documentElement.getAttribute('data-theme');
  if(cur==='dark')return true;
  if(cur==='light')return false;
  return !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);
}
function toggleTheme(){
  var next=_isDarkNow()?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('optilab-theme',next);
  updateThemeBtn();
  if(CU)sb.from('profiles').update({theme:next}).eq('id',CU.id).then(function(){if(CU)CU.theme=next;});
}
function updateThemeBtn(){
  var isDark=_isDarkNow();
  var svg=isDark?_SVG_SUN:_SVG_MOON;
  var title=isDark?'Mode sombre — cliquer pour mode clair':'Mode clair — cliquer pour mode sombre';
  ['theme-btn','login-theme-btn','cpw-theme-btn'].forEach(function(id){
    var btn=document.getElementById(id);if(!btn)return;
    btn.innerHTML=svg;btn.title=title;btn.classList.toggle('dark-active',isDark);
  });
}

// CSS personnalisé
function applyCustomCss(){
  var el=document.getElementById('custom-css');
  if(el)el.textContent=CFG.customCss||'';
}
function renderCfgTheme(){
  var cc=document.getElementById('cfg-custom-css');if(cc)cc.value=CFG.customCss;
}
async function saveCustomCss(){
  var css=document.getElementById('cfg-custom-css').value;
  if(await saveCfg('custom_css',css)){CFG.customCss=css;applyCustomCss();ban('cfgsuc','CSS personnalisé appliqué.','s');}
}

// Badges
function applyBadges(){
  var map={'En transit':'bt','Reçu':'br','En attente':'ba','Problème':'bp2','Perdu':'bperdu'};
  var css=Object.keys(map).map(function(s){var c=CFG.badges[s];return c?'.'+map[s]+'{background:'+c.bg+'!important;color:'+c.color+'!important}':'';}).join('');
  var el=document.getElementById('badge-styles');
  if(!el){el=document.createElement('style');el.id='badge-styles';document.head.appendChild(el);}
  el.textContent=css;
}
function renderCfgBadges(){
  document.getElementById('cfg-badges-list').innerHTML=BADGE_STATUTS.map(function(b){
    var c=CFG.badges[b.label]||{bg:'#E5E7EB',color:'#374151'};
    return'<div class="cfg-badge-row">'+
      '<span class="badge '+b.cls+'" id="badge-prev-'+b.cls+'" style="background:'+c.bg+';color:'+c.color+'">'+b.label+'</span>'+
      '<div style="display:flex;align-items:center;gap:14px">'+
        '<label class="cfg-badge-lbl">Fond<input type="color" id="badge-bg-'+b.cls+'" value="'+c.bg+'" oninput="livePreviewBadge(\''+b.cls+'\')"/></label>'+
        '<label class="cfg-badge-lbl">Texte<input type="color" id="badge-txt-'+b.cls+'" value="'+c.color+'" oninput="livePreviewBadge(\''+b.cls+'\')"/></label>'+
        '<button class="bsm" onclick="resetBadge(\''+b.label+'\',\''+b.cls+'\')">Défaut</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function livePreviewBadge(cls){
  var bg=document.getElementById('badge-bg-'+cls).value;
  var txt=document.getElementById('badge-txt-'+cls).value;
  var prev=document.getElementById('badge-prev-'+cls);
  if(prev){prev.style.background=bg;prev.style.color=txt;}
}
var BADGE_DEFAULTS={'En transit':{bg:'#D7EEF9',color:'#1B6E94'},'Reçu':{bg:'#E1F2E8',color:'#2E8B57'},'En attente':{bg:'#FBEFD7',color:'#B97309'},'Problème':{bg:'#FBE3E1',color:'#B3261E'},'Perdu':{bg:'#FCE7F3',color:'#9D174D'}};
function resetBadge(label,cls){
  var d=BADGE_DEFAULTS[label];if(!d)return;
  document.getElementById('badge-bg-'+cls).value=d.bg;
  document.getElementById('badge-txt-'+cls).value=d.color;
  livePreviewBadge(cls);
}
async function saveBadges(){
  var nb={};
  BADGE_STATUTS.forEach(function(b){nb[b.label]={bg:document.getElementById('badge-bg-'+b.cls).value,color:document.getElementById('badge-txt-'+b.cls).value};});
  if(await saveCfg('badge_colors',nb)){CFG.badges=nb;applyBadges();ban('cfgsuc','Couleurs des badges mises à jour.','s');}
}

// Configuration
function showCfgTab(t){document.querySelectorAll('.cfg-tab').forEach(function(el){el.classList.remove('active');});document.querySelectorAll('.cfg-pane').forEach(function(el){el.classList.remove('active');});document.getElementById('cfgt-'+t).classList.add('active');document.getElementById('cfgp-'+t).classList.add('active');}
async function saveCfg(key,value){var r=await sb.from('app_config').upsert({key:key,value:value,updated_at:new Date().toISOString()});if(r.error){ban('cfgerr','Erreur : '+r.error.message,'e');return false;}return true;}
async function saveInterfaceCfg(){var v=document.getElementById('cfg-print-bordereau').checked;if(await saveCfg('print_bordereau',v)){CFG.printBordereau=v;ban('cfgsuc','Paramètre mis à jour.','s');}}

// ── CONFIG BORDEREAU ──────────────────────────────────────────────────────────
async function saveBrdCfg(){return await saveCfg('bordereau_cfg',CFG.bordereau);}
function renderCfgFormats(){
  var el=document.getElementById('fmt-list');if(!el)return;
  var active=CFG.bordereau.activeFormat||'folded';
  var opts=CFG.bordereau.formats.map(function(f){
    return '<option value="'+esc(f.id)+'"'+(f.id===active?' selected':'')+'>'+esc(f.nom)+'</option>';
  }).join('');
  var active_f=CFG.bordereau.formats.find(function(f){return f.id===active;})||{};
  el.innerHTML='<div class="fgg">'
    +'<select id="brd-fmt-sel" style="width:100%" onchange="setActiveFormat(this.value)">'+opts+'</select>'
    +(active_f.desc?'<div class="cfg-hint" id="brd-fmt-hint" style="margin-top:6px">'+esc(active_f.desc)+'</div>':'')
    +'</div>';
}
async function setActiveFormat(id){
  CFG.bordereau.activeFormat=id;
  var hint=document.getElementById('brd-fmt-hint');
  if(hint){var f=CFG.bordereau.formats.find(function(x){return x.id===id;})||{};hint.textContent=f.desc||'';}
  await saveBrdCfg();
}
async function saveBrdGeneral(){
  CFG.bordereau.titre=document.getElementById('brd-titre').value.trim()||"OPTILAB — Bordereau d'envoi";
  CFG.bordereau.pli=document.getElementById('brd-pli').value.trim()||'✄ Plier ici — Fold here';
  CFG.bordereau.canutec=document.getElementById('brd-canutec').value.trim()||'1-613-996-6666';
  CFG.bordereau.warnSize=document.getElementById('brd-warn-size').checked;
  if(await saveBrdCfg())ban('cfgsuc','Paramètres du bordereau mis à jour.','s');
}
function renderCfgSpec(){
  var el=document.getElementById('spec-list');if(!el)return;
  el.innerHTML=CFG.bordereau.specTypes.map(function(st,i){
    var tag=st.shape==='diamond'?'Losange UN':'Boîte';
    var dgr=st.isDgr?'<span style="font-size:9px;color:var(--te);border:1px solid var(--te);border-radius:3px;padding:0 3px;margin-left:4px">DGR</span>':'';
    var bio=st.icon==='biohazard'?'<span style="font-size:9px;color:#666;border:1px solid #ccc;border-radius:3px;padding:0 3px;margin-left:4px">☣</span>':'';
    var summary=[tag,st.un,st.line1,st.line2].filter(Boolean).join(' · ');
    return '<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0">'
      +'<div style="display:flex;justify-content:space-between;align-items:center">'
        +'<div><div style="font-weight:600;font-size:13px">'+esc(st.label)+dgr+bio+'</div>'
        +'<div style="font-size:11px;color:var(--t2);margin-top:2px">'+esc(summary)+'</div></div>'
        +'<div style="display:flex;gap:6px;flex-shrink:0">'
          +'<button class="bsm bsmi" onclick="toggleSpecEdit('+i+')">Modifier</button>'
          +'<button class="bsm bsmd" onclick="removeSpecType('+i+')">Supprimer</button>'
        +'</div>'
      +'</div>'
      +'<div id="spef-'+i+'" style="display:none;margin-top:8px;padding:10px;background:var(--b2);border-radius:6px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Libellé (liste déroulante)</div><input type="text" id="se-lbl-'+i+'" value="'+esc(st.label||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Numéro UN</div><input type="text" id="se-un-'+i+'" value="'+esc(st.un||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 1 (EN)</div><input type="text" id="se-l1-'+i+'" value="'+esc(st.line1||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 2 (EN)</div><input type="text" id="se-l2-'+i+'" value="'+esc(st.line2||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 1 (FR)</div><input type="text" id="se-l1fr-'+i+'" value="'+esc(st.line1_fr||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 2 (FR)</div><input type="text" id="se-l2fr-'+i+'" value="'+esc(st.line2_fr||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Sous-titre (boîte)</div><input type="text" id="se-sub-'+i+'" value="'+esc(st.subtitle||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Note de bas (boîte)</div><input type="text" id="se-note-'+i+'" value="'+esc(st.note||'')+'"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Numéro de classe (coin losange)</div><input type="text" id="se-cls-'+i+'" value="'+esc(st.classe||'')+'" placeholder="ex. 6"/></div>'
          +'<div style="display:flex;flex-direction:column;gap:6px;padding-top:6px">'
            +'<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" id="se-dgr-'+i+'"'+(st.isDgr?' checked':'')+'/> Marchandises dangereuses (CANUTEC)</label>'
            +'<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" id="se-bio-'+i+'"'+(st.icon==='biohazard'?' checked':'')+'/> Pictogramme biohazard</label>'
          +'</div>'
        +'</div>'
        +'<button class="bp" style="font-size:11px;padding:5px 14px" onclick="saveSpecType('+i+')">Enregistrer</button>'
      +'</div>'
    +'</div>';
  }).join('');
}
function toggleSpecEdit(i){var el=document.getElementById('spef-'+i);if(el)el.style.display=el.style.display==='none'?'':'none';}
async function saveSpecType(i){
  var st=CFG.bordereau.specTypes[i];if(!st)return;
  st.label=document.getElementById('se-lbl-'+i).value.trim();
  st.un=document.getElementById('se-un-'+i).value.trim();
  st.line1=document.getElementById('se-l1-'+i).value.trim();
  st.line2=document.getElementById('se-l2-'+i).value.trim();
  st.line1_fr=document.getElementById('se-l1fr-'+i).value.trim();
  st.line2_fr=document.getElementById('se-l2fr-'+i).value.trim();
  st.subtitle=document.getElementById('se-sub-'+i).value.trim();
  st.note=document.getElementById('se-note-'+i).value.trim();
  st.classe=document.getElementById('se-cls-'+i).value.trim();
  st.isDgr=document.getElementById('se-dgr-'+i).checked;
  st.icon=document.getElementById('se-bio-'+i).checked?'biohazard':'';
  if(await saveBrdCfg()){document.getElementById('spef-'+i).style.display='none';renderCfgSpec();populateSels();ban('cfgsuc','Type mis à jour.','s');}
}
async function addSpecType(){
  var shape=document.getElementById('newspec-shape').value;
  var label=document.getElementById('newspec-label').value.trim();
  var un=document.getElementById('newspec-un').value.trim();
  var dgr=document.getElementById('newspec-dgr').checked;
  var bio=document.getElementById('newspec-bio').checked;
  if(!label){ban('cfgerr','Saisissez un libellé.','e');return;}
  var nst={id:'spec_'+Date.now(),label:label,shape:shape,line1:label,un:un,isDgr:dgr,icon:bio?'biohazard':''};
  CFG.bordereau.specTypes.push(nst);
  if(await saveBrdCfg()){document.getElementById('newspec-label').value='';document.getElementById('newspec-un').value='';document.getElementById('newspec-dgr').checked=false;document.getElementById('newspec-bio').checked=false;renderCfgSpec();populateSels();ban('cfgsuc','"'+label+'" ajouté.','s');}
  else CFG.bordereau.specTypes.pop();
}
async function removeSpecType(i){
  if(!await confirm2('Supprimer ce type de spécimen','Les envois existants conservent leur valeur stockée, mais le type ne sera plus affiché.','Supprimer'))return;
  var removed=CFG.bordereau.specTypes.splice(i,1);
  if(await saveBrdCfg()){renderCfgSpec();populateSels();ban('cfgsuc','Type supprimé.','s');}
  else CFG.bordereau.specTypes.splice(i,0,removed[0]);
}
async function saveBranding(){var n=document.getElementById('cfg-name').value.trim(),s=document.getElementById('cfg-sub').value.trim();if(!n){ban('cfgerr','Le nom ne peut pas être vide.','e');return;}if(await saveCfg('app_name',n)&&await saveCfg('app_subtitle',s)){CFG.name=n;CFG.subtitle=s;applyBranding();ban('cfgsuc','Branding mis à jour.','s');}}
async function saveMessages(){var ml=document.getElementById('cfg-msg-login').value.trim(),mh=document.getElementById('cfg-msg-home').value.trim();if(await saveCfg('msg_login',ml)&&await saveCfg('msg_home',mh)){CFG.messages.login=ml;CFG.messages.home=mh;applyMessages();ban('cfgsuc','Messages mis à jour.','s');}}
async function saveAlarms(){
  var h=parseInt(document.getElementById('cfg-alarm-r').value);
  var d=parseInt(document.getElementById('cfg-alarm-p').value);
  if(!h||h<1||!d||d<1){ban('cfgerr','Durée invalide.','e');return;}
  var ok=await saveCfg('alarm_hours',h)&&await saveCfg('alarm_days',d);
  if(ok){CFG.alarmR=h;CFG.alarmP=d;applyBranding();ban('cfgsuc','Seuils mis à jour — R : '+h+' h, P : '+d+' j.','s');}
}
async function saveAlarmR(){var h=parseInt(document.getElementById('cfg-alarm-r').value);if(!h||h<1){ban('cfgerr','Durée invalide.','e');return;}if(await saveCfg('alarm_hours',h)){CFG.alarmR=h;applyBranding();ban('cfgsuc','Seuil alarme R : '+h+' heures.','s');}}
async function saveAlarmP(){var d=parseInt(document.getElementById('cfg-alarm-p').value);if(!d||d<1){ban('cfgerr','Durée invalide.','e');return;}if(await saveCfg('alarm_days',d)){CFG.alarmP=d;applyBranding();ban('cfgsuc','Seuil alarme P : '+d+' jours.','s');}}
function renderCfgLabs(){
  document.getElementById('labs-count').textContent='('+LABS.length+')';
  document.getElementById('labs-list').innerHTML=LABS.map(function(l){
    var addrParts=[l.adresse,l.adresse2,l.ville&&([l.ville,l.province,l.code_postal].filter(Boolean).join(' ')),l.pays].filter(Boolean);
    var addrSummary=addrParts.length?addrParts.join(', '):'<em style="color:var(--t3)">Adresse non renseignée</em>';
    return '<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
        +'<div><div style="font-weight:600;font-size:13px">'+esc(l.name)+'</div>'
        +'<div style="font-size:11px;color:var(--t2);margin-top:2px">'+addrSummary+'</div></div>'
        +'<div style="display:flex;gap:6px;flex-shrink:0">'
          +'<button class="bsm bsmi" onclick="toggleLabAddr(\''+l.id+'\')">Modifier</button>'
          +'<button class="bsm bsmd" onclick="removeLab(\''+l.id+'\')">Désactiver</button>'
        +'</div>'
      +'</div>'
      +'<div id="laf-'+l.id+'" style="display:none;margin-top:8px;padding:10px;background:var(--b2);border-radius:6px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Adresse (ligne 1)</div><input type="text" id="la-adr-'+l.id+'" value="'+esc(l.adresse||'')+'" placeholder="150, rue X" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Adresse (ligne 2)</div><input type="text" id="la-adr2-'+l.id+'" value="'+esc(l.adresse2||'')+'" placeholder="Bureau 200" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ville</div><input type="text" id="la-vil-'+l.id+'" value="'+esc(l.ville||'')+'" placeholder="Rimouski" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Province / État</div><input type="text" id="la-prv-'+l.id+'" value="'+esc(l.province||'')+'" placeholder="QC" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Code postal</div><input type="text" id="la-cp-'+l.id+'" value="'+esc(fmtCP(l.code_postal||''))+'" placeholder="G5L 5T1" maxlength="7" oninput="this.value=fmtCP(this.value)" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Pays</div><input type="text" id="la-pays-'+l.id+'" value="'+esc(l.pays||'')+'" placeholder="Canada" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Téléphone</div><input type="text" id="la-tel-'+l.id+'" value="'+esc(fmtTel(l.telephone||''))+'" placeholder="(418) 724-8711" maxlength="14" oninput="this.value=fmtTel(this.value)" style="width:100%"/></div>'
          +'<div style="grid-column:span 2"><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Réfrigérant par défaut <span style="font-style:italic">(si température demande un réfrigérant)</span></div>'
            +'<select id="la-ref-'+l.id+'" style="width:100%;font-size:12px">'
              +'<option value=""'+((!l.default_refrigerant)?' selected':'')+'>— Non défini (demander à chaque fois) —</option>'
              +'<option value="sachet"'+(l.default_refrigerant==='sachet'?' selected':'')+'>❄️ Sachet réfrigérant</option>'
              +'<option value="glace_seche"'+(l.default_refrigerant==='glace_seche'?' selected':'')+'>🧊 Glace sèche</option>'
            +'</select>'
          +'</div>'
          +'<div style="grid-column:1/-1;height:1px;background:var(--b3);margin:4px 0"></div>'
          +'<div style="grid-column:1/-1;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;padding-top:2px">Numéros de fax (F-G-74 Hors-grappe)</div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Biochimie / Hématologie</div><input type="text" id="la-fbh-'+l.id+'" value="'+esc(fmtTel(l.fax_bio_hema||''))+'" maxlength="14" oninput="this.value=fmtTel(this.value)" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Microbiologie</div><input type="text" id="la-fm-'+l.id+'" value="'+esc(fmtTel(l.fax_micro||''))+'" maxlength="14" oninput="this.value=fmtTel(this.value)" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Pathologie</div><input type="text" id="la-fp-'+l.id+'" value="'+esc(fmtTel(l.fax_patho||''))+'" maxlength="14" oninput="this.value=fmtTel(this.value)" style="width:100%"/></div>'
          +'<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Laboratoire (général)</div><input type="text" id="la-fg-'+l.id+'" value="'+esc(fmtTel(l.fax_general||''))+'" maxlength="14" oninput="this.value=fmtTel(this.value)" style="width:100%"/></div>'
        +'</div>'
        +'<button class="bp" style="font-size:11px;padding:5px 14px" onclick="saveLabAddr(\''+l.id+'\')">Enregistrer</button>'
      +'</div>'
    +'</div>';
  }).join('');
}
function toggleLabAddr(id){var el=document.getElementById('laf-'+id);if(el)el.style.display=el.style.display==='none'?'':'none';}
async function saveLabAddr(id){
  var adr=document.getElementById('la-adr-'+id).value.trim(),adr2=document.getElementById('la-adr2-'+id).value.trim(),vil=document.getElementById('la-vil-'+id).value.trim(),prv=document.getElementById('la-prv-'+id).value.trim(),cp=document.getElementById('la-cp-'+id).value.trim(),pays=document.getElementById('la-pays-'+id).value.trim(),tel=document.getElementById('la-tel-'+id).value.trim(),ref=document.getElementById('la-ref-'+id).value||null;
  var fbh=document.getElementById('la-fbh-'+id).value.trim(),fm=document.getElementById('la-fm-'+id).value.trim(),fp=document.getElementById('la-fp-'+id).value.trim(),fg=document.getElementById('la-fg-'+id).value.trim();
  var r=await sb.from('laboratories').update({adresse:adr,adresse2:adr2,ville:vil,province:prv,code_postal:cp,pays:pays,telephone:tel,default_refrigerant:ref,fax_bio_hema:fbh,fax_micro:fm,fax_patho:fp,fax_general:fg}).eq('id',id);
  if(r.error){ban('cfgerr','Erreur : '+r.error.message,'e');return;}
  var lab=LABS.find(function(l){return l.id===id;});
  if(lab){lab.adresse=adr;lab.adresse2=adr2;lab.ville=vil;lab.province=prv;lab.code_postal=cp;lab.pays=pays;lab.telephone=tel;lab.default_refrigerant=ref;lab.fax_bio_hema=fbh;lab.fax_micro=fm;lab.fax_patho=fp;lab.fax_general=fg;}
  document.getElementById('laf-'+id).style.display='none';
  renderCfgLabs();ban('cfgsuc','Laboratoire mis à jour.','s');
}
async function addLab(){var v=document.getElementById('newlab').value.trim();if(!v){ban('cfgerr','Saisissez un nom.','e');return;}var r=await sb.from('laboratories').insert({name:v});if(r.error){ban('cfgerr',r.error.code==='23505'?'Ce laboratoire existe déjà.':'Erreur : '+r.error.message,'e');return;}document.getElementById('newlab').value='';await loadLabs();renderCfgLabs();populateSels();ban('cfgsuc','"'+v+'" ajouté.','s');}
async function removeLab(id){if(!await confirm2('Désactiver ce laboratoire','Cette action le masquera des listes. Les envois existants ne sont pas affectés.','Désactiver'))return;var r=await sb.from('laboratories').update({active:false}).eq('id',id);if(r.error){ban('cfgerr','Erreur : '+r.error.message,'e');return;}await loadLabs();renderCfgLabs();populateSels();ban('cfgsuc','Laboratoire désactivé.','s');}
function renderCfgTemps(){
  document.getElementById('temps-list').innerHTML=CFG.temperatures.map(function(t,i){
    var mentionHtml=t.ask_glace
      ?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">'
          +'<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Mention — Glace sèche</div><input type="text" id="tmp-gou-'+i+'" value="'+esc(t.mention_glace_oui||'')+'" style="width:100%;font-size:11px"/></div>'
          +'<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Mention — Sachet réfrigérant</div><input type="text" id="tmp-gno-'+i+'" value="'+esc(t.mention_glace_non||'')+'" style="width:100%;font-size:11px"/></div>'
        +'</div>'
      :'<div style="margin-top:8px"><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Mention sur le bordereau</div><input type="text" id="tmp-men-'+i+'" value="'+esc(t.mention||'')+'" placeholder="Ex. Température ambiante" style="width:100%;font-size:11px"/></div>';
    return '<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0">'
      +'<div style="display:flex;justify-content:space-between;align-items:center">'
        +'<div style="display:flex;align-items:center;gap:8px">'
          +'<span class="tpill '+PCLS[i%PCLS.length]+'" style="flex:none;padding:4px 10px;font-size:11px">'+esc(t.icon)+' '+esc(t.label)+'</span>'
          +(t.ask_glace?'<span style="font-size:9px;color:var(--t2);font-style:italic">Demande réfrigérant</span>':'')
        +'</div>'
        +'<div style="display:flex;gap:6px">'
          +'<button class="bsm bsms" onclick="saveTempMention('+i+')">Enregistrer</button>'
          +'<button class="bsm bsmd" onclick="removeTemp('+i+')">Supprimer</button>'
        +'</div>'
      +'</div>'
      +mentionHtml
    +'</div>';
  }).join('');
}
async function saveTempMention(i){
  var t=CFG.temperatures[i];if(!t)return;
  if(t.ask_glace){t.mention_glace_oui=document.getElementById('tmp-gou-'+i).value.trim();t.mention_glace_non=document.getElementById('tmp-gno-'+i).value.trim();}
  else{t.mention=document.getElementById('tmp-men-'+i).value.trim();}
  if(await saveCfg('temperatures',CFG.temperatures))ban('cfgsuc','Mention mise à jour.','s');
}
async function addTemp(){
  var ic=document.getElementById('newtmp-ic').value.trim()||'🧪',lbl=document.getElementById('newtmp-lbl').value.trim(),men=document.getElementById('newtmp-mention').value.trim(),askG=document.getElementById('newtmp-glace').checked;
  if(!lbl){ban('cfgerr','Saisissez un libellé.','e');return;}
  var nt={icon:ic,label:lbl,mention:men};
  if(askG){nt.ask_glace=true;nt.mention_glace_oui='Congelé : Glace sèche comme réfrigérant';nt.mention_glace_non='Congelé : Sachet réfrigérant';}
  CFG.temperatures.push(nt);
  if(await saveCfg('temperatures',CFG.temperatures)){document.getElementById('newtmp-ic').value='';document.getElementById('newtmp-lbl').value='';document.getElementById('newtmp-mention').value='';document.getElementById('newtmp-glace').checked=false;renderCfgTemps();renderTempPills();ban('cfgsuc','"'+lbl+'" ajouté.','s');}
  else CFG.temperatures.pop();
}
async function removeTemp(i){if(CFG.temperatures.length<=1){ban('cfgerr','Au moins une température requise.','e');return;}var removed=CFG.temperatures.splice(i,1);if(await saveCfg('temperatures',CFG.temperatures)){renderCfgTemps();renderTempPills();ban('cfgsuc','Supprimé.','s');}else CFG.temperatures.splice(i,0,removed[0]);}
function renderCfgTrans(){document.getElementById('trans-list').innerHTML=CFG.transporters.map(function(t,i){return'<div class="cfg-item"><span>'+esc(t)+'</span><button class="bsm bsmd" onclick="removeTrans('+i+')">Supprimer</button></div>';}).join('');}
async function addTrans(){var v=document.getElementById('newtrans').value.trim();if(!v||CFG.transporters.indexOf(v)!==-1){ban('cfgerr',!v?'Saisissez un transporteur.':'Existe déjà.','e');return;}CFG.transporters.push(v);if(await saveCfg('transporters',CFG.transporters)){document.getElementById('newtrans').value='';renderCfgTrans();populateSels();ban('cfgsuc','"'+v+'" ajouté.','s');}else CFG.transporters.pop();}
async function removeTrans(i){var removed=CFG.transporters.splice(i,1);if(await saveCfg('transporters',CFG.transporters)){renderCfgTrans();populateSels();ban('cfgsuc','Supprimé.','s');}else CFG.transporters.splice(i,0,removed[0]);}

// Stats sidebar
function uStats(){var now=new Date().toISOString().slice(0,7);document.getElementById('st').textContent=E.length;document.getElementById('sm').textContent=E.filter(function(e){return e.tsEnvoi&&e.tsEnvoi.startsWith(now);}).length;document.getElementById('str2').textContent=E.filter(function(e){return e.statut==='En transit';}).length;var labs=new Set(E.map(function(e){return e.expId;}).concat(E.map(function(e){return e.destId;})));document.getElementById('sl').textContent=labs.size;}

// ── TOAST SYSTEM ─────────────────────────────────────────────────────────────
function toast(msg, type, duration) {
  type = type || 's'; duration = duration || 4000;
  var cls = type === 'e' ? 'toast-err' : type === 'i' ? 'toast-info' : 'toast-ok';
  var icons = {
    's': '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8l4 4 8-8"/><\/svg>',
    'e': '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10v1"/><\/svg>',
    'i': '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/><\/svg>'
  };
  var el = document.createElement('div');
  el.className = 'toast ' + cls;
  var body = document.createElement('div');
  body.className = 'toast-body';
  body.innerHTML = (icons[type]||icons['s']) + '<span style="flex:1">' + esc(msg) + '</span><button class="toast-close" onclick="removeToast(this.parentNode.parentNode)">&times;<\/button>';
  var bar = document.createElement('div');
  bar.className = 'toast-bar';
  bar.style.animationDuration = duration + 'ms';
  el.appendChild(body);
  el.appendChild(bar);
  var c = document.getElementById('toast-container');
  if (c) c.appendChild(el);
  setTimeout(function() { removeToast(el); }, duration);
}
function removeToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('removing');
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
}
// ── CONFIRM MODAL ─────────────────────────────────────────────────────────────
var _confirmResolve = null;
function confirm2(title, msg, btnLabel, danger) {
  return new Promise(function(resolve) {
    _confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    var okBtn = document.getElementById('confirm-ok');
    okBtn.textContent = btnLabel || 'Confirmer';
    okBtn.style.background = danger !== false ? 'var(--danger)' : 'var(--brand-azure-deep)';
    document.getElementById('confirm-modal').classList.add('show');
  });
}
function setupConfirmModal() {
  var okBtn = document.getElementById('confirm-ok');
  var cancelBtn = document.getElementById('confirm-cancel');
  if (okBtn) okBtn.addEventListener('click', function() {
    document.getElementById('confirm-modal').classList.remove('show');
    if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
  });
  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    document.getElementById('confirm-modal').classList.remove('show');
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  });
}
// ── INLINE VALIDATION N° LISTE ────────────────────────────────────────────────
function initNlistValidation() {
  var input = document.getElementById('nlist');
  if (!input) return;
  input.oninput = function() {
    var v = this.value.trim();
    var errEl = document.getElementById('nlist-err');
    this.classList.remove('invalid','valid');
    if (errEl) errEl.classList.remove('show');
    if (!v) return;
    if (!/^\d+$/.test(v)) {
      this.classList.add('invalid');
      if (errEl) { errEl.textContent = 'Chiffres uniquement.'; errEl.classList.add('show'); }
      return;
    }
    if (E.find(function(e) { return e.numero === v; })) {
      this.classList.add('invalid');
      if (errEl) { errEl.textContent = 'Ce numéro correspond déjà à un envoi.'; errEl.classList.add('show'); }
      return;
    }
    if (v.length >= 4) this.classList.add('valid');
  };
}
function showSuccessModal(num){
  var t=document.getElementById('success-title-el');if(t)t.textContent='Envoi enregistré';
  var cb=document.getElementById('success-close-btn');if(cb)cb.textContent='Nouvel envoi';
  var msgEl=document.getElementById('success-modal-msg');
  if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+esc(num)+'</strong> enregistré avec succès.';
  var pb=document.getElementById('success-print-btn');
  if(pb){pb.style.display=CFG.printBordereau?'flex':'none';pb.onclick=function(){closeSuccessModal();printBordereau();};}
  document.getElementById('success-modal').style.display='flex';
}
function closeSuccessModal(){
  document.getElementById('success-modal').style.display='none';
}

// ── MODIFICATION ENVOI ───────────────────────────────────────────────────────
function openEditEnvoi(id){
  var e=E.find(function(x){return x.id===id;});if(!e)return;
  E_ENVOI_ID=id;
  document.getElementById('e-nlist-ro').textContent=e.numero;
  document.getElementById('e-exp-ro').textContent=e.exp;
  document.getElementById('e-dest-ro').textContent=e.dest;
  document.getElementById('e-serr').style.display='none';
  // Transporteur
  var et=document.getElementById('e-trans');
  et.innerHTML='<option value="">— Sélectionner —</option>';
  CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;et.appendChild(o);});
  et.value=e.transporteur;
  // Type spécimen
  var es=document.getElementById('e-tspec');
  es.innerHTML='';
  CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;es.appendChild(o);});
  es.value=e.typeSpecimen||'exempt';
  // Nb échantillons
  document.getElementById('e-ntub').value=e.tubes||'';
  // Notes
  document.getElementById('e-notes').value=e.notes||'';
  // Températures
  E_ST=e.temp;
  renderEditTempPills();
  // Glace
  E_SGC=e.glaceSeche||false;
  var tCfg=CFG.temperatures.find(function(t){return t.label===e.temp;});
  var gs=document.getElementById('e-glace-section');
  if(gs){
    if(tCfg&&tCfg.ask_glace){gs.style.display='';setEditGlace(e.glaceSeche);}
    else{gs.style.display='none';}
  }
  // Départements
  E_SD=(e.depts||[]).slice();
  updateEditDeptPills();
  closeGMod();
  document.getElementById('edit-envoi-modal').style.display='flex';
}
function closeEditEnvoi(){
  document.getElementById('edit-envoi-modal').style.display='none';
  E_ENVOI_ID=null;
}
function renderEditTempPills(){
  var c=document.getElementById('e-tpills-c');if(!c)return;c.innerHTML='';
  CFG.temperatures.forEach(function(t,i){
    var cls=PCLS[i%PCLS.length];
    var el=document.createElement('div');
    el.className='tpill'+(t.label===E_ST?' '+cls:'');
    el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);
    el.onclick=(function(lbl,pc){return function(){sEditTemp(lbl,pc);};})(t.label,cls);
    c.appendChild(el);
  });
}
function sEditTemp(lbl,pc){
  E_ST=lbl;E_SGC=false;
  document.querySelectorAll('#e-tpills-c .tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=CFG.temperatures.find(function(t){return t.label===lbl;});
  var gs=document.getElementById('e-glace-section');
  if(gs){
    if(tCfg&&tCfg.ask_glace){gs.style.display='';E_SGC=null;}
    else{gs.style.display='none';E_SGC=false;}
  }
}
function setEditGlace(val){
  E_SGC=val;
  var btnO=document.getElementById('e-btn-glace-oui'),btnN=document.getElementById('e-btn-glace-non');
  if(btnO)btnO.style.outline=val?'2px solid var(--brand-azure-deep)':'';
  if(btnN)btnN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}
function tEditDept(d){
  var ix=E_SD.indexOf(d);if(ix===-1)E_SD.push(d);else E_SD.splice(ix,1);
  updateEditDeptPills();
}
function updateEditDeptPills(){
  var cm={BIOCHIMIE:'dp-bio',HEMATOLOGIE:'dp-hema',MICROBIOLOGIE:'dp-micro',PATHOLOGIE:'dp-patho'};
  DEPTS.forEach(function(x){var el=document.getElementById('edp-'+x.id);if(el)el.className='dpill '+cm[x.id]+(E_SD.indexOf(x.id)!==-1?' on':'');});
}
async function saveEditEnvoi(){
  if(!E_ST){ban('e-serr','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=CFG.temperatures.find(function(t){return t.label===E_ST;});
  if(tCfg&&tCfg.ask_glace&&E_SGC===null){ban('e-serr','Veuillez sélectionner le type de réfrigérant.','e');return;}
  var tr=document.getElementById('e-trans').value;
  if(!tr){ban('e-serr','Veuillez sélectionner un transporteur.','e');return;}
  if(!E_SD.length){ban('e-serr','Veuillez sélectionner au moins un département.','e');return;}
  var e=E.find(function(x){return x.id===E_ENVOI_ID;});if(!e)return;
  var tubes=parseInt(document.getElementById('e-ntub').value)||null;
  var spec=document.getElementById('e-tspec').value;
  var notes=document.getElementById('e-notes').value;
  var oldData={temperature:e.temp,transporteur:e.transporteur,nb_echantillons:e.tubes,departements:e.depts||[],notes:e.notes||'',type_specimen:e.typeSpecimen||'exempt',glace_seche:e.glaceSeche||false};
  var newData={temperature:E_ST,transporteur:tr,nb_echantillons:tubes,departements:E_SD.slice(),notes:notes,type_specimen:spec,glace_seche:E_SGC===true};
  var changedFields=Object.keys(newData).filter(function(k){return JSON.stringify(oldData[k])!==JSON.stringify(newData[k]);});
  if(!changedFields.length){closeEditEnvoi();return;}
  var r=await sb.from('envois').update({temperature:E_ST,transporteur:tr,nb_echantillons:tubes,departements:E_SD.slice(),notes:notes,type_specimen:spec,glace_seche:E_SGC===true}).eq('id',E_ENVOI_ID);
  if(r.error){ban('e-serr','Erreur : '+r.error.message,'e');return;}
  // Log d'audit
  await sb.from('envois_audit').insert({table_name:'envois',record_id:E_ENVOI_ID,action:'UPDATE',old_data:oldData,new_data:newData,changed_fields:changedFields,changed_by_id:CU.id,changed_by_nom:CU.nom});
  // Données pour réimpression
  var destLab=LABS.find(function(l){return l.id===e.destId;})||{};
  var expLab=LABS.find(function(l){return l.id===e.expId;})||{};
  _printData={numero:e.numero,exp:e.exp,dest:e.dest,temp:E_ST,transporteur:tr,tubes:tubes,depts:E_SD.slice(),notes:notes,creePar:e.creePar,tsEnvoi:e.tsEnvoi,typeSpecimen:spec,glaceSeche:E_SGC===true,expAdresse:expLab.adresse||'',expAdresse2:expLab.adresse2||'',expVille:expLab.ville||'',expProvince:expLab.province||'',expCodePostal:expLab.code_postal||'',expPays:expLab.pays||'',expTel:expLab.telephone||'',destAdresse:destLab.adresse||'',destAdresse2:destLab.adresse2||'',destVille:destLab.ville||'',destProvince:destLab.province||'',destCodePostal:destLab.code_postal||'',destPays:destLab.pays||'',destTel:destLab.telephone||''};
  var isHsilp=e.numero&&e.numero.indexOf('HSILP')===0;
  closeEditEnvoi();
  showSuccessModalEdit(e.numero,isHsilp);
}
function showSuccessModalEdit(num,isHsilp){
  var t=document.getElementById('success-title-el');if(t)t.textContent='Envoi modifié';
  var cb=document.getElementById('success-close-btn');if(cb)cb.textContent='Fermer';
  var msgEl=document.getElementById('success-modal-msg');
  if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+esc(num)+'</strong> modifié avec succès.<br><small style="color:var(--t2);font-size:11px;font-weight:400">Pensez à remplacer le bordereau dans la boîte d\'envoi.</small>';
  var pb=document.getElementById('success-print-btn');
  var showPrint=isHsilp||CFG.printBordereau;
  if(pb){
    pb.style.display=showPrint?'flex':'none';
    var fmt=isHsilp?CFG.hsilpBordereauFormat||'bordereau':undefined;
    pb.onclick=function(){closeSuccessModal();printBordereau(fmt);};
  }
  document.getElementById('success-modal').style.display='flex';
}

// ── MODAL CONFIRMATION "PAS DE LISTE SILP" ───────────────────────────────────
var _noListCb=null;
function showNoListModal(cb){_noListCb=cb;document.getElementById('hsilp-warn-modal').style.display='flex';}
function cancelNoList(){_noListCb=null;document.getElementById('hsilp-warn-modal').style.display='none';}
function confirmNoList(){document.getElementById('hsilp-warn-modal').style.display='none';var f=_noListCb;_noListCb=null;if(f)f();}

// Toggle checkbox "pas de liste SILP" — intra-grappe
function toggleNoSilp(){
  var cb=document.getElementById('no-silp-cb');
  if(cb&&cb.checked){
    cb.checked=false; // annuler temporairement, en attente de confirmation
    showNoListModal(function(){
      cb.checked=true;SILP_NO_LIST=true;
      _applyNoSilpUi(true);fetchHsilpPreviewNum();
    });
  }else{
    SILP_NO_LIST=false;_applyNoSilpUi(false);
  }
}
function _applyNoSilpUi(on){
  var wrap=document.getElementById('nlist-wrap'),warn=document.getElementById('no-silp-warn'),nw=document.getElementById('no-silp-num-wrap');
  if(wrap)wrap.style.display=on?'none':'';
  if(warn)warn.style.display=on?'':'none';
  if(nw)nw.style.display=on?'':'none';
}

// Toggle checkbox "pas de liste SILP" — hors-grappe
function toggleHgsNoSilp(){
  var cb=document.getElementById('hgs-no-silp-cb');
  if(cb&&cb.checked){
    cb.checked=false;
    showNoListModal(function(){
      cb.checked=true;HGS_NO_LIST=true;
      _applyHgsNoSilpUi(true);fetchHgHsilpPreviewNum();
    });
  }else{
    HGS_NO_LIST=false;_applyHgsNoSilpUi(false);
  }
}
function _applyHgsNoSilpUi(on){
  var wrap=document.getElementById('hgs-nlist-wrap'),warn=document.getElementById('hgs-no-silp-warn'),nw=document.getElementById('hgs-no-silp-num-wrap');
  if(wrap)wrap.style.display=on?'none':'';
  if(warn)warn.style.display=on?'':'none';
  if(nw)nw.style.display=on?'':'none';
}
async function fetchHsilpPreviewNum(){
  var el=document.getElementById('h-nlist');if(!el)return;
  el.value='Chargement…';el.classList.remove('valid');
  try{
    var r=await sb.rpc('peek_next_hsilp');
    if(!r.error&&r.data){el.value=r.data;el.classList.add('valid');}
    else{el.value='HSILP#####';}
  }catch(e){el.value='HSILP#####';}
}

// Modal succès HSILP + impression forcée
function showSuccessModalHsilp(num){
  var msgEl=document.getElementById('success-modal-msg');
  if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+esc(num)+'</strong> enregistré avec succès.';
  var pb=document.getElementById('success-print-btn');
  if(pb){
    pb.style.display='flex';
    pb.onclick=function(){closeSuccessModal();printBordereau(CFG.hsilpBordereauFormat||'bordereau');};
  }
  document.getElementById('success-modal').style.display='flex';
  setTimeout(function(){printBordereau(CFG.hsilpBordereauFormat||'bordereau');},400);
}

// Config format HSILP
function renderCfgHsilpFormat(){
  var el=document.getElementById('hsilp-fmt-list');if(!el)return;
  var active=CFG.hsilpBordereauFormat||'bordereau';
  var opts=CFG.bordereau.formats.map(function(f){
    return '<option value="'+esc(f.id)+'"'+(f.id===active?' selected':'')+'>'+esc(f.nom)+'</option>';
  }).join('');
  var active_f=CFG.bordereau.formats.find(function(f){return f.id===active;})||{};
  el.innerHTML='<div class="fgg">'
    +'<select id="hsilp-fmt-sel" style="width:100%" onchange="saveHsilpFormat(this.value)">'+opts+'</select>'
    +(active_f.desc?'<div class="cfg-hint" id="hsilp-fmt-hint" style="margin-top:6px">'+esc(active_f.desc)+'</div>':'')
    +'</div>';
}
async function saveHsilpFormat(id){
  CFG.hsilpBordereauFormat=id;
  var hint=document.getElementById('hsilp-fmt-hint');
  if(hint){var f=CFG.bordereau.formats.find(function(x){return x.id===id;})||{};hint.textContent=f.desc||'';}
  if(await saveCfg('hsilp_bordereau_format',id))ban('cfgsuc','Format Hors SILP mis à jour.','s');
}

// ── KEYBOARD ─────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var hwmod = document.getElementById('hsilp-warn-modal');
    var smod = document.getElementById('success-modal');
    var hgsmod = document.getElementById('hg-success-modal');
    var hgfmod = document.getElementById('hg-fax-modal');
    var hgemod = document.getElementById('hg-edit-modal');
    var gmod = document.getElementById('gmod');
    var cmod = document.getElementById('confirm-modal');
    var ewmod = document.getElementById('edit-envoi-modal');
    if (hwmod && hwmod.style.display==='flex') { cancelNoList(); return; }
    if (ewmod && ewmod.style.display==='flex') { closeEditEnvoi(); return; }
    if (hgemod && hgemod.style.display==='flex') { closeHGEditModal(); return; }
    if (hgfmod && hgfmod.style.display==='flex') { closeHGFaxModal(); return; }
    if (hgsmod && hgsmod.style.display==='flex') {
      if(document.getElementById('hg-printed-cb').checked)closeHGSuccessModal();
      return;
    }
    if (smod && smod.style.display==='flex') { closeSuccessModal(); return; }
    if (gmod && gmod.classList.contains('show')) { closeGMod(); return; }
    if (cmod && cmod.classList.contains('show')) {
      cmod.classList.remove('show');
      if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Mode switcher
// ══════════════════════════════════════════════════════════════════════════════

function isHGEnabled(){
  if(!CU)return false;
  if(isAdmin())return true;
  var labs=CFG.hgrappeEnabledLabs||[];
  return labs.indexOf(CU.labo_id)!==-1;
}

function initHGMode(){
  var canHG=isHGEnabled();
  var sw=document.getElementById('mode-sw');
  if(sw)sw.classList.toggle('gone',!canHG);
  if(!canHG){HG_MODE=false;updateSidebarForMode();return;}
  var saved=localStorage.getItem('optilab-mode')||'intra';
  HG_MODE=saved==='hgrappe';
  updateSidebarForMode();
  if(HG_MODE){
    Promise.all([loadExtLabs(),loadEnvoisHG()]).then(function(){
      var a=document.querySelector('.panel.active');if(!a)return;
      var n=a.id.replace('panel-','');
      if(n==='hg-silp')initHgSilpForm();
      else if(n==='hg-hsilp')initHgSilpForm();
      else if(n==='hg-confirmations')renderHGConfirmations();
      else if(n==='hg-resume')renderHGResume();
      else if(n==='hg-historique')renderHGHistorique();
      else if(n==='config')renderExtLabsList();
    });
    var td=new Date(),fd=new Date(td);fd.setDate(fd.getDate()-30);
    var f30=fd.toISOString().slice(0,10),t0=td.toISOString().slice(0,10);
    ['hgc-from','hgc-to','hgr-from','hgr-to','hgh-from','hgh-to'].forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.value=id.endsWith('-from')||id.endsWith('-from')?f30:t0;
    });
    document.getElementById('hgc-from').value=f30;document.getElementById('hgc-to').value=t0;
    document.getElementById('hgr-from').value=f30;document.getElementById('hgr-to').value=t0;
    document.getElementById('hgh-from').value=f30;document.getElementById('hgh-to').value=t0;
    var hgrls=document.getElementById('hgr-ls');
    if(hgrls&&isG()){hgrls.classList.remove('gone');hgrls.innerHTML='';LABS.forEach(function(l){var o=document.createElement('option');o.value=l.id;o.textContent=l.name;hgrls.appendChild(o);});if(CU.labo_id)hgrls.value=CU.labo_id;}
  }
}

function updateSidebarForMode(){
  var ig=document.getElementById('nav-intra-group'),hg=document.getElementById('nav-hgrappe-group');
  if(ig)ig.classList.toggle('gone',HG_MODE);
  if(hg)hg.classList.toggle('gone',!HG_MODE);
  var lbl=document.getElementById('mode-sw-label');
  if(lbl)lbl.textContent=HG_MODE?'Hors-grappe':'Intra-grappe';
  var ico=document.getElementById('mode-sw-ico');
  if(ico){ico.innerHTML=HG_MODE?'<path d="m15 15 6 6"/><path d="m15 9 6-6"/><path d="M21 16v5h-5"/><path d="M21 8V3h-5"/><path d="M3 16v5h5"/><path d="m3 21 6-6"/><path d="M3 8V3h5"/><path d="M9 9 3 3"/>':'<path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/>';}
  var oi=document.getElementById('mode-opt-intra'),oh=document.getElementById('mode-opt-hgrappe');
  if(oi){oi.style.fontWeight=HG_MODE?'400':'700';oi.style.color=HG_MODE?'':'rgba(255,255,255,.9)';}
  if(oh){oh.style.fontWeight=HG_MODE?'700':'400';oh.style.color=HG_MODE?'rgba(255,255,255,.9)':'';}
  // Couleur de la sidebar + badge mode
  var sidebar=document.querySelector('.sidebar');
  if(sidebar)sidebar.classList.toggle('hg-mode',HG_MODE);
  var badge=document.getElementById('sb-mode-badge');
  if(badge){var hasModes=!document.getElementById('mode-sw').classList.contains('gone');badge.textContent=HG_MODE?'Hors-grappe':'Intra-grappe';badge.className='sb-mode-badge'+(hasModes?' '+(HG_MODE?'badge-hg':'badge-intra'):'');}
  // Fermer le dropdown
  var drop=document.getElementById('mode-sw-drop');if(drop)drop.classList.add('gone');
}

function setMode(mode){
  localStorage.setItem('optilab-mode',mode);
  HG_MODE=mode==='hgrappe';
  updateSidebarForMode();
  if(HG_MODE){
    sp('hg-silp');
    Promise.all([loadExtLabs(),loadEnvoisHG()]).then(function(){
      var a=document.querySelector('.panel.active');if(!a)return;
      var n=a.id.replace('panel-','');
      if(n==='hg-silp')initHgSilpForm();
      else if(n==='hg-hsilp')initHgSilpForm();
    });
  }else{
    sp('nouveau');
  }
}

function toggleModeDrop(e){
  if(e)e.stopPropagation();
  var drop=document.getElementById('mode-sw-drop');
  if(!drop)return;
  var isOpen=!drop.classList.contains('gone');
  drop.classList.toggle('gone',isOpen);
  if(!isOpen){
    // Fermer en cliquant ailleurs
    setTimeout(function(){document.addEventListener('click',function close(){drop.classList.add('gone');document.removeEventListener('click',close);},{once:true});},50);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Sélecteurs destinataire (external_labs)
// ══════════════════════════════════════════════════════════════════════════════

// ── Helpers affichage deux lignes destination HG ──────────────────────────────
function hgDestLine(e){
  var lab=e.destLab;
  if(!lab)return esc(e.dest||'—');
  var parentName=lab.parent?lab.parent.name:null;
  if(parentName)return '<span>'+esc(parentName)+'</span><br><span style="font-size:11px;color:var(--t2);padding-left:8px">↳ '+esc(lab.name)+'</span>';
  return esc(lab.name||'—');
}
function hgDestText(e){
  var lab=e.destLab;
  if(!lab)return e.dest||'';
  var parentName=lab.parent?lab.parent.name:'';
  return (parentName?parentName+' ':'')+lab.name;
}
function hgDestAddr(lab){
  if(!lab)return null;
  var p=lab.parent_id&&lab.parent?lab.parent:{};
  function f(field){return lab[field]||p[field]||'';}
  var r={adresse:f('adresse'),adresse2:f('adresse2'),ville:f('ville'),code_postal:f('code_postal'),province:f('province'),pays:f('pays'),telephone:f('telephone')};
  if(!r.adresse&&!r.adresse2&&!r.ville&&!r.code_postal&&!r.province&&!r.pays&&!r.telephone)return null;
  return r;
}

// ── Sélection labo externe : parent d'abord, puis enfant si dispo ─────────────
function buildHgParentSelect(selId){
  var sel=document.getElementById(selId);if(!sel)return;
  var parentIds=EXT_LABS.filter(function(l){return !l.parent_id;}).map(function(l){return l.id;});
  var roots=EXT_LABS.filter(function(l){return !l.parent_id||!parentIds.includes(l.parent_id);});
  sel.innerHTML='<option value="">— Sélectionner un laboratoire —</option>';
  roots.forEach(function(l){var o=document.createElement('option');o.value=l.id;o.textContent=l.name;sel.appendChild(o);});
}
function updateHgDestSelection(parentSelId,childSelId,childWrapId,hiddenId,addrId){
  var parentId=document.getElementById(parentSelId).value;
  var childWrap=document.getElementById(childWrapId);
  var childSel=document.getElementById(childSelId);
  var hidden=document.getElementById(hiddenId);
  var addrEl=document.getElementById(addrId);
  if(!parentId){childWrap.style.display='none';hidden.value='';if(addrEl)addrEl.innerHTML='';return;}
  var children=EXT_LABS.filter(function(l){return l.parent_id===parentId;});
  if(children.length){
    childWrap.style.display='';
    childSel.innerHTML='<option value="">— Laboratoire principal uniquement —</option>';
    children.forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent=c.name;childSel.appendChild(o);});
    childSel.value='';
  } else {
    childWrap.style.display='none';
  }
  hidden.value=parentId;
  showHgDestAddrEl(parentId,addrEl);
}
function updateHgDestChild(parentSelId,childSelId,hiddenId,addrId){
  var childId=document.getElementById(childSelId).value;
  var parentId=document.getElementById(parentSelId).value;
  var hidden=document.getElementById(hiddenId);
  hidden.value=childId||parentId;
  showHgDestAddrEl(childId||parentId,document.getElementById(addrId));
}
function showHgDestAddrEl(labId,addrEl){
  if(!addrEl)return;
  var lab=EXT_LABS.find(function(l){return l.id===labId;});
  if(!lab){addrEl.innerHTML='';return;}
  var src=(lab.parent_id)?EXT_LABS.find(function(p){return p.id===lab.parent_id;})||lab:lab;
  var lines=[];
  if(src.adresse)lines.push(esc(src.adresse));
  if(src.adresse2)lines.push(esc(src.adresse2));
  var cityLine=[src.ville,src.province,src.code_postal].filter(Boolean).join(', ');
  if(cityLine)lines.push(esc(cityLine));
  if(src.pays)lines.push(esc(src.pays));
  if(src.telephone||lab.telephone)lines.push(esc(src.telephone||lab.telephone));
  addrEl.innerHTML=lines.length?'<span style="font-size:10px;color:var(--t3);line-height:1.5">'+lines.join(' · ')+'</span>':'';
}
function onHgSilpParentChange(){updateHgDestSelection('hgs-parent','hgs-child','hgs-child-wrap','hgs-ldest','hgs-dest-addr');}
function onHgSilpChildChange(){updateHgDestChild('hgs-parent','hgs-child','hgs-ldest','hgs-dest-addr');}
function onHghParentChange(){updateHgDestSelection('hgh-parent','hgh-child','hgh-child-wrap','hgh-ldest','hgh-dest-addr');}
function onHghChildChange(){updateHgDestChild('hgh-parent','hgh-child','hgh-ldest','hgh-dest-addr');}

// Construit l'objet destLab (avec parent résolu depuis EXT_LABS) pour _hgPrintData
function buildHgDestLabObj(destId){
  var lab=EXT_LABS.find(function(l){return l.id===destId;})||null;
  if(!lab)return null;
  var parent=lab.parent_id?EXT_LABS.find(function(p){return p.id===lab.parent_id;})||null:null;
  return Object.assign({},lab,{parent:parent});
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Formulaire SILP
// ══════════════════════════════════════════════════════════════════════════════

function initHgSilpForm(){
  var expLab=LABS.find(function(l){return l.id===CU.labo_id;})||{};
  var el=document.getElementById('hgs-lexp');if(el)el.value=CU.lab?CU.lab.name:(expLab.name||'');
  var ea=document.getElementById('hgs-lexp-addr');if(ea)ea.textContent=fmtLabAddr(expLab);
  buildHgParentSelect('hgs-parent');
  var tr=document.getElementById('hgs-trans');
  if(tr){tr.innerHTML='<option value="">— Sélectionner —</option>';CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;tr.appendChild(o);});}
  var ts=document.getElementById('hgs-tspec');
  if(ts){ts.innerHTML='';CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;ts.appendChild(o);});}
  renderHgsTempPills();
}
function renderHgsTempPills(){
  var c=document.getElementById('hgs-tpills-c');if(!c)return;c.innerHTML='';
  CFG.temperatures.forEach(function(t,i){
    var cls=PCLS[i%PCLS.length];
    var el=document.createElement('div');el.className='tpill';el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);
    el.onclick=(function(lbl,pc){return function(){sHgsTemp(lbl,pc);};})(t.label,cls);
    c.appendChild(el);
  });
  HGS_ST='';
}
function sHgsTemp(lbl,pc){
  HGS_ST=lbl;HGS_SGC=false;
  document.querySelectorAll('#hgs-tpills-c .tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=CFG.temperatures.find(function(t){return t.label===lbl;});
  var gs=document.getElementById('hgs-glace-section');
  if(gs){
    if(tCfg&&tCfg.ask_glace){gs.style.display='';var expLab=CU&&LABS.find(function(l){return l.id===CU.labo_id;});var defRef=expLab&&expLab.default_refrigerant;if(defRef==='glace_seche'){HGS_SGC=true;setHgsSGC(true);}else if(defRef==='sachet'){HGS_SGC=false;setHgsSGC(false);}else{HGS_SGC=null;}}
    else{gs.style.display='none';HGS_SGC=false;}
  }
}
function setHgsSGC(val){
  HGS_SGC=val;
  var bO=document.getElementById('hgs-btn-glace-oui'),bN=document.getElementById('hgs-btn-glace-non');
  if(bO)bO.style.outline=val?'2px solid var(--brand-azure-deep)':'';
  if(bN)bN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}

// Gestion multi-listes de repérage
function addHgsList(){
  var inp=document.getElementById('hgs-nlist-input'),errEl=document.getElementById('hgs-nlist-err');
  var v=inp.value.trim();
  errEl.classList.remove('show');
  if(!v)return;
  if(!/^\d+$/.test(v)){errEl.textContent='Uniquement des chiffres.';errEl.classList.add('show');return;}
  if(HGS_LISTS.indexOf(v)!==-1){errEl.textContent='Ce numéro est déjà dans la liste.';errEl.classList.add('show');return;}
  if(EHG.some(function(e){return e.numerosSilp&&e.numerosSilp.indexOf(v)!==-1;})){errEl.textContent='Ce numéro est déjà lié à un envoi Hors-grappe existant.';errEl.classList.add('show');return;}
  HGS_LISTS.push(v);inp.value='';renderHgsChips();inp.focus();
}
function removeHgsList(v){
  HGS_LISTS=HGS_LISTS.filter(function(x){return x!==v;});renderHgsChips();
}
function renderHgsChips(){
  var el=document.getElementById('hgs-nlist-chips');if(!el)return;
  el.innerHTML=HGS_LISTS.map(function(v){
    return '<div class="nlist-chip"><span>'+esc(v)+'</span>'
      +'<button type="button" onclick="removeHgsList(\''+esc(v)+'\')" title="Retirer">&times;</button></div>';
  }).join('');
}
function resetHgSilpForm(){
  var ps=document.getElementById('hgs-parent');if(ps)ps.value='';
  var cw=document.getElementById('hgs-child-wrap');if(cw)cw.style.display='none';
  document.getElementById('hgs-ldest').value='';
  var da=document.getElementById('hgs-dest-addr');if(da)da.innerHTML='';
  document.getElementById('hgs-notes').value='';document.getElementById('hgs-trans').value='';
  document.getElementById('hgs-ntub').value='';
  HGS_ST='';HGS_SGC=false;HGS_LISTS=[];
  renderHgsChips();
  var gs=document.getElementById('hgs-glace-section');if(gs)gs.style.display='none';
  document.querySelectorAll('#hgs-tpills-c .tpill').forEach(function(el){el.className='tpill';});
  var ts=document.getElementById('hgs-tspec');if(ts)ts.value=CFG.bordereau.specTypes[0]&&CFG.bordereau.specTypes[0].id||'exempt';
  // Reset checkbox "pas de liste SILP"
  HGS_NO_LIST=false;var cb=document.getElementById('hgs-no-silp-cb');if(cb)cb.checked=false;
  var w=document.getElementById('hgs-nlist-wrap'),warn=document.getElementById('hgs-no-silp-warn'),nw=document.getElementById('hgs-no-silp-num-wrap');
  if(w)w.style.display='';if(warn)warn.style.display='none';if(nw)nw.style.display='none';
}
async function saveEnvoiHgSilp(){
  var destId=document.getElementById('hgs-ldest').value,tr=document.getElementById('hgs-trans').value;
  if(!destId){ban('hgs-serr','Veuillez sélectionner un laboratoire destinataire.','e');return;}
  if(!HGS_ST){ban('hgs-serr','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=CFG.temperatures.find(function(t){return t.label===HGS_ST;});
  if(tCfg&&tCfg.ask_glace&&HGS_SGC===null){ban('hgs-serr','Veuillez sélectionner le type de réfrigérant.','e');return;}
  if(!tr){ban('hgs-serr','Veuillez sélectionner un transporteur.','e');return;}
  // Cas "pas de liste SILP" : le modal a déjà été confirmé au coche, on sauvegarde directement
  if(HGS_NO_LIST){
    await _doSaveEnvoiHgHsilp();
    return;
  }
  if(!HGS_LISTS.length){ban('hgs-serr','Veuillez ajouter au moins un numéro de liste de repérage.','e');return;}
  var tubes=parseInt(document.getElementById('hgs-ntub').value)||null;
  var spec=document.getElementById('hgs-tspec')?document.getElementById('hgs-tspec').value:'exempt';
  var r=await sb.rpc('create_envoi_hgrappe',{p_source:'silp',p_exp_labo_id:CU.labo_id,p_dest_ext_lab_id:destId,p_temperature:HGS_ST,p_transporteur:tr,p_nb_echantillons:tubes,p_numeros_silp:HGS_LISTS.slice(),p_notes:document.getElementById('hgs-notes').value,p_cree_par_id:CU.id,p_cree_par_nom:CU.nom,p_type_specimen:spec,p_glace_seche:HGS_SGC===true});
  if(r.error){ban('hgs-serr','Erreur : '+r.error.message,'e');return;}
  var result=r.data,destLabObj=buildHgDestLabObj(destId),expLab=LABS.find(function(l){return l.id===CU.labo_id;})||{};
  var destDispName=destLabObj?(destLabObj.parent?(destLabObj.parent.name+'\n'+destLabObj.name):(destLabObj.name||'—')):'—';
  _hgPrintData={numero:result.numero,token:result.token,source:'silp',exp:CU.lab?CU.lab.name:(expLab.name||'—'),dest:destDispName,destLab:destLabObj,temp:HGS_ST,transporteur:tr,tubes:tubes,numerosSilp:HGS_LISTS.slice(),notes:document.getElementById('hgs-notes').value.trim(),creePar:CU.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:HGS_SGC===true,expLab:expLab};
  resetHgSilpForm();await loadEnvoisHG();showHGSuccessModal(result.numero);
}
async function _doSaveEnvoiHgHsilp(){
  var destId=document.getElementById('hgs-ldest').value,tr=document.getElementById('hgs-trans').value;
  var tubes=parseInt(document.getElementById('hgs-ntub').value)||null;
  var spec=document.getElementById('hgs-tspec')?document.getElementById('hgs-tspec').value:'exempt';
  var r=await sb.rpc('create_envoi_hgrappe',{p_source:'hsilp',p_exp_labo_id:CU.labo_id,p_dest_ext_lab_id:destId,p_temperature:HGS_ST,p_transporteur:tr,p_nb_echantillons:tubes,p_numeros_silp:[],p_notes:document.getElementById('hgs-notes').value,p_cree_par_id:CU.id,p_cree_par_nom:CU.nom,p_type_specimen:spec,p_glace_seche:HGS_SGC===true});
  if(r.error){ban('hgs-serr','Erreur : '+r.error.message,'e');return;}
  var result=r.data,destLabObj=buildHgDestLabObj(destId),expLab=LABS.find(function(l){return l.id===CU.labo_id;})||{};
  var destDispName=destLabObj?(destLabObj.parent?(destLabObj.parent.name+'\n'+destLabObj.name):(destLabObj.name||'—')):'—';
  _hgPrintData={numero:result.numero,token:result.token,source:'hsilp',exp:CU.lab?CU.lab.name:(expLab.name||'—'),dest:destDispName,destLab:destLabObj,temp:HGS_ST,transporteur:tr,tubes:tubes,numerosSilp:[],notes:document.getElementById('hgs-notes').value.trim(),creePar:CU.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:HGS_SGC===true,expLab:expLab};
  resetHgSilpForm();await loadEnvoisHG();showHGSuccessModal(result.numero);
}

async function fetchHgHsilpPreviewNum(){
  var el=document.getElementById('hgh-nlist');if(!el)return;
  el.value='Chargement…';el.classList.remove('valid');
  try{var r=await sb.rpc('peek_next_hgrappe');if(!r.error&&r.data){el.value=r.data;el.classList.add('valid');}else{el.value='HG-######-#####';}}catch(e){el.value='HG-######-#####';}
}
// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Modal succès + impression
// ══════════════════════════════════════════════════════════════════════════════

function showHGSuccessModal(num){
  var cb=document.getElementById('hg-printed-cb');if(cb){cb.checked=false;}
  var cl=document.getElementById('hg-success-close-btn');
  if(cl){cl.disabled=true;cl.style.opacity='.4';cl.style.cursor='not-allowed';}
  var msgEl=document.getElementById('hg-success-msg');
  if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+esc(num)+'</strong> enregistré avec succès.';
  document.getElementById('hg-success-modal').style.display='flex';
}
function toggleHGClose(){
  var cb=document.getElementById('hg-printed-cb'),cl=document.getElementById('hg-success-close-btn');
  if(!cl)return;
  var ok=cb&&cb.checked;
  cl.disabled=!ok;cl.style.opacity=ok?'1':'.4';cl.style.cursor=ok?'pointer':'not-allowed';
}
function closeHGSuccessModal(){
  document.getElementById('hg-success-modal').style.display='none';
  if(HG_MODE)sp('hg-silp');
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Impression bordereau + F-G-74
// ══════════════════════════════════════════════════════════════════════════════

async function printHGDocs(){
  if(!_hgPrintData)return;
  var d=_hgPrintData;
  var _vc=d.token?d.token.replace(/-/g,'').slice(0,6).toUpperCase():'';
  var barcodeUrl=window.location.origin+'/confirm?n='+encodeURIComponent(d.numero)+'&c='+_vc;
  var _da=hgDestAddr(d.destLab)||{};
  var _dl=d.destLab||null,_pl=_dl&&_dl.parent?_dl.parent:null;
  var destLabelText=(_dl&&_dl.label_text)||(_pl&&_pl.label_text)||'';
  _printData={numero:d.numero,exp:d.exp,dest:d.dest,temp:d.temp,transporteur:d.transporteur,tubes:d.tubes,depts:[],notes:d.notes,creePar:d.creePar,tsEnvoi:d.tsEnvoi,typeSpecimen:d.typeSpecimen,glaceSeche:d.glaceSeche,isHG:true,destLabelText:destLabelText,expAdresse:d.expLab.adresse||'',expVille:d.expLab.ville||'',expCodePostal:d.expLab.code_postal||'',expTel:d.expLab.telephone||'',destAdresse:_da.adresse||'',destAdresse2:_da.adresse2||'',destVille:_da.ville||'',destCodePostal:_da.code_postal||'',destProvince:_da.province||'',destPays:_da.pays||'',destTel:_da.telephone||''};
  // Récupérer le HTML du bordereau (barcode déjà pré-généré comme SVG statique)
  var bordereauHtml=printBordereau(CFG.hgrappeFormat||'bordereau',true)||'';
  // Code-barres N° envoi
  var bcNumeroSvg='';
  var tmpSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  tmpSvg.id='_bc_fg74_num';tmpSvg.style.display='none';document.body.appendChild(tmpSvg);
  try{
    JsBarcode('#_bc_fg74_num',d.numero,{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:10,margin:4});
    tmpSvg.setAttribute('width','100%');tmpSvg.setAttribute('height','62');
  }catch(ex){}
  bcNumeroSvg=tmpSvg.outerHTML;document.body.removeChild(tmpSvg);
  // Code-barres Code de vérification
  var bcCodeSvg='';
  if(_vc){
    var tmpSvg2=document.createElementNS('http://www.w3.org/2000/svg','svg');
    tmpSvg2.id='_bc_fg74_vc';tmpSvg2.style.display='none';document.body.appendChild(tmpSvg2);
    try{
      JsBarcode('#_bc_fg74_vc',_vc,{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:10,margin:4});
      tmpSvg2.setAttribute('width','100%');tmpSvg2.setAttribute('height','62');
    }catch(ex){}
    bcCodeSvg=tmpSvg2.outerHTML;document.body.removeChild(tmpSvg2);
  }
  // QR code — URL courte (numero+code) — évite le décodage Punycode des URL longues avec token UUID
  var qrDataUrl='';
  try{
    qrDataUrl=await new Promise(function(resolve){
      var div=document.createElement('div');
      div.style.cssText='position:fixed;top:-9999px;left:-9999px;width:120px;height:120px;overflow:hidden';
      document.body.appendChild(div);
      try{
        new QRCode(div,{text:barcodeUrl,width:120,height:120,colorDark:'#000000',colorLight:'#ffffff'});
        setTimeout(function(){
          var canvas=div.querySelector('canvas');
          var img=div.querySelector('img');
          var url2=canvas?canvas.toDataURL():(img&&img.src&&img.src.startsWith('data:')?img.src:'');
          document.body.removeChild(div);resolve(url2);
        },350);
      }catch(e2){if(document.body.contains(div))document.body.removeChild(div);resolve('');}
    });
  }catch(e3){}
  printHGCombined(d,barcodeUrl,bordereauHtml,bcNumeroSvg,bcCodeSvg,qrDataUrl);
}


function printHGCombined(d,barcodeUrl,bordereauHtml,bcNumeroSvg,bcCodeSvg,qrDataUrl){
  function xe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // Extraire <style> et <body> du bordereau (document HTML complet statique)
  var bordereauStyle='',bordereauBody='';
  var bsi=bordereauHtml.indexOf('<style');
  if(bsi!==-1){var bse=bordereauHtml.indexOf('</style>',bsi);if(bse!==-1)bordereauStyle=bordereauHtml.substring(bordereauHtml.indexOf('>',bsi)+1,bse);}
  var bdi=bordereauHtml.indexOf('<body');var bde=bordereauHtml.lastIndexOf('</body>');
  if(bdi!==-1&&bde!==-1){bordereauBody=bordereauHtml.substring(bordereauHtml.indexOf('>',bdi)+1,bde);}else{bordereauBody=bordereauHtml;}

  var expLab=d.expLab||{};
  var date=d.tsEnvoi?new Date(d.tsEnvoi).toLocaleString('fr-CA',{dateStyle:'long',timeStyle:'short'}):'—';
  var stCfg=CFG.bordereau.specTypes.find(function(t){return t.id===d.typeSpecimen;})||{label:d.typeSpecimen};
  var tubes=d.tubes;
  var silpHtml=d.numerosSilp&&d.numerosSilp.length
    ?'<tr><td style="font-weight:700;white-space:nowrap;border:1px solid #999;padding:5px 8px">N° liste(s) SILP</td><td style="font-family:monospace;font-size:9pt;border:1px solid #999;padding:5px 8px">'+d.numerosSilp.map(xe).join(' · ')+'</td></tr>':'';
  var fBH=xe(expLab.fax_bio_hema||'');
  var fM=xe(expLab.fax_micro||'');
  var fP=xe(expLab.fax_patho||'');
  var fG=xe(expLab.fax_general||'');
  var hasFax=expLab.fax_bio_hema||expLab.fax_micro||expLab.fax_patho||expLab.fax_general;
  var qrHtml=qrDataUrl
    ?'<img src="'+qrDataUrl+'" style="width:100px;height:100px;display:block;flex-shrink:0" alt="QR code"/>'
    :'<div style="width:100px;height:100px;flex-shrink:0;background:#f5f5f5;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7pt;color:#999;padding:4px;line-height:1.3">QR code<br>non disponible</div>';

  function bil(fr,en){return fr+' <span style="font-style:italic;color:#666;font-weight:400;font-size:.88em">/ '+en+'</span>';}

  var verifyCode=d.token?d.token.replace(/-/g,'').slice(0,6).toUpperCase():'——';
  var confirmBase=window.location.origin+'/confirm';

  // Traductions FR→EN pour le F-G-74 bilingue
  var TEMP_EN={'Ambiant':'Ambient','Température ambiante':'Ambient temperature','Réfrigéré':'Refrigerated','Réfrigérée':'Refrigerated','Congelé':'Frozen','Congelée':'Frozen','Congelé (-80°C)':'Frozen (-80°C)','Congelé (-20°C)':'Frozen (-20°C)','Congelé (azote liquide)':'Frozen (liquid nitrogen)','Température contrôlée':'Controlled temperature'};
  var SPEC_EN={'Exempt':'Exempt','Exempt de réglementation':'Exempt from regulation','Biologique (A)':'Biological (A)','Biologique (B)':'Biological (B)','Matière infectieuse (A)':'Infectious Substance (A)','Matière infectieuse (B)':'Infectious Substance (B)','Substance biologique – Catégorie A':'Biological Substance – Category A','Substance biologique – Catégorie B':'Biological Substance – Category B','Diagnostic':'Diagnostic specimen','Patient':'Patient specimen'};
  function bil2(fr,map){var en=map[fr];return en?xe(fr)+' <em style="color:#666;font-size:8pt">/ '+xe(en)+'</em>':xe(fr);}
  var tempDisplay=bil2(d.temp,TEMP_EN);
  var specDisplay=bil2(stCfg.label||d.typeSpecimen,SPEC_EN);
  var TD='border:1px solid #999;padding:4px 7px';
  var TH='font-weight:700;white-space:nowrap;'+TD+';width:44%';

  var fg74Body=''
    // ── En-tête bilingue compact
    +'<table style="margin-bottom:3mm;border-collapse:collapse;width:100%">'
    +'<tr><td colspan="3" style="text-align:center;font-size:10pt;font-weight:700;background:#ebebeb;border:1.5px solid #333;padding:4px">'
    +'MANAGEMENT DE LA QUALITÉ <span style="font-weight:400;font-size:9pt;color:#555">/ Quality Management</span>'
    +'</td><td style="text-align:center;font-weight:700;font-size:9.5pt;border:1.5px solid #333;padding:4px">F-G-74</td></tr>'
    +'<tr><td colspan="3" style="text-align:center;font-size:9.5pt;font-weight:700;border:1.5px solid #333;padding:4px">'
    +'Confirmation de réception de colis <span style="font-weight:400;font-size:8pt;color:#555">/ Shipment Receipt Confirmation</span>'
    +'</td><td style="text-align:center;font-size:8.5pt;border:1.5px solid #333;padding:4px">Version 5<br><span style="color:#555">Approuvé</span></td></tr>'
    +'</table>'
    // ── Info expéditeur + N° envoi
    +'<div style="display:flex;gap:6mm;margin-bottom:3mm;font-size:9pt">'
    +'<div style="flex:1">'
    +'<div><strong>Expéditeur / <em style="font-weight:400">Sender</em> :</strong> Service de biologie médicale / Medical Biology Service</div>'
    +'<div>CISSS Bas-Saint-Laurent</div>'
    +'<div>Installation / <em>Facility</em> : '+xe(expLab.name||'—')+'</div>'
    +'<div>Téléphone / <em>Phone</em> : '+xe(expLab.telephone||'—')+'</div>'
    +'</div>'
    +'<div style="flex:none;display:flex;flex-direction:column;justify-content:center;align-items:center;border:1.5px solid #333;border-radius:3mm;padding:3mm 5mm;background:#ebebeb">'
    +'<div style="font-size:7pt;color:#555;margin-bottom:1.5mm;letter-spacing:.04em;text-transform:uppercase">N° d\'envoi / Shipment No.</div>'
    +'<div style="font-family:monospace;font-size:13pt;font-weight:700;color:#000;letter-spacing:.05em">'+xe(d.numero)+'</div>'
    +'</div></div>'
    // ── Table expéditeur
    +'<table style="margin-bottom:3mm;border-collapse:collapse;width:100%">'
    +'<tr><td colspan="2" style="background:#333;color:#fff;text-align:center;font-size:9pt;font-weight:700;padding:4px;letter-spacing:.04em">'
    +'À compléter par le laboratoire expéditeur <span style="font-weight:400;font-size:8pt;opacity:.8">/ To be completed by the sending laboratory</span>'
    +'</td></tr>'
    +'<tr><td style="'+TH+'">Date et heure d\'emballage <em style="font-weight:400;color:#666;font-size:8pt">/ Packaging date &amp; time</em></td><td style="'+TD+'">'+xe(date)+'</td></tr>'
    +'<tr><td style="'+TH+'">Température <em style="font-weight:400;color:#666;font-size:8pt">/ Temperature</em></td><td style="'+TD+'">'+tempDisplay+'</td></tr>'
    +'<tr><td style="'+TH+'">Type de spécimen <em style="font-weight:400;color:#666;font-size:8pt">/ Specimen type</em></td><td style="'+TD+'">'+specDisplay+'</td></tr>'
    +(tubes?'<tr><td style="'+TH+'">Nb spécimens <em style="font-weight:400;color:#666;font-size:8pt">/ No. of specimens</em></td><td style="'+TD+'">'+xe(tubes)+'</td></tr>':'')
    +'<tr><td style="'+TH+'">Destination</td><td style="'+TD+'">'+(function(){var lab=d.destLab;if(!lab)return xe(d.dest);var pn=lab.parent?lab.parent.name:null;return pn?xe(pn)+'<br><span style="font-size:8pt;color:#555">↳ '+xe(lab.name)+'</span>':xe(lab.name||d.dest);})()+'</td></tr>'
    +'<tr><td style="'+TH+'">Transporteur <em style="font-weight:400;color:#666;font-size:8pt">/ Carrier</em></td><td style="'+TD+'">'+xe(d.transporteur)+'</td></tr>'
    +silpHtml
    +'<tr><td style="'+TH+'">Signature</td>'
    +'<td style="'+TD+';font-family:\'Brush Script MT\',\'Segoe Script\',cursive;font-size:14pt;color:#222">'+xe(d.creePar)+'</td></tr>'
    +'</table>'
    // ── Option 1 — confirmation en ligne : QR + credentials + code-barres
    +'<div style="padding:3mm 4mm;border:2px solid #333;border-radius:3mm;margin-bottom:3mm;background:#f0f0f0">'
    +'<div style="display:flex;align-items:flex-start;gap:5mm">'
    +qrHtml
    +'<div style="font-size:8.5pt;line-height:1.6;flex:1">'
    +'<div style="font-weight:700;font-size:9pt;color:#000;margin-bottom:1.5mm">'
    +'Option 1 — Confirmation en ligne <span style="font-weight:400;font-size:8pt">/ Online Confirmation</span>'
    +'</div>'
    +'<div style="color:#333;margin-bottom:2mm">Scannez le QR code avec votre navigateur pour confirmer directement.<br><em style="color:#555;font-size:7.5pt">Scan the QR code with your browser to confirm directly.</em></div>'
    +'<div style="color:#333;font-size:8pt;margin-bottom:1.5mm">OU / OR — Accédez à <strong>'+xe(confirmBase)+'</strong> et saisissez :</div>'
    +'<div style="display:flex;gap:4mm;align-items:stretch">'
    +'<div style="flex:1;background:#fff;border:1.5px solid #555;border-radius:2mm;padding:2.5mm 3mm;display:flex;flex-direction:column;align-items:center;text-align:center">'
    +'<div style="font-size:7pt;color:#444;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1.5mm;font-weight:700">N° d\'envoi / Shipment No.</div>'
    +'<div style="font-family:monospace;font-size:10pt;font-weight:700;color:#000;letter-spacing:.05em;margin-bottom:2mm">'+xe(d.numero)+'</div>'
    +(bcNumeroSvg?'<div style="width:100%">'+bcNumeroSvg+'</div>':'')
    +'</div>'
    +'<div style="flex:1;background:#fff;border:1.5px solid #555;border-radius:2mm;padding:2.5mm 3mm;display:flex;flex-direction:column;align-items:center;text-align:center">'
    +'<div style="font-size:7pt;color:#444;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1.5mm;font-weight:700">Code de vérification / Verify code</div>'
    +'<div style="font-family:monospace;font-size:10pt;font-weight:700;color:#000;letter-spacing:.14em;margin-bottom:2mm">'+verifyCode+'</div>'
    +(bcCodeSvg?'<div style="width:100%">'+bcCodeSvg+'</div>':'')
    +'</div>'
    +'</div>'
    +'</div></div>'
    +'</div>'
    // ── Option 2 fax
    +(hasFax
      ?'<div style="margin-bottom:2.5mm;font-size:8.5pt">'
        +'<strong>Option 2 — Par fax / By fax</strong> '
        +'<em style="color:#555;font-size:8pt">(si confirmation en ligne non disponible / if online confirmation unavailable — voir numéros ci-dessous)</em>'
        +'</div>'
      :'')
    // ── Section destinataire
    +'<table style="margin-bottom:3mm;border-collapse:collapse;width:100%">'
    +'<tr><td colspan="2" style="background:#333;color:#fff;text-align:center;font-size:9pt;font-weight:700;padding:4px;letter-spacing:.04em">'
    +'À compléter par le laboratoire sous-traitant à l\'arrivée du colis '
    +'<span style="font-weight:400;font-size:8pt;opacity:.8">/ To be completed by the receiving laboratory upon arrival</span>'
    +'</td></tr>'
    +'<tr><td style="'+TH+'">Date et heure de réception <em style="font-weight:400;color:#666;font-size:8pt">/ Receipt date &amp; time</em></td><td style="'+TD+'"></td></tr>'
    +'<tr><td style="'+TH+'">Reçu par <em style="font-weight:400;color:#666;font-size:8pt">/ Received by</em></td><td style="'+TD+'"></td></tr>'
    +'<tr><td style="'+TH+'">Signature</td><td style="'+TD+';height:22px"></td></tr>'
    +'<tr><td style="'+TH+'">Non-conformité (si observée) <em style="font-weight:400;color:#666;font-size:8pt">/ Non-conformity (if observed)</em></td>'
    +'<td style="'+TD+'"><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 4px;font-size:8pt">'
    +'<span style="white-space:nowrap">□ Température&nbsp;/ Temperature</span>'
    +'<span style="white-space:nowrap">□ Spécimen&nbsp;/ Specimen</span>'
    +'<span style="white-space:nowrap">□ Emballage&nbsp;/ Packaging</span>'
    +'<span style="white-space:nowrap">□ Transport&nbsp;/ Transport</span>'
    +'<span style="white-space:nowrap">□ Documentation&nbsp;/ Documentation</span>'
    +'<span style="white-space:nowrap">□ Autre&nbsp;/ Other</span>'
    +'</div></td></tr>'
    +'<tr><td style="'+TH+'">Détailler la non-conformité <em style="font-weight:400;color:#666;font-size:8pt">/ Describe non-conformity</em></td><td style="'+TD+';height:32px"></td></tr>'
    +'</table>'
    // ── Numéros fax
    +(hasFax
      ?'<div style="font-size:8.5pt;border-top:1px solid #ccc;padding-top:3mm">'
        +'<div style="font-weight:700;margin-bottom:3px">Faxer le formulaire complété au / Fax completed form to :</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">'
        +(fBH?'<div>□ '+fBH+' <em style="color:#555">(biochimie–hématologie)</em></div>':'')
        +(fM?'<div>□ '+fM+' <em style="color:#555">(microbiologie)</em></div>':'')
        +(fP?'<div>□ '+fP+' <em style="color:#555">(pathologie)</em></div>':'')
        +(fG?'<div>□ '+fG+' <em style="color:#555">(laboratoire)</em></div>':'')
        +'</div></div>'
      :'');

  var combinedHtml='<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>'
    +'<title>OPTILAB — Bordereau + F-G-74 — '+xe(d.numero)+'</title>'
    +'<style>'+bordereauStyle+'</style>'
    +'<style>'
    +'@page{margin:12mm 14mm}'
    +'@media print{.page-break{page-break-after:always;break-after:page}.fg74-page{page-break-before:always}}'
    +'.fg74-page{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;padding:0}'
    +'</style>'
    +'</head><body>'
    +bordereauBody
    +'<div class="page-break"></div>'
    +'<div class="fg74-page">'+fg74Body+'</div>'
    +'</body></html>';

  var ifr=document.createElement('iframe');
  ifr.style.cssText='position:fixed;top:-9999px;left:-9999px;width:816px;height:1056px;border:none';
  document.body.appendChild(ifr);
  ifr.contentDocument.open();ifr.contentDocument.write(combinedHtml);ifr.contentDocument.close();
  ifr.contentWindow.focus();
  setTimeout(function(){ifr.contentWindow.print();setTimeout(function(){document.body.removeChild(ifr);},800);},400);
}


// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Confirmations (onglet)
// ══════════════════════════════════════════════════════════════════════════════

var _hgcTab='all';
function renderHGConfirmations(){
  var fv=document.getElementById('hgc-from')?document.getElementById('hgc-from').value:'';
  var tv=document.getElementById('hgc-to')?document.getElementById('hgc-to').value:'';
  var fstat=document.getElementById('hgc-fstat')?document.getElementById('hgc-fstat').value:'';
  var lid=CU?CU.labo_id:null;
  var base=lid&&!isG()?EHG.filter(function(e){return e.expId===lid;}):EHG;
  var fd=fv?new Date(fv+'T00:00:00'):new Date(0),td=tv?new Date(tv+'T23:59:59'):new Date(8640000000000000);
  var f=base.filter(function(e){
    var dr=new Date(e.tsEnvoi)>=fd&&new Date(e.tsEnvoi)<=td;
    var sm=!fstat||(fstat==='pending'&&!e.tsConfirm)||(fstat==='noans'&&e.statut==='Aucune réponse reçue')||(fstat==='online'&&e.confirmMethod==='online')||(fstat==='fax'&&e.confirmMethod==='fax');
    return dr&&sm;
  });
  var countEl=document.getElementById('hgc-count');if(countEl)countEl.textContent=f.length+' résultat'+(f.length!==1?'s':'');
  document.getElementById('hgc-tbody').innerHTML=f.map(function(e){
    var conf=e.tsConfirm?'<span class="badge '+(e.confirmConforme?'br':'bp2')+'">'+(e.confirmMethod==='fax'?'Fax':'En ligne')+'</span>':isHGNoResp(e)?'<span class="badge bperdu">Aucune réponse</span>':isHGAlarm(e)?'<span class="badge ba">⚠ En attente</span>':'<span class="badge ba">En attente</span>';
    var actions=!e.tsConfirm&&!isHGNoResp(e)
      ?'<button class="bsm" onclick="openHGFaxModal(\''+e.id+'\')" style="font-size:11px;padding:4px 8px">Saisir fax</button>'
      :'<span style="font-size:11px;color:var(--t3)">—</span>';
    return'<tr class="'+hgRowCls(e)+'" style="cursor:pointer" onclick="showHGDetail(\''+e.id+'\')">'
      +'<td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+esc(e.numero)+'</td>'
      +'<td style="line-height:1.4">'+hgDestLine(e)+'</td>'
      +'<td>'+tlS(e.temp)+'</td>'
      +'<td>'+esc(e.transporteur)+'</td>'
      +'<td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td>'
      +'<td><span class="badge '+hgBc(e.statut)+'">'+esc(e.statut)+'</span></td>'
      +'<td>'+conf+'</td>'
      +'<td style="font-size:11px;color:var(--t2)">'+fdt(e.tsConfirm)+'</td>'
      +'<td onclick="event.stopPropagation()">'+actions+'</td>'
      +'</tr>';
  }).join('');
  renderHGLegend('hgc-legend',f);
}

function hgBc(s){return s==='Reçu'?'br':s==='Problème'?'bp2':s==='Aucune réponse reçue'?'bperdu':'bt';}
function hgDays(e){return(new Date()-new Date(e.tsEnvoi))/86400000;}
function isHGAlarm(e){return e.statut==='En transit'&&!e.tsConfirm&&hgDays(e)>(CFG.hgrappeAlarmDays||3);}
function isHGNoResp(e){return e.statut==='Aucune réponse reçue';}
function hgRowCls(e){if(isHGNoResp(e))return'hg-ar-lost';if(isHGAlarm(e))return'hg-ar';return'';}
function isHGAlert(e){return isHGAlarm(e)||isHGNoResp(e);}
function renderHGLegend(elId,arr){
  var el=document.getElementById(elId);if(!el)return;
  var haA=arr.some(isHGAlarm),haN=arr.some(isHGNoResp);
  if(!haA&&!haN){el.innerHTML='';return;}
  var rows=[];
  if(haA)rows.push('<div class="rleg-row hg-ar-row"><span class="badge bt">En transit</span><span class="talarm">⚠ '+(CFG.hgrappeAlarmDays||3)+' j+</span><span class="rleg-desc">Aucune confirmation après '+(CFG.hgrappeAlarmDays||3)+' jours</span></div>');
  if(haN)rows.push('<div class="rleg-row hg-ar-lost-row"><span class="badge bperdu">Aucune réponse</span><span class="rleg-desc">Statut basculé automatiquement après '+(CFG.hgrappeAutoCloseDays||10)+' jours</span></div>');
  el.innerHTML='<details class="rleg"><summary class="rleg-title">Légende</summary><div class="rleg-rows">'+rows.join('')+'</div></details>';
}

async function showHGDetail(id){
  var e=EHG.find(function(x){return x.id===id;});if(!e)return;
  var stCfg=CFG.bordereau.specTypes.find(function(t){return t.id===e.typeSpecimen;})||{label:e.typeSpecimen||'—'};
  var tCfg=CFG.temperatures.find(function(t){return t.label===e.temp;});
  var showRef=tCfg&&tCfg.ask_glace;
  var h=e.tsEnvoi?((e.tsConfirm?new Date(e.tsConfirm):new Date())-new Date(e.tsEnvoi))/3600000:null;
  var alNoResp=isHGNoResp(e);var alD=isHGAlarm(e);
  var transitStyle=alNoResp?'color:#991B1B;font-weight:700':alD?'color:var(--te)':'';
  var body=
    '<div class="df"><span>N° envoi</span><span style="font-family:var(--fm)">'+esc(e.numero)+'</span></div>'+
    '<div class="df"><span>Statut</span><span><span class="badge '+hgBc(e.statut)+'">'+esc(e.statut)+'</span></span></div>'+
    modSep('Parties')+
    '<div class="df"><span>Expéditeur</span><span>'+esc(e.exp)+'</span></div>'+
    '<div class="df"><span>Destinataire</span><span style="line-height:1.5">'+hgDestLine(e)+'</span></div>'+
    modSep('Spécimen &amp; transport')+
    '<div class="df"><span>Type de spécimen</span><span>'+esc(stCfg.label)+'</span></div>'+
    (showRef?'<div class="df"><span>Réfrigérant</span><span>'+(e.glaceSeche?'🧊 Glace sèche (UN 1845)':'❄️ Sachet réfrigérant')+'</span></div>':'')+
    '<div class="df"><span>Température</span><span>'+esc(tl(e.temp))+'</span></div>'+
    '<div class="df"><span>Transporteur</span><span>'+esc(e.transporteur)+'</span></div>'+
    (e.numerosSilp&&e.numerosSilp.length?'<div class="df full"><span>Listes SILP</span><span style="font-family:var(--fm)">'+e.numerosSilp.map(esc).join(' · ')+'</span></div>':'')+
    (e.tubes?'<div class="df"><span>Échantillons</span><span>'+e.tubes+'</span></div>':'')+
    modSep('Traçabilité')+
    '<div class="df"><span>Créé par</span><span>'+esc(e.creePar||'—')+'</span></div>'+
    '<div class="df"><span>Envoyé le</span><span>'+fdt(e.tsEnvoi)+'</span></div>'+
    '<div class="df"><span>Transit</span><span style="'+transitStyle+'">'+ft(h)+(alNoResp?' ⚠ Aucune réponse':alD?' ⚠':'')+'</span></div>'+
    (e.notes?modSep('Notes')+'<div class="df full"><span>Notes</span><span>'+esc(e.notes)+'</span></div>':'')+
    modSep('Confirmation de réception')+
    (e.tsConfirm
      ?'<div class="df"><span>Méthode</span><span>'+(e.confirmMethod==='fax'?'Par fax':'En ligne')+'</span></div>'+
        '<div class="df"><span>Reçu par</span><span>'+esc(e.confirmRecuPar||'—')+'</span></div>'+
        '<div class="df"><span>Le</span><span>'+fdt(e.tsConfirm)+'</span></div>'+
        '<div class="df"><span>Conformité</span><span>'+(e.confirmConforme===false?'<span style="color:var(--te)">✗ Non conforme</span>':'<span style="color:var(--ts)">✓ Conforme</span>')+'</span></div>'+
        (e.confirmConforme===false&&e.confirmNcTypes&&e.confirmNcTypes.length?'<div class="df"><span>Non-conformité(s)</span><span>'+esc(e.confirmNcTypes.join(', '))+'</span></div>':'')+
        (e.confirmCommentaire?'<div class="df full"><span>Commentaire</span><span style="color:var(--te)">'+esc(e.confirmCommentaire)+'</span></div>':'')
      :'<div class="df full"><span style="color:var(--t3);font-style:italic">Aucune confirmation reçue</span><span></span></div>')+
    '<div id="gmod-audit"></div>';
  var canEdit=!e.tsConfirm&&e.statut==='En transit';
  var canPrint=(e.expId===CU.labo_id||isG())&&e.statut==='En transit';
  var btns=[];
  if(canPrint)btns.push('<button class="bsm bsms" onclick="reprintHGDocsFromEnvoi(\''+e.id+'\')" style="display:inline-flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6H2a1 1 0 00-1 1v5a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2"/><rect x="4" y="1" width="8" height="7" rx="1"/><path d="M4 11h8v4H4z"/></svg>Bordereau + F-G-74</button>');
  if(canEdit)btns.push('<button class="bsm bsmi" onclick="openEditHGEnvoi(\''+e.id+'\')" style="display:inline-flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3l9-9z"/><path d="M9 4l3 3"/></svg>Modifier l\'envoi</button>');
  var gmb=document.getElementById('gmod-body'),gf=document.getElementById('gmod-footer');
  if(gmb)gmb.innerHTML=body;
  if(gf)gf.innerHTML=btns.length?'<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--b3);display:flex;justify-content:flex-end;gap:8px">'+btns.join('')+'</div>':'';
  var gmod=document.getElementById('gmod');if(gmod)gmod.classList.add('show');
  try{
    var ar=await sb.from('envois_audit').select('changed_by_nom,changed_at').eq('table_name','envois_hgrappe').eq('record_id',id).eq('action','UPDATE').order('changed_at',{ascending:false}).limit(1);
    var auditEl=document.getElementById('gmod-audit');
    if(!ar.error&&ar.data&&ar.data.length&&auditEl)auditEl.innerHTML='<div class="df full" style="margin-top:6px;padding-top:6px;border-top:0.5px solid var(--b3)"><span style="color:var(--warning)">✎ Modifié</span><span style="color:var(--t2)">'+esc(ar.data[0].changed_by_nom)+' — '+fdt(ar.data[0].changed_at)+'</span></div>';
  }catch(ex){}
}

// ── Modal fax confirmation ───────────────────────────────────────────────────

function openHGFaxModal(id){
  var e=EHG.find(function(x){return x.id===id;});if(!e||e.tsConfirm)return;
  _hgFaxId=id;_hgFaxConforme=null;
  document.getElementById('hgfax-num').textContent=e.numero;
  var now=new Date();
  var localDt=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')
    +'T'+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  document.getElementById('hgfax-dt').value=localDt;
  document.getElementById('hgfax-par').value='';
  document.getElementById('hgfax-comment').value='';
  document.getElementById('hgfax-err').style.display='none';
  document.querySelectorAll('.hgfax-nc-cb').forEach(function(cb){cb.checked=false;});
  document.getElementById('hgfax-nc-section').classList.add('gone');
  document.getElementById('hgfax-btn-oui').style.outline='';
  document.getElementById('hgfax-btn-non').style.outline='';
  document.getElementById('hg-fax-modal').style.display='flex';
}
function closeHGFaxModal(){document.getElementById('hg-fax-modal').style.display='none';_hgFaxId=null;}
function setHgFaxConforme(val){
  _hgFaxConforme=val;
  var bO=document.getElementById('hgfax-btn-oui'),bN=document.getElementById('hgfax-btn-non');
  if(bO)bO.style.outline=val?'2px solid var(--ts)':'';
  if(bN)bN.style.outline=val===false?'2px solid var(--te)':'';
  document.getElementById('hgfax-nc-section').classList.toggle('gone',val!==false);
}
async function saveHGFaxConfirm(){
  var err=document.getElementById('hgfax-err');err.style.display='none';
  var dt=document.getElementById('hgfax-dt').value;
  var par=document.getElementById('hgfax-par').value.trim();
  if(!dt){err.textContent='Veuillez indiquer la date et l\'heure de réception.';err.style.display='block';return;}
  if(!par){err.textContent='Veuillez indiquer le nom.';err.style.display='block';return;}
  if(_hgFaxConforme===null){err.textContent='Veuillez indiquer si le colis est conforme ou non.';err.style.display='block';return;}
  var ncTypes=[];
  if(_hgFaxConforme===false){
    document.querySelectorAll('.hgfax-nc-cb:checked').forEach(function(cb){ncTypes.push(cb.value);});
    var comment=document.getElementById('hgfax-comment').value.trim();
    if(!ncTypes.length){err.textContent='Veuillez cocher au moins un type de non-conformité.';err.style.display='block';return;}
    if(!comment){err.textContent='Veuillez décrire la non-conformité.';err.style.display='block';return;}
  }
  var comment=_hgFaxConforme===false?document.getElementById('hgfax-comment').value.trim():'';
  var statut=_hgFaxConforme?'Reçu':'Problème';
  var e=EHG.find(function(x){return x.id===_hgFaxId;});if(!e)return;
  var r=await sb.from('envois_hgrappe').update({statut:statut,confirm_method:'fax',confirm_conforme:_hgFaxConforme,confirm_nc_types:ncTypes,confirm_commentaire:comment,confirm_recu_par:par,ts_confirm:new Date(dt).toISOString()}).eq('id',_hgFaxId);
  if(r.error){err.textContent='Erreur : '+r.error.message;err.style.display='block';return;}
  closeHGFaxModal();await loadEnvoisHG();renderHGConfirmations();toast('Confirmation par fax enregistrée.','s');
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Résumé labo
// ══════════════════════════════════════════════════════════════════════════════

var _hgrTab='sent';
function switchHGRTab(t){
  _hgrTab=t;
  ['sent','recv','wait'].forEach(function(k){document.getElementById('hgrtab-'+k).classList.toggle('active',t===k);});
  renderHGResume();
}
function renderHGResume(){
  var lid=document.getElementById('hgr-ls')&&!document.getElementById('hgr-ls').classList.contains('gone')
    ?document.getElementById('hgr-ls').value
    :(CU?CU.labo_id:null);
  var fv=document.getElementById('hgr-from').value,tv=document.getElementById('hgr-to').value;
  var fd=fv?new Date(fv+'T00:00:00'):new Date(0),td=tv?new Date(tv+'T23:59:59'):new Date(8640000000000000);
  var base=lid?EHG.filter(function(e){return e.expId===lid;}):EHG;
  var sent=base.filter(function(e){return new Date(e.tsEnvoi)>=fd&&new Date(e.tsEnvoi)<=td;});
  var recv=sent.filter(function(e){return!!e.tsConfirm;});
  var wait=sent.filter(function(e){return!e.tsConfirm;});
  document.getElementById('hgr-sc').textContent=sent.length;
  document.getElementById('hgr-dc').textContent=recv.length;
  document.getElementById('hgr-wc').textContent=wait.length;
  var arr=_hgrTab==='sent'?sent:_hgrTab==='recv'?recv:wait;
  var emptyEl=document.getElementById('hgr-empty'),tableEl=document.getElementById('hgr-table');
  if(!arr.length){
    emptyEl.classList.remove('gone');emptyEl.textContent='Aucun envoi pour cette période.';
    tableEl.classList.add('gone');return;
  }
  emptyEl.classList.add('gone');tableEl.classList.remove('gone');
  document.getElementById('hgr-tbody').innerHTML=arr.map(function(e){
    var conf=e.tsConfirm?'<span class="badge '+(e.confirmConforme?'br':'bp2')+'">'+(e.confirmMethod==='fax'?'Fax':'En ligne')+'</span>':isHGNoResp(e)?'<span class="badge bperdu">Aucune réponse</span>':isHGAlarm(e)?'<span class="badge ba">⚠ En attente</span>':'<span class="badge ba">En attente</span>';
    return'<tr class="'+hgRowCls(e)+'" style="cursor:pointer" onclick="showHGDetail(\''+e.id+'\')">'
      +'<td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+esc(e.numero)+'</td>'
      +'<td style="font-size:11px">'+(e.source==='silp'?'SILP':'Hors SILP')+'</td>'
      +'<td style="line-height:1.4">'+hgDestLine(e)+'</td>'
      +'<td>'+tlS(e.temp)+'</td>'
      +'<td>'+esc(e.transporteur)+'</td>'
      +'<td>'+(e.tubes||'—')+'</td>'
      +'<td style="font-size:11px">'+esc(e.creePar)+'</td>'
      +'<td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td>'
      +'<td>'+conf+'</td>'
      +'<td style="font-size:11px;color:var(--t2)">'+fdt(e.tsConfirm)+'</td>'
      +'</tr>';
  }).join('');
  renderHGLegend('hgr-legend',arr);
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Historique
// ══════════════════════════════════════════════════════════════════════════════

function renderHGHistorique(){
  var lid=CU?CU.labo_id:null;
  var base=lid&&!isG()?EHG.filter(function(e){return e.expId===lid;}):EHG;
  var now=new Date(),thisMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('hgh-st').textContent=base.length;
  document.getElementById('hgh-sm').textContent=base.filter(function(e){return e.tsEnvoi&&e.tsEnvoi.slice(0,7)===thisMonth;}).length;
  document.getElementById('hgh-str').textContent=base.filter(function(e){return e.statut==='En transit';}).length;
  document.getElementById('hgh-sconf').textContent=base.filter(function(e){return!!e.tsConfirm;}).length;
  var fv=document.getElementById('hgh-from').value,tv=document.getElementById('hgh-to').value;
  var q=document.getElementById('hgh-search').value.toLowerCase();
  var fs=document.getElementById('hgh-fstat').value,fsrc=document.getElementById('hgh-fsrc').value;
  var fd=fv?new Date(fv+'T00:00:00'):new Date(0),td=tv?new Date(tv+'T23:59:59'):new Date(8640000000000000);
  var f=base.filter(function(e){
    var dr=new Date(e.tsEnvoi)>=fd&&new Date(e.tsEnvoi)<=td;
    var qm=!q||(e.numero+e.exp+hgDestText(e)+e.temp+e.transporteur).toLowerCase().includes(q);
    var sm=!fs||e.statut===fs;
    var srcm=!fsrc||e.source===fsrc;
    return dr&&qm&&sm&&srcm;
  });
  var countEl=document.getElementById('hgh-count');if(countEl)countEl.textContent=f.length+' résultat'+(f.length!==1?'s':'');
  document.getElementById('hgh-tbody').innerHTML=f.map(function(e){
    var conf=e.tsConfirm?'<span class="badge '+(e.confirmConforme?'br':'bp2')+'">'+(e.confirmMethod==='fax'?'Fax':'En ligne')+'</span>':isHGNoResp(e)?'<span class="badge bperdu">Aucune réponse</span>':isHGAlarm(e)?'<span class="badge ba">⚠ En attente</span>':'<span class="badge ba">En attente</span>';
    return'<tr class="'+hgRowCls(e)+'" style="cursor:pointer" onclick="showHGDetail(\''+e.id+'\')">'
      +'<td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+esc(e.numero)+'</td>'
      +'<td style="font-size:11px">'+(e.source==='silp'?'SILP':'HS')+'</td>'
      +'<td style="line-height:1.4">'+hgDestLine(e)+'</td>'
      +'<td>'+tlS(e.temp)+'</td>'
      +'<td>'+esc(e.transporteur)+'</td>'
      +'<td>'+(e.tubes||'—')+'</td>'
      +'<td><span class="badge '+hgBc(e.statut)+'">'+esc(e.statut)+'</span></td>'
      +'<td>'+conf+'</td>'
      +'<td style="font-size:11px;color:var(--t2)">'+fdt(e.tsEnvoi)+'</td>'
      +'</tr>';
  }).join('');
  renderHGLegend('hgh-legend',f);
}

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Config
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// HORS-GRAPPE — Modification d'un envoi
// ══════════════════════════════════════════════════════════════════════════════

function openEditHGEnvoi(id){
  var e=EHG.find(function(x){return x.id===id;});if(!e)return;
  _hgEditId=id;_hgEditST=e.temp;_hgEditSGC=e.glaceSeche||false;_hgEditLists=(e.numerosSilp||[]).slice();
  document.getElementById('hge-num-ro').textContent=e.numero;
  document.getElementById('hge-exp-ro').textContent=e.exp;
  document.getElementById('hge-dest-ro').innerHTML=hgDestLine(e);
  document.getElementById('hge-src-ro').textContent=e.source==='silp'?'SILP':'Hors SILP';
  document.getElementById('hge-err').style.display='none';
  // Transporteur
  var tr=document.getElementById('hge-trans');
  tr.innerHTML='<option value="">— Sélectionner —</option>';
  CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;tr.appendChild(o);});
  tr.value=e.transporteur;
  // Type spécimen
  var ts=document.getElementById('hge-tspec');
  ts.innerHTML='';
  CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;ts.appendChild(o);});
  ts.value=e.typeSpecimen||'exempt';
  // Nb échantillons / notes
  document.getElementById('hge-ntub').value=e.tubes||'';
  document.getElementById('hge-notes').value=e.notes||'';
  // Températures
  renderHgeTempPills();
  // Réfrigérant
  var tCfg=CFG.temperatures.find(function(t){return t.label===e.temp;})||{};
  var gs=document.getElementById('hge-glace-section');
  if(gs){
    if(tCfg&&tCfg.ask_glace){gs.style.display='';setHgeSGC(e.glaceSeche);}
    else{gs.style.display='none';}
  }
  // Listes SILP
  var ls=document.getElementById('hge-lists-section');
  if(ls)ls.style.display=e.source==='silp'?'':'none';
  renderHgeChips();
  closeGMod();
  document.getElementById('hg-edit-modal').style.display='flex';
}
function closeHGEditModal(){
  document.getElementById('hg-edit-modal').style.display='none';
  _hgEditId=null;
}
function renderHgeTempPills(){
  var c=document.getElementById('hge-tpills-c');if(!c)return;c.innerHTML='';
  CFG.temperatures.forEach(function(t,i){
    var cls=PCLS[i%PCLS.length];
    var el=document.createElement('div');el.className='tpill'+(t.label===_hgEditST?' '+cls:'');
    el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);
    el.onclick=(function(lbl,pc){return function(){sHgeTemp(lbl,pc);};})(t.label,cls);
    c.appendChild(el);
  });
}
function sHgeTemp(lbl,pc){
  _hgEditST=lbl;_hgEditSGC=false;
  document.querySelectorAll('#hge-tpills-c .tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=CFG.temperatures.find(function(t){return t.label===lbl;})||{};
  var gs=document.getElementById('hge-glace-section');
  if(gs){
    if(tCfg&&tCfg.ask_glace){gs.style.display='';_hgEditSGC=null;}
    else{gs.style.display='none';_hgEditSGC=false;}
  }
}
function setHgeSGC(val){
  _hgEditSGC=val;
  var bO=document.getElementById('hge-btn-glace-oui'),bN=document.getElementById('hge-btn-glace-non');
  if(bO)bO.style.outline=val?'2px solid var(--brand-azure-deep)':'';
  if(bN)bN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}
// Chips listes SILP dans le formulaire d'édition
function addHgeList(){
  var inp=document.getElementById('hge-nlist-input'),errEl=document.getElementById('hge-nlist-err');
  var v=inp.value.trim();errEl.classList.remove('show');
  if(!v)return;
  if(!/^\d+$/.test(v)){errEl.textContent='Uniquement des chiffres.';errEl.classList.add('show');return;}
  if(_hgEditLists.indexOf(v)!==-1){errEl.textContent='Ce numéro est déjà dans la liste.';errEl.classList.add('show');return;}
  // Vérifier que le numéro n'est pas dans un autre envoi HG (pas celui en cours d'édition)
  if(EHG.some(function(e){return e.id!==_hgEditId&&e.numerosSilp&&e.numerosSilp.indexOf(v)!==-1;})){errEl.textContent='Ce numéro est déjà lié à un autre envoi Hors-grappe.';errEl.classList.add('show');return;}
  _hgEditLists.push(v);inp.value='';renderHgeChips();inp.focus();
}
function removeHgeList(v){_hgEditLists=_hgEditLists.filter(function(x){return x!==v;});renderHgeChips();}
function renderHgeChips(){
  var el=document.getElementById('hge-nlist-chips');if(!el)return;
  el.innerHTML=_hgEditLists.map(function(v){
    return'<div class="nlist-chip"><span>'+esc(v)+'</span>'
      +'<button type="button" onclick="removeHgeList(\''+esc(v)+'\')">&times;</button></div>';
  }).join('');
}
async function saveEditHGEnvoi(){
  var e=EHG.find(function(x){return x.id===_hgEditId;});if(!e)return;
  if(!_hgEditST){ban('hge-err','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=CFG.temperatures.find(function(t){return t.label===_hgEditST;})||{};
  if(tCfg&&tCfg.ask_glace&&_hgEditSGC===null){ban('hge-err','Veuillez sélectionner le type de réfrigérant.','e');return;}
  var tr=document.getElementById('hge-trans').value;
  if(!tr){ban('hge-err','Veuillez sélectionner un transporteur.','e');return;}
  if(e.source==='silp'&&!_hgEditLists.length){ban('hge-err','Veuillez ajouter au moins un numéro de liste de repérage.','e');return;}
  var tubes=parseInt(document.getElementById('hge-ntub').value)||null;
  var spec=document.getElementById('hge-tspec').value;
  var notes=document.getElementById('hge-notes').value;
  var upd={temperature:_hgEditST,transporteur:tr,nb_echantillons:tubes,notes:notes,type_specimen:spec,glace_seche:_hgEditSGC===true};
  if(e.source==='silp')upd.numeros_silp=_hgEditLists.slice();
  var r=await sb.from('envois_hgrappe').update(upd).eq('id',_hgEditId);
  if(r.error){ban('hge-err','Erreur : '+r.error.message,'e');return;}
  // Préparer la réimpression
  var expLab=LABS.find(function(l){return l.id===e.expId;})||{};
  _hgPrintData={numero:e.numero,token:e.confirmToken,source:e.source,exp:e.exp,dest:e.dest,temp:_hgEditST,transporteur:tr,tubes:tubes,numerosSilp:e.source==='silp'?_hgEditLists.slice():[],notes:notes,creePar:e.creePar,tsEnvoi:e.tsEnvoi,typeSpecimen:spec,glaceSeche:_hgEditSGC===true,expLab:expLab};
  closeHGEditModal();
  await loadEnvoisHG();
  // Modal de succès avec option de réimpression (pas d'obligation)
  var t=document.getElementById('success-title-el');if(t)t.textContent='Envoi HG modifié';
  var cb=document.getElementById('success-close-btn');if(cb)cb.textContent='Fermer';
  var msgEl=document.getElementById('success-modal-msg');
  if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+esc(e.numero)+'</strong> modifié avec succès.<br><small style="color:var(--t2);font-size:11px">Pensez à remplacer le bordereau et la F-G-74 dans le colis si nécessaire.</small>';
  var pb=document.getElementById('success-print-btn');
  if(pb){pb.style.display='flex';pb.onclick=function(){closeSuccessModal();printHGDocs();};}
  document.getElementById('success-modal').style.display='flex';
}

function renderCfgHgrappe(){
  if(!isAdmin())return;
  renderHgrappeLabsToggle();
  renderExtLabsList();
  renderHGAlarmsCfg();
  renderCfgHgrappeConfirmByNumero();
  renderCfgHgrappeFormat();
}
function renderCfgHgrappeConfirmByNumero(){
  var el=document.getElementById('cfg-hg-confirm-by-numero');
  if(el)el.checked=CFG.hgrappeConfirmByNumero!==false;
}
async function saveHgrappeConfirmByNumero(){
  var v=document.getElementById('cfg-hg-confirm-by-numero').checked;
  if(await saveCfg('hgrappe_confirm_by_numero',v)){CFG.hgrappeConfirmByNumero=v;ban('cfgsuc','Paramètre mis à jour.','s');}
}
function renderHGAlarmsCfg(){
  var a=document.getElementById('cfg-hg-alarm-days'),b=document.getElementById('cfg-hg-auto-days');
  if(a)a.value=CFG.hgrappeAlarmDays||3;
  if(b)b.value=CFG.hgrappeAutoCloseDays||10;
}
async function saveHGAlarms(){
  var a=parseInt(document.getElementById('cfg-hg-alarm-days').value)||3;
  var b=parseInt(document.getElementById('cfg-hg-auto-days').value)||10;
  if(a>=b){ban('cfgerr','Le délai d\'alarme doit être inférieur au délai de fermeture automatique.','e');return;}
  CFG.hgrappeAlarmDays=a;CFG.hgrappeAutoCloseDays=b;
  var ok1=await saveCfg('hgrappe_alarm_days',a);
  var ok2=await saveCfg('hgrappe_auto_close_days',b);
  if(ok1&&ok2)ban('cfgsuc','Alarmes Hors-grappe enregistrées.','s');
}

function renderHgrappeLabsToggle(){
  var el=document.getElementById('hgrappe-labs-list');if(!el)return;
  var enabled=CFG.hgrappeEnabledLabs||[];
  el.innerHTML=LABS.map(function(l){
    var on=enabled.indexOf(l.id)!==-1;
    return'<div class="cfg-item">'
      +'<div style="display:flex;align-items:center;gap:10px">'
      +'<label class="cfg-toggle"><input type="checkbox" class="hgrappe-lab-cb" value="'+esc(l.id)+'"'+(on?' checked':'')+'/><span class="cfg-toggle-sl"></span></label>'
      +'<span style="font-size:13px">'+esc(l.name)+'</span>'
      +'</div>'
      +'</div>';
  }).join('');
}
async function saveHgrappeLabs(){
  var enabled=[];
  document.querySelectorAll('.hgrappe-lab-cb:checked').forEach(function(cb){enabled.push(cb.value);});
  CFG.hgrappeEnabledLabs=enabled;
  if(await saveCfg('hgrappe_enabled_labs',enabled))ban('cfgsuc','Activation Hors-grappe mise à jour.','s');
  // Mettre à jour le mode switcher si nécessaire
  var canHG=isHGEnabled();
  var sw=document.getElementById('mode-sw');if(sw)sw.classList.toggle('gone',!canHG);
}

function extLabRow(l,indent){
  var addrParts=[l.adresse,l.adresse2,l.ville,l.province,l.code_postal,l.pays].filter(Boolean);
  var addrSummary=addrParts.length?'<span style="font-size:10px;color:var(--t3)">'+esc(addrParts.join(', '))+'</span>':'';
  var prefix=indent?'↳ ':'';
  var padLeft=indent?'padding-left:32px':'';
  return'<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0;'+(indent?'background:var(--b2)':'')+'">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;'+padLeft+'">'
      +'<div><div style="font-size:'+(indent?'12':'13')+'px;font-weight:600">'+prefix+esc(l.name)+'</div>'+addrSummary+'</div>'
      +'<div style="display:flex;gap:5px;flex-shrink:0">'
        +'<button class="bsm bsmi" onclick="toggleExtLabEdit(\''+l.id+'\')" style="font-size:11px;padding:3px 8px">Modifier</button>'
        +'<button class="bsm '+(l.active?'bsmd':'')+'" onclick="toggleExtLabActive(\''+l.id+'\','+(!l.active)+')" style="font-size:11px;padding:3px 8px">'+(l.active?'Désactiver':'Réactiver')+'</button>'
      +'</div>'
    +'</div>'
    +'<div id="elef-'+l.id+'" style="display:none;padding:10px 14px;background:var(--b2);border-top:1px solid var(--b3)">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Nom</label><input type="text" id="elef-name-'+l.id+'" value="'+esc(l.name)+'" style="width:100%"/></div>'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Adresse (ligne 1)</label><input type="text" id="elef-adr-'+l.id+'" value="'+esc(l.adresse||'')+'" placeholder="150, rue X" style="width:100%"/></div>'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Adresse (ligne 2)</label><input type="text" id="elef-adr2-'+l.id+'" value="'+esc(l.adresse2||'')+'" placeholder="Bureau 200, Édifice Y" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Ville</label><input type="text" id="elef-vil-'+l.id+'" value="'+esc(l.ville||'')+'" placeholder="Montréal" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Province / État</label><input type="text" id="elef-prv-'+l.id+'" value="'+esc(l.province||'')+'" placeholder="QC" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Code postal</label><input type="text" id="elef-cp-'+l.id+'" value="'+esc(l.code_postal||'')+'" placeholder="G0L 1G0" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Pays</label><input type="text" id="elef-pays-'+l.id+'" value="'+esc(l.pays||'')+'" placeholder="Canada" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Téléphone</label><input type="text" id="elef-tel-'+l.id+'" value="'+esc(l.telephone||'')+'" placeholder="514 xxx-xxxx" style="width:100%"/></div>'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Texte étiquette HG <span style="font-weight:400;color:var(--t3)">(remplace les départements sur le bordereau — laisser vide = départements standard)</span></label><textarea id="elef-lbl-'+l.id+'" rows="2" placeholder="Ex. MULTI SECTEUR SPÉCIALITÉS&#10;A/S Immunosuppresseurs" style="width:100%;resize:vertical">'+esc(l.label_text||'')+'</textarea></div>'
      +'</div>'
      +'<div style="display:flex;gap:6px"><button class="bp" style="font-size:11px;padding:5px 14px" onclick="saveExtLabEdit(\''+l.id+'\')">Enregistrer</button>'
      +'<button class="bsec" style="font-size:11px;padding:5px 10px" onclick="toggleExtLabEdit(\''+l.id+'\')">Annuler</button></div>'
    +'</div>'
  +'</div>';
}
function renderExtLabsList(){
  var el=document.getElementById('extlabs-list');if(!el)return;
  var parents=EXT_LABS.filter(function(l){return !l.parent_id;});
  var children=EXT_LABS.filter(function(l){return !!l.parent_id;});
  var html='';
  parents.forEach(function(p){
    html+=extLabRow(p,false);
    children.filter(function(c){return c.parent_id===p.id;}).forEach(function(c){html+=extLabRow(c,true);});
  });
  // Orphelins
  children.filter(function(c){return !parents.find(function(p){return p.id===c.parent_id;});}).forEach(function(c){html+=extLabRow(c,true);});
  el.innerHTML=html||'<div style="font-size:12px;color:var(--t3);padding:8px">Aucun laboratoire externe configuré.</div>';
  var pSel=document.getElementById('extlab-parent-sel');
  if(pSel){pSel.innerHTML='<option value="">— Aucun parent —</option>';parents.forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.name;pSel.appendChild(o);});}
}
function toggleExtLabEdit(id){var el=document.getElementById('elef-'+id);if(el)el.style.display=el.style.display==='none'?'':'none';}
async function saveExtLabEdit(id){
  var name=document.getElementById('elef-name-'+id).value.trim();
  if(!name){ban('cfgerr','Le nom est obligatoire.','e');return;}
  var adr=document.getElementById('elef-adr-'+id).value.trim();
  var adr2=document.getElementById('elef-adr2-'+id).value.trim();
  var vil=document.getElementById('elef-vil-'+id).value.trim();
  var prv=document.getElementById('elef-prv-'+id).value.trim();
  var cp=document.getElementById('elef-cp-'+id).value.trim();
  var pays=document.getElementById('elef-pays-'+id).value.trim();
  var tel=document.getElementById('elef-tel-'+id).value.trim();
  var lbl=document.getElementById('elef-lbl-'+id).value.trim();
  var r=await sb.from('external_labs').update({name:name,adresse:adr,adresse2:adr2,ville:vil,province:prv,code_postal:cp,pays:pays,telephone:tel,label_text:lbl}).eq('id',id);
  if(r.error){ban('cfgerr','Erreur : '+r.error.message,'e');return;}
  var l=EXT_LABS.find(function(x){return x.id===id;});
  if(l){l.name=name;l.adresse=adr;l.adresse2=adr2;l.ville=vil;l.province=prv;l.code_postal=cp;l.pays=pays;l.telephone=tel;l.label_text=lbl;}
  renderExtLabsList();ban('cfgsuc','Laboratoire mis à jour.','s');
}
async function addExtLab(){
  var name=document.getElementById('extlab-new-name').value.trim();
  if(!name){ban('cfgerr','Veuillez saisir un nom de laboratoire.','e');return;}
  var parentId=document.getElementById('extlab-parent-sel').value||null;
  var adr=document.getElementById('extlab-new-adresse').value.trim();
  var adr2=document.getElementById('extlab-new-adresse2').value.trim();
  var vil=document.getElementById('extlab-new-ville').value.trim();
  var prv=document.getElementById('extlab-new-province').value.trim();
  var cp=document.getElementById('extlab-new-cp').value.trim();
  var pays=document.getElementById('extlab-new-pays').value.trim();
  var tel=document.getElementById('extlab-new-tel').value.trim();
  var lbl=document.getElementById('extlab-new-label').value.trim();
  var r=await sb.from('external_labs').insert({name:name,parent_id:parentId||null,adresse:adr,adresse2:adr2,ville:vil,province:prv,code_postal:cp,pays:pays,telephone:tel,label_text:lbl,active:true});
  if(r.error){ban('cfgerr','Erreur : '+r.error.message,'e');return;}
  ['extlab-new-name','extlab-new-adresse','extlab-new-adresse2','extlab-new-ville','extlab-new-province','extlab-new-cp','extlab-new-pays','extlab-new-tel','extlab-new-label'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  await loadExtLabs();renderExtLabsList();ban('cfgsuc','Laboratoire ajouté.','s');
}
async function toggleExtLabActive(id,active){
  await sb.from('external_labs').update({active:active}).eq('id',id);
  await loadExtLabs();renderExtLabsList();
}


function renderCfgHgrappeFormat(){
  var el=document.getElementById('hgrappe-fmt-list');if(!el)return;
  var active=CFG.hgrappeFormat||'bordereau';
  var opts=CFG.bordereau.formats.map(function(f){
    return'<option value="'+esc(f.id)+'"'+(f.id===active?' selected':'')+'>'+esc(f.nom)+'</option>';
  }).join('');
  var active_f=CFG.bordereau.formats.find(function(f){return f.id===active;})||{};
  el.innerHTML='<div class="fgg">'
    +'<select id="hgrappe-fmt-sel" style="width:100%" onchange="saveHgrappeFormat(this.value)">'+opts+'</select>'
    +(active_f.desc?'<div class="cfg-hint" id="hgrappe-fmt-hint" style="margin-top:6px">'+esc(active_f.desc)+'</div>':'')
    +'</div>';
}
async function saveHgrappeFormat(id){
  CFG.hgrappeFormat=id;
  var hint=document.getElementById('hgrappe-fmt-hint');
  if(hint){var f=CFG.bordereau.formats.find(function(x){return x.id===id;})||{};hint.textContent=f.desc||'';}
  if(await saveCfg('hgrappe_bordereau_format',id))ban('cfgsuc','Format Hors-grappe mis à jour.','s');
}
