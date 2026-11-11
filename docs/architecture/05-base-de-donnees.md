# 05 — Base de données

> Projet : **Traçabilité OPTILAB — BSL-GAS**
> Version : **BETA 1.10.2** (chantier « secrets et durcissement », novembre 2026)
> SGBD : **PostgreSQL 17** (Supabase), schéma `public`, sécurité par **privilèges explicites** + **RLS** + fonctions `SECURITY DEFINER`
> Audience : auditeurs (modèle de données, intégrité, conformité)

**`supabase/schema.sql` est l'unique source de vérité de la base**, maintenue à la main. Il s'exécute d'un bloc, dans le SQL Editor, sur un projet **vierge** ; il n'existe plus de migration de rattrapage (les anciennes migrations ont été retirées du dépôt). La procédure d'installation est dans [`../deploiement/01-supabase.md`](../deploiement/01-supabase.md).

Règles de maintenance :

- **Tout objet ajouté** (table, fonction, séquence) s'inscrit dans le bloc **« Modèle de privilèges »** de `schema.sql` **et** dans les listes exactes de `supabase/ci/verif_restauration.sql` (blocs 6 à 8) ; un objet oublié n'est accessible à personne, et la CI échoue sur un droit manquant comme sur un droit en trop.
- Aucune méta-commande `psql` ni syntaxe propre à PostgreSQL 18 : le fichier doit se charger dans le SQL Editor de Supabase (PostgreSQL 17).
- La CI (job « schema.sql sur Postgres vierge ») charge `supabase/ci/supabase_shim.sql` (rôles, schémas `auth` et `vault`, privilèges par défaut de Supabase), puis `schema.sql`, puis `verif_restauration.sql`, qui inclut les tests fonctionnels `tests_fonctionnels.sql` (transaction annulée).
- **Base déjà en service** : `schema.sql` ne se rejoue pas sur une base existante. Toute évolution modifie `schema.sql` (source de vérité) **et** fournit, dans la description de la PR, l'instruction équivalente à appliquer une fois dans le SQL Editor du projet (par exemple `ALTER TABLE … ADD CONSTRAINT … NOT VALID`, puis `VALIDATE CONSTRAINT` une fois les lignes existantes conformes).

---

## 1. Vue d'ensemble du modèle

Le modèle s'organise autour de trois axes :

- **Référentiels** : `grappes`, `laboratories`, `external_labs`, `icr_codes`.
- **Flux d'envois** : `envois` (intra-grappe), `envois_hgrappe` (hors-grappe), `bons_depart` (+ sections + liaisons).
- **Identité & sécurité** : `profiles`, `user_lab_memberships`, `envois_audit`, `login_attempts`, `hg_confirm_attempts`, `app_secrets_audit`, configuration (`app_config`, `grappe_config`, `module_config`) et notifications.

```
grappes ──< laboratories ──< profiles ──< user_lab_memberships
                 │  │
                 │  └─< envois >── bons_depart_envois >── bons_depart ──< bons_depart_sections
                 │       (intra)
                 └─< envois_hgrappe >── external_labs (parent/enfant)
                        (hors-grappe, confirm_token, verify_code)

app_config / grappe_config / module_config   → configuration (clé/valeur JSONB)
icr_codes                                      → référentiel valeurs pondérées
notification_config / _emails / _queue / _log → notifications courriel
envois_audit, app_secrets_audit                → journaux d'audit (append-only)
vault.secrets (schéma Supabase)                → secrets applicatifs chiffrés
```

---

## 2. Tables principales

### Référentiels

| Table | Rôle |
|---|---|
| `grappes` | Grappes de laboratoires (ex. « Grappe 1 — BSL-GAS »). `id, name, code, active` |
| `laboratories` | Laboratoires du réseau. Adresse complète, fax par département, `default_refrigerant`, `grappe_id` |
| `external_labs` | Laboratoires **externes** (destinataires HG), hiérarchie `parent_id`, `label_text` personnalisable |
| `icr_codes` | Référentiel des codes de valeurs pondérées (Workload). `code` (PK), `libelle`, `actif`, `ordre` |

### Configuration

