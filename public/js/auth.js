// ── AUTH.JS ───────────────────────────────────────────────────────────────────
// Authentification, session, changement de mot de passe, inactivité, rôles.
//
// Dépendances :
//   state.js  — currentUser, activeLabo, sb, canalRealtime, timerInactivite, envois, laboratoires, cacheModals, LOGIN_PHOTOS
//   utils.js  — libelleRole (libellé du rôle)
//
// Appels vers window.* (fonctions pas encore extraites de app.js) :
//   spin, showScr, closeGMod, loadConfig, loadLabs, loadEnvois,
//   renderCfgSpec, renderCfgFormats, renderCfgHsilpFormat,
//   populateSels, updateExpAddr, updateThemeBtn,
//   initHGMode, initNlistValidation, mdeUpdate, showPanel
// ─────────────────────────────────────────────────────────────────────────────

import { state } from './state.js';
import { libelleRole } from './utils.js';

var INACT_DELAY = 15 * 60 * 1000; // 15 min d'inactivité → déconnexion

// ── Rate limiting login ───────────────────────────────────────────────────────

var _loginAttempts  = 0;
var _loginLocked    = false;
var _loginLockUntil = 0;

// ── Vérification des rôles ────────────────────────────────────────────────────

export function estAdmin() { return state.currentUser && state.currentUser.role === 'admin'; }
export function estGrappe()     { return state.currentUser && (state.currentUser.role === 'superviseur_grappe' || state.currentUser.role === 'admin'); }
export function estSuperviseur()     { return state.currentUser && (state.currentUser.role === 'superviseur_labo'   || state.currentUser.role === 'superviseur_grappe' || state.currentUser.role === 'admin'); }

// ── Fond d'écran de la page de connexion ─────────────────────────────────────

export function initLoginBg() {
  var el    = document.getElementById('login-bg');
  var cpwEl = document.getElementById('cpw-bg');
  var labEl = document.getElementById('labo-bg');
  if (!el || !state.LOGIN_PHOTOS.length) return;
  var entry  = state.LOGIN_PHOTOS[Math.floor(Math.random() * state.LOGIN_PHOTOS.length)];
  var url    = typeof entry === 'string' ? entry : entry.url;
  var credit = typeof entry === 'string' ? '' : entry.credit || '';
  ['login-credit', 'cpw-credit'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = credit; el.style.display = credit ? 'inline-flex' : 'none'; }
  });
  var img = new Image();
  img.onload = function() {
    el.style.backgroundImage = 'url(' + url + ')'; el.classList.add('loaded');
    if (cpwEl) { cpwEl.style.backgroundImage = 'url(' + url + ')'; cpwEl.classList.add('loaded'); }
    if (labEl) { labEl.style.backgroundImage = 'url(' + url + ')'; labEl.classList.add('loaded'); }
  };
  img.onerror = function() {
    el.classList.add('loaded');
    if (cpwEl) cpwEl.classList.add('loaded');
    if (labEl) labEl.classList.add('loaded');
  };
  img.src = url;
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function seConnecter() {
  var id = document.getElementById('lid').value.trim();
  var pw = document.getElementById('lpw').value;
  if (!id || !pw) return;
  if (_loginLocked && Date.now() < _loginLockUntil) {
    var secs = Math.ceil((_loginLockUntil - Date.now()) / 1000);
    var el = document.getElementById('lerr');
    el.textContent = 'Trop de tentatives. Réessayez dans ' + secs + ' secondes.';
    el.style.display = 'block'; return;
  }
  window.spin(true);
  try {
    var r = await state.sb.auth.signInWithPassword({ email: id.toLowerCase() + '@optilab.internal', password: pw });
    if (r.error) {
      window.spin(false);
      _loginAttempts++;
      if (_loginAttempts >= 5) { _loginLocked = true; _loginLockUntil = Date.now() + 30000; _loginAttempts = 0; setTimeout(function() { _loginLocked = false; }, 30000); }
      var el = document.getElementById('lerr');
      el.textContent = _loginAttempts >= 3
        ? 'Identifiants incorrects. Encore ' + Math.max(0, 5 - _loginAttempts) + ' tentative(s) avant verrouillage.'
        : 'Identifiants incorrects ou compte désactivé.';
      el.style.display = 'block'; setTimeout(function() { el.style.display = 'none'; }, 4000); return;
    }
    _loginAttempts = 0; _loginLocked = false;
    await loadProfileAndInit(r.data.user.id);
  } catch(e) {
    console.error('[OPTILAB] login:', e);
    window.spin(false);
    var el = document.getElementById('lerr');
    el.textContent = 'Erreur réseau. Vérifiez votre connexion et réessayez.';
    el.style.display = 'block'; setTimeout(function() { el.style.display = 'none'; }, 6000);
  }
}

