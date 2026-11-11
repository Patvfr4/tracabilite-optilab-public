# Document de Référence d'Infrastructure
## OPTILAB Traçabilité — Réseau BSL-GAS

---

| Champ | Valeur |
|---|---|
| **Projet** | OPTILAB Traçabilité inter-laboratoires |
| **Date** | 2026-05-09 — révisé le 2026-11-10 |
| **Statut** | Soumis pour approbation |
| **Préparé par** | Équipe OPTILAB |

---

## Résumé exécutif

OPTILAB Traçabilité est une application web permettant aux laboratoires de la grappe de **suivre en temps réel les envois de spécimens biologiques** entre établissements. Elle remplace les processus manuels (papier, fax) par une interface numérique centralisée accessible depuis tout navigateur.

L'application ne contient **aucune donnée de santé patient nominative**. Elle enregistre des données de logistique opérationnelle (numéros de liste de repérage, laboratoires expéditeurs et destinataires, températures de transport, transporteurs, horodatages) et des **renseignements personnels du personnel** (nom, numéro d'employé, rôle, journal des actions), protégés au sens de la Loi 25.

Ce document présente le fonctionnement de l'application, les options d'infrastructure envisagées et les éléments requis pour assurer la pérennité du projet. Il est soumis à la DRI pour approbation avant déploiement à l'ensemble du réseau.

---

## 1. Fonctionnement global de l'application

### 1.1 Qui l'utilise et comment

L'application est accessible par navigateur web (Chrome, Firefox, Edge, Safari), sans installation sur les postes de travail. Chaque utilisateur se connecte avec son numéro d'employé et un mot de passe.

**Quatre niveaux d'accès :**

| Rôle | Accès | Typiquement |
|---|---|---|
| **Technicien** | Créer et réceptionner des envois de son labo | Technicien de laboratoire |
| **Responsable** | Modifier ou annuler tout envoi de son labo | Responsable des envois du laboratoire |
| **Superviseur grappe** | Accès à tous les labos, historique complet, KPI | Coordinateur réseau / Équipe qualité |
| **Administrateur** | Configuration complète, gestion des utilisateurs | Équipe projet OPTILAB / responsable OPTILAB |

### 1.2 Fonctionnalités principales

**Mode intra-grappe (entre laboratoires de la grappe)**
- Création d'un envoi : sélection du laboratoire destinataire, température de transport, numéro(s) de liste SILP, type de spécimen
- Réception : scan ou saisie du numéro → confirmation ou signalement d'un problème
- Suivi en temps réel : les envois apparaissent sur les postes des laboratoires concernés immédiatement
- Alertes automatiques : notification visuelle si le délai de transit dépasse le seuil configuré
- Impression du bordereau de transport (plusieurs formats selon les besoins du labo)

**Mode hors-grappe (vers laboratoires externes)**
- Envoi vers un laboratoire hors réseau avec impression d'un formulaire bilingue (F-G-74)
- Confirmation de réception par le destinataire : via une page web publique (QR code) ou par fax
- Suivi des confirmations en attente avec alerte si aucune réponse reçue

**Bons de départ (module optionnel par laboratoire)**
- Regroupement de plusieurs envois dans un bon de transport unique
- Assignation du transporteur au moment de la création du bon
- Impression du bon et suivi de la prise en charge

**Tableau de bord KPI (superviseurs et administrateurs)**
- Volume d'envois sur 30, 60 ou 90 jours
- Taux de non-conformité
- Transit moyen en heures
- Graphique de volume quotidien

**Notifications par courriel (module optionnel par laboratoire)**
- Envoi automatique d'un courriel lorsqu'un envoi est signalé comme problème ou déclaré perdu
- Envoi automatique si une confirmation hors-grappe est non conforme
- Alerte groupée quotidienne pour les envois en transit depuis trop longtemps
- Adresses courriel configurables par laboratoire et par département (biochimie, hématologie, microbiologie, pathologie)
- Adresse de secours globale si aucune adresse de département n'est configurée
- Historique des 50 derniers courriels envoyés visible dans la configuration

**Configuration (administrateurs)**
- Gestion des laboratoires, transporteurs, températures, types de spécimen
- Activation des modules par laboratoire
- Configuration des notifications par courriel (provider et adresses)
- Personnalisation de l'interface (nom de l'application, messages, couleurs)

### 1.3 Données manipulées

L'application ne traite **aucun renseignement personnel de patient** par conception. Elle traite en revanche des **renseignements personnels du personnel** (au sens de la Loi 25), et certains champs libres (remarques, observations de non-conformité) peuvent en contenir par inadvertance : ils doivent être traités avec le même soin.

Les données enregistrées :

