// ─────────────────────────────────────────────────────────────────────────────
// OPTILAB — Configuration par domaine
// Ajouter une entrée par domaine pointant sur une base Supabase différente.
// La clé publiable Supabase (sb_publishable_…) est publique par conception ; la
// sécurité repose sur la RLS et les contrôles des fonctions.
//
// turnstileSiteKey : clé publique Cloudflare Turnstile (captcha sur le login).
//   Récupérée sur dash.cloudflare.com > Turnstile > Add site.
//
//   La clé SECRÈTE correspondante va dans Authentication > Attack Protection >
//   CAPTCHA du projet Supabase, qui doit être ACTIVÉ : c'est la plateforme qui
//   valide le jeton, et c'est le seul contrôle qui couvre AUSSI un appel direct
//   à /auth/v1/token, lequel n'a pas besoin de passer par auth-gate puisque la
//   clé publiable ci-dessous est servie dans la page. auth-gate, lui, EXIGE le
//   jeton et le transmet — il ne le valide pas, car un jeton Turnstile est à
//   usage unique et une double validation échouerait.
//
//   Laisser '' ne désactive PLUS le captcha : auth-gate l'exige de toute façon
//   et refuserait la connexion. Les entrées de développement utilisent la
//   sitekey de test publique de Cloudflare (1x00000000000000000000AA). Elle
//   produit un jeton factice que seul le secret de TEST accepte : ce secret ne
//   doit être réglé QUE dans un projet Supabase de développement, JAMAIS dans
//   le projet de production (il y rejetterait les vrais jetons et laisserait
//   passer le jeton factice). Tant que localhost pointe sur le projet de
//   production, la connexion locale n'est donc pas prise en charge — ne pas
//   désactiver le CAPTCHA de production pour la « débloquer ».
//
// Domaine absent de CONFIGS : échec fermé. Aucun repli sur la production,
// aucune initialisation de Supabase ; la page affiche un message bloquant.
//
// CSP : public/_headers autorise connect-src vers *.supabase.co. Si un projet
// hors de ce domaine est ajouté ici, mettre la CSP à jour en même temps.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  var CONFIGS = {
    // ── Domaine 1 — Production Render ────────────────────────────────────────────────
    'optilab-envois.onrender.com': {
      supabaseUrl:      'https://ozynafmzdpjcxehxhbpm.supabase.co',
      supabaseKey:      'sb_publishable__zbVGpnNRgT_pW_PjSrssA_91GxE2X8',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── Domaine 2 — Production CloudFlare ────────────────────────────────────────────────
    'optilab-envois.pages.dev': {
      supabaseUrl:      'https://ozynafmzdpjcxehxhbpm.supabase.co',
      supabaseKey:      'sb_publishable__zbVGpnNRgT_pW_PjSrssA_91GxE2X8',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── CloudFlare — Développement ────────────────────────────────────────────────
    'tests-deploiement.optilab-envois.pages.dev': {
      supabaseUrl:      'https://ozynafmzdpjcxehxhbpm.supabase.co',
      supabaseKey:      'sb_publishable__zbVGpnNRgT_pW_PjSrssA_91GxE2X8',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── Render — Développement ────────────────────────────────────────────────
    'dev-optilab-envois.onrender.com': {
      supabaseUrl:      'https://ozynafmzdpjcxehxhbpm.supabase.co',
      supabaseKey:      'sb_publishable__zbVGpnNRgT_pW_PjSrssA_91GxE2X8',
      turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
    },
    // ── localhost — Développement local ──────────────────────────────────────
    'localhost': {
      supabaseUrl:      'https://ozynafmzdpjcxehxhbpm.supabase.co',
      supabaseKey:      'sb_publishable__zbVGpnNRgT_pW_PjSrssA_91GxE2X8',
      turnstileSiteKey: '1x00000000000000000000AA',
    },
    '127.0.0.1': {
      supabaseUrl:      'https://ozynafmzdpjcxehxhbpm.supabase.co',
      supabaseKey:      'sb_publishable__zbVGpnNRgT_pW_PjSrssA_91GxE2X8',
      turnstileSiteKey: '1x00000000000000000000AA',
    },
  };

  var hostname = window.location.hostname;
  var cfg = Object.prototype.hasOwnProperty.call(CONFIGS, hostname) ? CONFIGS[hostname] : null;

  if (!cfg) {
    // Échec fermé : un domaine inconnu (aperçu de déploiement, miroir, copie
    // locale sous un autre nom…) ne doit jamais être dirigé en silence vers la
    // base de production. Aucune globale Supabase n'est définie ; app.js et
    // /confirm testent OPTILAB_CONFIG_INVALIDE et ne créent aucun client.
    window.OPTILAB_CONFIG_INVALIDE = true;
    console.error('[config] Domaine non configuré (' + hostname + ') : application désactivée.');
    var afficher = function () {
      var voile = document.createElement('div');
      voile.setAttribute('role', 'alert');
      voile.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;'
        + 'justify-content:center;padding:24px;background:#f0f4f8;color:#1a2e3d;'
        + "font-family:'Segoe UI',Arial,system-ui,sans-serif";
      var boite = document.createElement('div');
      boite.style.cssText = 'max-width:520px;background:#fff;border-radius:12px;padding:24px 28px;'
        + 'box-shadow:0 4px 18px rgba(0,0,0,.08);border-left:4px solid #B3261E;line-height:1.6;font-size:14px';
      var titre = document.createElement('div');
      titre.style.cssText = 'font-size:17px;font-weight:700;color:#B3261E;margin-bottom:8px';
      titre.textContent = 'Domaine non configuré / Unconfigured domain';
      var texte = document.createElement('p');
      texte.textContent = 'L’adresse « ' + hostname + ' » n’est pas reconnue par l’application. '
        + 'Aucune connexion n’a été établie. Utilisez l’adresse officielle ou contactez l’administrateur.';
      var texteEn = document.createElement('p');
      texteEn.style.cssText = 'color:#6e7c86;font-style:italic;margin-top:6px';
      texteEn.textContent = 'This address is not recognised by the application. No connection was made.';
      boite.appendChild(titre); boite.appendChild(texte); boite.appendChild(texteEn);
      voile.appendChild(boite);
      document.body.appendChild(voile);
    };
    if (document.body) afficher();
    else document.addEventListener('DOMContentLoaded', afficher);
    return;
  }

  window.SUPABASE_URL       = cfg.supabaseUrl;
  window.SUPABASE_KEY       = cfg.supabaseKey;
  window.EDGE_URL           = cfg.supabaseUrl + '/functions/v1';
  window.TURNSTILE_SITE_KEY = cfg.turnstileSiteKey || '';
})();
