# Architecture & documentation d'audit — Traçabilité OPTILAB

> Dossier de référence pour les **auditeurs** (sécurité, conformité, revue technique) et
> les mainteneurs du projet **Traçabilité OPTILAB — BSL-GAS**.
> Version applicative documentée : **BETA 1.10.2** (chantier « secrets et durcissement », novembre 2026).

## Présentation rapide

Application SPA de suivi des envois inter-laboratoires (colis biologiques) pour le réseau
OPTILAB BSL-Gaspésie. Front statique HTML/CSS/JavaScript vanilla (aucun framework, aucun
build), backend **Supabase** (PostgreSQL + Auth + Realtime + Edge Functions), hébergement
**Cloudflare Pages**, courriels via **Resend**.

## Sommaire des documents

| # | Document | Contenu | Public visé |
|---|---|---|---|
| 01 | [Architecture de l'application](01-architecture-application.md) | Stack, structure du dépôt, flux, Realtime, modes Intra/Hors-grappe, environnements | Technique / audit |
| 02 | [Liste des fonctions](02-liste-des-fonctions.md) | Inventaire exhaustif des fonctions du frontend, par module | Technique |
| 03 | [Dépendances externes](03-dependances-externes.md) | Services tiers, librairies CDN et locales, Edge Functions | Audit / sécurité |
| 04 | [Sécurité](04-securite.md) | Authentification, privilèges et RLS, rôle anon, protection du login, **inventaire des secrets**, CSP, sauvegardes, options MFA | **Audit / sécurité** |
| 05 | [Base de données](05-base-de-donnees.md) | Modèle de données, tables, migrations, fonctions SQL | Technique / audit |
| 06 | [Infrastructure](06-infrastructure.md) | Options d'hébergement, comparatif, recommandations, comptes à maintenir | Décision / audit |
| 07 | [Capacité Supabase](07-capacite-supabase.md) | Estimation de volumétrie, bande passante, stockage | Exploitation |
| 08 | [Plan de recette](08-plan-de-recette.md) | Scénarios de test fonctionnels et contrôles de sécurité côté serveur | Qualité |
| 09 | [Audit & version alternative](09-audit-et-version-alternative.md) | Constats d'audit et leur statut (dont le chantier de novembre 2026), version alternative abandonnée | Audit |

Voir aussi : [../deploiement/](../deploiement/) (guides de déploiement pas à pas, sauvegardes, procédures de rotation, d'incident et de départ), [../../SECURITY.md](../../SECURITY.md) (signalement des vulnérabilités) et
[../../public/CHANGELOG.md](../../public/CHANGELOG.md) (journal des versions).

## ⚠️ Maintien de la documentation

Cette documentation doit être **mise à jour à chaque modification fonctionnelle ou de sécurité**
(nouvelle table/migration, nouveau module, changement de dépendance, mesure de sécurité).
Points de vigilance à synchroniser lors d'un changement :

- **Nouveau module / fonctionnalité** → `01-architecture-application.md`, `02-liste-des-fonctions.md`, `08-plan-de-recette.md`, et `public/CHANGELOG.md`.
- **Changement de base** → `supabase/schema.sql` (seule source ; tout objet ajouté s'inscrit dans le bloc « Modèle de privilèges » **et** dans les listes exactes de `supabase/ci/verif_restauration.sql`), `05-base-de-donnees.md` et, si sécurité, `04-securite.md`.
- **Secret ou magasin de secret** → inventaire de `04-securite.md` §5, tableau de `CLAUDE.md` (dépôt de travail), procédures de `../deploiement/05-procedures-securite.md`. Jamais de valeur réelle dans la documentation : gabarits `<…>` seulement.
- **Nouvelle dépendance (CDN, lib, service)** → version exacte + empreinte SRI (ou copie locale versionnée), `03-dependances-externes.md` **et** l'onglet « À propos » de l'application (`public/index.html`).
- **Changement de déploiement** (Supabase / Cloudflare / Resend) → `../deploiement/`.
- **Bump de version** → `public/index.html` (sidebar + À propos) et `public/CHANGELOG.md`. Le CHANGELOG est **servi publiquement** par l'application : entrées orientées utilisateurs, sans détail d'exploitation ; le détail technique de sécurité va dans `04-securite.md` §13.

---

*Dernière mise à jour : 2026-11-10 — chantier « secrets et durcissement »*