| Table | Rôle |
|---|---|
| `app_config` | Configuration globale clé → valeur **JSONB** (`key` PK). Lisible aussi par `anon` (aucun secret). La clé **`supabase_url`** (URL de base appelée par le cron) est livrée vide, se renseigne dans le SQL Editor et n'est pas modifiable depuis l'application (`_proteger_app_config`) |
| `grappe_config` | Configuration **par grappe** (miroir de `app_config`, scopé), dont la bascule de confirmation hors-grappe par numéro. `UNIQUE(grappe_id, key)` |
| `module_config` | Activation des **modules par laboratoire** : `module` ∈ {`bons_depart`, `hgrappe`, `gestion_echantillons`, `notifications`}, `active`, `config` JSONB. `UNIQUE(module, labo_id)` |

### Identité et autorisations

| Table | Rôle |
|---|---|
| `profiles` | Profil utilisateur (étend `auth.users`). `employee_id` (unique), `nom`, `labo_id`, `labo_ids[]` (historique), `role` (CHECK : technicien / superviseur_labo / superviseur_grappe / admin), `active`, `must_change_password`, `is_test`, `theme`, `tour_progress`. Colonnes sensibles protégées par `protect_profile_columns` ; `active` et `must_change_password` ne sont écrites que par `manage-user` |
| `user_lab_memberships` | Rôle **par labo** : `profile_id`, `labo_id`, `lab_role` ∈ {technicien, responsable}. `UNIQUE(profile_id, labo_id)` |

### Flux d'envois

| Table | Rôle |
|---|---|
| `envois` | Envois **intra-grappe**. Voir colonnes clés §3 |
| `envois_hgrappe` | Envois **hors-grappe** vers `external_labs`, avec `confirm_token`, `verify_code` et champs de confirmation |
| `bons_depart` | Bon de départ (regroupement). `numero` (BD-YYYY-NNNN), `statut` ∈ {actif, récupéré, annulé} |
| `bons_depart_sections` | Une section par transporteur (`bon_connaissement`, `date_prise_en_charge`, `nom_transporteur_reel`) |
| `bons_depart_envois` | Liaison envoi ↔ bon (`type` intra/hg + CHECK garantissant un seul type renseigné) |

### Notifications

| Table | Rôle |
|---|---|
| `notification_config` | Ligne unique (créée par `schema.sql`, désactivée) : interrupteur, types, fournisseur resend/smtp, `smtp_host/port/user/from`, `fallback_email`. **Aucune colonne de secret** : les clés vivent dans le Vault |
| `notification_emails` | Adresses par labo × département (`dept_id` nullable → repli labo puis global) |
| `notification_queue` | File d'attente. `type` ∈ {nc, lost, alarm, alarm_r, hg_nc, hg_alarm}, `details` JSONB, `sent_at`, `batch_id`. Écriture par la RPC `queue_envoi_notification` et les fonctions serveur seulement |
| `notification_log` | Historique des courriels (`status` sent/error, `error_message`) **et alertes de surveillance** (type `surveillance`) |

### Sécurité et audit

| Table | Rôle |
|---|---|
| `envois_audit` | Journal **générique** : `table_name`, `record_id`, `action` (INSERT/UPDATE/DELETE/ANNULATION), `old_data`/`new_data` JSONB, `changed_fields[]`, `changed_by_*`. Écrit par le déclencheur `trg_envois_audit` ; append-only (`service_role` compris) ; `confirm_token` et `verify_code` exclus des instantanés |
| `app_secrets_audit` | Audit des écritures de secrets (nom, action, auteur, date — jamais la valeur). Append-only ; écrit par les fonctions de secrets |
| `login_attempts` | Tentatives de connexion (détection), alimentée par `auth-gate` via `service_role` ; purgée à 7 jours |
| `hg_confirm_attempts` | Échecs de confirmation HG par numéro (`reason` wrong_code/not_found) ; purgée à 24 h |

> **Secrets applicatifs.** `RESEND_API_KEY`, `SMTP_PASS` et `NOTIFY_TRIGGER_SECRET` sont stockés **chiffrés dans le Supabase Vault** (`vault.secrets`), écrits uniquement par l'API du Vault (`vault.create_secret` / `vault.update_secret`) depuis les fonctions de secrets, et lus par `get_app_secret()` (réservée à `service_role`) ou, pour le seul `NOTIFY_TRIGGER_SECRET`, par la tâche planifiée. La clé secrète Turnstile est un réglage Supabase Auth, pas une donnée de la base. Détail : [04-securite.md](04-securite.md) §5.

