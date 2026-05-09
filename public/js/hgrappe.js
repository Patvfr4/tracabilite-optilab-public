import { state, sbCall } from './state.js';
import { escapeHtml, formatDateTime, formatDate, deepKey, formatDuree, classeBadge, departementsTexte, separateurModal, classesPills } from './utils.js';
import { estAdmin, estGrappe, estSuperviseur } from './auth.js';
import { notifier, toast, confirm2, showPanel, closeGMod, closeSuccessModal } from './ui.js';
import { formaterAdresseLabo } from './labs.js';
import { libelleTemp, libelleTempCourt, estAlerte } from './envois.js';
import { saveCfg, saveGrappeCfg, loadGrappeConfig } from './app-config.js';

// ── État local ────────────────────────────────────────────────────────────────
var _hgcTab = 'all';
var _hgrTab = 'sent';

// ── Mapping et chargement ─────────────────────────────────────────────────────
export function _mapEnvoiHG(row){var dl=row.dest_lab||null;return{id:row.id,numero:row.numero,source:row.source,exp:row.exp_lab?row.exp_lab.name:'',dest:dl?dl.name:'',destLab:dl,expId:row.exp_labo_id,destId:row.dest_ext_lab_id,expLab:row.exp_lab||{},temp:row.temperature,transporteur:row.transporteur,tubes:row.nb_echantillons,numerosSilp:row.numeros_silp||[],statut:row.statut,notes:row.notes||'',creePar:row.cree_par_nom||'',creeParId:row.cree_par_id,typeSpecimen:row.type_specimen||'exempt',glaceSeche:row.glace_seche||false,confirmToken:row.confirm_token,confirmMethod:row.confirm_method,confirmConforme:row.confirm_conforme,confirmNcTypes:row.confirm_nc_types||[],confirmCommentaire:row.confirm_commentaire||'',confirmRecuPar:row.confirm_recu_par||'',tsConfirm:row.ts_confirm,tsEnvoi:row.ts_envoi};}
export async function loadExtLabs(){try{var r=await state.sb.from('external_labs').select('id,name,parent_id,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text,active').eq('active',true).order('name');if(!r.error)state.labsExternes=r.data||[];}catch(e){}}
export async function loadEnvoisHG(){
  try{
    var sel='*,exp_lab:exp_labo_id(name,adresse,ville,code_postal,telephone,fax_bio_hema,fax_micro,fax_patho,fax_general),dest_lab:dest_ext_lab_id(id,name,parent_id,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text,parent:parent_id(id,name,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text))';
    var cutoff=new Date(Date.now()-7*24*3600*1000).toISOString();
    var q1=state.sb.from('envois_hgrappe').select(sel).in('statut',['En attente','En transit','Problème']).order('ts_envoi',{ascending:false});
    var q2=state.sb.from('envois_hgrappe').select(sel).in('statut',['Reçu','Aucune réponse reçue']).gte('ts_envoi',cutoff).order('ts_envoi',{ascending:false});
    if(!estGrappe()){q1=q1.eq('exp_labo_id',state.activeLaboId);q2=q2.eq('exp_labo_id',state.activeLaboId);}
    var[r1,r2]=await Promise.all([q1,q2]);
    if(!r1.error&&!r2.error)state.envoisHG=(r1.data||[]).concat(r2.data||[]).sort(function(a,b){return new Date(b.ts_envoi)-new Date(a.ts_envoi);}).map(_mapEnvoiHG);
  }catch(e){}
  await autoCloseHGEnvois();
}
async function autoCloseHGEnvois(){
  var threshold=state.CFG.hgrappeAutoCloseDays||10;
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-threshold);
  var toClose=state.envoisHG.filter(function(e){return e.statut==='En transit'&&!e.tsConfirm&&new Date(e.tsEnvoi)<cutoff;});
  if(!toClose.length)return;
  var ids=toClose.map(function(e){return e.id;});
  var r=await state.sb.from('envois_hgrappe').update({statut:'Aucune réponse reçue'}).in('id',ids);
  if(!r.error){toClose.forEach(function(e){e.statut='Aucune réponse reçue';});}
}

// ── Helpers affichage ─────────────────────────────────────────────────────────
export function classeBadgeHG(s){return s==='Reçu'?'br':s==='Problème'?'bp2':s==='Aucune réponse reçue'?'bperdu':s==='En attente'?'ba':'bt';}
function hgDays(e){return(new Date()-new Date(e.tsEnvoi))/86400000;}
export function estAlarmeHG(e){return e.statut==='En transit'&&!e.tsConfirm&&hgDays(e)>(state.CFG.hgrappeAlarmDays||3);}
export function estSansReponse(e){return e.statut==='Aucune réponse reçue';}
export function classeLigneHG(e){if(estSansReponse(e))return'hg-ar-lost';if(estAlarmeHG(e))return'hg-ar';return'';}
export function estAlerteHG(e){return estAlarmeHG(e)||estSansReponse(e);}
export function afficherLegendeHG(elId,arr){
  var el=document.getElementById(elId);if(!el)return;
  var haA=arr.some(estAlarmeHG),haN=arr.some(estSansReponse);
  if(!haA&&!haN){el.innerHTML='';return;}
  var rows=[];
  if(haA)rows.push('<div class="rleg-row hg-ar-row"><span class="badge bt">En transit</span><span class="talarm">⚠ '+(state.CFG.hgrappeAlarmDays||3)+' j+</span><span class="rleg-desc">Aucune confirmation après '+(state.CFG.hgrappeAlarmDays||3)+' jours</span></div>');
  if(haN)rows.push('<div class="rleg-row hg-ar-lost-row"><span class="badge bperdu">Aucune réponse</span><span class="rleg-desc">Statut basculé automatiquement après '+(state.CFG.hgrappeAutoCloseDays||10)+' jours</span></div>');
  el.innerHTML='<details class="rleg"><summary class="rleg-title">Légende</summary><div class="rleg-rows">'+rows.join('')+'</div></details>';
}
export function ligneDestHG(e){var lab=e.destLab;if(!lab)return escapeHtml(e.dest||'—');var parentName=lab.parent?lab.parent.name:null;if(parentName)return '<span>'+escapeHtml(parentName)+'</span><br><span style="font-size:11px;color:var(--t2);padding-left:8px">↳ '+escapeHtml(lab.name)+'</span>';return escapeHtml(lab.name||'—');}
export function texteDestHG(e){var lab=e.destLab;if(!lab)return e.dest||'';var parentName=lab.parent?lab.parent.name:'';return (parentName?parentName+' ':'')+lab.name;}
export function adresseDestHG(lab){if(!lab)return null;var fresh=state.labsExternes&&state.labsExternes.find(function(x){return x.id===lab.id;})||lab;var parentObj=lab.parent||(lab.parent_id&&state.labsExternes&&state.labsExternes.find(function(x){return x.id===lab.parent_id;}))||null;var p=parentObj||{};function f(field){return fresh[field]||p[field]||'';}var r={adresse:f('adresse'),adresse2:f('adresse2'),ville:f('ville'),code_postal:f('code_postal'),province:f('province'),pays:f('pays'),telephone:f('telephone')};if(!r.adresse&&!r.adresse2&&!r.ville&&!r.code_postal&&!r.province&&!r.pays&&!r.telephone)return null;return r;}