| Type de donnée | Exemples | Catégorie |
|---|---|---|
| Identification des envois | Numéro de liste SILP, numéro interne | Opérationnelle |
| Laboratoires | Nom, adresse, numéro de fax | Organisationnelle |
| Conditions de transport | Température (2-8°C, ambiant, congelé), transporteur | Opérationnelle |
| Horodatages | Date/heure d'envoi, de réception | Opérationnelle |
| Utilisateurs | Nom d'employé, numéro d'employé, rôle, labo, empreinte du mot de passe | **Renseignements personnels** (Loi 25) |
| Audit | Qui a créé/modifié quoi, quand | Traçabilité interne — **renseignements personnels** |
| Champs libres | Remarques d'envoi, observations de non-conformité | Opérationnelle — à ne jamais utiliser pour des renseignements de patient |

> L'application traite des **numéros de liste de repérage SILP** (numéros générés par SoftLabMic au moment de la mise en transit), pas des numéros de dossiers patients. La corrélation avec des données de santé requiert l'accès à SoftLabMic.

### 1.4 Flux d'une journée type

```
Matin
  Technicien Lab A  →  Crée un envoi (SILP + température)
                    →  Imprime le bordereau
                    →  Remet à l'agent de transport

En cours de journée
  Application       →  Surveille les délais de transit
                    →  Génère une alerte si dépassement

À réception
  Technicien Lab B  →  Scanne ou saisit le numéro
                    →  Confirme la réception (ou signale un problème)
                    →  La mise à jour est visible instantanément sur tous les postes
```

---

## 2. Architecture technique (vue d'ensemble)

L'application repose sur **quatre composants cloud**, tous gérés en mode service :

```
┌─────────────────┐       ┌──────────────────────────────────┐
│  Navigateur web │──────▶│  Hébergement web (Cloudflare)    │
│  (postes CISSS) │       │  Fichiers HTML/CSS/JS statiques  │
└─────────────────┘       └────────────────┬─────────────────┘
                                           │
                                           ▼
                          ┌──────────────────────────────────┐
                          │  Base de données & services      │
                          │  (Supabase — ca-central-1,       │
                          │   Montréal, Québec)              │
                          │  - PostgreSQL (données)          │
                          │  - Auth (connexion utilisateurs) │
                          │  - Realtime (temps réel)         │
                          │  - Fonctions serveur             │
                          └────────────────┬─────────────────┘
                                           │ (notifications seulement)
                                           ▼
                          ┌──────────────────────────────────┐
                          │  Service courriel (Resend        │
                          │  ou SMTP institutionnel)         │
                          │  Envoi des alertes aux labos     │
                          └──────────────────────────────────┘
```

Il n'y a **pas de serveur applicatif traditionnel** à maintenir. Le frontend est un ensemble de fichiers web statiques. Toute la logique métier, la sécurité et la gestion des données sont assurées par la plateforme Supabase.

**Connexions réseau :**
- Poste client → hébergement web : HTTPS (port 443)
- Hébergement web → base de données : HTTPS (port 443)
- Base de données → service courriel : HTTPS (port 443) — uniquement lors de l'envoi de notifications
- Aucun port non standard, aucun VPN requis pour les utilisateurs finaux

**Note sur les notifications :** Le service de courriel est le **seul composant optionnel**. Les laboratoires qui n'activent pas les notifications par courriel n'utilisent pas ce service. Il peut être remplacé par un serveur SMTP institutionnel pour garder les flux courriel en interne.

---

## 3. Options d'infrastructure

Deux options d'hébergement managé sont présentées (A et B). Une section dédiée détaille ensuite, à titre d'analyse, les modifications qu'impliquerait un hébergement **100 % VPS auto-géré** — nettement plus lourd, en particulier pour les fonctions serveur (Edge Functions).

---

### Option A — Supabase Cloud + Cloudflare Pages *(situation actuelle)*

**Description**
L'application est hébergée sur deux plateformes cloud spécialisées :
- **Cloudflare Pages** : sert les fichiers web statiques depuis un réseau de diffusion mondial (CDN)
- **Supabase Cloud** : fournit la base de données PostgreSQL, l'authentification, le temps réel et les fonctions serveur

Les deux fournisseurs proposent une **région canadienne**. Chez Supabase il s'agit de `ca-central-1` — « Canada (Central) » dans la nomenclature AWS, soit **Montréal, au Québec**, et non Toronto. Les données au repos demeurent donc sur le territoire québécois, ce qui dépasse l'exigence de résidence canadienne.

