// ── UI.JS ─────────────────────────────────────────────────────────────────────
// Navigation, toasts, modals, thème, spinner, clavier.
//
// Dépendances :
//   state.js  — currentUser, sb, canalRealtime, modeHG
//   utils.js  — escapeHtml
//   auth.js   — estAdmin, estGrappe, estSuperviseur
//
// Appels vers window.* (fonctions pas encore extraites de app.js) :
//   subscribeRT, renderResume, loadHistStats, loadHistPage, loadUsersAndRender,
//   renderCfgLabs, renderCfgTemps, renderCfgTrans, renderCfgBadges,
//   renderCfgTheme, renderCfgHgrappe, renderMonCompte, initHgSilpForm,
//   renderHGConfirmations, renderHGResume, loadHGHistStats, loadHGHistPage,
//   renderRecherche, initDashboard, cancelNoList, closeEditEnvoi, closeHGEditModal,
//   closeHGFaxModal, closeHGSuccessModal, printBordereau
// ─────────────────────────────────────────────────────────────────────────────

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { estAdmin, estGrappe, estSuperviseur } from './auth.js';

// ── Toasts ────────────────────────────────────────────────────────────────────

export function notifier(id, msg, t) { toast(msg, t === 'e' ? 'e' : 's'); }

export function toast(msg, type, duration) {
  type = type || 's'; duration = duration || 4000;
  var cls = type === 'e' ? 'toast-err' : type === 'i' ? 'toast-info' : 'toast-ok';
  var icons = {
    's': '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8l4 4 8-8"/><\/svg>',
    'e': '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 10v1"/><\/svg>',
    'i': '<svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/><\/svg>',
  };
  var el = document.createElement('div');
  el.className = 'toast ' + cls;
  var body = document.createElement('div');
  body.className = 'toast-body';
  body.innerHTML = (icons[type] || icons['s']) + '<span style="flex:1">' + escapeHtml(msg) + '</span>'
    + '<button class="toast-close" onclick="removeToast(this.parentNode.parentNode)">&times;<\/button>';
  var bar = document.createElement('div');
  bar.className = 'toast-bar';
  bar.style.animationDuration = duration + 'ms';
  el.appendChild(body); el.appendChild(bar);
  var c = document.getElementById('toast-container');
  if (c) c.appendChild(el);
  setTimeout(function() { removeToast(el); }, duration);
}

export function removeToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('removing');
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
}

// ── Spinner & écrans ──────────────────────────────────────────────────────────

export function spin(on) {
  document.getElementById('spinner').classList.toggle('done', !on);
}

export function showScr(s) {
  ['scr-login', 'scr-cpw', 'scr-labo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('gone', id !== 'scr-' + s);
  });
  document.getElementById('scr-app').classList.toggle('on', s === 'app');
}

// ── Navigation panels — showPanel(n) ──────────────────────────────────────────