// ── Chargement du profil ──────────────────────────────────────────────────────

export async function loadProfileAndInit(uid) {
  try {
    var r = await state.sb.from('profiles')
      .select('*,lab:labo_id(id,name),memberships:user_lab_memberships(labo_id,lab_role,lab:labo_id(id,name))')
      .eq('id', uid).single();
    if (r.error || !r.data) { try { await state.sb.auth.signOut(); } catch(e) {} window.spin(false); window.showScr('login'); return; }
    var p = r.data;
    if (!p.active) {
      try { await state.sb.auth.signOut(); } catch(e) {}
      window.spin(false);
      var el = document.getElementById('lerr'); el.textContent = 'Compte désactivé.'; el.style.display = 'block'; return;
    }
    // Construire labs depuis memberships (V2) ou labo_ids (fallback legacy)
    p.labMemberships = p.memberships || [];
    if (p.labMemberships.length) {
      p.labs    = p.labMemberships.map(function(m) { return m.lab; }).filter(Boolean);
      p.labo_ids = p.labMemberships.map(function(m) { return m.labo_id; });
    } else {
      var ids = (p.labo_ids && p.labo_ids.length > 0) ? p.labo_ids : (p.labo_id ? [p.labo_id] : []);
      if (ids.length > 1) {
        var lr = await state.sb.from('laboratories').select('id,name').in('id', ids);
        p.labs = lr.data || (p.lab ? [p.lab] : []);
      } else {
        p.labs = p.lab ? [p.lab] : [];
      }
    }
    if (p.must_change_password) { state.currentUser = p; window.spin(false); window.showScr('cpw'); return; }
    await finaliserConnexion(p);
  } catch(e) {
    console.error('[OPTILAB] loadProfile:', e);
    try { await state.sb.auth.signOut(); } catch(e) {}
    window.spin(false); window.showScr('login');
  }
}

// ── Changement de mot de passe forcé ─────────────────────────────────────────

export async function enregistrerMotDePasse() {
  var p1 = document.getElementById('npw1').value;
  var p2 = document.getElementById('npw2').value;
  var el = document.getElementById('cperr');
  if (!p1) { el.textContent = 'Saisissez un mot de passe.'; el.style.display = 'block'; return; }
  if (!state.currentUser.is_test && p1.length < 8) { el.textContent = 'Le mot de passe doit contenir au moins 8 caractères.'; el.style.display = 'block'; return; }
  if (p1 !== p2) { el.textContent = 'Les mots de passe ne correspondent pas.'; el.style.display = 'block'; return; }
  window.spin(true);
  try {
    var r = await state.sb.auth.updateUser({ password: p1 });
    if (r.error) { window.spin(false); el.textContent = r.error.message; el.style.display = 'block'; return; }
    await state.sb.from('profiles').update({ must_change_password: false }).eq('id', state.currentUser.id);
    state.currentUser.must_change_password = false; await finaliserConnexion(state.currentUser);
  } catch(e) {
    console.error('[OPTILAB] enregistrerMotDePasse:', e);
    window.spin(false); el.textContent = 'Erreur réseau. Réessayez.'; el.style.display = 'block';
  }
}

// ── Initialisation post-connexion ─────────────────────────────────────────────

// Données en attente pendant la sélection de labo (multi-labo uniquement)
var _pendingP     = null;
var _pendingLabos = [];
var _laboFromLogin = true;

export async function finaliserConnexion(p) {
  try {
    state.currentUser = p;
    var labos = p.labs && p.labs.length ? p.labs : (p.lab ? [p.lab] : []);

    // Charger config + labs (indépendants du labo actif)
    await Promise.all([window.loadConfig(), window.loadLabs()]);
    // Déterminer la grappe active depuis le labo principal, puis charger la config grappe
    var _pLab = labos[0] && state.laboratoires && state.laboratoires.find(function(l) { return l.id === (labos[0] || {}).id; });
    var _gId  = _pLab && _pLab.grappe_id;
    if (_gId) state.activeGrappeId = _gId;
    if (window.loadGrappeConfig) await window.loadGrappeConfig(_gId);

    if (labos.length > 1) {
      var savedId = localStorage.getItem('optilab-labo-' + p.id);
      var savedLabo = savedId && labos.find(function(l) { return l.id === savedId; });
      if (savedLabo) {
        state.activeLabo = savedLabo;
        await window.loadEnvois();
        await _completeInit(p);
        return;
      }
      // Aucun labo mémorisé : afficher la page de sélection
      _pendingP = p;
      _showLaboPicker(labos, true);
      window.spin(false);
      return;
    }

    // Labo unique : continuer directement
    state.activeLabo = labos[0] || null;
    await window.loadEnvois();
    await _completeInit(p);
  } catch(e) {
    console.error('[OPTILAB] finaliserConnexion:', e);
    window.spin(false); window.showScr('login');
  }
}

