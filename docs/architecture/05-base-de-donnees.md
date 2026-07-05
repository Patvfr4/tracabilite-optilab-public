# 05 — Base de données

> Projet : **Traçabilité OPTILAB — BSL-GAS**
> Version : **BETA 1.10.0**
> SGBD : **PostgreSQL** (Supabase), schéma `public`, sécurité par **RLS** + fonctions `SECURITY DEFINER`
> Audience : auditeurs (modèle de données, intégrité, conformité)

Le fichier de référence consolidé est `supabase/schema.sql` (état migrations 001→024) ; les migrations 025→044 y ajoutent sécurité, échantillons, codes ICR, cron et parcours guidé. Ce document reflète l'**état réel** appliqué (BETA 1.10.0).

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
                        (hors-grappe, confirm_token)

app_config / grappe_config / module_config   → configuration (clé/valeur JSONB)
icr_codes                                      → référentiel valeurs pondérées
notification_config / _emails / _queue / _log → notifications email
envois_audit                                   → journal d'audit générique
```

---

## 2. Tables principales

### Référentiels

| Table | Rôle |
|---|---|
| `grappes` | Grappes de laboratoires (ex. « Grappe 1 — BSL-GAS »). `id, name, code, active` |
| `laboratories` | Laboratoires du réseau. Adresse complète, fax par département (`fax_bio_hema`, `fax_micro`, `fax_patho`, `fax_general`), `default_refrigerant`, `grappe_id` |
| `external_labs` | Laboratoires **externes** (destinataires HG), hiérarchie `parent_id`, `label_text` personnalisable |
| `icr_codes` | Référentiel des codes de valeurs pondérées (Workload). `code` (PK), `libelle`, `actif`, `ordre` |

### Configuration

| Table | Rôle |
|---|---|
| `app_config` | Configuration globale clé → valeur **JSONB** (`key` PK). Lisible aussi par `anon` |
| `grappe_config` | Configuration **par grappe** (miroir de `app_config`, scopé). `UNIQUE(grappe_id, key)` |
| `module_config` | Activation des **modules par laboratoire** : `module` ∈ {`bons_depart`, `hgrappe`, `gestion_echantillons`, `notifications`}, `active`, `config` JSONB. `UNIQUE(module, labo_id)` |

### Identité et autorisations

| Table | Rôle |
|---|---|
| `profiles` | Profil utilisateur (étend `auth.users`). `employee_id` (unique), `nom`, `labo_id`, `labo_ids[]` (legacy), `role` (CHECK : technicien / superviseur_labo / superviseur_grappe / admin), `must_change_password`, `is_test`, `theme`, **`tour_progress`** (JSONB, migration 042) |
| `user_lab_memberships` | Rôle **par labo** : `profile_id`, `labo_id`, `lab_role` ∈ {technicien, responsable}. `UNIQUE(profile_id, labo_id)` |

### Flux d'envois

| Table | Rôle |
|---|---|
| `envois` | Envois **intra-grappe**. Voir colonnes clés §3 |
| `envois_hgrappe` | Envois **hors-grappe** vers `external_labs`, avec `confirm_token` et champs de confirmation |
| `bons_depart` | Bon de départ (regroupement). `numero` (BD-YYYY-NNNN), `statut` ∈ {actif, récupéré, annulé} |
| `bons_depart_sections` | Une section par transporteur (`bon_connaissement`, `date_prise_en_charge`, `nom_transporteur_reel`) |
| `bons_depart_envois` | Liaison envoi ↔ bon (`type` intra/hg + CHECK garantissant un seul type renseigné) |

### Notifications

| Table | Rôle |
|---|---|
| `notification_config` | Ligne unique de paramètres (master, provider resend/smtp, SMTP host/port/user/from, fallback_email) |
| `notification_emails` | Adresses par labo × département (`dept_id` nullable → fallback labo puis global) |
| `notification_queue` | File d'attente. `type` ∈ {nc, lost, alarm, **alarm_r**, hg_nc, **hg_alarm**} (élargi migration 044), `details` JSONB, `sent_at`, `batch_id` |
| `notification_log` | Historique des emails envoyés (`status` sent/error, `queue_ids[]`) |

### Sécurité et audit

| Table | Rôle |
|---|---|
| `envois_audit` | Journal d'audit **générique** : `table_name`, `record_id`, `action` (INSERT/UPDATE/DELETE/ANNULATION), `old_data`/`new_data` JSONB, `changed_fields[]`, `changed_by_*` |
| `login_attempts` | Tentatives de connexion (anti brute-force, alimentée par edge function `auth-gate` / service_role) |
| `hg_confirm_attempts` | Tentatives échouées de confirmation HG par numéro (`reason` wrong_code/not_found) |
| `app_secrets_audit` | Audit des changements de secrets (vestige du dispositif Vault, voir note) |

> **Secrets applicatifs — état effectif.** La clé Resend (et `smtp_pass`) est stockée dans les colonnes `TEXT` de `notification_config` (migration `028`), protégées par RLS **admin-only**. La tentative précédente de stockage chiffré via **Supabase Vault** (migration `025`, RPC `set_app_secret` / `get_app_secret`, fonction `set-secret`) **n'a pas fonctionné** sur le plan Supabase utilisé (Vault non accessible via PostgREST) et a été **abandonnée** : les objets `025` / `app_secrets_audit` / `set-secret` subsistent mais sont inertes. La clé secrète Turnstile est configurée dans Supabase Auth (Attack Protection), pas en base.

---

## 3. Colonnes importantes des tables clés

### `envois` (intra-grappe)

| Colonne | Rôle |
|---|---|
| `numero` | Identifiant interne unique, **auto-généré** par trigger (`SILP-`/`HSILP-YYMMDD-NNNNN`) |
| `numeros_silp TEXT[]` | Listes de repérage physiques (index **GIN**). Vide ⇒ préfixe HSILP |
| `exp_labo_id` / `dest_labo_id` | Laboratoires expéditeur / destinataire |
| `temperature`, `transporteur` | `transporteur` **nullable** si module bons de départ actif (choisi à la création du bon) |
| `statut` | CHECK : En attente, En transit, Reçu, Problème, Perdu, **Annulé** |
| `type_specimen`, `glace_seche` | Spécimen (exempt / cat_b / cat_a) ; glace sèche |
| `echantillons_depart[]`, `echantillons_reception[]` | Codes-barres d'échantillons scannés (migration 035, index GIN) |
| `hors_corridor BOOLEAN`, `codes_icr TEXT[]` | Transport hors corridor + codes ICR calculés (migration 040, index GIN) |
| `annule_at`, `annule_par_id/nom`, `annule_note` | Annulation logique (soft delete, migration 019) |
| `ts_envoi`, `ts_recep` | Horodatages d'envoi / réception |

### `envois_hgrappe` (hors-grappe)

| Colonne | Rôle |
|---|---|
| `numero` | `HG-YYMMDD-NNNNN` (via `hgrappe_seq`) |
| `source` | `silp` / `hsilp` |
| `dest_ext_lab_id` | Destinataire externe |
| `confirm_token UUID` | Token unique de confirmation (URL publique / QR). Code de vérification = 6 premiers hex majuscules |
| `confirm_method` | `online` / `fax` |
| `confirm_conforme`, `confirm_nc_types[]`, `confirm_commentaire`, `confirm_recu_par`, `ts_confirm` | Résultat de la confirmation |
| `statut` | En attente, En transit, Reçu, Problème, Aucune réponse reçue |
| `echantillons_depart[]`, `hors_corridor`, `codes_icr[]` | Échantillons (035) + codes ICR (040) |

---

## 4. Numérotation des envois

Trois séquences PostgreSQL alimentent la numérotation :

| Séquence | Format | Généré par |
|---|---|---|
| `envoi_seq` | `SILP-YYMMDD-NNNNN` / `HSILP-YYMMDD-NNNNN` | Trigger `trg_envoi_numero` → `generate_envoi_numero()` (BEFORE INSERT sur `envois`) |
| `hgrappe_seq` | `HG-YYMMDD-NNNNN` | RPC `create_envoi_hgrappe()` (`nextval` explicite) |
| `bd_seq` | `BD-YYYY-NNNN` | RPC `create_bon_depart()` |

`generate_envoi_numero()` choisit le préfixe **automatiquement** : `HSILP-` si `numeros_silp` est vide, `SILP-` sinon. Les fonctions `peek_next_hsilp()` et `peek_next_hgrappe()` affichent le prochain numéro dans l'UI **sans consommer** la séquence (lecture de `last_value`/`is_called`).

---

## 5. Référentiel `icr_codes` (valeurs pondérées / Workload)

| `code` | `libelle` (état 1.10.0) | Déclencheur |
|---|---|---|
| `70008` | Glace sèche | `glace_seche = true` |
| `70009` | Envoi urgent en dehors des routes normales | `hors_corridor = true` |

> Le libellé de `70009` a été mis à jour en migration **041** (initialement « Transport hors corridor »).

La fonction `_compute_codes_icr(glace_seche, hors_corridor)` calcule le tableau `codes_icr` à l'insertion (appelée dans `create_envoi_hsilp` / `create_envoi_hgrappe`). La RPC `get_icr_stats(labo_id, days)` agrège les compteurs intra + HG par code pour les KPI.

---

## 6. Fonctions SQL notables (`SECURITY DEFINER`)

Ces fonctions s'exécutent avec les droits du propriétaire (nécessaire pour lire les memberships ou écrire l'audit sans exposer les données d'autrui). La plupart fixent `SET search_path = 'public'`.

| Fonction | Rôle |
|---|---|
| `current_role_name()` | Rôle système de l'utilisateur courant |
| `current_labo_id()` | Labo principal legacy |
| `current_labo_ids()` | **Tous** les labos accessibles (admin/grappe → tous actifs ; sinon memberships + repli `labo_ids`/`labo_id`). Socle de toutes les policies |
| `current_lab_role(labo_id)` | Rôle de l'utilisateur dans un labo (`responsable` d'office pour admin/grappe) |
| `is_module_active(module, labo_id)` | Module activé pour un labo |
| `generate_envoi_numero()` | Trigger : auto-numérotation `SILP-`/`HSILP-` |
| `create_envoi_hsilp(...)` | Création atomique d'un envoi sans liste (contrôle d'accès + échantillons + ICR) |
| `create_envoi_hgrappe(...)` | Création atomique HG, retourne `numero` + `token` |
| `get_envoi_hgrappe_by_token(token)` | Chargement public par token (page /confirm) |
| `get_envoi_hgrappe_by_numero(numero, code)` | Chargement public par numéro + code, **rate-limit 5 échecs/15 min** (`hg_confirm_attempts`) |
| `confirm_envoi_hgrappe(...)` | Confirmation publique ; insère dans `notification_queue` (type `hg_nc`) si non-conforme |
| `annuler_envoi(id, note)` | Annulation logique : contrôle créateur/responsable/superviseur, note obligatoire, écrit l'audit `ANNULATION` |
| `create_bon_depart(...)` / `add_envois_to_bon(...)` / `remove_envoi_from_bon(...)` / `cancel_bon_depart(...)` | Cycle de vie des bons de départ |
| `check_bon_completion(bon_id)` + triggers `trg_*_bon_completion` | Passage auto en `récupéré` |
| `get_labo_kpis(labo_id, days)` | KPI intra + HG (total, taux NC, transit moyen, flux quotidien) |
| `get_icr_stats(labo_id, days)` | Statistiques codes ICR |
| `set_app_secret` / `get_app_secret_status` / `list_app_secrets_status` / `get_app_secret` | RPC du dispositif Vault (migration 025) — **inertes** depuis l'abandon du Vault (voir note secrets) |
| `count_recent_login_failures` / `record_login_attempt` | Anti brute-force login (service_role only) |
| `_detect_alarm_envois()` | Détection SQL centralisée des alarmes (migration 044), planifiée par pg_cron |

**Durcissement `anon`** : la migration **043** révoque `EXECUTE` de `anon` sur toutes les fonctions non publiques. Seules restent accessibles à `anon` les fonctions du flux de confirmation : `get_envoi_hgrappe_by_token`, `get_envoi_hgrappe_by_numero`, `get_hg_confirm_cfg`, `confirm_envoi_hgrappe`.

**Cron (pg_cron + pg_net)** :

| Job | Planification | Action |
|---|---|---|
| `send-notifications-hourly` | `55 11 * * 1-5` (7h55 Montréal, jours ouvrables) | Appelle l'Edge Function `send-notifications` |
| `detect-alarm-envois` | `10,40 * * * *` (toutes les 30 min) | `_detect_alarm_envois()` : remplit la file avec `alarm_r`, `alarm`, `hg_alarm` (déduplication `NOT EXISTS`) |

---

## 7. Récapitulatif des migrations (025 → 044)

> Les migrations 012→024 (multi-labo, notifications, KPI, bons de départ, numérotation SILP, annulation, module_config, memberships, grappes) sont consolidées dans `schema.sql`. Rappel synthétique ci-dessous à partir de 025.

| # | Objet |
|---|---|
| 025 | `vault_app_secrets` — tentative de stockage des secrets dans **Supabase Vault** (abandonnée, voir 028) |
| 026 | `hg_confirm_rate_limit` — table `hg_confirm_attempts`, rate-limit confirmation HG |
| 027 | `login_attempts` — table + rate-limit login serveur (edge `auth-gate`) |
| 028 | `secrets_sans_vault` — **mécanisme effectif** : secrets en colonnes TEXT de `notification_config` (RLS admin) |
| 029 | `fix_hg_ratelimit_volatile` — correction volatilité de la fonction de rate-limit HG |
| 030 | `rls_cloisonnement_labo` — renforcement de l'isolation RLS par laboratoire |
| 031 | `security_searchpath_withcheck` — `search_path` fixe + clauses `WITH CHECK` |
| 032 | `fix_insert_withcheck` — corrections des politiques d'insertion |
| 033 | `fix_searchpath_withcheck_anon` — corrections search_path / WITH CHECK / anon |
| 034 | `metabase_readonly_role` — rôle PostgreSQL lecture seule pour Metabase |
| 035 | `echantillons_module` — colonnes `echantillons_depart`/`_reception`, RPC + `p_echantillons_depart`, index GIN |
| 036 | `cron_notifications` — pg_cron + pg_net, job horaire d'envoi des notifications |
| 037 | `cron_no_auth` — appel cron sans `service_role_key` (edge `--no-verify-jwt`) |
| 038 | `drop_trigger_fn` — suppression du wrapper `_trigger_send_notifications` (appel direct via dashboard) |
| 039 | `cron_reschedule_daily` — reprogrammation à `55 11 * * 1-5` (récapitulatif quotidien) |
| 040 | `icr_codes` — table `icr_codes`, colonnes `hors_corridor`/`codes_icr`, `_compute_codes_icr`, `get_icr_stats` |
| 041 | `icr_libelle_70009` — mise à jour du libellé du code 70009 |
| 042 | `tour_progress` — colonne `profiles.tour_progress` (JSONB) |
| 043 | `revoke_anon_execute` — révocation `EXECUTE` `anon` sur les fonctions non publiques |
| 044 | `cron_detect_alarms` — `_detect_alarm_envois()`, types `alarm_r`/`hg_alarm`, job cron 30 min |
| 045 | `metabase_ro_no_bypassrls` — retire `BYPASSRLS` du rôle `metabase_ro`, politiques `SELECT` explicites |

> Les migrations sont appliquées **manuellement** (SQL Editor / CLI), dans l'ordre numérique. Il n'y a pas de push automatique en production.

---

## 8. Row Level Security (résumé)

RLS activé sur **toutes** les tables du schéma `public`. Résumé des accès (détail complet dans `04-securite.md`) :

| Table | Lecture | Écriture |
|---|---|---|
| `envois` | exp/dest labo OU superviseur grappe/admin | INSERT si exp labo ; UPDATE si exp/dest labo |
| `envois_hgrappe` | exp labo OU grappe/admin | exp labo OU grappe/admin |
| `laboratories`, `external_labs` | Tous (authenticated) | Admin |
| `app_config` | authenticated **+ anon** | Admin |
| `grappe_config`, `module_config` | authenticated | Admin / superviseur_grappe |
| `profiles` | Soi-même + superviseurs du labo | Soi-même + superviseurs (hors comptes admin) |
| `user_lab_memberships` | Soi-même + superviseurs | Admin / superviseur_grappe |
| `notification_*` | Admin / superviseur_grappe | Admin |
| `login_attempts`, `hg_confirm_attempts` | Admin / grappe (lecture) | Via `SECURITY DEFINER` / service_role |
| `envois_audit` | authenticated | INSERT authenticated |

---

## 9. Index notables

- **GIN** : `envois.numeros_silp`, `envois.echantillons_depart`/`_reception`, `envois.codes_icr`, `envois_hgrappe.echantillons_depart`/`codes_icr`, `profiles.labo_ids`.
- **B-tree** : `envois.numero`, `envois.statut`, `envois.ts_envoi DESC`, `envois_hgrappe.confirm_token`, `envois.annule_at` (partiel `WHERE annule_at IS NOT NULL`).
- **Partiels** : `bons_depart_envois.envoi_id`/`hg_envoi_id` (`WHERE ... IS NOT NULL`), `notification_queue.created_at` (`WHERE sent_at IS NULL`).

---

## 10. Croissance et rétention

La table la plus sensible en volume est **`envois_audit`** (croissance ~438 MB/an à 200 envois/jour sans purge). Recommandation : cron mensuel `DELETE FROM envois_audit WHERE changed_at < now() - interval '1 year'`. `notification_log` et les tables anti-brute-force (`login_attempts`, `hg_confirm_attempts`) sont auto-purgées (opportunément ou par intervalle court). Analyse complète : voir **`CAPACITE_SUPABASE.md`** (bande passante, stockage, Realtime, plan Pro / PITR).

---

Dernière mise à jour : 2026-07-04 — BETA 1.10.0
