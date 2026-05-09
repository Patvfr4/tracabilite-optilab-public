# Documentation technique — Traçabilité OPTILAB

> Version : BETA 1.9.6 — Mise à jour : 2026-05-09
> Audience : développeur reprenant le projet ou intégrant l'équipe.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Architecture](#3-architecture)
4. [Structure du dépôt](#4-structure-du-dépôt)
5. [Environnements](#5-environnements)
6. [Supabase — Mise en place](#6-supabase--mise-en-place)
7. [Supabase — Migrations](#7-supabase--migrations)
8. [Supabase — Edge Functions](#8-supabase--edge-functions)
9. [Supabase — Sécurité (RLS)](#9-supabase--sécurité-rls)
10. [Supabase — Realtime](#10-supabase--realtime)
11. [Frontend — Configuration multi-domaine](#11-frontend--configuration-multi-domaine)
12. [Déploiement Cloudflare Pages](#12-déploiement-cloudflare-pages)
13. [Développement local](#13-développement-local)
14. [CI/CD — Sauvegarde base de données](#14-cicd--sauvegarde-base-de-données)
15. [Sécurité](#15-sécurité)
16. [Capacité & monitoring](#16-capacité--monitoring)
17. [Checklist onboarding](#17-checklist-onboarding)
18. [Références](#18-références)

---

## 1. Vue d'ensemble

OPTILAB Traçabilité est une **SPA (Single Page Application)** de suivi des envois inter-laboratoires pour le réseau BSL-GAS (Bas-Saint-Laurent / Gaspésie). Elle gère deux flux :

- **Intra-grappe** : envois entre les laboratoires du réseau, avec réception, alarmes de retard, et bons de départ.
- **Hors-grappe** : envois vers des laboratoires externes, avec confirmation bilingue (en ligne ou par fax), impression F-G-74.

Il n'y a **pas de serveur applicatif** : le frontend est 100 % statique, servi par Cloudflare Pages. Toute la logique métier repose sur **Supabase** (PostgreSQL + RLS + Edge Functions).

---

## 2. Stack technique

| Couche | Technologie | Notes |
|---|---|---|
| Frontend | HTML / CSS / JS vanilla | Pas de framework, pas de build step |
| Base de données | PostgreSQL (Supabase) | RLS pour la sécurité, fonctions SECURITY DEFINER |
| Auth | Supabase Auth | JWT, session courte, `must_change_password` |
| Realtime | Supabase Realtime | 4 tables publiées : `envois`, `profiles`, `app_config`, `envois_hgrappe` |
| Edge Functions | Deno (Supabase) | 3 fonctions : gestion utilisateurs, notifications, test |
| Hosting | Cloudflare Pages | Branche `main` → production |
| Backup DB | GitHub Actions + `pg_dump` | Quotidien à 4h UTC, artifacts 90 jours |
| Codes-barres | jsbarcode (CODE128) + bwip-js (DataMatrix) + qrcode.js | Librairies locales dans `public/lib/` |
| PDF | jsPDF (CDN) | Génération côté client |
| Graphiques | Chart.js (CDN) | Dashboard KPI uniquement |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Navigateur (client)                     │
│                                                             │
│  public/index.html   ←── SPA principale                     │
│  public/confirm/     ←── Page confirmation publique         │
│                                                             │
│  public/js/config.js ←── Lit hostname → injecte clés        │
│  public/js/main.js   ←── Point d'entrée ES modules          │
│  public/js/*.js      ←── Modules métier                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (Supabase client JS)
           ┌───────────▼───────────────────────────┐
           │           Supabase                    │
           │                                       │
           │  ┌─────────────┐  ┌────────────────┐  │
           │  │ PostgreSQL  │  │ Supabase Auth  │  │
           │  │ + RLS       │  │ (JWT, sessions)│  │
           │  └─────────────┘  └────────────────┘  │
           │                                       │
           │  ┌─────────────┐  ┌────────────────┐  │
           │  │  Realtime   │  │ Edge Functions │  │
           │  │ (WebSocket) │  │  (Deno)        │  │
           │  └─────────────┘  └────────────────┘  │
           └───────────────────────────────────────┘
```

**Flux de démarrage :**
1. Cloudflare Pages sert `public/index.html`
2. `config.js` lit `window.location.hostname` → injecte `window.SUPABASE_URL`, `window.SUPABASE_KEY`, `window.EDGE_URL`
3. `app.js` crée le client Supabase (`createClient(URL, KEY, {auth:{storage:sessionStorage}})`)
4. L'utilisateur se connecte via `auth.signInWithPassword` (email = `{employee_id}@optilab.internal`)
5. Le profil est chargé depuis `profiles` avec les memberships
6. `loadConfig()`, `loadLabs()`, `loadGrappeConfig()` sont appelés en parallèle
7. L'application est opérationnelle

---

## 4. Structure du dépôt

```
optilab-envois/
├── public/                         # Frontend statique (servi par Cloudflare)
│   ├── index.html                  # SPA principale (~4 000 lignes)
│   ├── confirm/
│   │   └── index.html              # Page confirmation publique (sans auth)
│   ├── js/
│   │   ├── config.js               # ⚠️  Clés Supabase par domaine — à adapter
│   │   ├── app.js                  # Initialisation globale, state window.*
│   │   ├── main.js                 # Point d'entrée ES modules → window.*
│   │   ├── state.js                # Proxy window.* → modules ES
│   │   ├── utils.js                # Fonctions pures
│   │   ├── ui.js                   # Toasts, spinner, panels, modals, thème
│   │   ├── auth.js                 # Auth, session, inactivité, multi-labo
│   │   ├── labs.js                 # Laboratoires, sélecteurs, températures
│   │   ├── envois.js               # CRUD envois intra-grappe
│   │   ├── hgrappe.js              # Mode hors-grappe
│   │   ├── app-config.js           # Configuration admin
│   │   ├── bons-depart.js          # Module bons de départ
│   │   ├── print.js                # Impression bordereau intra
│   │   ├── print-hg.js             # Impression bordereau + F-G-74
│   │   └── kpi.js                  # Dashboard KPI
│   ├── lib/
│   │   ├── jsbarcode.min.js        # CODE128 (v3.11.6)
│   │   ├── qrcode.min.js           # QR codes
│   │   └── bwip-js.min.js          # Barcode/QR rendering
│   └── css/
│       └── app.css                 # Styles (dark mode, variables CSS)
│
├── supabase/
│   ├── schema.sql                  # Schéma consolidé (snapshot de référence)
│   ├── migrations/                 # Migrations à appliquer dans l'ordre
│   │   ├── 012_multi_labo.sql
│   │   ├── 013_notifications.sql
│   │   ├── 014_kpi_function.sql
│   │   ├── 015_bons_depart.sql
│   │   ├── 016_numeros_silp.sql
│   │   ├── 017_fix_hsilp_prefix.sql
│   │   ├── 018_kpi_hg.sql
│   │   ├── 019_annulation_envoi.sql
│   │   ├── 020_hg_nc_notifications.sql
│   │   ├── 021_module_config.sql
│   │   ├── 022_hg_module_config.sql
│   │   ├── 023_user_lab_memberships.sql
│   │   └── 024_grappes.sql
│   └── functions/
│       ├── deno.json               # Config Deno (strict mode)
│       ├── manage-user/index.ts    # Gestion utilisateurs (service role)
│       ├── send-notifications/index.ts
│       └── test-notification/index.ts
│
├── .github/
│   └── workflows/
│       └── db-backup.yml           # Backup pg_dump quotidien
│
├── doc.md                          # Ce fichier
├── fonctions.md                    # Référence toutes les fonctions JS + SQL
├── RECETTE.md                      # Plan de recette (tests)
├── CAPACITE_SUPABASE.md            # Analyse capacité Supabase
└── CHANGELOG.md                    # Historique des versions
```

---

## 5. Environnements

Le projet utilise **deux projets Supabase distincts** : un pour la production, un pour le développement local.

| Environnement | Domaine | Projet Supabase |
|---|---|---|
| Production (Cloudflare) | `optilab-envois.pages.dev` | `dnrujegqadohwtrknmxj` |
| Production (Render) | `optilab-envois.onrender.com` | `dnrujegqadohwtrknmxj` |
| Dev Cloudflare | `tests-deploiement.optilab-envois.pages.dev` | `dnrujegqadohwtrknmxj` |
| Dev Render | `dev-optilab-envois.onrender.com` | `dnrujegqadohwtrknmxj` |
| **Local** | `localhost` | `uuhslyvrlfuoamuvgobc` ← différent |
| 127.0.0.1 | — | `dnrujegqadohwtrknmxj` |

> **Important :** `localhost` pointe sur un projet Supabase séparé pour éviter de polluer les données de production pendant le développement. Les migrations doivent être appliquées sur les deux projets.

La sélection se fait automatiquement dans `public/js/config.js` à la lecture de `window.location.hostname`. Si le domaine n'est pas reconnu, le premier entrée de `CONFIGS` est utilisée en fallback avec un `console.warn`.

---

## 6. Supabase — Mise en place

### 6.1 Création du projet

1. Créer un projet Supabase sur [supabase.com](https://supabase.com) — région **Canada Central** (conformité données médicales QC).
2. Récupérer les clés dans **Project Settings → API** :
   - `URL` → `https://{ref}.supabase.co`
   - `anon public` → clé publique (exposée dans le frontend)
   - `service_role` → clé admin (Edge Functions uniquement, **ne jamais exposer**)
   - `DB connection string` → pour les backups (`pg_dump`)

### 6.2 Application du schéma initial

Deux approches possibles :

**Option A — Schéma consolidé (nouveau projet)**
Coller le contenu de `supabase/schema.sql` dans l'éditeur SQL Supabase et exécuter. Ce fichier est un snapshot de l'état final — il inclut toutes les tables, fonctions, triggers, politiques RLS et séquences.

**Option B — Migrations séquentielles (reprise d'un projet existant)**
Appliquer chaque migration dans l'ordre numérique via l'éditeur SQL :
```
012 → 013 → 014 → 015 → 016 → 017 → 018 → 019 → 020 → 021 → 022 → 023 → 024
```

> **Ne pas mélanger les deux approches.** Sur un projet vierge, utiliser A. Pour mettre à jour un projet déjà en production, utiliser B (uniquement les migrations non encore appliquées).

### 6.3 Configuration Auth

Dans **Auth → Settings** :
- **JWT expiry** : recommandé 3 600 s (1h) — l'app détecte l'expiration et déconnecte proprement
- **Email confirm** : désactiver (les emails sont en `@optilab.internal`, pas de confirmation email)
- **URL de confirmation** : non applicable
- **Rate limiting** : laisser les valeurs par défaut

### 6.4 Configuration Realtime

Dans **Database → Replication**, activer la publication pour ces 4 tables :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE envois;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE app_config;
ALTER PUBLICATION supabase_realtime ADD TABLE envois_hgrappe;
```

Ces tables déclenchent les mises à jour temps réel dans l'application. Si le Realtime ne fonctionne pas après déploiement, vérifier ces publications en premier.

### 6.5 Données initiales

Après le schéma, insérer les données de base :

**Grappe :**
```sql
INSERT INTO grappes (id, name, code, active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Grappe 1 — Bas-Saint-Laurent / Gaspésie',
  'BSL-GAS',
  true
);
```

> La migration 024 le fait déjà si on utilise les migrations. Pour un nouveau projet avec `schema.sql`, l'insérer manuellement.

**Configuration de base :**
```sql
INSERT INTO app_config (key, value) VALUES
  ('app_name', '"OPTILAB Traçabilité"'),
  ('app_subtitle', '"Réseau BSL-GAS"'),
  ('alarm_hours', '24'),
  ('alarm_days', '3'),
  ('transporters', '["FedEx", "Purolator"]'),
  ('bordereau_cfg', '{"activeFormat":"lettre","printBordereau":true}');
```

**Premier administrateur :**
Créer via l'interface Supabase Auth → Users → Invite user, ou via la Edge Function une fois déployée. L'email doit être `{employee_id}@optilab.internal`. Ensuite, mettre à jour le profil :
```sql
UPDATE profiles
SET role = 'admin', must_change_password = true
WHERE id = '{uuid_de_l_utilisateur}';
```

---

## 7. Supabase — Migrations

### Contenu de chaque migration

| Fichier | Ce qu'elle fait |
|---|---|
| `012_multi_labo.sql` | Table `profiles.labo_ids` (UUID[]), fonction `current_labo_ids()`, trigger sync |
| `013_notifications.sql` | 4 tables : `notification_config`, `notification_emails`, `notification_queue`, `notification_log` |
| `014_kpi_function.sql` | Fonction `get_labo_kpis(labo_id, days)` |
| `015_bons_depart.sql` | 3 tables `bons_depart*`, 5 fonctions RPC, 3 triggers de complétion automatique |
| `016_numeros_silp.sql` | Refactorise la numérotation — séquence `envoi_seq`, trigger `generate_envoi_numero()`, colonne `numeros_silp TEXT[]` |
| `017_fix_hsilp_prefix.sql` | Corrige le préfixe `SILP-` → `HSILP-` pour les envois sans liste |
| `018_kpi_hg.sql` | Enrichit `get_labo_kpis()` avec les stats hors-grappe |
| `019_annulation_envoi.sql` | Annulation logique : colonnes `annule_at/par/note`, RPC `annuler_envoi()` |
| `020_hg_nc_notifications.sql` | Déclenche `notification_queue` sur confirmation non-conforme HG |
| `021_module_config.sql` | Table `module_config`, fonction `is_module_active()`, `envois.transporteur` nullable, RPC bons de départ avec `p_transporteur_map` |
| `022_hg_module_config.sql` | Migre `hgrappe_enabled_labs` de `app_config` vers `module_config` |
| `023_user_lab_memberships.sql` | Table `user_lab_memberships`, fonction `current_lab_role()`, refactoring `annuler_envoi()` |
| `024_grappes.sql` | Tables `grappes` + `grappe_config`, colonne `laboratories.grappe_id`, migration des réglages depuis `app_config` |

### Appliquer une migration

1. Ouvrir l'éditeur SQL Supabase (onglet **SQL Editor**)
2. Coller le contenu du fichier de migration
3. Exécuter
4. Vérifier l'absence d'erreur dans la sortie

> Supabase n'a pas de système de migration automatique côté client (pas de `supabase db push` en production sans CLI). Les migrations sont appliquées manuellement via l'éditeur SQL.

### Vérifier l'état des migrations

```sql
-- Tables présentes
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Fonctions présentes
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' ORDER BY routine_name;

-- Triggers actifs
SELECT tgname, tgrelid::regclass FROM pg_trigger ORDER BY tgrelid::regclass;
```

---

## 8. Supabase — Edge Functions

### Fonctions déployées

| Fonction | Rôle | JWT requis |
|---|---|---|
| `manage-user` | Créer/modifier/activer-désactiver des utilisateurs Auth | Non (vérification manuelle) |
| `send-notifications` | Envoyer les emails de la `notification_queue` | Non (appelé par cron) |
| `test-notification` | Envoyer un email de test immédiatement | Oui |

### Déploiement

Prérequis : [Supabase CLI](https://supabase.com/docs/guides/cli) installé et lié au projet.

```bash
# Lier le projet
supabase link --project-ref {ref_projet}

# Déployer manage-user (--no-verify-jwt car la fonction gère le JWT manuellement)
supabase functions deploy manage-user --no-verify-jwt

# Déployer send-notifications (appelé par cron Supabase, pas de token utilisateur)
supabase functions deploy send-notifications --no-verify-jwt

# Déployer test-notification
supabase functions deploy test-notification
```

### Fonctionnement de `manage-user`

La fonction crée deux clients Supabase distincts :
- **Admin client** (`service_role`) : bypass RLS, accès complet Auth
- **User client** (token JWT du demandeur) : vérifie l'identité et le rôle

Flux pour la création d'un utilisateur :
1. Vérifie que le demandeur est admin/superviseur_grappe/superviseur_labo
2. Si superviseur_labo, vérifie que le labo cible correspond au sien
3. `adminClient.auth.admin.createUser({ email, password, user_metadata })`
4. INSERT dans `profiles` avec tous les champs
5. Retourne `{ success: true, profileId: uuid }`

L'email est automatiquement formaté en `{employee_id}@optilab.internal`.

### Cron pour les notifications

Configurer dans **Database → Cron** de Supabase :
```
Nom : send-notifications
Schedule : 0 14 * * 1-5   (14h UTC = 10h EST, jours ouvrables)
Command : SELECT net.http_post(
  url := '{SUPABASE_URL}/functions/v1/send-notifications',
  headers := '{"Content-Type": "application/json"}'::jsonb
);
```

### Variables d'environnement des Edge Functions

Supabase injecte automatiquement :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Aucune variable supplémentaire à configurer manuellement pour les fonctions existantes.

---

## 9. Supabase — Sécurité (RLS)

### Principe

La clé `anon` (publique) est exposée dans le frontend — c'est normal et prévu par Supabase. La sécurité repose **entièrement sur le Row Level Security (RLS)** côté PostgreSQL. Chaque requête est filtrée selon le JWT de l'utilisateur.

### Fonctions d'accès (SECURITY DEFINER)

Ces fonctions sont appelées par les politiques RLS :

| Fonction | Retourne | Utilisée dans |
|---|---|---|
| `current_labo_ids()` | `UUID[]` | Toutes les politiques SELECT/INSERT/UPDATE |
| `current_lab_role(labo_id)` | `TEXT` | Politique annulation envoi |
| `current_role_name()` | `TEXT` | Politiques admin |

> Les fonctions `SECURITY DEFINER` s'exécutent avec les droits du propriétaire, pas de l'utilisateur appelant. C'est nécessaire pour lire `user_lab_memberships` sans exposer les memberships des autres utilisateurs.

### Politiques par table

| Table | Lecture | Écriture |
|---|---|---|
| `envois` | Tous (authenticated) | exp/dest labo OU superviseur/admin |
| `envois_hgrappe` | Tous (authenticated) | exp labo OU superviseur/admin |
| `profiles` | Soi-même + superviseurs du labo | Soi-même + superviseurs + admin |
| `laboratories` | Tous (authenticated) | Admin seulement |
| `app_config` | Tous (authenticated + anon) | Admin seulement |
| `module_config` | Tous (authenticated) | Admin/superviseur_grappe |
| `grappe_config` | Tous (authenticated) | Admin/superviseur_grappe |
| `user_lab_memberships` | Soi-même + superviseurs | Admin/superviseur_grappe |
| `notification_config` | Admin/superviseur_grappe | Admin seulement |
| `envois_audit` | Tous (authenticated) | Tous (authenticated) |

### Tester les politiques

```sql
-- Simuler un utilisateur spécifique
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "{uuid_utilisateur}"}';

-- Vérifier ce que cet utilisateur peut voir
SELECT COUNT(*) FROM envois;
```

---

## 10. Supabase — Realtime

### Tables publiées

```sql
-- Vérifier les tables en publication
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Attendu : `envois`, `profiles`, `app_config`, `envois_hgrappe`.

### Fonctionnement dans l'app

Le canal Realtime est géré dans `envois.js` par `subscribeRT()`. Il est activé uniquement quand l'utilisateur est sur un panel qui nécessite des mises à jour temps réel (liste `_RT_PANELS`). Sur les autres panels, le canal est supprimé pour éviter les reconnexions inutiles.

Chaque changement déclenche :
1. Vidage du cache modal correspondant (`state.cacheModals` ou `state.hgCacheModals`)
2. Rechargement des envois (`loadEnvois()` ou `loadEnvoisHG()`)
3. Re-rendu du panel actif si applicable

### Limites

Plan Free : 2 000 000 messages/mois, 200 connexions simultanées. Voir [CAPACITE_SUPABASE.md](CAPACITE_SUPABASE.md) pour l'estimation de charge réelle (~100 000 messages/mois à 150 envois/jour).

---

## 11. Frontend — Configuration multi-domaine

### Fichier `public/js/config.js`

Ce fichier est le **seul endroit** où les clés Supabase sont déclarées. Il est exécuté en premier (script `defer` dans `index.html`) et injecte trois globales :

```javascript
window.SUPABASE_URL  // URL du projet Supabase
window.SUPABASE_KEY  // Clé anon (publique)
window.EDGE_URL      // = SUPABASE_URL + '/functions/v1'
```

### Ajouter un nouveau domaine

Ajouter une entrée dans l'objet `CONFIGS` :

```javascript
'mon-nouveau-domaine.example.com': {
  supabaseUrl: 'https://{ref}.supabase.co',
  supabaseKey: 'sb_publishable_...',
},
```

> La clé `anon` est publique par conception Supabase. Ne jamais mettre la clé `service_role` ici.

### Ajouter un nouvel environnement (projet Supabase séparé)

1. Créer le projet Supabase
2. Appliquer le schéma (`supabase/schema.sql`)
3. Appliquer toutes les migrations
4. Déployer les Edge Functions
5. Ajouter l'entrée dans `config.js` avec les nouvelles clés

---

## 12. Déploiement Cloudflare Pages

### Configuration

1. Connecter le dépôt GitHub à [Cloudflare Pages](https://pages.cloudflare.com)
2. Paramètres de build :
   - **Branch** : `main`
   - **Build command** : *(vide — pas de build)*
   - **Build output directory** : `public`
   - **Root directory** : *(vide)*
3. **Variables d'environnement** : aucune requise — toute la configuration est dans `config.js`

### Domaines

Cloudflare Pages génère automatiquement `{projet}.pages.dev`. Configurer les domaines personnalisés dans l'interface Cloudflare si nécessaire.

### Déploiement automatique

Chaque push sur `main` déclenche un déploiement automatique. Les Preview deployments sont créés pour les autres branches (utile pour tester avant merge).

### Page de confirmation publique

`public/confirm/index.html` est une page distincte accessible sans authentification à l'URL `/confirm?n=...&c=...`. Elle n'a pas de dépendances sur les modules JS principaux — elle charge son propre script inline.

---

## 13. Développement local

### Prérequis

- Navigateur moderne (Chrome ou Firefox recommandé)
- `npx` disponible (Node.js installé)
- Accès au projet Supabase de développement (`localhost` dans `config.js`)

### Lancer le serveur local

```bash
# Depuis la racine du dépôt
npx live-server public --port=3000
```

L'application est accessible sur `http://localhost:3000`. `config.js` détecte `localhost` et pointe sur le projet Supabase de développement.

> **Pas de build.** Les fichiers JS sont des ES modules servis directement par le navigateur. Les modifications sont visibles immédiatement après rechargement.

### Développement des Edge Functions

Pour tester les Edge Functions localement :

```bash
# Installer la CLI Supabase
npm install -g supabase

# Démarrer Supabase local (Docker requis)
supabase start

# Servir les fonctions localement
supabase functions serve --env-file .env.local
```

Fichier `.env.local` (ne pas committer) :
```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY={clé locale}
SUPABASE_SERVICE_ROLE_KEY={clé service locale}
```

### VS Code

Le fichier `.vscode/settings.json` configure l'extension Deno pour les Edge Functions :
```json
{
  "deno.enablePaths": ["supabase/functions"],
  "deno.unstable": false,
  "[typescript]": {
    "editor.defaultFormatter": "denoland.vscode-deno"
  }
}
```

Installer l'extension **Deno** (`denoland.vscode-deno`) pour l'autocomplétion dans les Edge Functions.

---

## 14. CI/CD — Sauvegarde base de données

### Workflow GitHub Actions

Fichier : `.github/workflows/db-backup.yml`

| Paramètre | Valeur |
|---|---|
| Déclencheur | Quotidien à 4h UTC (minuit EST), ou manuel |
| Outil | `pg_dump` v17 |
| Stockage | GitHub Artifacts, rétention 90 jours |
| Compression | gzip |

### Secret requis

Dans **Settings → Secrets and variables → Actions** du dépôt GitHub :

| Secret | Valeur | Où trouver |
|---|---|---|
| `SUPABASE_DB_URL` | `postgresql://postgres:{password}@db.{ref}.supabase.co:5432/postgres` | Supabase → Settings → Database → Connection string (direct) |

### Restauration

```bash
# Télécharger l'artifact depuis GitHub Actions
# Décompresser : backup.sql.gz → backup.sql

# Restaurer (remplace toutes les données)
psql "$SUPABASE_DB_URL" < backup.sql
```

> Attention : une restauration complète efface toutes les données existantes. Pour une restauration partielle, extraire les tables nécessaires du dump avec `pg_restore` ou éditer le SQL.

---

## 15. Sécurité

### Clés Supabase

| Clé | Exposition | Utilisation |
|---|---|---|
| `anon` (publishable) | Frontend (`config.js`) | Client Supabase navigateur — filtré par RLS |
| `service_role` | Edge Functions uniquement | Bypass RLS — **ne jamais exposer côté client** |
| `DB connection string` | GitHub Secrets | Backups uniquement |

La clé `anon` est lisible dans le code source — c'est intentionnel. Sa valeur seule ne donne accès à rien sans JWT utilisateur valide, grâce aux politiques RLS.

### Authentification

- Les utilisateurs se connectent avec leur **numéro d'employé** (pas leur email réel)
- L'email Supabase est `{employee_id}@optilab.internal` — jamais exposé à l'utilisateur
- **Changement de mot de passe forcé** à la première connexion (`must_change_password = true`)
- **Déconnexion automatique** après 15 min d'inactivité (timer `setTimeout` côté client)
- **Rate limiting login** : 5 tentatives → verrouillage 30 s (géré côté client dans `auth.js`, renforcer côté Supabase si besoin)

### Comptes de test

Le flag `is_test = true` sur un profil désactive :
- La contrainte de longueur de mot de passe
- Le changement de mot de passe obligatoire

Ces comptes sont identifiés par un badge `TEST` dans l'UI. **Ne jamais créer de compte `is_test` en production.**

### Audit trail

Toute modification d'un envoi est enregistrée dans `envois_audit` avec :
- `table_name`, `record_id`, `action` (INSERT/UPDATE/DELETE/ANNULATION)
- `old_data`, `new_data` (JSONB)
- `changed_fields`, `changed_by_id`, `changed_by_nom`, `changed_at`

Cette table n'a pas de politique de purge automatique par défaut — voir [CAPACITE_SUPABASE.md](CAPACITE_SUPABASE.md#6-risque-principal--table-envois_audit) pour les recommandations.

### XSS

Toutes les données affichées dans le DOM passent par `escapeHtml()` (`utils.js`). Les seuls `innerHTML` avec données externes utilisent cette fonction. Le CSS personnalisé (admin uniquement) est injecté dans une balise `<style>` dédiée — pas dans le DOM directement.

---

## 16. Capacité & monitoring

Voir [CAPACITE_SUPABASE.md](CAPACITE_SUPABASE.md) pour l'analyse complète.

### Résumé

| Ressource | Consommation estimée | Limite Free | Statut |
|---|---|---|---|
| Bande passante | ~181 MB/mois | 5 GB | ✅ (~3,6 %) |
| Stockage (hors audit) | ~77 MB/an | 500 MB | ✅ (~5–6 ans) |
| **Stockage (`envois_audit`)** | **~438 MB/an** | 500 MB | ⚠️ Critique |
| Realtime | ~100 000 msg/mois | 2 000 000 | ✅ (~5 %) |
| Auth MAU | ~40 | 50 000 | ✅ |

### Risque principal : `envois_audit`

Sans politique de rétention, `envois_audit` épuise le stockage Free en moins d'un an à 200 envois/jour.

**Solution recommandée** — cron Supabase mensuel :
```sql
-- Purger les entrées d'audit de plus d'un an
DELETE FROM envois_audit WHERE changed_at < now() - interval '1 year';
```

Configurer dans **Database → Cron** :
```
Nom : purge-audit
Schedule : 0 3 1 * *   (1er de chaque mois à 3h UTC)
Command : DELETE FROM envois_audit WHERE changed_at < now() - interval '1 year';
```

### Monitoring recommandé

Vérifier mensuellement dans le tableau de bord Supabase :

| Indicateur | Chemin | Seuil d'alerte |
|---|---|---|
| Bande passante | *Reports → Bandwidth* | > 2,5 GB/mois |
| Stockage DB | *Reports → Database* | > 300 MB |
| Realtime | *Reports → Realtime* | > 1 500 000 msg/mois |

### Plan Pro

Recommandé dès la mise en production ($25 USD/mois) pour :
- **PITR** (Point-in-Time Recovery) — restauration à la minute près
- **Backup quotidien automatique** (remplace le workflow GitHub Actions)
- **SLA** — uptime garanti
- Stockage 8 GB (vs 500 MB Free)
- Logs d'accès complets

---

## 17. Checklist onboarding

### Nouveau projet Supabase (production)

- [ ] Créer le projet — région Canada Central
- [ ] Appliquer `supabase/schema.sql` (ou migrations 012→024)
- [ ] Activer RLS sur toutes les tables (vérifier avec `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'`)
- [ ] Ajouter les 4 tables à `supabase_realtime`
- [ ] Insérer la grappe BSL-GAS dans `grappes`
- [ ] Insérer la config de base dans `app_config`
- [ ] Créer le premier utilisateur admin
- [ ] Déployer les 3 Edge Functions (`manage-user`, `send-notifications`, `test-notification`)
- [ ] Configurer le cron notifications dans **Database → Cron**
- [ ] Configurer le cron purge audit dans **Database → Cron**
- [ ] Ajouter les clés dans `public/js/config.js` (nouveau domaine)
- [ ] Ajouter `SUPABASE_DB_URL` dans les secrets GitHub

### Déploiement Cloudflare Pages

- [ ] Connecter le dépôt GitHub
- [ ] Build command : *(vide)*, Output directory : `public`
- [ ] Vérifier l'accès à `{projet}.pages.dev/index.html`
- [ ] Vérifier l'accès à `{projet}.pages.dev/confirm/index.html`
- [ ] Tester la connexion avec un compte admin
- [ ] Tester la création d'un envoi intra-grappe
- [ ] Tester l'impression d'un bordereau

### Vérifications post-déploiement

```sql
-- Toutes les tables présentes
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Attendu : 18+

-- RLS activée
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Attendu : 0 résultat (toutes les tables ont RLS)

-- Fonctions SQL présentes
SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public';
-- Attendu : 20+

-- Realtime actif
SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Attendu : 4
```

---

## 18. Références

| Document | Contenu |
|---|---|
| [fonctions.md](fonctions.md) | Référence exhaustive de toutes les fonctions JS (14 modules) + SQL (18 fonctions + 8 triggers) |
| [RECETTE.md](RECETTE.md) | Plan de test fonctionnel — 33 sections, checklist par fonctionnalité |
| [CAPACITE_SUPABASE.md](CAPACITE_SUPABASE.md) | Analyse de capacité Supabase — bande passante, stockage, Realtime, recommandations |
| [CHANGELOG.md](CHANGELOG.md) | Historique des versions depuis BETA 1.0.0 |

### Liens externes

| Ressource | URL |
|---|---|
| Supabase Dashboard | [supabase.com/dashboard](https://supabase.com/dashboard) |
| Supabase JS Client docs | [supabase.com/docs/reference/javascript](https://supabase.com/docs/reference/javascript/introduction) |
| Supabase Edge Functions (Deno) | [supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions) |
| Cloudflare Pages | [pages.cloudflare.com](https://pages.cloudflare.com) |
| Supabase CLI | [supabase.com/docs/reference/cli](https://supabase.com/docs/reference/cli/introduction) |