// ── Mode switcher ─────────────────────────────────────────────────────────────
export function isHGEnabled(){if(!state.currentUser)return false;if(estAdmin())return true;var labs=state.CFG.hgrappeEnabledLabs||[];return labs.indexOf(state.activeLaboId)!==-1;}
export function initHGMode(){
  var canHG=isHGEnabled();var sw=document.getElementById('mode-sw');
  if(sw)sw.classList.toggle('gone',!canHG);
  if(!canHG){state.modeHG=false;updateSidebarForMode();return;}
  var saved=localStorage.getItem('optilab-mode')||'intra';
  state.modeHG=saved==='hgrappe';updateSidebarForMode();
  if(state.modeHG){
    Promise.all([loadExtLabs(),loadEnvoisHG()]).then(function(){
      var a=document.querySelector('.panel.active');if(!a)return;
      var n=a.id.replace('panel-','');
      if(n==='hg-silp'||n==='hg-hsilp')initHgSilpForm();
      else if(n==='hg-confirmations')renderHGConfirmations();
      else if(n==='hg-resume')renderHGResume();
      else if(n==='hg-historique')renderHGHistorique();
      else if(n==='config')renderExtLabsList();
    });
    var td=new Date(),fd=new Date(td);fd.setDate(fd.getDate()-5);
    var f30=fd.toISOString().slice(0,10),t0=td.toISOString().slice(0,10);
    document.getElementById('hgc-from').value=f30;document.getElementById('hgc-to').value=t0;
    document.getElementById('hgr-from').value=f30;document.getElementById('hgr-to').value=t0;
    document.getElementById('hgh-from').value=f30;document.getElementById('hgh-to').value=t0;
    var hgrls=document.getElementById('hgr-ls');
    if(hgrls&&estGrappe()){hgrls.classList.remove('gone');hgrls.innerHTML='';state.laboratoires.forEach(function(l){var o=document.createElement('option');o.value=l.id;o.textContent=l.name;hgrls.appendChild(o);});if(state.activeLaboId)hgrls.value=state.activeLaboId;}
  }
}
export function updateSidebarForMode(){
  var ig=document.getElementById('nav-intra-group'),hg=document.getElementById('nav-hgrappe-group');
  if(ig)ig.classList.toggle('gone',state.modeHG);if(hg)hg.classList.toggle('gone',!state.modeHG);
  var lbl=document.getElementById('mode-sw-label');if(lbl)lbl.textContent=state.modeHG?'Hors-grappe':'Intra-grappe';
  var ico=document.getElementById('mode-sw-ico');
  if(ico){ico.innerHTML=state.modeHG?'<path d="m15 15 6 6"/><path d="m15 9 6-6"/><path d="M21 16v5h-5"/><path d="M21 8V3h-5"/><path d="M3 16v5h5"/><path d="m3 21 6-6"/><path d="M3 8V3h5"/><path d="M9 9 3 3"/>':'<path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/>';}
  var oi=document.getElementById('mode-opt-intra'),oh=document.getElementById('mode-opt-hgrappe');
  if(oi){oi.style.fontWeight=state.modeHG?'400':'700';oi.style.color=state.modeHG?'':'rgba(255,255,255,.9)';}
  if(oh){oh.style.fontWeight=state.modeHG?'700':'400';oh.style.color=state.modeHG?'rgba(255,255,255,.9)':'';}
  var sidebar=document.querySelector('.sidebar');if(sidebar)sidebar.classList.toggle('hg-mode',state.modeHG);
  var badge=document.getElementById('sb-mode-badge');
  if(badge){var hasModes=!document.getElementById('mode-sw').classList.contains('gone');badge.textContent=state.modeHG?'Hors-grappe':'Intra-grappe';badge.className='sb-mode-badge'+(hasModes?' '+(state.modeHG?'badge-hg':'badge-intra'):'');}
  var drop=document.getElementById('mode-sw-drop');if(drop)drop.classList.add('gone');
}
export function setMode(mode){
  localStorage.setItem('optilab-mode',mode);state.modeHG=mode==='hgrappe';updateSidebarForMode();
  if(state.modeHG){
    var _td=new Date(),_fd=new Date(_td);_fd.setDate(_fd.getDate()-5);
    var _f5=_fd.toISOString().slice(0,10),_t0=_td.toISOString().slice(0,10);
    ['hgc-from','hgr-from','hgh-from'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=_f5;});
    ['hgc-to','hgr-to','hgh-to'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=_t0;});
    showPanel('hg-silp');
    Promise.all([loadExtLabs(),loadEnvoisHG()]).then(function(){
      var a=document.querySelector('.panel.active');if(!a)return;var n=a.id.replace('panel-','');
      if(n==='hg-silp'||n==='hg-hsilp')initHgSilpForm();
    });
  }else{showPanel('nouveau');}
}
export function toggleModeDrop(e){
  if(e)e.stopPropagation();var drop=document.getElementById('mode-sw-drop');if(!drop)return;
  var isOpen=!drop.classList.contains('gone');drop.classList.toggle('gone',isOpen);
  if(!isOpen){setTimeout(function(){document.addEventListener('click',function close(){drop.classList.add('gone');document.removeEventListener('click',close);},{once:true});},50);}
}

// ── Sélecteurs destinataire HG ────────────────────────────────────────────────
export function buildHgParentSelect(selId){
  var sel=document.getElementById(selId);if(!sel)return;
  var parentIds=state.labsExternes.filter(function(l){return !l.parent_id;}).map(function(l){return l.id;});
  var roots=state.labsExternes.filter(function(l){return !l.parent_id||!parentIds.includes(l.parent_id);});
  sel.innerHTML='<option value="">— Sélectionner un laboratoire —</option>';
  roots.forEach(function(l){var o=document.createElement('option');o.value=l.id;o.textContent=l.name;sel.appendChild(o);});
}
export function updateHgDestSelection(parentSelId,childSelId,childWrapId,hiddenId,addrId){
  var parentId=document.getElementById(parentSelId).value;var childWrap=document.getElementById(childWrapId);var childSel=document.getElementById(childSelId);var hidden=document.getElementById(hiddenId);var addrEl=document.getElementById(addrId);
  if(!parentId){childWrap.style.display='none';hidden.value='';if(addrEl)addrEl.innerHTML='';return;}
  var children=state.labsExternes.filter(function(l){return l.parent_id===parentId;});
  if(children.length){childWrap.style.display='';childSel.innerHTML='<option value="">— Laboratoire principal uniquement —</option>';children.forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent=c.name;childSel.appendChild(o);});childSel.value='';}
  else{childWrap.style.display='none';}
  hidden.value=parentId;showHgDestAddrEl(parentId,addrEl);
}
export function updateHgDestChild(parentSelId,childSelId,hiddenId,addrId){
  var childId=document.getElementById(childSelId).value;var parentId=document.getElementById(parentSelId).value;var hidden=document.getElementById(hiddenId);hidden.value=childId||parentId;showHgDestAddrEl(childId||parentId,document.getElementById(addrId));
}
export function showHgDestAddrEl(labId,addrEl){
  if(!addrEl)return;var lab=state.labsExternes.find(function(l){return l.id===labId;});if(!lab){addrEl.innerHTML='';return;}
  var src=(lab.parent_id)?state.labsExternes.find(function(p){return p.id===lab.parent_id;})||lab:lab;
  var lines=[];if(src.adresse)lines.push(escapeHtml(src.adresse));if(src.adresse2)lines.push(escapeHtml(src.adresse2));
  var cityLine=[src.ville,src.province,src.code_postal].filter(Boolean).join(', ');if(cityLine)lines.push(escapeHtml(cityLine));
  if(src.pays)lines.push(escapeHtml(src.pays));if(src.telephone||lab.telephone)lines.push(escapeHtml(src.telephone||lab.telephone));
  addrEl.innerHTML=lines.length?'<span style="font-size:10px;color:var(--t3);line-height:1.5">'+lines.join(' · ')+'</span>':'';
}
export function onHgSilpParentChange(){updateHgDestSelection('hgs-parent','hgs-child','hgs-child-wrap','hgs-ldest','hgs-dest-addr');}
export function onHgSilpChildChange(){updateHgDestChild('hgs-parent','hgs-child','hgs-ldest','hgs-dest-addr');}
export function onHghParentChange(){updateHgDestSelection('hgh-parent','hgh-child','hgh-child-wrap','hgh-ldest','hgh-dest-addr');}
export function onHghChildChange(){updateHgDestChild('hgh-parent','hgh-child','hgh-ldest','hgh-dest-addr');}
export function buildHgDestLabObj(destId){
  var lab=state.labsExternes.find(function(l){return l.id===destId;})||null;if(!lab)return null;
  var parent=lab.parent_id?state.labsExternes.find(function(p){return p.id===lab.parent_id;})||null:null;
  return Object.assign({},lab,{parent:parent});
}