export function showPanel(n) {
  if (n === 'hsilp')    n = 'nouveau';
  if (n === 'hg-hsilp') n = 'hg-silp';
  if (!document.getElementById('panel-' + n)) n = state.modeHG ? 'hg-silp' : 'nouveau';
  sessionStorage.setItem('optilab-panel', n);
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nbtn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('panel-' + n).classList.add('active');
  var navEl = document.getElementById('nav-' + n); if (navEl) navEl.classList.add('active');
  document.getElementById('uchip-btn').classList.toggle('active', n === 'moncompte');
  var _aideEl = document.getElementById('nav-aide'); if (_aideEl) _aideEl.classList.toggle('active', n === 'aide');

  if (window._RT_PANELS && window._RT_PANELS.includes(n)) {
    if (!state.canalRealtime) window.subscribeRT();
  } else {
    if (state.canalRealtime) { state.sb.removeChannel(state.canalRealtime); state.canalRealtime = null; }
  }

  if (n === 'reception')      { setTimeout(function() { var rn = document.getElementById('rnum'); if (rn) rn.focus(); }, 50); }
  if (n === 'historique')     { if (!estGrappe() && !estAdmin()) { showPanel(state.modeHG ? 'hg-silp' : 'nouveau'); return; } window.loadHistStats(); window.loadHistPage(0); }
  if (n === 'resume')         { window.renderResume(); }
  if (n === 'utilisateurs')   { window.loadUsersAndRender(); }
  if (n === 'config')         { window.renderCfgLabs(); window.renderCfgTemps(); window.renderCfgTrans(); window.renderCfgBadges(); window.renderCfgTheme(); window.renderCfgHgrappe(); window.renderCfgNotifications(); window.renderBonsDepartLabsToggle(); }
  if (n === 'moncompte')      { window.renderMonCompte(); }
  if (n === 'hg-silp')        { window.initHgSilpForm(); }
  if (n === 'hg-confirmations') { window.renderHGConfirmations(); }
  if (n === 'hg-resume')      { window.renderHGResume(); }
  if (n === 'hg-historique')  { if (!estGrappe() && !estAdmin()) { showPanel('hg-silp'); return; } window.loadHGHistStats(); window.loadHGHistPage(0); }
  if (n === 'kpi')            { if (!estGrappe()) { showPanel(state.modeHG ? 'hg-silp' : 'nouveau'); return; } window.initDashboard(); }
  if (n === 'bons-depart')   { var _bdOk = window.isBDEnabled && window.isBDEnabled() || estGrappe(); if (!_bdOk) { showPanel(state.modeHG ? 'hg-silp' : 'nouveau'); return; } window.initBonsDepart(); }
  if (n === 'recherche') {
    var hgR = document.getElementById('nav-hg-recherche'); if (hgR) hgR.classList.toggle('active', state.modeHG);
    var iR  = document.getElementById('nav-recherche');    if (iR)  iR.classList.toggle('active', !state.modeHG);
    window.renderRecherche();
  }
}

// ── Modal générale (gmod) ─────────────────────────────────────────────────────

export function closeGMod() {
  document.getElementById('gmod').classList.remove('show');
  if (window._gmodTrigger && window._gmodTrigger.focus) { window._gmodTrigger.focus(); }
  window._gmodTrigger = null;
}

// ── Thème clair / sombre ──────────────────────────────────────────────────────

var _SVG_SUN  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
var _SVG_MOON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function _isDarkNow() {
  var cur = document.documentElement.getAttribute('data-theme');
  if (cur === 'dark')  return true;
  if (cur === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches);
}

export function initTheme() {
  var saved = localStorage.getItem('optilab-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches)
    document.documentElement.setAttribute('data-theme', 'dark');
  updateThemeBtn();
}

export function toggleTheme() {
  var next = _isDarkNow() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('optilab-theme', next);
  updateThemeBtn();
  if (state.currentUser) state.sb.from('profiles').update({ theme: next }).eq('id', state.currentUser.id)
    .then(function() { if (state.currentUser) state.currentUser.theme = next; });
}

export function updateThemeBtn() {
  var isDark = _isDarkNow();
  var svg   = isDark ? _SVG_SUN : _SVG_MOON;
  var title = isDark ? 'Mode sombre — cliquer pour mode clair' : 'Mode clair — cliquer pour mode sombre';
  ['theme-btn', 'login-theme-btn', 'cpw-theme-btn'].forEach(function(id) {
    var btn = document.getElementById(id); if (!btn) return;
    btn.innerHTML = svg; btn.title = title; btn.classList.toggle('dark-active', isDark);
  });
}

// ── Clavier (Escape) ──────────────────────────────────────────────────────────

export function setupKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var hwmod  = document.getElementById('hsilp-warn-modal');
    var smod   = document.getElementById('success-modal');
    var hgsmod = document.getElementById('hg-success-modal');
    var hgfmod = document.getElementById('hg-fax-modal');
    var hgemod = document.getElementById('hg-edit-modal');
    var gmod   = document.getElementById('gmod');
    var cmod   = document.getElementById('confirm-modal');
    var ewmod  = document.getElementById('edit-envoi-modal');
    var annulmod = document.getElementById('annul-envoi-modal');
    if (hwmod  && hwmod.style.display  === 'flex')              { window.cancelNoList();          return; }
    if (annulmod && annulmod.style.display === 'flex')          { window.closeAnnulationEnvoi();  return; }
    if (ewmod  && ewmod.style.display  === 'flex')              { window.closeEditEnvoi();        return; }
    if (hgemod && hgemod.style.display === 'flex')              { window.closeHGEditModal(); return; }
    if (hgfmod && hgfmod.style.display === 'flex')              { window.closeHGFaxModal();  return; }
    if (hgsmod && hgsmod.style.display === 'flex') {
      if (document.getElementById('hg-printed-cb').checked) window.closeHGSuccessModal();
      return;
    }
    if (smod && smod.style.display === 'flex')                  { closeSuccessModal(); return; }
    if (gmod && gmod.classList.contains('show'))                { closeGMod();         return; }
    if (cmod && cmod.classList.contains('show')) {
      cmod.classList.remove('show');
      if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
    }
  });
}

