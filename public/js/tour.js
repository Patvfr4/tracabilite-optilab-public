import { state } from './state.js';
import { estAdmin, estGrappe, estSuperviseur } from './auth.js';

var TOUR_V  = 1;
var _active = false;
var _idx    = 0;
var _steps  = [];
var _prog   = null;  // cache

// 0 = technicien, 1 = superviseur_labo+, 2 = superviseur_grappe / admin
function _tier() {
  if (estAdmin() || estGrappe()) return 2;
  if (estSuperviseur()) return 1;
  return 0;
}

var _eg = function(rows) {
  return rows.map(function(r) {
    return '<div class="teg-row"><span class="teg-k">' + r[0] + '</span><span class="' + (r[2] || 'teg-v') + '"' + (r[3] ? ' style="' + r[3] + '"' : '') + '>' + r[1] + '</span></div>';
  }).join('');
};

var _ALL = [
  {
    id: 'welcome',
    title: 'Bienvenue dans Traçabilité OPTILAB',
    text: 'Ce parcours vous guide à travers les fonctions clés selon votre rôle. Utilisez ← → pour naviguer, ou « Passer » pour quitter.',
    target: null,
    tier: 0,
  },
  {
    id: 'sidebar',
    title: 'Navigation principale',
    text: 'La barre latérale donne accès à tous vos modules. Sur mobile, le bouton ☰ en haut à gauche l\'ouvre.',
    target: '.sidebar',
    pos: 'right',
    tier: 0,
  },
  {
    id: 'nouvel-envoi',
    title: 'Créer un envoi',
    text: '« Nouvel envoi » est le point de départ du flux de traçabilité intra-grappe. C\'est ici que commence chaque transfert de spécimens.',
    target: '#nav-nouveau',
    pos: 'right',
    tier: 0,
    before: function() { window.showPanel('nouveau'); },
    example: _eg([
      ['N° envoi',  'SILP-260618-00042', 'teg-mono'],
      ['Trajet',    'Matane → Rimouski'],
      ['Statut',    'En transit', 'teg-badge', 'background:#D7EEF9;color:#1B6E94'],
    ]),
  },
  {
    id: 'form-dest',
    title: 'Expéditeur & destinataire',
    text: 'Votre laboratoire est prérempli automatiquement. Sélectionnez le laboratoire destinataire dans la liste déroulante.',
    target: '#ldest-wrap',
    pos: 'bottom',
    tier: 0,
    before: function() { window.showPanel('nouveau'); },
    example: _eg([
      ['Expéditeur',   'Matane (AA006)'],
      ['Destinataire', 'Rimouski (AA000)'],
    ]),
  },
  {
    id: 'form-temp',
    title: 'Conditions de transport',
    text: 'Choisissez la température d\'envoi requise. Si le spécimen nécessite de la glace sèche, une option dédiée apparaît.',
    target: '#tpills-c',
    pos: 'bottom',
    tier: 0,
    before: function() { window.showPanel('nouveau'); },
    example: _eg([
      ['Température',  '🧊 Congelé (−20°C)'],
      ['Réfrigérant',  'Glace sèche (UN 1845)'],
    ]),
  },
  {
    id: 'form-silp',
    title: 'SILP & envoi urgent',
    text: 'Saisissez le ou les numéros de listes de repérage SIL-P. Si vous n\'en avez pas (Pathologie, Banque de Sang), cochez « Je n\'ai pas de liste SIL-P » — un numéro HSILP est attribué automatiquement. Pour un envoi urgent hors route normale, cochez la case dédiée.',
    target: '#nlist-wrap',
    pos: 'top',
    tier: 0,
    before: function() { window.showPanel('nouveau'); },
    example: _eg([
      ['Avec SILP',  '123456  ·  789012', 'teg-mono'],
      ['Sans SILP',  'HSILP-260618-00003 (auto)', 'teg-mono'],
      ['Urgent',     'ICR 70009 ✓', 'teg-v', 'color:#B45309'],
    ]),
  },
  {
    id: 'impression-intra',
    title: 'Étiquette & bordereau',
    text: 'Après enregistrement, imprimez l\'étiquette (à glisser dans la pochette), et/ou le bordereau complet (Selon la configuration). Pour les envois sans SIL-P (HSILP), les deux sont générés et imprimés ensemble automatiquement. Glissez le borderau dans le colis',
    target: '#tour-etq-preview',
    pos: 'right',
    tier: 0,
    before: function() {
      window.showPanel('nouveau');
      var pr = document.getElementById('tour-etq-preview');
      if (pr) pr.style.display = 'block';
    },
  },
  {
    id: 'reception',
    title: 'Réceptionner un envoi',
    text: 'Scannez ou saisissez le N° de liste SILP ou le N° d\'envoi. Si tout est conforme, cliquez « Confirmer la réception ». En cas de non-conformité (température, emballage, délai…), utilisez « Signaler un problème » — le labo expéditeur est notifié et l\'envoi passe en statut « Problème ».',
    target: '#rnum',
    pos: 'bottom',
    tier: 0,
    before: function() {
      var pr = document.getElementById('tour-etq-preview');
      if (pr) pr.style.display = 'none';
      window.showPanel('reception');
    },
    example: _eg([
      ['N° envoi',      'SILP-260618-00042', 'teg-mono'],
      ['Expéditeur',    'Matane (AA006)'],
      ['→ Conforme',    '✓ Confirmer la réception', 'teg-badge', 'background:#E1F2E8;color:#2E8B57'],
      ['→ Non-conforme','✗ Signaler un problème', 'teg-badge', 'background:#FEE2E2;color:#991B1B'],
    ]),
  },
  {
    id: 'resume',
    title: 'Résumé en temps réel',
    text: 'Vue d\'ensemble de l\'état des envois de votre labo : en transit, confirmés, en retard ou avec non-conformités. Mis à jour en temps réel.',
    target: '#nav-resume',
    pos: 'right',
    tier: 0,
    before: function() { window.showPanel('resume'); },
    example: _eg([
      ['En transit',  '3 envois'],
      ['⚠ En retard', '1 envoi — 22 h', 'teg-v', 'color:#B45309'],
      ['Reçus',       '8 envois'],
    ]),
  },
  {
    id: 'bons-depart',
    title: 'Bons de départ',
    text: 'Regroupez plusieurs envois en un seul colis pour un transporteur. Le DataMatrix imprimé permet de scanner l\'ensemble des colis en un geste.',
    target: '#nav-bons-depart',
    pos: 'right',
    tier: 1,
    before: function() {
      var el = document.getElementById('nav-bons-depart');
      if (el && !el.classList.contains('gone')) window.showPanel('bons-depart');
    },
    example: _eg([
      ['Bon',          'BD-2026-0047', 'teg-mono'],
      ['Transporteur', 'Guépard'],
      ['Envois',       '4 regroupés'],
    ]),
  },
  {
    id: 'kpi',
    title: 'Indicateurs de performance',
    text: 'Délais moyens de transit, taux de non-conformités, volumes par laboratoire. Filtrable par période et par labo.',
    target: '#nav-kpi',
    pos: 'right',
    tier: 2,
    before: function() {
      var el = document.getElementById('nav-kpi');
      if (el && !el.classList.contains('gone')) window.showPanel('kpi');
    },
    example: _eg([
      ['Délai moyen',   '4 h 12'],
      ['Taux NC',       '1,3 %'],
      ['Volume (30 j)', '247 envois'],
    ]),
  },
  {
    id: 'hg-silp',
    title: 'Mode Hors-grappe',
    text: 'Activez le mode Hors-grappe via le sélecteur en haut de la barre latérale pour accéder aux envois vers des laboratoires externes à la grappe.',
    target: '#mode-sw',
    pos: 'right',
    tier: 2,
    before: function() {
      if (window.modeHG) window.showPanel('hg-silp'); else window.setMode('hgrappe');
    },
    example: _eg([
      ['Mode actif', 'Hors-grappe', 'teg-badge', 'background:#FEF3C7;color:#92400E'],
      ['Accès',      'CHU, LSPQ, cliniques privées…'],
    ]),
  },
  {
    id: 'hg-form',
    title: 'Créer un envoi hors-grappe',
    text: 'Sélectionnez le laboratoire externe destinataire, le transporteur et les conditions de transport. Le F-G-74 est le formulaire officiel de transfert hors-grappe : il contient un QR code unique que le destinataire scanne pour confirmer la réception en ligne.',
    target: '#tour-fg74-preview',
    pos: 'right',
    tier: 2,
    before: function() {
      if (!window.modeHG) window.setMode('hgrappe');
      var fg = document.getElementById('tour-fg74-preview');
      if (fg) fg.style.display = 'block';
    },
  },
  {
    id: 'hg-silp-nums',
    title: 'Numéros SILP',
    text: 'Saisissez un à un les numéros de listes de repérage SILP à inclure dans l\'envoi. Si aucun numéro n\'est disponible (hors-corridor ou urgence), cochez l\'option dédiée.',
    target: '#hgs-nlist-wrap',
    pos: 'right',
    tier: 2,
    before: function() {
      var fg = document.getElementById('tour-fg74-preview');
      if (fg) fg.style.display = 'none';
      if (window.modeHG) window.showPanel('hg-silp'); else window.setMode('hgrappe');
    },
    example: _eg([
      ['Liste 1', '123456', 'teg-mono'],
      ['Liste 2', '789012', 'teg-mono'],
    ]),
  },
  {
    id: 'hg-confirmations',
    title: 'Confirmations de réception',
    text: 'Suivez en temps réel les accusés de réception des laboratoires externes. Chaque confirmation est horodatée et conservée pour audit ou litige.',
    target: '#nav-hg-confirmations',
    pos: 'right',
    tier: 2,
    before: function() {
      if (!window.modeHG) window.setMode('hgrappe');
      window.showPanel('hg-confirmations');
    },
    example: _eg([
      ['Destinataire', 'CHU de Québec'],
      ['Confirmé le',  '12 juin · 14 h 23'],
      ['Résultat',     'Conforme', 'teg-badge', 'background:#E1F2E8;color:#2E8B57'],
    ]),
  },
  {
    id: 'hg-resume',
    title: 'Résumé & historique hors-grappe',
    text: 'Vue d\'ensemble des envois en transit, confirmés, en retard ou non-conformes vers l\'externe. L\'historique permet de retrouver un bordereau ou d\'exporter les données.',
    target: '#nav-hg-resume',
    pos: 'right',
    tier: 2,
    before: function() {
      if (!window.modeHG) window.setMode('hgrappe');
      window.showPanel('hg-resume');
    },
    example: _eg([
      ['En transit',     '2 envois'],
      ['⚠ Sans réponse', '1 envoi — 4 j', 'teg-v', 'color:#B45309'],
      ['Confirmés',      '12 envois'],
    ]),
  },
  {
    id: 'utilisateurs',
    title: 'Gestion des utilisateurs',
    text: 'Créez des comptes, attribuez des rôles (technicien, superviseur, admin) et contrôlez l\'accès aux laboratoires pour chaque utilisateur.',
    target: '#nav-utilisateurs',
    pos: 'right',
    tier: 1,
    before: function() { window.showPanel('utilisateurs'); },
    example: _eg([
      ['Identifiant', 'TECH-MAT03', 'teg-mono'],
      ['Nom',         'Julie Vézina'],
      ['Rôle / Labo', 'Technicien · Matane (AA006)'],
    ]),
  },
  {
    id: 'done',
    title: 'Parcours terminé !',
    text: 'Vous maîtrisez maintenant les fonctions clés d\'OPTILAB. Retrouvez ce guide à tout moment dans Aide → À propos → « Relancer le tour ».',
    target: null,
    tier: 0,
  },
];

