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
import { libelleRole, motifRefusMotDePasse, messageErreurEdge } from './utils.js';

var INACT_DELAY = 15 * 60 * 1000; // 15 min d'inactivité → déconnexion

// ── Turnstile (captcha Cloudflare sur le login) ──────────────────────────────
// Le widget est rendu par onloadTurnstileCallback (appelé par le script
// Cloudflare une fois chargé). Le token est consommé à chaque tentative.
var _turnstileWidgetId = null;

window._doTurnstileRender = function() {
  var siteKey = window.TURNSTILE_SITE_KEY;
  var container = document.getElementById('login-turnstile');
  if (!siteKey || !container || !window.turnstile) return;
  try {
    _turnstileWidgetId = window.turnstile.render('#login-turnstile', {
      sitekey: siteKey,
      theme:   'auto',
      size:    'normal',
    });
  } catch (e) {
    console.warn('[auth] Turnstile init échouée :', e);
  }
};
// Si Turnstile a chargé avant ce module (race condition async) :
if (window._turnstilePending) window._doTurnstileRender();

function _getTurnstileToken() {
  if (!window.turnstile || _turnstileWidgetId === null) return '';
  try { return window.turnstile.getResponse(_turnstileWidgetId) || ''; }
  catch (_) { return ''; }
}

function _resetTurnstile() {
  if (!window.turnstile || _turnstileWidgetId === null) return;
  try { window.turnstile.reset(_turnstileWidgetId); } catch (_) {}
}

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
// Le login passe par l'edge function `auth-gate` qui :
//   - applique le rate-limit serveur (5 échecs / 15 min par employee_id)
//   - valide le token Turnstile (via Supabase Auth captcha)
//   - relaie à signInWithPassword côté serveur
// Le client récupère les tokens et active la session via setSession().

function _showLoginError(msg, durationMs) {
  var el = document.getElementById('lerr');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (durationMs) setTimeout(function() { el.style.display = 'none'; }, durationMs);
}

export async function seConnecter() {
  var id = document.getElementById('lid').value.trim();
  var pw = document.getElementById('lpw').value;
  if (!id || !pw) return;

  // Captcha obligatoire, sans condition : auth-gate l'exige et le vérifie
  // lui-même côté serveur. Ce test ne fait qu'éviter un aller-retour inutile et
  // donner un message clair plutôt qu'un 400.
  var captchaToken = _getTurnstileToken();
  if (!captchaToken) {
    _showLoginError('Veuillez compléter le captcha avant de vous connecter.', 5000);
    return;
  }

  window.spin(true);
  try {
    var resp = await fetch(window.EDGE_URL + '/auth-gate', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       window.SUPABASE_KEY,
      },
      body: JSON.stringify({
        employee_id:   id,
        password:      pw,
        captcha_token: captchaToken,
      }),
    });
    // Le mot de passe ne reste pas dans le DOM pendant la session : vidé dès la
    // réponse reçue, quelle qu'elle soit (après le fetch, pour que le
    // gestionnaire de mots de passe puisse encore proposer l'enregistrement).
    _viderMotDePasseLogin();
    pw = null;

    var data = null;
    try { data = await resp.json(); } catch (_) { data = {}; }
    if (!data || typeof data !== 'object') data = {};

    // Configuration serveur absente ou invalide (auth-gate échoue fermé, 503) :
    // ce n'est pas une erreur d'identifiants, l'utilisateur ne doit pas croire
    // que son mot de passe est en cause.
    if (resp.status === 503 || data.error === 'service_unavailable') {
      window.spin(false);
      _resetTurnstile();
      _showLoginError('Service momentanément indisponible. Réessayez plus tard ; si le problème persiste, prévenez un administrateur.', 8000);
      return;
    }

    // Le verrouillage par identifiant a ete retire cote serveur : il etait
    // attribue a la victime et non au demandeur, donc un tiers pouvait refuser
    // la connexion d'un compte choisi. Le captcha, exige a chaque tentative, le
    // remplace. Il n'y a donc plus de branche « trop de tentatives » ici, et
    // plus aucun champ de saisie desactive par le serveur.
    if (data && typeof data.error === 'string' && data.error.indexOf('captcha') === 0) {
      window.spin(false);
      _resetTurnstile();
      _showLoginError(
        data.error === 'captcha_unavailable'
          ? 'La verification anti-robot est momentanement indisponible. Reessayez dans quelques minutes.'
          : 'Verification anti-robot echouee. Veuillez refaire le captcha.',
        6000,
      );
      return;
    }

    if (!resp.ok || !data || !data.access_token) {
      window.spin(false);
      _resetTurnstile();
      _showLoginError('Identifiants incorrects ou compte désactivé.', 4000);
      return;
    }

    // Active la session côté client
    var setRes = await state.sb.auth.setSession({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
    });
    if (setRes.error || !setRes.data || !setRes.data.user) {
      window.spin(false);
      _showLoginError('Erreur lors de l\'ouverture de session. Réessayez.', 6000);
      return;
    }

    await loadProfileAndInit(setRes.data.user.id);
  } catch(e) {
    console.error('[OPTILAB] login:', e);
    _viderMotDePasseLogin();
    window.spin(false);
    _resetTurnstile();
    _showLoginError('Erreur réseau. Vérifiez votre connexion et réessayez.', 6000);
  }
}