// ── Modal de confirmation ─────────────────────────────────────────────────────

var _confirmResolve = null;

export function confirm2(title, msg, btnLabel, danger) {
  return new Promise(function(resolve) {
    _confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent   = msg;
    var okBtn = document.getElementById('confirm-ok');
    okBtn.textContent   = btnLabel || 'Confirmer';
    okBtn.style.background = danger === true ? 'var(--danger)' : danger === 'warn' ? 'var(--warning)' : 'var(--brand-azure-deep)';
    document.getElementById('confirm-modal').classList.add('show');
  });
}

export function setupConfirmModal() {
  var okBtn     = document.getElementById('confirm-ok');
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

// ── Modal succès envoi ────────────────────────────────────────────────────────

export function showSuccessModal(num) {
  var t  = document.getElementById('success-title-el');  if (t)  t.textContent  = 'Envoi enregistré';
  var cb = document.getElementById('success-close-btn'); if (cb) cb.textContent = 'Nouvel envoi';
  var msgEl = document.getElementById('success-modal-msg');
  if (msgEl) msgEl.innerHTML = 'N°&nbsp;<strong>' + escapeHtml(num) + '</strong> enregistré avec succès.';
  var pb = document.getElementById('success-print-btn');
  if (pb) {
    pb.style.display = window.CFG && window.CFG.printBordereau ? 'flex' : 'none';
    pb.onclick = function() { closeSuccessModal(); window.printBordereau(); };
  }
  document.getElementById('success-modal').style.display = 'flex';
}

export function closeSuccessModal() {
  document.getElementById('success-modal').style.display = 'none';
}

// ── Validation inline N° liste SILP ──────────────────────────────────────────

export function initNlistValidation() {
  var input = document.getElementById('nlist');
  if (!input) return;
  input.oninput = function() {
    var v = this.value.trim();
    var errEl = document.getElementById('nlist-err');
    this.classList.remove('invalid', 'valid');
    if (errEl) errEl.classList.remove('show');
    if (!v) return;
    if (!/^\d+$/.test(v)) {
      this.classList.add('invalid');
      if (errEl) { errEl.textContent = 'Chiffres uniquement.'; errEl.classList.add('show'); }
      return;
    }
    if (window.envois && window.envois.find(function(e) { return e.numero === v; })) {
      this.classList.add('invalid');
      if (errEl) { errEl.textContent = 'Ce numéro correspond déjà à un envoi.'; errEl.classList.add('show'); }
      return;
    }
    if (v.length >= 4) this.classList.add('valid');
  };
}

export function switchAideTab(tab) {
  document.querySelectorAll('.aide-tab').forEach(function(b) {
    var active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.aide-tab-panel').forEach(function(p) {
    p.classList.toggle('gone', p.dataset.tab !== tab);
  });
}