> ⚠️ **Deux précisions indispensables avant de s'appuyer sur ce paragraphe.**
>
> **1. La région se choisit à la création du projet et ne se change pas ensuite.** La déplacer impose de créer un nouveau projet et d'y migrer les données. La région proposée par défaut au moment de la création est `us-east-1` (Virginie), marquée « RECOMMENDED » dans l'interface. La région réelle du projet de production est donc à vérifier (Dashboard → Project Settings → General → Region) avant toute affirmation de résidence.
>
> **2. La région du projet ne couvre que les données au repos.** Les Edge Functions s'exécutent par défaut dans la région la plus proche de l'appelant, et non dans celle de la base — or `auth-gate` traite des numéros d'employé et des mots de passe, `manage-user` des profils et des rôles, `send-notifications` des adresses courriel des destinataires. L'en-tête de réponse `x-sb-edge-region` indique où une invocation s'est réellement exécutée. La région peut être épinglée via l'en-tête `x-region`, le paramètre `forceFunctionRegion` (requêtes CORS et webhooks, où l'en-tête n'est pas contrôlable) ou l'option `region` du client supabase-js. À mesurer, puis à épingler ou à documenter explicitement avant le déploiement réseau.

**Coûts estimés**

| Composant | Coût | Notes |
|---|---|---|
| Supabase | 0 $ (Free) → 25 USD/mois (~35 CAD) Pro | Plan Pro recommandé en production |
| Supabase PITR *(optionnel)* | +100 USD/mois (~140 CAD) | **Add-on payant, non inclus dans le plan Pro** — voir la note ci-dessous |
| Cloudflare Pages | 0 $ | Aucun coût additionnel |
| Resend (courriel) | **0 $** — Plan Free | 3 000 courriels/mois, 100/jour — largement suffisant pour le réseau BSL-GAS |
| Nom de domaine personnalisé | ~20 CAD/an | Optionnel — le sous-domaine Cloudflare est gratuit |
| **Total mensuel estimé** | **0 $ à ~35 CAD/mois** | 0 $ en plan Free · ~35 CAD avec Plan Pro Supabase · ~175 CAD si le PITR est exigé |

> Le volume de notifications attendu pour le réseau BSL-GAS (quelques dizaines de courriels par mois) est très largement inférieur à la limite du plan Free de Resend. **Aucun abonnement payant Resend n'est prévu.**

> **Sur les sauvegardes et le PITR.** Les trois niveaux ne se valent pas et le choix a un effet direct sur le coût :
>
> | Plan | Sauvegardes fournies |
> |---|---|
> | Free | **Aucune sauvegarde managée restaurable.** Supabase recommande des exports autonomes conservés hors site |
> | Pro (25 USD) | Sauvegarde quotidienne, rétention glissante de 7 jours — la base seulement |
> | PITR | **Add-on à ~100 USD/mois** par tranche de 7 jours de rétention, disponible sur Pro et Team uniquement |
>
> Exiger le PITR porte donc l'Option A à ~175 CAD/mois, soit **au-dessus de l'Option B (Azure, ~130 CAD)** : la comparaison de coûts du §4 s'inverse. **Recommandation : ne pas souscrire le PITR.** Pour un registre de logistique sans donnée patient, où chaque envoi produit un bordereau papier permettant de reconstituer une journée, ramener le RPO de 24 h à quelques minutes ne justifie pas 140 CAD/mois. La sauvegarde quotidienne par `pg_dump` (`.github/workflows/db-backup.yml`, **dépôt privé**) couvre le besoin **une fois mise en place** sur le projet reconstruit : rôle dédié en lecture seule, dump validé puis **chiffré avec `age`**, conservé 30 jours, alerte par issue en cas d'échec ([../deploiement/04-sauvegardes.md](../deploiement/04-sauvegardes.md)). ⚠️ Avant ce chantier, le secret de sauvegarde visait un ancien projet : la base de production n'avait **aucune** sauvegarde. Vérifier l'artifact après chaque changement de projet. Limites restantes au §6.4.

**Avantages**

| ✅ Avantage | Détail |
|---|---|
| Mise en œuvre rapide | Opérationnel en quelques heures — aucune infrastructure à provisionner |
| Coût très faible | ~35 CAD/mois tout inclus (Supabase Pro + Resend en plan Free) |
| Pas de gestion serveur | Mises à jour, sécurité, disponibilité gérées par les fournisseurs |
| SLA Pro | 99,9 % de disponibilité garanti (Plan Pro Supabase) |
| Résidence Canada | Région `ca-central-1` — données au repos à **Montréal (Québec)**, sous réserve des deux précisions ci-dessus |
| Certifications fournisseur | Supabase : SOC 2 Type II, ISO 27001 |
| Backup automatique | Plan Pro : quotidienne, rétention 7 jours. **Plan Free : aucune** — couverte par le `pg_dump` nocturne chiffré du dépôt privé, à activer après chaque (re)construction |
| Notifications flexibles | Resend (cloud) ou SMTP institutionnel — au choix |

