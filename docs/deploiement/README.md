# Déploiement — Traçabilité OPTILAB (BSL-GAS)

Ce dossier explique **pas à pas** comment déployer l'application depuis zéro : base de données
Supabase (reconstruite depuis `supabase/schema.sql`), hébergement Cloudflare Pages, courriels
(Resend ou SMTP), sauvegarde et procédures de sécurité.

L'application est une **SPA statique** (HTML/CSS/JS vanilla, aucun build) servie depuis le dossier
`public/`. Toute la logique métier repose sur **Supabase Cloud** (PostgreSQL + Auth + Realtime +
Edge Functions Deno). Les courriels de non-conformité et d'alarme sont envoyés par une **tâche
planifiée** (pg_cron) via **Resend** ou un relais SMTP.

---

## Architecture de déploiement

```
┌──────────────────────────────────────────────────────────────┐
│                     Navigateur (client)                      │
│         HTML5 · CSS3 · JavaScript vanilla (SPA)              │
│  public/index.html · public/js/*.js · public/css/app.css     │
│  public/js/config.js → hostname → URL + clé publiable        │
│                       (domaine inconnu : échec fermé)        │
└───────────────────────────┬──────────────────────────────────┘
             HTTPS (client Supabase JS) + WebSocket (Realtime)
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    Cloudflare Pages                          │
│   Site statique · dossier servi : public/                    │
│   _headers (CSP, cache) · _redirects (routage SPA + /confirm)│
└───────────────────────────┬──────────────────────────────────┘
                            │  (le navigateur appelle directement Supabase)
┌───────────────────────────▼──────────────────────────────────┐
│                     Supabase Cloud                           │
│  ┌────────────┐ ┌────────┐ ┌──────────┐ ┌────────────────┐   │
│  │ PostgreSQL │ │  Auth  │ │ Realtime │ │ Edge Functions │   │
│  │ RLS, Vault │ │ (JWT)  │ │  (WS)    │ │    (Deno)      │   │
│  └────────────┘ └────────┘ └──────────┘ └───────┬────────┘   │
│  pg_cron ── send-notifications (jours ouvrables)►│           │
│          ── détection des alarmes (/30 min), purges, garde   │
└──────────────────────────────────────────────────┼───────────┘
                                                   │ API REST HTTPS
                                    ┌──────────────▼──────────────┐
                                    │      Resend (ou SMTP)       │
                                    │  Courriels de notification  │
                                    └─────────────────────────────┘
```

**Région** : Canada (Central) — exigence de résidence (Loi 25 ; renseignements personnels du
personnel).

**Il n'y a pas de serveur applicatif.** Le navigateur parle directement à Supabase avec la clé
**publiable** (publique par conception) ; la sécurité repose sur les **droits explicites** des
rôles de l'API, la **RLS** PostgreSQL et les fonctions Edge (`auth-gate` pour la connexion avec
captcha, `manage-user` pour les comptes).

---

## Prérequis

| Élément | Détail |
|---|---|
| Compte **Supabase** | Plan Free suffisant pour la charge (voir `../architecture/07-capacite-supabase.md`). Plan Pro recommandé en production : sauvegardes managées, rétention des journaux, protection des mots de passe divulgués, SSO. |
| Compte **Cloudflare** | Plan Free. Sert aussi pour **Turnstile** (captcha). |
| Compte **Resend** ou relais **SMTP** | Requis seulement si les notifications courriel sont activées. |
| **CLI Supabase** | `npm install -g supabase` — pour `supabase link` et `functions deploy`. Le schéma, lui, se charge dans le SQL Editor. |
| **psql**, **age**, **gh** | Création du rôle de sauvegarde, clés de chiffrement, variables du dépôt (voir [04](04-sauvegardes.md)). |
| **Deno** 2 | Tests des fonctions Edge (facultatif hors CI). |
| **pre-commit** | Détection de secrets avant chaque commit (voir plus bas). |

Tous les comptes sont **nominatifs**, protégés par **MFA**, avec au moins deux propriétaires par
service.

---

## Ordre recommandé des étapes

1. **[01 — Supabase](01-supabase.md)** — projet, extensions, `schema.sql`, URL du projet pour le
   cron, données de référence, réglages Auth, fonctions Edge, premier admin, clés héritées
   désactivées, vérifications.
2. **[02 — Cloudflare Pages](02-cloudflare-pages.md)** — dépôt connecté, sortie `public`, entrée
   du domaine dans `public/js/config.js`, Turnstile.
3. **[03 — Resend / SMTP](03-resend.md)** — domaine expéditeur, clé à portée restreinte, saisie
   dans l'application, test.
