// ── LABS.JS ───────────────────────────────────────────────────────────────────
// Laboratoires intra-grappe : chargement, sélecteurs, températures,
// départements, configuration panel.
//
// Dépendances :
//   state.js  — sb, currentUser, laboratoires, termeRecherche, departementsActifs, typeSpecimen, refrigerantChoisi
//   utils.js  — escapeHtml, formaterCP, formaterTel, classesPills, departements
//   ui.js     — notifier, confirm2
//
// Appels vers window.* (pas encore extraits) :
//   window.CFG, window.closeCfgAddModal
// ─────────────────────────────────────────────────────────────────────────────

import { state, sbCall } from './state.js';
import { escapeHtml, formaterCP, formaterTel, classesPills, departements } from './utils.js';
import { notifier, confirm2 } from './ui.js';

// ── Chargement ────────────────────────────────────────────────────────────────

export async function loadLabs() {
  try {
    var r = await state.sb.from('laboratories')
      .select('id,name,grappe_id,adresse,adresse2,ville,province,code_postal,pays,telephone,default_refrigerant,fax_bio_hema,fax_micro,fax_patho,fax_general')
      .eq('active', true).order('name');
    if (!r.error) state.laboratoires = r.data || [];
  } catch(e) {}
}

// ── Formatage adresse labo ────────────────────────────────────────────────────

export function formaterAdresseLabo(lab) {
  if (!lab) return '';
  var parts = [];
  if (lab.adresse) parts.push(lab.adresse);
  if (lab.ville || lab.code_postal) parts.push([lab.ville, lab.code_postal].filter(Boolean).join(' '));
  if (lab.telephone) parts.push(lab.telephone);
  return parts.join(' · ');
}

// ── Sélecteur destinataire (ldest) ────────────────────────────────────────────

export function buildLdestOpts() {
  var opts = document.getElementById('ldest-opts'); opts.innerHTML = '';
  state.laboratoires.forEach(function(l) {
    if (state.activeLaboId && l.id === state.activeLaboId) return;
    var el = document.createElement('div'); el.className = 'sel-opt';
    el.textContent = l.name; el.setAttribute('data-id', l.id);
    el.onmousedown = function(e) { e.preventDefault(); pickLdest(l.id, l.name); };
    opts.appendChild(el);
  });
}