**Inconvénients**

| ⚠️ Inconvénient | Détail |
|---|---|
| Dépendance fournisseurs | L'application dépend de Supabase, Cloudflare et Resend (pour les notifications) |
| Données courriel hors Canada | Resend est basé aux États-Unis — logs des courriels sur serveurs US. Contenu : adresse destinataire + description de l'incident, dont le champ libre « Observation ». Remplaçable par un SMTP institutionnel si requis. |
| Coût de sortie | Migration vers une autre infrastructure requiert un effort technique |
| Connaissance spécifique | Supabase est relativement récent — expertise moins répandue que AWS/Azure |

---

### Option B — Microsoft Azure Canada *(cloud souverain)*

**Description**
L'application et sa base de données sont redéployées sur les services Microsoft Azure hébergés en région **Canada Central (Toronto)**. Cette option utilise les services Azure suivants :
- **Azure Database for PostgreSQL** : base de données managée
- **Azure App Service** ou **Azure Static Web Apps** : hébergement du frontend
- **Azure Active Directory B2C** : gestion des identités (remplacerait Supabase Auth)

> Cette option implique un **re-développement partiel** de l'application pour s'interfacer avec les services Azure au lieu de Supabase. 
**Coûts estimés**

| Service Azure | Estimation mensuelle |
|---|---|
| Azure Database for PostgreSQL (Flexible Server, B2ms) | ~80 CAD |
| Azure Static Web Apps | ~15 CAD |
| Azure Active Directory B2C | ~15 CAD (1 000 MAU inclus gratuit) |
| Backup et stockage | ~20 CAD |
| **Total estimé** | **~130 CAD/mois** |

**Avantages**

| ✅ Avantage | Détail |
|---|---|
| Région Canada garantie | Azure Canada Central — hébergement confirmé Montréal/Toronto |
| Écosystème connu | Azure est largement utilisé dans le réseau de la santé québécois |
| SLA fort | 99,99 % garanti sur les services managés |
| Conformité | Azure est certifié SOC 2, ISO 27001, HIPAA, et dispose de clauses spécifiques santé |
| Support Microsoft en français | Disponible |

**Inconvénients**

