# Politique de sécurité

Merci de prendre le temps de signaler un problème de sécurité. Ce projet est maintenu par une
petite équipe : les délais ci-dessous sont indicatifs, mais chaque signalement est lu et traité.

## Signaler une vulnérabilité

Utilisez **exclusivement** le signalement privé de vulnérabilités de GitHub (*private
vulnerability reporting*) : onglet **Security** du dépôt, puis **Report a vulnerability** (page
*Advisories*). Le rapport n'est visible que des responsables du dépôt.

**N'ouvrez pas** d'issue, de discussion ni de pull request publique pour une vulnérabilité, et ne
la divulguez pas avant la publication d'un correctif. Aucune adresse courriel n'est prévue pour ces
signalements.

Merci d'indiquer, dans la mesure du possible :

- la nature du problème et son impact (ce qu'un attaquant peut lire, modifier ou faire) ;
- les étapes de reproduction, sur une instance locale, et une preuve de concept minimale ;
- la version ou le commit concerné ;
- toute condition préalable (rôle requis, configuration particulière).

Ne joignez **aucune donnée réelle** (renseignement personnel, identifiant, secret). Si vous avez eu
accès par inadvertance à des données qui ne vous appartiennent pas, arrêtez-vous, ne les conservez
pas et signalez-le dans le rapport : l'établissement doit pouvoir évaluer l'incident selon ses
obligations légales.

## Périmètre

**Dans le périmètre** — le code de ce dépôt :

- l'application web (`public/`), y compris la page publique de confirmation (`public/confirm/`) ;
- les fonctions Edge (`supabase/functions/`) ;
- le schéma de base de données (`supabase/schema.sql`) : droits des rôles, politiques RLS, fonctions ;
- les workflows et la configuration du dépôt (`.github/`, détection de secrets).

**Hors périmètre** :

- les plateformes tierces elles-mêmes (Supabase, Cloudflare, Resend, GitHub) : signalez-leur
  directement ;
- la clé **publiable** Supabase et la *sitekey* Turnstile présentes dans `public/js/config.js` :
  elles sont **publiques par conception** (la sécurité repose sur les droits, la RLS et la clé
  secrète Turnstile, qui n'est pas dans le dépôt) ;
- l'hameçonnage ou l'ingénierie sociale visant le personnel, l'accès physique à un poste ou à une
  session ouverte ;
- le déni de service et les tests de charge ;
- les en-têtes ou bonnes pratiques manquants sans impact démontrable, le *self-XSS* ;
- les vulnérabilités d'une librairie tierce sans chemin d'exploitation dans l'application.

**Règles de test** : testez **uniquement** sur votre propre instance (par exemple `schema.sql`
chargé sur un PostgreSQL local, ou la pile `supabase start`). N'effectuez **aucun** test, balayage
automatisé ni tentative de connexion contre une instance déployée de l'application : elle traite
des renseignements personnels d'un établissement de santé.

## Délais indicatifs

| Étape | Délai visé |
|---|---|
| Accusé de réception | 5 jours ouvrables |
| Première évaluation (validité, sévérité) | 15 jours ouvrables |
| Correctif — sévérité critique ou élevée | 30 jours |
| Correctif — sévérité moyenne | 90 jours |
| Correctif — sévérité faible | prochaine version |

Après le correctif, un avis de sécurité GitHub peut être publié ; vous y serez mentionné si vous le
souhaitez. Il n'y a pas de programme de récompense.

## Versions prises en charge

Seule la version la plus récente de la branche `main` reçoit des correctifs de sécurité.
