# Traçabilité OPTILAB — Dossier technique — DRI CISSS BSL

> **Développeur :** Patxi VIEL — CISSS Bas-Saint-Laurent  
> **Dernière mise à jour :** 2026-04-30

---

## Table des matières

1. [Présentation](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Composants techniques et alternatives](#3-composants-techniques-et-alternatives)
   - [Hébergement frontend — Cloudflare Pages](#31-hébergement-frontend--cloudflare-pages)
   - [Base de données et backend — Supabase](#32-base-de-données-et-backend--supabase)
   - [Bibliothèques JavaScript tierces](#33-bibliothèques-javascript-tierces)
4. [Sécurité](#4-sécurité)
5. [Schéma de base de données](#5-schéma-de-base-de-données)
6. [Essentiels de maintenance](#6-essentiels-de-maintenance)
7. [Prochaines étapes](#7-prochaines-étapes)

> **Note importante :** L'application a été conçue pour être hébergée en production via Cloudflare Pages. Pour la démonstration et les tests, elle est déployée via Render (service équivalent)   

---

## 1. Présentation

**Traçabilité OPTILAB** est une application web de traçabilité des envois d'échantillons biologiques entre les laboratoires de la grappe OPTILAB Bas-Saint-Laurent — Gaspésie. Elle couvre deux périmètres :

- **Intra-grappe** : envois entre les 16 sites du réseau BSL-GAS, tracés par numéro de liste de repérage SILP ou numéro HSILP séquentiel.
- **Hors-grappe** : envois vers des laboratoires externes (CHU de Québec, CHUM, etc.) avec génération automatique du formulaire F-G-74 et suivi des accusés de réception.

L'application est accessible depuis tout navigateur sans installation côté client. Elle remplace les processus manuels (feuilles de route papier, confirmation par fax non tracée).

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│              NAVIGATEUR (client)                    │
│                                                     │
│  public/index.html  ←─ SPA (Single-Page Application)│
│  public/js/app.js   ←─ Toute la logique (~3 000 L.) │
│  public/js/config.js←─ Mapping domaine → Supabase   │
│  public/css/app.css ←─ Styles + dark mode           │
│  public/confirm/    ←─ Page publique (sans login)   │
└────────────────┬────────────────────────────────────┘
                 │ HTTPS / WebSocket
                 ▼
┌─────────────────────────────────────────────────────┐
│         SUPABASE (Backend as a Service)             │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐   │
│  │  PostgreSQL  │  │  Auth (JWT)  │  │ Realtime │   │
│  │  (données)   │  │              │  │ WebSocket│   │
│  └──────────────┘  └──────────────┘  └──────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │  Edge Function : manage-user Deno/TypeScript │   │
│  │  → Création / modification des comptes       │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│   CLOUDFLARE PAGES (hébergement statique)           │
│   → Sert les fichiers du dossier public/            │
│   → Déploiement automatique à chaque git push       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│   GITHUB (dépôt de code source)                     │
└─────────────────────────────────────────────────────┘
```

### Flux de données

| Action | Trajet |
|--------|--------|
| Connexion | Navigateur → Supabase Auth → JWT stocké localement |
| Lecture des envois | Navigateur → PostgREST (API REST auto-générée) → PostgreSQL |
| Création d'un envoi | Navigateur → `sb.rpc()` → Fonction SQL PostgreSQL |
| Mise à jour en temps réel | PostgreSQL → Supabase Realtime → WebSocket → Navigateur |
| Création d'utilisateur | Navigateur → Edge Function `manage-user` → Supabase Auth + `profiles` |
| Impression | Navigateur uniquement (HTML dans iframe caché → `window.print()`) |
| Génération PDF | Navigateur uniquement (jsPDF, aucun serveur) |

**Il n'y a pas de serveur applicatif intermédiaire.** Le navigateur communique directement avec Supabase. Le seul code côté serveur est l'Edge Function `manage-user`, qui s'exécute sur les serveurs de Supabase.

---

## 3. Composants techniques et alternatives

### 3.1 Hébergement frontend — Cloudflare Pages

**Rôle :** Servir les fichiers statiques du dossier `public/` au navigateur.

**Utilisation actuelle :**
- Hébergement gratuit (plan Free de Cloudflare Pages *et Render*).
- Déploiement automatique : chaque `git push` sur `main` déclenche un build et déploiement en ~1 minute.
- Réseau mondial CDN (contenu servi depuis la région la plus proche de l'utilisateur).
- HTTPS automatique avec certificat Let's Encrypt.
- Règles d'en-têtes HTTP de sécurité (`public/_headers`) : `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`.

**Fichiers concernés :** `public/` (HTML, CSS, JS, images), `public/_headers`, `public/_redirects`.

**Alternatives :**

| Solution | Type | Auto-hébergeable | Notes |
|----------|------|:---:|-------|
| **Apache / Nginx** | Serveur web statique | ✅ Oui | Hébergement sur infrastructure CISSS. Copier `public/` dans le répertoire web. Ajouter les en-têtes de `_headers` manuellement dans la config. |
| **Caddy** | Serveur web moderne | ✅ Oui | Configuration plus simple qu'Apache/Nginx, HTTPS automatique intégré. |
| **IIS** | Serveur web Windows | ✅ Oui | Compatible si le CISSS exploite déjà IIS. Nécessite configuration manuelle des en-têtes. |
| **Netlify** | Hébergement statique | ❌ SaaS | Équivalent fonctionnel de Cloudflare Pages. Même modèle de déploiement via Git. |
| **GitHub Pages** | Hébergement statique | ❌ SaaS | Gratuit, intégré à GitHub. Pas de support des en-têtes personnalisés (plan gratuit). |

> **Auto-hébergement :** Un serveur Apache ou Nginx sur infrastructure interne CISSS est la solution la plus simple. Le déploiement consiste à copier le contenu de `public/` dans le `DocumentRoot`. Aucune compilation, aucune dépendance Node.js en production.

---

### 3.2 Base de données et backend — Supabase

**Rôle :** Base de données PostgreSQL, authentification, API REST, temps réel (WebSocket) et Edge Functions.

**Utilisation actuelle :**
- Instance Supabase cloud (projet hébergé sur les serveurs de Supabase, région `ca-central-1` — Canada).
- Plan Free (500 Mo stockage, 5 Go bande passante/mois, 50 000 utilisateurs actifs/mois).
- L'application pointe vers deux projets distincts : un pour la production, un pour le développement/tests (configurable dans `config.js`).

**Ce que fournit Supabase pour ce projet :**

| Service Supabase | Utilisation dans l'application |
|-----------------|-------------------------------|
| PostgreSQL | Stockage de toutes les données (envois, laboratoires, utilisateurs, configuration) |
| Auth (JWT) | Connexion par numéro employé, gestion des sessions, refresh tokens |
| PostgREST | API REST auto-générée : `SELECT`, `INSERT`, `UPDATE` depuis le navigateur |
| Row Level Security (RLS) | Contrôle d'accès au niveau des lignes PostgreSQL |
| Realtime | Mise à jour automatique des listes sans rechargement de page |
| Edge Functions | Création et modification des comptes utilisateurs (nécessite `service_role`) |
| SQL Editor / Dashboard | Console d'administration de la base |

**Alternatives :**

| Solution | Type | Auto-hébergeable | Notes |
|----------|------|:---:|-------|
| **Supabase self-hosted** | BaaS open source | ✅ Oui | Image Docker officielle. Fournit exactement les mêmes services (PostgreSQL + Auth + Realtime + Edge Functions). Migration transparente : seul `config.js` à modifier. [supabase.com/docs/guides/self-hosting](https://supabase.com/docs/guides/self-hosting) |
| **PocketBase** | BaaS léger | ✅ Oui | Binaire unique (Go), SQLite ou PostgreSQL. Très simple à déployer. Nécessiterait une adaptation de l'API client. |
| **AppWrite** | BaaS open source | ✅ Oui | Équivalent à Supabase, interface d'administration plus soignée. Nécessiterait une réécriture des appels API. |
| **PostgreSQL + PostgREST + GoTrue** | Composants séparés | ✅ Oui | C'est exactement ce que Supabase assemble. Solution plus complexe à opérer mais maximale flexibilité. |

> **Recommandation :** La migration vers **Supabase self-hosted** est la voie la moins risquée pour un hébergement interne. L'application n'aurait aucun changement de code à faire, seulement la mise à jour des URLs et clés dans `config.js`. Supabase self-hosted nécessite Docker et environ 2 à 4 Go de RAM.
> Cependant, si notre utilisation ne dépasse pas les limites de l'offre gratuite, la solution BaaS cloud est la plus simple à mettre en place.

---

### 3.3 Bibliothèques JavaScript tierces

Ces bibliothèques sont chargées depuis des CDN publics à chaque ouverture de l'application. Elles ne sont pas incluses dans le dépôt.

| Bibliothèque | Version | CDN | Rôle |
|-------------|---------|-----|------|
| `supabase-js` | 2.x | `cdn.jsdelivr.net` | Client Supabase (API, Auth, Realtime) |
| `jsPDF` | 2.x | `cdnjs.cloudflare.com` | Génération PDF côté client |
| `jsPDF-AutoTable` | 3.x | `cdnjs.cloudflare.com` | Tableaux dans les PDF |
| `JsBarcode` | 3.x | `cdn.jsdelivr.net` | Génération de codes-barres CODE128 |
| `qrcode.min.js` | 1.x | `cdnjs.cloudflare.com` | Génération de QR codes |
| Google Fonts | — | `fonts.googleapis.com` | Police Inter (interface) |

**Risques des CDN publics :**
- Dépendance à la disponibilité de services tiers.
- Chargement impossible en réseau isolé ou sans accès Internet.
- Risque théorique d'empoisonnement de CDN. Ajout possible de l'intégrité des sous-ressources — SRI.

**Alternative : hébergement local des bibliothèques**

>Dans le cadre d'un environnement sans accès internet, la BDD doit également être hébergée localement.

Pour un environnement sans accès Internet ou pour éliminer la dépendance aux CDN tiers, toutes ces bibliothèques peuvent être téléchargées et placées dans `public/js/lib/`. Il suffit ensuite de modifier les balises `<script>` dans `index.html` et `confirm/index.html` pour pointer vers les chemins locaux.

```
public/js/lib/
├── supabase.min.js
├── jspdf.umd.min.js
├── jspdf-autotable.min.js
├── jsbarcode.all.min.js
└── qrcode.min.js
```

---

## 4. Sécurité

### Clé Supabase dans le code source (`config.js`)

La clé `anon` (anonyme) de Supabase est une **clé publique par conception**. Elle est visible dans le code source et dans les requêtes réseau du navigateur — c'est le comportement attendu et documenté par Supabase.

**Cette clé ne donne accès à rien par elle-même.** La sécurité des données repose entièrement sur les **politiques Row Level Security (RLS)** définies dans PostgreSQL. Même avec la clé, un attaquant ne peut accéder qu'aux données que les politiques RLS autorisent pour un utilisateur non connecté (aucune donnée sensible). Pour les confirmation en ligne des envois hors-grappe, un token unique est associé à chaque envoi pour accéder aux données.

La clé à ne jamais exposer est la clé `service_role` (équivalent d'un accès `postgres` sans restrictions). Celle-ci est utilisée uniquement par l'Edge Function `manage-user`, qui s'exécute côté serveur Supabase et n'est jamais envoyée au navigateur.

### Authentification

- Connexion par numéro employé + mot de passe.
- Sessions gérées par JWT (expiration automatique + refresh token).
- Changement de mot de passe obligatoire à la première connexion (`must_change_password`).
- Quatre niveaux de rôle : `technicien`, `superviseur_labo`, `superviseur_grappe`, `admin`.
- Chaque action en base vérifie le rôle via les politiques RLS.
- Supabase nécessite une adresse courriel pour les utilisateurs. Une adresse fictive est générée automatiquement `@optilab.internal`.


### Protection XSS

Toutes les données affichées via `innerHTML` passent par la fonction `esc()` qui échappe `&`, `<`, `>`, `"`, `'`. Les URLs dans les messages Markdown configurables sont vérifiées pour bloquer les schémas `javascript:`, `data:` et `vbscript:`.

### En-têtes HTTP de sécurité (`public/_headers`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: [politique configurée]
```

### Confirmation hors-grappe

La confirmation en ligne nécessite le **code de vérification à 6 caractères** imprimé sur le F-G-74 physique. Ce code n'est jamais transmis via une API publique. Seul quelqu'un ayant reçu le colis physiquement (et donc le document) peut confirmer la réception.

---

## 5. Schéma de base de données

```
┌─────────────────┐       ┌─────────────────┐
│   laboratories  │       │   app_config    │
│─────────────────│       │─────────────────│
│ id (UUID PK)    │       │ key (TEXT PK)   │
│ name            │       │ value (JSONB)   │
│ adresse, ville  │       │ updated_at      │
│ telephone, fax  │       └─────────────────┘
│ active          │
└────────┬────────┘
         │ référencé par
         ▼
┌─────────────────┐       ┌─────────────────┐
│    profiles     │       │     envois      │
│─────────────────│       │─────────────────│
│ id (→auth.users)│       │ id (UUID PK)    │
│ employee_id     │       │ numero_liste    │
│ nom             │       │ exp_labo_id ──┐ │
│ labo_id ────────┤       │ dest_labo_id ─┤ │
│ role            │       │ temperature   │ │
│ active          │       │ transporteur  │ │
│ must_change_pw  │       │ departements[]│ │
│ theme           │       │ statut        │ │
└─────────────────┘       │ ts_envoi      │ │
                          │ ts_recep      │ │
                          └───────────────┘ │
                                            │ → laboratories
┌─────────────────┐       ┌─────────────────┐
│  external_labs  │       │ envois_hgrappe  │
│─────────────────│       │─────────────────│
│ id (UUID PK)    │       │ id (UUID PK)    │
│ name            │       │ numero (HG-...) │
│ parent_id ──────┘ (self │ exp_labo_id     │
│ adresse, ville   join)  │ dest_ext_lab_id │
│ telephone, fax          │ numeros_silp[]  │
│ label_text              │ confirm_token   │
│ active                  │ confirm_method  │
└─────────────────┘       │ statut          │
                          └─────────────────┘
```

**Séquences PostgreSQL :**
- `hsilp_seq` — Numérotation des envois sans liste SILP (`HSILP00001`, `HSILP00002`…).
- `hgrappe_seq` — Numérotation des envois hors-grappe (`HG-260430-00001`…).

**Fonctions SQL notables :**
- `create_envoi_hsilp(...)` — Création atomique d'un envoi HSILP avec génération du numéro séquentiel.
- `create_envoi_hgrappe(...)` — Création atomique d'un envoi hors-grappe.
- `get_envoi_hgrappe_by_token(UUID)` — Lecture publique (sans auth) pour la page de confirmation.
- `confirm_envoi_hgrappe(UUID, ...)` — Enregistrement de la confirmation publique.
- `current_labo_id()` — Retourne le `labo_id` de l'utilisateur connecté (utilisé dans les politiques RLS).

---

## 6. Essentiels de maintenance

### 6.1 Accès administratifs

| Ressource | Notes |
|-----------|-------|
| Code source | Dépôt GitHub |
| Dashboard Supabase | Compte Supabase |
| Dashboard Cloudflare Pages | Compte Cloudflare |
| Console d'administration app | Onglet Config intégré à l'application : Gestion des labos, utilisateurs, configuration |

### 6.2 Sauvegardes de la base de données

**Supabase Cloud (état actuel) :** Sauvegardes automatiques quotidiennes incluses dans le plan Pro (rétention 30 jours sur plan Pro). Restauration possible depuis le tableau de bord Supabase : *Project Settings → Backups*.

**Sauvegarde manuelle :**
```bash
# Export complet de la base
pg_dump "postgresql://postgres:[MOT_DE_PASSE]@db.[PROJET].supabase.co:5432/postgres" \
  --no-owner --no-acl -f backup_$(date +%Y%m%d).sql

# La chaîne de connexion se trouve dans :
# Supabase Dashboard → Project Settings → Database → Connection string
```

**Données à sauvegarder en priorité :**
- Table `envois` et `envois_hgrappe` (données métier). Conservation légale 2 ans (Guide OPTMQ).
- Table `laboratories` et `external_labs` (référentiels).
- Table `profiles` (comptes utilisateurs).
- Table `app_config` (configuration de l'application).

### 6.3 Déploiement d'une mise à jour

**Processus actuel (Cloudflare Pages/Render) :**
1. Modifier le code dans le dépôt GitHub.
2. `git push` sur la branche `main`.
3. Cloudflare Pages détecte le push et déploie automatiquement en ~1 minute.
4. Aucune interruption de service pendant le déploiement.

**Si auto-hébergé (Apache/Nginx) :**
1. Modifier le code.
2. Copier le contenu du dossier `public/` vers le répertoire web du serveur (ex. `rsync -av public/ user@serveur:/var/www/optilab/`).
3. Aucun redémarrage de serveur nécessaire (fichiers statiques).

### 6.4 Migrations de base de données

Toutes les migrations sont archivées dans `supabase/migrations/archive/`. Le fichier `supabase/schema.sql` représente l'**état consolidé actuel** de la base (toutes migrations appliquées).

**Pour appliquer une modification de schéma :**
1. Écrire le SQL de modification.
2. L'exécuter dans *Supabase Dashboard → SQL Editor*.
3. Mettre à jour `supabase/schema.sql` pour refléter l'état final.
4. Archiver le script de migration dans `supabase/migrations/archive/`.

**Tester une migration :**
Utiliser le projet Supabase de développement (pointé par `localhost` dans `config.js`) pour valider la migration avant de l'appliquer en production.

### 6.5 Gestion des utilisateurs

Les comptes utilisateurs se gèrent depuis l'interface admin de l'application (panneau *Utilisateurs*, rôle `admin` ou `superviseur_labo`). Aucun accès direct à Supabase n'est nécessaire pour les opérations courantes.

**Opérations disponibles dans l'interface :**
- Créer un compte (numéro employé + mot de passe temporaire).
- Modifier le rôle, le laboratoire, le nom.
- Réinitialiser le mot de passe.
- Activer / désactiver un compte.

**En cas de perte du compte admin :**
Recréer un compte admin directement via *Supabase Dashboard → SQL Editor* :
```sql
-- 1. Créer l'utilisateur dans auth.users via le dashboard Auth
-- 2. Mettre à jour son profil
UPDATE profiles SET role = 'admin' WHERE employee_id = 'EMP_ID_ICI';
```

### 6.6 Mises à jour des bibliothèques JavaScript

Les bibliothèques sont chargées depuis des CDN avec une version fixe dans l'URL. Elles ne se mettent pas à jour automatiquement.

**Vérification des vulnérabilités :**
- Consulter périodiquement les advisories GitHub des bibliothèques utilisées.
- En cas de vulnérabilité : mettre à jour le numéro de version dans les balises `<script>` de `index.html` et `confirm/index.html`.

**Bibliothèques à surveiller :**
- `supabase-js` — Client Supabase, critique.
- `jsPDF` — Génération PDF.
- `JsBarcode` — Codes-barres.

### 6.7 Surveillance et incidents

**Métriques à surveiller :**

| Indicateur | Où vérifier |
|-----------|-------------|
| Disponibilité Supabase | [status.supabase.com](https://status.supabase.com) |
| Disponibilité Cloudflare | [cloudflarestatus.com](https://www.cloudflarestatus.com) |
| Utilisation base de données | Supabase Dashboard → Reports |
| Connexions actives | Supabase Dashboard → Auth → Users |
| Erreurs JavaScript | Console navigateur (F12) sur un poste utilisateur |

**Quotas plan Free Supabase à surveiller :**
- Espace de stockage : 500 Mo (1 envoi ~1kB/envoi =	~490 000 envois).
- Bande passante : 5 Go/mois.
- Connexions Realtime simultanées : 200.

Voir la simulation pour plus de détails.

### 6.8 Données de démonstration

Des fichiers SQL sont disponibles pour initialiser un environnement de test ou de démonstration :

| Fichier | Contenu |
|--------|---------|
| `supabase/seed.sql` | Laboratoires du réseau BSL-GAS + configuration initiale |
| `supabase/seed_demo.sql` | ~50 envois intra-grappe fictifs (fév–avr 2026) |
| `supabase/seed_demo_hgrappe.sql` | ~56 envois hors-grappe fictifs + laboratoires externes |
| `supabase/seed_demo_users.sql` | Comptes de test pour tous les rôles (mdp : `Optilab2026!`) |

Ces fichiers contiennent **uniquement des données fictives** (noms inventés, adresses courriel `@optilab.test`). Ils sont sans impact sur la production.

### 7. Prochaines étapes

**Consultation**

Discussion avec tous les acteurs des laboratoires (T.M, Technicien.ne classe B, Responsable des envois, Équipe qualité ) pour adapter au maximum les interfaces, les formats, bordereaux et documents au fonctionnement des laboratoires.

**Vérifications techniques & Documentation**

Tester toutes les fonctionnalités pour déceler les erreurs et les bugs. Créer de la documentation pour les utilisateurs.

**Projet pilote**

Mise en place de l'application pour deux laboratoires de la grappe (ex : Rivière-du-Loup vers Rimouski). Monitorer les usages, bugs, suggestions

**Mise en production**

Mise en production dans les 16 laboratoires de la grappe.