| ⚠️ Inconvénient | Détail |
|---|---|
| Coût plus élevé | ~130 CAD/mois vs ~37 CAD (Option A) |
| Re-développement requis | L'application devra être adaptée — délai et coût supplémentaires |
| Complexité accrue | Gestion des services Azure, IAM, réseau virtuel — expertise Azure requise |
| Verrouillage propriétaire | Dépendance aux services Microsoft (moins portable que l'open source) |
| Délai de mise en œuvre | 2 à 4 mois pour re-déploiement et adaptation |

---

### Hébergement auto-géré — deux voies très inégales

Il existe **deux façons** de quitter Supabase Cloud pour une infrastructure auto-gérée, et elles n'ont ni le même coût ni le même risque. La première est de loin la plus réaliste ; la seconde n'a de sens que si l'on refuse d'exploiter la pile Supabase elle-même.

#### Voie 1 *(recommandée)* — Supabase auto-hébergé

Supabase est open source et publie une **pile auto-hébergée officielle**, déployée par un unique `docker compose up -d` depuis le répertoire `supabase/docker` du dépôt amont. Elle contient PostgreSQL, **GoTrue**, **PostgREST**, **Realtime**, Storage et **edge-runtime** — c'est-à-dire le même runtime Deno que celui des Edge Functions en cloud. Les services sont exposés derrière une passerelle aux **mêmes chemins que ceux utilisés aujourd'hui** : `/auth/v1/`, `/rest/v1/`, `/realtime/v1/`, `/functions/v1/`.

Conséquences pour la présente application :

| Composant | Modification requise |
|---|---|
| `schema.sql`, les policies RLS, les fonctions PL/pgSQL, `pg_cron`, `pg_net`, le Vault | **Aucune** |
| Les 4 Edge Functions Deno | **Aucune** — runtime identique |
| Frontend (`public/`) | `supabaseUrl` dans `public/js/config.js` ; les listes `ALLOWED_ORIGINS` des fonctions si le domaine change |
| Services inutilisés | Storage, imgproxy et Logflare peuvent être retirés du `docker-compose.yml` — l'application n'en utilise aucun |

Dimensionnement annoncé par Supabase : **4 Go de RAM et 2 cœurs au minimum**, 8 Go et 4 cœurs recommandés pour la pile complète. Sur un VPS en territoire canadien (Beauharnois au Québec, Toronto), cela représente un ordre de grandeur de 25 à 50 CAD/mois — soit le prix du plan Pro.

C'est donc **la seule option procurant une souveraineté totale sans réécrire une seule ligne de logique métier**. Son coût réel n'est pas technique mais opérationnel : perte du PITR managé et du SLA, prise en charge des mises à jour de sécurité de l'OS et des conteneurs, et surtout — cf. la ligne « départ du développeur principal » du §6.4 — **une pile Docker à exploiter représente bien plus de connaissance institutionnelle à maintenir qu'un tableau de bord**. C'est ce point, et non la difficulté de mise en œuvre, qui doit arbitrer la décision.

> Prérequis commun aux deux voies : la base doit être **reconstructible depuis le dépôt**. Le constat N-2 de [09-audit-et-version-alternative.md](09-audit-et-version-alternative.md) avait établi qu'elle ne l'était plus, et ce par hasard. `supabase/schema.sql` est désormais l'**unique source de vérité** ; le job CI « schema.sql sur Postgres vierge » le charge à chaque modification et vérifie les invariants de sécurité, droits exacts compris ; `supabase/ci/supabase_shim.sql` recense et fournit les dépendances à la plateforme Supabase (rôles, privilèges par défaut, schéma `auth`, API du Vault, publication `supabase_realtime`).

#### Voie 2 — Reconstruction service par service

À n'envisager que si l'exploitation de la pile Supabase est elle-même écartée. Il faut alors **reconstituer chaque service**, et plusieurs composants demandent un travail d'adaptation réel. Cette liste recense les modifications à prévoir.

**Pile à reconstituer (aujourd'hui fournie par Supabase Cloud) :**

| Service Supabase | Rôle | Sur VPS — à mettre en place |
|---|---|---|
| PostgreSQL | Base de données | Installer PostgreSQL + extensions `pg_cron` et `pg_net` (le schéma n'utilise que `gen_random_uuid()` pour l'aléa) et une implémentation du Vault ; appliquer `schema.sql`, seule source |
| GoTrue (Auth) | Authentification JWT, comptes, sessions | Déployer GoTrue **ou** remplacer (Keycloak, Auth.js…) — impacte `auth.uid()` / `auth.jwt()` sur lesquels repose la RLS |
| PostgREST | API REST auto-générée consommée par `supabase-js` | Déployer PostgREST **ou** réécrire une couche API ; sans lui, les appels `.from()` / `.rpc()` du front cessent de fonctionner |
| Realtime | Diffusion WebSocket des changements | Déployer le serveur Realtime **ou** remplacer (`LISTEN/NOTIFY` + passerelle WebSocket) — impacte `subscribeRT` |
| Edge Functions (Deno) | 4 fonctions serveur | Exécuter l'image `supabase/edge-runtime`, **ou** héberger les fonctions en services Deno autonomes — voir ci-dessous |
| Storage | Fichiers | Non utilisé par l'application — rien à migrer |

**Edge Functions :**

- Les 4 fonctions (`auth-gate`, `manage-user`, `send-notifications`, `test-notification`) tournent sur le runtime Edge de Supabase (Deno). Ce runtime est **open source et distribué sous forme d'image Docker** (`supabase/edge-runtime`, celle-là même qu'emploie la pile auto-hébergée de la voie 1) : le faire tourner seul derrière un reverse proxy est la solution la plus directe, et les fonctions restent alors inchangées. À défaut, elles peuvent être réécrites en services Deno autonomes, au prix d'une gestion manuelle des clés (`SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS`), du JWT, du CORS et de l'accès base.
- `manage-user` s'appuie sur l'**API admin de GoTrue** pour créer des comptes → à réadapter selon la solution d'authentification retenue.
- Le **cron** (`pg_cron` + `pg_net`) appelle `send-notifications` par HTTP ; `pg_net` n'étant pas standard, le remplacer par un cron système ou un `pg_cron` appelant un endpoint local.

**Frontend et configuration :**

- `public/js/config.js` mappe chaque domaine vers l'URL Supabase et la clé anon → **repointer** vers les nouveaux endpoints (Auth, PostgREST, Realtime, Edge Functions).
- Remplacer **Cloudflare Pages** par un serveur web (Nginx / Caddy) servant `public/`, avec réimplémentation de `_headers` (CSP, cache) et `_redirects` (routage SPA + `/confirm`) en règles du serveur.

**Infrastructure transverse (à la charge de l'exploitant) :**

- **Reverse proxy + TLS** (Nginx / Caddy + Let's Encrypt) routant vers chaque service ; nom de domaine.
- **Sauvegardes** : `pg_dump` planifié ou réplication (remplace le PITR managé).
- **Supervision** : logs, disponibilité, alertes ; **mises à jour de sécurité** de l'OS et des composants.
- **CI/CD** : remplacer le déploiement automatique sur `git push` de Cloudflare par un pipeline de déploiement vers le VPS.
- **Captcha Turnstile** : reste un service Cloudflare (indépendant de l'hébergement) ; sa clé secrète, aujourd'hui dans la configuration Auth Supabase, est à reconfigurer côté solution d'authentification.

**En résumé :** la **voie 2** constitue un **projet d'infrastructure à part entière** (plusieurs semaines) et n'est à retenir que si l'exploitation de la pile Supabase est écartée par principe. La **voie 1** — Supabase auto-hébergé — relève d'un tout autre ordre de grandeur, puisqu'il s'agit du même logiciel : ce n'est pas une migration applicative, et l'application n'est pas modifiée. Les deux transfèrent en revanche la même charge d'exploitation (mises à jour, sécurité, sauvegardes, disponibilité) à l'équipe qui opère le serveur. L'auto-hébergement ne se justifie que si une **souveraineté totale des données** est exigée ; dans ce cas, la voie 1 est la réponse.

---

## 4. Tableau comparatif

| Critère | A — Supabase Cloud | B — Azure Canada |
|---|:---:|:---:|
| **Résidence des données (Canada)** | ✅ Oui — `ca-central-1`, Montréal (Québec) | ✅ Oui (CA Central) |
| **Délai de déploiement** | ✅ Semaines | ⚠️ Mois |
| **Coût mensuel** | ✅ 0–35 CAD *(~175 CAD si le PITR est exigé)* | ⚠️ ~130–160 CAD |
| **Charge opérationnelle** | ✅ Minimale | ⚠️ Modérée |
| **Contrôle de l'infrastructure** | ⚠️ Partiel | ⚠️ Partiel |
| **SLA documenté** | ✅ 99,9 % | ✅ 99,99 % |
| **Certifications sécurité** | ✅ SOC 2, ISO 27001 | ✅ SOC 2, ISO 27001 |
| **Adaptabilité au code existant** | ✅ Aucune modification | ❌ Re-développement |
| **Open source / auditabilité** | ✅ Supabase est open source | ⚠️ Partiel |
| **Expertise requise** | ✅ Faible | ⚠️ Azure |
| **Résidence hors organisation** | ⚠️ Oui (cloud tiers Canada) | ⚠️ Oui (cloud Microsoft Canada) |
| **Notifications courriel — résidence** | ⚠️ Resend (US) ou SMTP institutionnel | ✅ Azure Communication Services (CA) |

> L'**hébergement auto-géré** (voir section 3) n'est pas comparé ici : ce n'est pas une offre managée clé en main. Si la souveraineté devient une exigence ferme, c'est la **voie 1 (Supabase auto-hébergé)** qu'il faut comparer aux deux options ci-dessus, et non la reconstruction service par service : elle conserve la résidence choisie, n'impose aucune modification de l'application, et déplace le coût du développement vers l'exploitation.

---

## 5. Recommandation

**Option A — Supabase Cloud** est recommandée pour le déploiement initial et la durée de vie du projet, pour les raisons suivantes :

1. **Aucun développement supplémentaire** : l'application est déjà fonctionnelle sur cette plateforme.
2. **Coût opérationnel minimal** : 0 $ (plan Free) à ~35 CAD/mois (Plan Pro Supabase). Le service courriel Resend est gratuit dans les volumes attendus.
3. **Charge opérationnelle minimale** : les mises à jour de sécurité et la disponibilité sont gérées par le fournisseur ; les sauvegardes aussi en plan Pro — en plan Free, elles reposent sur le workflow chiffré du dépôt privé, à surveiller (§6.1).
4. **Résidence des données au Québec** : la région `ca-central-1` place les données au repos à Montréal — sous réserve de vérifier la région effective du projet de production et d'épingler la région d'exécution des Edge Functions (§3, Option A).
5. **Certifications reconnues** : SOC 2 Type II et ISO 27001 attestent du niveau de sécurité du fournisseur.

**Si une souveraineté totale des données est exigée** (données exclusivement sur une infrastructure interne ou sur un serveur contrôlé par l'organisation), la réponse est le **Supabase auto-hébergé** décrit en voie 1 (section 3) : même logiciel, application inchangée, et un VPS canadien ou une machine virtuelle interne suffisent. L'investissement porte alors sur l'exploitation — sauvegardes, mises à jour, supervision — et non sur du développement.

**L'Option B (Azure)** n'est recommandée que si l'organisation dispose déjà d'un environnement Azure actif et d'équipes formées, et si des ententes cadres gouvernementales offrent des conditions tarifaires avantageuses.

---

## 6. Points importants pour maintenir le projet

### 6.1 Ce que l'équipe projet doit assurer

Avec l'Option A recommandée, la charge opérationnelle est faible mais non nulle :

| Responsabilité | Fréquence | Effort estimé |
|---|---|---|
| Vérifier les sauvegardes — en plan Pro, les sauvegardes managées ; **en plan Free, le workflow `db-backup` (dépôt privé) est la seule protection** : vérifier qu'il tourne encore, que l'artifact du jour existe et qu'aucune issue « Sauvegarde de la base en échec » n'est ouverte (cf. §6.4) | Mensuel | 15 min |
| Surveiller la consommation Supabase (stockage, bande passante) | Mensuel | 15 min |
| Surveiller le quota courriel Resend (ou SMTP interne) | Mensuel | 10 min |
| Vérifier l'historique des notifications envoyées (depuis l'app) | Mensuel | 10 min |
| Appliquer à la main les changements de base livrés dans `schema.sql` (pas de migration automatique) | À chaque livraison | 30 min |
| Faire tourner les secrets selon [../deploiement/05-procedures-securite.md](../deploiement/05-procedures-securite.md) (clés Resend / SMTP, clé secrète Supabase, Turnstile, `backup_reader`) et tenir le registre des rotations | 12 mois, et à chaque départ ou incident | 1 h |
| Gérer les adresses courriel de notification par labo | Au besoin | 5 min/action |
| Gérer les comptes utilisateurs (création, désactivation) | Au besoin | 5 min/action |
| Test de restauration depuis sauvegarde ([../deploiement/04-sauvegardes.md](../deploiement/04-sauvegardes.md) §6) | **Trimestriel** (restauration complète dans un projet de test : annuelle) | 1 à 2 heures |
| Revue des membres, de la MFA et des jetons des comptes tiers (Supabase, Cloudflare, Resend, GitHub) | Semestriel | 30 min |
| Vérifier les réglages Auth de la console (inscription fermée, mot de passe ≥ 12, captcha activé) | Semestriel et après toute intervention en console | 10 min |

### 6.2 Accès et comptes à maintenir

| Accès | Détenu par | Utilité |
|---|---|---|
| Tableau de bord Supabase | Équipe projet OPTILAB | Administration DB, monitoring, logs |
| Compte Cloudflare Pages | Équipe projet OPTILAB | Déploiements, domaines |
| Compte GitHub (dépôt source) | Développeur principal **et un second détenteur** (organisation GitHub recommandée) | Code source, CI, sauvegardes chiffrées (dépôt privé) |
| Clés privées `age` des sauvegardes | Deux détenteurs désignés, hors ligne | Restauration |
| Compte Resend (ou config SMTP) | Équipe projet OPTILAB | Envoi des notifications courriel, clé API |
| Compte admin OPTILAB (in-app) | Responsable OPTILAB | Gestion utilisateurs, configuration, adresses courriel par labo |

> **Règle fondamentale** : ne jamais avoir un seul détenteur de ces accès. Chaque accès critique est détenu par **au moins deux personnes**, chacune avec un **compte nominatif protégé par MFA** (pas de compte partagé). Les codes de récupération vont dans le coffre institutionnel. Départ d'une personne : [../deploiement/05-procedures-securite.md](../deploiement/05-procedures-securite.md) §3.

### 6.3 Gestion des mises à jour

Le code source de l'application est versionné dans GitHub. Chaque nouvelle version :
1. Est testée — idéalement sur un environnement de développement distinct, **qui reste à créer** : aujourd'hui, toutes les adresses de test visent le projet de production (voir [../deploiement/05-procedures-securite.md](../deploiement/05-procedures-securite.md) §4)
2. Passe par le plan de recette documenté ([08-plan-de-recette.md](08-plan-de-recette.md))
3. Est déployée sur Cloudflare Pages par un simple push GitHub (automatique)
4. Nécessite, si la base change, l'application manuelle du changement dans le SQL Editor ; `supabase/schema.sql` reste la source de vérité, vérifiée par la CI

Il n'y a **pas de temps d'arrêt planifié** lors des déploiements — les fichiers statiques sont mis à jour en continu par Cloudflare Pages.

### 6.4 Risques identifiés et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Discontinuité du service Supabase | Faible | Moyen | SLA 99,9 % (plan Pro uniquement) + sauvegarde quotidienne chiffrée ; plan de migration documenté (Azure ou auto-hébergement, §3) — reconstructibilité de la base vérifiée en continu par la CI (« schema.sql sur Postgres vierge ») |
| **Arrêt silencieux des sauvegardes** | **Moyen** | **Élevé** | En plan Free, `db-backup` est la seule protection. Tout échec d'un run ouvre une issue GitHub, mais un workflow **désactivé**, un quota de minutes épuisé ou un run abandonné n'en ouvrent aucune. (La désactivation automatique des workflows planifiés après 60 jours sans activité ne vise que les dépôts **publics** ; le workflow ne doit tourner que dans le dépôt privé.) Vérifier l'onglet Actions chaque mois (cf. §6.1) ; seule une supervision externe (« dead man's switch ») couvrirait ces cas ; une copie hors site reste à mettre en place, l'artifact vivant dans le même compte GitHub que le code |
| Perte d'accès au tableau de bord | Faible | Élevé | ≥ 2 propriétaires nominatifs avec MFA par service ; codes de récupération dans le coffre institutionnel (jamais un compte partagé) |
| Fuite d'un secret ou compromission d'un compte | Faible | Élevé | Secrets hors dépôt (Vault, réglages de plateforme, secret GitHub du dépôt privé), détection gitleaks avant et après push ; procédure d'incident avec les obligations de la Loi 25 (registre, évaluation du préjudice, avis à la CAI) : [../deploiement/05-procedures-securite.md](../deploiement/05-procedures-securite.md) §2 |
| Croissance du stockage DB | Moyen | Moyen | Purges planifiées par `schema.sql` (journal d'audit > 12 mois, notifications > 90 jours, historique cron > 30 jours) |
| Départ du développeur principal | Moyen | Élevé | Code documenté ([01-architecture-application.md](01-architecture-application.md), [02-liste-des-fonctions.md](02-liste-des-fonctions.md)) ; architecture simple ; second détenteur sur chaque compte ; procédure de départ (retrait des accès, rotation des secrets) : [../deploiement/05-procedures-securite.md](../deploiement/05-procedures-securite.md) §3 |
| Faille de sécurité Supabase | Très faible | Élevé | Supabase publie des avis de sécurité; la sécurité repose sur PostgreSQL RLS (couche indépendante) |
| Non-livraison des notifications courriel | Faible | Faible | L'app continue de fonctionner normalement sans notifications ; le **chien de garde** de la base écrit une alerte dans le journal des notifications (Configuration › Notifications) si des envois attendent depuis plus de 30 h ; les alertes visuelles dans l'app restent actives |
| Données courriel hors Canada (Resend) | Faible | Faible | Les logs Resend contiennent le sujet, l'adresse destinataire et le corps (dont le champ libre « Observation ») ; pas de donnée patient par conception ; remplaçable par un SMTP institutionnel si requis |
| Mauvaise utilisation par un utilisateur | Moyen | Faible | Journal d'audit complet sur toutes les modifications; rôles et permissions granulaires |


---

## 7. Prochaines étapes proposées

| Étape | Responsable | Délai proposé |
|---|---|---|
| 1. Approbation du présent document par la Direction TI | Direction TI | À définir |
| 2. Déploiement pilote (2 à 3 laboratoires) | Développeur + OPTILAB | 2–4 semaines |
| 3. Formation des utilisateurs pilotes | OPTILAB | En parallèle |
| 4. Revue des résultats pilote et ajustements | Développeur + OPTILAB | 4 semaines après pilote |
| 5. Déploiement réseau complet (16 laboratoires) | Développeur + Équipe projet OPTILAB | À définir selon pilote |

---

## Annexes

### Annexe A — Informations fournisseurs

**Supabase Inc.**
- Site : [supabase.com](https://supabase.com)
- Statut : entreprise privée (San Francisco, CA)
- Certifications : SOC 2 Type II, ISO 27001
- Politique de confidentialité : [supabase.com/privacy](https://supabase.com/privacy)
- Conditions de service : [supabase.com/terms](https://supabase.com/terms)
- Support : tickets via tableau de bord, réponse garantie sous 24h (Plan Pro)
- Code source : open source — [github.com/supabase/supabase](https://github.com/supabase/supabase)

**Cloudflare Inc.**
- Site : [cloudflare.com](https://cloudflare.com)
- Statut : entreprise publique (NASDAQ : NET, San Francisco, CA)
- Certifications : SOC 2 Type II, ISO 27001, PCI DSS
- Politique de confidentialité : [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)
- Données hébergées : fichiers statiques uniquement (HTML/CSS/JS — aucune donnée opérationnelle)

**Resend Inc.** *(service courriel — optionnel)*
- Site : [resend.com](https://resend.com)
- Statut : entreprise privée (San Francisco, CA)
- Plan utilisé : **Free** (3 000 courriels/mois, 100/jour) — 0 $
- Certifications : SOC 2 Type II (en cours)
- Politique de confidentialité : [resend.com/legal/privacy-policy](https://resend.com/legal/privacy-policy)
- Données transitant : adresse courriel destinataire, sujet du message, corps du courriel (description de l'incident, dont le champ libre « Observation » — aucune donnée patient par conception)
- Serveurs : États-Unis
- **Alternative sans Resend** : configurer un serveur SMTP institutionnel dans la configuration OPTILAB — les courriels restent alors entièrement en interne
