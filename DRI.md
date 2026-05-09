# Document de Référence d'Infrastructure
## OPTILAB Traçabilité — Réseau BSL-GAS

---

| Champ | Valeur |
|---|---|
| **Projet** | OPTILAB Traçabilité inter-laboratoires |
| **Date** | 2026-05-09 |
| **Statut** | Soumis pour approbation |
| **Préparé par** | Équipe OPTILAB |
| **Destinataire** | DRI — CISSS du Bas-Saint-Laurent |

---

## Résumé exécutif

OPTILAB Traçabilité est une application web permettant aux laboratoires de la grappe de **suivre en temps réel les envois de spécimens biologiques** entre établissements. Elle remplace les processus manuels (papier, fax) par une interface numérique centralisée accessible depuis tout navigateur.

L'application ne contient **aucune donnée de santé patient**. Elle enregistre exclusivement des données de logistique opérationnelle : numéros de liste de repérage, laboratoires expéditeurs et destinataires, températures de transport, transporteurs et horodatages.

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
| **Superviseur grappe** | Accès à tous les labos, historique complet, KPI | Coordinateur réseau / ́Équipe qualité|
| **Administrateur** | Configuration complète, gestion des utilisateurs | TI ou responsable OPTILAB |

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

L'application ne traite **aucune donnée de santé au sens de la Loi sur les services de santé et les services sociaux (LSSSS)** ni aucun renseignement personnel de patient.

Les données enregistrées sont exclusivement opérationnelles :

| Type de donnée | Exemples | Catégorie |
|---|---|---|
| Identification des envois | Numéro de liste SILP, numéro interne | Opérationnelle |
| Laboratoires | Nom, adresse, numéro de fax | Organisationnelle |
| Conditions de transport | Température (2-8°C, ambiant, congelé), transporteur | Opérationnelle |
| Horodatages | Date/heure d'envoi, de réception | Opérationnelle |
| Utilisateurs | Nom d'employé, numéro d'employé, rôle, labo | Ressources humaines |
| Audit | Qui a créé/modifié quoi, quand | Traçabilité interne |

> L'application traite des **numéros de liste de repérage SILP** (numéros générée par SoftLabMic au moment de la mise en transit), pas des numéros de dossiers patients. La corrélation avec des données de santé requiert l'accès à SoftLabMic.

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
                          │  (Supabase — région Canada)      │
                          │  - PostgreSQL (données)          │
                          │  - Auth (connexion utilisateurs) │
                          │  - Realtime (temps réel)         │
                          │  - Fonctions serveur             │
                          └────────────────┬─────────────────┘
                                           │ (notifications seulement)
                                           ▼
                          ┌──────────────────────────────────┐
                          │  Service courriel (Resend        │
                          │  ou SMTP interne CISSS)          │
                          │  Envoi des alertes aux labos     │
                          └──────────────────────────────────┘
