# 01 — Supabase Cloud (pas à pas)

Cette étape crée la base de données, applique le schéma et les migrations, configure Auth et Realtime, déploie les Edge Functions et planifie les crons.

Projet de production actuel : ref **`aozluuihgzzvgwdvjnxb`**. Pour un redéploiement complet vous créez un **nouveau** projet et remplacez cette ref partout (config front + migrations 036/037 qui contiennent une URL en dur).

---

## 1. Créer le projet Supabase

1. Connectez-vous à [app.supabase.com](https://app.supabase.com).
2. **New project**.
3. Renseignez :
   - **Name** : `optilab-envois`
   - **Database Password** : générez un mot de passe fort et **conservez-le** (requis pour `supabase link` et les backups).
   - **Region** : **Canada (Central)** — requis (conformité Loi 25).
4. **Create new project**, patientez ~2 minutes.

---

## 2. Récupérer l'URL et les clés

Dans **Settings → API** :

| Élément | Exemple | Usage |
|---|---|---|
| **Project URL** | `https://aozluuihgzzvgwdvjnxb.supabase.co` | `config.js` (front) |
| **Publishable key** (anon) | `sb_publishable_…` | `config.js` (front) — publique, filtrée par RLS |
| **`service_role` key** | `eyJ…` / `sb_secret_…` | ⚠️ **admin, bypass RLS** — jamais côté client (injectée seule dans les Edge Functions) |

Dans **Settings → Database** : notez aussi la **Connection string** (mode *direct*, port 5432) pour les backups et pour le secret `SUPABASE_DB_URL`.

> ⚠️ La clé `anon`/`publishable` est publique **par conception**. Sa valeur seule ne donne accès à rien sans un JWT utilisateur valide, grâce aux politiques RLS. La clé `service_role`, en revanche, contourne le RLS : ne la mettez **jamais** dans `public/`.

---

## 3. Lier le projet local à la CLI

Installez la CLI si nécessaire :

```bash
npm install -g supabase
supabase --version
```

Authentifiez-vous, puis liez le dépôt local au projet :

```bash
supabase login
supabase link --project-ref <VOTRE_PROJECT_REF>
```

Le `project-ref` est la partie alphanumérique de l'URL du dashboard :
`https://supabase.com/dashboard/project/`**`aozluuihgzzvgwdvjnxb`**

La CLI demande le **Database Password** défini à la création.

---

## 4. Appliquer le schéma et les migrations

Les migrations vivent dans `supabase/migrations/` et sont numérotées. La CLI les applique dans l'ordre.

```bash
# Applique toutes les migrations non encore appliquées sur le projet lié
supabase db push
```

Vérifiez l'état :

```bash
supabase migration list
```

La colonne **Remote** doit lister toutes les migrations locales.

### Migrations présentes (aperçu)

Le schéma de base (tables `envois`, `envois_hgrappe`, `profiles`, `laboratories`, `app_config`, bons de départ, notifications, etc.) est posé par les migrations `012`→`024`. Les migrations suivantes ajoutent :

| Migration | Contenu |
|---|---|
| `025_vault_app_secrets.sql` | Extension Vault + RPC `set_app_secret` / `get_app_secret` (voir §7). |
| `026`, `029` | Rate-limit anti brute-force sur la confirmation hors-grappe anonyme. |
| `027_login_attempts.sql` | Table `login_attempts` + RPC `count_recent_login_failures` / `record_login_attempt` (utilisées par `auth-gate`). |
| `028_secrets_sans_vault.sql` | Colonnes `resend_api_key` / `smtp_pass` sur `notification_config` (**mécanisme réellement utilisé** pour la clé Resend). |
| `030`→`033` | Durcissement RLS : `search_path` fixe, clauses `WITH CHECK`, révocation anon. |
| `034_metabase_readonly_role.sql` | Rôle PostgreSQL read-only pour Metabase (optionnel — voir §9). |
| `035_echantillons_module.sql` | Module gestion des échantillons. |
| `036`→`039` | Cron notifications (pg_cron + pg_net), puis reprogrammation (voir §8). |
| `040`, `041` | Codes ICR / valeurs pondérées (Workload). |
| `042_tour_progress.sql` | Progression du parcours de formation (`profiles.tour_progress`). |
| `043_revoke_anon_execute.sql` | Révocation `EXECUTE` anon sur les fonctions internes. |
| `044_cron_detect_alarms.sql` | Cron de détection des alarmes (types `alarm`, `alarm_r`, `hg_alarm`). |
| `045_metabase_ro_no_bypassrls.sql` | Retire `BYPASSRLS` du rôle Metabase + politiques `SELECT` explicites (optionnel — voir §9). |

> ⚠️ **URL en dur dans 036/037.** Les migrations `036_cron_notifications.sql` et `037_cron_no_auth.sql` contiennent l'URL `https://aozluuihgzzvgwdvjnxb.supabase.co/.../send-notifications`. Ces migrations créent une fonction wrapper qui est **ensuite supprimée par `038_drop_trigger_fn.sql`** (le cron appelle désormais directement l'Edge Function, cf. §8). Il n'y a donc **rien à modifier** dans ces fichiers pour un nouveau projet — l'URL en dur devient inerte. Le cron actif est reconfiguré à l'étape §8.