function _filtered() {
  var t = _tier();
  return _ALL.filter(function(s) { return s.tier <= t; });
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function _load() {
  if (!state.currentUser) return null;
  if (_prog !== null) return _prog;
  try {
    var r = await state.sb.from('profiles').select('tour_progress').eq('id', state.currentUser.id).single();
    _prog = (r.data && r.data.tour_progress) || null;
  } catch (_e) { _prog = null; }
  return _prog;
}

async function _save(data) {
  if (!state.currentUser) return;
  _prog = data;
  try {
    await state.sb.from('profiles').update({ tour_progress: data }).eq('id', state.currentUser.id);
  } catch (_e) {}
}

function _isDemo() {
  return !!(state.currentUser && state.currentUser.is_test);
}

export async function tourMaybeAutoStart() {
  if (_isDemo()) { tourStart(); return; }
  var p = await _load();
  if (p && p.v === TOUR_V && (p.finished || p.skipped)) return;
  tourStart();
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function tourStart() {
  _prog = null;
  _steps = _filtered();
  _idx = 0;
  _active = true;
  document.getElementById('tour-overlay').style.display = 'block';
  _show(0);
}

export function tourNext() {
  if (!_active) return;
  _idx++;
  if (_idx >= _steps.length) { tourFinish(); return; }
  _show(_idx);
}

export function tourPrev() {
  if (!_active || _idx <= 0) return;
  _idx--;
  _show(_idx);
}

export function tourSkip() {
  _active = false;
  _hide();
  _save({ v: TOUR_V, finished: false, skipped: true });
}

export function tourFinish() {
  _active = false;
  _hide();
  _save({ v: TOUR_V, finished: true, skipped: false });
}

function _show(i) {
  var step = _steps[i];
  if (!step) return;
  if (typeof step.before === 'function') step.before();
  // double rAF so panel transition settles before measuring rects
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { _render(step, i); });
  });
}