```

Il n'y a **pas de serveur applicatif traditionnel** à maintenir. Le frontend est un ensemble de fichiers web statiques. Toute la logique métier, la sécurité et la gestion des données sont assurées par la plateforme Supabase.

**Connexions réseau :**
- Poste client → hébergement web : HTTPS (port 443)
- Hébergement web → base de données : HTTPS (port 443)
- Base de données → service courriel : HTTPS (port 443) — uniquement lors de l'envoi de notifications
- Aucun port non standard, aucun VPN requis pour les utilisateurs finaux

**Note sur les notifications :** Le service de courriel est le **seul composant optionnel**. Les laboratoires qui n'activent pas les notifications par courriel n'utilisent pas ce service. Il peut être remplacé par un serveur SMTP interne du CISSS pour garder les flux courriel sur l'infrastructure institutionnelle.

---

## 3. Options d'infrastructure

Trois options sont présentées. Elles correspondent à différents niveaux d'implication de l'équipe TI et à différents profils de risque et de coût.

---

### Option A — Supabase Cloud + Cloudflare Pages *(situation actuelle)*

**Description**
L'application est hébergée sur deux plateformes cloud spécialisées :
- **Cloudflare Pages** : sert les fichiers web statiques depuis un réseau de diffusion mondial (CDN)
- **Supabase Cloud** : fournit la base de données PostgreSQL, l'authentification, le temps réel et les fonctions serveur

Les deux fournisseurs proposent une **région Canada (Toronto / Canada Central)** garantissant la résidence des données sur le territoire canadien.

**Coûts estimés**

| Composant | Coût | Notes |
|---|---|---|
| Supabase | 0 $ (Free) → 25 USD/mois (~35 CAD) Pro | Plan Pro recommandé en production |
| Cloudflare Pages | 0 $ | Aucun coût additionnel |
| Resend (courriel) | **0 $** — Plan Free | 3 000 courriels/mois, 100/jour — largement suffisant pour le réseau BSL-GAS |
| Nom de domaine personnalisé | ~20 CAD/an | Optionnel — le sous-domaine Cloudflare est gratuit |
| **Total mensuel estimé** | **0 $ à ~35 CAD/mois** | 0 $ en plan Free · ~35 CAD avec Plan Pro Supabase |

> Le volume de notifications attendu pour le réseau BSL-GAS (quelques dizaines de courriels par mois) est très largement inférieur à la limite du plan Free de Resend. **Aucun abonnement payant Resend n'est prévu.**

**Avantages**

| ✅ Avantage | Détail |
|---|---|
| Mise en œuvre rapide | Opérationnel en quelques heures — aucune infrastructure à provisionner |
| Coût très faible | ~65 CAD/mois tout inclus (Supabase Pro + Resend) |
| Pas de gestion serveur | Mises à jour, sécurité, disponibilité gérées par les fournisseurs |
| SLA Pro | 99,9 % de disponibilité garanti (Plan Pro Supabase) |
| Résidence Canada | Région Canada disponible — données stockées à Toronto |
| Certifications fournisseur | Supabase : SOC 2 Type II, ISO 27001 |
| Backup automatique | Daily backup + PITR (Plan Pro) |
| Notifications flexibles | Resend (cloud) ou SMTP CISSS interne — au choix |

**Inconvénients**

| ⚠️ Inconvénient | Détail |
|---|---|
| Dépendance fournisseurs | L'application dépend de Supabase, Cloudflare et Resend (pour les notifications) |
| Données courriel hors Canada | Resend est basé aux États-Unis — logs des courriels sur serveurs US. Contenu : adresse destinataire + description de l'incident. Remplaçable par SMTP CISSS interne si requis. |
| Coût de sortie | Migration vers une autre infrastructure requiert un effort technique |
| Connaissance spécifique | Supabase est relativement récent — expertise moins répandue que AWS/Azure |

---

### Option B — Supabase auto-hébergé sur infrastructure CISSS *(self-hosted)*

**Description**
Supabase est une plateforme open source. Elle peut être déployée sur des serveurs internes du CISSS via Docker Compose. Les données restent sur les serveurs du CISSS (sur site ou dans un centre de données institutionnel québécois).

**Prérequis matériels estimés**

| Composant | Minimum | Recommandé |
|---|---|---|
| Serveur (VM ou physique) | 4 vCPU / 8 GB RAM / 100 GB SSD | 8 vCPU / 16 GB RAM / 500 GB SSD |
| Système d'exploitation | Ubuntu 22.04 LTS | Même |
| Conteneurs | Docker Engine + Docker Compose | Même + orchestrateur (optionnel) |
| Réseau | 100 Mbps | 1 Gbps |
| Sauvegarde | Stockage objet interne | Réplication géographique |

**Coûts estimés**

| Élément | Estimation annuelle |
|---|---|
| Licences logicielles | 0 $ (open source) |
| Infrastructure serveur | Selon inventaire CISSS — à évaluer |
| Maintenance TI | 5–10 jours/an (mises à jour, monitoring, interventions) |
| **Total** | **Variable — dominé par le coût RH interne** |

**Avantages**

| ✅ Avantage | Détail |
|---|---|
| Souveraineté totale | Données sur les serveurs du CISSS — aucune donnée sortant de l'établissement |
| Pas de coût fournisseur externe | Aucune facturation mensuelle Supabase ou Cloudflare |
| Contrôle complet | L'équipe TI gère l'ensemble de la pile |

**Inconvénients**

| ⚠️ Inconvénient | Détail |
|---|---|
| Charge opérationnelle élevée | Mises à jour, sauvegardes, monitoring, haute disponibilité : responsabilité TI |
| Expertise requise | Docker, PostgreSQL, Linux |
| Délai de déploiement | Plusieurs semaines pour provisionner et configurer |
| Coût réel souvent sous-estimé | Le coût humain (heures TI) dépasse rapidement le coût du cloud |
| Mises à jour complexes | Migrations Supabase à appliquer manuellement à chaque version |

---

### Option C — Microsoft Azure Canada *(cloud souverain)*

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

## 4. Tableau comparatif

| Critère | A — Supabase Cloud | B — Auto-hébergé | C — Azure Canada |
|---|:---:|:---:|:---:|
| **Résidence des données (Canada)** | ✅ Oui (région CA) | ✅ Oui (CISSS) | ✅ Oui (CA Central) |
| **Délai de déploiement** | ✅ Semaines | ⚠️ Mois | ⚠️ Mois |
| **Coût mensuel** | ✅ 0–35 CAD | ⚠️ Variable (RH) | ⚠️ ~130–160 CAD |
| **Charge opérationnelle TI** | ✅ Minimale | ❌ Élevée | ⚠️ Modérée |
| **Contrôle de l'infrastructure** | ⚠️ Partiel | ✅ Total | ⚠️ Partiel |
| **SLA documenté** | ✅ 99,9 % | ⚠️ Selon infra CISSS | ✅ 99,99 % |
| **Certifications sécurité** | ✅ SOC 2, ISO 27001 | N/A | ✅ SOC 2, ISO 27001 |
| **Adaptabilité au code existant** | ✅ Aucune modification | ✅ Aucune modification | ❌ Re-développement |
| **Open source / auditabilité** | ✅ Supabase est open source | ✅ Total | ⚠️ Partiel |
| **Expertise requise** | ✅ Faible | ❌ Docker/Linux/PG | ⚠️ Azure |
| **Données hors CISSS** | ⚠️ Oui (cloud tiers Canada) | ✅ Non | ⚠️ Oui (cloud Microsoft Canada) |
| **Notifications courriel — résidence** | ⚠️ Resend (US) ou SMTP CISSS | ✅ SMTP CISSS interne | ✅ Azure Communication Services (CA) |

---

## 5. Recommandation

**Option A — Supabase Cloud** est recommandée pour le déploiement initial et la durée de vie du projet, pour les raisons suivantes :

1. **Aucun développement supplémentaire** : l'application est déjà fonctionnelle sur cette plateforme.
2. **Coût opérationnel minimal** : 0 $ (plan Free) à ~35 CAD/mois (Plan Pro Supabase). Le service courriel Resend est gratuit dans les volumes attendus.
3. **Charge TI minimale** : les mises à jour de sécurité, la disponibilité et les sauvegardes sont gérées par le fournisseur.
4. **Résidence des données au Canada** : en sélectionnant la région Canada de Supabase, les données restent sur le territoire canadien.
5. **Certifications reconnues** : SOC 2 Type II et ISO 27001 attestent du niveau de sécurité du fournisseur.

**Si la direction TI exige une souveraineté totale** (données exclusivement sur infrastructure CISSS), l'Option B est envisageable mais implique un investissement en ressources humaines et en infrastructure nettement plus important.

**L'Option C (Azure)** n'est recommandée que si le CISSS dispose déjà d'un environnement Azure actif et d'équipes formées, et si des ententes cadres gouvernementales offrent des conditions tarifaires avantageuses.

---

## 6. Points importants pour maintenir le projet

### 6.1 Ce que l'équipe projet doit assurer

Avec l'Option A recommandée, la charge opérationnelle est faible mais non nulle :

| Responsabilité | Fréquence | Effort estimé |
|---|---|---|
| Vérifier les sauvegardes automatiques | Mensuel | 15 min |
| Surveiller la consommation Supabase (stockage, bande passante) | Mensuel | 15 min |
| Surveiller le quota courriel Resend (ou SMTP interne) | Mensuel | 10 min |
| Vérifier l'historique des notifications envoyées (depuis l'app) | Mensuel | 10 min |
| Appliquer les migrations de base de données lors des nouvelles versions | À chaque livraison | 30 min |
| Renouveler la clé API Resend si révoquée | Au besoin | 15 min |
| Gérer les adresses courriel de notification par labo | Au besoin | 5 min/action |
| Gérer les comptes utilisateurs (création, désactivation) | Au besoin | 5 min/action |
| Test de restauration depuis sauvegarde | Annuel | 2 heures |

### 6.2 Accès et comptes à maintenir

| Accès | Détenu par | Utilité |
|---|---|---|
| Tableau de bord Supabase | TI + développeur principal | Administration DB, monitoring, logs |
| Compte Cloudflare Pages | TI + développeur principal | Déploiements, domaines |
| Compte GitHub (dépôt source) | Développeur principal | Code source, backups DB |
| Compte Resend (ou config SMTP) | TI + développeur principal | Envoi des notifications courriel, clé API |
| Compte admin OPTILAB (in-app) | Responsable OPTILAB + TI | Gestion utilisateurs, configuration, adresses courriel par labo |

> **Règle fondamentale** : ne jamais avoir un seul détenteur de ces accès. Chaque accès critique doit être partagé entre au moins deux personnes de l'organisation.

### 6.3 Gestion des mises à jour

Le code source de l'application est versionné dans GitHub. Chaque nouvelle version :
1. Est testée sur un environnement de développement
2. Passe par le plan de recette documenté ([RECETTE.md](RECETTE.md))
3. Est déployée sur Cloudflare Pages par un simple push GitHub (automatique)
4. Nécessite l'application manuelle des migrations SQL dans le tableau de bord Supabase ou via CLI

Il n'y a **pas de temps d'arrêt planifié** lors des déploiements — les fichiers statiques sont mis à jour en continu par Cloudflare Pages.

### 6.4 Risques identifiés et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Discontinuité du service Supabase | Faible | Moyen | SLA 99,9 % + sauvegarde quotidienne; plan de migration vers Option B documenté |
| Perte d'accès au tableau de bord | Faible | Élevé | Partager les accès entre ≥ 2 personnes, documenter les identifiants en coffre-fort |
| Croissance du stockage DB | Moyen | Moyen | Cron de purge des archives > 1 an (à configurer avant déploiement production) |
| Départ du développeur principal | Moyen | Élevé | Code documenté ([doc.md](doc.md), [fonctions.md](fonctions.md)); architecture simple sans dépendances complexes |
| Faille de sécurité Supabase | Très faible | Élevé | Supabase publie des avis de sécurité; la sécurité repose sur PostgreSQL RLS (couche indépendante) |
| Non-livraison des notifications courriel | Faible | Faible | L'app continue de fonctionner normalement sans notifications; alerte visible dans l'historique Resend; les alertes visuelles dans l'app restent actives |
| Données courriel hors Canada (Resend) | Faible | Faible | Les logs Resend contiennent le sujet et l'adresse destinataire (pas de données patient); remplaçable par SMTP CISSS interne si requis |
| Mauvaise utilisation par un utilisateur | Moyen | Faible | Journal d'audit complet sur toutes les modifications; rôles et permissions granulaires |


---

## 7. Prochaines étapes proposées

| Étape | Responsable | Délai proposé |
|---|---|---|
| 1. Approbation du présent document par la Direction TI | Direction TI | À définir |
| 2. Déploiement pilote (2 à 3 laboratoires) | Développeur + OPTILAB | 2–4 semaines |
| 3. Formation des utilisateurs pilotes | OPTILAB | En parallèle |
| 4. Revue des résultats pilote et ajustements | Développeur + OPTILAB | 4 semaines après pilote |
| 5. Déploiement réseau complet (16 laboratoires) | Développeur + TI + OPTILAB | À définir selon pilote |

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
- Données transitant : adresse courriel destinataire, sujet du message, corps du courriel (description de l'incident — aucune donnée patient)
- Serveurs : États-Unis
- **Alternative sans Resend** : configurer un serveur SMTP interne CISSS dans la configuration OPTILAB — les courriels restent alors entièrement sur l'infrastructure institutionnelle
