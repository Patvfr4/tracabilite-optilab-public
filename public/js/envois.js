import { state, sbCall } from './state.js';
import { escapeHtml, formatDateTime, formatDate, deepKey, heuresTransit, formatDuree, classeBadge, libelleRole, classeBadgeRole, departementsHtml, departementsTexte, separateurModal, departements, classesPills } from './utils.js';
import { estAdmin, estGrappe, estSuperviseur } from './auth.js';
import { notifier, toast, confirm2, closeGMod, showSuccessModal, closeSuccessModal } from './ui.js';

// ── État local (non bridgé — UI/formulaires seulement) ────────────────────────
var _histPage = 0, _histTotalCount = 0, _histSearchTimer = null, _histAlertData = [];
var _histAlerts = false;
var _resumeAlerts = false;
var _noListCb = null;
var _rchTimer = null;
var _bdCache  = {};
var _silpChips = [];
var _silpDupPendingChip = null;

// Helper interne pour l'animation de vibration (shake)
function _shake(el) {
  if (!el) return;
  el.animate([
    { transform: 'translateX(0)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(6px)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(6px)' },
    { transform: 'translateX(0)' }
  ], { duration: 300, easing: 'ease-in-out' });
}

// ── Alarmes et affichage ──────────────────────────────────────────────────────
export function libelleTemp(t){var f=state.CFG.temperatures.find(function(x){return x.label===t;});return f?f.icon+' '+f.label:t;}
export function libelleTempCourt(t){var f=state.CFG.temperatures.find(function(x){return x.label===t;});return f?f.icon+' '+f.label.split(' ')[0]:t;}
export function estAlarmeRetard(e){var h=heuresTransit(e);return h!==null&&h>state.CFG.alarmR&&e.statut==='En transit';}
export function estAlarmePerdu(e){var h=heuresTransit(e);return h!==null&&state.CFG.alarmP&&h>state.CFG.alarmP*24&&e.statut==='En transit';}
export function estArriveeRetard(e){var h=heuresTransit(e);return e.statut==='Reçu'&&h!==null&&h>state.CFG.alarmR;}
export function classeLigne(e){if(e.statut==='Perdu')return'row-perdu';if(e.statut==='Problème')return'row-probleme';return estAlarmePerdu(e)?'ar-lost':(estAlarmeRetard(e)||estArriveeRetard(e))?'ar':'';}
export function estAlerte(e){return estAlarmeRetard(e)||estAlarmePerdu(e)||estArriveeRetard(e)||e.statut==='Perdu'||e.statut==='Problème';}
export function afficherLegende(elId,arr){var leg=document.getElementById(elId);if(!leg)return;var haR=arr.some(estAlarmeRetard),haAP=arr.some(estAlarmePerdu),haP=arr.some(function(e){return e.statut==='Problème';}),haLost=arr.some(function(e){return e.statut==='Perdu';});if(!haR&&!haAP&&!haP&&!haLost){leg.innerHTML='';return;}var rows=[];if(haR)rows.push('<div class="rleg-row ar-row"><span class="badge bt">En transit</span><span class="talarm">⚠ '+state.CFG.alarmR+'h+</span><span class="rleg-desc">Transit supérieur à '+state.CFG.alarmR+'h</span></div>');if(haAP)rows.push('<div class="rleg-row ar-lost-row"><span class="badge bt">En transit</span><span class="talarm-lost">⚠ '+(state.CFG.alarmP*24)+'h+</span><span class="rleg-desc">Potentiellement perdu — transit &gt; '+state.CFG.alarmP+' jours</span></div>');if(haP)rows.push('<div class="rleg-row prob-row"><span class="badge bp2">Problème</span><span class="rleg-desc">Envoi avec problème signalé</span></div>');if(haLost)rows.push('<div class="rleg-row perdu-row"><span class="badge bperdu">Perdu</span><span class="rleg-desc">Colis déclaré perdu</span></div>');leg.innerHTML='<details class="rleg"><summary class="rleg-title">Légende</summary><div class="rleg-rows">'+rows.join('')+'</div></details>';}
export function celluleTransit(e){if(e.statut==='En attente')return'<span class="tok">—</span>';var h=heuresTransit(e);var svg='<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 7v2.5M8 11v.5"/></svg>';if(estAlarmePerdu(e))return'<span class="talarm talarm-lost">'+svg+formatDuree(h)+'</span>';if(estAlarmeRetard(e)||estArriveeRetard(e))return'<span class="talarm">'+svg+formatDuree(h)+'</span>';return'<span class="'+(h!==null&&h>state.CFG.alarmR*0.7?'twarn':'tok')+'">'+formatDuree(h)+'</span>';}

// ── Chargement envois intra-grappe ────────────────────────────────────────────
export function _mapEnvoi(row){return{id:row.id,numero:row.numero,numerosSilp:row.numeros_silp||[],exp:row.exp_lab?row.exp_lab.name:'',dest:row.dest_lab?row.dest_lab.name:'',expId:row.exp_labo_id,destId:row.dest_labo_id,expAdresse:row.exp_lab?row.exp_lab.adresse||'':'',expAdresse2:row.exp_lab?row.exp_lab.adresse2||'':'',expVille:row.exp_lab?row.exp_lab.ville||'':'',expProvince:row.exp_lab?row.exp_lab.province||'':'',expCodePostal:row.exp_lab?row.exp_lab.code_postal||'':'',expPays:row.exp_lab?row.exp_lab.pays||'':'',expTel:row.exp_lab?row.exp_lab.telephone||'':'',destAdresse:row.dest_lab?row.dest_lab.adresse||'':'',destAdresse2:row.dest_lab?row.dest_lab.adresse2||'':'',destVille:row.dest_lab?row.dest_lab.ville||'':'',destProvince:row.dest_lab?row.dest_lab.province||'':'',destCodePostal:row.dest_lab?row.dest_lab.code_postal||'':'',destPays:row.dest_lab?row.dest_lab.pays||'':'',destTel:row.dest_lab?row.dest_lab.telephone||'':'',temp:row.temperature,transporteur:row.transporteur,tubes:row.nb_echantillons,departements:row.departements||[],statut:row.statut,notes:row.notes||'',creePar:row.cree_par_nom||'',creeParId:row.cree_par_id||null,recepPar:row.recep_par_nom||'',recepObs:row.recep_obs||'',tsEnvoi:row.ts_envoi,tsRecep:row.ts_recep,typeSpecimen:row.type_specimen||'exempt',glaceSeche:row.glace_seche||false,annuleAt:row.annule_at||null,annuleParNom:row.annule_par_nom||'',annuleNote:row.annule_note||''};}
export async function loadEnvois(){
  try{
    var sel='*,exp_lab:exp_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone),dest_lab:dest_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone)';
    var cutoff=new Date(Date.now()-7*24*3600*1000).toISOString();
    var q1=state.sb.from('envois').select(sel).in('statut',['En attente','En transit']).is('annule_at',null).order('ts_envoi',{ascending:false});
    var q2=state.sb.from('envois').select(sel).in('statut',['Reçu','Problème']).gte('ts_envoi',cutoff).order('ts_envoi',{ascending:false});
    if(!estGrappe()){var lf='exp_labo_id.eq.'+state.activeLaboId+',dest_labo_id.eq.'+state.activeLaboId;q1=q1.or(lf);q2=q2.or(lf);}
    var[r1,r2]=await Promise.all([q1,q2]);
    if(!r1.error&&!r2.error)state.envois=(r1.data||[]).concat(r2.data||[]).sort(function(a,b){return new Date(b.ts_envoi)-new Date(a.ts_envoi);}).map(_mapEnvoi);
  }catch(e){}
}

