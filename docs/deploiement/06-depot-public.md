# 06 — Dépôt public (copie publiée)

Le code est publié sur **[Patvfr4/tracabilite-optilab-public](https://github.com/Patvfr4/tracabilite-optilab-public)**,
sans licence (tous droits réservés, voir le `README`).

| | Dépôt de travail (privé) | Dépôt public |
|---|---|---|
| Rôle | développement, revues, CI | consultation du code |
| Cloudflare Pages | branché dessus (déploiement de `main`) | non branché |
| Sauvegardes de la base (`db-backup.yml`) | oui, seul détenteur du secret | **jamais** (artifacts téléchargeables par tout utilisateur GitHub) |
| Historique | complet | un commit par publication, sans l'historique privé |
| Contributions (PR, issues) | — | non acceptées ; vulnérabilités par signalement privé (`SECURITY.md`) |

On ne développe **jamais** dans le dépôt public : chaque publication remplace son contenu par celui
du dépôt de travail.

---

## 1. Publier une version

Après la fusion dans `main` du dépôt de travail (le code publié est donc toujours relu et passé par
la CI) :

```bash
git fetch origin
python .github/scripts/publier_depot_public.py            # prépare et contrôle, ne pousse rien
python .github/scripts/publier_depot_public.py --pousser  # publie
```

Le script :

1. extrait l'arbre du commit `origin/main` (`--ref` pour un autre commit) : uniquement des fichiers
   suivis, jamais un fichier local, un `.env` ou un brouillon ;
2. retire les fichiers propres au dépôt privé : `.github/workflows/db-backup.yml`,
   `.github/dependabot.yml` (des PR Dependabot seraient sans suite sur une copie), `CLAUDE.md`
   (consignes de l'assistant de codage) et `docs/v2.md` (plan de travail interne de la V2) ;
3. retire de `.gitleaks.toml` l'allowlist d'un ancien commit privé, sans objet dans l'historique
   public ;
4. **s'arrête sans rien publier** si un chemin interdit (`memory/`, `.claude/`, migrations,
   `.env`, dumps, clés) ou un motif de secret (JWT, `sb_secret_`, clé Resend, URL Postgres avec
   mot de passe, clé privée age ou PEM, jeton GitHub, clé secrète Turnstile) est trouvé — sans
   jamais afficher la valeur ;
5. avec `--pousser` : ajoute **un commit** « Publication BETA x.y.z — date » sur `main` du dépôt
   public, signé avec l'adresse *noreply* de GitHub (jamais une adresse personnelle), et pousse
   **sans force**. Si rien n'a changé, il ne publie rien.

La CI du dépôt public (`ci.yml`) tourne sur ce commit : elle vérifie la copie telle que publiée
(gitleaks sur tout son historique, schéma, fonctions, client).

## 2. Réglages du dépôt public

À faire une fois, à la création du dépôt (*Settings*) :

- **Security › Private vulnerability reporting** : activé (c'est le canal de `SECURITY.md`) ;
- **Secret scanning** et **Push protection** : activés ;
- **Issues**, **Wiki**, **Projects** : désactivés ;
- **Actions › General** : « Require actions to be pinned to a full-length commit SHA » et liste
  blanche d'actions, comme pour le dépôt de travail ;
- **Rules** : ruleset sur `main` interdisant le force-push et la suppression.

## 3. Ce qui reste public quoi qu'il arrive

Une publication est définitive : copies, caches et archives tierces peuvent la conserver. Avant
chaque publication, rien ne doit y figurer qui ne puisse rester public indéfiniment : aucune
donnée réelle (captures comprises : ni QR, ni code de vérification, ni nom de patient ou
d'employé), aucun secret. Sont publics **par conception** : l'URL du projet Supabase, la clé
publiable et la sitekey Turnstile (`public/js/config.js`), servies de toute façon au navigateur.

Un secret publié par erreur est **compromis** : le faire tourner immédiatement
([05-procedures-securite.md](05-procedures-securite.md)) ; supprimer la publication ne suffit pas.

---

*Dernière mise à jour : 2026-11-11 — dépôt public repris à neuf, publication par script*
