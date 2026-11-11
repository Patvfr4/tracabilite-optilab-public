# CLAUDE.md — optilab-envois

## Secrets

> **Ce projet n'utilise pas Phase.** La règle « Phase d'abord » et la migration
> vers Phase, en vigueur sur d'autres dépôts, **ne s'appliquent pas ici**. Ne
> signalez pas les secrets de ce dépôt comme « à migrer vers Phase », et ne
> considérez pas une tâche inachevée parce qu'un secret vit ailleurs que dans
> Phase.

### Règles — valables quel que soit le magasin

- **Aucun secret dans le dépôt** : pas de valeur réelle dans le code, la config,
  les tests, la doc, les `docker-compose` ni dans un `.env` suivi par Git. Seul
  un `.env.example` (noms sans valeurs) est versionné. Dans la documentation,
  toujours des gabarits `<…>` : jamais de vraie clé, de mot de passe ni d'URL
  contenant des identifiants — y compris pour la clé publiable et la sitekey,
  qui n'ont leur place que dans `public/js/config.js`.
- **Ne jamais afficher, journaliser ni recopier la valeur d'un secret** (code,
  commits, PR, sorties de commande, messages). Pour en parler, le citer par
  emplacement (`fichier:ligne`) ou par nom, jamais par valeur.
- **Un secret déjà versionné est compromis** : le faire tourner, pas seulement
  le retirer.
- **Lecture par variable d'environnement ou par accesseur serveur**, jamais en
  dur dans le code.
- **Détection** : le hook `pre-commit` (gitleaks) est la seule barrière AVANT
  la fuite ; le job CI « secrets » ne détecte qu'après le push. `.gitleaks.toml`
  ne sert jamais à masquer un vrai secret.

### Où vivent réellement les secrets de ce projet

| Secret | Magasin | Lu par |
|---|---|---|
| `RESEND_API_KEY`, `SMTP_PASS` | **Supabase Vault** (`vault.secrets`), saisis par un admin dans l'application (Configuration › Notifications) via les RPC `set_app_secret` / `delete_app_secret`. **Aucun repli** sur les variables d'environnement. | les fonctions Edge, par `get_app_secret()` (réservée à `service_role`) |
| `NOTIFY_TRIGGER_SECRET` | **Supabase Vault**, **généré par la base** (à l'installation, puis `rotate_notify_trigger_secret()` — bouton « Régénérer ») ; jamais saisi ni vu par un humain | le job pg_cron (`_trigger_send_notifications`, lecture du Vault) **et** `send-notifications` (`get_app_secret`) |
| Clés API Supabase **secrète** et **publiable** des fonctions | **Injectées par la plateforme** : `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS` (dictionnaires JSON, clé `default`) | les fonctions Edge (`supabase/functions/_shared/cles.ts`) |
| Clé **secrète** Turnstile | **Réglage du projet Supabase** : Authentication → Attack Protection → CAPTCHA | la plateforme, qui valide le jeton transmis par `auth-gate` |
| `SUPABASE_DB_URL` (sauvegarde) | **Secret GitHub Actions du dépôt PRIVÉ** ; rôle dédié en lecture seule `backup_reader` | `.github/workflows/db-backup.yml` uniquement |
| Mot de passe `postgres` de la base, mot de passe de `backup_reader` | gestionnaire de mots de passe de l'équipe (hors dépôt, hors GitHub) | console Supabase, CLI, sauvegarde |
| Clé **privée** `age` des sauvegardes | **hors ligne**, chez deux détenteurs ; seule la clé publique est dans la variable GitHub `BACKUP_AGE_RECIPIENT` | la restauration |
| Clé publiable Supabase, *sitekey* Turnstile | `public/js/config.js`, **en clair et c'est voulu** | le navigateur |

Les deux dernières sont **publiques par conception** : la sécurité repose sur la
RLS, pas sur le secret de la clé publiable. Ne pas les traiter comme des fuites.

Les anciens noms `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` et
`SUPABASE_DB_URL` (côté fonctions) ne sont plus lus par aucune fonction ; la
fonction `set-secret` et les colonnes `notification_config.resend_api_key` /
`smtp_pass` n'existent plus. Les *Edge Function Secrets* ne contiennent
**aucun** secret applicatif (seulement, au besoin, les **noms** facultatifs
`EDGE_SECRET_KEY_NAME` / `EDGE_PUBLISHABLE_KEY_NAME`).

Inventaire détaillé (propriétaire, rotation, impact, vérification) :
[`docs/architecture/04-securite.md` §5](docs/architecture/04-securite.md#5-secrets--clés).
Procédures de rotation, d'incident et de départ :
[`docs/deploiement/05-procedures-securite.md`](docs/deploiement/05-procedures-securite.md).
Toute modification d'un secret ou d'un magasin met à jour ces deux documents
**et** ce tableau.

## Base de données

`supabase/schema.sql` est l'**unique source de vérité**, maintenue à la main ;
il n'y a plus de migration de rattrapage (pas de dossier `supabase/migrations/` :
les anciennes migrations 001→060 ne vivent plus que dans l'historique git). Tout objet ajouté s'inscrit dans le bloc « Modèle de
privilèges » de `schema.sql` **et** dans les listes exactes de
`supabase/ci/verif_restauration.sql`.
