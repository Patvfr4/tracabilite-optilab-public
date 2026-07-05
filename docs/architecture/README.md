# Architecture & documentation d'audit — Traçabilité OPTILAB

> Dossier de référence pour les **auditeurs** (sécurité, conformité, revue technique) et
> les mainteneurs du projet **Traçabilité OPTILAB — BSL-GAS**.
> Version applicative documentée : **BETA 1.10.1**.

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
| 04 | [Sécurité](04-securite.md) | Authentification, RLS, rôle anon, protection login, secrets, CSP | **Audit / sécurité** |
| 05 | [Base de données](05-base-de-donnees.md) | Modèle de données, tables, migrations, fonctions SQL | Technique / audit |
| 06 | [Infrastructure](06-infrastructure.md) | Options d'hébergement, comparatif, recommandations, comptes à maintenir | Décision / audit |
| 07 | [Capacité Supabase](07-capacite-supabase.md) | Estimation de volumétrie, bande passante, stockage | Exploitation |
| 08 | [Plan de recette](08-plan-de-recette.md) | Scénarios de test fonctionnels | Qualité |

Voir aussi : [../deploiement/](../deploiement/) (guides de déploiement pas à pas) et
[../../public/CHANGELOG.md](../../public/CHANGELOG.md) (journal des versions).

## ⚠️ Maintien de la documentation

Cette documentation doit être **mise à jour à chaque modification fonctionnelle ou de sécurité**
(nouvelle table/migration, nouveau module, changement de dépendance, mesure de sécurité).
Points de vigilance à synchroniser lors d'un changement :

- **Nouveau module / fonctionnalité** → `01-architecture-application.md`, `02-liste-des-fonctions.md`, `08-plan-de-recette.md`, et `public/CHANGELOG.md`.
- **Nouvelle migration / table** → `05-base-de-donnees.md` (tableau des migrations) et, si sécurité, `04-securite.md`.
- **Nouvelle dépendance (CDN, lib, service)** → `03-dependances-externes.md` **et** l'onglet « À propos » de l'application (`public/index.html`).
- **Changement de déploiement** (Supabase / Cloudflare / Resend) → `../deploiement/`.
- **Bump de version** → `public/index.html` (sidebar + À propos) et `public/CHANGELOG.md`.

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
