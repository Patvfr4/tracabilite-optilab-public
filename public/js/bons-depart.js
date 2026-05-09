// ── BONS-DEPART.JS ────────────────────────────────────────────────────────────
// Gestion des bons de départ : création, historique, impression.
// Dépendances : state.js, utils.js, auth.js, ui.js
// ─────────────────────────────────────────────────────────────────────────────

import { state, sbCall } from './state.js';
import { escapeHtml, formatDate, formatDateTime } from './utils.js';
import { estGrappe, estSuperviseur } from './auth.js';
import { notifier, confirm2 } from './ui.js';

// ── État local ────────────────────────────────────────────────────────────────

var _bdPage     = 0;
var _bdPageSize = 25;
var _bdTotal    = 0;
var _bdView     = 'list'; // 'list' | 'create' | 'detail'
var _currentBon       = null;
var _currentBonLaboId = null;
var _pendingEnvois   = [];
var _selectedIntra   = {};  // { [envoi_id]: true }
var _selectedHG      = {};  // { [hg_envoi_id]: true }

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isBDEnabled() {
  return !!(window.CFG && Array.isArray(window.CFG.bonsDepartEnabledLabs)
    && window.CFG.bonsDepartEnabledLabs.indexOf(state.activeLaboId) !== -1);
}

// ── Navigation interne ────────────────────────────────────────────────────────

function _showView(v) {
  _bdView = v;
  var ids = ['bd-list-view', 'bd-create-view', 'bd-detail-view'];
  var map = { list: 'bd-list-view', create: 'bd-create-view', detail: 'bd-detail-view' };
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = id === map[v] ? '' : 'none';
  });
}

// ── Point d'entrée (showPanel) ────────────────────────────────────────────────

export async function initBonsDepart() {
  _bdView  = 'list';
  _bdPage  = 0;
  _showView('list');
  await loadBDPage(0);
}

// ── Liste / pagination ────────────────────────────────────────────────────────

export async function loadBDPage(page) {
  _bdPage = page || 0;
  var tbody = document.getElementById('bd-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="tc p2">Chargement…</td></tr>';

  var from = _bdPage * _bdPageSize;
  var to   = from + _bdPageSize - 1;

  var q = state.sb.from('bons_depart')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (!estGrappe()) q = q.eq('labo_id', state.activeLaboId);

  var r = await q;
  if (r.error) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="tc p2" style="color:var(--danger)">Erreur de chargement.</td></tr>';
    return;
  }

  _bdTotal = r.count || 0;
  _renderBDList(r.data || []);
  _renderBDPager();
}

export function changeBDPage(p) { loadBDPage(p); }

function _renderBDList(bons) {
  var tbody = document.getElementById('bd-table-body');
  if (!tbody) return;
  if (!bons.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tc p2" style="color:var(--t3)">Aucun bon de départ.</td></tr>';
    return;
  }
  tbody.innerHTML = bons.map(function(b) {
    var badge = b.statut === 'actif' ? '<span class="badge bt">Actif</span>'
      : b.statut === 'récupéré' ? '<span class="badge br">Récupéré</span>'
      : '<span class="badge bperdu">Annulé</span>';
    return '<tr style="cursor:pointer" onclick="showBDDetail(\'' + b.id + '\')">'
      + '<td><strong>' + escapeHtml(b.numero) + '</strong></td>'
      + '<td>' + formatDate(b.created_at) + '</td>'
      + '<td>' + escapeHtml(b.cree_par_nom) + '</td>'
      + '<td>' + badge + '</td>'
      + '<td><button class="bsm bsmi" onclick="event.stopPropagation();printBon(\'' + b.id + '\')">Imprimer</button></td>'
      + '</tr>';
  }).join('');
}

