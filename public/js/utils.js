// ── UTILS.JS ──────────────────────────────────────────────────────────────────
// Fonctions utilitaires pures — aucune dépendance sur CFG, currentUser, laboratoires ou le DOM.
// Toutes les fonctions sont exportées ET ré-exposées sur window par main.js
// pour que app.js (script global) puisse continuer à les appeler sans import.
// ─────────────────────────────────────────────────────────────────────────────

// ── Constantes ────────────────────────────────────────────────────────────────

// Classes CSS de priorité (tp-0 à tp-4)
export var classesPills = ['tp-0', 'tp-1', 'tp-2', 'tp-3', 'tp-4'];

// Définition des quatre départements intra-grappe
export var departements = [
  { id: 'BIOCHIMIE',     label: 'Biochimie',              short: 'Bio',    cls: 'db-bio'  },
  { id: 'HEMATOLOGIE',   label: 'Hématologie/BDS',         short: 'Hémato', cls: 'db-hema' },
  { id: 'MICROBIOLOGIE', label: 'Microbiologie/Séro',      short: 'Micro',  cls: 'db-micro'},
  { id: 'PATHOLOGIE',    label: 'Pathologie/Cyto',         short: 'Patho',  cls: 'db-patho'},
];

// ── Chargement de scripts à la demande ────────────────────────────────────────
// Charge un script une seule fois (mémoïsé) et résout quand il est prêt.
// Permet de différer les grosses librairies (Chart.js, ZXing, jsPDF) jusqu'à
// leur première utilisation réelle plutôt que de les charger au démarrage.
//
// integrity : empreinte SRI (« sha384-… ») du fichier exact. Elle est
// OBLIGATOIRE pour un script servi par une autre origine (CDN) : sans elle, le
// code exécuté dans la session pourrait changer sans modification du dépôt. Un
// script tiers sans empreinte est donc refusé ici, sans requête réseau.
// crossOrigin est requis pour que le navigateur vérifie l'empreinte (jsDelivr
// renvoie Access-Control-Allow-Origin: *). Les copies locales de /lib/ n'en ont
// pas besoin : elles sont servies par la même origine que le code qui les charge.
var _scriptPromises = {};
export function loadScriptOnce(src, integrity) {
  if (_scriptPromises[src]) return _scriptPromises[src];
  if (/^(https?:)?\/\//i.test(src) && !integrity) {
    return Promise.reject(new Error('Script tiers refusé (empreinte d\'intégrité manquante) : ' + src));
  }
  _scriptPromises[src] = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = src; s.async = true;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    s.onload = function () { resolve(); };
    s.onerror = function () {
      // Échec réseau OU empreinte non conforme : le script n'est pas exécuté.
      _scriptPromises[src] = null;
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('Échec du chargement : ' + src));
    };
    document.head.appendChild(s);
  });
  return _scriptPromises[src];
}

// Librairies chargées à la demande : version EXACTE et empreinte du fichier.
// Une version en intervalle (« @4 ») laisserait le CDN servir une nouvelle
// version sans modification du dépôt. Les empreintes ont été calculées sur les
// fichiers vérifiés octet pour octet contre l'archive npm officielle (champ
// dist.integrity du registre) : openssl dgst -sha384 -binary | openssl base64 -A.
// Changer de version = changer l'URL ET recalculer l'empreinte.
export var LIB_CHARTJS = {
  // chart.js 4.6.1 : version vers laquelle « @4 » résolvait lors de l'épinglage
  src:       'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js',
  integrity: 'sha384-Emf5ZVIUiarAdhkgtqK+5/Z5qIvM6QoVrS+qAVtfyZVuD5lIHrac0me485+Antp0',
};
export var LIB_ZXING = {
  src:       'https://cdn.jsdelivr.net/npm/@zxing/library@0.19.2/umd/index.min.js',
  integrity: 'sha384-WosUcbEbThYunwwHxS01n91Dq055sAwsWD4B01T7ReKrmGBNa/XDw5yyI0QR85IA',
};
// jsPDF et son extension de tableaux : copies locales versionnées (le numéro de
// version est dans le chemin, car /lib/* est mis en cache 30 jours). Fichiers
// identiques octet pour octet à ceux de l'archive npm officielle (empreinte de
// l'archive comparée au champ dist.integrity du registre). Une copie locale
// échappe à Dependabot : vérifier les avis de sécurité (OSV, npm audit) à
// chaque mise à jour. jsPDF 4.2.1 : aucun avis connu à l'épinglage, alors que
// la 2.5.1 précédente en cumulait 12 (corrigés au plus tard en 4.2.1).
// sha384 pour mémoire, à recalculer en cas de mise à jour :
//   jspdf 4.2.1            sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3
//   jspdf-autotable 5.0.9  sha384-A77YsHWitrPuAj8E0AuB033EXzymUxIajnWKPzrrzqFoYYSCEpFennDUjMG2R1L3
// AutoTable 5 s'applique d'elle-même à window.jspdf.jsPDF quand jsPDF est déjà
// chargé : l'ordre de chargement (jsPDF puis AutoTable) reste obligatoire.
export var LIB_JSPDF           = { src: '/lib/jspdf/4.2.1/jspdf.umd.min.js' };
export var LIB_JSPDF_AUTOTABLE = { src: '/lib/jspdf-autotable/5.0.9/jspdf.plugin.autotable.min.js' };

