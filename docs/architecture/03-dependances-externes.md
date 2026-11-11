# Dépendances externes — Traçabilité OPTILAB

> Document d'audit — inventaire des services tiers et des librairies utilisés par l'application.
> Application 100 % front statique (aucun build, aucun gestionnaire de paquets côté client) :
> les librairies sont soit chargées depuis un CDN en **version exacte avec empreinte SRI**, soit
> versionnées (« vendored ») dans `public/lib/`.

---

## 1. Services externes (tiers)

| Service | Rôle | Criticité | Données transmises |
|---|---|---|---|
| **Supabase Cloud** | Base PostgreSQL (dont le Vault des secrets applicatifs), authentification JWT, Realtime, Edge Functions (Deno), tâches planifiées (pg_cron + pg_net) | **Critique** | Toutes les données applicatives |
| **Cloudflare Pages** | Hébergement statique du dossier `public/` + déploiement automatique sur `git push` | **Critique** | Fichiers statiques uniquement (pas de données métier) |
| **Cloudflare Turnstile** | Captcha anti-robot sur l'écran de connexion | Élevée | Signaux anti-abus du navigateur |
| **Resend** (ou relais SMTP) | Envoi des courriels de notification (non-conformités, alarmes) | Moyenne — optionnel, activable par laboratoire | Adresses courriel destinataires + contenu de notification (dont le champ libre « Observation ») |
| **GitHub** | Dépôt, CI (Actions), sauvegarde chiffrée de la base (dépôt privé) | Élevée | Code ; sauvegarde **chiffrée** (`age`) |

**Remarques d'audit**
- Aucune donnée patient nominative n'est censée transiter (numéros de listes SIL-P, métadonnées d'expédition) ; la base contient en revanche des **renseignements personnels** du personnel. Voir [04-securite.md](04-securite.md).
- La clé **secrète** Supabase n'est jamais exposée côté client ; la plateforme l'injecte dans les fonctions Edge. Le navigateur n'utilise que la clé **publiable**, publique par conception.
- Les clés **Resend** et **SMTP** ne sont jamais dans le front : elles sont saisies par un admin dans l'application et stockées **chiffrées dans le Supabase Vault** (RPC `set_app_secret`), puis lues par les fonctions Edge via `get_app_secret()`, réservée au serveur. Voir [04-securite.md](04-securite.md) §5.

---

## 2. Librairies JavaScript chargées par CDN

| Librairie | Version | Origine | Chargement | Rôle | Licence |
|---|---|---|---|---|---|
| **@supabase/supabase-js** | **2.118.0** | `cdn.jsdelivr.net`, chemin explicite `dist/umd/supabase.js` | `<script>` avec `integrity` (sha384) + `crossorigin` (index + `/confirm`) | Client base de données, authentification, Realtime | MIT |
| **Chart.js** | **4.6.1** | `cdn.jsdelivr.net` | **à la demande** (`loadScriptOnce(src, integrity)`, `kpi.js`), avec SRI | Graphiques du tableau de bord KPI | MIT |
| **@zxing/library** | **0.19.2** | `cdn.jsdelivr.net` | **à la demande** (`loadScriptOnce`, scan caméra), avec SRI | Lecture caméra de codes-barres / DataMatrix | MIT / Apache-2.0 |
| **Cloudflare Turnstile** | v0 | `challenges.cloudflare.com` | `<script async>` (index) | Widget captcha du login | Propriétaire (service Cloudflare) |

**Remarques d'audit**
- `loadScriptOnce(src, integrity)` (`public/js/utils.js`) **refuse** de charger un script d'une autre origine sans empreinte. Les URL et empreintes sont centralisées (`LIB_CHARTJS`, `LIB_ZXING`). Changer de version = changer l'URL **et** recalculer l'empreinte (`openssl dgst -sha384 -binary | openssl base64 -A`).
- **Turnstile** est la seule exception à la règle « version exacte + SRI » : Cloudflare impose l'adresse exacte de `api.js`, sans version figée ni copie (un proxy ou un cache casserait le widget à ses mises à jour).
- **cdnjs n'est plus utilisé** et n'est plus autorisé par la CSP.
- Le job CI « client » (`.github/scripts/verif_scripts_tiers.py`) vérifie, hors `public/lib/`, que chaque script distant a une version exacte, une empreinte et `crossorigin`, et que chaque `loadScriptOnce` d'une librairie distante passe son empreinte.

