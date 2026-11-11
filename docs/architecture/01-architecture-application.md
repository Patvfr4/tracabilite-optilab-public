# 01 — Architecture de l'application

> Projet : **Traçabilité OPTILAB — BSL-GAS**
> Version : **BETA 1.10.2** (chantier « secrets et durcissement », novembre 2026)
> Audience : auditeurs (sécurité, architecture, conformité)

Ce document décrit la vue d'ensemble fonctionnelle et technique de l'application. Le modèle de données est détaillé dans [05-base-de-donnees.md](05-base-de-donnees.md). Les rôles et politiques de sécurité (RLS) sont détaillés dans `04-securite.md`.

---

## 1. Vue d'ensemble fonctionnelle

OPTILAB Traçabilité est une **application web monopage (SPA)** de suivi des envois de spécimens biologiques inter-laboratoires pour le réseau **BSL-GAS** (Bas-Saint-Laurent / Gaspésie). Elle gère deux flux de transport distincts :

- **Intra-grappe** : envois entre laboratoires du réseau (mêmes grappes), avec réception scannée, alarmes de retard, bons de départ et audit.
- **Hors-grappe** : envois vers des laboratoires **externes** au réseau, avec confirmation de réception par le destinataire (page publique via token, saisie par numéro + code, ou fax) et formulaire réglementaire **F-G-74** bilingue.

Modules fonctionnels (état BETA 1.10.0) :

| Module | Description | Fichier front | Activation |
|---|---|---|---|
| Envois intra-grappe | Création, réception, historique, résumé, recherche, annulation | `envois.js` | Toujours actif |
| Hors-grappe | Envois externes, confirmations, F-G-74, labos externes | `hgrappe.js` | Par labo (`module_config`) |
| Bons de départ | Regroupement d'envois en attente par transporteur, DataMatrix | `bons-depart.js` | Par labo (`module_config`) |
| Gestion des échantillons | Scan de codes-barres d'échantillons (départ + réception), NC auto | `echantillons.js` | Par labo (`module_config`) |
| Notifications | Emails NC / perdu / alarmes via cron + Resend | `app-config.js` (config) | Master + par labo |
| Codes ICR / valeurs pondérées | Référentiel `icr_codes` (glace sèche, hors corridor), KPI | `envois.js` / `kpi.js` | Toujours actif |
| Parcours guidé | Tour interactif par rôle, progression persistée | `tour.js` | Auto 1re connexion |
| KPI / Dashboard | Statistiques par labo, flux quotidien, ICR | `kpi.js` | Superviseur grappe / admin |
| Configuration | Grappe, modules, labos, formats, notifications, secrets | `app-config.js` | Admin / superviseur |

Il n'y a **aucun serveur applicatif** : le frontend est 100 % statique. Toute la logique métier et la sécurité reposent sur **Supabase** (PostgreSQL + RLS + fonctions `SECURITY DEFINER` + Edge Functions).

---

## 2. Stack technique

