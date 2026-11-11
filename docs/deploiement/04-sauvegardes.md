# 04 — Sauvegardes de la base (pas à pas)

En plan **Free**, Supabase ne fournit **aucune** sauvegarde managée restaurable : le workflow
`.github/workflows/db-backup.yml` est la seule protection de la base. (En plan Pro, Supabase ajoute
une sauvegarde quotidienne conservée 7 jours, qui ne remplace pas une copie détenue par l'équipe.)

Ce que fait le workflow, chaque nuit à 4 h UTC et sur demande :

- se connecte par le **Session pooler** (IPv4, port 5432) avec un rôle **en lecture seule**
  `backup_reader`, jamais `postgres` ; TLS imposé (`sslmode=require`) ;
- refuse une URL qui viserait un autre projet que `SUPABASE_PROJECT_REF`, un autre hôte que
  Supabase, un autre rôle que `backup_reader`, un autre port que 5432, ou qui contiendrait des
  paramètres `?…` ;
- produit un dump `pg_dump -Fc` **sans données de session** (sessions, jetons de rafraîchissement,
  facteurs MFA, états de flux), le relit (`pg_restore --list`) et exige des tables dans `public`
  et des lignes réelles dans `auth.users` et `public.profiles` ;
- le **chiffre avec `age`** vers une ou plusieurs clés **publiques** ; le fichier clair ne quitte
  jamais le runner et est supprimé avant l'envoi ;
- conserve l'artifact chiffré **30 jours** ;
- en cas d'échec, ouvre une issue « Sauvegarde de la base en échec » (ou la complète si elle est
  déjà ouverte).

