# 01 — Architecture de l'application

> Projet : **Traçabilité OPTILAB — BSL-GAS**
> Version : **BETA 1.10.0**
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
| Hébergement front | **Cloudflare Pages** (+ Render en secours) | Répertoire publié : `public/` |
| Base de données | **PostgreSQL** (Supabase) | RLS + fonctions `SECURITY DEFINER` |
| Authentification | **Supabase Auth** | JWT, session `sessionStorage`, `must_change_password` |
| Temps réel | **Supabase Realtime** (WebSocket) | 4 tables publiées |
| Fonctions serveur | **Edge Functions Deno** (Supabase) | `manage-user`, `send-notifications`, `auth-gate`, `test-notification` |
| Emails | **Resend** (ou SMTP), via **cron pg_cron** | Récapitulatif quotidien |
| Cron / planification | **pg_cron** + **pg_net** (Supabase) | Notifications + détection d'alarmes |
| Secrets serveur | Colonnes RLS admin de `notification_config` (mig. 028) | Clé Resend / SMTP ; Turnstile secret dans Supabase Auth |
| Anti-brute-force login | Edge Function `auth-gate` + **Cloudflare Turnstile** (captcha) | Rate-limit serveur (`login_attempts`) |
| Codes-barres | **bwip-js** (CODE128, DataMatrix, QR) | Librairie **locale** (`public/lib/`) |
| PDF | jsPDF | Génération côté client |
| Graphiques | Chart.js | Dashboard KPI uniquement |
| Sauvegarde DB | GitHub Actions + `pg_dump` | Quotidienne, artifacts |

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
│  │ SECURITY DEF │   │                │   │ profiles, app_config │    │
│  └──────┬───────┘   └────────────────┘   └──────────────────────┘    │
│         │                                                            │
│  ┌──────▼───────┐   ┌────────────────┐   ┌──────────────────────┐    │
│  │ pg_cron +    │   │ Edge Functions │   │ notification_config  │    │
│  │ pg_net       │──▶│ Deno           │   │ (secrets, RLS admin) │    │
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
3. `app.js` crée le client Supabase : `createClient(URL, KEY, { auth: { storage: window.sessionStorage, storageKey: 'optilab-auth', autoRefreshToken: true, persistSession: true } })`.
4. Au `DOMContentLoaded` : `initTheme()`, `initLoginBg()`, `applyBranding()`, `setupKeyboard()`, `capDateInputsToToday()`, `setupConfirmModal()`.
5. `sb.auth.getSession()` : si une session existe → `loadProfileAndInit(userId)` ; sinon → `loadConfig()` puis écran de connexion.
6. Connexion : l'utilisateur saisit son **numéro d'employé** ; l'email interne est `{employee_id}@optilab.internal` (jamais exposé). Rate-limit via `auth-gate` + captcha Turnstile selon domaine.
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
│   ├── lib/                        # Librairies locales (CSP stricte, pas de CDN)
│   │   └── bwip-js.min.js          #   CODE128, DataMatrix, QR (bordereaux, F-G-74, bons de départ)
│   └── js/
│       ├── config.js               # ⚠️ Clés Supabase par domaine + Turnstile (public)
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
│   ├── schema.sql                  # Schéma consolidé de référence (base vierge)
│   ├── config.toml                 # Config projet Supabase (CLI)
│   ├── migrations/                 # Migrations séquentielles 012 → 044
│   └── functions/                  # Edge Functions Deno
│       ├── deno.json
│       ├── manage-user/index.ts        # Gestion utilisateurs (service_role)
│       ├── send-notifications/index.ts # Envoi des emails de la file d'attente
│       ├── auth-gate/index.ts          # Rate-limit login + captcha Turnstile
│       └── test-notification/index.ts  # Email de test (admin)
│
├── .github/workflows/db-backup.yml # Sauvegarde pg_dump quotidienne
├── docs/architecture/              # Ce dossier
├── doc.md                          # Documentation technique historique
├── CHANGELOG.md (public/)          # Historique des versions
├── fonctions.md, RECETTE.md, CAPACITE_SUPABASE.md
```

### Répartition des responsabilités (`public/js`)

| Fichier | Responsabilité principale |
|---|---|
| `config.js` | Sélection de la base Supabase selon le domaine ; **seul** endroit où figurent URL + clé anon |
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
| `app-config.js` | Panneau de configuration : grappe, modules, formats, badges, thème, notifications (dont la clé Resend) |

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

`config.js` mappe le `hostname` vers un jeu de clés. Les globales injectées sont `window.SUPABASE_URL`, `window.SUPABASE_KEY` (clé **anon / publishable**, publique par conception), `window.EDGE_URL` (= URL + `/functions/v1`) et `window.TURNSTILE_SITE_KEY`.

| Domaine | Environnement | Projet Supabase |
|---|---|---|
| `optilab-envois.pages.dev` | Production Cloudflare | `aozluuihgzzvgwdvjnxb` |
| `optilab-envois.onrender.com` | Production Render (secours) | `aozluuihgzzvgwdvjnxb` |
| `tests-deploiement.optilab-envois.pages.dev` | Dev Cloudflare | `aozluuihgzzvgwdvjnxb` |
| `dev-optilab-envois.onrender.com` | Dev Render | `aozluuihgzzvgwdvjnxb` |
| `localhost` / `127.0.0.1` | Développement local | `aozluuihgzzvgwdvjnxb` |

Le captcha Turnstile est **actif en production** (clé site présente) et **désactivé en local** (`turnstileSiteKey: ''`). Si le domaine n'est pas reconnu, repli sur la première entrée avec `console.warn`.

> **Note pour auditeurs** : dans la BETA 1.10.0, **tous les domaines pointent vers le même projet Supabase** (`aozluuihgzzvgwdvjnxb`). L'ancienne séparation local ↔ production décrite dans `doc.md` (BETA 1.9.6) n'est plus en vigueur ; il n'existe donc plus de base de développement isolée côté données.

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

**Tables publiées** dans `supabase_realtime` : `envois`, `envois_hgrappe`, `profiles`, `app_config`.

**Limites** : plan Free Supabase — 2 000 000 messages/mois, 200 connexions simultanées. Voir `CAPACITE_SUPABASE.md` pour l'estimation de charge.

---

## 8. Intra-grappe vs Hors-grappe

| Aspect | Intra-grappe | Hors-grappe |
|---|---|---|
| Table | `envois` | `envois_hgrappe` |
| Destinataire | `laboratories` (réseau) | `external_labs` (externes, parent/enfant) |
| Numérotation | `SILP-YYMMDD-NNNNN` (avec liste) / `HSILP-YYMMDD-NNNNN` (sans) | `HG-YYMMDD-NNNNN` |
| Réception | Scan interne, `confirmer` / `signaler` | Confirmation par le **destinataire externe** |
| Confirmation | — | Page publique `/confirm` (token / numéro+code) ou fax (F-G-74) |
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
| Supabase | Projet `aozluuihgzzvgwdvjnxb` (partagé) | Projet `aozluuihgzzvgwdvjnxb` |
| Captcha Turnstile | Désactivé (`''`) | Activé |
| Edge Functions | `supabase functions serve` (Docker) | Déployées (`--no-verify-jwt` pour `manage-user`, `send-notifications`, `auth-gate`) |
| Migrations | Appliquées via SQL Editor / CLI | Idem (pas de push automatique) |

Déploiement front : chaque push sur `main` déclenche un déploiement Cloudflare Pages automatique. Aucune variable d'environnement de build n'est requise (toute la configuration est dans `config.js`). La page publique `public/confirm/index.html` est autonome (script inline, sans dépendance aux modules principaux).

---

Dernière mise à jour : 2026-07-04 — BETA 1.10.0
