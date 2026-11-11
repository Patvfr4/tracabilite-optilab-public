# 03 — Resend ou SMTP (courriels de notification)

Cette étape configure l'envoi des courriels : non-conformités, envois perdus et alarmes. Elle n'est nécessaire que si le module **Notifications** est activé pour au moins un laboratoire.

Les courriels sont envoyés par la fonction Edge `send-notifications`, déclenchée par la **tâche planifiée** `send-notifications` créée par `schema.sql` (voir [01 — §10](01-supabase.md#10-tâches-planifiées-créées-par-le-schéma)). Deux fournisseurs : **Resend** (par défaut) ou un **relais SMTP** institutionnel.

---

## 1. Créer un compte Resend

Compte **nominatif** avec MFA, partagé entre au moins deux détenteurs. Le plan **Free** couvre 3 000 courriels/mois, largement assez pour le réseau.

---

## 2. Vérifier le domaine expéditeur (DNS)

Pour envoyer depuis une adresse `@votre-domaine`, Resend exige de vérifier le domaine. Préférer un **sous-domaine dédié aux notifications** (ex. `notifications.<domaine>`) plutôt que le domaine principal de l'établissement : une clé d'envoi fuitée ne permettrait d'usurper que ce sous-domaine.

1. Dans Resend : **Domains → Add Domain**, saisissez le domaine expéditeur.
2. Créez chez le registraire / dans Cloudflare DNS les enregistrements fournis : **SPF** (TXT), **DKIM** (CNAME ou TXT), et de préférence **DMARC** (TXT).
3. **Verify**. La propagation peut prendre quelques minutes.

> ⚠️ L'adresse **`from`** vient du champ **`smtp_from`** de `notification_config` (Configuration › Notifications). Elle **doit appartenir à un domaine vérifié**, sinon l'envoi est refusé. À défaut de configuration, le code retombe sur une adresse générique, à ne pas utiliser en production.

---

## 3. Créer la clé API

1. Resend : **API Keys → Create API Key**.
2. Nom daté (ex. `optilab-AAAAMM`) ; permission **Sending access** (jamais *Full access*, qui permettrait de créer d'autres clés et de lire l'historique des courriels) ; restreinte au **domaine expéditeur vérifié**. Le code n'utilise que l'envoi (`POST /emails`).
3. La clé `re_…` n'est affichée qu'une fois : la coller **directement** à l'étape suivante, sans la stocker dans un fichier ni un message.

---

## 4. Saisir la clé dans l'application

**La clé se saisit dans l'interface d'administration**, jamais par la CLI ni dans un fichier : les fonctions ne lisent **que** le Vault.

1. Connectez-vous en **admin**.
2. **Configuration → Notifications**.
3. **Fournisseur** : `Resend`.
4. **Adresse expéditeur** (`smtp_from`, ex. `OPTILAB <noreply@notifications.votre-domaine>`), sur un domaine vérifié.
5. Carte **`RESEND_API_KEY`** → **Définir** (ou *Remplacer*) → coller la clé → **Enregistrer**. Le champ est vidé aussitôt ; la carte affiche « configuré », l'auteur et la date, jamais la valeur.

**Où finit la clé ?** L'interface appelle la RPC `set_app_secret('RESEND_API_KEY', …)`, réservée à un administrateur actif, qui l'enregistre **chiffrée dans le Supabase Vault** et journalise l'action (sans la valeur) dans `app_secrets_audit`. `send-notifications` et `test-notification` la lisent par `get_app_secret()`, réservée au serveur (`service_role`). Il n'y a **aucun repli** sur les variables d'environnement : une valeur posée par `supabase secrets set` serait ignorée.

**Supprimer** la clé (carte › *Supprimer*) la retire du Vault : les envois échouent ensuite proprement jusqu'à une nouvelle saisie.

### Variante SMTP

1. **Fournisseur** : `SMTP` ; renseigner hôte, port, utilisateur et `smtp_from`.
2. Carte **`SMTP_PASS`** → *Définir* → mot de passe du **compte de service** SMTP (jamais une boîte nominative : un mot de passe d'annuaire personnel donnerait accès bien au-delà de l'application).
3. ⚠️ Changer ensuite l'**hôte**, le **port** ou l'**utilisateur** SMTP **efface** `SMTP_PASS` (l'interface demande confirmation) : il faut le ressaisir. C'est voulu : le mot de passe est lié à sa destination et ne peut pas être redirigé vers un autre serveur.

> Sans clé (ou mot de passe) configurée, chaque envoi échoue : l'entrée reste dans `notification_queue` et une ligne `status = 'error'` est écrite dans `notification_log`, avec un message qui invite à la saisir.

---

## 5. Activer les notifications (global + par labo)

Dans **Configuration → Notifications** :

- **Activer les notifications** (interrupteur global, `notification_config.enabled`, désactivé à l'installation). Si désactivé, `send-notifications` s'arrête immédiatement (`skipped: disabled`).
- **Types d'événements** :
  - `enabled_nc` → non-conformités (`nc` et `hg_nc`) ;
  - `enabled_lost` → envois perdus (`lost`) ;
  - `enabled_alarm` → les trois alarmes : retard (`alarm_r`), potentiellement perdu (`alarm`), hors-grappe sans confirmation (`hg_alarm`).
- **Adresse de repli** (`fallback_email`) : reçoit un événement si aucune adresse ciblée labo/département ne correspond.

La section **« Déclenchement automatique »** montre l'état de `NOTIFY_TRIGGER_SECRET`, le secret qui authentifie la tâche planifiée auprès de `send-notifications`. Il est **généré par la base** à l'installation ; personne ne le saisit ni ne le voit. *Régénérer* le remplace côté serveur, sans coupure.

### Adresses par laboratoire / département

Table `notification_emails` (gérée dans le modal du laboratoire) : chaque ligne associe un `labo_id`, un `dept_id` (ou `NULL` = tout le labo) et une adresse `active`. Résolution : correspondance exacte labo+département → repli labo (`dept_id NULL`) → `fallback_email` global.

---

## 6. Événements et types de courriels

Les événements sont insérés dans `notification_queue` par la base (RPC `queue_envoi_notification`, confirmation publique, tâche de détection `detect-alarm-envois`) :

| Type | Événement | Source |
|---|---|---|
| `nc` | Non-conformité intra-grappe | Signalement à la réception |
| `hg_nc` | Non-conformité hors-grappe | Confirmation non conforme (en ligne ou fax) |
| `lost` | Envoi déclaré perdu | Action utilisateur |
| `alarm_r` | Intra en transit au-delà du seuil de **retard** (`alarm_hours`) | Tâche `detect-alarm-envois` (toutes les 30 min) |
| `alarm` | Intra au-delà du seuil « potentiellement perdu » (`alarm_days`) | idem |
| `hg_alarm` | Hors-grappe non confirmé au-delà de `hgrappe_alarm_days` | idem |

La tâche `send-notifications` (jours ouvrables, 11 h 55 UTC) regroupe les événements **par adresse destinataire** et envoie **un courriel récapitulatif** par destinataire (HTML + texte). Les entrées envoyées sont marquées `sent_at` ; la file et le journal sont purgés au-delà de 90 jours (tâche `purge-notifications`).

**Chien de garde.** Si des notifications de types activés attendent depuis plus de 30 h (tâche absente, secret, fonction, fournisseur en panne…), la tâche `surveillance-notifications` écrit une alerte de type « Alerte système » dans le journal des notifications (Configuration › Notifications, colonne « Détail »). Le courriel étant justement le canal en panne, l'alerte ne passe pas par lui.

---

## 7. Tester la configuration

1. **Configuration → Notifications → Envoyer un test** : saisissez une adresse, envoyez.
2. La fonction **`test-notification`** (admin actif uniquement) lit la clé dans le Vault et envoie immédiatement un courriel de test.
3. Résultat :
   - succès → courriel reçu, ligne `status = 'sent'` de type `test` dans `notification_log` ;
   - échec → l'interface affiche l'erreur (clé non configurée, domaine `from` non vérifié, refus du fournisseur…).

### Déclencher l'envoi de la file manuellement

Sans jamais manipuler le secret : dans le **SQL Editor** (rôle `postgres`), exécuter la même fonction que la tâche planifiée, puis lire la réponse :

```sql
SELECT public._trigger_send_notifications();
SELECT status_code, content, created
  FROM net._http_response ORDER BY created DESC LIMIT 1;
```

Réponse attendue : `200` avec `{ ok, batchId, sent, recipients, errors }` (des compteurs, jamais d'adresses). `403` = secret refusé ; `503` = secret absent du Vault ou configuration illisible.

---

## 8. Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| `skipped: disabled` | Interrupteur global désactivé (§5). |
| « clé non configurée » dans le journal | `RESEND_API_KEY` / `SMTP_PASS` absent du Vault (§4) — ou effacé après un changement d'hôte, de port ou d'utilisateur SMTP. |
| Resend `403` / domaine refusé | `smtp_from` sur un domaine non vérifié (§2). |
| File remplie mais rien n'est envoyé ; alerte « surveillance » | Tâche `send-notifications` absente ou inactive (`SELECT jobname, active FROM cron.job`), `app_config.supabase_url` vide, ou fonction en erreur : voir [01 — §10](01-supabase.md#10-tâches-planifiées-créées-par-le-schéma). |
| Aucun destinataire | Aucune adresse dans `notification_emails` **et** `fallback_email` vide. |

---

*Dernière mise à jour : 2026-11-10 — secrets saisis dans l'application et stockés dans le Vault, déclenchement versionné*
