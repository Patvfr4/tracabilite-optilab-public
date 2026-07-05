# Déploiement — Traçabilité OPTILAB (BSL-GAS)

Ce dossier explique **pas à pas** comment redéployer l'application depuis zéro : base de données Supabase, hébergement Cloudflare Pages, et envoi des courriels via Resend.

L'application est une **SPA statique** (HTML/CSS/JS vanilla, aucun build) servie depuis le dossier `public/`. Toute la logique métier repose sur **Supabase Cloud** (PostgreSQL + Auth + Realtime + Edge Functions Deno). Les courriels de non-conformité et d'alarme sont envoyés par **cron** (pg_cron) via **Resend**.

---

## Architecture de déploiement

```
┌──────────────────────────────────────────────────────────────┐
│                     Navigateur (client)                      │
│         HTML5 · CSS3 · JavaScript vanilla (SPA)              │
│  public/index.html · public/js/*.js · public/css/app.css     │
│  public/js/config.js → lit hostname → injecte URL + clé      │
└───────────────────────────┬──────────────────────────────────┘
             HTTPS (client Supabase JS) + WebSocket (Realtime)
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    Cloudflare Pages                          │
│   Site statique · dossier servi : public/                   │
│   _headers (CSP, cache) · _redirects (routage SPA + /confirm)│
└───────────────────────────┬──────────────────────────────────┘
                            │  (le navigateur appelle directement Supabase)
┌───────────────────────────▼──────────────────────────────────┐
│                     Supabase Cloud                           │
│  ┌────────────┐ ┌────────┐ ┌──────────┐ ┌────────────────┐   │
│  │ PostgreSQL │ │  Auth  │ │ Realtime │ │ Edge Functions │   │
│  │  + RLS     │ │ (JWT)  │ │  (WS)    │ │    (Deno)      │   │
│  └────────────┘ └────────┘ └──────────┘ └───────┬────────┘   │
│  pg_cron ── déclenche ─────────────────────────►│            │
│  (send-notifications toutes les H, detect-alarms /30 min)    │
└──────────────────────────────────────────────────┼───────────┘
                                                   │ API REST HTTPS
                                    ┌──────────────▼──────────────┐
                                    │           Resend            │
                                    │  Courriels de notification  │
                                    │  (non-conformité, alarmes)  │
                                    └─────────────────────────────┘
```

**Projet Supabase actuel (production) :** ref `aozluuihgzzvgwdvjnxb` — région **Canada (Central)** (conformité Loi 25 / données médicales QC).

**Il n'y a pas de serveur applicatif.** Le navigateur parle directement à Supabase avec la clé publique (`publishable`) ; la sécurité repose entièrement sur le **RLS** PostgreSQL et sur l'Edge Function `auth-gate` (login avec rate-limit + captcha).

---

## Prérequis

| Élément | Détail |
|---|---|
| Compte **Supabase** | [app.supabase.com](https://app.supabase.com) — plan Free suffisant pour la charge actuelle (voir `CAPACITE_SUPABASE.md`). Pro recommandé en production (PITR, backups). |
| Compte **Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) — plan Free. Sert aussi pour **Turnstile** (captcha). |
| Compte **Resend** | [resend.com](https://resend.com) — plan Free (3 000 courriels/mois). Requis uniquement si les notifications courriel sont activées. |
| **CLI Supabase** | `npm install -g supabase` — nécessaire pour `supabase link`, `db push`, `functions deploy`. |
| **Git** | Dépôt hébergé sur GitHub (connecté à Cloudflare Pages pour le déploiement automatique). |
| **Node.js / npx** | Pour la CLI Supabase et le développement local (`npx live-server public`). |

---

## Ordre recommandé des étapes

Déployez dans cet ordre. Le front (Cloudflare) a besoin de l'URL + clé Supabase ; les courriels (Resend) ont besoin des Edge Functions Supabase.

1. **[01 — Supabase](01-supabase.md)** — Créer le projet, appliquer le schéma et les migrations, configurer Auth + Realtime, déployer les Edge Functions, planifier les crons. Récupérer l'**URL** et la **clé publishable**.
2. **[02 — Cloudflare Pages](02-cloudflare-pages.md)** — Connecter le dépôt GitHub, régler le build (aucune commande, sortie `public`), renseigner l'URL + clé + clé Turnstile dans `public/js/config.js`, configurer les domaines.
3. **[03 — Resend](03-resend.md)** — Vérifier le domaine expéditeur (DNS), créer la clé API, la saisir dans l'UI admin, activer les notifications par labo et tester.

---

## Variables, clés et secrets

| Nom | Type | Où l'obtenir | Où il est utilisé / stocké | Sensibilité |
|---|---|---|---|---|
| **Project URL** | `https://<ref>.supabase.co` | Supabase → Settings → API | `public/js/config.js` (`supabaseUrl`) | Publique |
| **Clé publishable** (anon) | `sb_publishable_…` | Supabase → Settings → API | `public/js/config.js` (`supabaseKey`) — exposée côté client | Publique (protégée par RLS) |
| **Clé `service_role`** | `eyJ…` / `sb_secret_…` | Supabase → Settings → API | **Injectée automatiquement** dans les Edge Functions (`SUPABASE_SERVICE_ROLE_KEY`). Jamais dans le front. | ⚠️ **Secrète — bypass RLS** |
| **Database password** | défini à la création | (à la création du projet) | `supabase link`, backups `pg_dump` | ⚠️ Secrète |
| **Clé site Turnstile** | `0x4AAAA…` | Cloudflare → Turnstile → Add site | `public/js/config.js` (`turnstileSiteKey`) — passée à `index.html` | Publique |
| **Clé secret Turnstile** | `0x4AAAA…` | Cloudflare → Turnstile (même widget) | Supabase → Authentication → Attack Protection → CAPTCHA | ⚠️ Secrète |
| **Clé API Resend** | `re_…` | Resend → API Keys | Saisie dans l'UI admin → colonne `notification_config.resend_api_key` (RLS admin-only) | ⚠️ Secrète |
| **`SUPABASE_DB_URL`** | chaîne de connexion directe | Supabase → Settings → Database | Secret GitHub Actions (backup) **et** secret Edge Function `set-secret` (optionnel) | ⚠️ Secrète |

> ⚠️ **Ne jamais** placer la clé `service_role`, le mot de passe DB, la clé Resend, la chaîne `SUPABASE_DB_URL` ou la clé secret Turnstile dans `public/js/config.js` ni dans aucun fichier du dossier `public/` : tout ce dossier est public.

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