// ── Mots de passe ─────────────────────────────────────────────────────────────
// Bornes en miroir du contrôle serveur (manage-user et réglage Auth du projet).
// Le contrôle client n'est qu'un confort : le serveur fait foi.
export var MDP_LONGUEUR_MIN = 12;
// bcrypt (Supabase Auth) ignore tout au-delà de 72 octets : le serveur refuse
// plutôt que de tronquer. Un caractère accentué compte pour 2 octets en UTF-8.
export var MDP_OCTETS_MAX = 72;

// Motif de refus d'un nouveau mot de passe non vide, ou '' s'il respecte les
// bornes. À appeler AVANT toute écriture.
export function motifRefusMotDePasse(p) {
  if (String(p).length < MDP_LONGUEUR_MIN) {
    return 'Le mot de passe doit contenir au moins ' + MDP_LONGUEUR_MIN + ' caractères.';
  }
  if (new TextEncoder().encode(String(p)).length > MDP_OCTETS_MAX) {
    return 'Le mot de passe est trop long (' + MDP_OCTETS_MAX + ' octets au maximum ; un caractère accentué en compte 2).';
  }
  return '';
}

// Message d'erreur d'une réponse de manage-user (callEdge) : le message du
// serveur, rédigé pour l'utilisateur, sinon le message par défaut ; suivi de la
// référence éventuelle, qui relie la réponse à la ligne du journal serveur.
export function messageErreurEdge(res, defaut) {
  var m = res && typeof res.error === 'string' && res.error ? res.error : (defaut || 'Erreur inconnue.');
  if (res && typeof res.ref === 'string' && res.ref) m += ' (réf. ' + res.ref + ')';
  return m;
}

// ── Sécurité / XSS ───────────────────────────────────────────────────────────