// Phase 2 : rendu de l'UI et affichage de l'app (appelée après que activeLabo est défini)
async function _completeInit(p) {
  try {
    var laboName = state.activeLabo ? state.activeLabo.name : 'Global';

    var ini = p.nom.split(' ').map(function(x) { return x[0] || ''; }).slice(0, 2).join('').toUpperCase();
    var av  = document.getElementById('uav');
    av.textContent = ini || p.nom[0].toUpperCase();
    av.className = 'uav' + (p.role === 'admin' ? ' sa' : p.role === 'superviseur_grappe' ? ' sg' : p.role === 'superviseur_labo' ? ' sl' : '');

    document.getElementById('uname').textContent = p.nom;
    document.getElementById('ulabo').textContent = laboName + ' · ' + libelleRole(p.role);
    document.getElementById('lexp').value = laboName;
    var _hLexp = document.getElementById('h-lexp'); if (_hLexp) _hLexp.value = laboName;
    document.getElementById('rlabo').textContent = laboName;
    document.getElementById('rpar').value = p.nom;

    // Indicateur de labo dans la sidebar (visible si multi-labo)
    var labos = p.labs && p.labs.length ? p.labs : (p.lab ? [p.lab] : []);
    _updateLabIndicator(labos);

    document.getElementById('nav-utilisateurs').classList.toggle('gone', !estSuperviseur());
    document.getElementById('nav-kpi').classList.toggle('gone', !estGrappe());
    document.getElementById('nav-config').classList.toggle('gone', !estAdmin());
    document.getElementById('nav-sep-admin').classList.toggle('gone', !estSuperviseur());
    document.getElementById('nav-stl-admin').classList.toggle('gone', !estSuperviseur());
    var _bdOn = !!(window.CFG && Array.isArray(window.CFG.bonsDepartEnabledLabs) && window.CFG.bonsDepartEnabledLabs.indexOf(state.activeLaboId) !== -1) || estGrappe();
    document.getElementById('nav-bons-depart').classList.toggle('gone', !_bdOn);
    document.getElementById('nav-sep-bd').classList.toggle('gone', !_bdOn);
    document.getElementById('nav-historique').classList.toggle('gone', !estGrappe() && !estAdmin());
    document.getElementById('nav-hg-historique').classList.toggle('gone', !estGrappe() && !estAdmin());

    document.getElementById('cfg-name').value              = window.CFG.name;
    document.getElementById('cfg-sub').value               = window.CFG.subtitle;
    document.getElementById('cfg-alarm-r').value           = window.CFG.alarmR;
    document.getElementById('cfg-alarm-p').value           = window.CFG.alarmP;
    document.getElementById('cfg-print-bordereau').checked = window.CFG.printBordereau;
    document.getElementById('cfg-msg-login').value         = window.CFG.messages.login;
    document.getElementById('cfg-msg-home').value          = window.CFG.messages.home;
    window.mdeUpdate('login'); window.mdeUpdate('home');

    var bT = document.getElementById('brd-titre');         if (bT)  bT.value  = window.CFG.bordereau.titre;
    var bP = document.getElementById('brd-pli');           if (bP)  bP.value  = window.CFG.bordereau.pli;
    var bC = document.getElementById('brd-canutec');       if (bC)  bC.value  = window.CFG.bordereau.canutec;
    var bCL  = document.getElementById('brd-canutec-label');    if (bCL)  bCL.value  = window.CFG.bordereau.canutecLabel  || 'Urgences 24h';
    var bCLE = document.getElementById('brd-canutec-label-en'); if (bCLE) bCLE.value = window.CFG.bordereau.canutecLabelEn || 'Emergency 24h';
    var bW   = document.getElementById('brd-warn-size');        if (bW)   bW.checked = window.CFG.bordereau.warnSize !== false;

    window.renderCfgSpec(); window.renderCfgFormats(); window.renderCfgHsilpFormat();

    var td = new Date(), fd = new Date(td); fd.setDate(fd.getDate() - 5);
    document.getElementById('pfrom').value  = fd.toISOString().slice(0, 10);
    document.getElementById('pto').value    = td.toISOString().slice(0, 10);
    document.getElementById('hfrom').value  = fd.toISOString().slice(0, 10);
    document.getElementById('hto').value    = td.toISOString().slice(0, 10);

    window.populateSels(); window.updateExpAddr();
    if (p.theme) { document.documentElement.setAttribute('data-theme', p.theme); localStorage.setItem('optilab-theme', p.theme); }
    window.updateThemeBtn();

    var _panel = sessionStorage.getItem('optilab-panel') || 'nouveau';
    if (_panel === 'utilisateurs' && !estSuperviseur())   _panel = 'nouveau';
    if (_panel === 'config'       && !estAdmin()) _panel = 'nouveau';

    window.spin(false); window.showScr('app'); window.initHGMode(); window.showPanel(_panel); window.initNlistValidation(); _inactStart();
  } catch(e) {
    console.error('[OPTILAB] _completeInit:', e);
    window.spin(false); window.showScr('login');
  }
}

