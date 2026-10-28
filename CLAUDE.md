# CLAUDE.md — tracabilite-optilab-public

## Secrets — Phase

Les secrets de ce projet sont gérés dans **Phase**, instance auto-hébergée : https://phase.patvfr4.fr (console derrière Cloudflare Access, API sur `/service`). L'app Phase du projet porte le même nom que le dépôt, sauf mention contraire.

### Règles

- **Aucun secret dans le dépôt** : pas de valeur réelle dans le code, la config, les tests, la doc, les `docker-compose` ni dans un `.env` suivi par Git. Seul un `.env.example` (clés sans valeurs) est versionné.
- **Phase d'abord** : tout nouveau secret est créé dans Phase, dans le bon environnement (Development / Staging / Production), puis lu dans le code par variable d'environnement.
- **En local** : les secrets sont injectés par la CLI, `phase run <commande>` (ex. `phase run npm run dev`). Ne générer un `.env` (`phase secrets export`) que si un outil l'exige, et vérifier qu'il est ignoré par Git.
- **Secrets partagés entre apps** (clé HMAC, jeton de passerelle…) : un seul exemplaire dans l'app source, référencé ailleurs avec `${app::production.CLE}`, jamais copié. Les secrets HelloAsso vivent dans l'app `helloasso-gateway` ; une app cliente ne référence que ce dont elle a besoin (en général le HMAC).
- **Clés de signature et identifiants racine** : type *Sealed* dans Phase.
- **Ne jamais afficher, journaliser ni recopier la valeur d'un secret** (code, commits, PR, sorties de commande, messages).

### Migration en cours

Les secrets de ce projet doivent être migrés vers Phase. Tout secret trouvé ailleurs (`.env` local, valeur en dur, `docker-compose`, variables Coolify, secrets GitHub Actions, Cloudflare, Supabase…) doit être signalé puis migré :

1. le créer dans Phase, dans le bon environnement ;
2. faire lire la valeur par variable d'environnement injectée depuis Phase (CLI, intégration Phase ou synchronisation vers la plateforme) ;
3. supprimer l'ancienne copie, et faire tourner le secret s'il a déjà été versionné.

Une tâche n'est pas terminée si elle introduit ou laisse un secret hors de Phase.
