# Sécurité — Traçabilité OPTILAB (BSL-GAS)

> Document d'audit — inventaire et description des mesures de sécurité de l'application.
> Chaque affirmation est référencée à son fichier source (`fichier:ligne`) pour vérification.
> Architecture : SPA 100 % statique (Cloudflare Pages / Render) + Supabase (PostgreSQL, Auth JWT,
> Realtime, Edge Functions Deno). Aucun serveur applicatif intermédiaire : la sécurité repose sur
> le **Row Level Security (RLS)** PostgreSQL, les fonctions `SECURITY DEFINER`, et les Edge Functions.

---

## Sommaire

1. [Authentification](#1-authentification)
2. [Autorisation & RLS](#2-autorisation--rls)
3. [Rôle `anon` (accès public)](#3-rôle-anon-accès-public)
4. [Protection du login (brute-force + captcha)](#4-protection-du-login-brute-force--captcha)
5. [Secrets & clés](#5-secrets--clés)
6. [En-têtes HTTP & CSP](#6-en-têtes-http--csp)
7. [Realtime](#7-realtime)
8. [Audit & journalisation](#8-audit--journalisation)
9. [Tableau récapitulatif](#9-tableau-récapitulatif-des-mesures)
10. [Points d'attention auditeur & recommandations](#10-points-dattention-auditeur--recommandations-résiduelles)

---

## 1. Authentification

### 1.1 Mécanisme

- **Supabase Auth (JWT)**. Les utilisateurs se connectent avec leur **numéro d'employé** (pas un email réel) ; l'email interne est reconstitué en `{employee_id}@optilab.internal` — jamais exposé à l'utilisateur (`auth-gate/index.ts:103`, `manage-user/index.ts:82`).
- Le login **ne passe pas directement** par `signInWithPassword` côté client : il transite par l'Edge Function **`auth-gate`** (voir §4), qui applique le rate-limit serveur puis relaie à Supabase Auth (`auth.js:116`, `auth-gate/index.ts:104`).
- **Changement de mot de passe forcé** à la première connexion et après réinitialisation : flag `profiles.must_change_password` (`schema.sql:91`, `auth.js:208`, `manage-user/index.ts:105` et `:166`).
- **Déconnexion automatique après 15 min d'inactivité**, minuteur côté client (`auth.js:18` → `INACT_DELAY = 15*60*1000`, `auth.js:362-363`).
- La session est stockée en `sessionStorage` (perte à la fermeture de l'onglet), et non `localStorage` (voir `doc.md` §3, ligne 91).

### 1.2 Rôles

Le rôle global est porté par `profiles.role`, contraint par `CHECK` à quatre valeurs (`schema.sql:88-89`) :

| Rôle (`profiles.role`) | Portée |
|---|---|
| `technicien` | Opérations courantes sur ses laboratoires d'appartenance |
| `superviseur_labo` | Supervision d'un laboratoire (gestion des utilisateurs de son labo) |
| `superviseur_grappe` | Supervision de toute la grappe (tous les labos actifs) |
| `admin` | Administration complète, gestion des secrets |

En complément, un **rôle par laboratoire** est porté par `user_lab_memberships.lab_role` ∈ (`technicien`, `responsable`) (`schema.sql:101-108`). Le `responsable` d'un labo peut par exemple annuler un envoi de ce labo (`schema.sql:707`).

### 1.3 Fonctions d'identité (appelées par les politiques RLS)

Toutes `SECURITY DEFINER` et `STABLE`, avec `search_path` figé (voir §2.4) :

| Fonction | Retour | Rôle |
|---|---|---|
| `current_role_name()` | `TEXT` | Rôle global de l'utilisateur courant (`schema.sql:342-345`) |
| `current_labo_id()` | `UUID` | Labo principal (legacy) (`schema.sql:347-350`) |
| `current_labo_ids()` | `UUID[]` | Tous les labos accessibles ; admin/superviseur_grappe → **tous les labos actifs**, sinon `user_lab_memberships` avec fallback `labo_ids`/`labo_id` (`schema.sql:355-369`) |
| `current_lab_role(labo_id)` | `TEXT` | Rôle de l'utilisateur dans un labo précis (`schema.sql:372-379`) |

> `SECURITY DEFINER` est nécessaire pour lire `user_lab_memberships` / `profiles` sans exposer les données des autres utilisateurs via une politique directe.

---

## 2. Autorisation & RLS

### 2.1 RLS activé partout

Le `Row Level Security` est activé (`ENABLE ROW LEVEL SECURITY`) sur **l'ensemble des 21 tables applicatives** (`schema.sql:1213-1233`) : `grappes`, `laboratories`, `app_config`, `grappe_config`, `module_config`, `profiles`, `user_lab_memberships`, `envois_audit`, `external_labs`, `envois`, `envois_hgrappe`, `bons_depart(_sections/_envois)`, `notification_config/_emails/_queue/_log`, `app_secrets_audit`, `hg_confirm_attempts`, `login_attempts`.

> Vérification recommandée en audit : `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` → doit renvoyer **0 ligne**.

### 2.2 Cloisonnement par laboratoire et par grappe (migration 030)

Avant la migration `030`, les politiques `SELECT` de `envois`, `envois_hgrappe`, `bons_depart_sections` et `bons_depart_envois` étaient `USING (true)` — **tout technicien authentifié voyait tous les envois de tous les labos**. La migration `030` corrige ce défaut de cloisonnement (`030_rls_cloisonnement_labo.sql`, en-tête ligne 4-7) :

```sql
-- envois (030_rls_cloisonnement_labo.sql:13-18)
CREATE POLICY "Lecture envois" ON envois FOR SELECT TO authenticated
  USING (
    exp_labo_id  = ANY(current_labo_ids())
    OR dest_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  );
```

`envois_hgrappe` n'a pas de labo destinataire (destination externe) : seul l'expéditeur est un labo de la grappe (`030:22-27`). Les sections/liaisons de bons de départ sont cloisonnées par le labo du bon parent via un `EXISTS` (`030:30-55`).

### 2.3 Politiques par table (synthèse)

| Table | Lecture (SELECT) | Écriture (INSERT/UPDATE/ALL) | Réf. |
|---|---|---|---|
| `grappes` | authenticated | admin / superviseur_grappe | `schema.sql:1236-1239` |
| `laboratories` | authenticated | admin seul | `schema.sql:1242-1244` |
| `app_config` | authenticated **+ anon** | admin seul | `schema.sql:1247-1250` |
| `grappe_config` | authenticated | admin / superviseur_grappe | `schema.sql:1253-1256` |
| `module_config` | authenticated | admin / superviseur_grappe | `schema.sql:1259-1262` |
| `profiles` | soi-même + superviseurs de son labo | soi-même + superviseurs (non-admin) + admin ; INSERT réservé `service_role` | `schema.sql:1265-1274` |
| `user_lab_memberships` | soi-même + superviseurs | admin / superviseur_grappe | `schema.sql:1277-1281` |
| `envois` | labo exp/dest OU superviseur/admin | INSERT : labo exp ; UPDATE : labo exp/dest ; (+WITH CHECK) | `schema.sql:1293-1300` |
| `envois_hgrappe` | labo exp OU superviseur/admin | INSERT/UPDATE : labo exp (+WITH CHECK) | `schema.sql:1303-1309` |
| `bons_depart(_sections/_envois)` | labo du bon OU superviseur/admin | idem | `schema.sql:1312-1326` |
| `notification_config` | admin | admin (UPDATE) | `schema.sql:1329-1330` |
| `notification_emails` | admin / superviseur_grappe | admin | `schema.sql:1331-1332` |
| `notification_queue` | admin / superviseur_grappe | INSERT authenticated | `schema.sql:1333-1334` |
| `notification_log` | admin / superviseur_grappe | — (écrit par edge function) | `schema.sql:1335` |
| `app_secrets_audit` | admin | INSERT admin | `schema.sql:1338-1341` |
| `hg_confirm_attempts` | admin / superviseur_grappe | aucune (écriture via `SECURITY DEFINER` uniquement) | `schema.sql:1344-1346` |
| `login_attempts` | admin / superviseur_grappe | aucune (écriture via `service_role`) | `schema.sql:1349-1351` |
| `envois_audit` | authenticated | INSERT authenticated (append-only) | `schema.sql:1284-1285` |
| `external_labs` | authenticated | admin | `schema.sql:1288-1290` |

### 2.4 Durcissement des politiques : `WITH CHECK` et `search_path`

Deux classes de failles ont été corrigées par les migrations `031`/`032`/`033` :

- **`WITH CHECK` sur les UPDATE.** Les politiques `UPDATE` avaient `WITH CHECK (true)`, ce qui permettait à un utilisateur de **réassigner une ligne à un autre labo** lors d'un UPDATE. Le `WITH CHECK` reflète désormais la clause `USING` (`031:38-106`, ré-appliqué par `033:71-133`) — sur `envois`, `envois_hgrappe`, `bons_depart`, `bons_depart_sections`.
- **`WITH CHECK (auth.uid() IS NOT NULL)`** sur les INSERT append-only (`envois_audit`, `notification_queue`) — sémantiquement équivalent à `true` pour un authentifié, mais non signalé par le linter (`032:8-18`, `033:135-147`).
- **`search_path` figé** (`SET search_path = 'public'`) sur **toutes** les fonctions du schéma `public`, pour prévenir les attaques par injection de `search_path` contre les fonctions `SECURITY DEFINER` (`031:8-36` en DO-block, puis explicité fonction par fonction dans `033:10-69`). Les fonctions accédant au Vault fixent `search_path = public, vault` (`schema.sql:1045`, `:1073`, `:1094`, `:1116`).

> Note : la migration `031` avait été « repair-marked » sans s'exécuter réellement ; la `033` la ré-applique de façon explicite (`033`, en-tête ligne 4-5). L'auditeur doit vérifier que **`033` est bien appliquée** sur chaque environnement.

### 2.5 Contrôles applicatifs dans les fonctions `SECURITY DEFINER`

Les RPC métier revérifient l'autorisation en interne (défense en profondeur), indépendamment de la RLS :

- `create_envoi_hsilp` / `create_envoi_hgrappe` : `RAISE EXCEPTION` si l'expéditeur n'appartient pas aux labos de l'utilisateur (`schema.sql:451-456`, `:504-509`).
- `annuler_envoi` : vérifie appartenance labo **et** (créateur OU responsable du labo OU superviseur/admin), exige un commentaire, et journalise dans `envois_audit` (`schema.sql:701-711`, `:729-753`).
- `create_bon_depart` / `add_envois_to_bon` / `cancel_bon_depart` / `remove_envoi_from_bon` : vérification d'appartenance labo + contrôle d'état des envois (`schema.sql:790`, `:854`, `:888`, `:922`).
- `get_labo_kpis` : réservée à admin / superviseur_grappe (`schema.sql:988-990`).

---

## 3. Rôle `anon` (accès public)

### 3.1 Surface exposée : la confirmation Hors-grappe

La page publique `public/confirm/` (sans authentification) permet à un laboratoire externe de confirmer la réception d'un envoi Hors-grappe. Seules **quatre** fonctions restent exécutables par `anon`, toutes liées à ce flux (`schema.sql:1371-1374`, `043:2-3`) :

| Fonction | Objet | Réf. |
|---|---|---|
| `get_envoi_hgrappe_by_token(uuid)` | Lecture des métadonnées via le **token UUID complet** (128 bits, non énumérable) | `schema.sql:525-550` |
| `get_envoi_hgrappe_by_numero(text, text)` | Lecture via numéro + **code de vérification à 6 caractères hex** (rate-limité, §3.3) | `schema.sql:554-611` |
| `get_hg_confirm_cfg()` | Indique si la confirmation par numéro est activée | `schema.sql:613-622` |
| `confirm_envoi_hgrappe(...)` | Enregistre la confirmation (conforme/non conforme), alimente `notification_queue` si NC | `schema.sql:626-675` |

Par ailleurs, `app_config` est lisible par `anon` (`schema.sql:1248`) — pour permettre à la page de confirmation d'afficher le nom/sous-titre de l'application avant toute authentification. `app_config` ne contient pas de secret.

### 3.2 Durcissement : révocation des `EXECUTE` pour `anon` (migrations 033 & 043)

Toutes les autres fonctions `SECURITY DEFINER` — création d'envois, bons de départ, KPI, fonctions d'identité, fonctions de trigger, statut de secrets — ont eu leur `EXECUTE` **révoqué pour `anon`** (`033:149-179`, puis `043` de façon exhaustive incluant les surcharges de `create_envoi_*`, `033`/`043:5-44`). Objectif : empêcher un appelant non authentifié d'invoquer une RPC métier ou une fonction de trigger via l'API REST PostgREST.

### 3.3 Rate-limit anti brute-force de la confirmation (migrations 026 & 029)

Le chemin par **numéro + code hex 6 caractères** n'offre que ~16,7 M valeurs et serait brute-forçable (`026`, en-tête ligne 4-8). Protection :

- Table `hg_confirm_attempts` journalisant chaque échec par numéro (`schema.sql:299-304`) ; RLS : **aucune** politique INSERT/UPDATE/DELETE — seules les fonctions `SECURITY DEFINER` y écrivent (`026:31-42`).
- Garde dans `get_envoi_hgrappe_by_numero` : **≥ 5 échecs / 15 min** sur un même numéro → `too_many_attempts` avec `retry_after_seconds` (`schema.sql:570-579`).
- Auto-purge opportuniste des entrées > 24 h (`schema.sql:594`).
- **Correctif 029** : la fonction créée en `026` était `STABLE`, ce qui plaçait PostgREST en transaction read-only et faisait échouer silencieusement les `INSERT` (rate-limit inopérant). La `029` la repasse en `VOLATILE` (`029`, en-tête ligne 4-7).

> Le chemin par **token UUID complet** n'est volontairement pas rate-limité : l'UUID 128 bits est non énumérable (`026:16-17`).

---

## 4. Protection du login (brute-force + captcha)

### 4.1 Edge Function `auth-gate` (rate-limit serveur)

Le rate-limit purement côté client précédent (contournable par F5 ou onglet privé) est remplacé par un contrôle **serveur** (`027`, en-tête ligne 4-14). L'Edge Function `auth-gate` est le point d'entrée du login :

1. Vérifie le compteur d'échecs via `count_recent_login_failures()` ; si `retry_after_seconds > 0` → **HTTP 429** (`auth-gate/index.ts:82-94`).
2. Appelle `signInWithPassword` (captcha validé côté Supabase si activé) (`auth-gate/index.ts:104-108`).
3. Enregistre la tentative via `record_login_attempt()` (`auth-gate/index.ts:112-115`).
4. En cas d'échec, renvoie un **message générique** `invalid_credentials` pour ne pas révéler l'existence d'un `employee_id` (`auth-gate/index.ts:118-122`).

- Table `login_attempts(employee_id, attempted_at, success)` (`schema.sql:307-312`). Seuil : **5 échecs / 15 min** par `employee_id` (`schema.sql:1139`). Auto-purge > 7 jours (`schema.sql:1153`).
- Les RPC `count_recent_login_failures` / `record_login_attempt` sont **révoquées pour PUBLIC/authenticated/anon** et n'autorisent que `service_role` (`027:98-101`, `schema.sql:1384-1387`) — seule l'Edge Function (service_role) peut les appeler.
- **CORS restreint** aux domaines de production connus (`auth-gate/index.ts:18-39`).

### 4.2 Captcha Turnstile (Cloudflare)

- La **clé publique (site key)** Turnstile est portée par domaine dans `config.js` (`config.js:17`, `:23`, `:29`, `:35`) ; elle est publique par conception. La clé secrète correspondante est configurée dans le **dashboard Supabase Auth (Captcha)**, jamais dans le front (`config.js:6-9`).
- Le widget est rendu au login (`auth.js:25-40`) ; si une site key est présente, le token captcha est **obligatoire** avant l'envoi (`auth.js:108-109`) et joint à la requête `auth-gate` (`auth.js:116`).
- Turnstile est **désactivé sur `localhost`/`127.0.0.1`** (site key vide, `config.js:41`, `:46`).

---

## 5. Secrets & clés

### 5.1 Hiérarchie des clés Supabase

| Clé | Exposition | Usage |
|---|---|---|
| `anon` / **publishable** (`sb_publishable_…`) | Frontend (`config.js`) — **publique par conception** | Client navigateur, filtré par RLS |
| `service_role` | **Edge Functions uniquement** (variable d'env injectée par Supabase) | Bypass RLS ; jamais côté client (`manage-user/index.ts:25`, `auth-gate/index.ts:77`, `send-notifications/index.ts:263`) |
| `DB connection string` | GitHub Secrets (backups) / `SUPABASE_DB_URL` (edge `set-secret`) | Backups `pg_dump` ; connexion directe pour le Vault |

La clé `anon` est lisible dans le code source : sans JWT valide et sans RLS, elle ne donne accès à rien. Aucun secret applicatif (Resend/SMTP/Turnstile secret) n'est présent dans le front.

### 5.2 Stockage des secrets applicatifs — état réel

Deux approches coexistent dans l'historique ; **l'état effectif en BETA 1.10.0 est le stockage en table** :

- **Migration 025 (Vault)** : introduit un stockage chiffré via **Supabase Vault** (`pgsodium`). Liste blanche des noms autorisés (`RESEND_API_KEY`, `SMTP_PASS`, `TURNSTILE_SECRET_KEY`) empêchant la création de secrets arbitraires (`025:45-52`, `schema.sql:1039-1042`). RPC `set_app_secret` (admin only, ne retourne jamais la valeur, journalise dans `app_secrets_audit`) (`025:57-104`) ; `get_app_secret` réservée à `service_role` (`025:208-212`, `schema.sql:1380-1381`).
- **Migration 028 (mécanisme effectif — abandon du Vault)** : le Vault n'étant **pas accessible via PostgREST sur le plan utilisé**, l'approche `025` a été **abandonnée** et les secrets sont stockés en colonnes `TEXT` dans `notification_config` (`resend_api_key`, `smtp_pass`), protégés par la **RLS admin-only** de cette table (`028:1-11`, RLS `schema.sql:1329`). Les objets `025` / `set-secret` / `app_secrets_audit` subsistent mais sont inertes.
- L'Edge Function `send-notifications` lit les secrets par **priorité** : 1) `notification_config` (mig. 028, seul chemin réellement alimenté) → 2) Vault (ne répond jamais) → 3) `Deno.env` (`send-notifications/index.ts:18-27`, `:236`).
- L'Edge Function `set-secret` (chemin Vault) : réservée aux **admin** (vérifie `profiles.role`), ouvre une connexion PostgreSQL directe et injecte le claim JWT (`request.jwt.claims`) dans la transaction pour que `current_role_name()` fonctionne, puis appelle `set_app_secret`/`list_app_secrets_status`/`get_app_secret_status` (`set-secret/index.ts:44-96`).

### 5.3 Edge Function `manage-user`

Création/réinitialisation/(dés)activation de comptes via `service_role` (`manage-user/index.ts:23-27`). Double contrôle : vérification du JWT du demandeur (`getUser`, `:40`), puis de son rôle (`superviseur_labo`/`superviseur_grappe`/`admin`, `:54`). Un `superviseur_labo` ne peut agir que sur son propre labo (`:69`, `:146`, `:196`) ni attribuer un rôle supérieur au sien (`:76`), et ne peut pas modifier un compte `admin` (`:139`, `:190`). Les nouveaux comptes sont forcés en `must_change_password = true` (`:105`), avec rollback du compte Auth en cas d'échec d'insertion du profil (`:110-111`).

---

## 6. En-têtes HTTP & CSP

Fichier `public/_headers` (appliqué par Cloudflare Pages sur toutes les réponses) :

- **`Content-Security-Policy`** stricte (`_headers:12`) : `default-src 'self'` ; `frame-ancestors 'none'` ; `object-src 'none'` ; `base-uri 'self'` ; `form-action 'self'`. `connect-src` limité à `'self'`, `https://*.supabase.co`, `wss://*.supabase.co` (Realtime) et `challenges.cloudflare.com`. Le captcha est cadré par `frame-src https://challenges.cloudflare.com`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` désactivant caméra/micro/géoloc/paiement/USB (`_headers:6-10`).
- **HSTS** : `Strict-Transport-Security: max-age=31536000; includeSubDomains` (`_headers:11`).
- **Cache-Control** différencié (`_headers:14-41`) : `/lib/*` et `/img/*` en cache long (30 j) ; `/js/*` et `/css/*` courts + `must-revalidate` (5 min) ; **HTML et `/confirm/*` en `no-cache`** (toujours frais).

> Réserve : la CSP autorise `'unsafe-inline'` sur `script-src` et `style-src` (`_headers:12`), rendu nécessaire par les scripts/styles inline de la SPA et de la page de confirmation. À surveiller (voir §10).

---

## 7. Realtime

Quatre tables sont publiées sur `supabase_realtime` : `envois`, `profiles`, `app_config`, `envois_hgrappe` (`schema.sql:1439-1442`).

- Le **Realtime respecte la RLS** : un client ne reçoit que les changements sur les lignes qu'il est autorisé à lire (mêmes politiques `SELECT` qu'en §2.3). Le cloisonnement par labo (mig. 030) s'applique donc aussi au flux temps réel.
- Le canal n'est actif que sur les panneaux nécessitant des mises à jour temps réel et supprimé ailleurs (`doc.md` §10, ligne 440).
- Limite : `profiles` étant publiée, les métadonnées de profil visibles par un superviseur transitent en temps réel — mais toujours filtrées par la RLS de `profiles`.

---

## 8. Audit & journalisation

- **`envois_audit`** (`schema.sql:111-122`) : journal générique `INSERT/UPDATE/DELETE/ANNULATION` avec `old_data`/`new_data` (JSONB), `changed_fields`, `changed_by_id`/`changed_by_nom`, `changed_at`. Alimenté notamment par `annuler_envoi` (`schema.sql:743-753`). Append-only (INSERT authenticated, pas de purge automatique par défaut — voir capacité).
- **`app_secrets_audit`** (`schema.sql:315-322`) : trace chaque `CREATE/UPDATE/DELETE` de secret (qui, quand). Lecture admin uniquement.
- **`login_attempts`** (§4) : tentatives de connexion, lecture admin/grappe.
- **`hg_confirm_attempts`** (§3.3) : échecs de confirmation Hors-grappe, lecture admin/grappe.

---

## 9. Tableau récapitulatif des mesures

| Mesure | Migration / fichier | Statut |
|---|---|---|
| RLS activé sur les 21 tables | `schema.sql:1213-1233` | ✅ Actif |
| Cloisonnement RLS par labo/grappe | `030_rls_cloisonnement_labo.sql` | ✅ Actif |
| `WITH CHECK` = `USING` sur UPDATE | `031` / `033_fix_searchpath_withcheck_anon.sql` | ✅ Actif (vérifier 033 appliquée) |
| `WITH CHECK` sur INSERT append-only | `032` / `033:135-147` | ✅ Actif |
| `search_path` figé (anti-injection) | `031:8-36` / `033:10-69` | ✅ Actif (via 033) |
| Révocation `EXECUTE` anon (RPC internes) | `033:149-179` / `043_revoke_anon_execute.sql` | ✅ Actif |
| Rate-limit confirmation HG (5/15 min) | `026_hg_confirm_rate_limit.sql` + `029_fix_hg_ratelimit_volatile.sql` | ✅ Actif |
| Rate-limit login serveur (5/15 min) | `027_login_attempts.sql` + `auth-gate/index.ts` | ✅ Actif |
| Captcha Turnstile au login | `config.js` + `auth.js` + Supabase Auth | ✅ Actif (prod) / désactivé localhost |
| Message d'erreur login générique | `auth-gate/index.ts:118-122` | ✅ Actif |
| CORS restreint (auth-gate) | `auth-gate/index.ts:18-39` | ✅ Actif |
| Changement mot de passe forcé | `schema.sql:91` + `manage-user`/`auth.js` | ✅ Actif |
| Déconnexion sur inactivité (15 min) | `auth.js:18,362-363` | ✅ Actif |
| Secrets applicatifs — Vault | `025_vault_app_secrets.sql` + `set-secret` | ⚠️ Abandonné — inerte (voir 028) |
| Secrets applicatifs — table RLS admin | `028_secrets_sans_vault.sql` | ✅ **État effectif** |
| `service_role` côté serveur uniquement | Edge Functions | ✅ Actif |
| Contrôles rôle dans `manage-user` | `manage-user/index.ts` | ✅ Actif |
| CSP / HSTS / anti-clickjacking | `public/_headers` | ✅ Actif (voir réserve `unsafe-inline`) |
| Audit modifications d'envois | `schema.sql:111-122` (`envois_audit`) | ✅ Actif |
| Realtime filtré par RLS | `schema.sql:1439-1442` | ✅ Actif |

---

## 10. Points d'attention auditeur & recommandations résiduelles

1. **[Élevé → en cours de remédiation] Rôle Metabase (`034_metabase_readonly_role.sql`).** Deux problèmes historiques : un **mot de passe PostgreSQL en clair committé** et l'attribut **`BYPASSRLS`** sur le rôle `metabase_ro`, qui ignore tout le cloisonnement RLS du §2 (le rôle peut lire les données de **tous** les laboratoires).
   - **Fait** : le mot de passe en clair a été **retiré de la version courante** du fichier — il est désormais injecté à l'exécution via la variable psql `:'mdp'` (`psql -v mdp="$METABASE_RO_PASSWORD" -f 034...`).
   - **À faire (exploitation)** : (a) **rotation** du mot de passe sur la base (`ALTER ROLE metabase_ro PASSWORD '<nouveau_secret>';`) — le secret committé doit être considéré comme compromis ; (b) mettre à jour la connexion dans Metabase ; (c) **purge optionnelle de l'historique git** (le secret y subsiste ; sans objet une fois la rotation faite) ; (d) restreindre l'accès réseau au rôle.
   - **`BYPASSRLS` — corrigé par la migration `045`** : `045_metabase_ro_no_bypassrls.sql` retire l'attribut `BYPASSRLS` (`ALTER ROLE metabase_ro NOBYPASSRLS`) et ajoute une **politique `SELECT` permissive explicite** `metabase_ro_read` (`... FOR SELECT TO metabase_ro USING (true)`) sur chaque table du schéma `public` ayant la RLS activée (boucle dynamique, idempotente). La RLS reste ainsi active et auditable ; l'accès lecture de Metabase est préservé, sans attribut de contournement. Sûr par défaut : toute table RLS créée ultérieurement reste invisible à `metabase_ro` tant qu'on ne lui ajoute pas la politique (relancer le bloc de `045`).
   - Aucune donnée patient nominative n'est stockée (métadonnées d'expédition), ce qui limite l'impact ; le principe de moindre privilège est désormais respecté (plus de `BYPASSRLS`).

2. **[Info] Secrets au repos non chiffrés applicativement.** L'état effectif (mig. `028`) stocke la clé Resend / `smtp_pass` en colonnes `TEXT` de `notification_config`, protégées par RLS admin-only (le Vault `025`, qui aurait apporté un chiffrement applicatif, a été abandonné). Ce n'est pas une faille en soi (RLS + chiffrement disque Supabase), mais un chiffrement au niveau colonne reste une amélioration possible.

3. **[Moyen] `service_role` en clair dans `set-secret` via `SUPABASE_DB_URL`.** L'Edge Function `set-secret` ouvre une connexion PostgreSQL directe avec les droits complets (`set-secret/index.ts:59-62`). L'accès est correctement gardé (admin only, `:47`), mais toute évolution de cette fonction doit préserver ce contrôle ; c'est un chemin privilégié à surveiller.

4. **[Faible] Clé publishable/anon dans l'historique git.** `config.js:16-46` contient la clé `sb_publishable_…` en clair. **Attendu et sans risque** : la clé anon est publique par conception, la sécurité reposant sur la RLS. Aucune action requise, mais à noter pour un audit exhaustif.

5. **[Faible] CSP `'unsafe-inline'`.** La CSP autorise les scripts/styles inline (`_headers:12`), ce qui affaiblit la protection XSS de la CSP. Atténuations en place : échappement systématique via `escapeHtml()` côté client (`doc.md` §15). Recommandation à moyen terme : migrer vers des nonces/hashes CSP et retirer `'unsafe-inline'`.

6. **[Faible] Comptes de test (`is_test`).** Le flag `profiles.is_test` désactive la contrainte de longueur de mot de passe et le changement forcé (`schema.sql:92`, `doc.md` §15). À vérifier en audit : **aucun compte `is_test = true` en production**.

7. **[Info] Absence de purge automatique de `envois_audit`.** Append-only sans rétention par défaut ; risque de saturation stockage (voir `07-capacite-supabase.md`). Recommandation : cron de purge (> 1 an).

8. **[Info] Cohérence des migrations entre environnements.** Plusieurs migrations correctives (`029`, `033`) réparent des applications partielles ou silencieuses. L'auditeur doit vérifier, sur **chaque projet Supabase** (prod, dev, local), que les migrations `025 → 044` sont réellement appliquées (ex. `033` bien exécutée, `043` incluant les surcharges).

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