function _render(step, i) {
  var total = _steps.length;

  document.getElementById('tour-title').textContent   = step.title;
  document.getElementById('tour-text').textContent    = step.text;
  var egEl = document.getElementById('tour-example');
  if (egEl) {
    if (step.example) { egEl.innerHTML = step.example; egEl.style.display = 'block'; }
    else               { egEl.style.display = 'none'; }
  }
  document.getElementById('tour-counter').textContent = (i + 1) + ' / ' + total;

  document.getElementById('tour-prev').style.visibility = i === 0 ? 'hidden' : 'visible';
  document.getElementById('tour-next').textContent = i === total - 1 ? 'Terminer ✓' : 'Suivant →';

  var dotsEl = document.getElementById('tour-dots');
  var html = '';
  for (var d = 0; d < total; d++) {
    html += '<span class="tour-dot' + (d === i ? ' active' : '') + '"></span>';
  }
  dotsEl.innerHTML = html;

  var hl     = document.getElementById('tour-highlight');
  var bubble = document.getElementById('tour-bubble');

  if (step.target) {
    var el = document.querySelector(step.target);
    var r  = el ? el.getBoundingClientRect() : null;
    if (r && r.width > 0 && r.height > 0) {
      var pad = 7;
      hl.style.display = 'block';
      hl.style.top    = (r.top  - pad) + 'px';
      hl.style.left   = (r.left - pad) + 'px';
      hl.style.width  = (r.width  + pad * 2) + 'px';
      hl.style.height = (r.height + pad * 2) + 'px';
      _posBubble(bubble, r, step.pos || 'bottom');
    } else {
      hl.style.display = 'none';
      _centerBubble(bubble);
    }
  } else {
    hl.style.display = 'none';
    _centerBubble(bubble);
  }

  bubble.style.display = 'flex';
}

