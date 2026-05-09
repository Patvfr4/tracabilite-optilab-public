// ─────────────────────────────────────────────────────────────────────────────
// OPTILAB — Configuration par domaine
// Ajouter une entrée par domaine pointant sur une base Supabase différente.
// La clé anon Supabase est publique par conception ; la sécurité repose sur RLS.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  var CONFIGS = {
    // ── Domaine 1 — Production Render ────────────────────────────────────────────────
    'optilab-envois.onrender.com': {
      supabaseUrl: 'https://dnrujegqadohwtrknmxj.supabase.co',
      supabaseKey: 'sb_publishable_hYVXXoJVgGF62YA92So8sA_t9KZETp-',
    },
    // ── Domaine 2 — Production CloudFlare ────────────────────────────────────────────────
    'optilab-envois.pages.dev': {
      supabaseUrl: 'https://dnrujegqadohwtrknmxj.supabase.co',
      supabaseKey: 'sb_publishable_hYVXXoJVgGF62YA92So8sA_t9KZETp-',
    },
    // ── CloudFlare — Développement ────────────────────────────────────────────────
    'tests-deploiement.optilab-envois.pages.dev': {
      supabaseUrl: 'https://dnrujegqadohwtrknmxj.supabase.co',
      supabaseKey: 'sb_publishable_hYVXXoJVgGF62YA92So8sA_t9KZETp-',
    },
    // ── Render — Développement ────────────────────────────────────────────────
    'dev-optilab-envois.onrender.com': {
      supabaseUrl: 'https://dnrujegqadohwtrknmxj.supabase.co',
      supabaseKey: 'sb_publishable_hYVXXoJVgGF62YA92So8sA_t9KZETp-',
    },
    // ── localhost — Développement local ──────────────────────────────────────
    'localhost': {
      supabaseUrl: 'https://uuhslyvrlfuoamuvgobc.supabase.co',
      supabaseKey: 'sb_publishable_M4czZuX99_7W9jvrJ9163g_9LCRQWz7',
    },
    '127.0.0.1': {
      supabaseUrl: 'https://dnrujegqadohwtrknmxj.supabase.co',
      supabaseKey: 'sb_publishable_hYVXXoJVgGF62YA92So8sA_t9KZETp-',
    },
  };

  var hostname = window.location.hostname;
  var cfg = CONFIGS[hostname];

  if (!cfg) {
    // Fallback : premier domaine configuré
    var keys = Object.keys(CONFIGS);
    cfg = CONFIGS[keys[0]];
    console.warn('[config] Domaine non reconnu (' + hostname + '), utilisation de la config par défaut.');
  }

  window.SUPABASE_URL = cfg.supabaseUrl;
  window.SUPABASE_KEY = cfg.supabaseKey;
  window.EDGE_URL     = cfg.supabaseUrl + '/functions/v1';
})();
