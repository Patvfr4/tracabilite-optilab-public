# Sécurité — Traçabilité OPTILAB (BSL-GAS)

> Document d'audit — inventaire et description des mesures de sécurité de l'application.
> Les références renvoient à un fichier et à un nom d'objet (fonction, policy, déclencheur)
> plutôt qu'à un numéro de ligne, qui dérive à chaque modification.
> Architecture : SPA 100 % statique (Cloudflare Pages) + Supabase (PostgreSQL, Auth JWT,
> Realtime, Edge Functions Deno). Aucun serveur applicatif intermédiaire : la sécurité repose sur
> les **droits explicites** des rôles de l'API, le **Row Level Security (RLS)** PostgreSQL, les
> fonctions `SECURITY DEFINER` et les fonctions Edge.
>
> État décrit : chantier « secrets et durcissement » (novembre 2026), base reconstruite à neuf
> depuis `supabase/schema.sql`, qui est l'**unique source de vérité** de la base.

---

## Sommaire

1. [Authentification](#1-authentification)
2. [Autorisation : privilèges, RLS et déclencheurs](#2-autorisation--privilèges-rls-et-déclencheurs)
3. [Rôle `anon` (accès public)](#3-rôle-anon-accès-public)
4. [Protection du login (captcha, inscription fermée)](#4-protection-du-login-captcha-inscription-fermée)
5. [Secrets & clés](#5-secrets--clés)
6. [En-têtes HTTP, CSP et scripts tiers](#6-en-têtes-http-csp-et-scripts-tiers)
7. [Realtime](#7-realtime)
8. [Audit, journalisation et surveillance](#8-audit-journalisation-et-surveillance)
9. [Sauvegardes](#9-sauvegardes)
10. [Authentification multifacteur — options](#10-authentification-multifacteur--options)
11. [Tableau récapitulatif](#11-tableau-récapitulatif-des-mesures)
12. [Points d'attention et recommandations résiduelles](#12-points-dattention-et-recommandations-résiduelles)
13. [Historique des correctifs](#13-historique-des-correctifs)

---

## 1. Authentification

### 1.1 Mécanisme

- **Supabase Auth (JWT)**. Les utilisateurs se connectent avec leur **numéro d'employé** (pas un
  courriel réel) ; l'adresse interne est reconstituée en `{employee_id}@optilab.internal`, en
  minuscules, et n'est jamais montrée (`supabase/functions/_shared/identifiants.ts`). Le N° employé
  est validé par un motif partagé (lettres, chiffres, `_`, `-`, `.` non consécutif, 64 caractères
  au plus) à la création comme à la connexion.
- Le login **ne passe pas** par `signInWithPassword` côté client : il transite par la fonction Edge
  **`auth-gate`** (§4), qui exige un jeton captcha, appelle Supabase Auth, puis vérifie le profil.
- **Aucun lien par courriel** : les adresses `@optilab.internal` sont fictives, il n'existe ni
  réinitialisation par courriel, ni lien magique, ni OAuth. `detectSessionInUrl` est désactivé dans
  le client (`public/js/app.js`, `public/confirm/index.html`) : aucun jeton présent dans une URL
  n'est jamais adopté comme session.
- **Session** en `sessionStorage` (perdue à la fermeture de l'onglet) ; **déconnexion après
  15 minutes d'inactivité** (`public/js/auth.js`, `INACT_DELAY`) ; `signOut` à la déconnexion.

### 1.2 Mots de passe

| Règle | Où elle est appliquée |
|---|---|
| **12 caractères au minimum**, pour tous les comptes, comptes de test compris | client (`MDP_LONGUEUR_MIN`, `public/js/utils.js`), `manage-user` (`regles.ts`), Supabase Auth (réglage *Minimum password length* = 12, à poser en console — voir `docs/deploiement/01-supabase.md` §7) |
| **72 octets UTF-8 au maximum** (bcrypt ignore la suite : on refuse plutôt que de tronquer) | client (`MDP_OCTETS_MAX`) et `manage-user` |
| Exigences de complexité (minuscules, majuscules, chiffres) | réglage Auth de la console ; le client ne vérifie que la longueur et affiche le refus du serveur |
| Refus des mots de passe divulgués (HaveIBeenPwned) | réglage *Leaked password protection*, **réservé au plan Pro** |

### 1.3 Changement de mot de passe imposé — appliqué par le serveur

Le drapeau `profiles.must_change_password` est posé par `manage-user` à la **création** d'un compte
et à la **réinitialisation** du mot de passe d'autrui (pas lors d'une réinitialisation de son
propre mot de passe : personne d'autre ne le connaît). Tant qu'il est levé :

- les fonctions d'autorité de la base (`current_role_name()`, `current_labo_id()`,
  `current_labo_ids()`, `current_lab_role()`) renvoient « aucun droit » : la RLS ne donne accès à
  aucune donnée métier. La lecture de **son propre profil** reste possible (policy
  « Lecture profil (soi-même) »), car le client lit le drapeau à la connexion ;
- `manage-user` refuse toutes les actions sauf **`change_own_password`** (`_shared/autorisation.ts`,
  `exigerDemandeur`).

`change_own_password` change le mot de passe par l'**API utilisateur** de Supabase Auth
(`PUT /auth/v1/user`, avec le jeton du demandeur), puis remet le drapeau à `false` avec la clé
secrète. Ce choix est délibéré (lu dans le code de GoTrue) : l'API utilisateur **refuse un mot de
passe identique** (`same_password`) — sinon l'employé pourrait « changer » pour le mot de passe
temporaire connu du gestionnaire — et **conserve la session courante** en fermant les autres.
Si la remise à `false` échoue deux fois, la réponse est une erreur `flag_pending` qui invite à se
reconnecter ; aucun mot de passe n'est journalisé.

Aucun utilisateur connecté ne peut modifier `must_change_password` par l'API, même un gestionnaire
sur un subordonné : `protect_profile_columns` lève `42501` dès que `auth.uid()` n'est pas nul.

### 1.4 Désactivation d'un compte = bannissement + révocation des sessions

`manage-user`, action `toggle_active` (bouton « Désactiver » de la gestion des utilisateurs) :

1. pose un **bannissement Supabase Auth** (`ban_duration` de 876 000 h, soit environ 100 ans) — un
   compte banni ne peut plus se connecter ni rafraîchir sa session ;
2. passe `profiles.active` à `false` — les fonctions d'autorité lui retirent tout droit ;
3. appelle `revoke_user_sessions(uuid)` (réservée à `service_role`), qui supprime ses lignes
   `auth.sessions` ; les jetons de rafraîchissement suivent par cascade.

Un jeton d'accès déjà émis reste techniquement valide jusqu'à son expiration (JWT expiry, 1 h
recommandée), mais il ne donne plus aucun droit : la RLS le neutralise (compte inactif) et les
fonctions Edge, qui valident chaque jeton auprès de Supabase Auth, le refusent (compte banni). La
réactivation lève le bannissement (`ban_duration: 'none'`). Un compte ne peut pas se désactiver ni
se réactiver lui-même, et `profiles.active` n'est plus modifiable par un UPDATE direct : seule
`manage-user` (clé secrète, sans jeton utilisateur) l'écrit.

### 1.5 Rôles

Le rôle global est porté par `profiles.role`, contraint par `CHECK` à quatre valeurs :

| Rôle (`profiles.role`) | Portée |
|---|---|
| `technicien` | Opérations courantes sur ses laboratoires d'appartenance |
| `superviseur_labo` | Supervision d'un laboratoire (gestion des comptes de ses laboratoires) |
| `superviseur_grappe` | Supervision de toute la grappe (tous les laboratoires actifs) |
| `admin` | Administration complète, gestion des secrets applicatifs |

Un **rôle par laboratoire** est porté par `user_lab_memberships.lab_role` ∈ (`technicien`,
`responsable`) ; le `responsable` d'un labo peut par exemple annuler un envoi de ce labo.

Règles de gestion des comptes (`manage-user`, `protect_profile_columns`) : un gestionnaire ne peut
attribuer, créer ni modifier qu'un rang **strictement inférieur** au sien (un admin peut tout) ;
un `superviseur_labo` n'agit que sur ses laboratoires ; seul un admin agit sur un compte admin.
`role`, `labo_id`, `labo_ids`, `is_test`, `employee_id` et `nom` sont réservés aux gestionnaires.

### 1.6 Fonctions d'autorité (appelées par les policies)

Toutes `SECURITY DEFINER`, `STABLE`, `search_path` figé :

| Fonction | Retour |
|---|---|
| `current_role_name()` | Rôle global ; `''` si pas de profil, compte inactif ou mot de passe à changer — jamais `NULL` (une valeur `NULL` faisait passer 16 gardes écrits en « permis nié », corrigé en 057) |
| `current_labo_id()` | Laboratoire principal (historique) |
| `current_labo_ids()` | Laboratoires accessibles : tous les actifs pour admin / superviseur_grappe, sinon les appartenances |
| `current_lab_role(labo_id)` | Rôle dans un laboratoire précis |

---

## 2. Autorisation : privilèges, RLS et déclencheurs

Trois couches successives : les **droits** (GRANT) décident quelles opérations un rôle de l'API
peut tenter ; la **RLS** filtre les lignes ; chaque **fonction `SECURITY DEFINER`** contrôle
elle-même son appelant. Des **déclencheurs** protègent en plus les colonnes que la RLS ne sait pas
protéger.

### 2.1 Modèle de privilèges (`schema.sql`, bloc maintenu à la main)

Sur Supabase, tout objet créé dans `public` est accordé d'office à `anon`, `authenticated` et
`service_role`, et toute fonction est exécutable par `PUBLIC`. Un `REVOKE … FROM anon` ne retire
donc rien tant que `PUBLIC` garde le droit — c'est pourquoi les révocations des anciennes
migrations `033` et `043` étaient sans effet avant `052`/`053`. `schema.sql` est désormais
**autonome** sur les droits :

1. **En tête de fichier**, avant tout objet : `ALTER DEFAULT PRIVILEGES … REVOKE` pour les tables,
   séquences et fonctions, et retrait de `EXECUTE` à `PUBLIC` par défaut. Un objet oublié n'est
   accessible à personne (échec visible), jamais à tout le monde.
2. **Révocation globale** de tous les droits des rôles de l'API sur `public` (fonctions hors
   extensions, tables, séquences).
3. **GRANT explicites**, rôle par rôle :

| Rôle | Fonctions exécutables | Tables |
|---|---|---|
| `anon` | les 4 RPC de la page `/confirm` (§3) | `SELECT` sur `app_config` seulement |
| `authenticated` | 28 : les 4 de `/confirm`, 6 auxiliaires de la RLS, 14 RPC métier, 4 RPC de secrets (§5.2) | opérations couvertes par une policy ; journaux en lecture seule ; `USAGE` sur `envoi_seq` |
| `service_role` (fonctions Edge) | 10 : les 6 auxiliaires de la RLS, `get_app_secret`, `revoke_user_sessions`, `count_recent_login_failures`, `record_login_attempt` | `SELECT/INSERT/UPDATE/DELETE` sans `TRUNCATE` ; **lecture seule** sur les journaux d'audit |
| propriétaire seul | déclencheurs, auxiliaires internes, tâches planifiées (`_trigger_send_notifications`, `_surveiller_notifications`, `_detect_alarm_envois`, purges) | — |

La CI (`supabase/ci/verif_restauration.sql`, blocs 6 à 8) compare ces droits à des **listes
exactes** sur un PostgreSQL vierge où le shim a reproduit les privilèges par défaut de Supabase :
un droit en trop comme un droit manquant fait échouer le job. Le bloc 12 joue en plus des tests
fonctionnels (`tests_fonctionnels.sql`) sous le rôle `authenticated`, en technicien puis en admin.
Convention : **toute fonction ou table ajoutée s'inscrit dans le bloc « Modèle de privilèges » ET
dans ces listes**.

> **Schémas non exposés.** Sur Supabase, l'extension `supabase_vault` accorde à `service_role`
> des droits directs sur le schéma `vault`, que `postgres` ne peut pas révoquer ; les tables de
> `pg_net` (schéma `net`) sont accordées à `PUBLIC` en amont. Ils ne sont joignables que par SQL
> tant que `vault` et `net` restent **hors des schémas exposés de la Data API** : ne jamais les y
> ajouter (seuls `public` et `graphql_public` le sont).

### 2.2 RLS activée partout

La RLS est activée sur **toutes** les tables de `public` (invariant vérifié en CI). Contrôle en
audit : `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` → 0 ligne.

### 2.3 Cloisonnement par laboratoire et par grappe

`envois`, `envois_hgrappe`, `bons_depart` et leurs tables liées sont filtrés par
`current_labo_ids()` (laboratoire expéditeur ou destinataire), sauf pour superviseur_grappe et
admin (migration d'origine `030`). Les UPDATE ont un `WITH CHECK` identique au `USING` : une ligne
ne peut pas être réassignée à un autre laboratoire.

### 2.4 Politiques par table (synthèse)

| Table | Lecture | Écriture |
|---|---|---|
| `grappes`, `grappe_config`, `module_config` | authenticated | admin / superviseur_grappe |
| `laboratories`, `external_labs` | authenticated | admin |
| `app_config` | authenticated **+ anon** | admin ; la clé `supabase_url` est protégée par `_proteger_app_config` (SQL Editor seulement) |
| `icr_codes` | authenticated | admin (policies `INSERT`/`UPDATE`/`DELETE` `TO authenticated`) |
| `profiles` | soi-même ; superviseurs selon leur périmètre | soi-même (colonnes non sensibles) et gestionnaires ; `INSERT` réservé à `service_role` ; colonnes protégées par déclencheur (§2.6) |
| `user_lab_memberships` | soi-même + admin / superviseur_grappe | admin / superviseur_grappe |
| `envois`, `envois_hgrappe`, `bons_depart(_sections)` | laboratoire de l'utilisateur, ou superviseur_grappe / admin | idem, `WITH CHECK` = `USING` ; pas de `DELETE` |
| `bons_depart_envois` | laboratoire du bon | par les RPC des bons de départ |
| `notification_config` | admin | admin (`UPDATE`) |
| `notification_emails` | admin / superviseur_grappe | admin |
| `notification_queue`, `notification_log` | admin / superviseur_grappe | aucune écriture directe : RPC `queue_envoi_notification` (laboratoire dérivé de la ligne d'envoi), déclencheurs et fonctions serveur |
| `envois_audit` | cloisonnée par laboratoire (jointure sur l'envoi) | **aucune** : déclencheur `trg_envois_audit` ; append-only, `service_role` compris |
| `app_secrets_audit` | admin | **aucune** : fonctions de secrets ; append-only, `service_role` compris |
| `login_attempts`, `hg_confirm_attempts` | admin / superviseur_grappe | fonctions `SECURITY DEFINER` / `service_role` |

### 2.5 `search_path` figé et contrôles dans les fonctions

- **`search_path` figé** sur toutes les fonctions de `public` (invariant CI) : prévient
  l'injection de `search_path` contre les fonctions `SECURITY DEFINER`.
- Les RPC métier revérifient l'autorisation en interne, indépendamment de la RLS :
  `create_envoi_hsilp` / `create_envoi_hgrappe` (expéditeur parmi les laboratoires de
  l'utilisateur), `annuler_envoi` (créateur, responsable du labo ou superviseur ; commentaire
  obligatoire), cycle des bons de départ, `get_labo_kpis` (admin / superviseur_grappe).
- Erreurs : `42501` pour un refus, `22023` pour une valeur invalide, messages en français.

### 2.6 Colonnes protégées par déclencheur

| Déclencheur | Protège |
|---|---|
| `protect_profile_columns` (`profiles`) | `role`, `labo_id`, `labo_ids`, `is_test`, `employee_id`, `nom` : gestionnaires seulement, selon le rang ; `must_change_password` : jamais par un utilisateur connecté ; `active` : seulement par `manage-user` |
| `protect_envoi_columns` (`envois`) | laboratoires, numéro et auteur immuables après création |
| `protect_envoi_hgrappe_columns` (`envois_hgrappe`) | laboratoire expéditeur, numéro, auteur, **`confirm_token` et `verify_code`** immuables |
| `_envois_hgrappe_capacites` (`envois_hgrappe`, `BEFORE INSERT`) | génère `confirm_token` et `verify_code` côté serveur : un INSERT direct ne choisit pas ses capacités |
| `_proteger_app_config` (`app_config`) | la clé `supabase_url`, cible du cron avec l'en-tête secret, n'est modifiable que hors application |
| `trg_notification_config_smtp` | efface `SMTP_PASS` du Vault si l'hôte, le port ou l'utilisateur SMTP change (§5.2) |

---

## 3. Rôle `anon` (accès public)

### 3.1 Surface exposée : la confirmation hors-grappe

La page publique `public/confirm/` permet à un laboratoire externe de confirmer la réception d'un
envoi hors-grappe. Seules **quatre** fonctions sont exécutables par `anon` :

| Fonction | Objet |
|---|---|
| `get_hg_confirm_cfg()` | Indique si la confirmation par numéro est activée |
| `get_envoi_hgrappe_by_token(uuid)` | Lecture par **jeton** complet (UUID v4, 122 bits, non énumérable) |
| `get_envoi_hgrappe_by_numero(text, text)` | Lecture par **numéro + code de vérification** (§3.2) |
| `confirm_envoi_hgrappe(…)` | Enregistre la confirmation ; met en file une notification si non conforme |

`app_config` est lisible par `anon` pour afficher le nom de l'application avant connexion ; elle ne
contient aucun secret (la clé `supabase_url` est une URL publique).

### 3.2 Code de vérification hors-grappe (`verify_code`)

- **10 caractères** tirés d'un alphabet de 32 symboles sans caractères ambigus (ni `I`, ni `O`, ni
  `0`, ni `1`), soit **50 bits** d'aléa (`_generer_verify_code`, à partir de `gen_random_uuid`).
  Imprimé sur le F-G-74 par groupes de 5 (`K7PMQ 4XR2D`) et en code-barres.
- **Indépendant du jeton** : l'ancien code était le préfixe de 6 caractères hexadécimaux du jeton
  (24 bits) et s'échangeait contre le jeton complet ; il n'est plus accepté.
- `get_envoi_hgrappe_by_numero` normalise la saisie (majuscules, espaces et tirets ignorés) et la
  compare au seul `verify_code`. Elle renvoie `disabled` si la confirmation par numéro est
  désactivée pour la grappe du laboratoire expéditeur (`grappe_config`, à défaut `app_config`).
- **Limite de 5 échecs par 15 minutes** et par numéro (`hg_confirm_attempts`), rendue atomique par
  un verrou consultatif ; purge des tentatives de plus de 24 h (tâche `purge-hg-confirm-attempts`).
- `confirm_token` et `verify_code` ne sont **plus recopiés** dans `envois_audit` (le nom du champ
  reste dans `changed_fields`) et ne sont pas publiés par Realtime.
- Usage unique du jeton pour l'écriture, garanti atomiquement (`UPDATE … WHERE ts_confirm IS NULL`).

### 3.3 Page `/confirm`

- Le jeton lu dans l'URL en est **retiré aussitôt** (`history.replaceState`) ; seul `?n=` (numéro,
  non secret) préremplit le formulaire, `?c=` est ignoré.
- Le format du code est vérifié **avant** tout appel ; messages distincts pour un numéro
  introuvable, un code incorrect et une confirmation en ligne désactivée.
- `<meta name="referrer" content="no-referrer">` ; client Supabase sans persistance de session ni
  détection de session dans l'URL.

---

## 4. Protection du login (captcha, inscription fermée)

### 4.1 Fonction Edge `auth-gate`

1. Valide le N° employé (motif partagé) : un identifiant mal formé reçoit la réponse générique
   `invalid_credentials` sans aucune requête vers la base.
2. Exige la **présence** d'un jeton captcha, puis appelle `signInWithPassword` avec ce jeton :
   **c'est Supabase Auth qui le valide** (un jeton Turnstile est à usage unique, une double
   validation échouerait).
3. Après une authentification réussie, lit le profil : absent ou inactif → déconnexion globale
   (toutes les sessions du compte), tentative comptée en échec, réponse générique `401` ; profil
   illisible (panne) → déconnexion de cette session seulement, réponse `503`
   `service_unavailable` (le client affiche « Service momentanément indisponible »).
4. Enregistre la tentative (`record_login_attempt`, sauf si le captcha a été refusé). Le comptage
   des échecs sert à la **détection** seulement : il n'y a plus de verrouillage par identifiant,
   qui permettait à un tiers de bloquer le compte de son choix.

Les RPC `count_recent_login_failures` et `record_login_attempt` sont réservées à `service_role`.
La liste blanche CORS est commune aux fonctions appelées par le navigateur
(`supabase/functions/_shared/cors.ts`) ; le jeton voyage dans l'en-tête `Authorization`, jamais
dans un cookie.

### 4.2 Captcha Turnstile (Cloudflare)

- La **sitekey** (publique) est portée par domaine dans `public/js/config.js` ; la **clé secrète**
  est un réglage du projet Supabase (*Authentication → Attack Protection → CAPTCHA*), jamais dans
  le dépôt.
- Ce réglage est **le seul contrôle qui couvre aussi un appel direct à `/auth/v1/token`**, qui n'a
  pas besoin de passer par `auth-gate` puisque la clé publiable est servie dans la page. Il doit
  rester **activé** avec la clé secrète de **production**.
- `localhost` et `127.0.0.1` portent la sitekey **de test** publique de Cloudflare : le jeton
  factice qu'elle produit n'est accepté que par la clé secrète de test, qui ne doit être réglée
  **que** sur un projet de développement. Tant que ces entrées visent le projet de production, la
  **connexion locale n'est pas prise en charge** : ne jamais désactiver le CAPTCHA de production
  ni y régler la clé de test pour la « débloquer » (voir §12, séparation dev/prod).

### 4.3 Inscription publique fermée

Les comptes sont créés exclusivement par `manage-user` (API admin, non concernée par ce réglage).
L'inscription publique est fermée en console (*Allow new users to sign up* désactivé) et dans
`supabase/config.toml` (`[auth] enable_signup = false`). Le **fournisseur Email reste activé** :
la clé `[auth.email] enable_signup` active en réalité le fournisseur lui-même, et la passer à
`false` refuserait toute connexion par mot de passe, donc `auth-gate`.

---

## 5. Secrets & clés

### 5.1 Inventaire (référence unique)

Ce tableau est la **référence** ; `CLAUDE.md` en donne un résumé et les guides de
`docs/deploiement/` y renvoient. Toute modification d'un secret ou d'un magasin met à jour les deux.
Aucune valeur n'est jamais écrite ici. Les procédures pas à pas (rotation, incident, départ) sont
dans [`../deploiement/05-procedures-securite.md`](../deploiement/05-procedures-securite.md), où
se tient aussi le **registre des rotations** (dates).

| Secret | Magasin | Lu par | Détenteur | Rotation | Impact d'une rotation | Vérification |
|---|---|---|---|---|---|---|
| `RESEND_API_KEY` (clé *Sending access*, restreinte au domaine expéditeur) | **Vault**, saisie par un admin (Configuration › Notifications) | `send-notifications`, `test-notification` (`get_app_secret`) | admin applicatif + titulaire du compte Resend | 12 mois, et immédiatement en cas de départ ou d'incident | aucune coupure si la nouvelle clé est saisie avant de révoquer l'ancienne | « Envoyer un test » ; `notification_log.status = 'sent'` |
| `SMTP_PASS` (compte de **service** SMTP, jamais une boîte nominative) | **Vault**, saisi par un admin ; **effacé** si l'hôte, le port ou l'utilisateur SMTP change | idem | admin applicatif + équipe TI du relais SMTP | 12 mois / départ / incident | idem | idem |
| `NOTIFY_TRIGGER_SECRET` (64 caractères hexadécimaux) | **Vault**, **généré par la base** ; jamais saisi ni vu | job pg_cron et `send-notifications` | la base (« Régénérer » par un admin) | sur incident, ou au besoin | aucune : les deux côtés relisent le Vault à chaque appel | prochain envoi quotidien ; aucune alerte « surveillance » |
| Clé **secrète** Supabase (`sb_secret_…`, nommée `default`) | plateforme ; injectée dans `SUPABASE_SECRET_KEYS` | les 4 fonctions Edge | propriétaires du projet Supabase | 12 mois, départ d'un détenteur de la console, incident | aucune coupure par la procédure `EDGE_SECRET_KEY_NAME` | connexion, gestion des comptes, « Envoyer un test » |
| Clé **publiable** Supabase (`sb_publishable_…`) | `public/js/config.js` + `SUPABASE_PUBLISHABLE_KEYS` | navigateur, fonctions | — | publique par conception ; changement seulement si besoin | redéploiement du front | connexion |
| Clés **héritées** `anon` / `service_role` (JWT) | plateforme | **plus rien** | — | **désactivées** sur le projet | — | Settings › API Keys : désactivées |
| Clé **secrète** Turnstile | réglage Auth du projet Supabase | la plateforme | titulaire du compte Cloudflare + propriétaires Supabase | 12 mois / départ / incident | logins refusés entre les deux saisies si l'ordre n'est pas respecté | connexion réelle réussie ; jeton factice refusé |
| *Sitekey* Turnstile | `public/js/config.js` | navigateur | — | publique par conception | — | — |
| Mot de passe `postgres` de la base | gestionnaire de mots de passe de l'équipe | console, CLI (`supabase link`) | propriétaires du projet Supabase | départ / incident | aucun pour l'application (les fonctions n'utilisent pas de connexion directe) | connexion SQL |
| Mot de passe de `backup_reader` **et** secret GitHub `SUPABASE_DB_URL` (deux copies d'un même secret) | gestionnaire de mots de passe + secret Actions du dépôt **privé** | `db-backup.yml` | développeur principal + suppléant | 12 mois / départ / incident / changement de projet | sauvegarde en échec tant que le secret GitHub n'est pas mis à jour | run manuel du workflow + artifact présent |
| Clé **privée** `age` des sauvegardes | **hors ligne**, deux détenteurs | la restauration | deux détenteurs désignés | si un détenteur part ou si la clé est exposée | les anciennes sauvegardes restent lisibles par l'ancienne clé : la garder jusqu'à leur expiration (30 jours) | test de restauration |
| Variables GitHub `SUPABASE_PROJECT_REF`, `BACKUP_AGE_RECIPIENT` | variables du dépôt privé (non secrètes) | `db-backup.yml` | développeur principal | à chaque changement de projet / de clé `age` | — | run manuel du workflow |
| Mots de passe des comptes de démonstration | affichés **une seule fois** par `seed_demo_users.sql`, hachés en base | — | qui exécute le script | sans objet : **jamais de comptes démo en production** | — | `SELECT … FROM profiles WHERE is_test` → 0 ligne en production |
| Identifiants de déploiement : comptes Supabase, Cloudflare, Resend, GitHub ; jeton du CLI Supabase (`supabase login`) ; jeton `gh` ; applications GitHub connectées (Cloudflare Pages, Dependabot, agent de codage) | comptes nominatifs avec MFA ; jetons sur le poste de l'opérateur | — | propriétaires désignés (≥ 2 par service) | jetons : expiration courte ; revue semestrielle des membres | — | revue des membres et des jetons |

Les **Edge Function Secrets** ne contiennent **aucun** secret applicatif. Seuls peuvent y figurer,
au besoin, les **noms** (pas les valeurs) `EDGE_SECRET_KEY_NAME` / `EDGE_PUBLISHABLE_KEY_NAME`
(§5.3). Les anciens noms `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` (côté
fonctions), `RESEND_API_KEY`, `SMTP_PASS` et `NOTIFY_TRIGGER_SECRET` n'y sont plus lus.

### 5.2 Secrets applicatifs : le Vault, source unique

- **Liste blanche** `_allowed_secret_names()` : `RESEND_API_KEY`, `SMTP_PASS`,
  `NOTIFY_TRIGGER_SECRET`. Elle borne l'écriture, l'état et la lecture par les RPC.
  (`TURNSTILE_SECRET_KEY`, qui n'était lue par rien, en est retirée.)
- **RPC** (toutes `SECURITY DEFINER`, aucune ne renvoie de valeur) :

| Fonction | Appelant | Effet |
|---|---|---|
| `set_app_secret(nom, valeur)` | admin actif (`authenticated`) | crée ou remplace par l'API du Vault (`vault.create_secret` / `vault.update_secret`, jamais d'UPDATE direct) ; refuse `NOTIFY_TRIGGER_SECRET` ; valeur rognée, non vide, 4 096 caractères au plus, sans caractère de contrôle ; renvoie `{ok, name, action}` |
| `delete_app_secret(nom)` | admin actif | supprime ; refuse `NOTIFY_TRIGGER_SECRET` ; idempotente |
| `rotate_notify_trigger_secret()` | admin actif | génère 32 octets aléatoires (hex) côté serveur, crée ou remplace |
| `list_app_secrets_status()` | admin actif | état par nom : `configured`, `updated_at`, dernier auteur, date et action |
| `get_app_secret(nom)` | **`service_role` seulement** | valeur en clair pour les fonctions Edge ; refuse un nom hors liste et tout appel PostgREST sous `anon`/`authenticated` ; `NULL` si absent |

- **Audit** : chaque écriture ajoute une ligne à `app_secrets_audit` (acteur tiré de `auth.uid()`,
  « système » sans session ; horodatage `clock_timestamp()`), **jamais la valeur**. La table est
  append-only pour tous les rôles de l'API ; l'ancienne policy « Insertion audit secrets », qui
  permettait à un admin de fabriquer des lignes, est supprimée.
- **`SMTP_PASS` lié à sa destination** : changer `smtp_host`, `smtp_port` ou `smtp_user` le
  supprime du Vault (audité). Sans cela, un admin pouvait pointer l'hôte SMTP vers son propre
  serveur et recevoir le mot de passe au prochain envoi. L'interface prévient et demande
  confirmation.
- **Côté fonctions** (`_shared/secrets.ts`) : `loadSecret` lit **uniquement** le Vault ; une
  erreur de la RPC fait échouer fermé (`503`) au lieu de retomber sur une autre source ; cache
  **par requête** seulement, pour qu'une rotation prenne effet immédiatement.
- **Interface** : Configuration › Notifications, cartes `RESEND_API_KEY` et `SMTP_PASS`
  (Définir / Remplacer / Supprimer) et « Déclenchement automatique » (état et « Régénérer » de
  `NOTIFY_TRIGGER_SECRET`). Champ `type=password`, vidé à l'envoi comme à l'annulation, boutons
  bloqués pendant l'envoi.
- **Restauration** : les valeurs du Vault sont chiffrées par une clé propre au projet, gérée par
  Supabase hors de la base. Restaurées sur un **autre** projet, elles sont illisibles : ressaisir
  `RESEND_API_KEY` / `SMTP_PASS` et régénérer `NOTIFY_TRIGGER_SECRET`.

### 5.3 Clés API Supabase des fonctions Edge

- Les fonctions lisent les **nouvelles clés** injectées par la plateforme :
  `SUPABASE_SECRET_KEYS` et `SUPABASE_PUBLISHABLE_KEYS`, dictionnaires JSON indexés par nom
  (`default` par défaut), validés par `_shared/cles.ts` (présence, JSON, nom, préfixe `sb_secret_`
  / `sb_publishable_`). Toute anomalie fait **échouer fermé** (`503`, message explicite dans le
  journal, jamais de valeur). Une clé héritée collée par erreur est refusée.
- **Rotation sans coupure** : créer une nouvelle clé nommée, poser son **nom** dans le secret de
  fonction `EDGE_SECRET_KEY_NAME` (resp. `EDGE_PUBLISHABLE_KEY_NAME`), vérifier, puis supprimer
  l'ancienne. Sans ces variables, la clé `default` est utilisée.
- Les clés **héritées** (`anon`, `service_role`, au format JWT) ne sont plus lues : elles sont
  dépréciées par Supabase, ne se révoquent pas une à une et ne tournent qu'avec le secret JWT,
  ce qui déconnecte tout le monde. Elles sont **désactivées** sur le projet (procédure dans
  `01-supabase.md` §13).
- **`verify_jwt = false` pour les 4 fonctions** (`supabase/config.toml`) : avec les nouvelles
  clés, le contrôle de la passerelle accepte aussi une clé publiable, publique, et « ne prouve
  rien sur l'appelant » (doc Supabase) ; le guide de migration le dit limité aux clés héritées et
  recommande de l'enlever. Chaque fonction authentifie **dans le code**
  (`_shared/autorisation.ts`) : jeton validé par Supabase Auth (un compte banni ou une session
  révoquée est refusé), profil **actif**, pas de changement de mot de passe en attente, rôle
  requis. `send-notifications` est protégée par `NOTIFY_TRIGGER_SECRET`.

### 5.4 Ce qui reste public par conception

La clé publiable et la sitekey Turnstile sont dans `public/js/config.js`, servies au navigateur :
la sécurité repose sur les droits, la RLS et la clé **secrète** Turnstile. Elles ne sont pas des
fuites. La documentation n'en contient pas de copie (gabarits `<…>` uniquement).

---

## 6. En-têtes HTTP, CSP et scripts tiers

Fichier `public/_headers` (appliqué par Cloudflare Pages) :

- **CSP** : `default-src 'self'` ; `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net
  https://challenges.cloudflare.com` (**cdnjs retiré**) ; `connect-src 'self' https://*.supabase.co
  wss://*.supabase.co https://challenges.cloudflare.com` ; `frame-src` Turnstile ;
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
  Cette CSP **n'est pas stricte** tant que `'unsafe-inline'` demeure (§12).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS (1 an, sous-domaines) ;
  `Permissions-Policy` : `camera=(self)` (scan des bons de départ), micro, géolocalisation,
  paiement et USB désactivés.
- Cache : `/lib/*` et `/img/*` 30 jours ; `/js/*` et `/css/*` 5 minutes avec revalidation ;
  HTML et `/confirm/*` en `no-cache`.

**Scripts tiers — version exacte et empreinte (SRI), ou copie locale :**

| Librairie | Chargement |
|---|---|
| `@supabase/supabase-js` 2.118.0 | jsDelivr, chemin explicite `dist/umd/supabase.js`, `integrity` sha384 + `crossorigin` (index et `/confirm`) |
| Chart.js 4.6.1, `@zxing/library` 0.19.2 | jsDelivr, **à la demande**, par `loadScriptOnce(src, integrity)` (`public/js/utils.js`), qui **refuse** tout script d'une autre origine sans empreinte |
| jsPDF 4.2.1, jsPDF-AutoTable 5.0.9, bwip-js | **copies locales** versionnées dans `public/lib/<nom>/<version>/` (bwip-js : `public/lib/`) |
| Cloudflare Turnstile `api.js` | seule exception : Cloudflare impose l'adresse exacte, sans version ni copie |

Le job CI « client » (`.github/scripts/verif_scripts_tiers.py`) vérifie la version exacte, l'empreinte
et `crossorigin` de chaque script distant, et l'absence de références aux anciens secrets.

**`public/js/config.js` échoue fermé** : un domaine absent de la table n'est plus dirigé en silence
vers la production ; aucun client Supabase n'est créé et un message bloquant s'affiche.

---

## 7. Realtime

La publication `supabase_realtime` est réduite à deux tables, en **listes de colonnes** :
`envois(id, exp_labo_id, dest_labo_id)` et `envois_hgrappe(id, exp_labo_id)`. L'événement ne sert
que de déclencheur de rechargement ; `confirm_token`, `verify_code`, `profiles` et `app_config` ne
sont pas publiés. Le flux respecte la RLS. Vérification :
`SELECT tablename, attnames FROM pg_publication_tables WHERE pubname='supabase_realtime';`.

---

## 8. Audit, journalisation et surveillance

- **`envois_audit`** : journal `INSERT/UPDATE/DELETE/ANNULATION` (`old_data`, `new_data`,
  `changed_fields`, acteur dérivé de `auth.uid()`), écrit par le déclencheur `trg_envois_audit`
  dans la **même transaction** que la modification. Append-only pour tous les rôles de l'API,
  `service_role` compris. Les capacités hors-grappe (`confirm_token`, `verify_code`) n'y sont pas
  recopiées. Purge à 12 mois (tâche `purge-envois-audit`).
- **`app_secrets_audit`** : écritures de secrets (qui, quand, quelle action), jamais la valeur.
- **`login_attempts`** (purgée à 7 jours) et **`hg_confirm_attempts`** (24 h).
- **`notification_log`** : historique des envois de courriels **et alertes de surveillance**
  (type `surveillance`, statut `error`), visibles par l'admin dans Configuration › Notifications
  (colonne « Détail ») :
  - le **chien de garde** `_surveiller_notifications` (tâche `surveillance-notifications`, jours
    ouvrables à 14 h UTC) alerte si des notifications de types activés attendent depuis plus de
    30 h — quelle que soit la cause (tâche absente, secret, fonction, fournisseur) ; au plus une
    alerte par 20 h ;
  - `_trigger_send_notifications` écrit une alerte au lieu d'appeler la fonction si l'URL du
    projet ou le secret de déclenchement manque.
- **Journaux de la plateforme** (API, Auth, Edge) : rétention courte (1 jour en plan Free,
  7 jours en Pro, selon la grille Supabase) ; à exporter **immédiatement** en cas d'incident.
- **Limite connue** : les lectures du Vault (`get_app_secret`) ne sont pas tracées en base.

---

## 9. Sauvegardes

Le plan Free de Supabase ne fournit **aucune** sauvegarde managée restaurable. La sauvegarde est
assurée par le workflow `.github/workflows/db-backup.yml`, **dans le dépôt privé uniquement** :

- connexion par le **Session pooler** (IPv4, port 5432) avec un rôle dédié en **lecture seule**
  `backup_reader` (`pg_read_all_data`, `BYPASSRLS`, transactions en lecture seule par défaut),
  jamais `postgres` ; TLS imposé ; garde sur l'identifiant du projet attendu ;
- dump validé (tables de `public` présentes, lignes réelles dans `auth.users` et
  `public.profiles`) ; données de session exclues (sessions, jetons de rafraîchissement, facteurs
  MFA, états de flux) ;
- **chiffré avec `age`** vers une ou plusieurs clés publiques ; la clé privée reste hors ligne. Le
  dump contient des renseignements personnels (employés, hachages de mots de passe) : en clair, il
  ne quitte jamais le runner ;
- artifact conservé **30 jours** ; tout échec ouvre (ou complète) une issue GitHub.

Procédure complète (création du rôle, clés `age`, restauration, test de restauration) :
[`../deploiement/04-sauvegardes.md`](../deploiement/04-sauvegardes.md).

---

## 10. Authentification multifacteur — options

La MFA **n'est pas implémentée** (décision du chantier : documenter les options). Un seul mot de
passe admin volé (hameçonnage, réutilisation, poste partagé) donne aujourd'hui la gestion des
comptes, la configuration, les secrets de courriel et la lecture de tous les laboratoires. Les
admins et superviseurs de grappe sont peu nombreux : c'est là que la MFA rapporte le plus.

Affirmations vérifiées dans la documentation officielle de Supabase et de Cloudflare
(novembre 2026). Les prix sont en USD et à reconfirmer au moment de la décision.

### 10.1 TOTP Supabase Auth (application d'authentification) — **recommandé**

- **Coût** : nul. Selon la doc Supabase, l'API TOTP est gratuite et activée par défaut sur tous les
  projets (*« TOTP MFA API is free to use and is enabled on all Supabase projects by default »*).
  À vérifier en console : *Authentication → Multi-Factor*. Application TOTP au choix de
  l'employé (Microsoft Authenticator, déjà répandu dans le réseau, ou équivalent).
- **Principe** : après le mot de passe, la session est de niveau `aal1` ; la vérification d'un
  facteur la fait passer à `aal2`. Le niveau est porté par la revendication `aal` du JWT (absente =
  `aal1`).
- **Parcours d'enrôlement** (client, à développer) :
  1. après la connexion par `auth-gate` (session `aal1`), appeler
     `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` ;
  2. si le compte est admin ou superviseur et n'a aucun facteur vérifié : écran d'enrôlement
     obligatoire — `mfa.enroll({ factorType: 'totp' })` (QR code + secret), puis
     `mfa.challenge()` et `mfa.verify()` avec le premier code ;
  3. si un facteur existe (`nextLevel = aal2`, `currentLevel = aal1`) : écran « code à 6 chiffres »
     — `mfa.challenge()` puis `mfa.verify()` ; la session devient `aal2`.
- **Exigence `aal2` côté serveur** (indispensable : un contrôle seulement dans le navigateur se
  contourne) :
  - **RPC de secrets** (`set_app_secret`, `delete_app_secret`, `rotate_notify_trigger_secret`,
    `list_app_secrets_status`) : ajouter
    `IF coalesce((SELECT auth.jwt() ->> 'aal'), 'aal1') <> 'aal2' THEN RAISE EXCEPTION … USING ERRCODE = '42501'`;
  - **`manage-user`** (et `test-notification`) : dans `exigerDemandeur`, lire les revendications
    vérifiées (`auth.getClaims(jeton)`) et refuser les actions de gestion d'un admin ou d'un
    superviseur si `aal ≠ aal2`. `change_own_password` traduit déjà l'erreur `insufficient_aal`
    de Supabase Auth en `403` explicite ;
  - **étape suivante, la plus large** : faire renvoyer « aucun droit » à `current_role_name()` pour
    un admin ou un superviseur_grappe en `aal1`. Ce seul changement couvre toutes les policies et
    tous les gardes des fonctions `SECURITY DEFINER`, ce que des policies `RESTRICTIVE` table par
    table ne feraient pas.
- **Déploiement par étapes**, pour ne verrouiller personne : livrer l'enrôlement, faire enrôler
  tous les comptes visés, puis seulement activer l'exigence serveur. **Au moins deux admins.**
- **Récupération** (téléphone perdu) : un autre admin supprime le facteur — par la console
  (*Authentication → Users*) ou par l'API d'administration `auth.admin.mfa.deleteFactor({ id, userId })`
  (à exposer dans `manage-user`, avec la même hiérarchie de rangs) ; la suppression d'un facteur
  vérifié déconnecte toutes les sessions de l'utilisateur. Les sauvegardes excluent les facteurs
  MFA : après une restauration, chacun se réenrôle.
- **Limite** : les postes de laboratoire sont partagés et les téléphones parfois restreints ; la
  TOTP reste possible (téléphone professionnel, ou clé matérielle compatible TOTP).
- **Effort estimé** : quelques jours de développement (écrans d'enrôlement et de vérification,
  contrôles serveur, tests, documentation de récupération).

### 10.2 SSO de l'établissement (SAML 2.0, Microsoft Entra ID)

- Supabase offre le SAML 2.0 **à partir du plan Pro** (*« SAML 2.0 support is offered on plans
  Pro and above »*) ; facturation de **0,015 USD par MAU SSO** au-delà du quota du plan. Entra ID
  (ex-Azure AD) figure parmi les fournisseurs pris en charge ; configuration par le CLI
  (`supabase sso add --type saml …`) avec l'URL de métadonnées fournie par la TI.
- **Avantages** : la MFA et l'accès conditionnel sont ceux de l'établissement ; un départ est géré
  à la source (compte désactivé dans l'annuaire) ; plus de mot de passe propre à l'application.
- **Contraintes** : plan Pro obligatoire (≈ 25 USD/mois) ; projet à mener avec la DRI (application
  d'entreprise Entra, domaines, attributs) ; refonte du login (redirection SSO au lieu de
  `auth-gate`, gestion du retour d'URL alors que `detectSessionInUrl` est aujourd'hui désactivé) ;
  la MFA de l'IdP n'apparaît pas comme `aal2` dans Supabase : l'exigence serveur porterait sur la
  méthode d'authentification (revendication `amr` contenant `sso/saml`). Les sessions Supabase
  existantes d'un compte désactivé dans l'annuaire restent à révoquer.
- **Verdict** : la meilleure cible à moyen terme si la DRI l'accompagne et si le plan Pro est
  retenu (il l'est déjà pour les sauvegardes managées et la rétention des journaux).

### 10.3 Clés d'accès / WebAuthn (passkeys)

- Supabase propose des passkeys en **bêta** (annonce du 28 mai 2026) ; la doc les dit
  **expérimentales** (*« Passkey support is experimental. The API may change without notice. »*),
  avec activation explicite côté client (`supabase-js` ≥ 2.105.0, version en place : 2.118.0).
- La page « Passkeys » les décrit comme une **connexion sans mot de passe** (premier facteur).
  Un facteur MFA WebAuthn apparaît dans les types de `supabase-js` (`mfa.webauthn`) et dans le
  gabarit de configuration du CLI (`[auth.mfa.web_authn]`, commenté dans `supabase/config.toml`),
  mais le guide MFA officiel ne documente que TOTP et téléphone : son usage comme **second
  facteur `aal2` est à considérer comme non stabilisé**. Les passkeys sont liées au *Relying
  Party ID* (domaine) : un changement de domaine les rend inutilisables.
- Sur des postes partagés, il faudrait des **clés matérielles FIDO2** nominatives (quelques
  dizaines de dollars par clé).
- **Verdict** : à réévaluer quand l'API sera stable et documentée comme second facteur.

### 10.4 Cloudflare Access (Zero Trust)

- Gratuit jusqu'à **50 utilisateurs**, puis **7 USD par utilisateur et par mois** (offre
  Pay-as-you-go).
- **Limite décisive** : Access protège un **nom d'hôte du site statique**, **pas l'API Supabase**
  (`*.supabase.co`), joignable directement avec la clé publiable et un mot de passe : il ne
  remplace donc pas une MFA de Supabase Auth et ne produit aucun `aal2`. La page `/confirm` doit
  rester publique (laboratoires externes), ce qui impose une exception. Le réglage « Enable access
  policy » de Pages ne protège nativement que les **déploiements de préversion**.
- **Usage pertinent** : fermer les préversions et `tests-deploiement` au public (gratuit).

### 10.5 SMS (MFA par téléphone) — déconseillé

- Module payant : **75 USD par mois** pour le premier projet (10 USD par projet supplémentaire),
  plus les frais du fournisseur SMS.
- Vulnérable à l'**échange de carte SIM** (la doc Supabase le signale) ; téléphones parfois
  restreints en laboratoire.

### 10.6 Recommandation

| Option | Coût | Protège l'API Supabase | Effort | Verdict |
|---|---|---|---|---|
| TOTP Supabase + exigence `aal2` serveur | 0 $ | **Oui** | quelques jours | **À faire en premier**, pour admin et superviseur_grappe (superviseur_labo ensuite, s'il gère des comptes) |
| SSO Entra ID (SAML) | plan Pro (≈ 25 USD/mois) + 0,015 USD/MAU SSO au-delà du quota | Oui (méthode `sso/saml`) | projet avec la DRI | Cible à moyen terme |
| Passkeys / WebAuthn | clés FIDO2 éventuelles | Second facteur non stabilisé | — | Attendre la stabilisation |
| Cloudflare Access | 0 $ ≤ 50 utilisateurs | **Non** | faible | Complément : préversions seulement |
| SMS | 75 USD/mois + SMS | Oui | moyen | Déconseillé |

---

## 11. Tableau récapitulatif des mesures

| Mesure | Où | Statut |
|---|---|---|
| Privilèges explicites, privilèges par défaut révoqués | `schema.sql` « Modèle de privilèges » + CI blocs 6-8 | ✅ |
| RLS sur toutes les tables, cloisonnement par laboratoire | `schema.sql` + CI | ✅ |
| Colonnes sensibles protégées par déclencheurs | `protect_*`, `_envois_hgrappe_capacites`, `_proteger_app_config` | ✅ |
| `anon` limité aux 4 RPC de `/confirm` | `schema.sql` + CI | ✅ |
| Code de vérification HG indépendant du jeton (50 bits), limite d'essais atomique | `_generer_verify_code`, `get_envoi_hgrappe_by_numero` | ✅ |
| Captcha validé par la plateforme, inscription publique fermée | console + `auth-gate` + `config.toml` | ✅ (réglages console à vérifier après installation) |
| Mot de passe ≥ 12, changement imposé appliqué par le serveur | `manage-user`, fonctions d'autorité, console | ✅ |
| Désactivation = bannissement + révocation des sessions | `manage-user` `toggle_active`, `revoke_user_sessions` | ✅ |
| Secrets applicatifs dans le Vault seulement, saisis par l'UI, audités | RPC de secrets, `app_secrets_audit` | ✅ |
| `NOTIFY_TRIGGER_SECRET` généré par la base, jamais en clair dans `cron.job` | `_trigger_send_notifications`, tâches versionnées | ✅ |
| Nouvelles clés API, clés héritées désactivées | `_shared/cles.ts` + console | ✅ (désactivation : à faire en console) |
| Scripts tiers épinglés avec SRI, CSP sans cdnjs | `public/`, `_headers`, CI « client » | ✅ (réserve `unsafe-inline`) |
| Chien de garde des notifications | `_surveiller_notifications` | ✅ |
| Sauvegarde chiffrée, rôle en lecture seule, alerte | `db-backup.yml` (dépôt privé) | ✅ (à activer après installation) |
| Détection de secrets avant et après push | `pre-commit` + job CI « secrets » | ✅ (hook à installer sur chaque poste) |
| MFA | — | ⏳ Options documentées (§10) |
| Environnement de développement distinct | — | ⏳ Recommandé (§12) |

---

## 12. Points d'attention et recommandations résiduelles

1. **[Moyen] CSP `'unsafe-inline'`.** Elle affaiblit la protection de la CSP contre le XSS.
   `escapeHtml` est correct pour du texte HTML et un attribut entre guillemets doubles, **pas** à
   l'intérieur d'un littéral JavaScript dans un attribut `on*` (l'analyseur décode `&#x27;` avant
   le JavaScript) : une faille de ce type a été corrigée en construisant les éléments par le DOM.
   Recommandation : nonces/empreintes CSP et retrait de `'unsafe-inline'`, ce qui suppose de
   réécrire les gestionnaires `on*` en ligne.
2. **[Moyen] Pas d'environnement de développement distinct.** `localhost`, `127.0.0.1`,
   `tests-deploiement` et les entrées Render visent le **même projet** que la production. La
   connexion locale n'est donc pas prise en charge, et tout essai manipule des données réelles.
   Recommandation : un projet Supabase de développement (offre Free, données synthétiques, clés
   Turnstile de test) ou la pile locale `supabase start` — voir
   `../deploiement/05-procedures-securite.md` §4. **Ne jamais exécuter les seeds de démonstration
   sur la production.**
3. **[Moyen] MFA non implémentée** (§10).
4. **[Moyen] Branche `main` non protégée et déploiement automatique.** Un push sur `main` est servi
   en production par Cloudflare Pages en quelques minutes. Recommandations : ruleset sur `main`
   (PR obligatoire, checks CI requis) dès que le plan le permet ; épinglage des actions par SHA
   imposé et liste blanche d'actions (réglages GitHub à poser après la fusion, voir
   `../deploiement/README.md`) ; vérifier que l'intégration GitHub de Supabase ne déploie rien
   automatiquement en production.
5. **[Faible] Signalements résiduels du linter Supabase, assumés** :
   - fonctions `SECURITY DEFINER` exécutables par `anon` (les 4 de `/confirm`) et par
     `authenticated` (auxiliaires de la RLS, RPC métier qui contrôlent elles-mêmes le périmètre) ;
   - couples de policies « Lecture X » + « Gestion X » (`FOR ALL`), au coût négligeable ici ;
   - index « jamais utilisés », dont plusieurs couvrent des clés étrangères ;
   - **Leaked password protection**, réservée au plan Pro : à activer si le projet y passe.
   Le nettoyage du 2026-11-08 (policies en double, `(SELECT auth.uid())` dans les policies, index
   redondants, anciennes surcharges de `create_envoi_*`, écriture `icr_codes` limitée à
   `authenticated`) est intégré à `schema.sql` ; `pg_net` est installée dans le schéma
   `extensions` (ses fonctions restent dans `net`).
6. **[Faible] Traçabilité.** Lectures du Vault non tracées ; journaux de plateforme de 1 à 7 jours.
   À un passage en plan Pro, envisager un export des journaux.
7. **[Faible] Copie de sauvegarde hors site** à mettre en place (l'artifact vit dans le même compte
   GitHub que le code) ; un workflow désactivé ou abandonné n'ouvre aucune issue : seule une
   supervision externe le couvrirait.
8. **[Faible] `connect-src https://*.supabase.co`** à resserrer sur l'hôte exact du projet une fois
   la reconstruction faite.
9. **[Faible] Domaines hérités.** Les entrées `*.onrender.com` restent dans `config.js` et dans la
   liste CORS : décider de leur sort (garder un secours documenté, avec les en-têtes de `_headers`
   reproduits, ou les retirer).
10. **[Info] Captures d'écran.** Aucune capture ne doit montrer un QR, un code de vérification, un
    jeton, une URL de confirmation ni une donnée réelle.

---

## 13. Historique des correctifs

### Chantier « secrets et durcissement » (novembre 2026)

Base reconstruite à neuf depuis `schema.sql` (aucune migration de rattrapage) ; migrations
`057`→`060` archivées après report dans `schema.sql`. Principaux changements, détaillés dans les
sections ci-dessus : modèle de privilèges autonome ; secrets applicatifs dans le Vault seulement,
saisis par l'UI, fonction `set-secret` supprimée ; `NOTIFY_TRIGGER_SECRET` généré par la base et
tâches pg_cron versionnées (plus de secret dans `cron.job`) ; nouvelles clés API ; `verify_jwt =
false` et autorisation commune dans le code (profil actif exigé : un compte désactivé ne garde plus
aucun pouvoir) ; changement de mot de passe imposé par le serveur ; désactivation par
bannissement ; code de vérification hors-grappe indépendant du jeton ; scripts tiers épinglés ;
`config.js` en échec fermé ; sauvegarde chiffrée par un rôle en lecture seule ; détection de
secrets ; correction du déclencheur de `envois_hgrappe`, qui lisait une colonne `dest_labo_id`
inexistante et faisait échouer toute mise à jour par un utilisateur ; aléa par
`gen_random_uuid()` seul (`uuid-ossp` et `pgcrypto` ne sont plus requis par le schéma).

### Correctifs `057` → `060` (novembre 2026)

Constat commun : un contrôle existait côté client sans contrepartie serveur ; or avec PostgREST,
la base **est** l'API.

- **XSS stocké** via un littéral JavaScript dans un attribut `on*` : éléments construits par le
  DOM, contraintes `CHECK` sur les colonnes concernées.
- **Journal d'audit écrit par le serveur** (déclencheur dans la même transaction) : 6 des 7
  chemins de modification ne journalisaient rien.
- **Logique trivalente** : `current_role_name()` renvoyait `NULL` sans profil, et 16 gardes écrits
  en « permis nié » ne refusaient rien ; corrigé à la source.
- **Compte désactivé** : `active` désormais pris en compte par les fonctions d'autorité.
- **Colonnes de tenancy immuables** (laboratoire, numéro, auteur d'un envoi).
- **File de notification** : plus d'écriture directe ; RPC `queue_envoi_notification`.
- **Usage unique du jeton de confirmation** rendu atomique.
- **Rétention réellement planifiée** et découplée de l'envoi de courriels.
- **Jeton de confirmation hors du DNS** (il était le label de gauche du QR).
- **supabase-js épinglé** avec SRI ; **publication Realtime restreinte**.
- **Captcha exigé à chaque connexion, verrouillage par identifiant retiré.**

### Révocation effective des droits (`052`, `053`)

Les `REVOKE … FROM anon` des migrations `033`, `043`, `047` et `050` étaient sans effet
(`PUBLIC` gardait le droit) : un appelant anonyme pouvait notamment purger le journal d'audit. La
`052` a révoqué `PUBLIC` puis accordé chaque fonction à son rôle ; la `053` a retiré à `anon` les
auxiliaires de la RLS. Ce modèle est désormais porté par `schema.sql` (§2.1).

### Audit backend (BETA 1.10.2 — migration `046`)

- **[Critique] Élévation de privilèges via `profiles`** : un technicien pouvait se donner le rôle
  admin ; déclencheur `protect_profile_columns`.
- **[Élevé] Fuite inter-labos via `envois_audit`** : cloisonnement par laboratoire.
- **[Élevé] `manage-user`** : contrôle hiérarchique généralisé.
- **[Moyen] `test-notification`** sans authentification ; **`send-notifications`** divulguait les
  adresses ; **CORS `*`** : corrigés.

### Rôle Metabase (`054` d'origine)

Le rôle `metabase_ro` et ses policies `USING (true)` ont été supprimés ; il n'existe pas dans la
base reconstruite. Le mot de passe autrefois versionné pour ce rôle est sans objet ; l'historique
public du dépôt est repris à neuf.

---

*Dernière mise à jour : 2026-11-10 — chantier « secrets et durcissement » (base reconstruite depuis `schema.sql`)*