function _posBubble(bubble, tr, pos) {
  var bw  = 340;
  var gap = 16;
  var vw  = window.innerWidth;
  var vh  = window.innerHeight;

  bubble.style.transform = 'none';
  bubble.style.position  = 'fixed';
  bubble.style.right = bubble.style.bottom = 'auto';

  if (vw <= 560) { _centerBubble(bubble); return; }

  var top, left;
  if (pos === 'right') {
    left = tr.right + gap;
    top  = tr.top + tr.height / 2 - 95;
    if (left + bw > vw - 12) left = tr.left - bw - gap;
  } else if (pos === 'left') {
    left = tr.left - bw - gap;
    top  = tr.top + tr.height / 2 - 95;
    if (left < 12) left = tr.right + gap;
  } else if (pos === 'top') {
    left = tr.left + tr.width / 2 - bw / 2;
    top  = tr.top - gap - 200;
  } else {
    left = tr.left + tr.width / 2 - bw / 2;
    top  = tr.bottom + gap;
  }

  bubble.style.top  = Math.max(12, Math.min(top,  vh - 230)) + 'px';
  bubble.style.left = Math.max(12, Math.min(left, vw - bw - 12)) + 'px';
}

function _centerBubble(bubble) {
  bubble.style.position  = 'fixed';
  bubble.style.top       = '50%';
  bubble.style.left      = '50%';
  bubble.style.right     = 'auto';
  bubble.style.bottom    = 'auto';
  bubble.style.transform = 'translate(-50%,-50%)';
}

function _hide() {
  document.getElementById('tour-overlay').style.display  = 'none';
  document.getElementById('tour-highlight').style.display = 'none';
  document.getElementById('tour-bubble').style.display    = 'none';
  var pr = document.getElementById('tour-etq-preview');  if (pr) pr.style.display = 'none';
  var fg = document.getElementById('tour-fg74-preview');  if (fg) fg.style.display = 'none';
}
