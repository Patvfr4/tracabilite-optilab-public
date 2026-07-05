# 03 — Resend (courriels de notification)

Cette étape configure l'envoi des courriels : non-conformités, envois perdus et alarmes. Elle n'est nécessaire que si le module **Notifications** est activé pour au moins un laboratoire.

Les courriels sont envoyés par l'Edge Function `send-notifications`, déclenchée par un **cron** (voir [01 — §8](01-supabase.md#8-planifier-les-crons-notifications--alarmes)). Le fournisseur par défaut est **Resend** (une alternative SMTP existe dans le code, mais ce guide couvre Resend).

---

## 1. Créer un compte Resend

1. Créez un compte sur [resend.com](https://resend.com). Le plan **Free** couvre 3 000 courriels/mois (voir `README.md` du projet).

---

## 2. Vérifier le domaine expéditeur (DNS)

Pour envoyer depuis une adresse `@votre-domaine`, Resend exige de vérifier le domaine.

1. Dans Resend : **Domains → Add Domain**, saisissez votre domaine expéditeur.
2. Resend fournit des enregistrements DNS à créer chez votre registraire / dans Cloudflare DNS :
   - **SPF** (TXT),
   - **DKIM** (CNAME ou TXT),
   - éventuellement **DMARC** (TXT).
3. Ajoutez-les, puis cliquez sur **Verify**. La propagation peut prendre quelques minutes.

> ⚠️ L'adresse **`from`** utilisée par les courriels vient du champ **`smtp_from`** de `notification_config` (réglé dans l'UI admin, `Configuration > Notifications`). Elle **doit appartenir à un domaine vérifié** dans Resend, sinon l'envoi est refusé. À défaut de configuration, le code retombe sur `OPTILAB <noreply@optilab.local>` (envoi) ou `onboarding@resend.dev` (test) — à ne pas utiliser en production.

---

## 3. Créer la clé API

1. Dans Resend : **API Keys → Create API Key**.
2. Nommez-la (ex. `optilab-prod`), portée d'envoi suffisante.
3. Copiez la clé (`re_…`) — elle n'est affichée qu'une fois.

---

## 4. Saisir la clé dans l'application (où elle est stockée)

**La clé API Resend se saisit dans l'interface admin**, pas dans un fichier ni via la CLI.

1. Connectez-vous en **admin**.
2. **Configuration → Notifications**.
3. **Fournisseur** : `Resend`.
4. Renseignez l'**adresse expéditeur** (`smtp_from`, ex. `OPTILAB <noreply@votre-domaine>`), sur un domaine vérifié à l'étape 2.
5. Ouvrez la carte **RESEND_API_KEY**, collez la clé `re_…`, enregistrez.

**Où finit la clé ?** L'UI écrit la valeur directement dans la colonne **`notification_config.resend_api_key`** (via un simple `UPDATE`). Cette table est protégée par une politique **RLS admin-only** : seul un profil `role = 'admin'` peut la lire ou l'écrire.

Les Edge Functions `send-notifications` et `test-notification` lisent la clé selon cet ordre de priorité (fonction `loadSecret`) :

1. **`notification_config.resend_api_key`** ← mécanisme utilisé par l'UI (migration 028), **seul chemin réellement alimenté** ;
2. **Vault** Supabase via `get_app_secret('RESEND_API_KEY')` (migration 025) — **abandonné, ne répond jamais** (Vault non accessible via PostgREST sur ce plan) ;
3. **`Deno.env.get('RESEND_API_KEY')`** (dernier fallback, alimenté par `supabase secrets set`).

> En pratique, la saisie dans l'UI admin (migration 028) suffit et constitue le seul mécanisme fonctionnel. La même mécanique s'applique à **`SMTP_PASS`** si vous utilisez le fournisseur SMTP au lieu de Resend.

> ⚠️ Sans clé configurée, `send-notifications` échoue par destinataire : l'entrée reste dans `notification_queue` et une ligne `status = 'error'` est écrite dans `notification_log`.

---

## 5. Activer les notifications (global + par labo)

Dans **Configuration → Notifications** :