export function filterLdest() {
  var q = document.getElementById('ldest-input').value.toLowerCase();
  document.getElementById('ldest').value = '';
  document.querySelectorAll('#ldest-opts .sel-opt').forEach(function(el) {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  openLdestDrop();
}

export function openLdestDrop()  { document.getElementById('ldest-opts').classList.add('open'); }
export function closeLdestDrop() { document.getElementById('ldest-opts').classList.remove('open'); }

export function pickLdest(id, name) {
  document.getElementById('ldest').value       = id;
  document.getElementById('ldest-input').value = name;
  closeLdestDrop();
  updateDestAddr(id);
}

export function ldestKeyNav(e) {
  var opts = document.getElementById('ldest-opts');
  if (e.key === 'Escape') { closeLdestDrop(); return; }
  var visible = Array.from(opts.querySelectorAll('.sel-opt')).filter(function(el) { return el.style.display !== 'none'; });
  if (!visible.length) return;
  var cur = opts.querySelector('.sel-opt.kfocus');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var next = cur ? visible[visible.indexOf(cur) + 1] || visible[0] : visible[0];
    if (cur) cur.classList.remove('kfocus'); next.classList.add('kfocus'); next.scrollIntoView({ block: 'nearest' }); openLdestDrop();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prev = cur ? visible[visible.indexOf(cur) - 1] || visible[visible.length - 1] : visible[visible.length - 1];
    if (cur) cur.classList.remove('kfocus'); prev.classList.add('kfocus'); prev.scrollIntoView({ block: 'nearest' }); openLdestDrop();
  } else if (e.key === 'Enter' && cur) {
    e.preventDefault(); pickLdest(cur.getAttribute('data-id'), cur.textContent); cur.classList.remove('kfocus');
  }
}

// ── Adresses expéditeur / destinataire ────────────────────────────────────────

export function updateExpAddr() {
  var el = document.getElementById('lexp-addr'); if (!el) return;
  var expLab = state.laboratoires.find(function(l) { return l.id === state.activeLaboId; }) || {};
  el.textContent = formaterAdresseLabo(expLab);
}

export function updateDestAddr(labId) {
  var el = document.getElementById('ldest-addr'); if (!el) return;
  if (!labId) { el.textContent = ''; return; }
  var lab = state.laboratoires.find(function(l) { return l.id === labId; }) || {};
  el.textContent = formaterAdresseLabo(lab);
}

// ── Sélecteurs du formulaire d'envoi ─────────────────────────────────────────

export function populateSels() {
  buildLdestOpts();
  var ts = document.getElementById('trans'), ft2 = document.getElementById('ftrans');
  ts.innerHTML = '<option value="">— Sélectionner —</option>';
  ft2.innerHTML = '<option value="">Tous</option>';
  window.CFG.transporters.forEach(function(t) {
    var o = document.createElement('option'); o.textContent = t; ts.appendChild(o);
    var o2 = document.createElement('option'); o2.value = t; o2.textContent = t; ft2.appendChild(o2);
  });
  var rs = document.getElementById('rls'); rs.innerHTML = '';
  if (window.estGrappe()) {
    rs.classList.remove('gone');
    state.laboratoires.forEach(function(l) { var o = document.createElement('option'); o.value = l.id; o.textContent = l.name; rs.appendChild(o); });
    if (state.activeLaboId) rs.value = state.activeLaboId;
  } else { rs.classList.add('gone'); }
  var ul = document.getElementById('uflabo');
  if (ul) {
    ul.innerHTML = '<option value="">— Sélectionner —</option>';
    var uflabos = window.estGrappe() ? state.laboratoires
      : state.laboratoires.filter(function(l) {
          var ids = state.currentUser.labo_ids && state.currentUser.labo_ids.length ? state.currentUser.labo_ids : (state.currentUser.labo_id ? [state.currentUser.labo_id] : []);
          return ids.indexOf(l.id) !== -1;
        });
    uflabos.forEach(function(l) { var o = document.createElement('option'); o.value = l.id; o.textContent = l.name; ul.appendChild(o); });
  }
  var tspec = document.getElementById('tspec');
  if (tspec) {
    var prev = tspec.value; tspec.innerHTML = '';
    window.CFG.bordereau.specTypes.forEach(function(st) { var o = document.createElement('option'); o.value = st.id; o.textContent = st.label; tspec.appendChild(o); });
    if (prev && tspec.querySelector('option[value="' + prev + '"]')) tspec.value = prev;
    state.typeSpecimen = tspec.value;
  }
  renderTempPills();
  updateTransporteurVisibility();
}

export function updateTransporteurVisibility() {
  var bdOn = window.isBDEnabled && window.isBDEnabled();
  var row = document.getElementById('trans-row');
  if (row) row.style.display = bdOn ? 'none' : '';
}

// ── Sélection température ─────────────────────────────────────────────────────

export function renderTempPills() {
  var c = document.getElementById('tpills-c'); c.innerHTML = '';
  window.CFG.temperatures.forEach(function(t, i) {
    var cls = classesPills[i % classesPills.length];
    var el = document.createElement('div'); el.className = 'tpill';
    el.textContent = t.icon + ' ' + t.label; el.setAttribute('data-t', t.label);
    el.onclick = (function(lbl, pc) { return function() { selectionnerTemp(lbl, pc); }; })(t.label, cls);
    c.appendChild(el);
  });
  state.termeRecherche = '';
}

export function selectionnerTemp(lbl, pc) {
  state.termeRecherche = lbl; state.refrigerantChoisi = false;
  document.querySelectorAll('.tpill').forEach(function(el) {
    el.className = 'tpill'; if (el.getAttribute('data-t') === lbl) el.classList.add(pc);
  });
  var tCfg = window.CFG.temperatures.find(function(t) { return t.label === lbl; });
  var gs = document.getElementById('glace-section');
  if (gs) {
    if (tCfg && tCfg.ask_glace) {
      gs.style.display = '';
      var expLab = state.currentUser && state.laboratoires.find(function(l) { return l.id === state.activeLaboId; });
      var defRef = expLab && expLab.default_refrigerant;
      if (defRef === 'glace_seche')     { state.refrigerantChoisi = true;  setGlace(true);  }
      else if (defRef === 'sachet')     { state.refrigerantChoisi = false; setGlace(false); }
      else                              { state.refrigerantChoisi = null; }
    } else { gs.style.display = 'none'; state.refrigerantChoisi = false; }
  }
}

export function setGlace(val) {
  state.refrigerantChoisi = val;
  var btnO = document.getElementById('btn-glace-oui'), btnN = document.getElementById('btn-glace-non');
  if (btnO) btnO.style.outline = val ? '2px solid var(--brand-azure-deep)' : '';
  if (btnN) btnN.style.outline = val ? '' : '2px solid var(--brand-azure-deep)';
}

// ── Sélection départements ────────────────────────────────────────────────────

export function toggleDept(d) {
  var ix = state.departementsActifs.indexOf(d);
  if (ix === -1) state.departementsActifs.push(d); else state.departementsActifs.splice(ix, 1);
  var cm = { BIOCHIMIE: 'dp-bio', HEMATOLOGIE: 'dp-hema', MICROBIOLOGIE: 'dp-micro', PATHOLOGIE: 'dp-patho' };
  departements.forEach(function(x) {
    var el = document.getElementById('dp-' + x.id);
    el.className = 'dpill ' + cm[x.id] + (state.departementsActifs.indexOf(x.id) !== -1 ? ' on' : '');
  });
}

// ── Config panel — liste des labos ────────────────────────────────────────────

export function renderCfgLabs() {
  document.getElementById('labs-count').textContent = '(' + state.laboratoires.length + ')';
  document.getElementById('labs-list').innerHTML = state.laboratoires.map(function(l) {
    var addrParts = [l.adresse, l.adresse2, l.ville && ([l.ville, l.province, l.code_postal].filter(Boolean).join(' ')), l.pays].filter(Boolean);
    var addrSummary = addrParts.length ? addrParts.join(', ') : '<em style="color:var(--t3)">Adresse non renseignée</em>';
    var bdOn = (window.CFG && window.CFG.bonsDepartEnabledLabs || []).indexOf(l.id) !== -1;
    var hgOn = (state.CFG && state.CFG.hgrappeEnabledLabs || []).indexOf(l.id) !== -1;
    var tags = (bdOn ? '<span style="font-size:10px;background:var(--brand-azure-soft);color:var(--brand-azure-ink);padding:1px 6px;border-radius:99px;margin-right:4px">BD</span>' : '')
             + (hgOn ? '<span style="font-size:10px;background:var(--b3);color:var(--t2);padding:1px 6px;border-radius:99px">HG</span>' : '');
    return '<div class="cfg-item">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:600;font-size:13px">' + escapeHtml(l.name) + (tags ? ' ' + tags : '') + '</div>'
        + '<div style="font-size:11px;color:var(--t2);margin-top:2px">' + addrSummary + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-shrink:0">'
        + '<button class="bsm bsmi" onclick="openLabModal(\'' + l.id + '\')">Modifier</button>'
        + '<button class="bsm bsmd" onclick="removeLab(\'' + l.id + '\')">Désactiver</button>'
      + '</div>'
    + '</div>';
  }).join('');
}

// ── Modal modification laboratoire ────────────────────────────────────────────

var _labModalId = null;

export async function openLabModal(id) {
  var l = state.laboratoires.find(function(l) { return l.id === id; });
  if (!l) return;
  _labModalId = id;

  var n = document.getElementById('lem-lab-name'); if (n) n.textContent = l.name;
  function sv(elId, val) { var el = document.getElementById(elId); if (el) el.value = val || ''; }
  sv('lem-adr',  l.adresse);
  sv('lem-adr2', l.adresse2);
  sv('lem-vil',  l.ville);
  sv('lem-prv',  l.province);
  sv('lem-cp',   formaterCP(l.code_postal || ''));
  sv('lem-pays', l.pays);
  sv('lem-tel',  formaterTel(l.telephone || ''));
  var refEl = document.getElementById('lem-ref'); if (refEl) refEl.value = l.default_refrigerant || '';
  sv('lem-fbh', formaterTel(l.fax_bio_hema || ''));
  sv('lem-fm',  formaterTel(l.fax_micro    || ''));
  sv('lem-fp',  formaterTel(l.fax_patho    || ''));
  sv('lem-fg',  formaterTel(l.fax_general  || ''));

  var bdCb = document.getElementById('lem-mod-bd');
  if (bdCb) bdCb.checked = (window.CFG && window.CFG.bonsDepartEnabledLabs || []).indexOf(id) !== -1;
  var hgCb = document.getElementById('lem-mod-hg');
  if (hgCb) hgCb.checked = (state.CFG && state.CFG.hgrappeEnabledLabs || []).indexOf(id) !== -1;

  // Charger la config notifications pour ce labo
  var rNotif = await state.sb.from('module_config').select('active,config')
    .eq('module','notifications').eq('labo_id',id).maybeSingle();
  var notifRow = (rNotif.data) || {};
  var notifCfg = notifRow.config || {};
  var ne = document.getElementById('lem-notif-enabled'); if (ne) ne.checked = !!notifRow.active;
  var nnc = document.getElementById('lem-notif-nc');     if (nnc) nnc.checked = notifCfg.nc    !== false;
  var nlo = document.getElementById('lem-notif-lost');   if (nlo) nlo.checked = notifCfg.lost  !== false;
  var nal = document.getElementById('lem-notif-alarm');  if (nal) nal.checked = notifCfg.alarm !== false;

  var errEl = document.getElementById('lem-err'); if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  var modal = document.getElementById('lab-edit-modal');
  if (modal) { modal.style.display = 'flex'; }
  window._currentLabModalId = id;
  if (window.renderLabModalEmails) window.renderLabModalEmails(id);
}

export function closeLabModal() {
  var modal = document.getElementById('lab-edit-modal');
  if (modal) modal.style.display = 'none';
  _labModalId = null;
  window._currentLabModalId = null;
}

export async function saveLabModal() {
  var id = _labModalId;
  if (!id) return;

  function gv(elId) { var el = document.getElementById(elId); return el ? el.value.trim() : ''; }
  var adr  = gv('lem-adr'), adr2 = gv('lem-adr2'), vil = gv('lem-vil'), prv = gv('lem-prv');
  var cp   = gv('lem-cp'),  pays = gv('lem-pays'),  tel = gv('lem-tel');
  var ref  = document.getElementById('lem-ref') ? document.getElementById('lem-ref').value || null : null;
  var fbh  = gv('lem-fbh'), fm = gv('lem-fm'), fp = gv('lem-fp'), fg = gv('lem-fg');

  var errEl = document.getElementById('lem-err');
  function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } }

  // Sauvegarder les coordonnées
  var r = await sbCall(state.sb.from('laboratories').update({
    adresse: adr, adresse2: adr2, ville: vil, province: prv, code_postal: cp,
    pays: pays, telephone: tel, default_refrigerant: ref,
    fax_bio_hema: fbh, fax_micro: fm, fax_patho: fp, fax_general: fg,
  }).eq('id', id), null);
  if (r.error) { showErr('Erreur coordonnées : ' + r.error.message); return; }

  // Sauvegarder le module BD
  var bdOn = (document.getElementById('lem-mod-bd') || {}).checked || false;
  var bdEnabled = (window.CFG && window.CFG.bonsDepartEnabledLabs || []).filter(function(lid) { return lid !== id; });
  if (bdOn) bdEnabled.push(id);
  if (window.CFG) window.CFG.bonsDepartEnabledLabs = bdEnabled;
  await state.sb.from('module_config').upsert({ module: 'bons_depart', labo_id: id, active: bdOn, updated_at: new Date().toISOString() }, { onConflict: 'module,labo_id' });

  // Sauvegarder le module HG
  var hgOn = (document.getElementById('lem-mod-hg') || {}).checked || false;
  var hgEnabled = (state.CFG && state.CFG.hgrappeEnabledLabs || []).filter(function(lid) { return lid !== id; });
  if (hgOn) hgEnabled.push(id);
  if (state.CFG) state.CFG.hgrappeEnabledLabs = hgEnabled;
  await state.sb.from('module_config').upsert({ module: 'hgrappe', labo_id: id, active: hgOn, updated_at: new Date().toISOString() }, { onConflict: 'module,labo_id' });
  var canHG = window.isHGEnabled && window.isHGEnabled();
  var sw = document.getElementById('mode-sw'); if (sw) sw.classList.toggle('gone', !canHG);

  // Sauvegarder la config notifications par labo
  var notifOn  = (document.getElementById('lem-notif-enabled') || {}).checked || false;
  var notifCfg = {
    nc:    !!((document.getElementById('lem-notif-nc')    || {}).checked),
    lost:  !!((document.getElementById('lem-notif-lost')  || {}).checked),
    alarm: !!((document.getElementById('lem-notif-alarm') || {}).checked),
  };
  await state.sb.from('module_config').upsert({ module: 'notifications', labo_id: id, active: notifOn, config: notifCfg, updated_at: new Date().toISOString() }, { onConflict: 'module,labo_id' });

  // Mettre à jour l'état local
  var lab = state.laboratoires.find(function(l) { return l.id === id; });
  if (lab) { lab.adresse = adr; lab.adresse2 = adr2; lab.ville = vil; lab.province = prv; lab.code_postal = cp; lab.pays = pays; lab.telephone = tel; lab.default_refrigerant = ref; lab.fax_bio_hema = fbh; lab.fax_micro = fm; lab.fax_patho = fp; lab.fax_general = fg; }

  closeLabModal();
  renderCfgLabs();
  if (window.renderCfgModules) window.renderCfgModules();
  if (window.updateTransporteurVisibility) window.updateTransporteurVisibility();
  notifier('cfgsuc', 'Laboratoire mis à jour.', 's');
}