4. **[04 — Sauvegardes](04-sauvegardes.md)** — rôle `backup_reader`, clés `age`, secret et
   variables GitHub, premier run, test de restauration.
5. **[05 — Procédures de sécurité](05-procedures-securite.md)** — rotation, incident (Loi 25),
   départ d'un administrateur, séparation dev/prod.

---

## Variables, clés et secrets

L'**inventaire de référence** (magasin, consommateurs, détenteurs, rotation, vérification) est dans
[`../architecture/04-securite.md` §5](../architecture/04-securite.md#5-secrets--clés). Ce tableau
ne dit que **où obtenir** chaque élément au moment du déploiement :

| Élément | Où l'obtenir | Où il va | Nature |
|---|---|---|---|
| URL du projet `https://<ref>.supabase.co` | Supabase › Settings › API Keys | `public/js/config.js` ; `app_config.supabase_url` (SQL Editor) | publique |
| Clé **publiable** `sb_publishable_<…>` | Supabase › Settings › API Keys | `public/js/config.js` | publique par conception |
| Clé **secrète** `sb_secret_<…>` | créée avec le projet | **nulle part** : injectée par la plateforme dans les fonctions (`SUPABASE_SECRET_KEYS`) | ⚠️ secrète — contourne la RLS |
| Mot de passe `postgres` | à la création du projet | gestionnaire de mots de passe de l'équipe | ⚠️ secret |
| Sitekey Turnstile `<sitekey>` | Cloudflare › Turnstile | `public/js/config.js` | publique |
| Clé **secrète** Turnstile | Cloudflare › Turnstile (même widget) | Supabase › Authentication › Attack Protection › CAPTCHA | ⚠️ secrète |
| Clé API Resend `re_<…>` (*Sending access*) | Resend › API Keys | application › Configuration › Notifications → **Vault** | ⚠️ secrète |
| Mot de passe SMTP (compte de service) | équipe TI | application › Configuration › Notifications → **Vault** | ⚠️ secret |
| `NOTIFY_TRIGGER_SECRET` | **généré par la base** | Vault (personne ne le voit) | ⚠️ secret |
| Mot de passe `backup_reader`, secret GitHub `SUPABASE_DB_URL` | gestionnaire de mots de passe ; `\password` | secret Actions du dépôt privé | ⚠️ secret |
| Clés `age` | `age-keygen` | publique : variable `BACKUP_AGE_RECIPIENT` ; privée : hors ligne | privée ⚠️ secrète |

> ⚠️ **Ne jamais** placer une clé secrète, un mot de passe, une chaîne de connexion ou la clé
> secrète Turnstile dans `public/` (tout ce dossier est public), dans le dépôt, un ticket ou un
> message. Les **Edge Function Secrets** ne contiennent aucun secret applicatif.

---

## Détection de secrets (développeurs)

- **Avant le commit — la seule barrière avant la fuite.** Installer le hook une fois par clone :

  ```bash
  pipx install pre-commit        # ou : pip install pre-commit
  pre-commit install
  ```

  Le hook `gitleaks` (`.pre-commit-config.yaml`) analyse les fichiers indexés avec
  `.gitleaks.toml`, valeurs masquées. `git commit --no-verify` ou `SKIP=gitleaks` sont **réservés à
  un faux positif avéré**, à corriger ensuite dans `.gitleaks.toml`.
- **Après le push — le job CI « secrets ».** Il analyse tout l'historique. Un secret qu'il signale
  est **déjà sur GitHub** : il doit être **changé** (procédure 05), le retirer du fichier ne suffit
  pas.
- `.gitleaks.toml` ne contient que des exceptions ciblées pour des valeurs publiques par
  conception (clé publiable et sitekey de `public/js/config.js`) : **ne jamais** s'en servir pour
  masquer un vrai secret. Dans la documentation, toujours des gabarits `<…>`.

## Réglages GitHub à faire après la fusion

Dans le dépôt (*Settings › Actions › General*) :

- cocher **« Require actions to be pinned to a full-length commit SHA »** ;
- **liste blanche d'actions** : actions de GitHub + `denoland/setup-deno` (seules utilisées par
  les workflows).

Et, selon le plan disponible : ruleset sur `main` (PR obligatoire, force-push interdit, checks
CI requis, désignés par le nom affiché des jobs : `fonctions-supabase`,
« schema.sql sur Postgres vierge », « Client (scripts tiers, références interdites) »,
« Détection de secrets (gitleaks) ») ; sur le dépôt public, activer le
*private vulnerability reporting* (voir `SECURITY.md`).

---

*Dernière mise à jour : 2026-11-10 — chantier « secrets et durcissement »*
