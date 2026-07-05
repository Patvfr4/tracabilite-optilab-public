// ── ECHANTILLONS.JS — Module Gestion des échantillons ────────────────────────
// Scan de codes-barres d'échantillons sur les envois hors-SILP.
//
// Fonctionnalités :
//   Départ   : section scan dans le form intra hors-SILP et HG hors-SILP
//   Réception: champ "Nb reçus" + scan de vérification + génération NC auto
//   Édition  : chips modifiables dans le modal d'édition (intra)
//
// Dépendances : state.js, utils.js (escapeHtml)
// ─────────────────────────────────────────────────────────────────────────────

import { state } from './state.js';
import { escapeHtml } from './utils.js';

// ── État interne ──────────────────────────────────────────────────────────────
var _echDepart     = [];   // chips scan départ intra
var _echHgDepart   = [];   // chips scan départ HG
var _echVerif      = [];   // chips scan vérification réception
var _echDepartEdit = [];   // chips edit modal intra
var _echEnvoiCourant = null; // envoi en cours de réception (ref pour vérif)

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isEchantillonsEnabled() {
  var labs = (window.CFG && window.CFG.echantillonsEnabledLabs) || [];
  return labs.indexOf(state.activeLaboId) !== -1;
}

function _renderChips(containerId, chips, removeFn) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = chips.map(function(v) {
    return '<div class="nlist-chip"><span style="font-family:var(--fm);font-size:11px">' + escapeHtml(v) + '</span>'
      + '<button type="button" onclick="' + removeFn + '(\'' + escapeHtml(v) + '\')" title="Retirer">&times;</button></div>';
  }).join('');
}

function _updateCount(countId, chips) {
  var el = document.getElementById(countId);
  if (el) el.textContent = chips.length + ' échantillon' + (chips.length !== 1 ? 's' : '');
}

// ── Section départ — Intra ────────────────────────────────────────────────────

export function updateEchDepartSectionVisibility() {
  var wrap = document.getElementById('ech-depart-wrap');
  if (!wrap) return;
  var show = isEchantillonsEnabled() && state.sansSilp;
  wrap.style.display = show ? '' : 'none';
  if (!show) { _echDepart = []; renderEchDepartChips(); updateEchDepartScanVisible(); }
}

export function updateEchDepartScanVisible() {
  var cb = document.getElementById('ech-depart-cb');
  var scanWrap = document.getElementById('ech-depart-scan');
  if (scanWrap) scanWrap.style.display = (cb && cb.checked) ? '' : 'none';
  if (cb && !cb.checked) { _echDepart = []; renderEchDepartChips(); }
}

export function addEchDepart() {
  var inp = document.getElementById('ech-depart-input');
  var errEl = document.getElementById('ech-depart-err');
  var v = (inp ? inp.value.trim() : '').toUpperCase();
  if (errEl) errEl.classList.remove('show');
  if (!v) return;
  if (_echDepart.indexOf(v) !== -1) {
    if (errEl) { errEl.textContent = 'Ce code est déjà dans la liste.'; errEl.classList.add('show'); }
    return;
  }
  _echDepart.push(v);
  if (inp) inp.value = '';
  renderEchDepartChips();
  if (inp) inp.focus();
}

export function removeEchDepart(v) { _echDepart = _echDepart.filter(function(x) { return x !== v; }); renderEchDepartChips(); }

export function renderEchDepartChips() {
  _renderChips('ech-depart-chips', _echDepart, 'removeEchDepart');
  _updateCount('ech-depart-count', _echDepart);
}

export function getEchantillonsDepart() { return _echDepart.slice(); }

export function resetEchantillonsDepart() {
  _echDepart = [];
  renderEchDepartChips();
  var cb = document.getElementById('ech-depart-cb'); if (cb) cb.checked = false;
  updateEchDepartScanVisible();
  var wrap = document.getElementById('ech-depart-wrap'); if (wrap) wrap.style.display = 'none';
}

// ── Section départ — HG ──────────────────────────────────────────────────────

export function updateEchHgDepartSectionVisibility() {
  var wrap = document.getElementById('ech-hg-depart-wrap');
  if (!wrap) return;
  var show = isEchantillonsEnabled() && state.hgSansSilp;
  wrap.style.display = show ? '' : 'none';
  if (!show) { _echHgDepart = []; renderEchHgDepartChips(); updateEchHgDepartScanVisible(); }
}