function _renderBDPager() {
  var el = document.getElementById('bd-pagination');
  if (!el) return;
  var pages = Math.ceil(_bdTotal / _bdPageSize);
  if (pages <= 1) { el.innerHTML = ''; return; }
  var html = '<div class="hist-pager">';
  for (var i = 0; i < pages; i++) {
    html += '<button class="bsm' + (i === _bdPage ? ' active' : '') + '" onclick="changeBDPage(' + i + ')">' + (i + 1) + '</button>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ── Création ──────────────────────────────────────────────────────────────────

export async function openCreateBon() {
  _selectedIntra = {};
  _selectedHG    = {};
  _pendingEnvois = [];

  var prepEl = document.getElementById('bd-prep-par');
  if (prepEl) prepEl.value = state.currentUser ? state.currentUser.nom : '';

  _showView('create');
  var _si = document.getElementById('bd-scan-input');
  var _sm = document.getElementById('bd-scan-msg');
  if (_si) { _si.value = ''; setTimeout(function() { _si.focus(); }, 80); }
  if (_sm) { _sm.textContent = ''; }

  var listEl = document.getElementById('bd-create-envois-list');
  if (listEl) listEl.innerHTML = '<div class="kpi-loading">Chargement…</div>';
  _updateSelectedCount();

  var laboId = state.activeLaboId;
  var results = await Promise.all([
    state.sb.from('envois')
      .select('id,numero,numeros_silp,transporteur,departements,dest_lab:dest_labo_id(name)')
      .eq('statut', 'En attente')
      .eq('exp_labo_id', laboId)
      .order('created_at'),
    state.sb.from('envois_hgrappe')
      .select('id,numero,transporteur,dest_lab:dest_ext_lab_id(name)')
      .eq('statut', 'En attente')
      .eq('exp_labo_id', laboId)
      .order('created_at'),
  ]);

  var intra = (results[0].data || []).map(function(e) { return Object.assign({ _type: 'intra' }, e); });
  var hg    = (results[1].data || []).map(function(e) { return Object.assign({ _type: 'hg'    }, e); });
  _pendingEnvois = intra.concat(hg);
  _renderCreateForm();
}

function _renderCreateForm() {
  var listEl = document.getElementById('bd-create-envois-list');
  if (!listEl) return;

  if (!_pendingEnvois.length) {
    listEl.innerHTML = '<div style="color:var(--t3);padding:16px 0;text-align:center">Aucun envoi en attente de départ.</div>';
    return;
  }

  var transOpts = (window.CFG && window.CFG.transporters || []).map(function(t) {
    return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
  }).join('');

  var html = '';
  _pendingEnvois.forEach(function(e) {
    var key   = e._type + '-' + e.id;
    var num   = e._type === 'intra' ? (e.numeros_silp&&e.numeros_silp.length?e.numeros_silp[0]+(e.numeros_silp.length>1?' (+'+(e.numeros_silp.length-1)+')':''):e.numero) : e.numero;
    var dest  = _destLabel(e);
    var tag   = e._type === 'hg' ? ' <span class="bd-hg-tag">HG</span>' : '';
    var depts = (e.departements && e.departements.length) ? e.departements.join(', ') : '';
    var defTr = e.transporteur || (window.CFG && window.CFG.transporters && window.CFG.transporters[0]) || '';
    var opts  = transOpts.replace('value="' + escapeHtml(defTr) + '"', 'value="' + escapeHtml(defTr) + '" selected');
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--b3)">'
      + '<label class="bd-envoi-row" style="flex:1;border:none;padding:0;margin:0">'
      + '<input type="checkbox" data-key="' + key + '" data-id="' + e.id + '" data-type="' + e._type + '" onchange="bdToggleEnvoi(this)"/>'
      + '<span class="bd-envoi-num">' + escapeHtml(num) + tag + '</span>'
      + '<span class="bd-envoi-dest">' + escapeHtml(dest) + '</span>'
      + (depts ? '<span class="bd-envoi-depts">' + escapeHtml(depts) + '</span>' : '')
      + '</label>'
      + '<select class="bd-tr-sel" data-id="' + e.id + '" data-type="' + e._type + '" style="min-width:130px;flex-shrink:0;font-size:12px">'
      + opts
      + '</select>'
      + '</div>';
  });

  listEl.innerHTML = html;
}

export function bdToggleEnvoi(cb) {
  var id   = cb.dataset.id;
  var type = cb.dataset.type;
  if (type === 'intra') {
    if (cb.checked) _selectedIntra[id] = true; else delete _selectedIntra[id];
  } else {
    if (cb.checked) _selectedHG[id] = true; else delete _selectedHG[id];
  }
  _updateSelectedCount();
}

export function bdSelectAll() {
  document.querySelectorAll('#bd-create-envois-list input[type=checkbox]').forEach(function(cb) {
    cb.checked = true;
    bdToggleEnvoi(cb);
  });
}

function _updateSelectedCount() {
  var total = Object.keys(_selectedIntra).length + Object.keys(_selectedHG).length;
  var el = document.getElementById('bd-sel-count');
  if (el) el.textContent = total + ' envoi' + (total > 1 ? 's' : '') + ' sélectionné' + (total > 1 ? 's' : '');
}

export async function saveCreateBon() {
  var envoisIds   = Object.keys(_selectedIntra);
  var hgEnvoisIds = Object.keys(_selectedHG);

  if (!envoisIds.length && !hgEnvoisIds.length) {
    notifier('bderr', 'Sélectionnez au moins un envoi.', 'e');
    return;
  }

  var prepEl = document.getElementById('bd-prep-par');
  var nom = prepEl ? prepEl.value.trim() : (state.currentUser ? state.currentUser.nom : '');
  if (!nom) { notifier('bderr', 'Le nom du préparateur est requis.', 'e'); return; }

  // Construire la carte transporteur depuis les dropdowns par envoi
  var transporteurMap = {};
  document.querySelectorAll('#bd-create-envois-list .bd-tr-sel').forEach(function(sel) {
    if (sel.value) transporteurMap[sel.dataset.id] = sel.value;
  });

  // Vérifier que chaque envoi sélectionné a un transporteur
  var missingTr = envoisIds.concat(hgEnvoisIds).find(function(id) { return !transporteurMap[id]; });
  if (missingTr) { notifier('bderr', 'Veuillez assigner un transporteur à chaque envoi sélectionné.', 'e'); return; }

  var r = await sbCall(state.sb.rpc('create_bon_depart', {
    p_labo_id:            state.activeLaboId,
    p_cree_par_id:        state.currentUser.id,
    p_cree_par_nom:       nom,
    p_envoi_ids:          envoisIds,
    p_hg_envoi_ids:       hgEnvoisIds,
    p_bon_connaissements: {},
    p_transporteur_map:   transporteurMap,
  }), 'bderr');

  if (r.error) return;

  var created = r.data;
  notifier('bdsuc', 'Bon ' + created.numero + ' créé.', 's');

  await Promise.all([window.loadEnvois(), window.loadEnvoisHG ? window.loadEnvoisHG() : Promise.resolve()]);

  _showView('list');
  await loadBDPage(0);
  await showBDDetail(created.id, true);
}

// ── Chargement des envois d'un bon (requêtes plates, pas de jointures imbriquées) ──

async function _loadBonLinks(bonId, withStatut) {
  var rLinks = await state.sb.from('bons_depart_envois')
    .select('id,type,envoi_id,hg_envoi_id').eq('bon_id', bonId);
  if (rLinks.error) throw new Error('bons_depart_envois : ' + rLinks.error.message);
  var records = rLinks.data || [];
  if (!records.length) return [];

  var intraIds = records.filter(function(l) { return l.type === 'intra' && l.envoi_id; }).map(function(l) { return l.envoi_id; });
  var hgIds    = records.filter(function(l) { return l.type === 'hg'    && l.hg_envoi_id; }).map(function(l) { return l.hg_envoi_id; });

  var intraFields = 'id,numero,numeros_silp,transporteur,departements,dest_labo_id' + (withStatut ? ',statut' : '');
  var hgFields    = 'id,numero,transporteur,dest_ext_lab_id'                 + (withStatut ? ',statut' : '');

  var [rIntra, rHG] = await Promise.all([
    intraIds.length ? state.sb.from('envois').select(intraFields).in('id', intraIds)          : { data: [] },
    hgIds.length    ? state.sb.from('envois_hgrappe').select(hgFields).in('id', hgIds) : { data: [] },
  ]);

  var intraMap = {};
  (rIntra.data || []).forEach(function(e) { intraMap[e.id] = e; });
  var hgMap = {};
  (rHG.data || []).forEach(function(e) { hgMap[e.id] = e; });

  return records.map(function(link) {
    if (link.type === 'intra') {
      var e   = intraMap[link.envoi_id] || null;
      var lab = e && state.laboratoires && state.laboratoires.find(function(l) { return l.id === e.dest_labo_id; });
      return Object.assign({}, link, {
        envoi:    e ? Object.assign({}, e, { dest_lab: lab ? { name: lab.name } : null }) : null,
        hg_envoi: null,
      });
    } else {
      var e         = hgMap[link.hg_envoi_id] || null;
      var lab       = e && state.labsExternes && state.labsExternes.find(function(l) { return l.id === e.dest_ext_lab_id; });
      var parentLab = lab && lab.parent_id && state.labsExternes && state.labsExternes.find(function(l) { return l.id === lab.parent_id; });
      return Object.assign({}, link, {
        envoi:    null,
        hg_envoi: e ? Object.assign({}, e, {
          dest_lab: lab ? { name: lab.name, parent_name: parentLab ? parentLab.name : null } : null,
        }) : null,
      });
    }
  });
}

function _localNow() {
  var d = new Date();
  var p = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function _toDatetimeInput(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  var p = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function _destLabel(e) {
  if (!e || !e.dest_lab) return '—';
  var n = e.dest_lab.name || '—';
  var p = e.dest_lab.parent_name
       || (e.dest_lab.parent && e.dest_lab.parent.name)
       || null;
  return p ? p + ' — ' + n : n;
}

// ── Détail d'un bon ───────────────────────────────────────────────────────────

export async function showBDDetail(id, offerPrint) {
  _showView('detail');
  var content = document.getElementById('bd-detail-content');
  if (content) content.innerHTML = '<div class="kpi-loading">Chargement…</div>';

  try {
    var [rBon, rSections, enrichedLinks] = await Promise.all([
      state.sb.from('bons_depart').select('*').eq('id', id).single(),
      state.sb.from('bons_depart_sections').select('*').eq('bon_id', id).order('transporteur'),
      _loadBonLinks(id, true),
    ]);

    if (rBon.error) throw new Error('bons_depart : ' + rBon.error.message);

    _currentBon       = id;
    _currentBonLaboId = rBon.data.labo_id;
    _renderDetail(rBon.data, rSections.data || [], enrichedLinks, offerPrint);
  } catch (ex) {
    console.error('[BD] showBDDetail error:', ex);
    var c = document.getElementById('bd-detail-content');
    var msg = ex && ex.message ? ex.message : String(ex);
    if (c) c.innerHTML = '<div style="color:var(--danger);padding:16px 0">'
      + '<strong>Erreur de chargement</strong><br/><span style="font-size:12px;color:var(--t2)">'
      + escapeHtml(msg) + '</span></div>';
  }
}

function _renderDetail(bon, sections, links, offerPrint) {
  var content = document.getElementById('bd-detail-content');
  if (!content) return;

  var isActif = bon.statut === 'actif';

  // Verrous métier
  var hasReceivedEnvoi = links.some(function(link) {
    var e = link.type === 'intra' ? link.envoi : link.hg_envoi;
    return e && e.statut && e.statut !== 'En attente' && e.statut !== 'En transit';
  });
  var hasDatePC = sections.some(function(s) { return !!s.date_prise_en_charge; });
  var isEditable = isActif && !hasReceivedEnvoi && !hasDatePC;
  var canCancel  = isEditable && (estSuperviseur() || (state.currentUser && state.currentUser.id === bon.cree_par_id));
  var totalColis = links.length;

  var byTr = {};
  links.forEach(function(link) {
    var e = link.type === 'intra' ? link.envoi : link.hg_envoi;
    if (!e) return;
    if (!byTr[e.transporteur]) byTr[e.transporteur] = [];
    byTr[e.transporteur].push(link);
  });

  var badge = bon.statut === 'actif' ? '<span class="badge bt">Actif</span>'
    : bon.statut === 'récupéré' ? '<span class="badge br">Récupéré</span>'
    : '<span class="badge bperdu">Annulé</span>';

  var html = '<div class="bd-detail-hd">'
    + '<div>'
    + '<div style="font-size:20px;font-weight:700">' + escapeHtml(bon.numero) + '</div>'
    + '<div style="font-size:13px;color:var(--t3)">' + formatDateTime(bon.created_at) + ' · Préparé par ' + escapeHtml(bon.cree_par_nom) + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
    + badge
    + '<button class="bsm bsmi" onclick="printBon(\'' + bon.id + '\')">Imprimer</button>'
    + (canCancel ? '<button class="bsm" style="color:var(--danger);border-color:var(--danger)" onclick="cancelBon(\'' + bon.id + '\')">Annuler le bon</button>' : '')
    + '</div>'
    + '</div>';

  // Bannière de statut
  if (bon.statut === 'récupéré') {
    var recupMsg = hasReceivedEnvoi
      ? 'Tous les envois ont été réceptionnés.'
      : hasDatePC
      ? 'La date de prise en charge a été renseignée.'
      : 'Bon récupéré.';
    html += '<div class="bd-recup-banner">✓ ' + recupMsg + '</div>';
  } else if (isActif && !isEditable) {
    var lockMsg = hasReceivedEnvoi
      ? 'Un ou plusieurs envois ont été réceptionnés — verrouillé en attendant la mise à jour du statut.'
      : 'La date de prise en charge a été renseignée — verrouillé.';
    html += '<div class="bd-lock-banner">🔒 ' + lockMsg + '</div>';
  }

  html += '<div class="bd-colis-count">' + totalColis + '<span class="bd-colis-label">colis</span></div>';

  sections.forEach(function(sec) {
    var sLinks = byTr[sec.transporteur] || [];
    if (!sLinks.length) return;

    html += '<div class="bd-section">'
      + '<div class="bd-section-hd"><strong>' + escapeHtml(sec.transporteur) + '</strong>'
      + '<span class="bd-section-nb">' + sLinks.length + ' colis</span></div>'
      + '<div class="bd-section-fields">'
      + '<div class="fgg"><label>N° bon de connaissement</label>'
      + '<input class="bd-sec-bc" data-bon="' + bon.id + '" data-tr="' + escapeHtml(sec.transporteur) + '" value="' + escapeHtml(sec.bon_connaissement || '') + '"' + (!isEditable ? ' disabled' : '') + '/></div>'
      + '<div class="fgg"><label>Date et heure de prise en charge</label>'
      + '<input type="datetime-local" class="bd-sec-date" data-bon="' + bon.id + '" data-tr="' + escapeHtml(sec.transporteur) + '" value="' + _toDatetimeInput(sec.date_prise_en_charge) + '" max="' + _localNow() + '"' + (!isEditable ? ' disabled' : '') + '/></div>'
      + '<div class="fgg"><label>Transporteur réel</label>'
      + '<input class="bd-sec-nom" data-bon="' + bon.id + '" data-tr="' + escapeHtml(sec.transporteur) + '" value="' + escapeHtml(sec.nom_transporteur_reel || '') + '"' + (!isEditable ? ' disabled' : '') + '/></div>'
      + (isEditable ? '<div class="fgg" style="align-self:flex-end"><button class="bsm bsmi" onclick="saveBDSection(this)">Enregistrer</button></div>' : '')
      + '</div>'
      + '<table class="bd-envois-tbl"><thead><tr><th>N° liste</th><th>Destination</th><th>Dép.</th><th>Type</th><th>Statut</th>'
      + (isEditable ? '<th></th>' : '')
      + '</tr></thead><tbody>';

    sLinks.forEach(function(link) {
      var e    = link.type === 'intra' ? link.envoi : link.hg_envoi;
      if (!e) return;
      var num  = link.type === 'intra' ? (e.numeros_silp&&e.numeros_silp.length?e.numeros_silp[0]+(e.numeros_silp.length>1?' (+'+( e.numeros_silp.length-1)+')':''):e.numero) : e.numero;
      var dest = _destLabel(e);
      var deps = (e.departements && e.departements.length) ? e.departements.join(', ') : '—';
      var type = link.type === 'hg' ? 'Hors-grappe' : 'Intra';
      var sBadge = e.statut ? '<span class="badge ' + (e.statut === 'Reçu' ? 'br' : e.statut === 'En transit' ? 'bt' : e.statut === 'En attente' ? 'ba' : 'bp2') + '">' + escapeHtml(e.statut) + '</span>' : '—';
      var numSub = (link.type === 'intra' && e.numeros_silp && e.numeros_silp.length) ? '<br><span style="font-size:10px;color:var(--t3);font-family:var(--fm)">' + escapeHtml(e.numero) + '</span>' : '';
      html += '<tr>'
        + '<td><strong>' + escapeHtml(num) + '</strong>' + numSub + '</td>'
        + '<td>' + escapeHtml(dest) + '</td>'
        + '<td style="font-size:11px">' + escapeHtml(deps) + '</td>'
        + '<td style="font-size:11px">' + type + '</td>'
        + '<td>' + sBadge + '</td>'
        + (isEditable ? '<td><button class="bsm" style="color:var(--danger)" onclick="removeEnvoiFromBon(\'' + link.id + '\',\'' + bon.id + '\')">✕</button></td>' : '')
        + '</tr>';
    });

    html += '</tbody></table></div>';
  });

  if (isEditable) {
    html += '<div id="bd-add-colis-wrap" style="margin-top:12px">'
      + '<button class="bsm bsmi" onclick="openAddColis(\'' + bon.id + '\',\'' + bon.labo_id + '\')">'
      + '+ Ajouter des colis</button></div>';
  }

  content.innerHTML = html;
  if (offerPrint) setTimeout(function() { printBon(bon.id); }, 400);
}

// ── Ajout de colis à un bon existant ─────────────────────────────────────────

var _addIntra = {};
var _addHG    = {};

export async function openAddColis(bonId, laboId) {
  var wrap = document.getElementById('bd-add-colis-wrap');
  if (!wrap) return;

  wrap.innerHTML = '<div class="kpi-loading">Chargement des envois en attente…</div>';

  var results = await Promise.all([
    state.sb.from('envois').select('id,numero,numeros_silp,transporteur,departements,dest_lab:dest_labo_id(name)')
      .eq('statut', 'En attente').eq('exp_labo_id', laboId).order('created_at'),
    state.sb.from('envois_hgrappe').select('id,numero,transporteur,dest_lab:dest_ext_lab_id(name,parent:parent_id(name))')
      .eq('statut', 'En attente').eq('exp_labo_id', laboId).order('created_at'),
  ]);

  var intra = (results[0].data || []).map(function(e) { return Object.assign({ _type: 'intra' }, e); });
  var hg    = (results[1].data || []).map(function(e) { return Object.assign({ _type: 'hg'    }, e); });
  var pending = intra.concat(hg);

  _addIntra = {};
  _addHG    = {};

  if (!pending.length) {
    wrap.innerHTML = '<div style="color:var(--t3);font-size:13px;padding:8px 0">Aucun envoi en attente à ajouter.</div>';
    return;
  }

  var transOpts = (window.CFG && window.CFG.transporters || []).map(function(t) {
    return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
  }).join('');

  var html = '<div class="bd-section" style="border-color:var(--brand-azure-soft)">'
    + '<div class="bd-section-hd" style="background:var(--info-soft)">'
    + '<strong style="color:var(--brand-azure-ink)">Ajouter des colis</strong>'
    + '<button class="bsm" style="margin-left:auto" onclick="closeAddColis()">Annuler</button>'
    + '</div>'
    + '<div style="padding:10px 14px">';

  pending.forEach(function(e) {
    var num   = e._type === 'intra' ? (e.numeros_silp&&e.numeros_silp.length?e.numeros_silp[0]+(e.numeros_silp.length>1?' (+'+(e.numeros_silp.length-1)+')':''):e.numero) : e.numero;
    var dest  = _destLabel(e);
    var tag   = e._type === 'hg' ? ' <span class="bd-hg-tag">HG</span>' : '';
    var deps  = (e.departements && e.departements.length) ? e.departements.join(', ') : '';
    var defTr = e.transporteur || (window.CFG && window.CFG.transporters && window.CFG.transporters[0]) || '';
    var opts  = transOpts.replace('value="' + escapeHtml(defTr) + '"', 'value="' + escapeHtml(defTr) + '" selected');
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--b3)">'
      + '<label class="bd-envoi-row" style="flex:1;border:none;padding:0;margin:0">'
      + '<input type="checkbox" data-id="' + e.id + '" data-type="' + e._type + '" onchange="bdToggleAddEnvoi(this)"/>'
      + '<span class="bd-envoi-num">' + escapeHtml(num) + tag + '</span>'
      + '<span class="bd-envoi-dest">' + escapeHtml(dest) + '</span>'
      + (deps ? '<span class="bd-envoi-depts">' + escapeHtml(deps) + '</span>' : '')
      + '</label>'
      + '<select class="bd-add-tr-sel" data-id="' + e.id + '" data-type="' + e._type + '" style="min-width:130px;flex-shrink:0;font-size:12px">'
      + opts
      + '</select>'
      + '</div>';
  });

  html += '</div>'
    + '<div style="padding:0 14px 12px;display:flex;gap:8px;align-items:center">'
    + '<button class="bp" onclick="saveAddColis(\'' + bonId + '\')">Ajouter au bon</button>'
    + '<span id="bd-add-count" style="font-size:12px;color:var(--t3)">0 sélectionné</span>'
    + '</div></div>';

  wrap.innerHTML = html;
}

export function closeAddColis() {
  var wrap = document.getElementById('bd-add-colis-wrap');
  if (wrap && _currentBon) {
    wrap.innerHTML = '<button class="bsm bsmi" onclick="openAddColis(\'' + _currentBon + '\',\'' + _currentBonLaboId + '\')">'
      + '+ Ajouter des colis</button>';
  }
}

export function bdToggleAddEnvoi(cb) {
  var id   = cb.dataset.id;
  var type = cb.dataset.type;
  if (type === 'intra') {
    if (cb.checked) _addIntra[id] = true; else delete _addIntra[id];
  } else {
    if (cb.checked) _addHG[id] = true; else delete _addHG[id];
  }
  var total = Object.keys(_addIntra).length + Object.keys(_addHG).length;
  var el = document.getElementById('bd-add-count');
  if (el) el.textContent = total + ' sélectionné' + (total > 1 ? 's' : '');
}

export async function saveAddColis(bonId) {
  var envoisIds   = Object.keys(_addIntra);
  var hgEnvoisIds = Object.keys(_addHG);
  if (!envoisIds.length && !hgEnvoisIds.length) {
    notifier('bderr', 'Sélectionnez au moins un envoi.', 'e');
    return;
  }

  // Construire la carte transporteur depuis les dropdowns
  var trMap = {};
  document.querySelectorAll('#bd-add-colis-wrap .bd-add-tr-sel').forEach(function(sel) {
    if (sel.value) trMap[sel.dataset.id] = sel.value;
  });

  var missingTr2 = envoisIds.concat(hgEnvoisIds).find(function(id) { return !trMap[id]; });
  if (missingTr2) { notifier('bderr', 'Veuillez assigner un transporteur à chaque envoi sélectionné.', 'e'); return; }

  var r = await sbCall(state.sb.rpc('add_envois_to_bon', {
    p_bon_id:            bonId,
    p_envoi_ids:         envoisIds,
    p_hg_envoi_ids:      hgEnvoisIds,
    p_transporteur_map:  trMap,
  }), 'bderr');

  if (r.error) return;

  notifier('bdsuc', 'Colis ajouté(s) au bon.', 's');
  await Promise.all([window.loadEnvois(), window.loadEnvoisHG ? window.loadEnvoisHG() : Promise.resolve()]);
  await showBDDetail(bonId);
}

// ── Sauvegarde d'une section ──────────────────────────────────────────────────

export async function saveBDSection(btn) {
  var section = btn.closest('.bd-section');
  if (!section) return;
  var bcInput   = section.querySelector('.bd-sec-bc');
  var dateInput = section.querySelector('.bd-sec-date');
  var nomInput  = section.querySelector('.bd-sec-nom');
  if (!bcInput) return;

  var dateVal = null;
  if (dateInput && dateInput.value) {
    var dParsed = new Date(dateInput.value);
    if (dParsed > new Date()) {
      notifier('bderr', 'La date de prise en charge ne peut pas être dans le futur.', 'e');
      return;
    }
    dateVal = dParsed.toISOString();
  }

  var r = await sbCall(state.sb.from('bons_depart_sections')
    .update({
      bon_connaissement:    bcInput.value.trim(),
      date_prise_en_charge: dateVal,
      nom_transporteur_reel: nomInput ? nomInput.value.trim() : '',
    })
    .eq('bon_id', bcInput.dataset.bon)
    .eq('transporteur', bcInput.dataset.tr), 'bderr');

  if (r.error) return;
  notifier('bdsuc', 'Section mise à jour.', 's');
  if (_currentBon) await showBDDetail(_currentBon);
}

// ── Annulation ────────────────────────────────────────────────────────────────

export async function cancelBon(id) {
  var ok = await confirm2(
    'Annuler le bon de départ',
    'Les envois associés repassent en "En attente". Cette action est irréversible.',
    'Annuler le bon', true
  );
  if (!ok) return;

  var r = await sbCall(state.sb.rpc('cancel_bon_depart', { p_bon_id: id }), 'bderr');
  if (r.error) return;

  notifier('bdsuc', 'Bon de départ annulé.', 's');
  await Promise.all([window.loadEnvois(), window.loadEnvoisHG ? window.loadEnvoisHG() : Promise.resolve()]);
  _showView('list');
  await loadBDPage(0);
}

// ── Retrait d'un envoi ────────────────────────────────────────────────────────

export async function removeEnvoiFromBon(linkId, bonId) {
  var ok = await confirm2('Retirer cet envoi', 'L\'envoi repassera en "En attente".', 'Retirer', true);
  if (!ok) return;

  var r = await sbCall(state.sb.rpc('remove_envoi_from_bon', { p_link_id: linkId }), 'bderr');
  if (r.error) return;

  notifier('bdsuc', 'Envoi retiré du bon.', 's');
  await Promise.all([window.loadEnvois(), window.loadEnvoisHG ? window.loadEnvoisHG() : Promise.resolve()]);
  await showBDDetail(bonId);
}

// ── Impression ────────────────────────────────────────────────────────────────

export async function printBon(id) {
  var [rBon, rSections, links, rLabo] = await Promise.all([
    state.sb.from('bons_depart').select('*').eq('id', id).single(),
    state.sb.from('bons_depart_sections').select('*').eq('bon_id', id).order('transporteur'),
    _loadBonLinks(id, false),
    state.sb.from('laboratories').select('name,adresse,ville').eq('id', state.activeLaboId).single(),
  ]);

  if (rBon.error) return;

  var bon      = rBon.data;
  var sections = rSections.data || [];
  var labo     = rLabo.data || {};

  // Grouper : transporteur → destination → liens
  var byTr = {};
  links.forEach(function(link) {
    var e = link.type === 'intra' ? link.envoi : link.hg_envoi;
    if (!e) return;
    var tr   = e.transporteur;
    var dest = _destLabel(e);
    if (!byTr[tr]) byTr[tr] = {};
    if (!byTr[tr][dest]) byTr[tr][dest] = [];
    byTr[tr][dest].push(link);
  });

  var totalColis = links.length;
  var dateStr    = new Date(bon.created_at).toLocaleDateString('fr-CA');

  var html = '<div class="bdp-doc">'
    + '<div class="bdp-header">'
    + '<div>'
    + '<div class="bdp-title">Bon de départ</div>'
    + '<div class="bdp-meta">'
    + '<div><strong>' + escapeHtml(bon.numero) + '</strong></div>'
    + '<div>' + escapeHtml(labo.name || '') + '</div>'
    + '<div>Date&nbsp;: ' + dateStr + '</div>'
    + '<div>Préparé par&nbsp;: ' + escapeHtml(bon.cree_par_nom) + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="bdp-colis-count">' + totalColis + '<div class="bdp-colis-lbl">colis</div></div>'
    + '</div>';

  sections.forEach(function(sec) {
    var destGroups = byTr[sec.transporteur] || {};
    var dests      = Object.keys(destGroups).sort();
    var totalTr    = dests.reduce(function(acc, d) { return acc + destGroups[d].length; }, 0);
    if (!totalTr) return;

    var bc = (sec.bon_connaissement || '').trim();

    html += '<div class="bdp-section">'
      // ── En-tête transporteur ──
      + '<div class="bdp-section-hd">'
      + '<span class="bdp-section-name">' + escapeHtml(sec.transporteur) + '</span>'
      + '<span class="bdp-section-nb">' + totalTr + ' colis</span>'
      + '</div>'
      // ── Bon de connaissement (configurable) ──
      + '<div class="bdp-bc-row">'
      + '<span class="bdp-bc-lbl">N°&nbsp;bon de connaissement&nbsp;:</span>'
      + '<span class="bdp-bc-val">' + (bc ? escapeHtml(bc) : '') + '</span>'
      + '</div>';

    // ── Sous-sections par destination ──
    dests.forEach(function(dest) {
      var destLinks = destGroups[dest];
      html += '<div class="bdp-dest">'
        + '<div class="bdp-dest-hd">'
        + '<span class="bdp-dest-name">' + escapeHtml(dest) + '</span>'
        + '<span class="bdp-dest-nb">' + destLinks.length + '</span>'
        + '</div>'
        + '<table class="bdp-table"><thead><tr><th>N° liste</th><th>Départements</th></tr></thead><tbody>';

      destLinks.forEach(function(link) {
        var e    = link.type === 'intra' ? link.envoi : link.hg_envoi;
        var num  = link.type === 'intra' ? (e.numeros_silp&&e.numeros_silp.length?e.numeros_silp[0]+(e.numeros_silp.length>1?' (+'+( e.numeros_silp.length-1)+')':''):e.numero) : e.numero;
        var deps = (e.departements && e.departements.length) ? e.departements.join(', ') : '—';
        var numSub = (link.type === 'intra' && e.numeros_silp && e.numeros_silp.length) ? '<br><span style="font-size:9px;color:#888">' + escapeHtml(e.numero) + '</span>' : '';
        html += '<tr><td>' + escapeHtml(num) + numSub + '</td><td>' + escapeHtml(deps) + '</td></tr>';
      });

      html += '</tbody></table></div>';
    });

    // ── Champs à remplir à la main ──
    html += '<div class="bdp-fields">'
      + '<div class="bdp-field"><span class="bdp-field-lbl">Date et heure de prise en charge&nbsp;:</span>'
      + '<span class="bdp-field-val">' + (sec.date_prise_en_charge ? formatDateTime(sec.date_prise_en_charge) : '') + '</span></div>'
      + '<div class="bdp-field"><span class="bdp-field-lbl">Nom du transporteur&nbsp;:</span>'
      + '<span class="bdp-field-val">' + (sec.nom_transporteur_reel ? escapeHtml(sec.nom_transporteur_reel) : '') + '</span></div>'
      + '<div class="bdp-field bdp-field-sig"><span class="bdp-field-lbl">Signature&nbsp;:</span>'
      + '<span class="bdp-field-val">&nbsp;</span></div>'
      + '</div>'
      + '</div>';
  });

  html += '</div>';

  var pArea = document.getElementById('bd-print-area');
  if (pArea) { pArea.innerHTML = html; window.print(); }
}

// ── Config admin : toggle par labo ────────────────────────────────────────────

export function renderBonsDepartLabsToggle() {
  var el = document.getElementById('bons-depart-labs-list');
  if (!el) return;
  var enabled = (window.CFG && window.CFG.bonsDepartEnabledLabs) || [];
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 1fr';
  el.style.gap = '4px 12px';
  el.innerHTML = state.laboratoires.map(function(l) {
    var on = enabled.indexOf(l.id) !== -1;
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
      + '<label class="cfg-toggle"><input type="checkbox" class="bd-lab-cb" value="' + escapeHtml(l.id) + '"' + (on ? ' checked' : '') + '/><span class="cfg-toggle-sl"></span></label>'
      + '<span style="font-size:13px">' + escapeHtml(l.name) + '</span>'
      + '</div>';
  }).join('');
}

export async function saveBonsDepartLabs() {
  var enabled = [];
  document.querySelectorAll('.bd-lab-cb:checked').forEach(function(cb) { enabled.push(cb.value); });
  if (window.CFG) window.CFG.bonsDepartEnabledLabs = enabled;

  var allLabIds = (state.laboratoires || []).map(function(l) { return l.id; });
  var ops = allLabIds.map(function(labId) {
    return state.sb.from('module_config').upsert({
      module:     'bons_depart',
      labo_id:    labId,
      active:     enabled.indexOf(labId) !== -1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'module,labo_id' });
  });
  var results = await Promise.all(ops);
  var err = results.find(function(r) { return r.error; });
  if (err) { notifier('cfgerr', 'Erreur : ' + err.error.message, 'e'); return; }
  if (window.updateTransporteurVisibility) window.updateTransporteurVisibility();
  notifier('cfgsuc', 'Activation Bons de départ mise à jour.', 's');
}

// ── Scan DataMatrix dans la création de bon ───────────────────────────────────

export function bdScanEnvoi() {
  var input  = document.getElementById('bd-scan-input');
  var msgEl  = document.getElementById('bd-scan-msg');
  var v = (input ? input.value.trim() : '');
  if (!v) return;

  var match = _pendingEnvois.find(function(e) {
    return e.numero === v || e.numero === v.toUpperCase();
  });

  function _msg(txt, color) {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.style.color = color || 'var(--t3)';
    setTimeout(function() { if (msgEl.textContent === txt) msgEl.textContent = ''; }, 3000);
  }

  if (!match) {
    toast('"' + v + '" introuvable dans les envois en attente.', 'e');
    if (input) {
      input.select();
      input.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:300,easing:'ease-in-out'});
    }
    return;
  }

  var key = match._type + '-' + match.id;
  var cb  = document.querySelector('#bd-create-envois-list input[data-key="' + key + '"]');
  if (cb) {
    if (!cb.checked) {
      cb.checked = true;
      bdToggleEnvoi(cb);
      _msg(escapeHtml(match.numero) + ' ajouté.', 'var(--success, #16a34a)');
    } else {
      _msg(escapeHtml(match.numero) + ' déjà sélectionné.', 'var(--t3)');
    }
    var row = cb.closest('label');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (input) { input.value = ''; input.focus(); }
}