### Alternative sans CLI (éditeur SQL)

Si vous ne pouvez pas utiliser la CLI, ouvrez **SQL Editor** dans le dashboard et exécutez chaque fichier de `supabase/migrations/` **dans l'ordre numérique**, un par un, en vérifiant l'absence d'erreur. (Le schéma consolidé `supabase/schema.sql`, s'il est présent, peut aussi servir de point de départ pour un projet vierge.)

---

## 5. Configurer l'authentification

Dans **Authentication → Sign In / Providers → Email** :

- **Confirm email** : **désactivé** (les comptes utilisent des adresses `{employee_id}@optilab.internal`, jamais de vraie boîte).
- **Enable Email provider** : activé.

Dans **Authentication → Sessions / JWT** :

- **JWT expiry** : `3600` s (1 h) recommandé — l'app détecte l'expiration et déconnecte proprement.

### Captcha (Turnstile) — requis pour le login serveur

L'Edge Function `auth-gate` relaie le login à Supabase Auth avec un `captchaToken`. Pour que Supabase valide ce jeton :

1. **Authentication → Attack Protection → CAPTCHA protection** : **activez**.
2. **Provider** : `Turnstile`.
3. **Secret key** : collez la **clé secret** Turnstile (créée à l'étape Cloudflare — voir `02-cloudflare-pages.md`).

> La **clé site** correspondante (publique) va dans `public/js/config.js` (`turnstileSiteKey`), pas ici. Laisser `turnstileSiteKey: ''` pour un domaine désactive le captcha côté client (utile en local).

---

## 6. Activer Realtime

L'app s'abonne aux changements de 4 tables. Dans **SQL Editor**, exécutez :

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE envois;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE app_config;
ALTER PUBLICATION supabase_realtime ADD TABLE envois_hgrappe;
```

Vérification :

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Attendu : envois, profiles, app_config, envois_hgrappe
```

> Si le temps réel ne fonctionne pas après déploiement, vérifiez ces publications **en premier**.

---

## 7. Déployer les Edge Functions

Cinq fonctions dans `supabase/functions/` :

| Fonction | Rôle | JWT vérifié par la plateforme ? |
|---|---|---|
| `manage-user` | Créer / modifier / (dés)activer des utilisateurs Auth (service_role). | **Non** (`--no-verify-jwt`, JWT vérifié manuellement dans le code). |
| `auth-gate` | Point d'entrée du login : rate-limit serveur + captcha, relaie à Supabase Auth. | **Non** (appelée avant d'avoir un JWT). |
| `send-notifications` | Envoie les courriels de la file `notification_queue`. | **Non** (appelée par cron). |
| `test-notification` | Envoie un courriel de test depuis l'UI admin. | Oui. |
| `set-secret` | Écrit un secret dans le Vault (dispositif **abandonné** — inutile de déployer). | Oui (vérif admin dans le code). |