| Couche | Technologie | Notes |
|---|---|---|
| Frontend | HTML / CSS / JavaScript **vanilla** | Aucun framework, **aucune étape de build** |
| Modules JS | **ES6 natifs** (`import`/`export`) | Servis directement par le navigateur |
| Hébergement front | **Cloudflare Pages** (entrées Render encore déclarées, sort à décider) | Répertoire publié : `public/` |
| Base de données | **PostgreSQL** (Supabase) | RLS + fonctions `SECURITY DEFINER` |
| Authentification | **Supabase Auth** | JWT, session `sessionStorage` ; changement de mot de passe imposé et désactivation (bannissement) appliqués par le serveur |
| Temps réel | **Supabase Realtime** (WebSocket) | 2 tables, en **listes de colonnes** (migration `058`) — simple déclencheur de rechargement |
| Fonctions serveur | **Edge Functions Deno** (Supabase) | `manage-user`, `send-notifications`, `auth-gate`, `test-notification` ; module partagé `_shared/` ; nouvelles clés API ; `verify_jwt = false`, authentification dans le code |
| Emails | **Resend** (ou SMTP), via **cron pg_cron** | Récapitulatif quotidien |
| Cron / planification | **pg_cron** + **pg_net** (Supabase) | 7 tâches versionnées dans `schema.sql` : notifications, alarmes, purges, chien de garde |
| Secrets serveur | **Supabase Vault** (saisie par l'UI admin, RPC `set_app_secret`) | Clé Resend / SMTP, secret de déclenchement du cron ; clé secrète Turnstile dans Supabase Auth ; voir `04-securite.md` §5 |
| Anti-brute-force login | Edge Function `auth-gate` + **Cloudflare Turnstile** (captcha) | Rate-limit serveur (`login_attempts`) |
| Codes-barres | **bwip-js** (CODE128, DataMatrix, QR) | Librairie **locale** (`public/lib/`) |
| PDF | jsPDF 4.2.1 + AutoTable 5.0.9 | Copies locales (`public/lib/`), chargées à la demande |
| Graphiques | Chart.js 4.6.1 | Dashboard KPI uniquement ; jsDelivr avec SRI, chargé à la demande |
| Sauvegarde DB | GitHub Actions (dépôt privé) + `pg_dump` | Quotidienne, rôle en lecture seule, chiffrée avec `age`, 30 jours ; à activer après chaque (re)construction |

---

## 3. Schéma d'architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Navigateur (client)                           │
│                                                                      │
│  public/index.html         SPA principale (authentifiée)             │
│  public/confirm/index.html Page publique de confirmation (sans auth) │
│                                                                      │
│  config.js  → lit hostname → window.SUPABASE_URL / _KEY / EDGE_URL   │
│  main.js    → importe les modules ES6 → Object.assign(window, …)     │
│  app.js     → createClient(URL, KEY, {storage: sessionStorage})      │
│  state.js   → bridge getters/setters window.* ↔ state.*              │
└───────────────┬─────────────────────────────────┬────────────────────┘
                │ HTTPS (supabase-js)              │ WebSocket (Realtime)
                ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              Supabase                                 │
│                                                                      │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────────────┐    │
│  │ PostgreSQL   │   │ Supabase Auth  │   │ Realtime (WebSocket) │    │
│  │ + RLS        │   │ (JWT, session) │   │ envois, envois_hgr., │    │
│  │ SECURITY DEF │   │                │   │ (listes de colonnes) │    │
│  └──────┬───────┘   └────────────────┘   └──────────────────────┘    │
│         │                                                            │
│  ┌──────▼───────┐   ┌────────────────┐   ┌──────────────────────┐    │
│  │ pg_cron +    │   │ Edge Functions │   │ notification_config  │    │
│  │ pg_net       │──▶│ Deno           │   │ + Vault (secrets)    │    │
│  │ (alarmes,    │   │ send-notif.,   │   └──────────────────────┘    │
│  │  notif.)     │   │ manage-user,   │                               │
│  └──────────────┘   │ auth-gate      │──▶ Resend / SMTP (emails)     │
│                     └────────────────┘                               │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    Cloudflare Turnstile (captcha login)
```

### Flux de démarrage

1. Cloudflare Pages sert `public/index.html` (assets statiques).
2. `config.js` (script `defer`, exécuté en premier) lit `window.location.hostname` et injecte `window.SUPABASE_URL`, `window.SUPABASE_KEY`, `window.EDGE_URL`, `window.TURNSTILE_SITE_KEY`.
3. `app.js` crée le client Supabase : `createClient(URL, KEY, { auth: { storage: window.sessionStorage, storageKey: 'optilab-auth', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`. Si `config.js` n'a reconnu aucun domaine (`OPTILAB_CONFIG_INVALIDE`), aucun client n'est créé.
4. Au `DOMContentLoaded` : `initTheme()`, `initLoginBg()`, `applyBranding()`, `setupKeyboard()`, `capDateInputsToToday()`, `setupConfirmModal()`.
5. `sb.auth.getSession()` : si une session existe → `loadProfileAndInit(userId)` ; sinon → `loadConfig()` puis écran de connexion.
6. Connexion : l'utilisateur saisit son **numéro d'employé** ; l'email interne est `{employee_id}@optilab.internal` (jamais exposé). La connexion passe par `auth-gate`, qui exige le jeton Turnstile et le transmet à Supabase Auth, puis vérifie que le profil est actif. Si `must_change_password` est levé, l'écran `cpw` impose le changement (`manage-user`, action `change_own_password`).
7. Après connexion (`finaliserConnexion`) : chargement en parallèle de `loadConfig()`, `loadLabs()`, `loadGrappeConfig()`, memberships, puis rendu du panneau mémorisé.
8. `tourMaybeAutoStart()` déclenche le parcours guidé si première connexion (ou compte de démonstration).

---

## 4. Structure du dépôt

```
optilab-envois/
├── public/                         # Frontend statique (racine Cloudflare Pages)
│   ├── index.html                  # SPA principale (authentifiée)
│   ├── confirm/
│   │   └── index.html              # Page publique de confirmation HG (sans auth, script inline)
│   ├── css/
│   │   └── app.css                 # Styles, variables CSS, thème clair/sombre
│   ├── lib/                        # Librairies locales, versionnées par chemin
│   │   ├── bwip-js.min.js          #   CODE128, DataMatrix, QR (bordereaux, F-G-74, bons de départ)
│   │   ├── jspdf/4.2.1/            #   jsPDF (export PDF)
│   │   └── jspdf-autotable/5.0.9/  #   AutoTable (tableaux PDF)
│   └── js/
│       ├── config.js               # URL + clé publiable par domaine + sitekey (publiques) ; domaine inconnu = échec fermé
│       ├── app.js                  # Client Supabase, état global window.*, DOMContentLoaded
│       ├── main.js                 # Point d'entrée ES6 : imports → Object.assign(window,…)
│       ├── state.js                # Bridge window.* ↔ state.* + sbCall() (wrapper Supabase)
│       ├── utils.js                # Fonctions pures (escapeHtml, formatDateTime, badges…)
│       ├── ui.js                   # Toasts, spinner, navigation (showPanel), thème, modals
│       ├── auth.js                 # Auth, session, inactivité, sélecteur multi-labo, rôles
│       ├── labs.js                 # Laboratoires, sélecteurs, températures, adresses
│       ├── envois.js               # CRUD intra-grappe, réception, résumé, historique,
│       │                           #   recherche, utilisateurs, annulation, subscribeRT (Realtime)
│       ├── hgrappe.js              # Mode hors-grappe, confirmations, F-G-74, labos externes
│       ├── bons-depart.js          # Bons de départ, scan DataMatrix, caméra
│       ├── echantillons.js         # Scan échantillons (départ/réception/édition), NC auto
│       ├── tour.js                 # Parcours de formation guidé par rôle
│       ├── kpi.js                  # Dashboard KPI (Chart.js), codes ICR
│       ├── print.js                # Impression bordereaux intra (formats)
│       ├── print-hg.js             # Impression bordereau HG + F-G-74 bilingue
│       └── app-config.js           # Configuration admin (grappe, modules, formats, notif, secrets)
│
├── supabase/
│   ├── schema.sql                  # UNIQUE source de vérité de la base (projet vierge)
│   ├── seed.sql, seed_demo*.sql    # Données de référence ; démonstration (jamais en production)
│   ├── config.toml                 # Config de la pile locale du CLI (la production se règle en console)
│   ├── ci/                         # Shim plateforme, invariants et tests fonctionnels (CI)
│   └── functions/                  # Edge Functions Deno
│       ├── deno.json, deno.lock
│       ├── _shared/                    # Clés, clients, autorisation, CORS, secrets (Vault), courriel
│       ├── manage-user/                # Gestion des comptes, changement de mot de passe imposé
│       ├── send-notifications/         # Envoi des récapitulatifs (appelée par pg_cron)
│       ├── auth-gate/                  # Point d'entrée du login (captcha, profil actif)
│       ├── test-notification/          # Courriel de test (admin)
│       └── tests/                      # Tests unitaires et d'intégration (simulacre local)
│
├── .github/workflows/              # ci.yml (CI) ; db-backup.yml (sauvegarde chiffrée, dépôt privé)
├── .gitleaks.toml, .pre-commit-config.yaml   # Détection de secrets
├── docs/architecture/              # Ce dossier
├── docs/deploiement/               # Guides pas à pas et procédures de sécurité
├── CHANGELOG.md (public/)          # Historique des versions
└── SECURITY.md                     # Signalement des vulnérabilités
```

### Répartition des responsabilités (`public/js`)

| Fichier | Responsabilité principale |
|---|---|
| `config.js` | Sélection de la base Supabase selon le domaine ; **seul** endroit où figurent l'URL et la clé publiable ; domaine inconnu = échec fermé |
| `app.js` | Création du client Supabase, déclaration de l'état global (`window.*`), amorçage `DOMContentLoaded` |
| `main.js` | Chargement/agrégation des modules ES6 et ré-exposition sur `window` (compat. handlers HTML inline) |
| `state.js` | `state` (proxy `window.*`) + `sbCall()` : wrapper Supabase qui détecte l'expiration JWT et les erreurs réseau |
| `utils.js` | Fonctions pures : `escapeHtml`, `formatDateTime`, `classeBadge`, `formaterCP/Tel`, départements |
| `ui.js` | Navigation `showPanel()`, toasts/spinner, thème clair/sombre, modals de confirmation, écrans |
| `auth.js` | `seConnecter`/`seDeconnecter`, session, timer d'inactivité (15 min), sélecteur multi-labo, `estAdmin/estGrappe/estSuperviseur` |
| `labs.js` | Référentiel laboratoires, sélecteurs destinataires, pilules de température, adresses, modal labo |
| `envois.js` | Cœur intra-grappe : `loadEnvois`, `saveEnvoi`, réception (`confirmer`/`signaler`), résumé, historique, recherche, `annuler_envoi`, gestion utilisateurs, **`subscribeRT`** (canal Realtime) |
| `hgrappe.js` | Mode hors-grappe : bascule de mode, envois HG, confirmations, fax, labos externes, config HG |
| `bons-depart.js` | Création/impression des bons, scan DataMatrix, scan caméra |
| `echantillons.js` | Scan des codes-barres d'échantillons au départ et à la réception, NC automatique |
| `tour.js` | Parcours guidé par rôle, bulles positionnées, persistance dans `profiles.tour_progress` |
| `kpi.js` | Dashboard (Chart.js), cartes KPI intra + HG, section codes ICR |
| `print.js` / `print-hg.js` | Génération des gabarits d'impression (bordereaux, F-G-74) |
| `app-config.js` | Panneau de configuration : grappe, modules, formats, badges, thème, notifications et secrets (RPC du Vault, jamais de valeur affichée) |

---

## 5. Pattern de navigation

La navigation est gérée par **`showPanel(n)`** (`ui.js`), historiquement abrégée `sp`.

- Chaque panneau est une `<section class="panel" id="panel-{n}">` ; un seul panneau porte la classe `active` à la fois. Le bouton de navigation correspondant (`#nav-{n}`) reçoit aussi `active`.
- Le panneau courant est **persisté dans `sessionStorage`** sous la clé `optilab-panel`. À la reconnexion, `auth.js` relit `sessionStorage.getItem('optilab-panel')` (défaut : `nouveau`).
- Alias : `hsilp` → `nouveau`, `hg-hsilp` → `hg-silp`. Si le panneau demandé n'existe pas, repli sur `hg-silp` (mode HG) ou `nouveau`.
- **Contrôles d'accès dans `showPanel`** : les panneaux `historique`, `hg-historique`, `kpi` sont réservés aux superviseurs de grappe / admin ; `bons-depart` exige le module actif ou un rôle grappe. En cas d'accès non autorisé, `showPanel` redirige immédiatement.
- Chaque panneau déclenche son initialisation à l'affichage (ex. `reception` → focus champ scan ; `config` → rendu des sous-sections ; `kpi` → `initDashboard()`).

> Il n'y a pas de routeur d'URL : la SPA n'utilise pas le hash ni l'History API pour la navigation interne. La seule route « externe » est `/confirm/` (page publique distincte).

---

## 6. Configuration multi-domaine (`config.js`)

`config.js` mappe le `hostname` vers un jeu de clés. Les globales injectées sont `window.SUPABASE_URL`, `window.SUPABASE_KEY` (clé **publiable**, publique par conception), `window.EDGE_URL` (= URL + `/functions/v1`) et `window.TURNSTILE_SITE_KEY`.

| Domaine | Environnement | Projet Supabase |
|---|---|---|
| `optilab-envois.pages.dev` | Production Cloudflare | projet de production |
| `optilab-envois.onrender.com` | Render (secours, sort à décider) | projet de production |
| `tests-deploiement.optilab-envois.pages.dev` | « Dev » Cloudflare | **projet de production** |
| `dev-optilab-envois.onrender.com` | « Dev » Render | **projet de production** |
| `localhost` / `127.0.0.1` | Développement local | **projet de production** (connexion non prise en charge) |
| tout autre domaine (préversions…) | — | **aucun** : message bloquant, aucun client créé |

Le captcha Turnstile est exigé partout. `localhost` et `127.0.0.1` portent la **sitekey de test** publique de Cloudflare, dont le jeton factice est refusé par la clé secrète de production : tant que ces entrées visent la production, la connexion locale n'est pas prise en charge (ne jamais désactiver le CAPTCHA de production pour la débloquer). Un domaine non reconnu n'est plus dirigé vers la production : l'application affiche « Domaine non configuré ».

> **Note pour auditeurs** : **tous les domaines déclarés pointent vers le même projet Supabase**, celui de la production ; il n'existe pas de base de développement isolée. La séparation recommandée (pile locale `supabase start`, projet de préproduction aux données synthétiques) est décrite dans [../deploiement/05-procedures-securite.md](../deploiement/05-procedures-securite.md) §4. Après la reconstruction de la base sur un nouveau projet, `config.js` doit être mis à jour (URL et clé publiable).

---

## 7. Temps réel (Realtime)

Le canal Realtime est ouvert par **`subscribeRT()`** (`envois.js`), sur le canal `envois-rt`, uniquement quand l'utilisateur consulte un panneau à données « live » :

```
_RT_PANELS = ['resume','historique','hg-confirmations','hg-historique','hg-resume']
```

Sur tout autre panneau, `showPanel` **supprime** le canal (`sb.removeChannel`) pour éviter les reconnexions et le trafic inutile. À chaque événement `postgres_changes` :

1. Vidage du cache modal (`state.cacheModals` / `state.hgCacheModals`).
2. Rechargement des envois (`loadEnvois()` / `loadEnvoisHG()`).
3. Re-rendu du panneau actif si applicable.

**Tables publiées** dans `supabase_realtime` : `envois(id, exp_labo_id, dest_labo_id)` et `envois_hgrappe(id, exp_labo_id)`, en listes de colonnes (`confirm_token` et `verify_code` exclus).

**Limites** : plan Free Supabase — 2 000 000 messages/mois, 200 connexions simultanées. Voir [07-capacite-supabase.md](07-capacite-supabase.md) pour l'estimation de charge.

---

## 8. Intra-grappe vs Hors-grappe

| Aspect | Intra-grappe | Hors-grappe |
|---|---|---|
| Table | `envois` | `envois_hgrappe` |
| Destinataire | `laboratories` (réseau) | `external_labs` (externes, parent/enfant) |
| Numérotation | `SILP-YYMMDD-NNNNN` (avec liste) / `HSILP-YYMMDD-NNNNN` (sans) | `HG-YYMMDD-NNNNN` |
| Réception | Scan interne, `confirmer` / `signaler` | Confirmation par le **destinataire externe** |
| Confirmation | — | Page publique `/confirm` (jeton du QR, ou numéro + code de vérification de 10 caractères) ou fax (F-G-74) |
| Statuts | En attente, En transit, Reçu, Problème, Perdu, Annulé | En attente, En transit, Reçu, Problème, Aucune réponse reçue |
| Impression | Bordereau (formats) | Bordereau + **F-G-74** bilingue (QR + code-barres) |
| Bascule UI | `modeHG = false` | `modeHG = true` (`setMode`, sidebar adaptée) |

Le mode courant est porté par l'état `modeHG` (bascule via `setMode`/`initHGMode`). Les deux flux partagent bons de départ, échantillons, codes ICR et recherche globale.

---

## 9. Rôles et périmètres (résumé)

L'application distingue **le rôle système** (`profiles.role`) et **le rôle par laboratoire** (`user_lab_memberships.lab_role`).

| Rôle système | Périmètre |
|---|---|
| `technicien` | Ses labos ; ne modifie/annule que **ses propres** envois |
| `superviseur_labo` | Son labo ; gère utilisateurs et envois du labo (hors comptes admin) |
| `superviseur_grappe` | Tous les labos actifs ; accès KPI, historiques, config grappe |
| `admin` | Accès total, configuration système, secrets, notifications |

| Rôle par labo (`user_lab_memberships`) | Effet |
|---|---|
| `technicien` | Modifie ses propres envois du labo |
| `responsable` | Modifie/annule **tous** les envois du labo |

La fonction `current_labo_ids()` détermine les labos accessibles (tous si admin/grappe ; sinon memberships, avec repli legacy `labo_ids`/`labo_id`). Toutes les politiques RLS s'appuient sur `current_labo_ids()`, `current_lab_role()` et `current_role_name()`.

> Détail complet des rôles, politiques RLS, fonctions `SECURITY DEFINER`, gestion des secrets et anti-brute-force : voir **`04-securite.md`**.

---

## 10. Environnements

| Élément | Développement | Production |
|---|---|---|
| Front | `localhost` (`npx live-server public`) | Cloudflare Pages (`main` → prod) ; Render en secours |
| Build | Aucun (ES6 servis directement) | Aucun (répertoire `public/` publié tel quel) |
| Supabase | Projet de production (partagé) — séparation recommandée | Projet de production |
| Captcha Turnstile | Sitekey de test (connexion locale non prise en charge) | Activé, clé secrète de production |
| Edge Functions | `supabase functions serve` (Docker, gabarit `.env.example`) | Déployées, `verify_jwt = false` pour les 4 (authentification dans le code) |
| Base | `schema.sql` chargé sur une base vierge | Idem, dans le SQL Editor (pas de push automatique) |

Déploiement front : chaque push sur `main` déclenche un déploiement Cloudflare Pages automatique. Aucune variable d'environnement de build n'est requise (toute la configuration est dans `config.js`). La page publique `public/confirm/index.html` est autonome (script inline, sans dépendance aux modules principaux).

---

Dernière mise à jour : 2026-11-10 — chantier « secrets et durcissement »