// ── Inactivité ────────────────────────────────────────────────────────────────

var _inactActive = false;

function _inactReset() {
  if (!state.currentUser) return;
  clearTimeout(state.timerInactivite);
  state.timerInactivite = setTimeout(function() { if (state.currentUser) seDeconnecter(); }, INACT_DELAY);
}

function _inactStart() {
  if (_inactActive) return;
  _inactActive = true;
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(function(ev) {
    document.addEventListener(ev, _inactReset, { passive: true, capture: true });
  });
  _inactReset();
}

function _inactStop() {
  clearTimeout(state.timerInactivite);
  state.timerInactivite = null;
  _inactActive = false;
}

// ── Multi-labo : page de sélection de laboratoire ────────────────────────────

function _showLaboPicker(labos, fromLogin) {
  _pendingLabos = labos;
  _laboFromLogin = fromLogin;
  var container = document.getElementById('labo-pick-labs');
  if (container) {
    container.innerHTML = '';
    labos.forEach(function(lab) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'labo-pick-btn' + (state.activeLabo && lab.id === state.activeLabo.id ? ' current' : '');
      btn.textContent = lab.name;
      btn.onclick = function() { choisirLabo(lab); };
      container.appendChild(btn);
    });
  }
  var cancelBtn = document.getElementById('labo-pick-cancel');
  if (cancelBtn) cancelBtn.style.display = fromLogin ? 'none' : '';
  window.showScr('labo');
}

function _updateLabIndicator(labos) {
  var el = document.getElementById('lab-indicator'); if (!el) return;
  el.style.display = labos && labos.length > 1 ? '' : 'none';
  var nameEl = document.getElementById('lab-ind-name');
  if (nameEl && state.activeLabo) nameEl.textContent = state.activeLabo.name;
}

// Appelé quand l'utilisateur clique sur un labo dans la page de sélection
export async function choisirLabo(lab) {
  state.activeLabo = lab;
  if (state.currentUser) localStorage.setItem('optilab-labo-' + state.currentUser.id, lab.id);
  if (_laboFromLogin && _pendingP) {
    window.spin(true);
    var p = _pendingP; _pendingP = null;
    await window.loadEnvois();
    await _completeInit(p);
  } else {
    // Changement en cours de session
    _applyLaboChange(lab.name);
    window.populateSels();
    window.updateExpAddr();
    await window.loadEnvois();
    window.showScr('app');
  }
}

// Annuler le changement de labo (retour à l'app sans changer)
export function annulerChangementLabo() {
  window.showScr('app');
}

// Ouvrir la page de sélection de labo depuis la sidebar
export function changerLabo() {
  var labos = state.currentUser && state.currentUser.labs;
  if (!labos || labos.length <= 1) return;
  _showLaboPicker(labos, false);
}

// Expose pour saveUser (quand l'admin modifie ses propres labos)
export function initLabSwitch(labos) {
  _updateLabIndicator(labos);
}

function _applyLaboChange(laboName) {
  document.getElementById('ulabo').textContent = laboName + ' · ' + libelleRole(state.currentUser.role);
  var lexp = document.getElementById('lexp'); if (lexp) lexp.value = laboName;
  var hLexp = document.getElementById('h-lexp'); if (hLexp) hLexp.value = laboName;
  document.getElementById('rlabo').textContent = laboName;
  var nameEl = document.getElementById('lab-ind-name'); if (nameEl) nameEl.textContent = laboName;
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function seDeconnecter() {
  _inactStop();
  if (state.canalRealtime) { state.sb.removeChannel(state.canalRealtime); state.canalRealtime = null; }
  await state.sb.auth.signOut();
  state.currentUser = null; state.activeLabo = null; state.envois = []; state.cacheModals = {}; window._histPage = 0; state.laboratoires = [];
  _pendingP = null; _pendingLabos = [];
  var labInd = document.getElementById('lab-indicator'); if (labInd) labInd.style.display = 'none';
  document.getElementById('lid').value = '';
  document.getElementById('lpw').value = '';
  document.getElementById('lerr').style.display  = 'none';
  document.getElementById('rresult').style.display = 'none';
  document.getElementById('rnum').value = '';
  window.closeGMod(); window.showScr('login');
}
