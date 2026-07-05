// ─────────────────────────────────────────────────────────────────────────────
// OPTILAB — Configuration par domaine
// Ajouter une entrée par domaine pointant sur une base Supabase différente.
// La clé anon Supabase est publique par conception ; la sécurité repose sur RLS.
//
// turnstileSiteKey : clé publique Cloudflare Turnstile (captcha sur le login).
//   Récupérée sur dash.cloudflare.com > Turnstile > Add site. La clé secret
//   correspondante est configurée dans le dashboard Supabase Auth (Captcha).
//   Laisser '' pour désactiver le captcha sur ce domaine.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  var CONFIGS = {
    // ── Domaine 1 — Production Render ────────────────────────────────────────────────
    'optilab-envois.onrender.com': {
      supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
      supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── Domaine 2 — Production CloudFlare ────────────────────────────────────────────────
    'optilab-envois.pages.dev': {
      supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
      supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── CloudFlare — Développement ────────────────────────────────────────────────
    'tests-deploiement.optilab-envois.pages.dev': {
      supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
      supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── Render — Développement ────────────────────────────────────────────────
    'dev-optilab-envois.onrender.com': {
      supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
      supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── localhost — Développement local ──────────────────────────────────────
    'localhost': {
      supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
      supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
      turnstileSiteKey: '',
    },
    '127.0.0.1': {
      supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
      supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
      turnstileSiteKey: '',
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

  window.SUPABASE_URL       = cfg.supabaseUrl;
  window.SUPABASE_KEY       = cfg.supabaseKey;
  window.EDGE_URL           = cfg.supabaseUrl + '/functions/v1';
  window.TURNSTILE_SITE_KEY = cfg.turnstileSiteKey || '';
})();