> Le workflow n'a de sens que dans le **dépôt privé**, seul détenteur du secret : il est **exclu
> de la copie publique** du dépôt, et sa première étape refuse de tourner si le dépôt est public
> (sur un dépôt public, tout utilisateur GitHub connecté peut télécharger les artifacts).
>
> Le dump contient des **renseignements personnels** (noms et N° d'employés, hachages de mots de
> passe, journal d'audit) : il n'existe en clair que sur le runner, puis sur le poste de confiance
> qui le restaure, le temps de la restauration.

---

## 1. Créer le rôle `backup_reader`

À faire une fois par projet, connecté en `postgres` avec **psql** (et non le SQL Editor, pour que
le mot de passe ne passe ni par l'historique de l'éditeur ni par les journaux de requêtes). La
chaîne de connexion `postgres` vient de *Connect* dans la console ; ne la collez dans aucun
fichier.

```sql
create role backup_reader login bypassrls;
grant pg_read_all_data to backup_reader;
alter role backup_reader set default_transaction_read_only = on;
\password backup_reader
```

- `pg_read_all_data` donne la lecture de toutes les tables ; `BYPASSRLS` est indispensable,
  sinon `pg_dump` échoue sur les tables protégées par la RLS ; les transactions sont en lecture
  seule par défaut. Le rôle **lit tout** (y compris `auth.users`) : son mot de passe est un
  secret de premier rang.
- `\password` demande le mot de passe deux fois, sans l'afficher, et n'envoie au serveur qu'une
  empreinte. **Générez-le dans le gestionnaire de mots de passe de l'équipe** : 32 caractères ou
  plus, **lettres et chiffres seulement** (il sera placé dans une URL ; un `@`, un `/` ou un `:`
  devrait y être encodé).
- Ce mot de passe n'est **jamais** écrit dans le dépôt, une migration, un ticket ou un message.

---

## 2. Générer et conserver les clés `age`

`age` chiffre la sauvegarde vers des clés **publiques** ; seule une clé **privée** la déchiffre.
Deux détenteurs désignés génèrent **chacun** leur paire, sur un poste de confiance :

```bash
age-keygen -o optilab-sauvegarde-<detenteur>.key
# Affiche « Public key: age1… » : c'est la seule partie à communiquer.
age-keygen -y optilab-sauvegarde-<detenteur>.key   # réaffiche la clé publique
```

- La **clé privée** (fichier `.key`) reste **hors ligne** : support chiffré ou coffre
  institutionnel, chez son détenteur. Jamais dans GitHub, jamais dans le dépôt (`*.key` et
  `*.age` sont ignorés par Git), jamais dans un courriel.
- Avec deux clés publiques déclarées, **l'un ou l'autre** détenteur peut restaurer seul.
- Perte d'une clé privée : générer une nouvelle paire et mettre à jour la variable (§3). Les
  sauvegardes déjà produites restent lisibles par l'autre clé.

---

## 3. Renseigner le secret et les variables GitHub (dépôt privé)

*Settings → Secrets and variables → Actions* :

| Nom | Type | Contenu |
|---|---|---|
| `SUPABASE_DB_URL` | **secret** | URL du **Session pooler** (console › *Connect* › *Session pooler*), utilisateur `backup_reader.<ref>`, port **5432**, sans paramètre : `postgresql://backup_reader.<ref>:<mot-de-passe>@<hôte-du-pooler>:5432/postgres` |
| `SUPABASE_PROJECT_REF` | variable | l'identifiant du projet (20 caractères) |
| `BACKUP_AGE_RECIPIENT` | variable | les clés **publiques** `age1…`, **une par ligne** |

- **Jamais** la connexion directe (`db.<ref>.supabase.co`, IPv6 seulement, injoignable depuis les
  runners GitHub) ni le mode *Transaction* (port 6543, inutilisable par `pg_dump`), et **jamais**
  le rôle `postgres`.
- Avec la CLI GitHub, la valeur du secret est demandée sans écho et ne finit pas dans
  l'historique du shell :

```bash
gh secret set SUPABASE_DB_URL                       # saisie interactive
gh variable set SUPABASE_PROJECT_REF --body "<ref>"
gh variable set BACKUP_AGE_RECIPIENT < destinataires-age.txt   # clés publiques, une par ligne
```

> Une clé **privée** collée par erreur dans `BACKUP_AGE_RECIPIENT` fait échouer le workflow
> avec un message explicite : la retirer, la considérer comme compromise et en générer une
> nouvelle.

---

## 4. Activer le workflow et vérifier le premier run

Le workflow est **désactivé** dans le dépôt privé tant que ce qui précède n'est pas fait.

```bash
gh workflow enable db-backup.yml
gh workflow run db-backup.yml
gh run watch                                       # suivre le run
gh run list --workflow db-backup.yml --limit 3
```

Vérifier dans le résumé du run le nombre de comptes et de profils, et la présence de l'artifact
`db-backup-<n>` (un fichier `optilab-AAAAMMJJ-HHMM.dump.age`). Puis faire le **test de
restauration** (§6) une première fois.

**Alerte.** Tout échec ouvre l'issue « Sauvegarde de la base en échec » avec les causes probables.
Tant qu'elle est ouverte, la base n'a peut-être **aucune** sauvegarde récente : corriger, relancer
le workflow, vérifier l'artifact, **puis** fermer l'issue. Si la cause est « dump sans données »
(base vidée ou mauvais projet), **télécharger d'abord le dernier artifact valide** avant qu'il
n'expire, puis enquêter.

**Limites.** Un workflow désactivé, un quota épuisé ou un run planifié abandonné n'ouvrent aucune
issue. Contrôler l'onglet *Actions* chaque mois (`06-infrastructure.md` §6.1) ; seule une
supervision externe (ping de réussite, « dead man's switch ») les détecterait. L'artifact vit dans
le même compte GitHub que le code : une copie hors site reste à mettre en place.

---

## 5. Restaurer

À faire sur un **poste de confiance**, par un détenteur de clé privée. Le fichier clair contient
des renseignements personnels : le supprimer dès la fin.

```bash
gh run download <id-du-run> -n db-backup-<n>        # dans les 30 jours
age --decrypt -i optilab-sauvegarde-<detenteur>.key -o optilab.dump optilab-AAAAMMJJ-HHMM.dump.age
pg_restore --list optilab.dump | head -50           # inventaire : schémas, tables, données
```

Ce qui **n'est pas** dans la sauvegarde, ou n'est pas réutilisable :

- **sessions, jetons de rafraîchissement, facteurs MFA** : exclus — après restauration, chacun se
  reconnecte (et se réenrôle si la MFA a été mise en place) ;
- **secrets du Vault** : présents mais chiffrés par la clé du projet **d'origine** ; sur un autre
  projet, ressaisir `RESEND_API_KEY` / `SMTP_PASS` dans l'application et régénérer
  `NOTIFY_TRIGGER_SECRET` (« Régénérer ») ;
- **réglages de console** (Auth, captcha, clés API, extensions) et **fonctions Edge** : à refaire
  selon [01-supabase.md](01-supabase.md).

**Restauration dans un nouveau projet Supabase** — démarche recommandée, à répéter à blanc lors
du premier test de restauration (les schémas gérés par Supabase, `auth` notamment, existent déjà
dans un projet neuf) :

1. construire le projet selon `01-supabase.md` §1 à §5 (extensions, `schema.sql`,
   `supabase_url`) **sans** exécuter `seed.sql` ;
2. vider les données de référence posées par `schema.sql`, que la sauvegarde contient aussi :
   `DELETE FROM public.icr_codes; DELETE FROM public.notification_config; DELETE FROM public.app_config;` ;
3. restaurer les **données seulement**, déclencheurs neutralisés pendant la copie (même méthode
   que le guide de restauration de Supabase : `session_replication_role = replica` dans la session
   psql), en `postgres`, en une seule transaction :

```bash
pg_restore --data-only --no-owner -n auth -t users -t identities -f donnees-auth.sql optilab.dump
pg_restore --data-only --no-owner -n public -f donnees-public.sql optilab.dump
psql "<chaîne de connexion postgres>" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'SET session_replication_role = replica' -f donnees-auth.sql -f donnees-public.sql
```

4. reposer `app_config.supabase_url` (§5 de `01-supabase.md`), ressaisir les secrets, rejouer le
   bloc d'état de `schema.sql` et les vérifications du §14 ;
5. supprimer `optilab.dump`, `donnees-auth.sql` et `donnees-public.sql` (renseignements personnels
   en clair).

---

## 6. Test de restauration (trimestriel)

But : prouver qu'une sauvegarde **se déchiffre et contient les données**, sans toucher à la
production. Sur un PostgreSQL 17 local jetable :

```bash
createdb optilab_test_restauration
pg_restore --no-owner --no-acl -d optilab_test_restauration optilab.dump
# Erreurs attendues et sans conséquence : objets des extensions propres à Supabase
# (vault, pg_net, pg_cron, graphql…) absentes d'un PostgreSQL ordinaire.
psql -d optilab_test_restauration -Atc "
  SELECT 'comptes='   || (SELECT count(*) FROM auth.users)
      || ' profils='  || (SELECT count(*) FROM public.profiles)
      || ' envois='   || (SELECT count(*) FROM public.envois)
      || ' hg='       || (SELECT count(*) FROM public.envois_hgrappe)
      || ' dernier='  || (SELECT max(created_at) FROM public.envois);"
dropdb optilab_test_restauration
rm optilab.dump
```

Comparer aux chiffres du résumé du run et à l'application ; consigner la date, le run et le
résultat dans le registre ([05-procedures-securite.md](05-procedures-securite.md) §1.3). Une fois
par an, faire la restauration complète du §5 dans un projet de test.

---

## 7. Rotation et changement de projet

| Événement | À faire |
|---|---|
| Rotation du mot de passe `backup_reader` (12 mois, départ, incident) | `\password backup_reader` (psql, en `postgres`) → mettre à jour le secret `SUPABASE_DB_URL` → `gh workflow run db-backup.yml` → vérifier l'artifact |
| Nouveau projet Supabase (reconstruction) | créer `backup_reader` sur le nouveau projet (§1) → mettre à jour **le secret ET** `SUPABASE_PROJECT_REF` → relancer et vérifier ; supprimer ensuite l'ancien projet |
| Nouveau détenteur de clé, clé privée perdue ou exposée | nouvelle paire `age` → mettre à jour `BACKUP_AGE_RECIPIENT` → relancer ; garder l'ancienne clé privée tant que des artifacts chiffrés pour elle existent (30 jours), puis la détruire — sauf si elle est exposée : supprimer alors aussi les artifacts concernés |
| Départ d'un détenteur | retirer sa clé publique de la variable, faire tourner le mot de passe `backup_reader` |

Rétention : **30 jours** (une trentaine de points quotidiens ; minimisation au sens de la Loi 25,
les comptes supprimés depuis restant dans les copies ; quota d'artifacts du dépôt privé). Un
historique plus long relève de la copie hors site.

---

*Dernière mise à jour : 2026-11-10 — rôle `backup_reader`, chiffrement `age`, alerte par issue*