// Échappe les caractères HTML spéciaux pour insertion sécurisée dans le DOM
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Neutralise les métacaractères du langage de filtre PostgREST utilisé dans
// les appels .or('col.ilike.%…%,…'). Sans ça, une virgule ou une parenthèse
// dans la saisie de recherche injecterait des conditions supplémentaires.
// Les caractères dangereux sont remplacés par une espace (on garde les mots).
export function sanitizePgrstPattern(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[,()*\\"]/g, ' ');
}

// ── Formatage de dates ────────────────────────────────────────────────────────

// Date + heure courte   ex : 12/05/2025 14:30
export function formatDateTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.toLocaleDateString('fr-CA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
}

// Date longue sans heure  ex : lundi 12 mai 2025
export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Clé de tri YYYY-MM-DD
export function deepKey(iso) {
  if (!iso) return '0000-00-00';
  var d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── Rendu de tableaux groupés par jour ────────────────────────────────────────
// Échafaudage commun aux vues Résumé (intra : envoi/réception) et Résumé HG
// (envoi/confirmation) : regroupe les envois par jour, trie le groupe « sans date »
// en tête puis les dates décroissantes, et insère une ligne de séparation `dsep`
// par jour. Chaque appelant fournit son propre rendu de ligne via rowFn.
//   opts.altField     : champ de date alternatif ('tsRecep' | 'tsConfirm'), ou null
//                       pour grouper par ts_envoi (mode par défaut).
//   opts.sansDateLabel : libellé du groupe sans date ('Non réceptionné'…).
//   opts.colspan       : nombre de colonnes de la ligne de séparation.
export function renderDayGroups(items, opts, rowFn) {
  var altField = opts.altField;
  var g = {};
  items.forEach(function (e) {
    var k = altField ? (e[altField] ? deepKey(e[altField]) : 'sans-date') : deepKey(e.tsEnvoi);
    if (!g[k]) g[k] = [];
    g[k].push(e);
  });
  var groups = Object.entries(g).sort(function (a, b) {
    if (a[0] === 'sans-date') return -1;
    if (b[0] === 'sans-date') return 1;
    return b[0].localeCompare(a[0]);
  });
  return groups.map(function (gr) {
    var lbl = gr[0] === 'sans-date' ? opts.sansDateLabel : formatDate(gr[0] + 'T12:00:00');
    return '<tr class="dsep"><td colspan="' + opts.colspan + '">' + lbl + '</td></tr>' +
      gr[1].map(rowFn).join('');
  }).join('');
}

// ── Calculs de transit ────────────────────────────────────────────────────────

// Durée de transit en heures (null si pas encore parti)
export function heuresTransit(e) {
  if (!e.tsEnvoi) return null;
  var fin = e.tsRecep ? new Date(e.tsRecep) : new Date();
  return (fin - new Date(e.tsEnvoi)) / 3600000;
}

// Formate un nombre d'heures  ex : 3h05
export function formatDuree(h) {
  if (h === null) return '—';
  var hh = Math.floor(h);
  var mm = Math.round((h - hh) * 60);
  return hh + 'h' + String(mm).padStart(2, '0');
}

// ── Badges et classes CSS ─────────────────────────────────────────────────────

// Classe CSS de badge selon le statut d'un envoi
export function classeBadge(s) {
  return s === 'En attente' ? 'ba' : s === 'En transit' ? 'bt' : s === 'Reçu' ? 'br' : s === 'Perdu' ? 'bperdu' : s === 'Annulé' ? 'bperdu' : 'bp2';
}

// ── Formatage utilisateurs ────────────────────────────────────────────────────

// Libellé lisible d'un rôle
export function libelleRole(r) {
  if (r === 'admin')               return 'Administrateur';
  if (r === 'superviseur_grappe')  return 'Sup. Grappe';
  if (r === 'superviseur_labo')    return 'Sup. Labo';
  return 'Technicien';
}

// Classe CSS de badge pour un rôle
export function classeBadgeRole(r) {
  if (r === 'admin')               return 'badm';
  if (r === 'superviseur_grappe')  return 'bsg';
  if (r === 'superviseur_labo')    return 'bsl';
  return 'btech';
}

// ── Formatage de saisie ───────────────────────────────────────────────────────

// Formate un code postal canadien  ex : G5L 5T1
export function formaterCP(v) {
  var s = v.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s.length > 3 ? s.slice(0, 3) + ' ' + s.slice(3) : s;
}

// Formate un numéro de téléphone  ex : (418) 724-3000
export function formaterTel(v) {
  var d = v.replace(/\D/g, '').slice(0, 10);
  if (!d) return '';
  if (d.length <= 3) return '(' + d;
  if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
  return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
}

// ── Helpers HTML ──────────────────────────────────────────────────────────────

// Séparateur de section dans les modals de formulaire
export function separateurModal(t) {
  return '<div style="grid-column:1/-1;font-size:10px;font-weight:700;text-transform:uppercase;'
    + 'letter-spacing:.08em;color:var(--t3);padding-top:12px;margin-top:2px;'
    + 'border-top:1px solid var(--b3)">' + t + '</div>';
}

// Badges HTML des départements pour une ligne d'envoi
export function departementsHtml(d) {
  if (!d || !d.length) return '<span style="color:var(--t3);font-size:11px">—</span>';
  return d.map(function(x) {
    var i = departements.find(function(q) { return q.id === x; });
    return i ? '<span class="db ' + i.cls + '">' + i.short + '</span>' : '';
  }).join('');
}

// Liste textuelle des départements  ex : Biochimie, Hématologie/BDS
export function departementsTexte(d) {
  if (!d || !d.length) return '—';
  return d.map(function(x) {
    var i = departements.find(function(q) { return q.id === x; });
    return i ? i.label : x;
  }).join(', ');
}
