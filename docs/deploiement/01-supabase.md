# 01 — Supabase Cloud (pas à pas)

Cette étape crée le projet, charge la base depuis `supabase/schema.sql`, règle Auth, déploie les
fonctions Edge et vérifie l'installation. Les tâches planifiées (pg_cron) et le secret qui protège
l'envoi des notifications sont **créés par le schéma** : il n'y a plus rien à saisir à la main dans
*Database → Cron*.

> **Projet neuf.** La base se construit **uniquement** depuis `supabase/schema.sql`, sur un projet
> vierge. Il n'y a pas de migration de rattrapage : les anciennes migrations ont été reportées dans
> `schema.sql`, puis retirées du dépôt.
>
> Partout ci-dessous, `<ref>` désigne l'identifiant du projet (20 caractères, visible dans l'URL du
> tableau de bord). Aucune valeur de clé ni de mot de passe ne doit être recopiée dans le dépôt :
> la liste des secrets et de leurs magasins est dans
> [`../architecture/04-securite.md` §5](../architecture/04-securite.md#5-secrets--clés).

## Ordre des opérations

| # | Étape | Où |
|---|---|---|
| 1 | Créer le projet (région Canada) | console |
| 2 | Relever l'URL et la clé publiable ; repérer la clé secrète | console › Settings › API Keys |
| 3 | Activer `pg_cron` et `pg_net` | console › Database › Extensions |
| 4 | Exécuter `schema.sql` d'un bloc | SQL Editor |
| 5 | Renseigner `app_config.supabase_url` | SQL Editor |
| 6 | Charger `seed.sql` (données de référence) | SQL Editor |
| 7 | Régler Auth (inscription fermée, mot de passe ≥ 12, captcha) | console › Authentication |
| 8 | Vérifier la publication Realtime | SQL Editor |
| 9 | Déployer les 4 fonctions Edge | CLI |
| 10 | Contrôler les tâches planifiées | SQL Editor |
| 11 | Créer le premier administrateur | console + SQL Editor |
| 12 | Saisir les secrets de courriel dans l'application | application › Configuration › Notifications |
| 13 | Désactiver les clés API héritées | console › Settings › API Keys |
| 14 | Vérifications finales | SQL Editor + CLI |
| 15 | Mettre en place la sauvegarde | voir [04-sauvegardes.md](04-sauvegardes.md) |

---

## 1. Créer le projet Supabase

1. Connectez-vous à [supabase.com/dashboard](https://supabase.com/dashboard) avec un compte
   **nominatif** protégé par MFA.
2. **New project** :
   - **Name** : `optilab-envois` ;
   - **Database Password** : généré, long, rangé **dans le gestionnaire de mots de passe de
     l'équipe** (jamais dans le dépôt, un ticket ou un message) ;
   - **Region** : **Canada (Central)** — exigence de résidence ; elle ne se change plus ensuite.
3. Patientez jusqu'à la fin du provisionnement.

---

## 2. Clés API et URL

Dans **Settings → API Keys** (onglet *Publishable and secret API keys*) :

| Élément | Forme | Usage |
|---|---|---|
| **Project URL** | `https://<ref>.supabase.co` | `public/js/config.js` (front) et `app_config.supabase_url` (§5) |
| **Clé publiable** `default` | `sb_publishable_<…>` | `public/js/config.js` — publique par conception, la sécurité repose sur les droits et la RLS |
| **Clé secrète** `default` | `sb_secret_<…>` | **rien à copier** : la plateforme l'injecte dans les fonctions Edge (`SUPABASE_SECRET_KEYS`). Elle contourne la RLS : jamais dans `public/`, jamais dans le dépôt |

Les fonctions Edge lisent **uniquement** les nouvelles clés (`SUPABASE_SECRET_KEYS`,
`SUPABASE_PUBLISHABLE_KEYS`, dictionnaires JSON dont la clé `default` est utilisée). Les clés
**héritées** (`anon` / `service_role`, au format JWT) ne servent plus à rien : elles seront
désactivées à l'étape 13, une fois les fonctions vérifiées.

> Le système de **clés de signature JWT** (rotation des clés qui signent les jetons des
> utilisateurs) est une migration distincte et facultative. Les fonctions valident les jetons
> auprès de Supabase Auth et n'utilisent pas la vérification JWT de la passerelle : elles n'en
> dépendent pas.

---

## 3. Activer les extensions — AVANT le schéma

**Database → Extensions** :

- `pg_cron` ;
- `pg_net` — à installer dans le schéma **`extensions`** (ses fonctions restent dans `net`, d'où
  l'appel `net.http_post`).

Sans elles, `schema.sql` se charge quand même, mais le bloc « Tâches planifiées » est **sauté**
(avertissement) : il faudra activer les extensions puis rejouer ce bloc seul (§10).

---

## 4. Charger le schéma

**SQL Editor** → nouvel onglet → coller **tout** `supabase/schema.sql` → *Run*.

- Le fichier s'exécute d'un bloc, sur une base **vierge** (PostgreSQL 17, rôle `postgres`). Il
  n'est pas rejouable en entier : seuls les blocs de fin (publication Realtime, données de
  référence, secret de déclenchement, tâches planifiées, état) le sont.
- Il crée tout le schéma `public` (tables, fonctions, RLS, déclencheurs, **modèle de
  privilèges**), la publication Realtime, les données de référence (codes ICR, ligne
  `notification_config` désactivée, clé `app_config.supabase_url` **vide**), le secret
  `NOTIFY_TRIGGER_SECRET` (généré dans le Vault, jamais affiché) et les 7 tâches planifiées.
- La **dernière ligne affichée** est l'état de l'installation :

| Colonne | Attendu |
|---|---|
| `extensions_ok` | `true` |
| `taches_planifiees` | `7 / 7` |
| `secret_ok` | `true` |
| `supabase_url_ok` | `false` à ce stade (étape suivante) |
| `prochaine_etape` | indique quoi faire |

Alternative en ligne de commande (même résultat) :
`psql "<chaîne de connexion>" -v ON_ERROR_STOP=1 -f supabase/schema.sql` — la chaîne vient de
*Connect* dans la console ; ne la collez dans aucun fichier.

---

## 5. Renseigner l'URL du projet pour le cron

Le job `send-notifications` appelle la fonction Edge à l'URL lue dans `app_config` (clé
`supabase_url`), livrée vide. Elle ne se règle **que dans le SQL Editor** : un déclencheur
(`_proteger_app_config`) la rend non modifiable depuis l'application, sinon un administrateur
applicatif pourrait détourner l'en-tête secret vers son propre serveur.

```sql
UPDATE public.app_config
   SET value = to_jsonb('https://<ref>.supabase.co'::text)
 WHERE key = 'supabase_url';
```

Puis relancer le contrôle d'état : les deux dernières instructions de `schema.sql` (bloc
« État de l'installation » : le `DO $etat$` puis le `SELECT`). Attendu : `Installation complète.`

> `public/js/config.js`, la CSP `connect-src` de `public/_headers` et `app_config.supabase_url`
> doivent viser **le même projet**. Après une reconstruction, mettez `config.js` à jour (voir
> [02-cloudflare-pages.md](02-cloudflare-pages.md) §5) avant d'ouvrir l'accès.

---

## 6. Données de référence

**SQL Editor** → exécuter `supabase/seed.sql` : les 16 laboratoires du réseau, la grappe BSL-GAS
(rattachement des laboratoires, initialisation de `grappe_config`) et la configuration de base.

> ⚠️ **Jamais de données de démonstration en production.** `seed_demo.sql`,
> `seed_demo_hgrappe.sql` et `seed_demo_users.sql` sont réservés à un projet de **développement**.
> `seed_demo_users.sql` crée 8 comptes `is_test` (dont un admin) avec un mot de passe **aléatoire
> par compte, affiché une seule fois** dans le résultat de la requête : le transmettre hors bande,
> il n'est stocké que haché. Aucun mot de passe de démonstration n'est écrit dans le dépôt ni dans
> la documentation.

---

## 7. Configurer l'authentification (console)

`supabase/config.toml` ne règle que la pile locale du CLI : la production se règle **à la main**
dans la console. Noter la date de vérification dans le registre (voir
[05-procedures-securite.md](05-procedures-securite.md)).

**Authentication → Sign In / Providers**

| Réglage | Valeur | Pourquoi |
|---|---|---|
| **Allow new users to sign up** | **désactivé** | les comptes ne sont créés que par `manage-user` (API admin, non concernée) ; une inscription publique fabriquerait un compte connecté sans profil |
| Allow anonymous sign-ins | désactivé | — |
| **Email provider** (*Enable Email provider*) | **activé** | c'est le fournisseur de la connexion par mot de passe : le désactiver bloquerait `auth-gate` |
| Confirm email | désactivé | adresses `{employee_id}@optilab.internal` fictives, aucun courriel n'arrive |
| Secure password change / *Require current password when updating* | **désactivés** | aucun courriel ne peut arriver, et le changement de mot de passe imposé n'envoie que le nouveau mot de passe |

**Mots de passe** (réglages du fournisseur Email)

| Réglage | Valeur |
|---|---|
| **Minimum password length** | **12** (même règle que le client et `manage-user`) |
| Password requirements | au minimum minuscules, majuscules et chiffres |
| Leaked password protection | à activer si le projet est en plan Pro (réservé au plan Pro) |

**Authentication → Sessions / JWT** : *JWT expiry* = `3600` s (1 h) — c'est aussi la durée
maximale de validité d'un jeton déjà émis après une désactivation.

**Authentication → Attack Protection → CAPTCHA protection**

1. **Activer**, fournisseur **Turnstile**.
2. **Secret key** : la clé **secrète** du widget Turnstile **de production** (créé à l'étape
   Cloudflare, [02-cloudflare-pages.md](02-cloudflare-pages.md) §7). La coller directement depuis
   Cloudflare, sans passer par un fichier.

> ⚠️ Ce réglage est **le seul contrôle qui couvre aussi un appel direct à `/auth/v1/token`**, qui
> ne passe pas par `auth-gate`. Ne **jamais** le désactiver, ni y régler la clé secrète **de test**
> de Cloudflare, pour faire fonctionner un poste de développement : la connexion locale n'est pas
> prise en charge tant qu'il n'existe pas de projet de développement distinct.

**Authentication → Multi-Factor** : vérifier que la TOTP est disponible (activée par défaut). Elle
n'est pas encore exigée par l'application (options : `04-securite.md` §10).

**Authentication → URL Configuration** : *Site URL* = l'adresse de production. Aucun flux par
courriel ne l'utilise aujourd'hui.

---

## 8. Realtime

La publication `supabase_realtime` est créée par `schema.sql`, réduite à deux tables en **listes
de colonnes**. N'activez **aucune** table depuis la bascule Realtime de la console : elle
publierait la table entière, `confirm_token` compris.

```sql
SELECT tablename, attnames FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- Attendu : envois {id,exp_labo_id,dest_labo_id} et envois_hgrappe {id,exp_labo_id}
```

Pour la reconstruire, rejouer le bloc `DO $pub$` de `schema.sql` (idempotent).

---

## 9. Déployer les fonctions Edge

Quatre fonctions dans `supabase/functions/`, plus le module partagé `_shared/` (téléversé
automatiquement avec chaque fonction qui l'importe) :

| Fonction | Rôle | Authentification (dans le code) |
|---|---|---|
| `auth-gate` | Point d'entrée du login : exige un jeton captcha, le transmet à Supabase Auth, vérifie que le profil existe et est actif | aucune (appelée avant connexion) |
| `manage-user` | Création, réinitialisation, (dés)activation des comptes ; changement de mot de passe imposé (`change_own_password`) | jeton utilisateur, profil actif, rôle |
| `test-notification` | Courriel de test depuis Configuration › Notifications | jeton utilisateur, admin actif |
| `send-notifications` | Envoi quotidien des récapitulatifs, appelé par pg_cron | en-tête `x-trigger-secret` comparé au Vault |

**`verify_jwt = false` pour les 4 fonctions** (figé dans `supabase/config.toml`) : avec les
nouvelles clés, la vérification de la passerelle accepte aussi une clé publiable — publique — et
n'authentifie donc pas l'appelant (doc Supabase) ; chaque fonction valide elle-même le jeton
auprès de Supabase Auth, ce qui refuse aussi un compte banni ou une session révoquée.

```bash
supabase login                                 # jeton personnel : à révoquer au départ de l'opérateur
supabase link --project-ref <ref>
supabase functions deploy auth-gate          --no-verify-jwt
supabase functions deploy manage-user        --no-verify-jwt
supabase functions deploy test-notification  --no-verify-jwt
supabase functions deploy send-notifications --no-verify-jwt
```

- `--no-verify-jwt` répète la valeur de `config.toml` ; le garder évite un écart si le fichier
  n'est pas lu. Un déploiement depuis le **tableau de bord** ignore `config.toml` : vérifier alors
  *Edge Functions → \<fonction\> → Settings → Enforce JWT Verification* = **désactivé**.
- Le déploiement ne lit ni `supabase/functions/deno.json` ni `deno.lock` : les versions des
  dépendances sont écrites en toutes lettres dans `_shared/clients.ts` (`npm:@supabase/supabase-js`
  en version exacte) et `_shared/courriel.ts` (denomailer). `deno.lock` sert à la CI.
- **Aucun Edge Function Secret à définir.** `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` et
  `SUPABASE_PUBLISHABLE_KEYS` sont injectés par la plateforme ; `RESEND_API_KEY`, `SMTP_PASS` et
  `NOTIFY_TRIGGER_SECRET` ne sont lus **que** dans le Vault. Seuls peuvent être posés, au besoin,
  les **noms** `EDGE_SECRET_KEY_NAME` / `EDGE_PUBLISHABLE_KEY_NAME` (rotation sans coupure, voir
  [05-procedures-securite.md](05-procedures-securite.md)).
- **CORS** : la liste des origines autorisées est commune (`supabase/functions/_shared/cors.ts`).
  Un nouveau domaine de connexion s'y ajoute, puis on redéploie `auth-gate`, `manage-user` et
  `test-notification`.

**Projet existant ou ancien projet à retirer** (sans objet sur un projet neuf) : supprimer la
fonction `set-secret`, qui n'existe plus dans le dépôt, et les anciens Edge Function Secrets,
désormais ignorés :

```bash
supabase functions delete set-secret --project-ref <ref>
supabase secrets unset RESEND_API_KEY SMTP_PASS NOTIFY_TRIGGER_SECRET --project-ref <ref>
supabase secrets list --project-ref <ref>      # noms seulement : rien d'applicatif ne doit rester
```

**Tests** (en local, aucun appel externe : simulacre de Supabase et de Resend sur 127.0.0.1) :

```bash
deno test --frozen --allow-env --allow-net=127.0.0.1 --allow-run --allow-read \
  --config supabase/functions/deno.json supabase/functions/tests/
```

---

## 10. Tâches planifiées (créées par le schéma)

`schema.sql` planifie 7 tâches (horaires UTC). La commande de chacune **ne contient aucun secret** :
le job d'envoi n'appelle qu'une fonction SQL, qui lit l'URL dans `app_config` et le secret dans le
Vault au moment de l'exécution.

| Tâche | Planification | Action |
|---|---|---|
| `send-notifications` | `55 11 * * 1-5` (7 h 55 à Montréal en heure avancée) | `_trigger_send_notifications()` → `send-notifications` |
| `detect-alarm-envois` | `10,40 * * * *` | `_detect_alarm_envois()` : met en file les alarmes (retard, potentiellement perdu, hors-grappe sans confirmation) |
| `purge-envois-audit` | `17 3 * * *` | journal d'audit au-delà de 12 mois |
| `purge-notifications` | `32 3 * * *` | file et journal des notifications au-delà de 90 jours |
| `purge-historique-cron` | `47 3 * * *` | `cron.job_run_details` au-delà de 30 jours |
| `purge-hg-confirm-attempts` | `52 3 * * *` | tentatives de confirmation hors-grappe au-delà de 24 h |
| `surveillance-notifications` | `0 14 * * 1-5` | chien de garde : alerte dans le journal des notifications si des envois attendent depuis plus de 30 h |

L'ancien job `send-notifications-hourly` (créé au tableau de bord, avec le secret en clair dans sa
commande) est retiré par le même bloc. **Ne créez aucun job dans *Database → Cron*.**

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;   -- 7 lignes, toutes actives
```

Si le bloc a été sauté (extensions absentes au chargement) : activer `pg_cron` et `pg_net`, puis
rejouer seul le bloc `DO $cron$` de `schema.sql`, puis le bloc d'état.

**Diagnostic d'un envoi** (sans jamais taper le secret) :

```sql
SELECT public._trigger_send_notifications();          -- déclenchement manuel, sous postgres
SELECT status_code, content, created
  FROM net._http_response ORDER BY created DESC LIMIT 3;   -- conservé 6 h par pg_net
```

`200` = correct · `403` = secret refusé · `503` = secret absent du Vault ou configuration
illisible. Les alertes `surveillance` apparaissent dans Configuration › Notifications (colonne
« Détail »). Aucun message n'est perdu : la file persiste tant que `sent_at` n'est pas posé.

---

## 11. Premier administrateur

1. **Authentication → Users → Add user → Create new user** :
   - courriel : `<employee_id>@optilab.internal`, **en minuscules** (exemple : `admin@optilab.internal`) ;
     le N° employé ne contient que des lettres, chiffres, `_`, `-` et `.` ;
   - mot de passe **temporaire** de 12 caractères ou plus, remis en main propre ;
   - cocher *Auto Confirm User*.
2. Relever l'UUID de l'utilisateur, puis dans le **SQL Editor** :

```sql
INSERT INTO public.profiles (id, employee_id, nom, role, active, must_change_password)
VALUES ('<uuid>', 'admin', 'Admin Système', 'admin', true, true);
```

À la première connexion (N° employé `admin`), l'application impose le changement du mot de passe
(un mot de passe identique au temporaire est refusé). Créer ensuite **au moins un second
administrateur** nominatif depuis l'application (Utilisateurs), pour ne jamais dépendre d'un seul
compte.

> Ne rattachez **jamais** un profil à un utilisateur Auth que vous n'avez pas créé vous-même : si
> une création échoue avec « déjà utilisé », supprimez l'utilisateur orphelin et recommencez.

---

## 12. Secrets de courriel (dans l'application)

Connecté en admin : **Configuration → Notifications** ([03-resend.md](03-resend.md)).

- **`RESEND_API_KEY`** ou **`SMTP_PASS`** : cartes *Définir / Remplacer / Supprimer*. La valeur
  part dans le Vault par la RPC `set_app_secret` ; elle n'est jamais réaffichée et le champ est
  vidé. Changer l'hôte, le port ou l'utilisateur SMTP **efface** `SMTP_PASS` : il faut le
  ressaisir.
- **`NOTIFY_TRIGGER_SECRET`** : section « Déclenchement automatique ». Il est déjà généré par le
  schéma (état « configuré ») ; « Régénérer » le remplace côté serveur, sans que personne ne le
  voie.

Ne passez **jamais** ces valeurs par la CLI (`supabase secrets set`), un fichier ou un message :
elles ne seraient pas lues.

---

## 13. Désactiver les clés API héritées

Une fois la connexion, la gestion des comptes et « Envoyer un test » vérifiés (§14) :
**Settings → API Keys → Legacy API keys → désactiver**.

- La doc Supabase indique qu'**aucun indicateur d'usage automatique** n'existe : la vérification
  est manuelle. Ici, aucun code du dépôt ne lit les clés héritées (aucune référence dans
  `supabase/functions/`, et `_shared/cles.ts` refuse une clé au format JWT), le navigateur
  n'utilise que la clé publiable, et aucun autre appelant n'est prévu.
- La désactivation est réversible, mais ne réactivez jamais une clé héritée qui aurait pu fuir :
  réactiver revient à revalider la clé compromise.

---

## 14. Vérifications finales

Le SQL Editor n'affiche que le résultat de la **dernière** requête d'un lot : exécutez les
requêtes ci-dessous **une par une**.

```sql
-- RLS activée partout (0 ligne attendue)
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;

-- anon n'exécute que les 4 RPC de /confirm
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
 ORDER BY 1;
-- Attendu : confirm_envoi_hgrappe, get_envoi_hgrappe_by_numero,
--           get_envoi_hgrappe_by_token, get_hg_confirm_cfg

-- Aucun privilège par défaut accordé aux rôles de l'API dans public, ni pour tous les
-- schémas (0 ligne attendue). Supabase garde ses propres droits par défaut dans le schéma
-- storage (service de fichiers, inutilisé ici) : ils sont normaux et exclus du contrôle.
SELECT d.defaclobjtype, a.grantee::regrole, a.privilege_type
  FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclrole = 'postgres'::regrole
   AND d.defaclnamespace IN (0::oid, 'public'::regnamespace::oid)
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole);

-- Aucune commande de tâche ne contient de secret (0 ligne attendue)
SELECT jobname FROM cron.job
 WHERE command ~* '(x-trigger-secret|authorization|bearer|sb_secret_|apikey)';

-- Secrets du Vault : NOMS et dates seulement, jamais decrypted_secrets
SELECT name, updated_at FROM vault.secrets ORDER BY name;

-- État de l'installation : rejouer le bloc final de schema.sql → « Installation complète. »
```

```bash
supabase functions list --project-ref <ref>
# Attendu : auth-gate, manage-user, send-notifications, test-notification (pas de set-secret)
```

Dans l'application : connexion d'un admin (captcha), création d'un compte puis changement de
mot de passe imposé, désactivation puis tentative de connexion refusée, « Envoyer un test ».
Le plan de recette détaillé est dans
[`../architecture/08-plan-de-recette.md`](../architecture/08-plan-de-recette.md).

Puis mettre en place la sauvegarde : [04-sauvegardes.md](04-sauvegardes.md).

---

*Dernière mise à jour : 2026-11-10 — reconstruction depuis `schema.sql`, nouvelles clés API, secrets dans le Vault, tâches planifiées versionnées*