Déployez :

```bash
# manage-user : JWT géré manuellement dans la fonction
supabase functions deploy manage-user --no-verify-jwt

# auth-gate : appelée avant login, sans token utilisateur
supabase functions deploy auth-gate --no-verify-jwt

# send-notifications : appelée par le cron, sans token utilisateur
supabase functions deploy send-notifications --no-verify-jwt

# test-notification : appelée depuis l'UI admin (avec token)
supabase functions deploy test-notification

# set-secret : optionnel (voir plus bas)
supabase functions deploy set-secret
```

> Le flag `--no-verify-jwt` désactive la vérification du JWT **par la plateforme**. Pour `manage-user`, `auth-gate` et `set-secret`, la vérification d'identité/de rôle est faite **dans le code** (`auth.getUser()` + lecture du rôle). Ne retirez pas ce flag pour `manage-user` : sans lui, la création d'utilisateur échoue avec une erreur CORS/401.

### Variables injectées automatiquement

Supabase injecte dans **toutes** les Edge Functions, sans configuration :

| Variable | Contenu |
|---|---|
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_ANON_KEY` | Clé anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (admin) |
| `SUPABASE_DB_URL` | Chaîne de connexion directe (utilisée par `set-secret`) |

Les fonctions les lisent via `Deno.env.get(...)`. **Aucun secret n'est à définir manuellement** pour le fonctionnement de base.

### Où est réellement stockée la clé Resend ?

Point important à comprendre : deux mécanismes coexistent dans le code, mais **un seul est actif**.

- **Mécanisme actif (migration 028)** : l'UI admin (`Configuration > Notifications`) écrit la clé **directement dans la colonne `notification_config.resend_api_key`** (table protégée par une politique RLS *admin-only*). Les fonctions `send-notifications` et `test-notification` la lisent **en priorité** depuis cette colonne.
- **Dispositif Vault (migration 025 + `set-secret`) — abandonné** : le stockage chiffré via **Supabase Vault** avait été tenté, mais le Vault **n'est pas accessible via PostgREST** sur le plan Supabase utilisé. L'approche a été abandonnée au profit de la migration 028. Les objets `025` et l'Edge Function `set-secret` subsistent dans le code mais sont **inertes** (l'appel `get_app_secret` ne renvoie rien) : ne comptez pas dessus.

Ordre de résolution (dans le code) dans `send-notifications`/`test-notification` :
`notification_config` (028, seul chemin alimenté) → Vault (025, ne répond jamais) → `Deno.env`.

**En pratique, saisissez simplement la clé Resend dans l'UI admin** (voir `03-resend.md`). Ne déployez pas `set-secret` et n'utilisez pas le Vault.

> ⚠️ Le flux CLI historique `supabase secrets set RESEND_API_KEY=re_xxx` alimente `Deno.env`, qui est le **dernier** fallback. Il fonctionne mais n'est pas le mécanisme recommandé ici — l'UI admin (colonne `notification_config`) a la priorité.

---

## 8. Planifier les crons (notifications + alarmes)

Deux crons pg_cron pilotent l'envoi automatique.

### 8.1 Détection des alarmes — `detect-alarm-envois`

Créé par la **migration `044_cron_detect_alarms.sql`** : la fonction SQL `_detect_alarm_envois()` insère dans `notification_queue` les envois en alarme (types `alarm`, `alarm_r` intra > seuil R, `hg_alarm` hors-grappe non confirmé), avec déduplication. Planifié **toutes les 30 min** (`10,40 * * * *`). Rien à faire de plus si la migration est appliquée.

### 8.2 Envoi des courriels — `send-notifications-hourly`

Historique des migrations :

- `036` : crée le job `send-notifications-hourly` (`5 * * * *`) via une fonction wrapper `_trigger_send_notifications()` qui appelle l'Edge Function par `pg_net`.
- `037` : simplifie l'appel (sans `Authorization`).
- `038` : **supprime la fonction wrapper** — désormais le cron appelle **directement l'Edge Function** (type de commande cron « Supabase Edge Function » dans le dashboard).
- `039` : reprogramme le job en **`55 11 * * 1-5`** (récapitulatif du lundi au vendredi à 7 h 55 heure de Montréal ≈ 11 h 55 UTC en été).

**À faire dans le dashboard** (`Database → Cron`) pour un nouveau projet, si le job n'est pas déjà présent : créez/vérifiez un job qui appelle l'Edge Function `send-notifications`.

- **Type** : *Supabase Edge Function* → sélectionner `send-notifications`.
- **Schedule** : `55 11 * * 1-5` (ou celui posé par la migration 039).

Vérifiez l'état des jobs :

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- Attendu : detect-alarm-envois (10,40 * * * *) et send-notifications-hourly (55 11 * * 1-5)
```

