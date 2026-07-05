# Dépendances externes — Traçabilité OPTILAB

> Document d'audit — inventaire des services tiers et des librairies utilisés par l'application.
> Application 100 % front statique (aucun build, aucun gestionnaire de paquets côté client) :
> les librairies sont soit chargées par CDN, soit versionnées (« vendored ») dans `public/lib/`.

---

## 1. Services externes (tiers)

| Service | Rôle | Criticité | Données transmises |
|---|---|---|---|
| **Supabase Cloud** | Base PostgreSQL, authentification JWT, Realtime, Edge Functions (Deno) | **Critique** | Toutes les données applicatives |
| **Cloudflare Pages** | Hébergement statique du dossier `public/` + déploiement automatique sur `git push` | **Critique** | Fichiers statiques uniquement (pas de données métier) |
| **Cloudflare Turnstile** | Captcha anti-robot sur l'écran de connexion | Élevée | Signaux anti-abus du navigateur |
| **Resend** | Envoi des courriels de notification (non-conformités, alarmes) | Moyenne — optionnel, activable par laboratoire | Adresses courriel destinataires + contenu de notification |

**Remarques d'audit**
- Aucune donnée patient nominative n'est censée transiter dans les envois (numéros de listes SIL-P, métadonnées d'expédition). Voir [04-securite.md](04-securite.md).
- La clé **service_role** Supabase ne doit **jamais** être exposée côté client ; elle n'est utilisée que par les Edge Functions. Les clés côté navigateur sont de type **publishable/anon** (publiques par conception).
- La clé **Resend** n'est jamais dans le front. Elle est stockée dans la colonne `notification_config.resend_api_key` (migration `028`, protégée par RLS admin), saisie via l'UI d'administration. La tentative antérieure de stockage via **Supabase Vault** (migration `025`) **n'a pas fonctionné** sur le plan utilisé et a été abandonnée. Voir [04-securite.md](04-securite.md).

---

## 2. Librairies JavaScript chargées par CDN

| Librairie | Version | Origine CDN | Chargement | Rôle | Licence |
|---|---|---|---|---|---|
| **@supabase/supabase-js** | 2.x | `cdn.jsdelivr.net` | `<script>` (index + `/confirm`) | Client base de données, authentification, Realtime | MIT |
| **Chart.js** | 4.x | `cdn.jsdelivr.net` | `<script>` (index) | Graphiques du tableau de bord KPI (`kpi.js`) | MIT |
| **@zxing/library** | 0.19.2 | `cdn.jsdelivr.net` | `<script>` (index) | Lecture caméra de codes-barres / DataMatrix (scan mobile) | MIT / Apache-2.0 |
| **jsPDF** | 2.5.1 | `cdnjs.cloudflare.com` | Import dynamique (`envois.js`) | Génération des documents PDF | MIT |
| **jsPDF-AutoTable** | 3.5.31 | `cdnjs.cloudflare.com` | Import dynamique (`envois.js`) | Tableaux dans les PDF (résumés, manifestes) | MIT |
| **Cloudflare Turnstile** | v0 | `challenges.cloudflare.com` | `<script async>` (index) | Widget captcha du login | Propriétaire (service Cloudflare) |

**Remarques d'audit**
- Les scripts CDN constituent une surface de **chaîne d'approvisionnement** (supply chain). La **CSP stricte** (`public/_headers`) restreint les origines autorisées — voir [04-securite.md](04-securite.md).
- jsPDF / jsPDF-AutoTable ne sont chargés qu'**à la demande** (première génération de PDF), ce qui réduit le poids initial.

---

## 3. Librairies versionnées localement (`public/lib/`)

| Fichier | Rôle | Statut |
|---|---|---|
| `bwip-js.min.js` | Génération des codes-barres **CODE128**, **DataMatrix** et **QR Code** pour l'impression (bordereaux, F-G-74). Chargé en import dynamique par `print.js` (`_ensureBwip()`). | **Utilisé** |

> `bwip-js` couvre à lui seul les codes-barres 1D et les QR/DataMatrix. Les anciennes librairies `jsbarcode` et `qrcode`, devenues inutilisées, ont été retirées.

> Versionner bwip-js localement évite une dépendance CDN pour la fonction critique d'impression des étiquettes.

---

## 4. Dépendances côté serveur (Edge Functions Deno)

Les Edge Functions Supabase (`supabase/functions/`) s'exécutent sous **Deno**. Leurs dépendances sont déclarées dans `supabase/functions/deno.json` et importées par URL (Deno std, `@supabase/supabase-js`). Fonctions concernées :

| Fonction | Rôle |
|---|---|
| `auth-gate` | Limitation de débit du login + validation Turnstile côté serveur |
| `manage-user` | Création / gestion des utilisateurs (gère le JWT manuellement) |
| `send-notifications` | Envoi des courriels via Resend (appelée par le cron pg_cron) |
| `test-notification` | Envoi d'un courriel de test pour valider la configuration |
| `set-secret` | Écriture des secrets dans Supabase Vault — **inerte** (Vault abandonné, voir 04-securite) |

---

## 5. Outillage (développement / exploitation)

| Outil | Usage |
|---|---|
| **Supabase CLI** (`supabase`) | Liaison au projet, application des migrations (`db push`), déploiement des Edge Functions |
| **Git / GitHub** | Contrôle de version ; déclenche le déploiement Cloudflare Pages |
| **pg_cron** (extension PostgreSQL) | Planification de l'envoi des notifications et de la détection des alarmes |

Voir le dossier [../deploiement/](../deploiement/) pour la mise en place complète.

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