export async function addLab() {
  var v = (document.getElementById('newlab').value || '').trim();
  if (!v) { notifier('cfgerr', 'Saisissez un nom.', 'e'); return; }
  function gv(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  var r = await state.sb.from('laboratories').insert({
    name: v, adresse: gv('newlab-adr'), adresse2: gv('newlab-adr2'), ville: gv('newlab-vil'),
    province: gv('newlab-prv'), code_postal: gv('newlab-cp'), pays: gv('newlab-pays'),
    telephone: gv('newlab-tel'), default_refrigerant: gv('newlab-ref') || null,
    fax_bio_hema: gv('newlab-fbh'), fax_micro: gv('newlab-fm'), fax_patho: gv('newlab-fp'), fax_general: gv('newlab-fg'),
    grappe_id: window._cfgGrappeId || null,
  });
  if (r.error) { notifier('cfgerr', r.error.code === '23505' ? 'Ce laboratoire existe déjà.' : 'Erreur : ' + r.error.message, 'e'); return; }
  window.closeCfgAddModal();
  await loadLabs(); renderCfgLabs(); populateSels();
  notifier('cfgsuc', '"' + v + '" ajouté.', 's');
}

export async function removeLab(id) {
  if (!await confirm2('Désactiver ce laboratoire', 'Cette action le masquera des listes. Les envois existants ne sont pas affectés.', 'Désactiver')) return;
  var r = await sbCall(state.sb.from('laboratories').update({ active: false }).eq('id', id), 'cfgerr');
  if (r.error) return;
  await loadLabs(); renderCfgLabs(); populateSels();
  notifier('cfgsuc', 'Laboratoire désactivé.', 's');
}
