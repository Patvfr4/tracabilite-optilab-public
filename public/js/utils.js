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