export function updateEchHgDepartScanVisible() {
  var cb = document.getElementById('ech-hg-depart-cb');
  var scanWrap = document.getElementById('ech-hg-depart-scan');
  if (scanWrap) scanWrap.style.display = (cb && cb.checked) ? '' : 'none';
  if (cb && !cb.checked) { _echHgDepart = []; renderEchHgDepartChips(); }
}

export function addEchHgDepart() {
  var inp = document.getElementById('ech-hg-depart-input');
  var errEl = document.getElementById('ech-hg-depart-err');
  var v = (inp ? inp.value.trim() : '').toUpperCase();
  if (errEl) errEl.classList.remove('show');
  if (!v) return;
  if (_echHgDepart.indexOf(v) !== -1) {
    if (errEl) { errEl.textContent = 'Ce code est déjà dans la liste.'; errEl.classList.add('show'); }
    return;
  }
  _echHgDepart.push(v);
  if (inp) inp.value = '';
  renderEchHgDepartChips();
  if (inp) inp.focus();
}

export function removeEchHgDepart(v) { _echHgDepart = _echHgDepart.filter(function(x) { return x !== v; }); renderEchHgDepartChips(); }

export function renderEchHgDepartChips() {
  _renderChips('ech-hg-depart-chips', _echHgDepart, 'removeEchHgDepart');
  _updateCount('ech-hg-depart-count', _echHgDepart);
}

export function getEchantillonsHgDepart() { return _echHgDepart.slice(); }

export function resetEchantillonsHgDepart() {
  _echHgDepart = [];
  renderEchHgDepartChips();
  var cb = document.getElementById('ech-hg-depart-cb'); if (cb) cb.checked = false;
  updateEchHgDepartScanVisible();
  var wrap = document.getElementById('ech-hg-depart-wrap'); if (wrap) wrap.style.display = 'none';
}

// ── Section vérification réception ───────────────────────────────────────────