---

## 3. Colonnes importantes des tables clés

### `envois` (intra-grappe)

| Colonne | Rôle |
|---|---|
| `numero` | Identifiant interne unique, **auto-généré** par déclencheur (`SILP-`/`HSILP-YYMMDD-NNNNN`), immuable |
| `numeros_silp TEXT[]` | Listes de repérage physiques (index **GIN**). Vide ⇒ préfixe HSILP |
| `exp_labo_id` / `dest_labo_id` | Laboratoires expéditeur / destinataire (immuables après création), **distincts** (CHECK `envois_exp_dest_distincts`) |
| `temperature`, `transporteur` | `transporteur` **nullable** si module bons de départ actif |
| `statut` | CHECK : En attente, En transit, Reçu, Problème, Perdu, **Annulé** |
| `type_specimen`, `glace_seche` | Spécimen (exempt / cat_b / cat_a) ; glace sèche |
| `echantillons_depart[]`, `echantillons_reception[]` | Codes-barres d'échantillons scannés (index GIN) |
| `hors_corridor BOOLEAN`, `codes_icr TEXT[]` | Transport hors corridor + codes ICR calculés (index GIN) |
| `annule_at`, `annule_par_id/nom`, `annule_note` | Annulation logique (soft delete) |
| `ts_envoi`, `ts_recep` | Horodatages d'envoi / réception |

### `envois_hgrappe` (hors-grappe)

| Colonne | Rôle |
|---|---|
| `numero` | `HG-YYMMDD-NNNNN` (via `hgrappe_seq`) |
| `source` | `silp` / `hsilp` |
| `dest_ext_lab_id` | Destinataire externe |
| `confirm_token UUID` | Jeton de confirmation (lien/QR de la page publique) ; fixé par le serveur à l'insertion, immuable |
| `verify_code TEXT NOT NULL` | **Code de vérification** imprimé sur le F-G-74 : 10 caractères, alphabet sans `I`, `O`, `0`, `1` (CHECK `^[A-HJ-NP-Z2-9]{10}$`), 50 bits d'aléa, **indépendant du jeton** ; généré par le déclencheur `_envois_hgrappe_capacites`, immuable |
| `confirm_method` | `online` / `fax` |
| `confirm_conforme`, `confirm_nc_types[]`, `confirm_commentaire`, `confirm_recu_par`, `ts_confirm` | Résultat de la confirmation |
| `statut` | En attente, En transit, Reçu, Problème, Aucune réponse reçue |
| `echantillons_depart[]`, `hors_corridor`, `codes_icr[]` | Échantillons + codes ICR |

---

## 4. Numérotation des envois

| Séquence | Format | Généré par |
|---|---|---|
| `envoi_seq` | `SILP-YYMMDD-NNNNN` / `HSILP-YYMMDD-NNNNN` | Déclencheur `trg_envoi_numero` → `generate_envoi_numero()` (BEFORE INSERT sur `envois`) |
| `hgrappe_seq` | `HG-YYMMDD-NNNNN` | RPC `create_envoi_hgrappe()` |
| `bd_seq` | `BD-YYYY-NNNN` | RPC `create_bon_depart()` |

`generate_envoi_numero()` choisit le préfixe **automatiquement** : `HSILP-` si `numeros_silp` est vide, `SILP-` sinon. `peek_next_hsilp()` et `peek_next_hgrappe()` affichent le prochain numéro **sans consommer** la séquence.

---

## 5. Référentiel `icr_codes` (valeurs pondérées / Workload)

| `code` | `libelle` | Déclencheur |
|---|---|---|
| `70008` | Glace sèche | `glace_seche = true` |
| `70009` | Envoi urgent en dehors des routes normales | `hors_corridor = true` |

`_compute_codes_icr(glace_seche, hors_corridor)` calcule `codes_icr` à l'insertion (appelée par `create_envoi_hsilp` / `create_envoi_hgrappe`). `get_icr_stats(labo_id, days)` agrège les compteurs intra + HG pour les KPI. Les deux codes sont insérés par `schema.sql`.