---

## 3. Librairies versionnées localement (`public/lib/`)

| Fichier | Version | Rôle |
|---|---|---|
| `lib/jspdf/4.2.1/jspdf.umd.min.js` | jsPDF **4.2.1** | Génération des documents PDF (résumés, manifestes) — chargé à la demande |
| `lib/jspdf-autotable/5.0.9/jspdf.plugin.autotable.min.js` | jsPDF-AutoTable **5.0.9** | Tableaux dans les PDF — chargé à la demande |
| `lib/bwip-js.min.js` | bwip-js **4.10.1** | Codes-barres **CODE128**, **DataMatrix** et **QR Code** (bordereaux, F-G-74), chargé par `print.js` |

> Les copies locales de jsPDF et AutoTable ont été vérifiées octet pour octet contre l'archive npm officielle (`dist.integrity` du registre) ; leurs empreintes sha384 sont notées en commentaire dans `public/js/utils.js`. Elles sont servies par la même origine que l'application : une empreinte SRI n'y apporterait rien. Elles échappent à Dependabot : **vérifier les avis de sécurité (OSV) à chaque mise à jour**. jsPDF est passé de 2.5.1 (12 avis connus) à 4.2.1 (aucun avis connu à la date du chantier).

> Le chemin versionné (`/lib/<nom>/<version>/`) garantit qu'une mise à jour n'est pas masquée par le cache de 30 jours de `/lib/*`.

---

## 4. Dépendances côté serveur (Edge Functions Deno)

Les fonctions s'exécutent sous **Deno** sur Supabase. Dépendances en **version exacte**, écrites en toutes lettres dans le module partagé (le déploiement ne lit ni le `deno.json` global ni `deno.lock`, qui servent à la CI) :

| Dépendance | Où | Rôle |
|---|---|---|
| `npm:@supabase/supabase-js@2.118.0` (même version que le navigateur) | `supabase/functions/_shared/clients.ts` | Clients admin (clé secrète) et public (clé publiable) |
| denomailer 1.6.0 (`deno.land/x`) | `supabase/functions/_shared/courriel.ts` | Envoi SMTP (STARTTLS, certificat vérifié) |

`supabase/functions/deno.lock` fige le graphe d'exécution (sommes d'intégrité) ; la CI exécute `deno check --frozen`, `deno lint` et `deno test`.

| Fonction | Rôle |
|---|---|
| `auth-gate` | Point d'entrée du login : exige le jeton captcha et le transmet à Supabase Auth (qui le valide), vérifie le profil actif |
| `manage-user` | Création, réinitialisation, (dés)activation des comptes (bannissement + révocation des sessions) ; changement de mot de passe imposé |
| `send-notifications` | Envoi des courriels via Resend ou SMTP (appelée par pg_cron, protégée par `NOTIFY_TRIGGER_SECRET`) |
| `test-notification` | Courriel de test (admin actif) |

La fonction `set-secret` (connexion PostgreSQL directe) est **supprimée** : l'écriture des secrets passe par les RPC du Vault.

---

## 5. Outillage (développement / exploitation)

| Outil | Usage |
|---|---|
| **Supabase CLI** (`supabase`) | Liaison au projet, déploiement des fonctions Edge (le schéma se charge dans le SQL Editor) |
| **Git / GitHub** | Contrôle de version ; déclenche le déploiement Cloudflare Pages ; CI (`ci.yml`) et sauvegarde (`db-backup.yml`, dépôt privé) |
| **gitleaks** + **pre-commit** | Détection de secrets avant le commit (hook) et sur tout l'historique (job CI « secrets ») |
| **Dependabot** | Mises à jour des actions GitHub (épinglées par SHA) et du hook pre-commit |
| **pg_cron**, **pg_net** (extensions PostgreSQL) | Tâches planifiées : envoi des notifications, détection des alarmes, purges, chien de garde |
| **age** | Chiffrement des sauvegardes |

Voir le dossier [../deploiement/](../deploiement/) pour la mise en place complète.

---

*Dernière mise à jour : 2026-11-10 — chantier « secrets et durcissement »*