// ── Formulaire SILP HG ────────────────────────────────────────────────────────
export function initHgSilpForm(){
  var expLab=state.laboratoires.find(function(l){return l.id===state.activeLaboId;})||{};
  var el=document.getElementById('hgs-lexp');if(el)el.value=state.currentUser.lab?state.currentUser.lab.name:(expLab.name||'');
  var ea=document.getElementById('hgs-lexp-addr');if(ea)ea.textContent=formaterAdresseLabo(expLab);
  buildHgParentSelect('hgs-parent');
  var tr=document.getElementById('hgs-trans');if(tr){tr.innerHTML='<option value="">— Sélectionner —</option>';state.CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;tr.appendChild(o);});}
  var ts=document.getElementById('hgs-tspec');if(ts){ts.innerHTML='';state.CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;ts.appendChild(o);});}
  renderHgsTempPills();
}
function renderHgsTempPills(){
  var c=document.getElementById('hgs-tpills-c');if(!c)return;c.innerHTML='';
  state.CFG.temperatures.forEach(function(t,i){var cls=classesPills[i%classesPills.length];var el=document.createElement('div');el.className='tpill';el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);el.onclick=(function(lbl,pc){return function(){sHgsTemp(lbl,pc);};})(t.label,cls);c.appendChild(el);});
  state.hgTemperature='';
}
function sHgsTemp(lbl,pc){
  state.hgTemperature=lbl;state.hgRefrigerant=false;
  document.querySelectorAll('#hgs-tpills-c .tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===lbl;});
  var gs=document.getElementById('hgs-glace-section');
  if(gs){if(tCfg&&tCfg.ask_glace){gs.style.display='';var expLab=state.currentUser&&state.laboratoires.find(function(l){return l.id===state.activeLaboId;});var defRef=expLab&&expLab.default_refrigerant;if(defRef==='glace_seche'){state.hgRefrigerant=true;setHgsSGC(true);}else if(defRef==='sachet'){state.hgRefrigerant=false;setHgsSGC(false);}else{state.hgRefrigerant=null;}}else{gs.style.display='none';state.hgRefrigerant=false;}}
}
export function setHgsSGC(val){
  state.hgRefrigerant=val;var bO=document.getElementById('hgs-btn-glace-oui'),bN=document.getElementById('hgs-btn-glace-non');
  if(bO)bO.style.outline=val?'2px solid var(--brand-azure-deep)':'';if(bN)bN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}
export function addHgsList(){
  var inp=document.getElementById('hgs-nlist-input'),errEl=document.getElementById('hgs-nlist-err');var v=inp.value.trim();errEl.classList.remove('show');if(!v)return;
  if(!/^\d+$/.test(v)){errEl.textContent='Uniquement des chiffres.';errEl.classList.add('show');return;}
  if(state.hgListesSilp.indexOf(v)!==-1){errEl.textContent='Ce numéro est déjà dans la liste.';errEl.classList.add('show');return;}
  if(state.envoisHG.some(function(e){return e.numerosSilp&&e.numerosSilp.indexOf(v)!==-1;})){errEl.textContent='Ce numéro est déjà lié à un envoi Hors-grappe existant.';errEl.classList.add('show');return;}
  state.hgListesSilp.push(v);inp.value='';renderHgsChips();inp.focus();
}
export function removeHgsList(v){state.hgListesSilp=state.hgListesSilp.filter(function(x){return x!==v;});renderHgsChips();}
export function renderHgsChips(){var el=document.getElementById('hgs-nlist-chips');if(!el)return;el.innerHTML=state.hgListesSilp.map(function(v){return'<div class="nlist-chip"><span>'+escapeHtml(v)+'</span><button type="button" onclick="removeHgsList(\''+escapeHtml(v)+'\')" title="Retirer">&times;</button></div>';}).join('');}
export function resetHgSilpForm(){
  var ps=document.getElementById('hgs-parent');if(ps)ps.value='';var cw=document.getElementById('hgs-child-wrap');if(cw)cw.style.display='none';
  document.getElementById('hgs-ldest').value='';var da=document.getElementById('hgs-dest-addr');if(da)da.innerHTML='';
  document.getElementById('hgs-notes').value='';document.getElementById('hgs-trans').value='';document.getElementById('hgs-ntub').value='';
  state.hgTemperature='';state.hgRefrigerant=false;state.hgListesSilp=[];renderHgsChips();
  var gs=document.getElementById('hgs-glace-section');if(gs)gs.style.display='none';
  document.querySelectorAll('#hgs-tpills-c .tpill').forEach(function(el){el.className='tpill';});
  var ts=document.getElementById('hgs-tspec');if(ts)ts.value=state.CFG.bordereau.specTypes[0]&&state.CFG.bordereau.specTypes[0].id||'exempt';
  state.hgSansSilp=false;var cb=document.getElementById('hgs-no-silp-cb');if(cb)cb.checked=false;
  var w=document.getElementById('hgs-nlist-wrap'),warn=document.getElementById('hgs-no-silp-warn'),nw=document.getElementById('hgs-no-silp-num-wrap');
  if(w)w.style.display='';if(warn)warn.style.display='none';if(nw)nw.style.display='none';
}
export async function saveEnvoiHgSilp(){
  var destId=document.getElementById('hgs-ldest').value,tr=document.getElementById('hgs-trans').value;
  if(!destId){notifier('hgs-serr','Veuillez sélectionner un laboratoire destinataire.','e');return;}
  if(!state.hgTemperature){notifier('hgs-serr','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===state.hgTemperature;});
  if(tCfg&&tCfg.ask_glace&&state.hgRefrigerant===null){notifier('hgs-serr','Veuillez sélectionner le type de réfrigérant.','e');return;}
  if(!tr){notifier('hgs-serr','Veuillez sélectionner un transporteur.','e');return;}
  if(state.hgSansSilp){await _doSaveEnvoiHgHsilp();return;}
  if(!state.hgListesSilp.length){notifier('hgs-serr','Veuillez ajouter au moins un numéro de liste de repérage.','e');return;}
  var tubes=parseInt(document.getElementById('hgs-ntub').value)||null;
  var spec=document.getElementById('hgs-tspec')?document.getElementById('hgs-tspec').value:'exempt';
  var _hgStat=window.isBDEnabled&&window.isBDEnabled()?'En attente':'En transit';
  var r=await sbCall(state.sb.rpc('create_envoi_hgrappe',{p_source:'silp',p_exp_labo_id:state.activeLaboId,p_dest_ext_lab_id:destId,p_temperature:state.hgTemperature,p_transporteur:tr,p_nb_echantillons:tubes,p_numeros_silp:state.hgListesSilp.slice(),p_notes:document.getElementById('hgs-notes').value,p_cree_par_id:state.currentUser.id,p_cree_par_nom:state.currentUser.nom,p_type_specimen:spec,p_glace_seche:state.hgRefrigerant===true,p_statut:_hgStat}),'hgs-serr');
  if(r.error)return;
  var result=r.data,destLabObj=buildHgDestLabObj(destId),expLab=state.laboratoires.find(function(l){return l.id===state.activeLaboId;})||{};
  var destDispName=destLabObj?(destLabObj.parent?(destLabObj.parent.name+'\n'+destLabObj.name):(destLabObj.name||'—')):'—';
  state.hgDonneesImpression={numero:result.numero,token:result.token,source:'silp',exp:state.currentUser.lab?state.currentUser.lab.name:(expLab.name||'—'),dest:destDispName,destLab:destLabObj,temp:state.hgTemperature,transporteur:tr,tubes:tubes,numerosSilp:state.hgListesSilp.slice(),notes:document.getElementById('hgs-notes').value.trim(),creePar:state.currentUser.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:state.hgRefrigerant===true,expLab:expLab};
  resetHgSilpForm();await loadEnvoisHG();showHGSuccessModal(result.numero);
}
async function _doSaveEnvoiHgHsilp(){
  var destId=document.getElementById('hgs-ldest').value,tr=document.getElementById('hgs-trans').value;
  var tubes=parseInt(document.getElementById('hgs-ntub').value)||null;var spec=document.getElementById('hgs-tspec')?document.getElementById('hgs-tspec').value:'exempt';
  var _hgStat2=window.isBDEnabled&&window.isBDEnabled()?'En attente':'En transit';
  var r=await sbCall(state.sb.rpc('create_envoi_hgrappe',{p_source:'hsilp',p_exp_labo_id:state.activeLaboId,p_dest_ext_lab_id:destId,p_temperature:state.hgTemperature,p_transporteur:tr,p_nb_echantillons:tubes,p_numeros_silp:[],p_notes:document.getElementById('hgs-notes').value,p_cree_par_id:state.currentUser.id,p_cree_par_nom:state.currentUser.nom,p_type_specimen:spec,p_glace_seche:state.hgRefrigerant===true,p_statut:_hgStat2}),'hgs-serr');
  if(r.error)return;
  var result=r.data,destLabObj=buildHgDestLabObj(destId),expLab=state.laboratoires.find(function(l){return l.id===state.activeLaboId;})||{};
  var destDispName=destLabObj?(destLabObj.parent?(destLabObj.parent.name+'\n'+destLabObj.name):(destLabObj.name||'—')):'—';
  state.hgDonneesImpression={numero:result.numero,token:result.token,source:'hsilp',exp:state.currentUser.lab?state.currentUser.lab.name:(expLab.name||'—'),dest:destDispName,destLab:destLabObj,temp:state.hgTemperature,transporteur:tr,tubes:tubes,numerosSilp:[],notes:document.getElementById('hgs-notes').value.trim(),creePar:state.currentUser.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:state.hgRefrigerant===true,expLab:expLab};
  resetHgSilpForm();await loadEnvoisHG();showHGSuccessModal(result.numero);
}
export async function fetchHgHsilpPreviewNum(){var el=document.getElementById('hgh-nlist');if(!el)return;el.value='Chargement…';el.classList.remove('valid');try{var r=await state.sb.rpc('peek_next_hgrappe');if(!r.error&&r.data){el.value=r.data;el.classList.add('valid');}else{el.value='HG-######-#####';}}catch(e){el.value='HG-######-#####';}}
export function toggleHgsNoSilp(){
  var cb=document.getElementById('hgs-no-silp-cb');
  if(cb&&cb.checked){cb.checked=false;window.showNoListModal(function(){cb.checked=true;state.hgSansSilp=true;_applyHgsNoSilpUi(true);fetchHgHsilpPreviewNum();});}
  else{state.hgSansSilp=false;_applyHgsNoSilpUi(false);}
}
function _applyHgsNoSilpUi(on){var wrap=document.getElementById('hgs-nlist-wrap'),warn=document.getElementById('hgs-no-silp-warn'),nw=document.getElementById('hgs-no-silp-num-wrap');if(wrap)wrap.style.display=on?'none':'';if(warn)warn.style.display=on?'':'none';if(nw)nw.style.display=on?'':'none';}

// ── Modal succès HG ───────────────────────────────────────────────────────────
export function showHGSuccessModal(num){
  var cb=document.getElementById('hg-printed-cb');if(cb){cb.checked=false;}
  var cl=document.getElementById('hg-success-close-btn');if(cl){cl.disabled=true;cl.style.opacity='.4';cl.style.cursor='not-allowed';}
  var msgEl=document.getElementById('hg-success-msg');if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+escapeHtml(num)+'</strong> enregistré avec succès.';
  document.getElementById('hg-success-modal').style.display='flex';
}
export function toggleHGClose(){
  var cb=document.getElementById('hg-printed-cb'),cl=document.getElementById('hg-success-close-btn');if(!cl)return;
  var ok=cb&&cb.checked;cl.disabled=!ok;cl.style.opacity=ok?'1':'.4';cl.style.cursor=ok?'pointer':'not-allowed';
}
export function closeHGSuccessModal(){document.getElementById('hg-success-modal').style.display='none';if(state.modeHG)showPanel('hg-silp');}

// ── Confirmations ─────────────────────────────────────────────────────────────
export function getHGRLaboId(){var ls=document.getElementById('hgr-ls');return(ls&&!ls.classList.contains('gone')&&ls.value)?ls.value:(state.currentUser?state.activeLaboId:null);}
export async function loadHGConfirmationsPage(page){
  state.hgcPage=page;var fv=document.getElementById('hgc-from').value,tv=document.getElementById('hgc-to').value,fstat=document.getElementById('hgc-fstat').value;var offset=page*10;
  var q=state.sb.from('envois_hgrappe').select('id,numero,source,exp_labo_id,dest_ext_lab_id,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_confirm,confirm_method,confirm_conforme,cree_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_ext_lab_id(id,name,parent_id,parent:parent_id(id,name))',{count:'exact'});
  if(!estGrappe()&&!estAdmin())q=q.eq('exp_labo_id',state.activeLaboId);
  if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');
  if(fstat==='pending')q=q.is('ts_confirm',null);else if(fstat==='noans')q=q.eq('statut','Aucune réponse reçue');else if(fstat==='online')q=q.eq('confirm_method','online');else if(fstat==='fax')q=q.eq('confirm_method','fax');
  q=q.order('ts_envoi',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;
  var data=r.data||[];var total=r.count||0;var hasMore=(offset+data.length)<total;var items=data.map(function(row){return _mapEnvoiHG(row);});
  var countEl=document.getElementById('hgc-count');if(countEl)countEl.textContent=total+' résultat'+(total!==1?'s':'');
  document.getElementById('hgc-tbody').innerHTML=items.map(function(e){var conf=e.tsConfirm?'<span class="badge '+(e.confirmConforme?'br':'bp2')+'">'+(e.confirmMethod==='fax'?'Fax':'En ligne')+'</span>':estSansReponse(e)?'<span class="badge bperdu">Aucune réponse</span>':estAlarmeHG(e)?'<span class="badge ba">⚠ En attente</span>':'<span class="badge ba">En attente</span>';var actions=!e.tsConfirm&&!estSansReponse(e)?'<button class="bsm" onclick="openHGFaxModal(\''+e.id+'\')" style="font-size:11px;padding:4px 8px">Saisir fax</button>':'<span style="font-size:11px;color:var(--t3)">—</span>';return'<tr class="'+classeLigneHG(e)+'" style="cursor:pointer" onclick="showHGDetail(\''+e.id+'\')"><td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+escapeHtml(e.numero)+'</td><td style="line-height:1.4">'+ligneDestHG(e)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td><td><span class="badge '+classeBadgeHG(e.statut)+'">'+escapeHtml(e.statut)+'</span></td><td>'+conf+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsConfirm)+'</td><td onclick="event.stopPropagation()">'+actions+'</td></tr>';}).join('');
  afficherLegendeHG('hgc-legend',items);
  var pgEl=document.getElementById('hgc-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('hgc-prev').disabled=page===0;document.getElementById('hgc-next').disabled=!hasMore;document.getElementById('hgc-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10);}
}
export function changeHGCPage(delta){loadHGConfirmationsPage(Math.max(0,state.hgcPage+delta));}
export function renderHGConfirmations(){loadHGConfirmationsPage(0);}

// ── Résumé HG ─────────────────────────────────────────────────────────────────
function renderHGRTable(items,emptyMsg){
  var grp=(document.getElementById('hgr-group')||{}).value||'envoi';var emptyEl=document.getElementById('hgr-empty'),tableEl=document.getElementById('hgr-table');
  if(!items.length){emptyEl.classList.remove('gone');emptyEl.innerHTML='<div class="empty-state" style="padding:1.5rem"><p style="margin:0">'+(emptyMsg||'Aucun envoi pour cette période.')+'</p></div>';tableEl.classList.add('gone');return;}
  emptyEl.classList.add('gone');tableEl.classList.remove('gone');
  var g={};items.forEach(function(e){var k=grp==='confirm'?(e.tsConfirm?deepKey(e.tsConfirm):'sans-date'):deepKey(e.tsEnvoi);if(!g[k])g[k]=[];g[k].push(e);});
  var groups=Object.entries(g).sort(function(a,b){if(a[0]==='sans-date')return-1;if(b[0]==='sans-date')return 1;return b[0].localeCompare(a[0]);});
  document.getElementById('hgr-tbody').innerHTML=groups.map(function(gr){var lbl=gr[0]==='sans-date'?'Non confirmé':formatDate(gr[0]+'T12:00:00');return'<tr class="dsep"><td colspan="9">'+lbl+'</td></tr>'+gr[1].map(function(e){var conf=e.tsConfirm?'<span class="badge '+(e.confirmConforme?'br':'bp2')+'">'+(e.confirmMethod==='fax'?'Fax':'En ligne')+'</span>':estSansReponse(e)?'<span class="badge bperdu">Aucune réponse</span>':estAlarmeHG(e)?'<span class="badge ba">⚠ En attente</span>':'<span class="badge ba">En attente</span>';return'<tr class="'+classeLigneHG(e)+'" style="cursor:pointer" onclick="showHGDetail(\''+e.id+'\')"><td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+escapeHtml(e.numero)+'</td><td style="line-height:1.4">'+ligneDestHG(e)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td>'+(e.tubes||'—')+'</td><td style="font-size:11px">'+escapeHtml(e.creePar)+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td><td>'+conf+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsConfirm)+'</td></tr>';}).join('');}).join('');
  afficherLegendeHG('hgr-legend',items);
}
function renderHGRPager(total,page,hasMore){var pgEl=document.getElementById('hgr-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('hgr-prev').disabled=page===0;document.getElementById('hgr-next').disabled=!hasMore;document.getElementById('hgr-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10);}}
export async function loadHGRSentPage(laboId,page){
  state.hgrPageEnvois=page;state.hgrLaboEnvois=laboId;var fv=document.getElementById('hgr-from').value,tv=document.getElementById('hgr-to').value;var offset=page*10;
  var q=state.sb.from('envois_hgrappe').select('id,numero,source,exp_labo_id,dest_ext_lab_id,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_confirm,confirm_method,confirm_conforme,cree_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_ext_lab_id(id,name,parent_id,parent:parent_id(id,name))',{count:'exact'}).eq('exp_labo_id',laboId);
  if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');q=q.order('ts_envoi',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;
  var data=r.data||[];var total=r.count||0;var hasMore=(offset+data.length)<total;document.getElementById('hgr-sc').textContent=total;renderHGRTable(data.map(function(row){return _mapEnvoiHG(row);}));renderHGRPager(total,page,hasMore);
}
export async function loadHGRConfPage(laboId,page){
  state.hgrPageConfirmes=page;state.hgrLaboConfirmes=laboId;var fv=document.getElementById('hgr-from').value,tv=document.getElementById('hgr-to').value;var grp=(document.getElementById('hgr-group')||{}).value||'envoi';var offset=page*10;
  var q=state.sb.from('envois_hgrappe').select('id,numero,source,exp_labo_id,dest_ext_lab_id,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_confirm,confirm_method,confirm_conforme,cree_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_ext_lab_id(id,name,parent_id,parent:parent_id(id,name))',{count:'exact'}).eq('exp_labo_id',laboId).not('ts_confirm','is',null);
  if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');q=q.order(grp==='confirm'?'ts_confirm':'ts_envoi',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;
  var data=r.data||[];var total=r.count||0;var hasMore=(offset+data.length)<total;document.getElementById('hgr-dc').textContent=total;renderHGRTable(data.map(function(row){return _mapEnvoiHG(row);}));renderHGRPager(total,page,hasMore);
}
export async function loadHGRWaitPage(laboId,page){
  state.hgrPageAttente=page;state.hgrLaboAttente=laboId;var fv=document.getElementById('hgr-from').value,tv=document.getElementById('hgr-to').value;var offset=page*10;
  var q=state.sb.from('envois_hgrappe').select('id,numero,source,exp_labo_id,dest_ext_lab_id,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_confirm,confirm_method,confirm_conforme,cree_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_ext_lab_id(id,name,parent_id,parent:parent_id(id,name))',{count:'exact'}).eq('exp_labo_id',laboId).is('ts_confirm',null);
  if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');q=q.order('ts_envoi',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;
  var data=r.data||[];var total=r.count||0;var hasMore=(offset+data.length)<total;document.getElementById('hgr-wc').textContent=total;renderHGRTable(data.map(function(row){return _mapEnvoiHG(row);}),'Aucun envoi en attente pour cette période.');renderHGRPager(total,page,hasMore);
}
export function switchHGRTab(t){
  _hgrTab=t;['sent','recv','wait'].forEach(function(k){document.getElementById('hgrtab-'+k).classList.toggle('active',t===k);});
  renderHGResume();
}
export function changeHGRPage(delta){var laboId=getHGRLaboId();if(_hgrTab==='sent')loadHGRSentPage(laboId,Math.max(0,state.hgrPageEnvois+delta));else if(_hgrTab==='recv')loadHGRConfPage(laboId,Math.max(0,state.hgrPageConfirmes+delta));else loadHGRWaitPage(laboId,Math.max(0,state.hgrPageAttente+delta));}
export async function renderHGResume(){
  var laboId=getHGRLaboId();if(!laboId)return;var fv=document.getElementById('hgr-from').value,tv=document.getElementById('hgr-to').value;
  function bq(){var q=state.sb.from('envois_hgrappe').select('*',{count:'exact',head:true}).eq('exp_labo_id',laboId);if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');return q;}
  var[rs,rc,rw]=await Promise.all([bq(),bq().not('ts_confirm','is',null),bq().is('ts_confirm',null)]);
  document.getElementById('hgr-sc').textContent=rs.count||0;document.getElementById('hgr-dc').textContent=rc.count||0;document.getElementById('hgr-wc').textContent=rw.count||0;
  if(_hgrTab==='sent')loadHGRSentPage(laboId,0);else if(_hgrTab==='recv')loadHGRConfPage(laboId,0);else loadHGRWaitPage(laboId,0);
}

// ── Historique HG ─────────────────────────────────────────────────────────────
export async function loadHGHistPage(page){
  state.hghPage=page;var q_str=document.getElementById('hgh-search').value.trim().toLowerCase();var fs=document.getElementById('hgh-fstat').value,hfv=document.getElementById('hgh-from').value,htv=document.getElementById('hgh-to').value;var offset=page*10;
  var q=state.sb.from('envois_hgrappe').select('id,numero,source,exp_labo_id,dest_ext_lab_id,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_confirm,confirm_method,confirm_conforme,cree_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_ext_lab_id(id,name,parent_id,parent:parent_id(id,name))',{count:'exact'});
  if(!estGrappe()&&!estAdmin())q=q.eq('exp_labo_id',state.activeLaboId);
  if(hfv)q=q.gte('ts_envoi',hfv+'T00:00:00');if(htv)q=q.lte('ts_envoi',htv+'T23:59:59');if(fs)q=q.eq('statut',fs);
  if(q_str){var eIds=state.laboratoires.filter(function(l){return l.name.toLowerCase().includes(q_str);}).map(function(l){return l.id;});var dIds=state.labsExternes.filter(function(l){return(l.name||'').toLowerCase().includes(q_str)||((l.parent&&l.parent.name)||'').toLowerCase().includes(q_str);}).map(function(l){return l.id;});var op=['numero.ilike.%'+q_str+'%','transporteur.ilike.%'+q_str+'%','cree_par_nom.ilike.%'+q_str+'%'];if(eIds.length)op.push('exp_labo_id.in.('+eIds.join(',')+')');if(dIds.length)op.push('dest_ext_lab_id.in.('+dIds.join(',')+')');q=q.or(op.join(','));}
  q=q.order('ts_envoi',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;
  var data=r.data||[];var total=r.count||0;var hasMore=(offset+data.length)<total;var items=data.map(function(row){return _mapEnvoiHG(row);});
  var countEl=document.getElementById('hgh-count');if(countEl)countEl.textContent=total+' résultat'+(total!==1?'s':'');
  document.getElementById('hgh-tbody').innerHTML=items.map(function(e){var conf=e.tsConfirm?'<span class="badge '+(e.confirmConforme?'br':'bp2')+'">'+(e.confirmMethod==='fax'?'Fax':'En ligne')+'</span>':estSansReponse(e)?'<span class="badge bperdu">Aucune réponse</span>':estAlarmeHG(e)?'<span class="badge ba">⚠ En attente</span>':'<span class="badge ba">En attente</span>';return'<tr class="'+classeLigneHG(e)+'" style="cursor:pointer" onclick="showHGDetail(\''+e.id+'\')"><td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+escapeHtml(e.numero)+'</td><td style="line-height:1.4">'+ligneDestHG(e)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td>'+(e.tubes||'—')+'</td><td><span class="badge '+classeBadgeHG(e.statut)+'">'+escapeHtml(e.statut)+'</span></td><td>'+conf+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td></tr>';}).join('');
  afficherLegendeHG('hgh-legend',items);
  var pgEl=document.getElementById('hgh-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('hgh-prev').disabled=page===0;document.getElementById('hgh-next').disabled=!hasMore;document.getElementById('hgh-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10);}
}
export async function loadHGHistStats(){var now=new Date(),ms=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01';var[r1,r2,r3,r4]=await Promise.all([state.sb.from('envois_hgrappe').select('*',{count:'exact',head:true}),state.sb.from('envois_hgrappe').select('*',{count:'exact',head:true}).gte('ts_envoi',ms),state.sb.from('envois_hgrappe').select('*',{count:'exact',head:true}).eq('statut','En transit'),state.sb.from('envois_hgrappe').select('*',{count:'exact',head:true}).not('ts_confirm','is',null)]);if(!r1.error)document.getElementById('hgh-st').textContent=r1.count||0;if(!r2.error)document.getElementById('hgh-sm').textContent=r2.count||0;if(!r3.error)document.getElementById('hgh-str').textContent=r3.count||0;if(!r4.error)document.getElementById('hgh-sconf').textContent=r4.count||0;}
export function changeHGHistPage(delta){loadHGHistPage(Math.max(0,state.hghPage+delta));}
export function onHGHistSearch(){clearTimeout(state.hghTimer);state.hghTimer=setTimeout(function(){loadHGHistPage(0);},400);}
export function renderHGHistorique(){if(!estGrappe()&&!estAdmin())return;loadHGHistStats();loadHGHistPage(0);}

// ── Détail modal HG ───────────────────────────────────────────────────────────
export async function showHGDetail(id){
  var e=state.envoisHG.find(function(x){return x.id===id;})||state.hgCacheModals[id];
  if(!e){
    var _gmb=document.getElementById('gmod-body'),_gf=document.getElementById('gmod-footer'),_gmod=document.getElementById('gmod');
    if(_gmb)_gmb.innerHTML='<div style="text-align:center;padding:2rem;color:var(--t2)">Chargement…</div>';if(_gf)_gf.innerHTML='';if(_gmod)_gmod.classList.add('show');
    try{
      var _rf=await state.sb.from('envois_hgrappe').select('*,exp_lab:exp_labo_id(name,adresse,ville,code_postal,telephone,fax_bio_hema,fax_micro,fax_patho,fax_general),dest_lab:dest_ext_lab_id(id,name,parent_id,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text,parent:parent_id(id,name,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text))').eq('id',id).single();
      if(_rf.error||!_rf.data){if(_gmb)_gmb.innerHTML='<div style="text-align:center;padding:2rem;color:var(--te)">Impossible de charger cet envoi.</div>';return;}
      e=_mapEnvoiHG(_rf.data);state.hgCacheModals[id]=e;
    }catch(_ex){if(_gmb)_gmb.innerHTML='<div style="text-align:center;padding:2rem;color:var(--te)">Impossible de charger cet envoi.</div>';return;}
  }
  var stCfg=state.CFG.bordereau.specTypes.find(function(t){return t.id===e.typeSpecimen;})||{label:e.typeSpecimen||'—'};
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===e.temp;});var showRef=tCfg&&tCfg.ask_glace;
  var h=e.tsEnvoi?((e.tsConfirm?new Date(e.tsConfirm):new Date())-new Date(e.tsEnvoi))/3600000:null;
  var alNoResp=estSansReponse(e);var alD=estAlarmeHG(e);var transitStyle=alNoResp?'color:#991B1B;font-weight:700':alD?'color:var(--te)':'';
  var body=
    '<div class="df"><span>N° envoi</span><span style="font-family:var(--fm)">'+escapeHtml(e.numero)+'</span></div>'+
    '<div class="df"><span>Statut</span><span><span class="badge '+classeBadgeHG(e.statut)+'">'+escapeHtml(e.statut)+'</span></span></div>'+
    separateurModal('Parties')+
    '<div class="df"><span>Expéditeur</span><span>'+escapeHtml(e.exp)+'</span></div>'+
    '<div class="df"><span>Destinataire</span><span style="line-height:1.5">'+ligneDestHG(e)+'</span></div>'+
    separateurModal('Spécimen &amp; transport')+
    '<div class="df"><span>Type de spécimen</span><span>'+escapeHtml(stCfg.label)+'</span></div>'+
    (showRef?'<div class="df"><span>Réfrigérant</span><span>'+(e.glaceSeche?'🧊 Glace sèche (UN 1845)':'❄️ Sachet réfrigérant')+'</span></div>':'')+
    '<div class="df"><span>Température</span><span>'+escapeHtml(libelleTemp(e.temp))+'</span></div>'+
    '<div class="df"><span>Transporteur</span><span>'+escapeHtml(e.transporteur)+'</span></div>'+
    (e.numerosSilp&&e.numerosSilp.length?'<div class="df full"><span>Listes SILP</span><span style="font-family:var(--fm)">'+e.numerosSilp.map(escapeHtml).join(' · ')+'</span></div>':'')+
    (e.tubes?'<div class="df"><span>Échantillons</span><span>'+e.tubes+'</span></div>':'')+
    separateurModal('Traçabilité')+
    '<div class="df"><span>Créé par</span><span>'+escapeHtml(e.creePar||'—')+'</span></div>'+
    '<div class="df"><span>Envoyé le</span><span>'+formatDateTime(e.tsEnvoi)+'</span></div>'+
    '<div class="df"><span>Transit</span><span style="'+transitStyle+'">'+formatDuree(h)+(alNoResp?' ⚠ Aucune réponse':alD?' ⚠':'')+'</span></div>'+
    (e.notes?separateurModal('Notes')+'<div class="df full"><span>Notes</span><span>'+escapeHtml(e.notes)+'</span></div>':'')+
    separateurModal('Confirmation de réception')+
    (e.tsConfirm
      ?'<div class="df"><span>Méthode</span><span>'+(e.confirmMethod==='fax'?'Par fax':'En ligne')+'</span></div>'+
        '<div class="df"><span>Reçu par</span><span>'+escapeHtml(e.confirmRecuPar||'—')+'</span></div>'+
        '<div class="df"><span>Le</span><span>'+formatDateTime(e.tsConfirm)+'</span></div>'+
        '<div class="df"><span>Conformité</span><span>'+(e.confirmConforme===false?'<span style="color:var(--te)">✗ Non conforme</span>':'<span style="color:var(--ts)">✓ Conforme</span>')+'</span></div>'+
        (e.confirmConforme===false&&e.confirmNcTypes&&e.confirmNcTypes.length?'<div class="df"><span>Non-conformité(s)</span><span>'+escapeHtml(e.confirmNcTypes.join(', '))+'</span></div>':'')+
        (e.confirmCommentaire?'<div class="df full"><span>Commentaire</span><span style="color:var(--te)">'+escapeHtml(e.confirmCommentaire)+'</span></div>':'')
      :'<div class="df full"><span style="color:var(--t3);font-style:italic">Aucune confirmation reçue</span><span></span></div>')+
    '<div id="gmod-bd-info"></div>'+
    '<div id="gmod-audit"></div>';
  var canEdit=!e.tsConfirm&&(e.statut==='En transit'||e.statut==='En attente');
  var canPrint=(e.expId===state.activeLaboId||estGrappe())&&(e.statut==='En transit'||e.statut==='En attente');
  var btns=[];
  if(canPrint)btns.push('<button class="bsm bsms" onclick="reprintHGDocsFromEnvoi(\''+e.id+'\')" style="display:inline-flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6H2a1 1 0 00-1 1v5a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2"/><rect x="4" y="1" width="8" height="7" rx="1"/><path d="M4 11h8v4H4z"/></svg>Bordereau + F-G-74</button>');
  if(canEdit)btns.push('<button class="bsm bsmi" onclick="openEditHGEnvoi(\''+e.id+'\')" style="display:inline-flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3l9-9z"/><path d="M9 4l3 3"/></svg>Modifier l\'envoi</button>');
  var gmb=document.getElementById('gmod-body'),gf=document.getElementById('gmod-footer');
  if(gmb)gmb.innerHTML=body;
  if(gf)gf.innerHTML=btns.length?'<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--b3);display:flex;justify-content:flex-end;gap:8px">'+btns.join('')+'</div>':'';
  var gmod=document.getElementById('gmod');if(gmod)gmod.classList.add('show');
  try{
    var[ar,br]=await Promise.all([
      state.sb.from('envois_audit').select('changed_by_nom,changed_at').eq('table_name','envois_hgrappe').eq('record_id',id).eq('action','UPDATE').order('changed_at',{ascending:false}).limit(1),
      state.sb.from('bons_depart_envois').select('bon:bon_id(id,numero,statut,cree_par_nom,created_at)').eq('hg_envoi_id',id).eq('type','hg').maybeSingle(),
    ]);
    var auditEl=document.getElementById('gmod-audit');
    if(!ar.error&&ar.data&&ar.data.length&&auditEl)auditEl.innerHTML='<div class="df full" style="margin-top:6px;padding-top:6px;border-top:0.5px solid var(--b3)"><span style="color:var(--warning)">✎ Modifié</span><span style="color:var(--t2)">'+escapeHtml(ar.data[0].changed_by_nom)+' — '+formatDateTime(ar.data[0].changed_at)+'</span></div>';
    var bdEl=document.getElementById('gmod-bd-info');
    if(bdEl&&!br.error&&br.data&&br.data.bon){
      var bon=br.data.bon;
      var bdBadge=bon.statut==='actif'?'<span class="badge bt">Actif</span>':'<span class="badge bperdu">Annulé</span>';
      bdEl.innerHTML=separateurModal('Bon de départ')
        +'<div class="df"><span>N° bon</span><span><strong>'+escapeHtml(bon.numero)+'</strong>&ensp;'+bdBadge+'</span></div>'
        +'<div class="df"><span>Préparé par</span><span>'+escapeHtml(bon.cree_par_nom)+'</span></div>'
        +'<div class="df full"><span></span><span><button class="bsm bsmi" onclick="closeGMod();showPanel(\'bons-depart\');showBDDetail(\''+bon.id+'\')">Voir le bon →</button></span></div>';
    }
  }catch(ex){}
}

// ── Modal fax confirmation ─────────────────────────────────────────────────────
export function openHGFaxModal(id){
  var e=state.envoisHG.find(function(x){return x.id===id;})||state.hgCacheModals[id];if(!e||e.tsConfirm)return;
  state.hgFaxId=id;state.hgFaxConforme=null;
  document.getElementById('hgfax-num').textContent=e.numero;
  var now=new Date();var localDt=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+'T'+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  document.getElementById('hgfax-dt').value=localDt;document.getElementById('hgfax-par').value='';document.getElementById('hgfax-comment').value='';document.getElementById('hgfax-err').style.display='none';
  document.querySelectorAll('.hgfax-nc-cb').forEach(function(cb){cb.checked=false;});
  document.getElementById('hgfax-nc-section').classList.add('gone');document.getElementById('hgfax-btn-oui').style.outline='';document.getElementById('hgfax-btn-non').style.outline='';
  document.getElementById('hg-fax-modal').style.display='flex';
}
export function closeHGFaxModal(){document.getElementById('hg-fax-modal').style.display='none';state.hgFaxId=null;}
export function setHgFaxConforme(val){
  state.hgFaxConforme=val;
  var bO=document.getElementById('hgfax-btn-oui'),bN=document.getElementById('hgfax-btn-non');
  if(bO)bO.style.outline=val?'2px solid var(--ts)':'';if(bN)bN.style.outline=val===false?'2px solid var(--te)':'';
  document.getElementById('hgfax-nc-section').classList.toggle('gone',val!==false);
}
export async function saveHGFaxConfirm(){
  var err=document.getElementById('hgfax-err');err.style.display='none';
  var dt=document.getElementById('hgfax-dt').value;var par=document.getElementById('hgfax-par').value.trim();
  if(!dt){err.textContent='Veuillez indiquer la date et l\'heure de réception.';err.style.display='block';return;}
  if(!par){err.textContent='Veuillez indiquer le nom.';err.style.display='block';return;}
  if(state.hgFaxConforme===null){err.textContent='Veuillez indiquer si le colis est conforme ou non.';err.style.display='block';return;}
  var ncTypes=[];
  if(state.hgFaxConforme===false){
    document.querySelectorAll('.hgfax-nc-cb:checked').forEach(function(cb){ncTypes.push(cb.value);});
    var comment=document.getElementById('hgfax-comment').value.trim();
    if(!ncTypes.length){err.textContent='Veuillez cocher au moins un type de non-conformité.';err.style.display='block';return;}
    if(!comment){err.textContent='Veuillez décrire la non-conformité.';err.style.display='block';return;}
  }
  var comment=state.hgFaxConforme===false?document.getElementById('hgfax-comment').value.trim():'';
  var statut=state.hgFaxConforme?'Reçu':'Problème';
  var e=state.envoisHG.find(function(x){return x.id===state.hgFaxId;});if(!e)return;
  var r=await state.sb.from('envois_hgrappe').update({statut:statut,confirm_method:'fax',confirm_conforme:state.hgFaxConforme,confirm_nc_types:ncTypes,confirm_commentaire:comment,confirm_recu_par:par,ts_confirm:new Date(dt).toISOString()}).eq('id',state.hgFaxId);
  if(r.error){err.textContent='Erreur : '+r.error.message;err.style.display='block';return;}
  if(!state.hgFaxConforme){
    state.sb.from('notification_queue').insert({
      type:'hg_nc',envoi_hg_id:state.hgFaxId,exp_labo_id:e.expId,envoi_numero:e.numero,
      details:{nc_types:ncTypes,commentaire:comment,recu_par:par,conforme:false,method:'fax'}
    }).then(function(){}).catch(function(){});
  }
  closeHGFaxModal();await loadEnvoisHG();renderHGConfirmations();toast('Confirmation par fax enregistrée.','s');
}

// ── Modification envoi HG ──────────────────────────────────────────────────────
export function openEditHGEnvoi(id){
  var e=state.envoisHG.find(function(x){return x.id===id;});if(!e)return;
  state.hgEditId=id;state.hgEditTemperature=e.temp;state.hgEditRefrigerant=e.glaceSeche||false;state.hgEditListesSilp=(e.numerosSilp||[]).slice();
  document.getElementById('hge-num-ro').textContent=e.numero;document.getElementById('hge-exp-ro').textContent=e.exp;
  document.getElementById('hge-dest-ro').innerHTML=ligneDestHG(e);document.getElementById('hge-src-ro').textContent=e.source==='silp'?'SILP':'Hors SILP';
  document.getElementById('hge-err').style.display='none';
  var tr=document.getElementById('hge-trans');tr.innerHTML='<option value="">— Sélectionner —</option>';state.CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;tr.appendChild(o);});tr.value=e.transporteur;
  var ts=document.getElementById('hge-tspec');ts.innerHTML='';state.CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;ts.appendChild(o);});ts.value=e.typeSpecimen||'exempt';
  document.getElementById('hge-ntub').value=e.tubes||'';document.getElementById('hge-notes').value=e.notes||'';
  renderHgeTempPills();
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===e.temp;})||{};var gs=document.getElementById('hge-glace-section');
  if(gs){if(tCfg&&tCfg.ask_glace){gs.style.display='';setHgeSGC(e.glaceSeche);}else{gs.style.display='none';}}
  var ls=document.getElementById('hge-lists-section');if(ls)ls.style.display=e.source==='silp'?'':'none';
  renderHgeChips();closeGMod();document.getElementById('hg-edit-modal').style.display='flex';
}
export function closeHGEditModal(){document.getElementById('hg-edit-modal').style.display='none';state.hgEditId=null;}
function renderHgeTempPills(){
  var c=document.getElementById('hge-tpills-c');if(!c)return;c.innerHTML='';
  state.CFG.temperatures.forEach(function(t,i){var cls=classesPills[i%classesPills.length];var el=document.createElement('div');el.className='tpill'+(t.label===state.hgEditTemperature?' '+cls:'');el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);el.onclick=(function(lbl,pc){return function(){sHgeTemp(lbl,pc);};})(t.label,cls);c.appendChild(el);});
}
function sHgeTemp(lbl,pc){
  state.hgEditTemperature=lbl;state.hgEditRefrigerant=false;
  document.querySelectorAll('#hge-tpills-c .tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===lbl;})||{};var gs=document.getElementById('hge-glace-section');
  if(gs){if(tCfg&&tCfg.ask_glace){gs.style.display='';state.hgEditRefrigerant=null;}else{gs.style.display='none';state.hgEditRefrigerant=false;}}
}
export function setHgeSGC(val){
  state.hgEditRefrigerant=val;var bO=document.getElementById('hge-btn-glace-oui'),bN=document.getElementById('hge-btn-glace-non');
  if(bO)bO.style.outline=val?'2px solid var(--brand-azure-deep)':'';if(bN)bN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}
export function addHgeList(){
  var inp=document.getElementById('hge-nlist-input'),errEl=document.getElementById('hge-nlist-err');var v=inp.value.trim();errEl.classList.remove('show');if(!v)return;
  if(!/^\d+$/.test(v)){errEl.textContent='Uniquement des chiffres.';errEl.classList.add('show');return;}
  if(state.hgEditListesSilp.indexOf(v)!==-1){errEl.textContent='Ce numéro est déjà dans la liste.';errEl.classList.add('show');return;}
  if(state.envoisHG.some(function(e){return e.id!==state.hgEditId&&e.numerosSilp&&e.numerosSilp.indexOf(v)!==-1;})){errEl.textContent='Ce numéro est déjà lié à un autre envoi Hors-grappe.';errEl.classList.add('show');return;}
  state.hgEditListesSilp.push(v);inp.value='';renderHgeChips();inp.focus();
}
export function removeHgeList(v){state.hgEditListesSilp=state.hgEditListesSilp.filter(function(x){return x!==v;});renderHgeChips();}
export function renderHgeChips(){var el=document.getElementById('hge-nlist-chips');if(!el)return;el.innerHTML=state.hgEditListesSilp.map(function(v){return'<div class="nlist-chip"><span>'+escapeHtml(v)+'</span><button type="button" onclick="removeHgeList(\''+escapeHtml(v)+'\')">&times;</button></div>';}).join('');}
export async function saveEditHGEnvoi(){
  var e=state.envoisHG.find(function(x){return x.id===state.hgEditId;});if(!e)return;
  if(!state.hgEditTemperature){notifier('hge-err','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===state.hgEditTemperature;})||{};
  if(tCfg&&tCfg.ask_glace&&state.hgEditRefrigerant===null){notifier('hge-err','Veuillez sélectionner le type de réfrigérant.','e');return;}
  var tr=document.getElementById('hge-trans').value;if(!tr){notifier('hge-err','Veuillez sélectionner un transporteur.','e');return;}
  if(e.source==='silp'&&!state.hgEditListesSilp.length){notifier('hge-err','Veuillez ajouter au moins un numéro de liste de repérage.','e');return;}
  var tubes=parseInt(document.getElementById('hge-ntub').value)||null;var spec=document.getElementById('hge-tspec').value;var notes=document.getElementById('hge-notes').value;
  var upd={temperature:state.hgEditTemperature,transporteur:tr,nb_echantillons:tubes,notes:notes,type_specimen:spec,glace_seche:state.hgEditRefrigerant===true};
  if(e.source==='silp')upd.numeros_silp=state.hgEditListesSilp.slice();
  var r=await sbCall(state.sb.from('envois_hgrappe').update(upd).eq('id',state.hgEditId),'hge-err');
  if(r.error)return;
  var expLab=state.laboratoires.find(function(l){return l.id===e.expId;})||{};
  state.hgDonneesImpression={numero:e.numero,token:e.confirmToken,source:e.source,exp:e.exp,dest:e.dest,temp:state.hgEditTemperature,transporteur:tr,tubes:tubes,numerosSilp:e.source==='silp'?state.hgEditListesSilp.slice():[],notes:notes,creePar:e.creePar,tsEnvoi:e.tsEnvoi,typeSpecimen:spec,glaceSeche:state.hgEditRefrigerant===true,expLab:expLab};
  closeHGEditModal();await loadEnvoisHG();
  var t=document.getElementById('success-title-el');if(t)t.textContent='Envoi HG modifié';
  var cb=document.getElementById('success-close-btn');if(cb)cb.textContent='Fermer';
  var msgEl=document.getElementById('success-modal-msg');if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+escapeHtml(e.numero)+'</strong> modifié avec succès.<br><small style="color:var(--t2);font-size:11px">Pensez à remplacer le bordereau et la F-G-74 dans le colis si nécessaire.</small>';
  var pb=document.getElementById('success-print-btn');if(pb){pb.style.display='flex';pb.onclick=function(){closeSuccessModal();window.printHGDocs();};}
  document.getElementById('success-modal').style.display='flex';
}

// ── Config HG ─────────────────────────────────────────────────────────────────
export function renderCfgHgrappe(){
  if(!estAdmin())return;renderHgrappeLabsToggle();renderExtLabsList();renderHGAlarmsCfg();renderCfgHgrappeConfirmByNumero();renderCfgHgrappeFormat();
}
export function renderCfgHgrappeConfirmByNumero(){var el=document.getElementById('cfg-hg-confirm-by-numero');if(el)el.checked=state.CFG.hgrappeConfirmByNumero!==false;}
export async function saveHgrappeConfirmByNumero(){var v=document.getElementById('cfg-hg-confirm-by-numero').checked;var ok=await saveGrappeCfg('hgrappe_confirm_by_numero',v);if(ok){state.CFG.hgrappeConfirmByNumero=v;notifier('cfgsuc','Paramètre mis à jour.','s');}}
export function renderHGAlarmsCfg(){var a=document.getElementById('cfg-hg-alarm-days'),b=document.getElementById('cfg-hg-auto-days');if(a)a.value=state.CFG.hgrappeAlarmDays||3;if(b)b.value=state.CFG.hgrappeAutoCloseDays||10;}
export async function saveHGAlarms(){
  var a=parseInt(document.getElementById('cfg-hg-alarm-days').value)||3;var b=parseInt(document.getElementById('cfg-hg-auto-days').value)||10;
  if(a>=b){notifier('cfgerr','Le délai d\'alarme doit être inférieur au délai de fermeture automatique.','e');return;}
  state.CFG.hgrappeAlarmDays=a;state.CFG.hgrappeAutoCloseDays=b;
  var ok1=await saveGrappeCfg('hgrappe_alarm_days',a);var ok2=await saveGrappeCfg('hgrappe_auto_close_days',b);
  if(ok1&&ok2)notifier('cfgsuc','Alarmes Hors-grappe enregistrées.','s');
}
export function renderHgrappeLabsToggle(){
  var el=document.getElementById('hgrappe-labs-list');if(!el)return;
  var enabled=state.CFG.hgrappeEnabledLabs||[];
  el.style.display='grid';el.style.gridTemplateColumns='1fr 1fr';el.style.gap='4px 12px';
  el.innerHTML=state.laboratoires.map(function(l){var on=enabled.indexOf(l.id)!==-1;return'<div style="display:flex;align-items:center;gap:8px;padding:5px 0"><label class="cfg-toggle"><input type="checkbox" class="hgrappe-lab-cb" value="'+escapeHtml(l.id)+'"'+(on?' checked':'')+'/><span class="cfg-toggle-sl"></span></label><span style="font-size:13px">'+escapeHtml(l.name)+'</span></div>';}).join('');
}
export async function saveHgrappeLabs(){
  var enabled=[];document.querySelectorAll('.hgrappe-lab-cb:checked').forEach(function(cb){enabled.push(cb.value);});
  state.CFG.hgrappeEnabledLabs=enabled;
  var allLabIds=(state.laboratoires||[]).map(function(l){return l.id;});
  var ops=allLabIds.map(function(labId){
    return state.sb.from('module_config').upsert({module:'hgrappe',labo_id:labId,active:enabled.indexOf(labId)!==-1,updated_at:new Date().toISOString()},{onConflict:'module,labo_id'});
  });
  var results=await Promise.all(ops);
  var err=results.find(function(r){return r.error;});
  if(err){notifier('cfgerr','Erreur : '+err.error.message,'e');return;}
  notifier('cfgsuc','Activation Hors-grappe mise à jour.','s');
  var canHG=isHGEnabled();var sw=document.getElementById('mode-sw');if(sw)sw.classList.toggle('gone',!canHG);
}
export function renderCfgHgrappeFormat(){var el=document.getElementById('hgrappe-fmt-list');if(!el)return;el.innerHTML=window._buildFmtCards(state.CFG.hgrappeFormat||'bordereau','hgrappe-fmt','saveHgrappeFormat');}
export async function saveHgrappeFormat(id){
  state.CFG.hgrappeFormat=id;var hint=document.getElementById('hgrappe-fmt-hint');
  if(hint){var f=state.CFG.bordereau.formats.find(function(x){return x.id===id;})||{};hint.textContent=f.desc||'';}
  if(await saveCfg('hgrappe_bordereau_format',id))notifier('cfgsuc','Format Hors-grappe mis à jour.','s');
}

// ── Laboratoires externes ─────────────────────────────────────────────────────
function extLabRow(l,indent){
  var addrParts=[l.adresse,l.adresse2,l.ville,l.province,l.code_postal,l.pays].filter(Boolean);
  var addrSummary=addrParts.length?'<span style="font-size:10px;color:var(--t3)">'+escapeHtml(addrParts.join(', '))+'</span>':'';
  var prefix=indent?'↳ ':'';var padLeft=indent?'padding-left:32px':'';
  return'<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0;'+(indent?'background:var(--b2)':'')+'">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;'+padLeft+'">'
      +'<div><div style="font-size:'+(indent?'12':'13')+'px;font-weight:600">'+prefix+escapeHtml(l.name)+'</div>'+addrSummary+'</div>'
      +'<div style="display:flex;gap:5px;flex-shrink:0">'
        +'<button class="bsm bsmi" onclick="toggleExtLabEdit(\''+l.id+'\')" style="font-size:11px;padding:3px 8px">Modifier</button>'
        +'<button class="bsm '+(l.active?'bsmd':'')+'" onclick="toggleExtLabActive(\''+l.id+'\','+(!l.active)+')" style="font-size:11px;padding:3px 8px">'+(l.active?'Désactiver':'Réactiver')+'</button>'
      +'</div>'
    +'</div>'
    +'<div id="elef-'+l.id+'" style="display:none;padding:10px 14px;background:var(--b2);border-top:1px solid var(--b3)">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Nom</label><input type="text" id="elef-name-'+l.id+'" value="'+escapeHtml(l.name)+'" style="width:100%"/></div>'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Adresse (ligne 1)</label><input type="text" id="elef-adr-'+l.id+'" value="'+escapeHtml(l.adresse||'')+'" style="width:100%"/></div>'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Adresse (ligne 2)</label><input type="text" id="elef-adr2-'+l.id+'" value="'+escapeHtml(l.adresse2||'')+'" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Ville</label><input type="text" id="elef-vil-'+l.id+'" value="'+escapeHtml(l.ville||'')+'" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Province / État</label><input type="text" id="elef-prv-'+l.id+'" value="'+escapeHtml(l.province||'')+'" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Code postal</label><input type="text" id="elef-cp-'+l.id+'" value="'+escapeHtml(l.code_postal||'')+'" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Pays</label><input type="text" id="elef-pays-'+l.id+'" value="'+escapeHtml(l.pays||'')+'" style="width:100%"/></div>'
        +'<div class="fgg"><label style="font-size:10px">Téléphone</label><input type="text" id="elef-tel-'+l.id+'" value="'+escapeHtml(l.telephone||'')+'" style="width:100%"/></div>'
        +'<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Texte étiquette HG</label><textarea id="elef-lbl-'+l.id+'" rows="2" style="width:100%;resize:vertical">'+escapeHtml(l.label_text||'')+'</textarea></div>'
      +'</div>'
      +'<div style="display:flex;gap:6px"><button class="bp" style="font-size:11px;padding:5px 14px" onclick="saveExtLabEdit(\''+l.id+'\')">Enregistrer</button>'
      +'<button class="bsec" style="font-size:11px;padding:5px 10px" onclick="toggleExtLabEdit(\''+l.id+'\')">Annuler</button></div>'
    +'</div>'
  +'</div>';
}
export function renderExtLabsList(){
  var el=document.getElementById('extlabs-list');if(!el)return;
  var parents=state.labsExternes.filter(function(l){return !l.parent_id;});var children=state.labsExternes.filter(function(l){return !!l.parent_id;});var html='';
  parents.forEach(function(p){html+=extLabRow(p,false);children.filter(function(c){return c.parent_id===p.id;}).forEach(function(c){html+=extLabRow(c,true);});});
  children.filter(function(c){return !parents.find(function(p){return p.id===c.parent_id;});}).forEach(function(c){html+=extLabRow(c,true);});
  el.innerHTML=html||'<div style="font-size:12px;color:var(--t3);padding:8px">Aucun laboratoire externe configuré.</div>';
}
export function toggleExtLabEdit(id){var el=document.getElementById('elef-'+id);if(el)el.style.display=el.style.display==='none'?'':'none';}
export async function saveExtLabEdit(id){
  var name=document.getElementById('elef-name-'+id).value.trim();if(!name){notifier('cfgerr','Le nom est obligatoire.','e');return;}
  var adr=document.getElementById('elef-adr-'+id).value.trim(),adr2=document.getElementById('elef-adr2-'+id).value.trim(),vil=document.getElementById('elef-vil-'+id).value.trim(),prv=document.getElementById('elef-prv-'+id).value.trim(),cp=document.getElementById('elef-cp-'+id).value.trim(),pays=document.getElementById('elef-pays-'+id).value.trim(),tel=document.getElementById('elef-tel-'+id).value.trim(),lbl=document.getElementById('elef-lbl-'+id).value.trim();
  var r=await sbCall(state.sb.from('external_labs').update({name:name,adresse:adr,adresse2:adr2,ville:vil,province:prv,code_postal:cp,pays:pays,telephone:tel,label_text:lbl}).eq('id',id),'cfgerr');
  if(r.error)return;
  var l=state.labsExternes.find(function(x){return x.id===id;});if(l){l.name=name;l.adresse=adr;l.adresse2=adr2;l.ville=vil;l.province=prv;l.code_postal=cp;l.pays=pays;l.telephone=tel;l.label_text=lbl;}
  renderExtLabsList();notifier('cfgsuc','Laboratoire mis à jour.','s');
}
export async function addExtLab(){
  var name=document.getElementById('extlab-new-name').value.trim();if(!name){notifier('cfgerr','Veuillez saisir un nom de laboratoire.','e');return;}
  var parentId=document.getElementById('extlab-parent-sel').value||null;
  var adr=document.getElementById('extlab-new-adresse').value.trim(),adr2=document.getElementById('extlab-new-adresse2').value.trim(),vil=document.getElementById('extlab-new-ville').value.trim(),prv=document.getElementById('extlab-new-province').value.trim(),cp=document.getElementById('extlab-new-cp').value.trim(),pays=document.getElementById('extlab-new-pays').value.trim(),tel=document.getElementById('extlab-new-tel').value.trim(),lbl=document.getElementById('extlab-new-label').value.trim();
  var r=await sbCall(state.sb.from('external_labs').insert({name:name,parent_id:parentId||null,adresse:adr,adresse2:adr2,ville:vil,province:prv,code_postal:cp,pays:pays,telephone:tel,label_text:lbl,active:true}),'cfgerr');
  if(r.error)return;
  window.closeCfgAddModal();await loadExtLabs();renderExtLabsList();notifier('cfgsuc','Laboratoire ajouté.','s');
}
export async function toggleExtLabActive(id,active){await state.sb.from('external_labs').update({active:active}).eq('id',id);await loadExtLabs();renderExtLabsList();}