function _viderMotDePasseLogin() {
  var el = document.getElementById('lpw');
  if (el) el.value = '';
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

// Le drapeau must_change_password n'est plus modifiable par le client : tant
// qu'il est levé, la base refuse tout droit au compte. Le changement passe donc
// par la fonction Edge manage-user (action change_own_password, jeton de
// l'utilisateur en en-tête, même mécanisme que callEdge), qui fixe le mot de
// passe puis efface le drapeau côté serveur.
//
// manage-user change le mot de passe par l'API utilisateur de Supabase Auth
// (PUT /auth/v1/user) : la session EN COURS est conservée, seules les autres
// sont révoquées. Le cas normal est donc : rafraîchir la session (jeton neuf),
// puis recharger le profil depuis la base (l'objet en mémoire date d'avant le
// changement). Le renvoi vers la connexion ne sert que si ce rafraîchissement
// échoue malgré tout (session expirée entre-temps, réseau).
//
// Refus du serveur : son message est affiché tel quel. manage-user ne renvoie
// que des messages rédigés pour l'utilisateur (« doit être différent de
// l'actuel » quand l'employé ressaisit son mot de passe temporaire, mot de
// passe trop court ou trop long…) ou un message générique avec une référence.
export async function enregistrerMotDePasse() {
  var i1 = document.getElementById('npw1');
  var i2 = document.getElementById('npw2');
  var p1 = i1.value;
  var p2 = i2.value;
  var el = document.getElementById('cperr');
  el.style.display = 'none';
  if (!p1) { el.textContent = 'Saisissez un mot de passe.'; el.style.display = 'block'; return; }
  var motif = motifRefusMotDePasse(p1);
  if (motif) { el.textContent = motif; el.style.display = 'block'; return; }
  if (p1 !== p2) { el.textContent = 'Les mots de passe ne correspondent pas.'; el.style.display = 'block'; return; }
  window.spin(true);
  var res;
  try {
    res = await window.callEdge('change_own_password', { new_password: p1 });
  } catch(e) {
    res = null;
  }
  // Champs vidés après usage, quel que soit le résultat.
  p1 = p2 = null; i1.value = ''; i2.value = '';
  var statut = res ? res._status : 0;
  if (statut === 401) {
    // Session absente, expirée ou révoquée : le mot de passe n'a pas été changé.
    await _retourConnexionDepuisCpw('Session expirée. Reconnectez-vous avec votre mot de passe actuel, puis choisissez-en un nouveau.');
    return;
  }
  // 409 : aucun changement n'est plus requis (un essai précédent a abouti même
  // si sa réponse s'est perdue) ; on recharge le profil comme après un succès.
  if ((!res || res.success !== true) && statut !== 409) {
    window.spin(false);
    el.textContent = messageErreurEdge(res, 'Le mot de passe n\'a pas pu être enregistré. Réessayez ou contactez votre responsable.');
    el.style.display = 'block';
    return;
  }
  try {
    var rf = await state.sb.auth.refreshSession();
    var ses = rf && !rf.error && rf.data ? rf.data.session : null;
    if (ses && ses.user) { await loadProfileAndInit(ses.user.id); return; }
  } catch(e) {
    console.error('[OPTILAB] enregistrerMotDePasse (session):', e);
  }
  // Rafraîchissement impossible : reconnexion avec le nouveau mot de passe.
  await _retourConnexionDepuisCpw('Mot de passe enregistré. Connectez-vous avec votre nouveau mot de passe.');
}

// Quitte l'écran de changement imposé vers la connexion, sans session ouverte.
async function _retourConnexionDepuisCpw(message) {
  try { await state.sb.auth.signOut(); } catch(e) {}
  state.currentUser = null;
  _resetTurnstile();
  window.spin(false);
  window.showScr('login');
  _showLoginError(message);
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
    var _cbSilp = document.getElementById('cfg-silp-print-bordereau'); if (_cbSilp) _cbSilp.checked = !!window.CFG.silpPrintBordereau;
    document.getElementById('cfg-msg-login').value         = window.CFG.messages.login;
    document.getElementById('cfg-msg-home').value          = window.CFG.messages.home;
    window.mdeUpdate('login'); window.mdeUpdate('home');

    var bT = document.getElementById('brd-titre');         if (bT)  bT.value  = window.CFG.bordereau.titre;
    var bP = document.getElementById('brd-pli');           if (bP)  bP.value  = window.CFG.bordereau.pli;
    var bC = document.getElementById('brd-canutec');       if (bC)  bC.value  = window.CFG.bordereau.canutec;
    var bCL  = document.getElementById('brd-canutec-label');    if (bCL)  bCL.value  = window.CFG.bordereau.canutecLabel  || 'Urgences 24h';
    var bCLE = document.getElementById('brd-canutec-label-en'); if (bCLE) bCLE.value = window.CFG.bordereau.canutecLabelEn || 'Emergency 24h';
    var bW   = document.getElementById('brd-warn-size');        if (bW)   bW.checked = window.CFG.bordereau.warnSize !== false;

    window.renderCfgSpec(); window.renderCfgFormatsAll();

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
    setTimeout(function() { if (window.tourMaybeAutoStart) window.tourMaybeAutoStart(); }, 1000);
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
  ['npw1', 'npw2'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  _resetTurnstile(); // le jeton de la connexion précédente est déjà consommé
  document.getElementById('lerr').style.display  = 'none';
  document.getElementById('rresult').style.display = 'none';
  document.getElementById('rnum').value = '';
  window.closeGMod(); window.showScr('login');
}