// ── Créer un envoi ────────────────────────────────────────────────────────────
export async function saveEnvoi(){
  var smsg=document.getElementById('smsg');if(smsg)smsg.style.display='';
  var _bdOn=window.isBDEnabled&&window.isBDEnabled();
  if(state.sansSilp){
    var destId0=document.getElementById('ldest').value,tr0=document.getElementById('trans').value;
    if(!destId0){notifier('serr','Veuillez sélectionner un laboratoire destinataire.','e');return;}
    if(!state.termeRecherche){notifier('serr','Veuillez sélectionner une température d\'envoi.','e');return;}
    var tCfg0=state.CFG.temperatures.find(function(t){return t.label===state.termeRecherche;});
    if(tCfg0&&tCfg0.ask_glace&&state.refrigerantChoisi===null){notifier('serr','Veuillez sélectionner le type de réfrigérant (glace sèche ou sachet).','e');return;}
    if(!tr0&&!_bdOn){notifier('serr','Veuillez sélectionner un transporteur.','e');return;}
    if(!state.departementsActifs.length){notifier('serr','Veuillez sélectionner au moins un département.','e');return;}
    await _doSaveEnvoiHsilp(_bdOn);
    return;
  }
  var destId=document.getElementById('ldest').value,tr=document.getElementById('trans').value;
  if(!destId){notifier('serr','Veuillez sélectionner un laboratoire destinataire.','e');return;}
  if(!state.termeRecherche){notifier('serr','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===state.termeRecherche;});
  if(tCfg&&tCfg.ask_glace&&state.refrigerantChoisi===null){notifier('serr','Veuillez sélectionner le type de réfrigérant (glace sèche ou sachet).','e');return;}
  if(!tr&&!_bdOn){notifier('serr','Veuillez sélectionner un transporteur.','e');return;}
  if(!state.departementsActifs.length){notifier('serr','Veuillez sélectionner au moins un département.','e');return;}
  if(!_silpChips.length){notifier('serr','Veuillez ajouter au moins un numéro de liste de repérage.','e');return;}
  var tubes=parseInt(document.getElementById('ntub').value)||null;
  var specEl=document.getElementById('tspec');var spec=specEl?specEl.value:'exempt';
  var _bdStat=_bdOn?'En attente':'En transit';
  var r=await sbCall(state.sb.from('envois').insert({numeros_silp:_silpChips.slice(),exp_labo_id:state.activeLaboId,dest_labo_id:destId,temperature:state.termeRecherche,transporteur:_bdOn?(tr||null):tr,nb_echantillons:tubes,departements:state.departementsActifs.slice(),statut:_bdStat,notes:document.getElementById('notes').value,cree_par_id:state.currentUser.id,cree_par_nom:state.currentUser.nom,ts_envoi:new Date().toISOString(),type_specimen:spec,glace_seche:state.refrigerantChoisi===true}).select('numero').single(), 'serr');
  if(r.error)return;
  var num=r.data.numero;
  var destLab=state.laboratoires.find(function(l){return l.id===destId;})||{};
  var expLab=state.laboratoires.find(function(l){return l.id===state.activeLaboId;})||{};
  var _saved={numero:num,numerosSilp:_silpChips.slice(),exp:state.currentUser.lab?state.currentUser.lab.name:'—',dest:destLab.name||'—',temp:state.termeRecherche,transporteur:tr,tubes:tubes,departements:state.departementsActifs.slice(),notes:document.getElementById('notes').value.trim(),creePar:state.currentUser.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:state.refrigerantChoisi===true,expAdresse:expLab.adresse||'',expAdresse2:expLab.adresse2||'',expVille:expLab.ville||'',expProvince:expLab.province||'',expCodePostal:expLab.code_postal||'',expPays:expLab.pays||'',expTel:expLab.telephone||'',destAdresse:destLab.adresse||'',destAdresse2:destLab.adresse2||'',destVille:destLab.ville||'',destProvince:destLab.province||'',destCodePostal:destLab.code_postal||'',destPays:destLab.pays||'',destTel:destLab.telephone||''};
  state.donneesImpression=_saved;
  resetForm();
  showSuccessModal(num);
}
async function _doSaveEnvoiHsilp(_bdOn){
  var destId=document.getElementById('ldest').value,tr=document.getElementById('trans').value;
  var tubes=parseInt(document.getElementById('ntub').value)||null;
  var specEl=document.getElementById('tspec');var spec=specEl?specEl.value:'exempt';
  var _bdStat2=_bdOn?'En attente':'En transit';
  var r=await sbCall(state.sb.rpc('create_envoi_hsilp',{p_exp_labo_id:state.activeLaboId,p_dest_labo_id:destId,p_temperature:state.termeRecherche,p_transporteur:_bdOn?(tr||null):tr,p_nb_echantillons:tubes,p_departements:state.departementsActifs.slice(),p_notes:document.getElementById('notes').value,p_cree_par_id:state.currentUser.id,p_cree_par_nom:state.currentUser.nom,p_type_specimen:spec,p_glace_seche:state.refrigerantChoisi===true,p_statut:_bdStat2}), 'serr');
  if(r.error)return;
  var num=r.data;
  var destLab=state.laboratoires.find(function(l){return l.id===destId;})||{};
  var expLab=state.laboratoires.find(function(l){return l.id===state.activeLaboId;})||{};
  state.donneesImpression={numero:num,numerosSilp:[],exp:state.currentUser.lab?state.currentUser.lab.name:'—',dest:destLab.name||'—',temp:state.termeRecherche,transporteur:tr,tubes:tubes,departements:state.departementsActifs.slice(),notes:document.getElementById('notes').value.trim(),creePar:state.currentUser.nom,tsEnvoi:new Date().toISOString(),typeSpecimen:spec,glaceSeche:state.refrigerantChoisi===true,expAdresse:expLab.adresse||'',expAdresse2:expLab.adresse2||'',expVille:expLab.ville||'',expProvince:expLab.province||'',expCodePostal:expLab.code_postal||'',expPays:expLab.pays||'',expTel:expLab.telephone||'',destAdresse:destLab.adresse||'',destAdresse2:destLab.adresse2||'',destVille:destLab.ville||'',destProvince:destLab.province||'',destCodePostal:destLab.code_postal||'',destPays:destLab.pays||'',destTel:destLab.telephone||''};
  resetForm();
  showSuccessModalHsilp(num);
}
export function resetForm(){
  document.getElementById('ldest').value='';document.getElementById('ldest-input').value='';window.updateDestAddr('');
  var _ni=document.getElementById('nlist-input');if(_ni)_ni.value='';document.getElementById('notes').value='';document.getElementById('trans').value='';document.getElementById('ntub').value='';
  _silpChips=[];renderSilpChips();var _ne=document.getElementById('nlist-err');if(_ne)_ne.classList.remove('show');
  state.termeRecherche='';state.departementsActifs=[];state.typeSpecimen='exempt';state.refrigerantChoisi=false;
  var ts=document.getElementById('tspec');if(ts)ts.value='exempt';
  var gs=document.getElementById('glace-section');if(gs)gs.style.display='none';
  document.querySelectorAll('.tpill').forEach(function(el){el.className='tpill';});
  var cm={BIOCHIMIE:'dp-bio',HEMATOLOGIE:'dp-hema',MICROBIOLOGIE:'dp-micro',PATHOLOGIE:'dp-patho'};
  departements.forEach(function(x){document.getElementById('dp-'+x.id).className='dpill '+cm[x.id];});
  state.sansSilp=false;var cb=document.getElementById('no-silp-cb');if(cb)cb.checked=false;
  var w=document.getElementById('nlist-wrap'),warn=document.getElementById('no-silp-warn'),nw=document.getElementById('no-silp-num-wrap');
  if(w)w.style.display='';if(warn)warn.style.display='none';if(nw)nw.style.display='none';
}

// ── Réception ─────────────────────────────────────────────────────────────────
export function showRlabErr(title,sub){var el=document.getElementById('rlab-err');document.getElementById('rlab-err-title').textContent=title;var s=document.getElementById('rlab-err-sub');s.textContent=sub||'';s.style.display=sub?'':'none';el.style.display='flex';var rn=document.getElementById('rnum');rn.focus();rn.select();}
export async function rechercher(){
  var rn=document.getElementById('rnum');
  var v=rn.value.trim();
  document.getElementById('rresult').style.display='none';document.getElementById('obsreq').style.display='none';document.getElementById('rlab-err').style.display='none';
  if(!v){_shake(rn);notifier('rerr','Veuillez saisir un numéro de liste de repérage ou un numéro d\'envoi.','e');return;}
  var vu=v.toUpperCase();
  var isNumeroInterne=/^(SILP|HSILP)-\d{6}-\d{5}$/.test(vu);
  var matched;
  if(isNumeroInterne){
    matched=state.envois.filter(function(e){return e.numero===vu;});
  }else{
    matched=state.envois.filter(function(e){return e.numerosSilp&&e.numerosSilp.indexOf(v)!==-1;});
  }
  if(!estGrappe()&&!estAdmin()&&state.activeLaboId){matched=matched.filter(function(e){return e.destId===state.activeLaboId;});}
  if(matched.length===0){
    var qLost=isNumeroInterne
      ?state.sb.from('envois').select('id').eq('numero',vu).eq('statut','Perdu').maybeSingle()
      :state.sb.from('envois').select('id').contains('numeros_silp',[v]).eq('statut','Perdu').maybeSingle();
    var rp=await qLost;
    if(!rp.error&&rp.data){_shake(rn);showRlabErr('Cet envoi est déclaré perdu','Tentative de réception le '+formatDateTime(new Date().toISOString())+' par '+state.currentUser.nom+' — Veuillez transmettre cette information à un responsable.');return;}
    _shake(rn);showRlabErr('Numéro introuvable','"'+escapeHtml(v)+'" ne correspond à aucun envoi actif. Vérifier le numéro, sinon contacter le laboratoire expéditeur.');return;
  }
  if(matched.length>1){
    _showSilpMultipleModal(matched);return;
  }
  _afficherResultatReception(matched[0]);
}
function _afficherResultatReception(e){
  var rn=document.getElementById('rnum');
  if(!estGrappe()&&!estAdmin()&&state.activeLaboId&&e.destId!==state.activeLaboId){_shake(rn);showRlabErr('Cet envoi n\'est pas destiné à votre laboratoire','Destiné à : '+e.dest);return;}
  if(e.statut==='En attente'){_shake(rn);showRlabErr('Cet envoi n\'a pas été déclaré comme envoyé par l\'expéditeur','Cet envoi n\'a pas était inclus dans un bon de départ en attente de récupération. Il ne peut pas être réceptionné avant le départ.');return;}
  if(e.statut==='Reçu'){_shake(rn);notifier('rerr','Cet envoi a déjà été réceptionné'+(e.recepPar?' par '+e.recepPar:'')+'.','e');rn.focus();rn.select();return;}
  if(e.statut==='Problème'){_shake(rn);notifier('rerr','Un problème a déjà été signalé pour cet envoi'+(e.recepPar?' par '+e.recepPar:'')+'.','e');rn.focus();rn.select();return;}
  var idx=state.envois.indexOf(e);state.indexLigne=idx;
  document.getElementById('robs').value='';document.getElementById('robs').style.borderColor='';
  var h=heuresTransit(e);var al=h!==null&&h>state.CFG.alarmR;
  var silpHtml=e.numerosSilp&&e.numerosSilp.length?'<div class="irow"><span>Listes SILP</span><span style="font-family:var(--fm)">'+e.numerosSilp.map(escapeHtml).join(' <span style="opacity:.4">·</span> ')+'</span></div>':'';
  document.getElementById('rdet').innerHTML=
    '<div class="irow"><span>N° envoi</span><span style="font-family:var(--fm);font-size:11px;color:var(--t2)">'+escapeHtml(e.numero)+'</span></div>'+
    silpHtml+
    '<div class="irow"><span>Expéditeur</span><span>'+escapeHtml(e.exp)+'</span></div>'+
    '<div class="irow"><span>Température</span><span>'+escapeHtml(libelleTemp(e.temp))+'</span></div>'+
    (e.departements&&e.departements.length?'<div class="irow"><span>Département(s)</span><span>'+departementsTexte(e.departements)+'</span></div>':'')+
    '<div class="irow"><span>Transporteur</span><span>'+escapeHtml(e.transporteur)+'</span></div>'+
    (e.tubes?'<div class="irow"><span>Échantillons</span><span>'+e.tubes+'</span></div>':'')+
    '<div class="irow"><span>Envoyé le</span><span>'+formatDateTime(e.tsEnvoi)+'</span></div>'+
    (al?'<div class="irow"><span style="color:var(--te)">⚠ Transit</span><span style="color:var(--te)">'+formatDuree(h)+' — dépasse '+state.CFG.alarmR+' h</span></div>':'')+
    (e.notes?'<div class="irow"><span>Notes envoi</span><span>'+escapeHtml(e.notes)+'</span></div>':'');
  document.getElementById('rresult').style.display='block';
}
function _showSilpMultipleModal(envois){
  var m=document.getElementById('silp-match-modal');if(!m)return;
  var html=envois.map(function(e){
    return'<div class="silp-match-row" onclick="document.getElementById(\'silp-match-modal\').style.display=\'none\';_afficherResultatReception_global(\''+e.id+'\')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--b3);display:flex;flex-direction:column;gap:3px">'
      +'<div style="font-size:12px;font-weight:700;font-family:var(--fm)">'+escapeHtml(e.numero)+'</div>'
      +'<div style="font-size:11px;color:var(--t2)">'+escapeHtml(e.exp)+' → '+escapeHtml(e.dest)+' — '+formatDateTime(e.tsEnvoi)+'</div>'
      +'</div>';
  }).join('');
  document.getElementById('silp-match-list').innerHTML=html;
  m.style.display='flex';
}
export async function confirmer(){
  if(state.indexLigne===-1)return;var e=state.envois[state.indexLigne];
  var r=await sbCall(state.sb.from('envois').update({statut:'Reçu',ts_recep:new Date().toISOString(),recep_par_nom:state.currentUser.nom,recep_obs:document.getElementById('robs').value}).eq('id',e.id).eq('statut','En transit').select('id'), 'rerr');
  if(r.error)return;
  if(!r.data||!r.data.length){await loadEnvois();document.getElementById('rresult').style.display='none';state.indexLigne=-1;notifier('rerr','Cet envoi a déjà été modifié par quelqu\'un d\'autre. La liste a été actualisée.','e');return;}

  // Micro-animation : Flash vert sur les lignes du tableau correspondantes dans l'interface
  document.querySelectorAll(`tr[onclick*="${e.id}"]`).forEach(row => {
    row.style.transition = 'background-color 0.4s ease';
    row.style.backgroundColor = 'rgba(74, 222, 128, 0.4)'; // Vert succès (soft)
  });

  notifier('rsuc','Réception confirmée pour l\'envoi '+e.numero+'.','s');

  // On attend un court instant avant de réinitialiser le panneau de réception 
  // pour que l'utilisateur puisse percevoir le feedback visuel dans le tableau de fond
  setTimeout(() => {
    document.getElementById('rresult').style.display='none';
    var rn=document.getElementById('rnum');
    rn.value='';
    state.indexLigne=-1;
    rn.focus();
  }, 600);
}
function _queueNotif(type,e,extra){
  var payload={type:type,envoi_id:e.id,exp_labo_id:e.expId||e.exp_labo_id||null,dest_labo_id:e.destId||e.dest_labo_id||null,envoi_numero:e.numero||'',departements:e.departements||[],details:extra||{}};
  state.sb.from('notification_queue').insert(payload).then(function(){}).catch(function(){});
}
export async function signaler(){
  if(state.indexLigne===-1)return;var robs=document.getElementById('robs'),obs=robs.value.trim();
  if(!obs){_shake(robs);document.getElementById('obsreq').style.display='inline';robs.style.borderColor='var(--bd2)';notifier('rerr','Un commentaire est obligatoire pour signaler un problème.','e');return;}
  robs.style.borderColor='';var e=state.envois[state.indexLigne];
  var r=await sbCall(state.sb.from('envois').update({statut:'Problème',ts_recep:new Date().toISOString(),recep_par_nom:state.currentUser.nom,recep_obs:obs}).eq('id',e.id).eq('statut','En transit').select('id'), 'rerr');
  if(r.error)return;
  if(!r.data||!r.data.length){await loadEnvois();document.getElementById('rresult').style.display='none';state.indexLigne=-1;notifier('rerr','Cet envoi a déjà été modifié par quelqu\'un d\'autre. La liste a été actualisée.','e');return;}

  // Micro-animation : Flash orange sur les lignes du tableau pour un signalement de problème
  document.querySelectorAll(`tr[onclick*="${e.id}"]`).forEach(row => {
    row.style.transition = 'background-color 0.4s ease';
    row.style.backgroundColor = 'rgba(251, 191, 36, 0.4)'; // Ambre / Orange
  });

  _queueNotif('nc',e,{obs:obs});
  notifier('rsuc','Problème signalé pour l\'envoi '+e.numero+'.','s');

  setTimeout(() => {
    document.getElementById('rresult').style.display='none';
    var rn=document.getElementById('rnum');
    rn.value='';
    state.indexLigne=-1;
    rn.focus();
  }, 600);
}

// ── Détail modal ──────────────────────────────────────────────────────────────
export async function showGMod(id){
  window._gmodTrigger=document.activeElement;
  var e=state.envois.find(function(x){return x.id===id;})||state.cacheModals[id];
  if(!e){
    document.getElementById('gmod-body').innerHTML='<div style="text-align:center;padding:2rem;color:var(--t2)">Chargement…</div>';
    document.getElementById('gmod-footer').innerHTML='';document.getElementById('gmod').classList.add('show');
    try{
      var r=await state.sb.from('envois').select('*,exp_lab:exp_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone),dest_lab:dest_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone)').eq('id',id).single();
      if(r.error||!r.data){document.getElementById('gmod-body').innerHTML='<div style="text-align:center;padding:2rem;color:var(--te)">Impossible de charger cet envoi.</div>';return;}
      e=_mapEnvoi(r.data);state.cacheModals[id]=e;
    }catch(ex){document.getElementById('gmod-body').innerHTML='<div style="text-align:center;padding:2rem;color:var(--te)">Impossible de charger cet envoi.</div>';return;}
  }
  var h=heuresTransit(e);var alD=estAlarmePerdu(e);var al=estAlarmeRetard(e);
  var transitStyle=alD?'color:#991B1B;font-weight:700':al?'color:var(--te)':'';
  var stCfgI=state.CFG.bordereau.specTypes.find(function(t){return t.id===e.typeSpecimen;})||{label:e.typeSpecimen||'—'};
  var tCfgI=state.CFG.temperatures.find(function(t){return t.label===e.temp;});var showRefI=tCfgI&&tCfgI.ask_glace;
  var _annulBanner=e.annuleAt?'<div style="background:#fee2e2;border:1px solid var(--danger);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#991b1b"><strong>🚫 Envoi annulé</strong> — le '+formatDateTime(e.annuleAt)+' par '+escapeHtml(e.annuleParNom||'—')+((estSuperviseur()||estAdmin()||estGrappe())&&e.annuleNote?'<br><em>'+escapeHtml(e.annuleNote)+'</em>':'')+'</div>':'';
  document.getElementById('gmod-body').innerHTML=
    _annulBanner+
    '<div class="df"><span>N° envoi</span><span style="font-family:var(--fm);font-size:11px">'+escapeHtml(e.numero)+'</span></div>'+
    (e.numerosSilp&&e.numerosSilp.length?'<div class="df"><span>Listes SILP</span><span style="font-family:var(--fm)">'+e.numerosSilp.map(escapeHtml).join(' · ')+'</span></div>':'')+
    '<div class="df"><span>Statut</span><span><span class="badge '+classeBadge(e.statut)+'">'+escapeHtml(e.statut)+'</span></span></div>'+
    separateurModal('Parties')+
    '<div class="df"><span>Expéditeur</span><span>'+escapeHtml(e.exp)+'</span></div>'+
    '<div class="df"><span>Destinataire</span><span>'+escapeHtml(e.dest)+'</span></div>'+
    '<div class="df"><span>Transporteur</span><span>'+escapeHtml(e.transporteur)+'</span></div>'+
    separateurModal('Spécimen &amp; transport')+
    '<div class="df"><span>Type de spécimen</span><span>'+escapeHtml(stCfgI.label)+'</span></div>'+
    (showRefI?'<div class="df"><span>Réfrigérant</span><span>'+(e.glaceSeche?'🧊 Glace sèche (UN 1845)':'❄️ Sachet réfrigérant')+'</span></div>':'')+
    '<div class="df"><span>Température</span><span>'+escapeHtml(libelleTemp(e.temp))+'</span></div>'+
    '<div class="df full"><span>Département(s)</span><span>'+departementsTexte(e.departements)+'</span></div>'+
    (e.tubes?'<div class="df"><span>Échantillons</span><span>'+e.tubes+'</span></div>':'')+
    separateurModal('Traçabilité')+
    '<div class="df"><span>Créé par</span><span>'+escapeHtml(e.creePar||'—')+'</span></div>'+
    '<div class="df"><span>Envoyé le</span><span>'+formatDateTime(e.tsEnvoi)+'</span></div>'+
    '<div class="df"><span>Réceptionné le</span><span>'+formatDateTime(e.tsRecep)+'</span></div>'+
    (e.recepPar?'<div class="df"><span>Réceptionné par</span><span>'+escapeHtml(e.recepPar)+'</span></div>':'')+
    '<div class="df"><span>Transit</span><span style="'+transitStyle+'">'+formatDuree(h)+(alD?' ⚠ Potentiellement perdu':al?' ⚠':'')+'</span></div>'+
    (e.notes||e.recepObs?separateurModal('Notes'):'')+
    (e.notes?'<div class="df full"><span>Notes d\'envoi</span><span>'+escapeHtml(e.notes)+'</span></div>':'')+
    (e.recepObs?'<div class="df full"><span>Observations réception</span><span style="color:var(--te)">'+escapeHtml(e.recepObs)+'</span></div>':'')+
    '<div id="gmod-bd-info"></div>'+
    '<div id="gmod-audit"></div>';
  var footer=document.getElementById('gmod-footer');footer.innerHTML='';
  var canDeclare=estGrappe()||(state.currentUser.role==='superviseur_labo'&&(e.expId===state.activeLaboId||e.destId===state.activeLaboId));
  var isHsilpE=!e.numerosSilp||e.numerosSilp.length===0;
  var canPrint=(isHsilpE||state.CFG.printBordereau)&&e.expId===state.activeLaboId&&(e.statut==='En transit'||e.statut==='En attente');
  var _isResponsable=state.currentUser.labMemberships&&state.currentUser.labMemberships.some(function(m){return m.labo_id===e.expId&&m.lab_role==='responsable';});
  var canModify=!e.annuleAt&&e.statut!=='Reçu'&&e.statut!=='Perdu'&&e.statut!=='Problème'&&(e.creeParId===state.currentUser.id||estGrappe()||(estSuperviseur()&&e.expId===state.activeLaboId)||_isResponsable);
  var btns=[];
  if(canPrint)btns.push('<button class="bsm bsms" style="display:inline-flex;align-items:center;gap:5px" onclick="printBordereauFromEnvoi(\''+e.id+'\')"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6H2a1 1 0 00-1 1v5a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2"/><rect x="4" y="1" width="8" height="7" rx="1"/><path d="M4 11h8v4H4z"/></svg>Imprimer le bordereau</button>');
  if(canModify)btns.push('<button class="bsm bsmi" style="display:inline-flex;align-items:center;gap:5px" onclick="openEditEnvoi(\''+e.id+'\')"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3l9-9z"/><path d="M9 4l3 3"/></svg>Modifier l\'envoi</button>');
  if(canDeclare&&e.statut!=='Reçu'&&e.statut!=='Perdu'&&e.statut!=='Problème')btns.push('<button class="bsm bsmd" style="display:inline-flex;align-items:center;gap:5px" onclick="declarerPerdu(\''+e.id+'\')"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10v1"/></svg>Déclarer perdu</button>');
  if(btns.length)footer.innerHTML='<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--b3);display:flex;justify-content:flex-end;gap:8px">'+btns.join('')+'</div>';
  document.getElementById('gmod').classList.add('show');
  try{
    var[ar,br]=await Promise.all([
      state.sb.from('envois_audit').select('changed_by_nom,changed_at').eq('table_name','envois').eq('record_id',id).eq('action','UPDATE').order('changed_at',{ascending:false}).limit(1),
      state.sb.from('bons_depart_envois').select('bon:bon_id(id,numero,statut,cree_par_nom,created_at)').eq('envoi_id',id).eq('type','intra').maybeSingle(),
    ]);
    var auditEl=document.getElementById('gmod-audit');
    if(!ar.error&&ar.data&&ar.data.length&&auditEl){var la=ar.data[0];auditEl.innerHTML='<div class="df full" style="margin-top:6px;padding-top:6px;border-top:0.5px solid var(--b3)"><span style="color:var(--warning)">✎ Modifié</span><span style="color:var(--t2)">'+escapeHtml(la.changed_by_nom)+' — '+formatDateTime(la.changed_at)+'</span></div>';}
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
export async function declarerPerdu(id){
  var e=state.envois.find(function(x){return x.id===id;});if(!e)return;
  if(!await confirm2('Déclarer l\'envoi '+e.numero+' perdu','Cet envoi sera marqué comme perdu. Cette action ne peut pas être annulée.','Déclarer perdu'))return;
  var r=await state.sb.from('envois').update({statut:'Perdu',ts_recep:new Date().toISOString(),recep_par_nom:state.currentUser.nom,recep_obs:'Déclaré perdu par '+state.currentUser.nom}).eq('id',e.id);
  if(r.error){toast('Erreur : '+r.error.message,'e');return;}
  _queueNotif('lost',e,{});
  toast('Envoi '+e.numero+' déclaré perdu.','s');closeGMod();
}

// ── Résumé ────────────────────────────────────────────────────────────────────
export function switchRTab(t){
  ['sent','recv','done'].forEach(function(k){document.getElementById('rtab-'+k).classList.toggle('active',t===k);document.getElementById('rtab-panel-'+k).classList.toggle('gone',t!==k);});
  if(t==='sent'){var lId=estGrappe()?document.getElementById('rls').value:state.activeLaboId;loadResumeSentPage(lId,0);}
  if(t==='done'){var lId=estGrappe()?document.getElementById('rls').value:state.activeLaboId;loadResumeDonePage(lId,0);}
}
export async function loadResumeDonePage(laboId,page){
  state.resumePageDone=page;state.resumeLaboDone=laboId;
  var fv=document.getElementById('pfrom').value,tv=document.getElementById('pto').value,fd=document.getElementById('rdept').value;
  var grp=(document.getElementById('rgroup')||{}).value||'envoi';var dateCol=grp==='recep'?'ts_recep':'ts_envoi';
  var sel='id,numero,numeros_silp,exp_labo_id,dest_labo_id,temperature,transporteur,nb_echantillons,departements,statut,cree_par_nom,recep_par_nom,ts_envoi,ts_recep,exp_lab:exp_labo_id(name),dest_lab:dest_labo_id(name)';
  var tbl=document.getElementById('rdone-table'),emp=document.getElementById('rdone-empty');
  var emptyHtml='<div class="empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>Aucun colis réceptionné</p><span>Aucun envoi réceptionné pour cette période.</span></div>';
  function renderDoneGrouped(items){if(!items.length){tbl.classList.add('gone');emp.classList.remove('gone');emp.innerHTML=emptyHtml;return;}emp.classList.add('gone');tbl.classList.remove('gone');var g={};items.forEach(function(e){var k=grp==='recep'?(e.tsRecep?deepKey(e.tsRecep):'sans-date'):deepKey(e.tsEnvoi);if(!g[k])g[k]=[];g[k].push(e);});var groups=Object.entries(g).sort(function(a,b){if(a[0]==='sans-date')return-1;if(b[0]==='sans-date')return 1;return b[0].localeCompare(a[0]);});document.getElementById('rdone').innerHTML=groups.map(function(gr){var lbl=gr[0]==='sans-date'?'Non réceptionné':formatDate(gr[0]+'T12:00:00');return'<tr class="dsep"><td colspan="10">'+lbl+'</td></tr>'+gr[1].map(function(e){return'<tr class="'+classeLigne(e)+'" onclick="showGMod(\''+e.id+'\')" style="cursor:pointer"><td style="font-family:var(--fm);font-size:11px;color:var(--ti)">'+escapeHtml(e.numero)+'</td><td>'+escapeHtml(e.exp)+'</td><td>'+departementsHtml(e.departements)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2);text-align:center">'+(e.tubes||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsRecep)+'</td><td style="font-size:11px;color:var(--t2)">'+escapeHtml(e.recepPar||'—')+'</td><td>'+celluleTransit(e)+'</td></tr>';}).join('');}).join('');}
  function setPagerDone(total,hasMore){document.getElementById('rdc').textContent=total;var pgEl=document.getElementById('rdone-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('rdone-prev').disabled=page===0;document.getElementById('rdone-next').disabled=!hasMore;document.getElementById('rdone-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10);}}
  if(_resumeAlerts){
    if(page===0){var q=state.sb.from('envois').select(sel).in('statut',['Reçu','Perdu','Problème']).eq('dest_labo_id',laboId);if(fv)q=q.gte(dateCol,fv+'T00:00:00');if(tv)q=q.lte(dateCol,tv+'T23:59:59');if(fd)q=q.contains('departements',[fd]);q=q.order('ts_recep',{ascending:false}).limit(1000);var r=await q;if(r.error)return;state.resumeAlertesRecus=(r.data||[]).map(function(row){return _mapEnvoi(row);}).filter(estAlerte);}
    var total=state.resumeAlertesRecus.length;renderDoneGrouped(state.resumeAlertesRecus.slice(page*10,(page+1)*10));setPagerDone(total,(page+1)*10<total);
  }else{
    var offset=page*10;var q=state.sb.from('envois').select(sel,{count:'exact'}).in('statut',['Reçu','Perdu','Problème']).eq('dest_labo_id',laboId);if(fv)q=q.gte(dateCol,fv+'T00:00:00');if(tv)q=q.lte(dateCol,tv+'T23:59:59');if(fd)q=q.contains('departements',[fd]);q=q.order('ts_recep',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;var data=r.data||[];var total=r.count||0;renderDoneGrouped(data.map(function(row){return _mapEnvoi(row);}));setPagerDone(total,(offset+data.length)<total);
  }
}
export function changeResumeDonePage(delta){if(state.resumeLaboDone)loadResumeDonePage(state.resumeLaboDone,Math.max(0,state.resumePageDone+delta));}
export function renderResumeRecvPage(page){
  state.resumePageRecus=page;var grp=(document.getElementById('rgroup')||{}).value||'envoi';
  var total=state.resumeDonneesRecus.length;var slice=state.resumeDonneesRecus.slice(page*10,(page+1)*10);var hasMore=(page+1)*10<total;
  var tbl=document.getElementById('rrecv-table'),emp=document.getElementById('rrecv-empty');
  if(!slice.length&&page===0){tbl.classList.add('gone');emp.classList.remove('gone');emp.innerHTML='<div class="empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>Aucun colis en attente de réception</p><span>Tous les colis ont été réceptionnés ou modifiez les filtres.</span></div>';}
  else{emp.classList.add('gone');tbl.classList.remove('gone');var g={};slice.forEach(function(e){var k=grp==='recep'?(e.tsRecep?deepKey(e.tsRecep):'sans-date'):deepKey(e.tsEnvoi);if(!g[k])g[k]=[];g[k].push(e);});var groups=Object.entries(g).sort(function(a,b){if(a[0]==='sans-date')return-1;if(b[0]==='sans-date')return 1;return b[0].localeCompare(a[0]);});document.getElementById('rrecv').innerHTML=groups.map(function(gr){var lbl=gr[0]==='sans-date'?'Non réceptionné':formatDate(gr[0]+'T12:00:00');return'<tr class="dsep"><td colspan="9">'+lbl+'</td></tr>'+gr[1].map(function(e){return'<tr class="'+classeLigne(e)+'" onclick="showGMod(\''+e.id+'\')" style="cursor:pointer"><td style="font-family:var(--fm);font-size:11px;color:var(--ti)">'+escapeHtml(e.numero)+'</td><td>'+escapeHtml(e.exp)+'</td><td>'+departementsHtml(e.departements)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2);text-align:center">'+(e.tubes||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td><td><span class="badge '+classeBadge(e.statut)+'">'+escapeHtml(e.statut)+'</span></td><td>'+celluleTransit(e)+'</td></tr>';}).join('');}).join('');}
  var pgEl=document.getElementById('rrecv-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('rrecv-prev').disabled=page===0;document.getElementById('rrecv-next').disabled=!hasMore;document.getElementById('rrecv-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10);}
}
export async function loadResumeSentPage(laboId,page){
  state.resumePageEnvois=page;state.resumeLaboEnvois=laboId;
  var fv=document.getElementById('pfrom').value,tv=document.getElementById('pto').value,fd=document.getElementById('rdept').value;
  var grp=(document.getElementById('rgroup')||{}).value||'envoi';
  var sel='id,numero,numeros_silp,exp_labo_id,dest_labo_id,temperature,transporteur,nb_echantillons,departements,statut,cree_par_nom,recep_par_nom,ts_envoi,ts_recep,exp_lab:exp_labo_id(name),dest_lab:dest_labo_id(name)';
  var tbl=document.getElementById('rsent-table'),emp=document.getElementById('rsent-empty');
  var emptyHtml='<div class="empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p>Aucun envoi pour cette période</p><span>Modifiez les filtres de date ou de département.</span></div>';
  function renderSentGrouped(items){if(!items.length){tbl.classList.add('gone');emp.classList.remove('gone');emp.innerHTML=emptyHtml;return;}emp.classList.add('gone');tbl.classList.remove('gone');var g={};items.forEach(function(e){var k=grp==='recep'?(e.tsRecep?deepKey(e.tsRecep):'sans-date'):deepKey(e.tsEnvoi);if(!g[k])g[k]=[];g[k].push(e);});var groups=Object.entries(g).sort(function(a,b){if(a[0]==='sans-date')return-1;if(b[0]==='sans-date')return 1;return b[0].localeCompare(a[0]);});document.getElementById('rsent').innerHTML=groups.map(function(gr){var lbl=gr[0]==='sans-date'?'Non réceptionné':formatDate(gr[0]+'T12:00:00');return'<tr class="dsep"><td colspan="12">'+lbl+'</td></tr>'+gr[1].map(function(e){return'<tr class="'+classeLigne(e)+'" onclick="showGMod(\''+e.id+'\')" style="cursor:pointer"><td style="font-family:var(--fm);font-size:11px;color:var(--ti)">'+escapeHtml(e.numero)+'</td><td>'+escapeHtml(e.dest)+'</td><td>'+departementsHtml(e.departements)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td style="font-size:11px;color:var(--t2);text-align:center">'+(e.tubes||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+escapeHtml(e.creePar||'—')+'</td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td><td><span class="badge '+classeBadge(e.statut)+'">'+escapeHtml(e.statut)+'</span></td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsRecep)+'</td><td style="font-size:11px;color:var(--t2)">'+escapeHtml(e.recepPar||'—')+'</td><td>'+celluleTransit(e)+'</td></tr>';}).join('');}).join('');}
  function setPagerSent(total,hasMore){document.getElementById('rsc').textContent=total;var pgEl=document.getElementById('rsent-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('rsent-prev').disabled=page===0;document.getElementById('rsent-next').disabled=!hasMore;document.getElementById('rsent-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10);}}
  if(_resumeAlerts){
    if(page===0){var _ac=new Date(Date.now()-state.CFG.alarmR*3600*1000).toISOString();var q=state.sb.from('envois').select(sel).eq('exp_labo_id',laboId).is('annule_at',null).or('statut.eq.Perdu,statut.eq.Problème,statut.eq.Reçu,and(statut.eq.En transit,ts_envoi.lt.'+_ac+')');if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');if(fd)q=q.contains('departements',[fd]);q=q.order('ts_envoi',{ascending:false}).limit(1000);var r=await q;if(r.error)return;state.resumeAlertesEnvois=(r.data||[]).map(function(row){return _mapEnvoi(row);}).filter(estAlerte);}
    var total=state.resumeAlertesEnvois.length;renderSentGrouped(state.resumeAlertesEnvois.slice(page*10,(page+1)*10));setPagerSent(total,(page+1)*10<total);
  }else{
    var offset=page*10;var q=state.sb.from('envois').select(sel,{count:'exact'}).eq('exp_labo_id',laboId).is('annule_at',null);if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');if(fd)q=q.contains('departements',[fd]);q=q.order('ts_envoi',{ascending:false}).range(offset,offset+9);var r=await q;if(r.error)return;var data=r.data||[];var total=r.count||0;renderSentGrouped(data.map(function(row){return _mapEnvoi(row);}));setPagerSent(total,(offset+data.length)<total);
  }
}
export function changeResumeSentPage(delta){if(state.resumeLaboEnvois)loadResumeSentPage(state.resumeLaboEnvois,Math.max(0,state.resumePageEnvois+delta));}
export function changeResumeRecvPage(delta){renderResumeRecvPage(Math.max(0,state.resumePageRecus+delta));}
export function getResData(){
  var laboId=estGrappe()?document.getElementById('rls').value:state.activeLaboId;
  var laboName=(state.laboratoires.find(function(l){return l.id===laboId;})||{name:''}).name;
  var fv=document.getElementById('pfrom').value,tv=document.getElementById('pto').value,fd=document.getElementById('rdept').value;
  var fd2=fv?new Date(fv+'T00:00:00'):new Date(0),td2=tv?new Date(tv+'T23:59:59'):new Date();
  var grpF=document.getElementById('rgroup').value;
  function ir(e){var ts=grpF==='recep'?(e.tsRecep||e.tsEnvoi):e.tsEnvoi;return new Date(ts)>=fd2&&new Date(ts)<=td2;}
  function md(e){return!fd||(e.departements&&e.departements.indexOf(fd)!==-1);}
  var recv=state.envois.filter(function(e){return e.destId===laboId&&ir(e)&&md(e);});
  var pending=recv.filter(function(e){return e.statut==='En transit';});
  return{laboId:laboId,laboName:laboName,recv:recv,pending:pending};
}
export function renderResume(){
  if(!state.currentUser)return;var d=getResData();
  if(_resumeAlerts){d.pending=d.pending.filter(estAlerte);}
  document.getElementById('rtitle').textContent='Résumé — '+d.laboName;
  document.getElementById('rsc').textContent='…';document.getElementById('rrc').textContent=d.pending.length;document.getElementById('rdc').textContent='…';
  afficherLegende('rtable-legend',d.recv);
  state.resumePageEnvois=0;state.resumeDonneesRecus=d.pending;state.resumePageRecus=0;
  loadResumeSentPage(d.laboId,0);renderResumeRecvPage(0);loadResumeDonePage(d.laboId,0);
}

// ── PDF ───────────────────────────────────────────────────────────────────────
export function togglePdfDrop(e){e.stopPropagation();document.getElementById('pdf-drop-menu').classList.toggle('open');}
document.addEventListener('click',function(){var m=document.getElementById('pdf-drop-menu');if(m)m.classList.remove('open');});
export function pdfStr(s){if(!s)return'';return String(s).replace(/−/g,'-').replace(/–/g,'-').replace(/—/g,'-').replace(/[^\x00-\xFF]/g,'?');}
export async function exportPDF(orient){
  document.getElementById('pdf-drop-menu').classList.remove('open');
  if(!window.jspdf||!window.jspdf.jsPDF){alert('Librairie PDF non disponible.');return;}
  var laboId=estGrappe()?document.getElementById('rls').value:state.activeLaboId;
  var laboName=(state.laboratoires.find(function(l){return l.id===laboId;})||{name:''}).name;
  var fv=document.getElementById('pfrom').value,tv=document.getElementById('pto').value,fd=document.getElementById('rdept').value;
  var grpPdf=document.getElementById('rgroup').value;var portrait=orient==='portrait';
  var sel='id,numero,numeros_silp,exp_labo_id,dest_labo_id,departements,temperature,transporteur,nb_echantillons,statut,cree_par_nom,recep_par_nom,notes,recep_obs,ts_envoi,ts_recep,exp_lab:exp_labo_id(name),dest_lab:dest_labo_id(name)';
  function bq(col){var q=state.sb.from('envois').select(sel).eq(col,laboId).is('annule_at',null);if(fv)q=q.gte('ts_envoi',fv+'T00:00:00');if(tv)q=q.lte('ts_envoi',tv+'T23:59:59');if(fd)q=q.contains('departements',[fd]);return q.order(grpPdf==='recep'?'ts_recep':'ts_envoi',{ascending:false}).limit(1000);}
  var results=await Promise.all([bq('exp_labo_id'),bq('dest_labo_id')]);
  var sent=(results[0].error?[]:results[0].data||[]).map(_mapEnvoi);
  var recv=(results[1].error?[]:results[1].data||[]).map(_mapEnvoi);
  if(_resumeAlerts){sent=sent.filter(estAlerte);recv=recv.filter(estAlerte);}
  var doc=new window.jspdf.jsPDF({orientation:portrait?'portrait':'landscape',format:'letter'});
  var pw=doc.internal.pageSize.getWidth();
  doc.setFillColor(24,95,165);doc.rect(0,0,pw,28,'F');doc.setTextColor(255,255,255);doc.setFontSize(14);doc.setFont(undefined,'bold');
  doc.text(state.CFG.name+' — Récapitulatif'+(_resumeAlerts?' — Alertes uniquement':''),14,11);
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text(laboName,14,18);
  var grpLabel=grpPdf==='recep'?'Groupé par date de réception':'Groupé par date d\'envoi';
  doc.text('Période : '+(fv||'—')+' au '+(tv||'—')+(fd?' | Dépt : '+fd:'')+' | '+grpLabel+'   Généré le '+formatDateTime(new Date().toISOString())+' par '+state.currentUser.nom,14,24);
  doc.setTextColor(0,0,0);
  function sepRow(k,nc){var lbl=k==='sans-date'?'Non réceptionné':formatDate(k+'T12:00:00');return[{content:lbl,colSpan:nc,styles:{fillColor:[232,231,228],textColor:[65,64,60],fontStyle:'bold',fontSize:8,cellPadding:{top:5,bottom:5,left:10,right:5}}}];}
  function noteRow(txt,nc,bg,tc){return[{content:txt,colSpan:nc,styles:{fillColor:bg,textColor:tc,fontStyle:'italic',fontSize:7.5,cellPadding:{top:2,bottom:3,left:18,right:6}}}];}
  function subRow(parts,nc){return[{content:parts.join('   '),colSpan:nc,styles:{fillColor:[245,247,250],textColor:[90,100,110],fontSize:7,fontStyle:'italic',cellPadding:{top:2,bottom:2,left:16,right:6}}}];}
  function buildRows(list,type){
    var nc=portrait?8:(type==='s'?12:11);var rows=[],prevDay=null;
    list.forEach(function(e){
      var day=grpPdf==='recep'?(e.tsRecep?deepKey(e.tsRecep):'sans-date'):deepKey(e.tsEnvoi);
      if(day!==prevDay){rows.push(sepRow(day,nc));prevDay=day;}
      var h=heuresTransit(e);var al=h!==null&&h>state.CFG.alarmR;
      var fth=al?{content:formatDuree(h)+' (!)',styles:{textColor:[150,30,30],fontStyle:'bold'}}:formatDuree(h);
      var temp=pdfStr(e.temp),trans=pdfStr(e.transporteur),dest=pdfStr(e.dest),exp=pdfStr(e.exp),departements=pdfStr(departementsTexte(e.departements)),cpar=pdfStr(e.creePar||''),rpar=pdfStr(e.recepPar||'');
      var tr;
      if(portrait){
        if(type==='s')tr=[e.numero,dest,temp,trans,formatDateTime(e.tsEnvoi),e.statut,formatDateTime(e.tsRecep),fth];
        else          tr=[e.numero,exp, temp,trans,formatDateTime(e.tsEnvoi),e.statut,formatDateTime(e.tsRecep),fth];
        var sub=[];if(departements)sub.push('D\xe9pt : '+departements);if(e.tubes)sub.push('Ech. : '+e.tubes);
        if(type==='s'&&cpar)sub.push('Cr\xe9\xe9 par : '+cpar);if(rpar)sub.push('R\xe9ceptionn\xe9 par : '+rpar);
        if(sub.length)rows.push(tr,subRow(sub,nc));else rows.push(tr);
      }else{
        if(type==='s')tr=[e.numero,dest,departements,temp,trans,e.tubes||'-',cpar,formatDateTime(e.tsEnvoi),e.statut,formatDateTime(e.tsRecep),rpar,fth];
        else          tr=[e.numero,exp, departements,temp,trans,e.tubes||'-',formatDateTime(e.tsEnvoi),e.statut,formatDateTime(e.tsRecep),rpar,fth];
        rows.push(tr);
      }
      if(e.notes)rows.push(noteRow(pdfStr('Notes : '+e.notes),nc,[238,246,255],[40,60,110]));
      if(e.recepObs)rows.push(noteRow(pdfStr('Observations r\xe9ception : '+e.recepObs),nc,[255,235,235],[150,30,30]));
    });
    return rows;
  }
  var hS=portrait?['N\xb0 liste','Destinataire','Temp\xe9rature','Transporteur','Date envoi','Statut','R\xe9ceptionn\xe9 le','Transit']:['N\xb0 liste','Destinataire','D\xe9partement(s)','Temp\xe9rature','Transporteur','Ech.','Cr\xe9\xe9 par','Date envoi','Statut','R\xe9ceptionn\xe9 le','R\xe9ceptionn\xe9 par','Transit'];
  var hR=portrait?['N\xb0 liste','Exp\xe9diteur','Temp\xe9rature','Transporteur','Date envoi','Statut','R\xe9ceptionn\xe9 le','Transit']:['N\xb0 liste','Exp\xe9diteur','D\xe9partement(s)','Temp\xe9rature','Transporteur','Ech.','Date envoi','Statut','R\xe9ceptionn\xe9 le','R\xe9ceptionn\xe9 par','Transit'];
  var tblStyles={fontSize:portrait?8.5:8,cellPadding:portrait?{top:4,bottom:4,left:4,right:3}:3,overflow:'linebreak'};
  doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text('Colis envoy\xe9s ('+sent.length+')',14,36);
  doc.autoTable({startY:39,head:[hS],body:buildRows(sent,'s'),styles:tblStyles,headStyles:{fillColor:[24,95,165],textColor:255,fontStyle:'bold',fontSize:portrait?8.5:8},alternateRowStyles:{fillColor:[247,251,255]}});
  var y=doc.lastAutoTable.finalY+10;if(y>doc.internal.pageSize.getHeight()-60){doc.addPage();y=18;}
  doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text('Colis re\xe7us / \xe0 r\xe9ceptionner ('+recv.length+')',14,y);
  doc.autoTable({startY:y+3,head:[hR],body:buildRows(recv,'r'),styles:tblStyles,headStyles:{fillColor:[15,110,86],textColor:255,fontStyle:'bold',fontSize:portrait?8.5:8},alternateRowStyles:{fillColor:[245,252,248]}});
  var labCode=laboName.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,5);
  var dateFrom=(fv||'').replace(/-/g,'');var dateTo=(tv||'').replace(/-/g,'');
  doc.save(labCode+'_'+(dateFrom||'00000000')+'_'+(dateTo||'99999999')+'.pdf');
}

// ── Historique ────────────────────────────────────────────────────────────────
export function toggleHistAlerts(){_histAlerts=!_histAlerts;document.getElementById('hist-alert-btn').classList.toggle('alert-btn-on',_histAlerts);loadHistPage(0);}
export function toggleResumeAlerts(){_resumeAlerts=!_resumeAlerts;document.getElementById('resume-alert-btn').classList.toggle('alert-btn-on',_resumeAlerts);renderResume();}
export async function loadHistPage(page){
  _histPage=page;
  var q_str=document.getElementById('search').value.trim().toLowerCase();
  var fs_val=document.getElementById('fstat').value,fdept=document.getElementById('fdept').value,ftrans=document.getElementById('ftrans').value,hfv=document.getElementById('hfrom').value,htv=document.getElementById('hto').value;
  function applyCommonFilters(q){if(hfv)q=q.gte('ts_envoi',hfv+'T00:00:00');if(htv)q=q.lte('ts_envoi',htv+'T23:59:59');if(fdept)q=q.contains('departements',[fdept]);if(ftrans)q=q.eq('transporteur',ftrans);if(q_str){var mids=state.laboratoires.filter(function(l){return l.name.toLowerCase().includes(q_str);}).map(function(l){return l.id;});var op=['numero.ilike.%'+q_str+'%','transporteur.ilike.%'+q_str+'%','cree_par_nom.ilike.%'+q_str+'%','recep_par_nom.ilike.%'+q_str+'%'];if(mids.length){op.push('exp_labo_id.in.('+mids.join(',')+')');op.push('dest_labo_id.in.('+mids.join(',')+')'); }q=q.or(op.join(','));}return q;}
  function renderItems(items,total,hasMore){var countEl=document.getElementById('hist-count');if(countEl)countEl.textContent=total+(_histAlerts?' alerte'+(total!==1?'s':'')+' trouvée'+(total!==1?'s':''):' résultat'+(total!==1?'s':''));document.getElementById('tbody').innerHTML=items.map(function(e){var _dispNum=e.numerosSilp&&e.numerosSilp.length?escapeHtml(e.numerosSilp[0])+(e.numerosSilp.length>1?' <span style="font-size:9px;background:var(--b3);color:var(--t2);border-radius:3px;padding:1px 4px">+'+( e.numerosSilp.length-1)+'</span>':''):'<span style="font-size:10px;color:var(--t3)">'+escapeHtml(e.numero)+'</span>';return'<tr class="'+classeLigne(e)+'" style="cursor:pointer" onclick="showGMod(\''+e.id+'\')"><td style="color:var(--ti);font-family:var(--fm);font-size:11px">'+_dispNum+'</td><td>'+escapeHtml(e.exp)+'</td><td>'+escapeHtml(e.dest)+'</td><td>'+departementsHtml(e.departements)+'</td><td>'+libelleTempCourt(e.temp)+'</td><td>'+escapeHtml(e.transporteur)+'</td><td>'+(e.tubes||'—')+'</td><td><span class="badge '+classeBadge(e.statut)+'">'+escapeHtml(e.statut)+'</span></td><td style="font-size:11px;color:var(--t2)">'+formatDateTime(e.tsEnvoi)+'</td><td>'+celluleTransit(e)+'</td></tr>';}).join('');afficherLegende('htable-legend',items);var pgEl=document.getElementById('hist-pager');if(pgEl){pgEl.style.display=total>10?'flex':'none';document.getElementById('hist-prev').disabled=page===0;document.getElementById('hist-next').disabled=!hasMore;document.getElementById('hist-page-info').textContent='Page '+(page+1)+' / '+Math.ceil(total/10)||1;}}
  if(_histAlerts){
    if(page===0){var _ac=new Date(Date.now()-state.CFG.alarmR*3600*1000).toISOString();var q=state.sb.from('envois').select('id,numero,numeros_silp,exp_labo_id,dest_labo_id,departements,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_recep,cree_par_nom,recep_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_labo_id(name)').or('statut.eq.Perdu,statut.eq.Problème,statut.eq.Reçu,and(statut.eq.En transit,ts_envoi.lt.'+_ac+')');q=applyCommonFilters(q);q=q.is('annule_at',null).order('ts_envoi',{ascending:false}).limit(1000);var r=await q;if(r.error)return;_histAlertData=(r.data||[]).map(function(row){return _mapEnvoi(row);}).filter(estAlerte).sort(function(a,b){return new Date(b.tsEnvoi)-new Date(a.tsEnvoi);});}
    var total=_histAlertData.length;renderItems(_histAlertData.slice(page*10,(page+1)*10),total,(page+1)*10<total);
  }else{
    var q=state.sb.from('envois').select('id,numero,numeros_silp,exp_labo_id,dest_labo_id,departements,temperature,transporteur,nb_echantillons,statut,ts_envoi,ts_recep,cree_par_nom,recep_par_nom,exp_lab:exp_labo_id(name),dest_lab:dest_labo_id(name)',{count:'exact'});
    if(fs_val)q=q.eq('statut',fs_val);q=applyCommonFilters(q);q=q.is('annule_at',null).order('ts_envoi',{ascending:false}).range(page*10,page*10+9);var r=await q;if(r.error)return;var data=r.data||[];var total=r.count||0;_histTotalCount=total;renderItems(data.map(function(row){return _mapEnvoi(row);}),total,(page*10+data.length)<total);
  }
}
export async function loadHistStats(){var now=new Date(),monthStart=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01';var[r1,r2,r3]=await Promise.all([state.sb.from('envois').select('*',{count:'exact',head:true}).is('annule_at',null),state.sb.from('envois').select('*',{count:'exact',head:true}).is('annule_at',null).gte('ts_envoi',monthStart),state.sb.from('envois').select('*',{count:'exact',head:true}).is('annule_at',null).eq('statut','En transit')]);if(!r1.error)document.getElementById('st').textContent=r1.count||0;if(!r2.error)document.getElementById('sm').textContent=r2.count||0;if(!r3.error)document.getElementById('str2').textContent=r3.count||0;document.getElementById('sl').textContent=state.laboratoires.length;}
export function changeHistPage(delta){loadHistPage(Math.max(0,_histPage+delta));}
export function onHistSearch(){clearTimeout(_histSearchTimer);_histSearchTimer=setTimeout(function(){loadHistPage(0);},400);}

// ── Modification envoi ────────────────────────────────────────────────────────
export async function openEditEnvoi(id){
  var e=state.envois.find(function(x){return x.id===id;})||state.cacheModals[id];if(!e)return;
  if(e.annuleAt)return;
  state.editEnvoiId=id;
  document.getElementById('e-nlist-ro').textContent=e.numerosSilp&&e.numerosSilp.length?e.numerosSilp.join(' · '):e.numero;document.getElementById('e-exp-ro').textContent=e.exp;document.getElementById('e-dest-ro').textContent=e.dest;
  document.getElementById('e-serr').style.display='none';
  var et=document.getElementById('e-trans');et.innerHTML='<option value="">— Sélectionner —</option>';
  state.CFG.transporters.forEach(function(t){var o=document.createElement('option');o.textContent=t;et.appendChild(o);});et.value=e.transporteur;
  var es=document.getElementById('e-tspec');es.innerHTML='';
  state.CFG.bordereau.specTypes.forEach(function(st){var o=document.createElement('option');o.value=st.id;o.textContent=st.label;es.appendChild(o);});es.value=e.typeSpecimen||'exempt';
  document.getElementById('e-ntub').value=e.tubes||'';document.getElementById('e-notes').value=e.notes||'';
  state.editTemperature=e.temp;afficherPillsTempEdit();
  state.editRefrigerant=e.glaceSeche||false;
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===e.temp;});
  var gs=document.getElementById('e-glace-section');
  if(gs){if(tCfg&&tCfg.ask_glace){gs.style.display='';setEditGlace(e.glaceSeche);}else{gs.style.display='none';}}
  state.editDepts=(e.departements||[]).slice();updatePillsDeptEdit();
  var _expBdOn=window.CFG&&Array.isArray(window.CFG.bonsDepartEnabledLabs)&&window.CFG.bonsDepartEnabledLabs.indexOf(e.expId)!==-1;
  var _delBtn=document.getElementById('e-del-btn'),_saveBtn=document.getElementById('e-save-btn');
  if(_delBtn)_delBtn.style.display='none';
  if(_saveBtn){_saveBtn.disabled=e.statut==='En transit'&&_expBdOn;_saveBtn.style.opacity=e.statut==='En transit'&&_expBdOn?'0.5':'1';}
  closeGMod();document.getElementById('edit-envoi-modal').style.display='flex';
  var _inActiveBon=false;
  if(e.statut==='En transit'&&_expBdOn){
    var rLinks=await state.sb.from('bons_depart_envois').select('bon_id').eq('envoi_id',id);
    if(!rLinks.error&&rLinks.data&&rLinks.data.length){
      var bonIds=rLinks.data.map(function(r){return r.bon_id;});
      var rActive=await state.sb.from('bons_depart').select('id',{count:'exact',head:true}).in('id',bonIds).eq('statut','actif');
      _inActiveBon=!rActive.error&&(rActive.count||0)>0;
    }
  }
  var _isRespEdit=state.currentUser.labMemberships&&state.currentUser.labMemberships.some(function(m){return m.labo_id===e.expId&&m.lab_role==='responsable';});
  var _canDel=(e.statut==='En attente'||e.statut==='En transit')&&(e.creeParId===state.currentUser.id||e.expId===state.activeLaboId&&_isRespEdit||estSuperviseur()||estAdmin());
  if(_delBtn)_delBtn.style.display=_canDel&&!_inActiveBon?'':'none';
  if(_saveBtn){_saveBtn.disabled=_inActiveBon;_saveBtn.style.opacity=_inActiveBon?'0.5':'1';}
  if(_inActiveBon){
    var _serr=document.getElementById('e-serr');
    if(_serr){_serr.textContent='Envoi dans un bon de départ actif — modification et annulation impossibles.';_serr.style.display='';}
    toast('Cet envoi est dans un bon de départ actif. Modification et annulation impossibles.','e',6000);
  }
}
export function closeEditEnvoi(){document.getElementById('edit-envoi-modal').style.display='none';state.editEnvoiId=null;}
export function afficherPillsTempEdit(){
  var c=document.getElementById('e-tpills-c');if(!c)return;c.innerHTML='';
  state.CFG.temperatures.forEach(function(t,i){
    var cls=classesPills[i%classesPills.length];var el=document.createElement('div');
    el.className='tpill'+(t.label===state.editTemperature?' '+cls:'');el.textContent=t.icon+' '+t.label;el.setAttribute('data-t',t.label);
    el.onclick=(function(lbl,pc){return function(){selectionnerTempEdit(lbl,pc);};})(t.label,cls);c.appendChild(el);
  });
}
export function selectionnerTempEdit(lbl,pc){
  state.editTemperature=lbl;state.editRefrigerant=false;
  document.querySelectorAll('#e-tpills-c .tpill').forEach(function(el){el.className='tpill';if(el.getAttribute('data-t')===lbl)el.classList.add(pc);});
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===lbl;});
  var gs=document.getElementById('e-glace-section');
  if(gs){if(tCfg&&tCfg.ask_glace){gs.style.display='';state.editRefrigerant=null;}else{gs.style.display='none';state.editRefrigerant=false;}}
}
export function setEditGlace(val){
  state.editRefrigerant=val;
  var btnO=document.getElementById('e-btn-glace-oui'),btnN=document.getElementById('e-btn-glace-non');
  if(btnO)btnO.style.outline=val?'2px solid var(--brand-azure-deep)':'';
  if(btnN)btnN.style.outline=val?'':'2px solid var(--brand-azure-deep)';
}
export function toggleDeptEdit(d){var ix=state.editDepts.indexOf(d);if(ix===-1)state.editDepts.push(d);else state.editDepts.splice(ix,1);updatePillsDeptEdit();}
export function updatePillsDeptEdit(){
  var cm={BIOCHIMIE:'dp-bio',HEMATOLOGIE:'dp-hema',MICROBIOLOGIE:'dp-micro',PATHOLOGIE:'dp-patho'};
  departements.forEach(function(x){var el=document.getElementById('edp-'+x.id);if(el)el.className='dpill '+cm[x.id]+(state.editDepts.indexOf(x.id)!==-1?' on':'');});
}
export async function saveEditEnvoi(){
  var _eSaveBtn=document.getElementById('e-save-btn');if(_eSaveBtn&&_eSaveBtn.disabled)return;
  if(!state.editTemperature){notifier('e-serr','Veuillez sélectionner une température d\'envoi.','e');return;}
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===state.editTemperature;});
  if(tCfg&&tCfg.ask_glace&&state.editRefrigerant===null){notifier('e-serr','Veuillez sélectionner le type de réfrigérant.','e');return;}
  var tr=document.getElementById('e-trans').value;if(!tr){notifier('e-serr','Veuillez sélectionner un transporteur.','e');return;}
  if(!state.editDepts.length){notifier('e-serr','Veuillez sélectionner au moins un département.','e');return;}
  var e=state.envois.find(function(x){return x.id===state.editEnvoiId;});if(!e)return;
  var tubes=parseInt(document.getElementById('e-ntub').value)||null;var spec=document.getElementById('e-tspec').value;var notes=document.getElementById('e-notes').value;
  var oldData={temperature:e.temp,transporteur:e.transporteur,nb_echantillons:e.tubes,departements:e.departements||[],notes:e.notes||'',type_specimen:e.typeSpecimen||'exempt',glace_seche:e.glaceSeche||false};
  var newData={temperature:state.editTemperature,transporteur:tr,nb_echantillons:tubes,departements:state.editDepts.slice(),notes:notes,type_specimen:spec,glace_seche:state.editRefrigerant===true};
  var changedFields=Object.keys(newData).filter(function(k){return JSON.stringify(oldData[k])!==JSON.stringify(newData[k]);});
  if(!changedFields.length){closeEditEnvoi();return;}
  var r=await sbCall(state.sb.from('envois').update({temperature:state.editTemperature,transporteur:tr,nb_echantillons:tubes,departements:state.editDepts.slice(),notes:notes,type_specimen:spec,glace_seche:state.editRefrigerant===true}).eq('id',state.editEnvoiId), 'e-serr');
  if(r.error)return;
  await state.sb.from('envois_audit').insert({table_name:'envois',record_id:state.editEnvoiId,action:'UPDATE',old_data:oldData,new_data:newData,changed_fields:changedFields,changed_by_id:state.currentUser.id,changed_by_nom:state.currentUser.nom});
  var destLab=state.laboratoires.find(function(l){return l.id===e.destId;})||{};var expLab=state.laboratoires.find(function(l){return l.id===e.expId;})||{};
  state.donneesImpression={numero:e.numero,exp:e.exp,dest:e.dest,temp:state.editTemperature,transporteur:tr,tubes:tubes,departements:state.editDepts.slice(),notes:notes,creePar:e.creePar,tsEnvoi:e.tsEnvoi,typeSpecimen:spec,glaceSeche:state.editRefrigerant===true,expAdresse:expLab.adresse||'',expAdresse2:expLab.adresse2||'',expVille:expLab.ville||'',expProvince:expLab.province||'',expCodePostal:expLab.code_postal||'',expPays:expLab.pays||'',expTel:expLab.telephone||'',destAdresse:destLab.adresse||'',destAdresse2:destLab.adresse2||'',destVille:destLab.ville||'',destProvince:destLab.province||'',destCodePostal:destLab.code_postal||'',destPays:destLab.pays||'',destTel:destLab.telephone||''};
  var isHsilp=e.numero&&e.numero.indexOf('HSILP')===0;
  closeEditEnvoi();showSuccessModalEdit(e.numero,isHsilp);
}
export function showSuccessModalEdit(num,isHsilp){
  var t=document.getElementById('success-title-el');if(t)t.textContent='Envoi modifié';
  var cb=document.getElementById('success-close-btn');if(cb)cb.textContent='Fermer';
  var msgEl=document.getElementById('success-modal-msg');
  if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+escapeHtml(num)+'</strong> modifié avec succès.<br><small style="color:var(--t2);font-size:11px;font-weight:400">Pensez à remplacer le bordereau dans la boîte d\'envoi.</small>';
  var pb=document.getElementById('success-print-btn');var showPrint=isHsilp||state.CFG.printBordereau;
  if(pb){pb.style.display=showPrint?'flex':'none';var fmt=isHsilp?state.CFG.hsilpBordereauFormat||'bordereau':undefined;pb.onclick=function(){closeSuccessModal();window.printBordereau(fmt);};}
  document.getElementById('success-modal').style.display='flex';
}

// ── Modal "pas de liste SILP" ─────────────────────────────────────────────────
export function addSilpList(){
  var inp=document.getElementById('nlist-input'),errEl=document.getElementById('nlist-err');
  var v=inp?inp.value.trim():'';
  if(errEl)errEl.classList.remove('show');
  if(!v)return;
  if(!/^\d+$/.test(v)){if(errEl){errEl.textContent='Uniquement des chiffres.';errEl.classList.add('show');}return;}
  if(_silpChips.indexOf(v)!==-1){if(errEl){errEl.textContent='Ce numéro est déjà dans la liste.';errEl.classList.add('show');}return;}
  var dup=state.envois.find(function(e){return e.numerosSilp&&e.numerosSilp.indexOf(v)!==-1&&(e.statut==='En transit'||e.statut==='En attente');});
  if(dup){
    _silpDupPendingChip=v;
    var dm=document.getElementById('silp-dup-modal'),dmsg=document.getElementById('silp-dup-msg');
    if(dmsg)dmsg.innerHTML='Le numéro <strong>'+escapeHtml(v)+'</strong> est déjà associé à un envoi actif : <strong>'+escapeHtml(dup.numero)+'</strong> — <span class="badge '+classeBadge(dup.statut)+'">'+escapeHtml(dup.statut)+'</span><br><span style="font-size:12px;color:var(--fg-muted)">'+escapeHtml(dup.exp)+' → '+escapeHtml(dup.dest)+' · envoyé le '+formatDateTime(dup.tsEnvoi)+'</span><br><br>Il peut s\'agir d\'une réutilisation de numéro SILP ou d\'une erreur de saisie.';
    if(dm)dm.style.display='flex';
    if(inp)inp.value='';
    return;
  }
  _silpChips.push(v);if(inp)inp.value='';renderSilpChips();if(inp)inp.focus();
}
export function removeSilpList(v){_silpChips=_silpChips.filter(function(x){return x!==v;});renderSilpChips();}
export function renderSilpChips(){var el=document.getElementById('nlist-chips');if(!el)return;el.innerHTML=_silpChips.map(function(v){return'<div class="nlist-chip"><span>'+escapeHtml(v)+'</span><button type="button" onclick="removeSilpList(\''+escapeHtml(v)+'\')" title="Retirer">&times;</button></div>';}).join('');}
export function confirmSilpDup(){var dm=document.getElementById('silp-dup-modal');if(dm)dm.style.display='none';if(_silpDupPendingChip){_silpChips.push(_silpDupPendingChip);_silpDupPendingChip=null;renderSilpChips();}var inp=document.getElementById('nlist-input');if(inp)inp.focus();}
export function cancelSilpDup(){var dm=document.getElementById('silp-dup-modal');if(dm)dm.style.display='none';_silpDupPendingChip=null;var inp=document.getElementById('nlist-input');if(inp)inp.focus();}
export function _afficherResultatReception_global(id){var e=state.envois.find(function(x){return x.id===id;});if(e)_afficherResultatReception(e);}
export function showNoListModal(cb){_noListCb=cb;document.getElementById('hsilp-warn-modal').style.display='flex';}
export function cancelNoList(){_noListCb=null;document.getElementById('hsilp-warn-modal').style.display='none';}
export function confirmNoList(){document.getElementById('hsilp-warn-modal').style.display='none';var f=_noListCb;_noListCb=null;if(f)f();}
export function toggleNoSilp(){
  var cb=document.getElementById('no-silp-cb');
  if(cb&&cb.checked){cb.checked=false;showNoListModal(function(){cb.checked=true;state.sansSilp=true;_applyNoSilpUi(true);fetchHsilpPreviewNum();});}
  else{state.sansSilp=false;_applyNoSilpUi(false);}
}
function _applyNoSilpUi(on){var wrap=document.getElementById('nlist-wrap'),warn=document.getElementById('no-silp-warn'),nw=document.getElementById('no-silp-num-wrap');if(wrap)wrap.style.display=on?'none':'';if(warn)warn.style.display=on?'':'none';if(nw)nw.style.display=on?'':'none';}
export async function fetchHsilpPreviewNum(){var el=document.getElementById('h-nlist');if(!el)return;el.value='Chargement…';el.classList.remove('valid');try{var r=await state.sb.rpc('peek_next_hsilp');if(!r.error&&r.data){el.value=r.data;el.classList.add('valid');}else{el.value='HSILP-######-#####';}}catch(e){el.value='HSILP-######-#####';}}
export function showSuccessModalHsilp(num){
  var msgEl=document.getElementById('success-modal-msg');if(msgEl)msgEl.innerHTML='N°&nbsp;<strong>'+escapeHtml(num)+'</strong> enregistré avec succès.';
  var pb=document.getElementById('success-print-btn');
  if(pb){pb.style.display='flex';pb.onclick=function(){closeSuccessModal();window.printBordereau(state.CFG.hsilpBordereauFormat||'bordereau');};}
  document.getElementById('success-modal').style.display='flex';
  setTimeout(function(){window.printBordereau(state.CFG.hsilpBordereauFormat||'bordereau');},400);
}

// ── Mon compte ────────────────────────────────────────────────────────────────
export function renderMonCompte(){
  if(!state.currentUser)return;
  document.getElementById('mc-nom').textContent=state.currentUser.nom||'—';document.getElementById('mc-empid').textContent=state.currentUser.employee_id||'—';
  document.getElementById('mc-labo').textContent=(state.currentUser.lab?state.currentUser.lab.name:null)||'—';
  document.getElementById('mc-role').innerHTML='<span class="badge '+classeBadgeRole(state.currentUser.role)+'">'+libelleRole(state.currentUser.role)+'</span>';
  var statut='<span class="badge bact">Actif</span>';if(state.currentUser.is_test)statut+=' <span class="badge" style="background:var(--warning-soft);color:var(--warning);margin-left:4px">Test</span>';
  document.getElementById('mc-statut').innerHTML=statut;
  var themeLabel=state.currentUser.theme==='dark'?'Sombre':state.currentUser.theme==='light'?'Clair':'Système (OS)';
  var mcThemeEl=document.getElementById('mc-theme');if(mcThemeEl)mcThemeEl.textContent=themeLabel;
  var createdEl=document.getElementById('mc-created');if(createdEl)createdEl.textContent=(state.currentUser.created_by?state.currentUser.created_by+' — ':'')+( state.currentUser.created_at?formatDateTime(state.currentUser.created_at):'—');
  var updatedEl=document.getElementById('mc-updated');if(updatedEl)updatedEl.textContent=(state.currentUser.updated_by?state.currentUser.updated_by+' — ':'')+( state.currentUser.updated_at?formatDateTime(state.currentUser.updated_at):'—');
  var pwCard=document.getElementById('mc-pw-card'),pwTest=document.getElementById('mc-pw-test');
  if(pwCard)pwCard.style.display=state.currentUser.is_test?'none':'';if(pwTest)pwTest.style.display=state.currentUser.is_test?'':'none';
  document.getElementById('mc-pw1').value='';document.getElementById('mc-pw2').value='';
  document.getElementById('mc-suc').style.display='none';document.getElementById('mc-err').style.display='none';
}
export async function saveMcPw(){
  var p1=document.getElementById('mc-pw1').value,p2=document.getElementById('mc-pw2').value;
  var err=document.getElementById('mc-err'),suc=document.getElementById('mc-suc');
  err.style.display='none';suc.style.display='none';
  if(state.currentUser.is_test){err.textContent='Compte de test — changement de mot de passe désactivé.';err.style.display='block';return;}
  if(!p1){err.textContent='Saisissez un nouveau mot de passe.';err.style.display='block';return;}
  if(p1.length<8){err.textContent='Le mot de passe doit contenir au moins 8 caractères.';err.style.display='block';return;}
  if(p1!==p2){err.textContent='Les mots de passe ne correspondent pas.';err.style.display='block';return;}
  var btn=document.querySelector('#panel-moncompte .bp');btn.classList.add('btn-loading');
  var r=await state.sb.auth.updateUser({password:p1});btn.classList.remove('btn-loading');
  if(r.error){err.textContent='Erreur : '+r.error.message;err.style.display='block';return;}
  document.getElementById('mc-pw1').value='';document.getElementById('mc-pw2').value='';
  suc.textContent='Mot de passe mis à jour avec succès.';suc.style.display='block';
  setTimeout(function(){suc.style.display='none';},4000);
}

// ── Utilisateurs ──────────────────────────────────────────────────────────────

// Conservé pour compatibilité window — no-op depuis 1.9.5
export function _renderUfLaboIdsOnChange() {}

export async function loadUsersAndRender(){var q=state.sb.from('profiles').select('*,lab:labo_id(name),memberships:user_lab_memberships(labo_id,lab_role,lab:labo_id(name))');if(!estGrappe())q=q.eq('labo_id',state.activeLaboId);var r=await q.order('nom');if(!r.error)state.utilisateurs=r.data||[];renderUT();}
export function renderUT(){
  document.getElementById('ultitle').textContent=estGrappe()?'Tous les utilisateurs':'Utilisateurs — '+(state.currentUser.lab?state.currentUser.lab.name:'');
  document.getElementById('utbody').innerHTML=state.utilisateurs.map(function(u){
    var me=u.id===state.currentUser.id,tia=u.role==='admin',ca=estAdmin()||(estSuperviseur()&&!me&&!tia&&(estGrappe()||u.role!=='superviseur_grappe'));
    var mems=u.memberships||[];
    var labCell=mems.length
      ?'<div style="display:flex;flex-direction:column;gap:4px">'+mems.map(function(m){
          var isR=m.lab_role==='responsable';
          return '<div style="display:flex;align-items:center;gap:5px;min-width:0">'
            +'<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:'+(isR?'var(--brand-azure-ink)':'var(--b4,var(--b3))')+'"></span>'
            +'<span style="font-size:12px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escapeHtml(m.lab?m.lab.name:'—')+'</span>'
            +(isR?'<span style="font-size:9px;font-weight:600;background:var(--brand-azure-soft);color:var(--brand-azure-ink);padding:1px 5px;border-radius:99px;flex-shrink:0;margin-left:2px">Resp.</span>':'')
            +'</div>';
        }).join('')+'</div>'
      :(u.lab?escapeHtml(u.lab.name):'—');
    var pw=u.must_change_password?'<span style="color:var(--tw);font-size:12px">⚠</span>':'<span style="color:var(--ts);font-size:12px">✓</span>';
    var nameCell=escapeHtml(u.nom)+(me?' <span style="font-size:10px;color:var(--t3)">(moi)</span>':'')+(u.is_test?' <span class="badge" style="background:var(--warning-soft);color:var(--warning);font-size:9px">Test</span>':'');
    var auditCreated=u.created_by?('<div style="font-size:10px;color:var(--t2)">'+escapeHtml(u.created_by)+'</div><div style="font-size:10px;color:var(--t3)">'+formatDateTime(u.created_at)+'</div>'):'<span style="font-size:10px;color:var(--t3)">—</span>';
    var auditUpdated=u.updated_by?('<div style="font-size:10px;color:var(--t2);margin-top:4px">'+escapeHtml(u.updated_by)+'</div><div style="font-size:10px;color:var(--t3)">'+formatDateTime(u.updated_at)+'</div>'):'';
    return'<tr class="'+(u.active?'':'drow')+'">'
      +'<td style="font-family:var(--fm);font-size:11px">'+escapeHtml(u.employee_id)+'</td>'
      +'<td>'+nameCell+'</td>'+'<td style="font-size:12px;line-height:1.6">'+labCell+'</td>'
      +'<td><span class="badge '+classeBadgeRole(u.role)+'">'+libelleRole(u.role)+'</span></td>'
      +'<td><span class="badge '+(u.active?'bact':'bina')+'">'+(u.active?'Actif':'Inactif')+'</span></td>'
      +'<td style="text-align:center">'+pw+'</td>'
      +'<td style="line-height:1.3">'+auditCreated+auditUpdated+'</td>'
      +'<td style="overflow:visible;white-space:nowrap">'+(ca?(u.active?'<button class="bsm bsmi" onclick="openEditU(\''+u.id+'\')" style="margin-right:4px">Modifier</button>':'')+(me?'':('<button class="bsm '+(u.active?'bsmd':'')+'" onclick="togU(\''+u.id+'\','+(!u.active)+')">'+(u.active?'Désactiver':'Activer')+'</button>')):'<span style="color:var(--t3);font-size:11px">—</span>')+'</td>'
      +'</tr>';
  }).join('');
}

var _ufMemberships = [];

function _renderUfMemberships(currentMemberships) {
  _ufMemberships = (currentMemberships || []).map(function(m) {
    return { labo_id: m.labo_id, lab_role: m.lab_role };
  });
  _renderUfMembershipsUI();
}

function _renderUfMembershipsUI() {
  var wrap = document.getElementById('uf-memberships-wrap'); if (!wrap) return;
  var labsById = {};
  state.laboratoires.forEach(function(l) { labsById[l.id] = l; });
  var usedIds = _ufMemberships.map(function(m) { return m.labo_id; });
  var available = state.laboratoires.filter(function(l) { return usedIds.indexOf(l.id) === -1; });

  var html = '<div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Accès aux laboratoires</div>';

  if (_ufMemberships.length) {
    html += '<div style="border:1px solid var(--b3);border-radius:6px;overflow:hidden;margin-bottom:10px">';
    _ufMemberships.forEach(function(m, i) {
      var lab = labsById[m.labo_id] || { name: '—' };
      html += '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;'+(i?'border-top:1px solid var(--b3)':'')+'">'
        + '<span style="flex:1;font-size:13px">'+escapeHtml(lab.name)+'</span>'
        + '<select class="uf-mem-role" data-labo="'+escapeHtml(m.labo_id)+'" style="font-size:12px;width:130px">'
        + '<option value="technicien"'+(m.lab_role==='technicien'?' selected':'')+'>Technicien</option>'
        + '<option value="responsable"'+(m.lab_role==='responsable'?' selected':'')+'>Responsable</option>'
        + '</select>'
        + '<button type="button" onclick="removeUfMembership(\''+escapeHtml(m.labo_id)+'\')" '
        + 'style="background:none;border:none;cursor:pointer;color:var(--te);font-size:18px;padding:0 4px;line-height:1;flex-shrink:0" title="Retirer">&#215;</button>'
        + '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="color:var(--t3);font-size:12px;padding:6px 0;margin-bottom:10px;font-style:italic">Aucun laboratoire assigné.</div>';
  }

  if (available.length) {
    html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
      + '<select id="uf-add-labo" style="flex:1;min-width:160px;font-size:12px">'
      + available.map(function(l) { return '<option value="'+escapeHtml(l.id)+'">'+escapeHtml(l.name)+'</option>'; }).join('')
      + '</select>'
      + '<select id="uf-add-role" style="font-size:12px;width:130px">'
      + '<option value="technicien">Technicien</option><option value="responsable">Responsable</option>'
      + '</select>'
      + '<button type="button" class="bsm bsmi" onclick="addUfMembership()">+ Ajouter</button>'
      + '</div>';
  } else if (_ufMemberships.length) {
    html += '<div style="color:var(--t3);font-size:12px;font-style:italic">Tous les laboratoires sont assignés.</div>';
  }

  wrap.innerHTML = html;
}

function _getUfMemberships() {
  // Relire les rôles depuis le DOM (l'utilisateur peut les avoir modifiés)
  document.querySelectorAll('.uf-mem-role').forEach(function(sel) {
    var mem = _ufMemberships.find(function(m) { return m.labo_id === sel.dataset.labo; });
    if (mem) mem.lab_role = sel.value;
  });
  return _ufMemberships.slice();
}

export function addUfMembership() {
  var laboSel = document.getElementById('uf-add-labo');
  var roleSel = document.getElementById('uf-add-role');
  if (!laboSel || !laboSel.value) return;
  _ufMemberships.push({ labo_id: laboSel.value, lab_role: roleSel ? roleSel.value : 'technicien' });
  _renderUfMembershipsUI();
}

export function removeUfMembership(laboId) {
  _ufMemberships = _ufMemberships.filter(function(m) { return m.labo_id !== laboId; });
  _renderUfMembershipsUI();
}

export function openAddU(){
  state.elementFocus=null;document.getElementById('uftitle').textContent='Ajouter un utilisateur';document.getElementById('ufsave').textContent='Ajouter';
  document.getElementById('ufid').value='';document.getElementById('ufid').readOnly=false;document.getElementById('ufnom').value='';document.getElementById('ufpw').value='';
  _renderUfMemberships([]);
  var rs=document.getElementById('ufrole');rs.innerHTML='<option value="technicien">Technicien</option><option value="superviseur_labo">Superviseur Labo</option>'+(estGrappe()?'<option value="superviseur_grappe">Superviseur Grappe</option>':'')+(estAdmin()?'<option value="admin">Administrateur</option>':'');rs.value='technicien';
  document.getElementById('ufag').classList.add('gone');
  var ufTest=document.getElementById('uf-is-test');if(ufTest)ufTest.checked=false;
  var ufTestWrap=document.getElementById('uf-test-wrap');if(ufTestWrap)ufTestWrap.classList.toggle('gone',!estAdmin());
  var ufAudit=document.getElementById('uf-audit-info');if(ufAudit)ufAudit.classList.add('gone');
  document.getElementById('uform').classList.add('show');
}
export function openEditU(id){
  var u=state.utilisateurs.find(function(x){return x.id===id;});if(!u)return;
  if(u.role==='admin'&&!estAdmin()){notifier('uerr','Les comptes administrateur ne peuvent être modifiés que par un administrateur.','e');return;}
  state.elementFocus=id;document.getElementById('uftitle').textContent='Modifier — '+u.nom;document.getElementById('ufsave').textContent='Enregistrer';
  document.getElementById('ufid').value=u.employee_id;document.getElementById('ufid').readOnly=true;document.getElementById('ufnom').value=u.nom;document.getElementById('ufpw').value='';
  _renderUfMemberships(u.memberships||[]);
  var rs=document.getElementById('ufrole');rs.innerHTML='<option value="technicien">Technicien</option><option value="superviseur_labo">Superviseur Labo</option>'+(estGrappe()?'<option value="superviseur_grappe">Superviseur Grappe</option>':'')+(estAdmin()?'<option value="admin">Administrateur</option>':'');rs.value=u.role;
  document.getElementById('ufag').classList.remove('gone');document.getElementById('ufact').value=String(u.active);
  var ufTest=document.getElementById('uf-is-test');if(ufTest)ufTest.checked=!!u.is_test;
  var ufTestWrap=document.getElementById('uf-test-wrap');if(ufTestWrap)ufTestWrap.classList.toggle('gone',!estAdmin());
  var ufAudit=document.getElementById('uf-audit-info');
  if(ufAudit){var lines=[];if(u.created_by||u.created_at)lines.push('<span style="font-size:11px;color:var(--t3)">Créé par '+escapeHtml(u.created_by||'?')+' le '+formatDateTime(u.created_at)+'</span>');if(u.updated_by||u.updated_at)lines.push('<span style="font-size:11px;color:var(--t3)">Modifié par '+escapeHtml(u.updated_by||'?')+' le '+formatDateTime(u.updated_at)+'</span>');if(lines.length){ufAudit.innerHTML=lines.join('<br>');ufAudit.classList.remove('gone');}else ufAudit.classList.add('gone');}
  document.getElementById('uform').classList.add('show');
}
export function cancelUF(){document.getElementById('uform').classList.remove('show');state.elementFocus=null;}
export async function callEdge(action,payload){try{var ses=(await state.sb.auth.getSession()).data.session;var r=await fetch(window.EDGE_URL+'/manage-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ses.access_token},body:JSON.stringify({action:action,payload:payload})});return await r.json();}catch(err){return{error:err.message};}}

async function _saveMemberships(profileId, memberships) {
  // Supprimer les memberships non sélectionnés
  var laboIds=memberships.map(function(m){return m.labo_id;});
  await state.sb.from('user_lab_memberships').delete().eq('profile_id',profileId).not('labo_id','in','('+laboIds.join(',')+')');
  if(!memberships.length)return true;
  var rows=memberships.map(function(m){return{profile_id:profileId,labo_id:m.labo_id,lab_role:m.lab_role};});
  var r=await sbCall(state.sb.from('user_lab_memberships').upsert(rows,{onConflict:'profile_id,labo_id'}),'uerr');
  return!r.error;
}

export async function saveUser(){
  var id=document.getElementById('ufid').value.trim(),nom=document.getElementById('ufnom').value.trim(),role=document.getElementById('ufrole').value,pw=document.getElementById('ufpw').value;
  var isTest=estAdmin()&&!!(document.getElementById('uf-is-test')||{}).checked;
  var memberships=_getUfMemberships();
  var laboIds=memberships.map(function(m){return m.labo_id;});
  var laboId=laboIds[0]||'';  // labo principal = premier membership
  if(!id||!nom||!laboIds.length){notifier('uerr','Veuillez remplir le N° employé, le nom et assigner au moins un laboratoire.','e');return;}
  var now=new Date().toISOString();
  if(state.elementFocus){
    var upd={nom:nom,labo_id:laboId,labo_ids:laboIds,role:role,active:document.getElementById('ufact').value==='true',is_test:isTest,updated_by:state.currentUser.nom,updated_at:now};
    var r=await sbCall(state.sb.from('profiles').update(upd).eq('id',state.elementFocus),'uerr');if(r.error)return;
    if(!await _saveMemberships(state.elementFocus,memberships))return;
    if(pw){var u=state.utilisateurs.find(function(x){return x.id===state.elementFocus;})||{};if(!u.is_test&&!isTest&&pw.length<8){notifier('uerr','Le mot de passe doit contenir au moins 8 caractères.','e');return;}var res=await callEdge('reset_password',{profile_id:state.elementFocus,new_password:pw});if(!res.success){notifier('uerr','Profil mis à jour. Erreur MDP : '+(res.error||''),'e');return;}}
    if(state.elementFocus===state.currentUser.id){
      state.currentUser.nom=nom;state.currentUser.labo_id=laboId;state.currentUser.labo_ids=laboIds;state.currentUser.role=role;state.currentUser.is_test=isTest;
      state.currentUser.labMemberships=memberships;
      state.currentUser.labs=laboIds.map(function(lid){return state.laboratoires.find(function(l){return l.id===lid;})||{id:lid,name:'—'};});
      state.activeLabo=state.currentUser.labs[0]||{id:laboId,name:''};
      document.getElementById('uname').textContent=nom;document.getElementById('ulabo').textContent=state.activeLabo.name+' · '+libelleRole(role);document.getElementById('lexp').value=state.activeLabo.name;
      if(window.initLabSwitch)window.initLabSwitch(state.currentUser.labs);
    }
    notifier('usuc','Utilisateur '+nom+' modifié.'+(pw?' Nouveau MDP enregistré.':''),'s');
  }else{
    if(!pw){notifier('uerr','Veuillez définir un mot de passe temporaire.','e');return;}
    if(!isTest&&pw.length<8){notifier('uerr','Le mot de passe doit contenir au moins 8 caractères.','e');return;}
    var res2=await callEdge('create',{employee_id:id,password:pw,nom:nom,labo_id:laboId,labo_ids:laboIds,role:role});
    if(!res2.success){notifier('uerr','Erreur : '+(res2.error||'Impossible de créer l\'utilisateur.'),'e');return;}
    // Récupérer l'UUID du profil créé pour insérer les memberships
    var rp=await state.sb.from('profiles').select('id').eq('employee_id',id).single();
    if(!rp.error&&rp.data){await _saveMemberships(rp.data.id,memberships);}
    await state.sb.from('profiles').update({is_test:isTest,created_by:state.currentUser.nom,created_at:now,updated_by:state.currentUser.nom,updated_at:now}).eq('employee_id',id);
    notifier('usuc','Utilisateur '+nom+' créé. Changement MDP requis.','s');
  }
  cancelUF();await loadUsersAndRender();
}
export async function togU(id,active){
  var u=state.utilisateurs.find(function(x){return x.id===id;});
  if(u&&u.role==='admin'&&!estAdmin()){notifier('uerr','Les comptes administrateur ne peuvent être modifiés que par un administrateur.','e');return;}
  var res=await callEdge('toggle_active',{profile_id:id,active:active});
  if(res.success){var u=state.utilisateurs.find(function(x){return x.id===id;});if(u){u.active=active;}notifier('usuc',(u?u.nom:'Utilisateur')+(active?' réactivé.':' désactivé.'),'s');renderUT();}
  else notifier('uerr','Erreur : '+(res.error||''),'e');
}

// ── Temps réel ────────────────────────────────────────────────────────────────
export function subscribeRT(){
  if(state.canalRealtime){state.sb.removeChannel(state.canalRealtime);state.canalRealtime=null;}
  state.canalRealtime=state.sb.channel('envois-rt')
    .on('postgres_changes',{event:'*',schema:'public',table:'envois'},async function(){
      state.cacheModals={};await loadEnvois();var a=document.querySelector('.panel.active');if(!a)return;
      if(a.id==='panel-historique'){loadHistStats();loadHistPage(_histPage);}
      if(a.id==='panel-resume')renderResume();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'envois_hgrappe'},async function(){
      state.hgCacheModals={};await window.loadEnvoisHG();var a=document.querySelector('.panel.active');if(!a)return;
      if(a.id==='panel-hg-confirmations')window.renderHGConfirmations();
      if(a.id==='panel-hg-historique')window.renderHGHistorique();
      if(a.id==='panel-hg-resume')window.renderHGResume();
    })
    .subscribe();
}

// ── Recherche globale ─────────────────────────────────────────────────────────
export function renderRecherche(){var el=document.getElementById('rch-input');if(el){el.focus();el.select();}}
export function onRechercheInput(){
  clearTimeout(_rchTimer);var q=(document.getElementById('rch-input').value||'').trim();var msgEl=document.getElementById('rch-msg');
  if(q.length===0){msgEl.textContent='';document.getElementById('rch-results').innerHTML='';return;}
  if(q.length<3){msgEl.textContent='Entrez au moins 3 caractères.';return;}
  _rchTimer=setTimeout(doRecherche,500);
}
export async function doRecherche(){
  var q=(document.getElementById('rch-input').value||'').trim();var msgEl=document.getElementById('rch-msg');var resEl=document.getElementById('rch-results');
  if(q.length<3){msgEl.textContent='Entrez au moins 3 caractères.';resEl.innerHTML='';return;}
  msgEl.innerHTML='<span style="color:var(--t2)">Recherche en cours…</span>';resEl.innerHTML='';
  var pat='%'+q+'%';
  var _hgSel='*,exp_lab:exp_labo_id(name,adresse,ville,code_postal,telephone,fax_bio_hema,fax_micro,fax_patho,fax_general),dest_lab:dest_ext_lab_id(id,name,parent_id,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text,parent:parent_id(id,name,adresse,adresse2,ville,code_postal,province,pays,telephone,label_text))';
  var _inSel='*,exp_lab:exp_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone),dest_lab:dest_labo_id(name,adresse,adresse2,ville,province,code_postal,pays,telephone)';
  var qi=state.sb.from('envois').select(_inSel).ilike('numero',pat).limit(5);
  var qis=state.sb.from('envois').select(_inSel).contains('numeros_silp',[q]).limit(5);
  var qg=state.sb.from('envois_hgrappe').select(_hgSel).ilike('numero',pat).limit(5);
  var qgs=state.sb.from('envois_hgrappe').select(_hgSel).contains('numeros_silp',[q]).limit(5);
  var qbd=state.sb.from('bons_depart').select('id,numero,statut,labo_id,cree_par_nom,created_at,labo:labo_id(name)').ilike('numero',pat).limit(5);
  var results=await Promise.all([qi,qis,qg,qgs,qbd]);
  var ri=results[0],ris=results[1],rg=results[2],rgs=results[3],rbd=results[4];
  var intraMap={};(ri.error?[]:ri.data||[]).forEach(function(r){intraMap[r.id]=r;});
  (ris.error?[]:ris.data||[]).forEach(function(r){intraMap[r.id]=r;});
  var intra=Object.values(intraMap);
  var hgMap={};(rg.error?[]:rg.data||[]).forEach(function(r){hgMap[r.id]=r;});
  (rgs.error?[]:rgs.data||[]).forEach(function(r){hgMap[r.id]=r;});
  var hg=Object.values(hgMap);
  var bd=rbd.error?[]:rbd.data||[];
  var total=intra.length+hg.length+bd.length;
  if(total===0){msgEl.textContent='Aucun résultat pour « '+q+' ».';return;}
  var capped=intra.length>=5||hg.length>=5||bd.length===5;var capMsg=capped?' <span style="color:var(--te);font-size:11px">— limité à 5 par catégorie, affinez la recherche</span>':'';
  msgEl.innerHTML=total+' résultat'+(total>1?'s':'')+capMsg;
  intra.forEach(function(row){state.cacheModals[row.id]=_mapEnvoi(row);});
  hg.forEach(function(row){state.hgCacheModals[row.id]=window._mapEnvoiHG(row);});
  bd.forEach(function(row){_bdCache[row.id]=row;});
  var rows=[];
  var myIds=state.currentUser.labo_ids&&state.currentUser.labo_ids.length?state.currentUser.labo_ids:[state.currentUser.labo_id];
  intra.forEach(function(row){var e=state.cacheModals[row.id];var restricted=!estGrappe()&&!estAdmin()&&myIds.indexOf(e.expId)===-1&&myIds.indexOf(e.destId)===-1;var dispNum=e.numerosSilp&&e.numerosSilp.length?e.numerosSilp[0]+(e.numerosSilp.length>1?' +'+( e.numerosSilp.length-1):''):e.numero;rows.push({type:'intra',id:row.id,numero:dispNum,exp:e.exp,dest:e.dest,statut:e.statut,ts:e.tsEnvoi,restricted:restricted,annule:!!e.annuleAt});});
  hg.forEach(function(row){var e=state.hgCacheModals[row.id];var restricted=!estGrappe()&&!estAdmin()&&myIds.indexOf(e.expId)===-1;rows.push({type:'hg',id:row.id,numero:e.numero,exp:e.exp,dest:e.dest,statut:e.statut,ts:e.tsEnvoi,restricted:restricted});});
  bd.forEach(function(row){var restricted=!estGrappe()&&!estAdmin()&&myIds.indexOf(row.labo_id)===-1;rows.push({type:'bd',id:row.id,numero:row.numero,exp:(row.labo&&row.labo.name)||'—',dest:'—',statut:row.statut,ts:row.created_at,restricted:restricted});});
  rows.sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
  var ths='<th style="text-align:left;padding:6px 10px;font-size:10px;font-weight:700;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid var(--border-default);background:var(--bg2);width:70px">Type</th><th style="text-align:left;padding:6px 10px;font-size:10px;font-weight:700;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid var(--border-default);background:var(--bg2);width:160px">N° / Référence</th><th style="text-align:left;padding:6px 10px;font-size:10px;font-weight:700;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid var(--border-default);background:var(--bg2)">Expéditeur / Labo</th><th style="text-align:left;padding:6px 10px;font-size:10px;font-weight:700;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid var(--border-default);background:var(--bg2)">Destinataire</th><th style="text-align:left;padding:6px 10px;font-size:10px;font-weight:700;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid var(--border-default);background:var(--bg2);width:100px">Statut</th><th style="text-align:left;padding:6px 10px;font-size:10px;font-weight:700;color:var(--fg-subtle);text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid var(--border-default);background:var(--bg2);width:130px">Date</th>';
  var trs=rows.map(function(r){
    var badgeCls=r.type==='intra'?classeBadge(r.statut):r.type==='hg'?window.classeBadgeHG(r.statut):(r.statut==='actif'?'bt':r.statut==='récupéré'?'br':'bperdu');
    var typeLabel=r.type==='intra'?'Intra':r.type==='hg'?'HG':'Bon dép.';
    var typeBadge=r.annule?'<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:10px">🚫 '+typeLabel+'</span>':r.restricted?'<span class="badge" style="background:var(--b3);color:var(--t3);font-size:10px">🔒 '+typeLabel+'</span>':'<span class="badge" style="background:var(--b3);color:var(--ti);font-size:10px">'+typeLabel+'</span>';
    var rowStyle=r.restricted?'opacity:.75':'';var onclick="showRchDetail('"+r.id+"','"+r.type+"')";
    var tds='<td style="padding:7px 10px;border-bottom:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">'+typeBadge+'</td>'
      +'<td style="padding:7px 10px;border-bottom:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--fm);font-size:11px;color:var(--ti)">'+escapeHtml(r.numero)+'</td>'
      +'<td style="padding:7px 10px;border-bottom:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(r.exp)+'</td>'
      +'<td style="padding:7px 10px;border-bottom:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(r.dest)+'</td>'
      +'<td style="padding:7px 10px;border-bottom:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="badge '+badgeCls+'">'+escapeHtml(r.statut)+'</span></td>'
      +'<td style="padding:7px 10px;border-bottom:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--t2)">'+formatDateTime(r.ts)+'</td>';
    return'<tr class="rch-row" style="'+rowStyle+'" onclick="'+onclick+'">'+tds+'</tr>';
  }).join('');
  resEl.innerHTML='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'+ths+'</tr></thead><tbody>'+trs+'</tbody></table></div>';
}

// ── Annulation logique d'un envoi ─────────────────────────────────────────────

var _annulEnvoiId=null;

export function openAnnulationEnvoi(){
  var e=state.envois.find(function(x){return x.id===state.editEnvoiId;})||state.cacheModals[state.editEnvoiId];
  if(!e)return;
  _annulEnvoiId=state.editEnvoiId;
  document.getElementById('annul-nlist-ro').textContent=e.numerosSilp&&e.numerosSilp.length?e.numerosSilp.join(' · '):e.numero;
  var errEl=document.getElementById('annul-err');if(errEl){errEl.style.display='none';errEl.textContent='';}
  document.getElementById('annul-note').value='';
  document.getElementById('annul-envoi-modal').style.display='flex';
}
export function closeAnnulationEnvoi(){
  document.getElementById('annul-envoi-modal').style.display='none';
  _annulEnvoiId=null;
}
export async function saveAnnulationEnvoi(){
  var note=(document.getElementById('annul-note').value||'').trim();
  var errEl=document.getElementById('annul-err');
  if(!note){if(errEl){errEl.textContent='Le motif est obligatoire.';errEl.style.display='';}return;}
  var r=await sbCall(state.sb.rpc('annuler_envoi',{p_envoi_id:_annulEnvoiId,p_note:note}),'annul-err');
  if(r.error)return;
  closeAnnulationEnvoi();closeEditEnvoi();
  notifier('_ann','Envoi annulé.','s');
  await loadEnvois();
  if(typeof window.renderResume==='function')window.renderResume();
}
export function showRchDetail(id,type){
  var e=type==='intra'?state.cacheModals[id]:type==='hg'?state.hgCacheModals[id]:_bdCache[id];if(!e)return;
  var myIds=state.currentUser.labo_ids&&state.currentUser.labo_ids.length?state.currentUser.labo_ids:[state.currentUser.labo_id];
  var hasAccess=type==='intra'?estGrappe()||estAdmin()||myIds.indexOf(e.expId)!==-1||myIds.indexOf(e.destId)!==-1:type==='hg'?estGrappe()||estAdmin()||myIds.indexOf(e.expId)!==-1:estGrappe()||estAdmin()||myIds.indexOf(e.labo_id)!==-1;
  if(hasAccess){
    if(type==='intra'){showGMod(id);}
    else if(type==='hg'){window.showHGDetail(id);}
    else{if(window.showPanel)window.showPanel('bons-depart');if(window.showBDDetail)window.showBDDetail(id);}
    return;
  }
  var isBd=type==='bd';
  var numLabel=isBd?'N° bon':type==='intra'?'N° liste':'N° envoi';
  var badgeCls=type==='intra'?classeBadge(e.statut):type==='hg'?window.classeBadgeHG(e.statut):(e.statut==='actif'?'bt':e.statut==='récupéré'?'br':'bperdu');
  var body='<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:1rem;font-size:12px;color:#92400e">⚠️ Ce document n\'appartient pas à votre laboratoire. Accès limité aux informations de base.</div>'
    +'<div class="df"><span>'+numLabel+'</span><span style="font-family:var(--fm)">'+escapeHtml(e.numero)+'</span></div>'
    +'<div class="df"><span>Statut</span><span><span class="badge '+badgeCls+'">'+escapeHtml(e.statut)+'</span></span></div>'
    +separateurModal(isBd?'Laboratoire':'Parties')
    +(isBd?'<div class="df"><span>Laboratoire</span><span>'+escapeHtml((e.labo&&e.labo.name)||'—')+'</span></div>':'<div class="df"><span>Expéditeur</span><span>'+escapeHtml(e.exp)+'</span></div><div class="df"><span>Destinataire</span><span>'+escapeHtml(e.dest)+'</span></div>')
    +'<div class="df"><span>'+(isBd?'Créé le':'Envoyé le')+'</span><span>'+formatDateTime(isBd?e.created_at:e.tsEnvoi)+'</span></div>';
  var gmb=document.getElementById('gmod-body'),gf=document.getElementById('gmod-footer'),gmod=document.getElementById('gmod');
  if(gmb)gmb.innerHTML=body;if(gf)gf.innerHTML='';if(gmod)gmod.classList.add('show');
}