export function initEchReceptionSection(envoi) {
  _echEnvoiCourant = envoi;
  _echVerif = [];
  var wrap = document.getElementById('ech-recep-wrap');
  if (!wrap) return;
  var depart = envoi.echantillonsDepart || [];
  if (!depart.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  var nbEl = document.getElementById('ech-nb-depart');
  if (nbEl) nbEl.textContent = depart.length;
  var nbREl = document.getElementById('ech-nb-recu');
  if (nbREl) nbREl.value = '';
  var verifWrap = document.getElementById('ech-verif-wrap');
  if (verifWrap) verifWrap.style.display = 'none';
  renderEchVerifChips();
}

export function onEchNbRecuChange() {
  if (!_echEnvoiCourant) return;
  var depart = _echEnvoiCourant.echantillonsDepart || [];
  var nbREl = document.getElementById('ech-nb-recu');
  var nbRecu = nbREl ? parseInt(nbREl.value) : NaN;
  var verifWrap = document.getElementById('ech-verif-wrap');
  if (!verifWrap) return;
  var showVerif = !isNaN(nbRecu) && nbRecu !== depart.length;
  verifWrap.style.display = showVerif ? '' : 'none';
  if (!showVerif) { _echVerif = []; renderEchVerifChips(); }
}

export function addEchVerif() {
  var inp = document.getElementById('ech-verif-input');
  var errEl = document.getElementById('ech-verif-err');
  var v = (inp ? inp.value.trim() : '').toUpperCase();
  if (errEl) errEl.classList.remove('show');
  if (!v) return;
  if (_echVerif.indexOf(v) !== -1) {
    if (errEl) { errEl.textContent = 'Ce code est déjà scanné.'; errEl.classList.add('show'); }
    return;
  }
  _echVerif.push(v);
  if (inp) inp.value = '';
  renderEchVerifChips();
  if (inp) inp.focus();
}

export function removeEchVerif(v) { _echVerif = _echVerif.filter(function(x) { return x !== v; }); renderEchVerifChips(); }

export function renderEchVerifChips() {
  var el = document.getElementById('ech-verif-chips');
  if (!el || !_echEnvoiCourant) return;
  var depart = _echEnvoiCourant.echantillonsDepart || [];
  el.innerHTML = _echVerif.map(function(v) {
    var present = depart.indexOf(v) !== -1;
    var color = present ? 'var(--success,#2e8b57)' : 'var(--te)';
    return '<div class="nlist-chip" style="border-color:' + color + '">'
      + '<span style="font-family:var(--fm);font-size:11px;color:' + color + '">' + escapeHtml(v) + '</span>'
      + '<button type="button" onclick="removeEchVerif(\'' + escapeHtml(v) + '\')" title="Retirer">&times;</button></div>';
  }).join('');
  var countEl = document.getElementById('ech-verif-count');
  if (countEl) {
    var diff = _computeDiff(depart, _echVerif);
    var txt = _echVerif.length + ' scanné' + (_echVerif.length !== 1 ? 's' : '');
    if (diff.manquants.length) txt += ' — <span style="color:var(--te)">' + diff.manquants.length + ' manquant' + (diff.manquants.length !== 1 ? 's' : '') + '</span>';
    if (diff.inattendus.length) txt += ' — <span style="color:var(--warning,#b97309)">' + diff.inattendus.length + ' inattendu' + (diff.inattendus.length !== 1 ? 's' : '') + '</span>';
    countEl.innerHTML = txt;
  }
}

function _computeDiff(depart, reception) {
  var manquants  = depart.filter(function(v) { return reception.indexOf(v) === -1; });
  var inattendus = reception.filter(function(v) { return depart.indexOf(v) === -1; });
  return { manquants: manquants, inattendus: inattendus };
}

export function getEchVerifNcData() {
  if (!_echEnvoiCourant) return null;
  var depart = _echEnvoiCourant.echantillonsDepart || [];
  var nbREl = document.getElementById('ech-nb-recu');
  var nbRecu = nbREl ? parseInt(nbREl.value) : NaN;
  if (isNaN(nbRecu) || nbRecu === depart.length) return null;
  var diff = _computeDiff(depart, _echVerif);
  var lines = [];
  if (diff.manquants.length) lines.push(diff.manquants.length + ' échantillon' + (diff.manquants.length !== 1 ? 's' : '') + ' manquant' + (diff.manquants.length !== 1 ? 's' : '') + ' : ' + diff.manquants.join(', ') + '.');
  if (diff.inattendus.length) lines.push(diff.inattendus.length + ' échantillon' + (diff.inattendus.length !== 1 ? 's' : '') + ' inattendu' + (diff.inattendus.length !== 1 ? 's' : '') + ' : ' + diff.inattendus.join(', ') + '.');
  if (!lines.length) lines.push('Discordance de comptage : ' + depart.length + ' expédié(s), ' + nbRecu + ' reçu(s).');
  return { commentaire: lines.join(' '), reception: _echVerif.slice() };
}

export function resetEchReceptionSection() {
  _echEnvoiCourant = null;
  _echVerif = [];
  var wrap = document.getElementById('ech-recep-wrap');
  if (wrap) wrap.style.display = 'none';
  var verifWrap = document.getElementById('ech-verif-wrap');
  if (verifWrap) verifWrap.style.display = 'none';
}

// ── Section départ — Édition ──────────────────────────────────────────────────

export function initEchDepartEdit(envoi) {
  _echDepartEdit = (envoi.echantillonsDepart || []).slice();
  var wrap = document.getElementById('ech-edit-depart-wrap');
  if (!wrap) return;
  var isHsilp = envoi.numero && envoi.numero.indexOf('HSILP') === 0;
  var hasModule = (window.CFG && (window.CFG.echantillonsEnabledLabs || [])).indexOf(envoi.expId) !== -1;
  wrap.style.display = (isHsilp && hasModule) ? '' : 'none';
  renderEchDepartEditChips();
}

export function addEchDepartEdit() {
  var inp = document.getElementById('ech-edit-depart-input');
  var errEl = document.getElementById('ech-edit-depart-err');
  var v = (inp ? inp.value.trim() : '').toUpperCase();
  if (errEl) errEl.classList.remove('show');
  if (!v) return;
  if (_echDepartEdit.indexOf(v) !== -1) {
    if (errEl) { errEl.textContent = 'Ce code est déjà dans la liste.'; errEl.classList.add('show'); }
    return;
  }
  _echDepartEdit.push(v);
  if (inp) inp.value = '';
  renderEchDepartEditChips();
  if (inp) inp.focus();
}

export function removeEchDepartEdit(v) { _echDepartEdit = _echDepartEdit.filter(function(x) { return x !== v; }); renderEchDepartEditChips(); }

export function renderEchDepartEditChips() {
  _renderChips('ech-edit-depart-chips', _echDepartEdit, 'removeEchDepartEdit');
  _updateCount('ech-edit-depart-count', _echDepartEdit);
}

export function getEchantillonsDepartEdit() { return _echDepartEdit.slice(); }
