# 05 — Procédures de sécurité (rotation, incident, départ, environnements)

Procédures d'exploitation, à suivre pas à pas. L'inventaire des secrets (magasin, consommateurs,
détenteurs) est dans [`../architecture/04-securite.md` §5](../architecture/04-securite.md#5-secrets--clés).
Aucune valeur de secret ne doit apparaître dans un ticket, un message, un commit ou un fichier :
on désigne un secret par son **nom**.

Sommaire :

1. [Rotation des secrets](#1-rotation-des-secrets)
2. [Fuite ou incident — avec les obligations de la Loi 25](#2-fuite-ou-incident--avec-les-obligations-de-la-loi-25)
3. [Départ d'un administrateur](#3-départ-dun-administrateur)
4. [Séparation développement / production (recommandée)](#4-séparation-développement--production-recommandée)

---

## 1. Rotation des secrets

### 1.1 Fréquences

| Élément | Rotation préventive | Rotation immédiate |
|---|---|---|
| `RESEND_API_KEY`, `SMTP_PASS` | 12 mois | départ d'une personne qui a saisi ou pu voir la valeur ; incident |
| Clé secrète Supabase (`sb_secret_…`) | 12 mois | départ d'un détenteur de la console ; incident |
| Clé secrète Turnstile | 12 mois | départ d'un détenteur du compte Cloudflare ; incident |
| Mot de passe `postgres` | — | départ d'un détenteur ; incident |
| Mot de passe `backup_reader` + secret `SUPABASE_DB_URL` | 12 mois | départ ; incident ; changement de projet |
| Clé privée `age` | — | départ d'un détenteur ; exposition |
| `NOTIFY_TRIGGER_SECRET` | facultative (aucune coupure) | incident |
| Jetons personnels (`supabase login`, `gh`) | expiration courte (90 jours au plus) | départ ; poste perdu |
| Clé publiable, sitekey Turnstile | publiques par conception | abus constaté seulement |

### 1.2 Fiches par secret

**`RESEND_API_KEY`** — aucune coupure.

1. Resend › *API Keys* › *Create API Key* : nom daté (`optilab-AAAAMM`), permission
   **Sending access**, restreinte au **domaine expéditeur vérifié**. La clé n'est affichée qu'une
   fois : la coller directement à l'étape 2, sans la stocker ailleurs.
2. Application, en admin : Configuration › Notifications › carte `RESEND_API_KEY` › *Remplacer*.
3. *Envoyer un test* → courriel reçu ; `notification_log` porte une ligne `sent` de type `test`.
4. Resend : relever la date de dernière utilisation des autres clés, puis **révoquer toutes les
   clés autres que la nouvelle** ; vérifier qu'aucun webhook inconnu n'existe.
5. Consigner au registre (§1.3).

**`SMTP_PASS`** (compte de service SMTP) — aucune coupure.

1. Avec l'équipe TI : changer le mot de passe du **compte de service** (jamais une boîte
   nominative).
2. Configuration › Notifications › carte `SMTP_PASS` › *Remplacer* ; *Envoyer un test*.
3. Rappel : changer l'hôte, le port ou l'utilisateur SMTP **efface** `SMTP_PASS` — le ressaisir
   ensuite.
4. Consigner au registre.

**`NOTIFY_TRIGGER_SECRET`** — aucune coupure (le cron et la fonction relisent le Vault à chaque
appel).

1. Configuration › Notifications › « Déclenchement automatique » › *Régénérer*.
   À défaut d'interface, dans le SQL Editor (en `postgres`) :
   `SELECT public._journaliser_secret('NOTIFY_TRIGGER_SECRET', public._vault_ecrire('NOTIFY_TRIGGER_SECRET', public._hex_aleatoire_32()));`
2. Vérifier : `SELECT public._trigger_send_notifications();` puis, quelques secondes plus tard,
   `SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 1;` → `200`.

**Clé secrète Supabase** — aucune coupure, grâce au nom de clé.

1. Console › *Settings › API Keys* › créer une **nouvelle clé secrète** nommée (ex.
   `fonctions-AAAAMM`).
2. *Edge Functions › Secrets* : poser `EDGE_SECRET_KEY_NAME` = **le nom** de cette clé (jamais
   sa valeur) — ou `supabase secrets set EDGE_SECRET_KEY_NAME=fonctions-AAAAMM --project-ref <ref>`.
3. Vérifier : connexion, création d'un compte de test puis désactivation, *Envoyer un test*,
   déclenchement manuel de l'envoi (fiche précédente, étape 2).
4. Supprimer l'**ancienne** clé secrète dans la console. Consigner au registre.

**Clé publiable** (rare : elle est publique) — créer la nouvelle, mettre à jour
`public/js/config.js` (déploiement du front) et `EDGE_PUBLISHABLE_KEY_NAME`, vérifier, supprimer
l'ancienne.

**Clé secrète Turnstile** — coupure possible de quelques instants.

1. Cloudflare › *Turnstile* › widget de production › faire tourner la clé secrète (utiliser la
   période de transition si Cloudflare la propose ; sinon, enchaîner l'étape 2 aussitôt, en
   dehors des heures d'activité).
2. Supabase › *Authentication › Attack Protection › CAPTCHA* : coller la nouvelle clé.
3. Vérifier : une vraie connexion réussit ; une connexion depuis un poste qui n'a que la sitekey
   de test est refusée.

**Mot de passe `postgres`** — aucun impact applicatif (les fonctions n'ont pas de connexion
directe). Console › *Database › Settings* › réinitialiser ; ranger le nouveau dans le gestionnaire
de mots de passe ; refaire `supabase link` sur les postes qui l'utilisent.

**`backup_reader` / `SUPABASE_DB_URL`, clé `age`** — voir [04-sauvegardes.md](04-sauvegardes.md) §7.

**Jetons personnels** — Supabase › *Account › Access Tokens* ; GitHub › *Settings › Developer
settings* et *Applications* : révoquer, recréer avec une expiration courte et la portée minimale.

**Clés héritées** (`anon` / `service_role`) — elles sont désactivées. Si l'une a fuité alors
qu'elle était encore active : les désactiver, puis suivre le guide Supabase « Rotate leaked API
keys » (révocation du secret JWT hérité au profit des clés de signature JWT).

### 1.3 Registre des rotations et vérifications

À tenir **hors du dépôt public** (espace documentaire de l'équipe), sans aucune valeur :

| Date | Élément | Motif (préventif, départ, incident) | Opérateur | Vérification faite | Ancienne valeur révoquée le |
|---|---|---|---|---|---|
| AAAA-MM-JJ | `RESEND_API_KEY` | préventif | (nom) | test reçu, `notification_log` = sent | AAAA-MM-JJ |

Y consigner aussi : la vérification des réglages Auth de la console (§7 de `01-supabase.md`), les
tests de restauration, et la revue semestrielle des membres et de la MFA des comptes tiers.

---

## 2. Fuite ou incident — avec les obligations de la Loi 25

À répéter une fois « à blanc ». Les données en cause sont des **renseignements personnels** au
sens de la Loi 25 : noms, numéros d'employés et rôles du personnel, hachages de mots de passe,
journal d'audit (qui a fait quoi, quand), adresses de notification, et des champs libres
(remarques, observations) qui peuvent contenir par inadvertance des renseignements de santé.

### 2.0 Préalables, à faire maintenant

- Connaître le **responsable de la protection des renseignements personnels (RPRP)** du CISSS et
  le **responsable de la sécurité de l'information** / la DRI, ainsi que la procédure interne de
  gestion des incidents de confidentialité de l'établissement (coordonnées tenues dans
  l'espace documentaire interne, pas dans ce dépôt).
- Savoir que les journaux de la plateforme sont conservés **1 jour** en plan Free (7 en Pro) :
  en cas de doute, **exporter d'abord**.

### 2.1 Qualifier (dans l'heure)

Quel secret ou quel compte, depuis quand, par quel canal (dépôt, message, poste, tiers) ? Qui
d'autre a pu y accéder ? Ouvrir une fiche d'incident datée (heure par heure).

### 2.2 Préserver les traces — avant toute modification

- Supabase : journaux *API*, *Auth*, *Edge Functions*, *Postgres* (Logs Explorer) ;
  `auth.audit_log_entries` si l'écriture en base est activée.
- Tables : `app_secrets_audit`, `envois_audit`, `login_attempts` (purgée à 7 jours),
  `hg_confirm_attempts` (24 h), `notification_log`, `cron.job`, `cron.job_run_details`.
- Resend : journaux d'envoi (30 jours) et liste des clés ; GitHub : *security log* du compte,
  historique des pushes et des workflows ; Cloudflare : historique des déploiements Pages.
- Ranger les exports dans un espace restreint : ils contiennent eux-mêmes des renseignements
  personnels.

### 2.3 Confiner : révoquer d'abord ce qui a fui, puis tout ce qu'il permettait d'atteindre

| Élément exposé | Confinement |
|---|---|
| Clé secrète Supabase | nouvelle clé + `EDGE_SECRET_KEY_NAME`, suppression de la clé exposée (§1.2) ; elle permettait `get_app_secret` → faire tourner `RESEND_API_KEY`, `SMTP_PASS`, régénérer `NOTIFY_TRIGGER_SECRET` ; chercher une persistance (§2.4) |
| Mot de passe `postgres` ou chaîne de connexion | réinitialiser ; accès complet (Vault, `auth.users`) → faire tourner Resend, SMTP, `NOTIFY_TRIGGER_SECRET`, `backup_reader` ; persistance (§2.4) |
| Mot de passe `backup_reader` / secret `SUPABASE_DB_URL` | `\password backup_reader`, mise à jour du secret ; lecture de toute la base possible → traiter comme une **atteinte à la confidentialité** de l'ensemble des données ; faire tourner Resend, SMTP, `NOTIFY_TRIGGER_SECRET` |
| Compte admin de l'application | le désactiver depuis un autre compte admin (bannissement + sessions révoquées) ; revoir `app_secrets_audit`, les changements de `profiles` (rôles, comptes créés, réinitialisations), de `notification_config` (hôte SMTP, expéditeur) ; faire tourner les secrets qu'il a saisis ou pu détourner |
| `RESEND_API_KEY` | révoquer chez Resend, nouvelle clé (§1.2) ; comparer les envois Resend des 30 derniers jours à `notification_log` |
| `SMTP_PASS` | changer avec la TI ; examiner les journaux d'accès du compte de service |
| Clé secrète Turnstile | rotation (§1.2) |
| Jeton personnel Supabase ou compte de la console | révoquer, sécuriser le compte (MFA) ; puis faire tourner **tous** les secrets du §1.1 ; vérifier fonctions déployées, réglages Auth, extensions |
| Compte ou jeton GitHub | révoquer ; revoir les pushes sur `main` et les workflows ; revenir au dernier déploiement Pages sain ; faire tourner `SUPABASE_DB_URL` |
| Compte Cloudflare | révoquer ; revoir déploiements, DNS, widget Turnstile ; rotation de la clé secrète Turnstile |
| Clé privée `age` | nouvelle paire ; si l'attaquant a aussi pu lire les artifacts, considérer les sauvegardes des 30 derniers jours comme divulguées et supprimer les artifacts |

### 2.4 Si un accès privilégié a été possible

- **Révoquer toutes les sessions** : dans le SQL Editor, `DELETE FROM auth.sessions;` (les jetons
  de rafraîchissement suivent ; chacun se reconnecte ; les jetons d'accès expirent en 1 h au plus).
- **Chercher une persistance** : comptes créés ou réactivés, rôles modifiés, mots de passe
  réinitialisés, nouveaux rôles PostgreSQL, fonctions, déclencheurs, policies ou `GRANT`
  ajoutés, tâches pg_cron, fonctions Edge redéployées, membres ajoutés aux comptes tiers.
  Comparer la base à `schema.sql` (les invariants de `supabase/ci/verif_restauration.sql` peuvent
  être relus à la main).

### 2.5 Obligations — Loi 25

Le CISSS est un **organisme public** : la Loi sur l'accès aux documents des organismes publics et
sur la protection des renseignements personnels (articles **63.8 à 63.11**, modifiés par la
Loi 25) et le **Règlement sur les incidents de confidentialité** s'appliquent. Si des
renseignements de santé ou de services sociaux sont touchés, la **Loi sur les renseignements de
santé et de services sociaux** (c. R-22.1, en vigueur depuis le 1er juillet 2024) prévoit un
régime analogue, avec un avis supplémentaire au ministre. La procédure interne du CISSS prime ;
ce qui suit en résume l'esprit, à valider avec le RPRP.

1. **Aviser sans délai le RPRP** et le responsable de la sécurité de l'information.
2. **Prendre les mesures raisonnables pour diminuer le risque** (le confinement du §2.3) et
   éviter qu'un incident de même nature se reproduise.
3. **Évaluer le risque de préjudice sérieux**, avec le RPRP, selon notamment : la **sensibilité**
   des renseignements, les **conséquences appréhendées** de leur utilisation, la **probabilité**
   qu'ils soient utilisés à des fins préjudiciables. Si l'absence d'accès ne peut pas être
   démontrée (journaux expirés), le cas est traité par défaut comme un incident de
   confidentialité.
4. **Si le risque est sérieux** : aviser **avec empressement** la **Commission d'accès à
   l'information** (même si l'information est incomplète, puis compléter), et **les personnes
   concernées** (sauf si cela risque d'entraver une enquête) ; d'autres personnes ou organismes
   susceptibles de réduire le risque peuvent aussi être avisés.
5. **Inscrire l'incident au registre des incidents de confidentialité** de l'établissement —
   **tout** incident, même sans risque de préjudice sérieux ; la CAI peut le consulter.

### 2.6 Après l'incident

Post-mortem (cause, chronologie, ce qui a manqué), mise à jour de l'inventaire
(`04-securite.md` §5), du registre des rotations et de ce document.

---

## 3. Départ d'un administrateur

### 3.1 Administrateur de l'application seulement

1. Un **autre** admin : Utilisateurs › le compte › **Désactiver**. Cette action bannit le compte
   dans Supabase Auth, le passe inactif et supprime ses sessions : il perd immédiatement tout
   pouvoir (un compte désactivé ne peut plus ni se réactiver, ni créer ou réinitialiser des
   comptes).
2. S'assurer qu'il reste **au moins deux** admins actifs.
3. Secrets : l'application ne réaffiche jamais un secret et `get_app_secret` est réservée au
   serveur. Mais une personne qui a **saisi** une valeur la connaît : consulter
   `list_app_secrets_status` (carte « dernier changement ») et `app_secrets_audit`, et faire
   tourner `RESEND_API_KEY` / `SMTP_PASS` s'il en est l'auteur ou s'il a pu les voir ailleurs.

### 3.2 Détenteur d'un accès aux consoles et aux comptes

En plus du §3.1 :

1. Le retirer de l'organisation Supabase, du compte Cloudflare, de l'équipe Resend, du dépôt et de
   l'organisation GitHub ; révoquer ses jetons personnels et ses autorisations d'applications.
2. Faire tourner : clé secrète Supabase, mot de passe `postgres`, `backup_reader` +
   `SUPABASE_DB_URL`, `RESEND_API_KEY`, `SMTP_PASS`, `NOTIFY_TRIGGER_SECRET`, clé secrète
   Turnstile ; s'il détenait une clé `age`, la retirer de `BACKUP_AGE_RECIPIENT`.
3. Liste de contrôle datée et signée, versée au registre.

### 3.3 Comptes tiers — règles permanentes

- Comptes **nominatifs** avec **MFA** sur Supabase, Cloudflare, Resend et GitHub ; **au moins
  deux propriétaires** par service. Ranger les codes de récupération dans le coffre
  institutionnel (pas un compte partagé).
- Inventaire des membres, de leur MFA, des jetons et des applications connectées (Cloudflare
  Pages, Dependabot, agent de codage) ; **revue semestrielle**.

---

## 4. Séparation développement / production (recommandée)

**État actuel.** Toutes les entrées de `public/js/config.js` — `localhost`, `127.0.0.1`,
`tests-deploiement.optilab-envois.pages.dev` et les entrées Render — visent **le même projet** que
la production. Conséquences :

- la connexion locale n'est **pas prise en charge** : `localhost` porte la sitekey Turnstile de
  test, que la clé secrète de production refuse (et c'est voulu) ;
- tout essai depuis ces adresses manipule des **données réelles** ;
- les seeds de démonstration et les captures d'écran n'ont pas d'environnement où être faits.

**Recommandation.**

1. **Local** : la pile `supabase start` (Docker), configurée par `supabase/config.toml` (inscription
   fermée, mot de passe ≥ 12, captcha absent : le jeton factice de la sitekey de test y est
   ignoré). Y charger `schema.sql`, `seed.sql` et les seeds de démonstration ; servir les
   fonctions avec `supabase functions serve` (gabarit `supabase/functions/.env.example`, noms
   seulement). Pointer `localhost` et `127.0.0.1` de `config.js` sur cette pile.
2. **Préproduction** (`tests-deploiement`, Render de développement) : un **projet Supabase
   distinct** (plan Free, région Canada), installé selon `01-supabase.md`, avec des **données
   synthétiques** seulement et la **paire de clés Turnstile de test** de Cloudflare dans son
   réglage CAPTCHA. Ses propres secrets (clé Resend de test, ou notifications désactivées).
3. Cloudflare Pages : limiter les déploiements de préversion aux branches voulues et les fermer
   au public (*Enable access policy*, Cloudflare Access gratuit jusqu'à 50 utilisateurs).

**Règles, avec ou sans séparation :**

- ne **jamais** régler la clé secrète Turnstile de test sur le projet de production, ni y
  désactiver le CAPTCHA ;
- ne **jamais** exécuter les seeds de démonstration sur la production ;
- ne faire **aucune** capture d'écran montrant un QR, un code de vérification, un jeton, une URL
  de confirmation ou une donnée réelle.

---

*Dernière mise à jour : 2026-11-10 — procédures du chantier « secrets et durcissement »*