- **Activer les notifications** (interrupteur global, `notification_config.enabled`). Si désactivé, `send-notifications` s'arrête immédiatement (`skipped: disabled`).
- **Types d'événements** à activer :
  - `enabled_nc` → non-conformités (couvre les types `nc` **et** `hg_nc`) ;
  - `enabled_lost` → envois perdus (`lost`) ;
  - `enabled_alarm` → alarmes « potentiellement perdu » (`alarm`).
- **Adresse de repli** (`fallback_email`) : reçoit un événement si aucune adresse ciblée labo/département ne correspond.

### Adresses par laboratoire / département

Table `notification_emails` (gérée dans l'UI) : chaque ligne associe un `labo_id`, un `dept_id` (ou `NULL` = tout le labo) et une adresse `active`. La résolution suit cet ordre : correspondance exacte labo+département → repli labo (`dept_id NULL`) → `fallback_email` global.

---

## 6. Événements et types de courriels

Les événements sont insérés dans `notification_queue` (par des triggers applicatifs ou par le cron de détection `_detect_alarm_envois`, migration 044). Types possibles :

| Type | Événement | Source |
|---|---|---|
| `nc` | Non-conformité intra-grappe | Signalement à la réception |
| `hg_nc` | Non-conformité hors-grappe | Confirmation non conforme (migration 020) |
| `lost` | Envoi déclaré perdu | Action utilisateur |
| `alarm` | Intra en transit au-delà du seuil « potentiellement perdu » (`alarm_days`) | Cron détection (044) + détection dans l'Edge Function |
| `alarm_r` | Intra en transit au-delà du seuil de **retard** (`alarm_hours`), avant le seuil P | Cron détection (044) |
| `hg_alarm` | Hors-grappe non confirmé au-delà de `hgrappe_alarm_days` | Cron détection (044) |

Le cron `send-notifications-hourly` regroupe les événements **par adresse destinataire** et envoie **un courriel récapitulatif** par destinataire (sujet `[OPTILAB] Rapport de notifications — N événement(s)`), en HTML + texte. Les entrées envoyées sont marquées `sent_at`, et `notification_queue` / `notification_log` sont **purgés au-delà de 90 jours**.

> ℹ️ Les types `alarm_r` et `hg_alarm` sont insérés dans la file par la migration 044, mais l'Edge Function actuelle ne les inclut dans les envois que via les types activés (`enabled_alarm` couvre `alarm`). Vérifiez le comportement attendu après montée de version si vous comptez sur `alarm_r`/`hg_alarm`.

---

## 7. Tester la configuration

1. **Configuration → Notifications → Envoyer un test** : saisissez une adresse, envoyez.
2. Cela appelle l'Edge Function **`test-notification`**, qui lit la clé Resend (même ordre de priorité qu'au §4) et envoie immédiatement un courriel « Email de test ».
3. Résultat :
   - Succès → vous recevez le courriel, une ligne `status = 'sent'` type `test` apparaît dans `notification_log`.
   - Échec → l'UI affiche l'erreur (ex. `RESEND_API_KEY non configurée`, domaine `from` non vérifié…), et `notification_log` porte `status = 'error'` avec le message.

### Déclencher l'envoi de la file manuellement

Pour tester le flux complet sans attendre le cron, appelez l'Edge Function `send-notifications` (déployée `--no-verify-jwt`) :

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/send-notifications" \
  -H "Content-Type: application/json" -d '{}'
```

Elle détecte les alarmes, envoie les récapitulatifs et renvoie un JSON `{ ok, batchId, sent, emails, results }`.

---

## 8. Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| `skipped: disabled` | Interrupteur global `enabled` désactivé (§5). |
| `RESEND_API_KEY non configurée` | Clé non saisie dans l'UI admin (§4). |
| Resend `403` / domaine refusé | Adresse `from` (`smtp_from`) sur un domaine non vérifié dans Resend (§2). |
| Courriels jamais envoyés mais file remplie | Cron `send-notifications-hourly` absent/inactif — vérifier `cron.job` (voir [01 — §8](01-supabase.md#8-planifier-les-crons-notifications--alarmes)). |
| Aucun destinataire | Aucune adresse dans `notification_emails` **et** `fallback_email` vide. |

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