---

## 6. Fonctions SQL notables

Les fonctions `SECURITY DEFINER` s'exécutent avec les droits du propriétaire ; **toutes** les fonctions de `public` ont un `search_path` figé (invariant CI). Qui peut exécuter quoi : [04-securite.md](04-securite.md) §2.1.

| Fonction | Rôle |
|---|---|
| `current_role_name()`, `current_labo_id()`, `current_labo_ids()`, `current_lab_role(labo_id)` | Fonctions d'autorité de la RLS ; « aucun droit » si le compte est inactif ou doit changer son mot de passe |
| `is_module_active(module, labo_id)` | Module activé pour un labo |
| `generate_envoi_numero()` | Déclencheur : auto-numérotation `SILP-`/`HSILP-` |
| `create_envoi_hsilp(...)`, `create_envoi_hgrappe(...)` | Création atomique (contrôle d'accès, échantillons, ICR) ; `create_envoi_hgrappe` renvoie `numero`, `token` et `verify_code`. Une seule surcharge de chacune |
| `get_envoi_hgrappe_by_token(token)` | Lecture publique par jeton (page `/confirm`) |
| `get_envoi_hgrappe_by_numero(numero, code)` | Lecture publique par numéro + `verify_code` ; **5 échecs / 15 min** par numéro (atomique) ; `disabled` si la bascule de la grappe est désactivée |
| `get_hg_confirm_cfg()` | État de la confirmation par numéro (lu dans `grappe_config`) |
| `confirm_envoi_hgrappe(...)` | Confirmation publique ; met en file une notification `hg_nc` si non conforme |
| `annuler_envoi(id, note)` | Annulation logique : contrôle créateur/responsable/superviseur, note obligatoire |
| `create_bon_depart(...)`, `add_envois_to_bon(...)`, `remove_envoi_from_bon(...)`, `cancel_bon_depart(...)`, `check_bon_completion(bon_id)` | Cycle de vie des bons de départ |
| `queue_envoi_notification(...)` | Mise en file d'une notification ; laboratoire dérivé **de la ligne d'envoi** |
| `get_labo_kpis(labo_id, days)`, `get_icr_stats(...)`, `get_hist_stats()`, `get_hg_hist_stats()` | Statistiques |
| `set_app_secret`, `delete_app_secret`, `rotate_notify_trigger_secret`, `list_app_secrets_status` | Gestion des secrets par un admin actif ; aucune ne renvoie de valeur |
| `get_app_secret(nom)` | Lecture d'un secret pour les fonctions Edge ; **`service_role` seulement**, liste blanche |
| `revoke_user_sessions(user_id)` | Supprime les sessions d'un compte (désactivation) ; `service_role` seulement |
| `count_recent_login_failures`, `record_login_attempt` | Détection des échecs de connexion ; `service_role` seulement |
| `_trigger_send_notifications()` | Tâche planifiée : lit `app_config.supabase_url` et le secret dans le Vault, appelle `send-notifications` par `net.http_post` ; alerte dans `notification_log` si la configuration manque |
| `_surveiller_notifications()` | Chien de garde : alerte si des notifications attendent depuis plus de 30 h |
| `_detect_alarm_envois()` | Détection SQL des alarmes (`alarm_r`, `alarm`, `hg_alarm`), avec déduplication |
| `_purge_envois_audit()`, `_purge_notifications()` | Rétention (12 mois ; 90 jours) |
| `_effacer_smtp_pass()` | Déclencheur : supprime `SMTP_PASS` si l'hôte, le port ou l'utilisateur SMTP change |

**Aléa** : uniquement `gen_random_uuid()` (cœur de PostgreSQL) ; le schéma ne requiert ni `uuid-ossp` ni `pgcrypto` (`seed_demo_users.sql` utilise `crypt()` de `pgcrypto`, préinstallée par Supabase).

**Tâches planifiées (pg_cron + pg_net)** — créées par le bloc « Tâches planifiées » de `schema.sql`, gardé (rien n'est planifié si une extension manque) et rejouable. `pg_net` est installée dans le schéma `extensions` ; ses fonctions restent dans `net`. Aucune commande ne contient de secret. Horaires UTC :

| Tâche | Planification | Action |
|---|---|---|
| `send-notifications` | `55 11 * * 1-5` | `_trigger_send_notifications()` |
| `detect-alarm-envois` | `10,40 * * * *` | `_detect_alarm_envois()` |
| `purge-envois-audit` | `17 3 * * *` | `_purge_envois_audit()` |
| `purge-notifications` | `32 3 * * *` | `_purge_notifications()` |
| `purge-historique-cron` | `47 3 * * *` | `cron.job_run_details` au-delà de 30 jours |
| `purge-hg-confirm-attempts` | `52 3 * * *` | tentatives HG au-delà de 24 h |
| `surveillance-notifications` | `0 14 * * 1-5` | `_surveiller_notifications()` |

La dernière instruction de `schema.sql` affiche l'**état de l'installation** (extensions, tâches `x / 7`, secret, URL) et l'étape suivante.

---

## 7. Historique des migrations (retirées)

> **Toutes les migrations ont été reportées dans `schema.sql`, puis retirées du dépôt.** Elles ne se rejouent **jamais** : une base se crée en exécutant `schema.sql` une seule fois. Le tableau ci-dessous n'est qu'un historique.

| # | Objet |
|---|---|
| 006 → 024 | Hors-grappe, notifications, KPI, bons de départ, numérotation SILP, annulation, `module_config`, appartenances par labo, grappes |
| 025 | `vault_app_secrets` — secrets dans le Supabase Vault |
| 026, 029 | Limite d'essais de la confirmation HG (029 : fonction repassée `VOLATILE`) |
| 027 | `login_attempts` — détection des échecs de connexion (`auth-gate`) |
| 028 | `secrets_sans_vault` — **neutralisée** (colonnes de secrets en clair, retirées par 056) |
| 030 | Cloisonnement RLS par laboratoire |
| 031 → 033 | `search_path` figé, `WITH CHECK`, révocations `anon` (sans effet avant 052) |
| 035 | Module gestion des échantillons |
| 036 → 039 | Cron des notifications, puis appel direct de la fonction (le job vivait au tableau de bord : remplacé par les tâches versionnées) |
| 040, 041 | Codes ICR |
| 042 | `profiles.tour_progress` |
| 043 | Révocation `EXECUTE` `anon` (sans effet avant 052) |
| 044 | `_detect_alarm_envois()`, types `alarm_r` / `hg_alarm` |
| 046 | **Sécurité** : `protect_profile_columns`, cloisonnement de `envois_audit` |
| 047 | Index de clés étrangères, purge de `envois_audit` |
| 048 | `get_hist_stats` / `get_hg_hist_stats` |
| 049 | Suppression d'un déclencheur hors versionnement (notifications en double) |
| 050, 051 | Mode formation — retiré par 059 |
| 052, 053 | **Sécurité** : `EXECUTE` révoqué sur `PUBLIC` puis accordé par rôle ; auxiliaires de la RLS retirés à `anon` |
| 054 | Abandon de Metabase (rôle `metabase_ro` et policies supprimés) |
| 055 | Retrait de policies permissives ajoutées hors dépôt |
| 056 | Suppression des colonnes de secrets en clair de `notification_config` |
| 057 | **Sécurité** (audit) : journal d'audit écrit par déclencheur, fonctions d'autorité sans `NULL`, colonnes de tenancy immuables, file de notification par RPC, usage unique atomique du jeton, purges planifiées |
| 058 | Publication Realtime restreinte (listes de colonnes) |
| 059 | Suppression du module Autoformation |
| 060 | Les échecs de connexion récents sont soldés par un succès |

**Intégré directement dans `schema.sql`** (sans fichier de migration) :

- le **nettoyage du linter Supabase** du 2026-11-08 : policies en double supprimées, `auth.uid()` réécrit en `(SELECT auth.uid())` dans les policies, index en double ou redondants avec une contrainte `UNIQUE` retirés, index ajoutés sur les clés étrangères `app_secrets_audit.changed_by_id` et `module_config.labo_id`, anciennes surcharges de `create_envoi_hgrappe` / `create_envoi_hsilp` supprimées, écriture sur `icr_codes` limitée à `authenticated` (policies `INSERT`/`UPDATE`/`DELETE`), `pg_net` dans le schéma `extensions` ;
- le **chantier « secrets et durcissement »** : modèle de privilèges autonome (privilèges par défaut révoqués, révocation globale puis `GRANT` explicites, journaux d'audit append-only y compris pour `service_role`) ; RPC de secrets par l'API du Vault et liste blanche sans `TURNSTILE_SECRET_KEY` ; `get_app_secret_status` supprimée ; `revoke_user_sessions` ; `must_change_password` appliqué par le serveur ; `active` réservé à `manage-user` ; `verify_code` et bascule par grappe appliquée côté serveur ; effacement de `SMTP_PASS` sur changement de destination ; `NOTIFY_TRIGGER_SECRET` généré à l'installation ; 7 tâches planifiées versionnées et chien de garde ; **correction du déclencheur de `envois_hgrappe`**, qui lisait une colonne `dest_labo_id` inexistante dans cette table et faisait échouer toute mise à jour par un utilisateur (nouvelle fonction `protect_envoi_hgrappe_columns`) ; passage à `gen_random_uuid()` ; données de référence rétablies (ligne `notification_config`, et dans `seed.sql` la grappe BSL-GAS).

---

## 8. Row Level Security (résumé)

RLS activée sur **toutes** les tables du schéma `public`. Résumé (détail dans [04-securite.md](04-securite.md) §2.4) :

| Table | Lecture | Écriture |
|---|---|---|
| `envois` | exp/dest labo OU superviseur grappe/admin | INSERT si exp labo ; UPDATE si exp/dest labo (`WITH CHECK` = `USING`) |
| `envois_hgrappe` | exp labo OU grappe/admin | idem ; capacités fixées par le serveur |
| `laboratories`, `external_labs` | Tous (authenticated) | Admin |
| `app_config` | authenticated **+ anon** | Admin (sauf `supabase_url`) |
| `grappe_config`, `module_config` | authenticated | Admin / superviseur_grappe |
| `profiles` | Soi-même + superviseurs selon leur périmètre | Soi-même (colonnes non sensibles) + gestionnaires ; INSERT `service_role` |
| `user_lab_memberships` | Soi-même + admin / superviseur_grappe | Admin / superviseur_grappe |
| `notification_*` | Admin / superviseur_grappe (config : admin) | Admin (config, adresses) ; file et journal : serveur seulement |
| `login_attempts`, `hg_confirm_attempts` | Admin / grappe | Serveur seulement |
| `envois_audit` | cloisonnée par labo | **aucune** (déclencheur) |
| `app_secrets_audit` | Admin | **aucune** (fonctions de secrets) |

---

## 9. Index notables

- **GIN** : `envois.numeros_silp`, `envois.echantillons_depart`/`_reception`, `envois.codes_icr`, `envois_hgrappe.echantillons_depart`/`codes_icr`, `profiles.labo_ids`.
- **B-tree** : `envois.statut`, `envois.ts_envoi DESC`, `envois.annule_at` (partiel), clés étrangères (`cree_par_id`, `annule_par_id`, `notification_queue`, `notification_log.labo_id`, `app_secrets_audit.changed_by_id`, `module_config.labo_id`). Les colonnes déjà couvertes par une contrainte `UNIQUE` (`envois.numero`, `envois_hgrappe.numero`, `confirm_token`, `profiles.employee_id`) n'ont pas d'index en double.
- **Partiels** : `bons_depart_envois.envoi_id`/`hg_envoi_id`, `notification_queue.created_at` (`WHERE sent_at IS NULL`).

---

## 10. Croissance et rétention

La table la plus sensible en volume est **`envois_audit`** (~438 MB/an à 200 envois/jour sans purge) : purge au-delà de 12 mois (tâche `purge-envois-audit`). `notification_queue` / `notification_log` : 90 jours ; `login_attempts` : 7 jours ; `hg_confirm_attempts` : 24 h ; `cron.job_run_details` : 30 jours. Analyse complète : [07-capacite-supabase.md](07-capacite-supabase.md).

---

Dernière mise à jour : 2026-11-10 — chantier « secrets et durcissement » (base reconstruite depuis `schema.sql`)