> ℹ️ **Extensions requises :** `pg_cron` et `pg_net` (activées par la migration 036 via `CREATE EXTENSION IF NOT EXISTS`). Si `db push` échoue sur ce point, activez-les d'abord dans **Database → Extensions**.

---

## 9. (Optionnel) Rôle Metabase read-only

À déployer **uniquement si vous branchez réellement Metabase**. Deux migrations sont concernées :

- **`034_metabase_readonly_role.sql`** crée le rôle `metabase_ro` en lecture seule (`GRANT SELECT`). À appliquer **une seule fois via `psql`** (pas via `db push`). Le fichier **ne contient plus de mot de passe en clair** : il attend la variable psql `:'mdp'`, à fournir à l'exécution, puis à stocker hors dépôt (gestionnaire de secrets, configuration Metabase) :

  ```bash
  psql "$SUPABASE_DB_URL" \
    -v mdp="$METABASE_RO_PASSWORD" \
    -f supabase/migrations/034_metabase_readonly_role.sql
  ```

- **`045_metabase_ro_no_bypassrls.sql`** (appliquée normalement par `db push`) **retire l'attribut `BYPASSRLS`** et le remplace par des politiques `SELECT` explicites (`metabase_ro_read`) sur chaque table protégée par RLS. La RLS reste ainsi pleinement effective — le rôle ne contourne plus le cloisonnement par laboratoire — tout en conservant l'accès en lecture nécessaire aux tableaux de bord.

> **Rotation du mot de passe** : `ALTER ROLE metabase_ro PASSWORD '<nouveau_secret>';` puis mettre à jour la connexion dans Metabase.

---

## 10. Données initiales et premier admin

Après le schéma, insérez la grappe et la config de base si elles ne sont pas déjà posées par les migrations (`024` insère la grappe). Puis créez le premier compte :

1. **Authentication → Users → Add user** : créez un utilisateur avec une adresse au format `admin@optilab.internal` (l'app connecte les utilisateurs par **numéro d'employé**, pas par vraie adresse courriel).
2. Notez l'**UUID**.
3. Dans **SQL Editor** :

```sql
INSERT INTO profiles (id, employee_id, nom, role, active, must_change_password)
VALUES ('<UUID_COPIE>', 'admin', 'Admin Système', 'admin', true, true);
```

L'utilisateur se connectera avec le numéro d'employé `admin` et changera son mot de passe à la première connexion.

---

## 11. Vérifications post-déploiement

```sql
-- RLS activée partout (0 résultat attendu)
SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;

-- Realtime : 4 tables publiées
SELECT COUNT(*) FROM pg_publication_tables WHERE pubname='supabase_realtime';

-- Crons planifiés
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

```bash
# Edge Functions déployées
supabase functions list
# Attendu : manage-user, auth-gate, send-notifications, test-notification, set-secret
```

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
