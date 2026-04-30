# Traçabilité OPTILAB — BSL-GAS

Application web de gestion et de traçabilité des envois d'échantillons biologiques entre les laboratoires de la grappe OPTILAB Bas-Saint-Laurent — Gaspésie.

> Développé par **Patxi VIEL** — CISSS Bas-Saint-Laurent

---

## Table des matières

1. [Présentation](#présentation)
2. [Fonctionnalités](#fonctionnalités)
3. [Captures d'écran](#captures-décran)
4. [Architecture technique](#architecture-technique)
5. [Déploiement](#déploiement)
   - [Prérequis](#prérequis)
   - [Étape 1 — Supabase](#étape-1--supabase)
   - [Étape 2 — Cloudflare Pages](#étape-2--cloudflare-pages)
   - [Étape 3 — Configuration initiale](#étape-3--configuration-initiale)
6. [Développement local](#développement-local)

---

## Présentation

C'est un système de suivi des envois d'échantillons biologiques entre laboratoires. Il remplace les processus manuels (feuilles de route, confirmation par fax) par une interface centralisée accessible depuis tout navigateur, sans installation.

L'application couvre deux modes d'envoi :

- **Intra-grappe** : envois entre les laboratoires du réseau Optilab, tracés par numéro de liste de repérage SILP ou par un numéro unique lorsque les échantillons sont dans un autre système (TraceLine, TD HC...).
- **Hors-grappe** : envois vers des laboratoires extérieurs au réseau (CHU de Québec, Montréal…), avec génération automatique du formulaire de confirmation F-G-74 adapté et suivi numérique des accusés de réception.

---

## Fonctionnalités

### Authentification

- Connexion par numéro d'employé et mot de passe.
- Changement de mot de passe obligatoire à la première connexion.
- Quatre niveaux de rôle : Technicien, Superviseur Labo, Superviseur Grappe, Administrateur.
- Thème clair / sombre (préférence enregistrée par utilisateur).
- Gestion des utilisateurs par les Superviseurs Labo

---

### Mode Intra-grappe

#### Créer un envoi

- Sélection du laboratoire destinataire avec affichage de l'adresse complète.
- Type de spécimen : Spécimen humain exempté, Catégorie B — UN 3373, Catégorie A — UN 2814.
- Température d'envoi : Température pièce, Frigo (2–8°C), Congelé (−20°C).
- Type de réfrigérant si congelé : Glace sèche (UN 1845) ou Sachet réfrigérant.
- Sélection multi-département : Biochimie, Hématologie/BDS, Microbiologie/Séro, Pathologie/Cyto.
- N° de liste de repérage SILP (saisie manuelle ou scan code-barres).
- Case à cocher **"Je n'ai pas de liste de repérage SILP"** pour les envois sans SILP (pathologie seule, banque de sang…) : génère un numéro HSILP séquentiel automatiquement.
- Impression automatique du bordereau à la création.

#### Réceptionner un envoi

- Recherche par numéro de liste de repérage.
- Confirmation de réception ou signalement d'un problème.
- Observations obligatoires en cas de problème.

#### Résumé labo

- Vue tabulaire des envois envoyés et à réceptionner sur une période.
- Filtres : période, département, groupement (par date d'envoi ou de réception).
- Export PDF du récapitulatif.
- Détail de chaque envoi : modifier, imprimer le bordereau, déclarer perdu.
- Alarmes visuelles configurables : transit trop long (rouge), potentiellement perdu (bordeaux).

#### Historique

- Tableau de tous les envois avec compteurs statistiques (total, ce mois, en transit, labos actifs).
- Filtres avancés : date, statut, département, transporteur, recherche textuelle libre.
- Onglets : Colis envoyés / À réceptionner / Réceptionnés.

---

### Mode Hors-grappe

#### Créer un envoi

- Sélection du laboratoire externe avec sous-laboratoires configurables (ex. HEJ → HEJ Immunosupprimés).
- Mêmes options de spécimen, température, réfrigérant qu'en intra-grappe.
- Numéros de liste SILP multiples (chips, scan code-barres, validation anti-doublon).
- Case à cocher "Je n'ai pas de liste de repérage SILP" avec confirmation modale.
- Modal succès avec **impression obligatoire** du bordereau + F-G-74 avant fermeture.

#### Suivi des confirmations

- Tableau de tous les envois hors-grappe avec statut de confirmation.
- Filtres : période, statut (en attente, confirmé en ligne, par fax, aucune réponse).
- Saisie de confirmation par fax directement depuis l'interface.
- Alarmes configurables pour les confirmations manquantes.

#### Page de confirmation publique (sans connexion)

- Accessible depuis le QR code ou les codes-barres imprimés sur le F-G-74.
- Saisie par N° d'envoi + code de vérification à 6 caractères (imprimé physiquement).
- Formulaire bilingue français / anglais.
- Conformité ou non-conformité avec sélection du type (Température, Spécimen, Emballage…).
- Confirmation impossible sans le document F-G-74 physique (sécurité par conception).
- Confirmation par fax toujours disponible, mais la confirmation en ligne mise en avant.
---

### Bordereaux et documents imprimés

**Intra-grappe — 5 formats :**

| Format | Description |
|--------|-------------|
| Lettre pliée | Étiquette d'envoi (haut) + bordereau informatif (bas), à plier en deux |
| Bordereau seul | Page lettre 8½ × 11 po, code-barres + tableau |
| Étiquette seule | Pictogrammes, adresses et départements uniquement |
| Pochette colis | Optimisé pour pochette transparente 8×10 po |
| Grille colis | Grille : Destinataire / Temp. — Expéditeur / Depts — Pictogrammes |

**Hors-grappe :**
- Bordereau de transport (étiquette d'envoi).
- Formulaire F-G-74 bilingue (*Confirmation de réception de colis / Shipment Receipt Confirmation*) avec QR code, codes-barres CODE128, et section fax.

Tous les documents incluent les pictogrammes IATA réglementaires et les mentions de marchandises dangereuses si applicable (UN 3373, UN 2814, UN 1845). Les pictogrammes ne sont pas à la taille minimale réglementaire, un message est automatiquement ajouté au document pour prévenir l'expéditeur. 

#### Format Pochette colis — sans planche d'étiquettes

Le format **Pochette colis** génère un bordereau dimensionné pour être glissé dans une enveloppe adhésive refermable **8 × 10 po** (ex. [ULINE S-1479 — Lock-and-Press Envelopes](https://fr.uline.ca/Product/Detail/S-1479/Clear-Packing-List-Envelopes/Lock-and-Press-Envelopes-8-x-10)), collée directement sur le colis.

**Avantages par rapport aux planches d'étiquettes (type Avery) :**

| | Planche Avery | Pochette adhésive 8×10 po |
|---|---|---|
| Support d'impression | Papier étiquette spécial | Papier ordinaire |
| Gaspillage | Inutilisables après découpe | Aucun (une feuille = un envoi) |
| Alignement | Calibrage requis selon imprimante | Sans contrainte |
| Lisibilité | Selon qualité d'impression sur étiquette | Excellente (feuille pleine) |
| Coût | Élevé (étiquettes Avery) | Faible (papier + enveloppes en vrac) |
| Durabilité | Les étiquettes doivent être arrachées lors d'un nouvel envoi| Il suffit de jeter la feuille, l'enveloppe reste en place|

**Flux d'utilisation :**

1. Coller l'enveloppe adhésive sur le colis (opération unique — l'enveloppe reste en place).
2. Pour chaque envoi, imprimer le bordereau (format *Pochette colis*) sur papier ordinaire.
3. Ouvrir l'enveloppe, remplacer le bordereau précédent, refermer.

L'enveloppe est **réutilisable** : seul le bordereau imprimé change à chaque envoi. Le contenu est automatiquement mis en page pour remplir la fenêtre de lecture de l'enveloppe : destinataire bien visible, pictogrammes IATA, départements et température d'envoi.

---

### Configuration (Administrateurs)

- Nom et sous-titre de l'application.
- Messages d'accueil au format Markdown.
- Laboratoires du réseau : adresses complètes, numéros de fax, réfrigérant par défaut.
- Températures et comportement du réfrigérant.
- Transporteurs.
- Seuils d'alarme (transit trop long, potentiellement perdu).
- Couleurs des badges de statut.
- Thème (clair/sombre/personnalisé avec CSS injecté).
- Format de bordereau par défaut.
- Laboratoires externes (hors-grappe) avec sous-laboratoires.

---

### Gestion des utilisateurs (Administrateurs / Superviseurs)

- Création de comptes avec numéro employé, laboratoire et rôle.
- Réinitialisation de mot de passe.
- Activation / désactivation de compte.
- Comptes de test (sans contrainte de mot de passe, sans changement obligatoire).
- Journal d'audit des modifications sur les envois. 

---

## Captures d'écran


### Connexion

![Page de connexion](docs/screenshots/login.png)

*Écran de connexion avec photo de fond aléatoire et mode sombre disponible.*

---

### Intra-grappe — Créer un envoi

![Formulaire de création d'envoi](docs/screenshots/nouvel-envoi.png)

*Formulaire de création : destinataire, spécimen, température, département, liste SILP.*

![Envoi sans liste SILP](docs/screenshots/nouvel-envoi-hsilp.png)

*Case cochée : avertissement inline et numéro HSILP généré automatiquement.*

![Modal confirmation HSILP](docs/screenshots/modal-hsilp.png)

*Modal de confirmation affiché lors du cochage de la case.*

---

### Intra-grappe — Réception

![Réceptionner un envoi](docs/screenshots/reception.png)

*Envoi trouvé par numéro de liste. Confirmation ou signalement de problème. Seuls les envois destinés au laboratoire de l'utilisateur peuvent être réceptionnés*

---

### Intra-grappe — Résumé et historique

![Résumé labo](docs/screenshots/resume.png)

*Vue tabulaire filtrée, onglets envoyés/à réceptionner/reçus, bouton export PDF.*

![Historique des envois](docs/screenshots/historique.png)

*Tableau complet avec compteurs (total, ce mois, en transit, labos actifs).*

![Détail d'un envoi](docs/screenshots/detail-envoi.png)

*Modal de détail avec actions : imprimer, modifier, déclarer perdu.*

![Modifier un envoi](docs/screenshots/modifier-envoi.png)

*Modal de modification : transporteur, température, réfrigérant, départements.*

---

### Hors-grappe — Créer un envoi

![Formulaire hors-grappe](docs/screenshots/nouvel-envoi-hg.png)

*Sélection du sous-laboratoire, chips pour les numéros SILP multiples.*

![Modal succès hors-grappe](docs/screenshots/succes-hg.png)

*Impression obligatoire avant fermeture (déverrouillage conditionnel).*

---

### Hors-grappe — Confirmations

![Tableau des confirmations](docs/screenshots/confirmations-hg.png)

*Suivi des confirmations avec saisie fax et indicateur de statut.*

---

### Page de confirmation publique

![Recherche par N° + code](docs/screenshots/confirm-recherche.png)

*Accessible sans compte. N° d'envoi et code de vérification imprimés sur le F-G-74.*

![Formulaire de confirmation](docs/screenshots/confirm-formulaire.png)

*Formulaire bilingue avec conformité, types de non-conformité et détails.*

---

### Documents imprimés

![Bordereau intra-grappe](docs/screenshots/bordereau-intra.png)

*Format lettre pliée : étiquette (haut) + bordereau avec code-barres (bas).*

![F-G-74 hors-grappe](docs/screenshots/fg74.png)

*F-G-74 bilingue avec QR code, code-barres N° envoi et code de vérification.*

---

### Configuration et administration

![Configuration — Laboratoires](docs/screenshots/config-labos.png)

*Adresses complètes, numéros de fax par département, réfrigérant par défaut.*

![Configuration — Alarmes](docs/screenshots/config-alarmes.png)

*Seuils d'alarme configurables : transit trop long (heures) et potentiellement perdu (jours).*

![Configuration — Labos externes](docs/screenshots/config-labos-hg.png)

*Laboratoires destinataires hors-grappe avec support des sous-laboratoires.*

![Gestion des utilisateurs](docs/screenshots/utilisateurs.png)

*Création de compte avec sélection du rôle (Technicien, Superviseur Labo, Superviseur Grappe, Administrateur).*

![Récapitulatif PDF](docs/screenshots/rapport-pdf.png)

*Export PDF du résumé, avec en-tête OPTILAB et tableau des envois groupés.*

---

## Architecture technique

```
┌──────────────────────────────────────────────────────────┐
│                    Navigateur (client)                    │
│          HTML5 · CSS3 · JavaScript vanilla (SPA)          │
│   public/index.html  ·  public/js/app.js  ·  public/css/ │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS / WebSocket (Realtime)
┌───────────────────────▼──────────────────────────────────┐
│                        Supabase                           │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  PostgreSQL  │  │   Auth   │  │     Realtime       │  │
│  │  + RLS       │  │  (JWT)   │  │  (WebSocket)       │  │
│  └──────────────┘  └──────────┘  └────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐   │
│  │         Edge Function : manage-user (Deno)         │   │
│  │   Création et modification de profils utilisateurs  │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                        │ Git push → déploiement automatique
┌───────────────────────▼──────────────────────────────────┐
│              Cloudflare Pages (hébergement)               │
│   Site statique · dossier public/ · domaines multiples    │
└──────────────────────────────────────────────────────────┘
```

| Composant | Technologie |
|-----------|-------------|
| Frontend | HTML5, CSS3, JavaScript ES6 (sans framework) |
| Base de données | PostgreSQL via Supabase |
| Authentification | Supabase Auth (JWT, email/password) |
| Temps réel | Supabase Realtime (WebSocket) |
| Hébergement | Cloudflare Pages (site statique) |
| Génération PDF | jsPDF 2.5.1 + jsPDF-AutoTable 3.5.31 |
| Codes-barres | JsBarcode 3.11.6 (CODE128) |
| QR codes | QRCode.js 1.0.0 |

---

*Développé par Patxi VIEL*
