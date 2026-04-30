# OPTILAB BSL-GAS — Documentation fonctionnelle

Documentation des règles métier, du schéma de données, des politiques de sécurité et des fonctions de la base de données.

> Développé par **Patxi VIEL** — CISSS Bas-Saint-Laurent

---

## Table des matières

1. [Rôles et permissions utilisateurs](#1-rôles-et-permissions-utilisateurs)
2. [Schéma de données](#2-schéma-de-données)
3. [Politiques de sécurité RLS](#3-politiques-de-sécurité-rls)
4. [Fonctions SQL](#4-fonctions-sql)
5. [Numérotation des envois](#5-numérotation-des-envois)
6. [Statuts des envois](#6-statuts-des-envois)
7. [Classification des spécimens](#7-classification-des-spécimens)

---

## 1. Rôles et permissions utilisateurs

L'application définit quatre rôles. Chaque rôle hérite des permissions du rôle inférieur.

### Technicien

Rôle de base, attribué par défaut à la création d'un compte.

| Action | Autorisé |
|--------|----------|
| Créer un envoi depuis son laboratoire | ✅ |
| Réceptionner un envoi destiné à son laboratoire | ✅ |
| Consulter le résumé de son laboratoire | ✅ |
| Consulter l'historique | ✅ |
| Modifier ses propres informations de profil | ✅ |
| Gérer les utilisateurs | ❌ |
| Accéder à la configuration | ❌ |

### Superviseur Labo

Superviseur d'un laboratoire spécifique.

| Action supplémentaire | Autorisé |
|----------------------|----------|
| Voir les profils des utilisateurs de son labo | ✅ |
| Modifier les profils des utilisateurs de son labo | ✅ |
| Créer des utilisateurs rattachés à son labo | ✅ |

### Superviseur Grappe

Superviseur de l'ensemble du réseau.

| Action supplémentaire | Autorisé |
|----------------------|----------|
| Voir et modifier tous les profils utilisateurs | ✅ |
| Créer des envois au nom de n'importe quel labo | ✅ |
| Consulter les résumés de tous les labos | ✅ |

### Administrateur

Accès total à toutes les fonctionnalités.

| Action supplémentaire | Autorisé |
|----------------------|----------|
| Gérer les laboratoires (ajout, adresses, fax) | ✅ |
| Gérer les laboratoires externes (hors-grappe) | ✅ |
| Accéder à la configuration complète de l'application | ✅ |
| Modifier les paramètres système (températures, transporteurs, alarmes, thème…) | ✅ |

---

## 2. Schéma de données

### Table `laboratories`

Référentiel des laboratoires du réseau BSL-GAS.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | TEXT UNIQUE NOT NULL | Nom du laboratoire (ex. `AA000 - Hôpital régional de Rimouski`) |
| `active` | BOOLEAN | Actif dans l'application |
| `adresse` | TEXT | Adresse ligne 1 |
| `adresse2` | TEXT | Adresse ligne 2 (bureau, bâtiment…) |
| `ville` | TEXT | Ville |
| `code_postal` | TEXT | Code postal |
| `province` | TEXT | Province ou état |
| `pays` | TEXT | Pays |
| `telephone` | TEXT | Numéro de téléphone |
| `default_refrigerant` | TEXT | Réfrigérant par défaut : `glace_seche`, `sachet`, ou `NULL` (demander) |
| `fax_bio_hema` | TEXT | Fax Biochimie/Hématologie (F-G-74) |
| `fax_micro` | TEXT | Fax Microbiologie (F-G-74) |
| `fax_patho` | TEXT | Fax Pathologie (F-G-74) |
| `fax_general` | TEXT | Fax général du laboratoire (F-G-74) |
| `created_at` | TIMESTAMPTZ | Date de création |

---

### Table `profiles`

Profils utilisateurs, étend la table `auth.users` de Supabase.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID (FK → auth.users) | Identifiant unique, lié à l'identité Auth |
| `employee_id` | TEXT UNIQUE NOT NULL | Numéro d'employé (identifiant de connexion dans l'app) |
| `nom` | TEXT NOT NULL | Nom complet |
| `labo_id` | UUID (FK → laboratories) | Laboratoire d'appartenance |
| `role` | TEXT NOT NULL | `technicien`, `superviseur_labo`, `superviseur_grappe`, `admin` |
| `active` | BOOLEAN | Compte actif |
| `must_change_password` | BOOLEAN | Forcer le changement de mot de passe à la connexion suivante |
| `is_test` | BOOLEAN | Compte de test (pas de contrainte de longueur MDP) |
| `created_by` | TEXT | N° employé du créateur du compte |
| `updated_by` | TEXT | N° employé du dernier modificateur |
| `theme` | TEXT | Préférence de thème : `light`, `dark`, ou `NULL` (préférence OS) |
| `created_at` | TIMESTAMPTZ | Date de création |
| `updated_at` | TIMESTAMPTZ | Date de dernière modification |

---

### Table `envois`

Envois intra-grappe (entre laboratoires du réseau BSL-GAS).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `numero_liste` | TEXT UNIQUE NOT NULL | N° de liste de repérage SILP ou numéro HSILP (ex. `HSILP00001`) |
| `exp_labo_id` | UUID (FK → laboratories) | Laboratoire expéditeur |
| `dest_labo_id` | UUID (FK → laboratories) | Laboratoire destinataire |
| `temperature` | TEXT NOT NULL | Température d'envoi (label de la config) |
| `transporteur` | TEXT NOT NULL | Nom du transporteur |
| `nb_echantillons` | INTEGER | Nombre d'échantillons (optionnel) |
| `departements` | TEXT[] | Départements concernés (`BIOCHIMIE`, `HEMATOLOGIE`, `MICROBIOLOGIE`, `PATHOLOGIE`) |
| `statut` | TEXT NOT NULL | Voir [Statuts](#6-statuts-des-envois) |
| `notes` | TEXT | Notes ou instructions |
| `cree_par_id` | UUID (FK → profiles) | Utilisateur créateur |
| `cree_par_nom` | TEXT | Nom du créateur (dénormalisé pour l'historique) |
| `recep_par_nom` | TEXT | Nom du réceptionnaire |
| `recep_obs` | TEXT | Observations à la réception |
| `type_specimen` | TEXT | `exempt`, `cat_b`, `cat_a` |
| `glace_seche` | BOOLEAN | Réfrigérant glace sèche (UN 1845) |
| `ts_envoi` | TIMESTAMPTZ NOT NULL | Horodatage de l'envoi |
| `ts_recep` | TIMESTAMPTZ | Horodatage de la réception |
| `created_at` | TIMESTAMPTZ | Création de l'enregistrement |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

---

### Table `envois_audit`

Journal de toutes les modifications effectuées sur les données métier.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `table_name` | TEXT NOT NULL | Table modifiée (ex. `envois`) |
| `record_id` | UUID NOT NULL | Identifiant de l'enregistrement modifié |
| `action` | TEXT NOT NULL | `INSERT`, `UPDATE`, `DELETE` |
| `old_data` | JSONB | Valeurs avant modification |
| `new_data` | JSONB | Valeurs après modification |
| `changed_fields` | TEXT[] | Liste des champs modifiés |
| `changed_by_id` | UUID (FK → auth.users) | Utilisateur ayant effectué la modification |
| `changed_by_nom` | TEXT NOT NULL | Nom (dénormalisé) |
| `changed_at` | TIMESTAMPTZ | Horodatage |

---

### Table `external_labs`

Référentiel des laboratoires externes (destinataires hors-grappe). Supporte la hiérarchie parent/enfant.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | TEXT NOT NULL | Nom du laboratoire ou sous-laboratoire |
| `parent_id` | UUID (FK → external_labs) | Laboratoire parent (ex. CHU Québec pour ses sous-sections) |
| `adresse` | TEXT | Adresse ligne 1 |
| `adresse2` | TEXT | Adresse ligne 2 (local, service…) |
| `ville` | TEXT | Ville |
| `code_postal` | TEXT | Code postal |
| `province` | TEXT | Province ou état |
| `pays` | TEXT | Pays |
| `telephone` | TEXT | Téléphone |
| `label_text` | TEXT | Texte personnalisé pour l'étiquette du bordereau |
| `active` | BOOLEAN | Visible dans les formulaires |
| `created_at` | TIMESTAMPTZ | Date de création |

---

### Table `envois_hgrappe`

Envois hors-grappe vers les laboratoires externes.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Identifiant unique |
| `numero` | TEXT UNIQUE NOT NULL | N° d'envoi (ex. `HG-260430-00007`) |
| `source` | TEXT NOT NULL | `silp` (avec liste SILP) ou `hsilp` (sans liste SILP) |
| `exp_labo_id` | UUID (FK → laboratories) | Laboratoire expéditeur |
| `dest_ext_lab_id` | UUID (FK → external_labs) | Laboratoire externe destinataire |
| `temperature` | TEXT NOT NULL | Température d'envoi |
| `transporteur` | TEXT NOT NULL | Transporteur |
| `nb_echantillons` | INTEGER | Nombre d'échantillons (optionnel) |
| `numeros_silp` | TEXT[] | Liste des numéros de listes SILP associés |
| `statut` | TEXT NOT NULL | `En transit`, `Reçu`, `Problème`, `Aucune réponse reçue` |
| `notes` | TEXT | Notes |
| `cree_par_id` | UUID (FK → profiles) | Créateur |
| `cree_par_nom` | TEXT | Nom (dénormalisé) |
| `type_specimen` | TEXT | `exempt`, `cat_b`, `cat_a` |
| `glace_seche` | BOOLEAN | Glace sèche (UN 1845) |
| `confirm_token` | UUID UNIQUE NOT NULL | Token de confirmation (URL directe) |
| `confirm_method` | TEXT | `online` ou `fax` |
| `confirm_conforme` | BOOLEAN | `true` = conforme, `false` = non conforme, `NULL` = en attente |
| `confirm_nc_types` | TEXT[] | Types de non-conformité |
| `confirm_commentaire` | TEXT | Détails de la non-conformité |
| `confirm_recu_par` | TEXT | Nom du réceptionnaire |
| `ts_confirm` | TIMESTAMPTZ | Date/heure de confirmation |
| `ts_envoi` | TIMESTAMPTZ NOT NULL | Date/heure d'envoi |
| `created_at` | TIMESTAMPTZ | Création |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

---

### Table `app_config`

Configuration clé/valeur de l'application. Toutes les valeurs sont en JSONB.

| Clé (key) | Contenu |
|-----------|---------|
| `app_name` | Nom de l'application |
| `app_subtitle` | Sous-titre |
| `temperatures` | Tableau des températures (icon, label, ask_glace, mentions…) |
| `transporteurs` | Tableau des noms de transporteurs |
| `messages` | Messages d'accueil (login, home) |
| `alarm_r` | Seuil alarme transit trop long (heures) |
| `alarm_p` | Seuil alarme potentiellement perdu (jours) |
| `bordereau_cfg` | Configuration des formats de bordereau |
| `hsilp_bordereau_format` | Format de bordereau pour les envois HSILP |
| `print_bordereau` | Impression automatique pour les envois intra-grappe |
| `hgrappe_enabled_labs` | Liste des labos autorisés en mode hors-grappe |
| `hgrappe_confirm_by_numero` | Activation de la confirmation par numéro (vs token UUID) |
| `custom_css` | CSS personnalisé injecté dans l'application |
| `badges` | Configuration des couleurs de badges par statut |

---

## 3. Politiques de sécurité RLS

Toutes les tables ont le Row Level Security activé. Les politiques suivantes définissent qui peut lire, créer ou modifier quoi.

### Table `laboratories`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Lecture labos | Tout utilisateur authentifié | SELECT | Toujours autorisé |
| Gestion labos | Administrateurs | ALL (INSERT, UPDATE, DELETE) | Rôle = `admin` |

### Table `profiles`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Lecture son propre profil | Tout utilisateur authentifié | SELECT | `id = auth.uid()` |
| Lecture profils réseau | Superviseurs et admin | SELECT | Rôle superviseur grappe ou admin, ou superviseur labo pour son propre labo |
| Modification profils | Superviseurs, admin, soi-même | UPDATE | Soi-même, ou rôle superviseur/admin |
| Insertion profils | Service role uniquement | INSERT | Via Edge Function (le frontend ne crée jamais directement un profil) |

> La création de profils passe obligatoirement par l'Edge Function `manage-user` qui dispose des droits `service_role`. Cela garantit que l'enregistrement Auth et le profil sont créés ensemble de manière atomique.

### Table `envois`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Lecture tous envois | Tout authentifié | SELECT | Toujours autorisé |
| Créer un envoi | Techniciens (son labo), superviseurs, admin | INSERT | `exp_labo_id = labo_id_utilisateur` ou rôle superviseur/admin |
| Modifier un envoi | Expéditeur, destinataire, superviseurs, admin | UPDATE | `exp_labo_id` ou `dest_labo_id` = labo de l'utilisateur, ou rôle superviseur/admin |

> Un technicien peut uniquement créer des envois depuis son propre laboratoire. Il ne peut pas créer d'envois au nom d'un autre labo.

### Table `app_config`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Lecture config | Tout authentifié + anon | SELECT | Toujours autorisé (nécessaire pour la page de confirmation publique) |
| Gestion config | Administrateurs | ALL | Rôle = `admin` |

### Table `envois_audit`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Insérer audit | Tout authentifié | INSERT | Toujours autorisé (tout utilisateur peut enregistrer une modification) |
| Lire audit | Tout authentifié | SELECT | Toujours autorisé |

### Table `external_labs`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Lecture | Tout authentifié | SELECT | Toujours autorisé |
| Gestion | Administrateurs | ALL | Rôle = `admin` |

### Table `envois_hgrappe`

| Politique | Qui | Quoi | Règle |
|-----------|-----|------|-------|
| Lecture | Tout authentifié | SELECT | Toujours autorisé |
| Créer | Labo expéditeur, superviseurs, admin | INSERT | `exp_labo_id = labo_id_utilisateur` ou rôle superviseur/admin |
| Modifier | Labo expéditeur, superviseurs, admin | UPDATE | `exp_labo_id = labo_id_utilisateur` ou rôle superviseur/admin |

> Seul le laboratoire expéditeur (ou un superviseur/admin) peut modifier un envoi hors-grappe. Le laboratoire destinataire n'a pas accès en modification (contrairement aux envois intra-grappe).

---

## 4. Fonctions SQL

### Fonctions utilitaires

#### `current_role_name() → TEXT`

Retourne le rôle de l'utilisateur courant (`auth.uid()`).

```
current_role_name() → 'technicien' | 'superviseur_labo' | 'superviseur_grappe' | 'admin'
```

Utilisée dans les politiques RLS pour vérifier le rôle sans JOIN. Marquée `SECURITY DEFINER` pour accéder aux données de `profiles` avec les droits du propriétaire de la fonction.

#### `current_labo_id() → UUID`

Retourne le `labo_id` de l'utilisateur courant.

```
current_labo_id() → UUID du laboratoire de l'utilisateur
```

Utilisée dans les politiques RLS pour restreindre les opérations au laboratoire de l'utilisateur.

---

### Fonctions intra-grappe

#### `peek_next_hsilp() → TEXT`

Retourne le prochain numéro HSILP **sans consommer la séquence**. Utilisée pour afficher le numéro en aperçu dans le formulaire avant que l'utilisateur confirme.

```
peek_next_hsilp() → 'HSILP00001'
```

Format : `HSILP` + numéro séquentiel sur 5 chiffres (ex. `HSILP00042`).

#### `create_envoi_hsilp(...) → TEXT`

Crée atomiquement un envoi intra-grappe sans liste de repérage SILP. Génère le numéro HSILP en consommant la séquence, puis insère l'enregistrement dans `envois`.

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `p_exp_labo_id` | UUID | Labo expéditeur |
| `p_dest_labo_id` | UUID | Labo destinataire |
| `p_temperature` | TEXT | Température |
| `p_transporteur` | TEXT | Transporteur |
| `p_nb_echantillons` | INTEGER | Nb échantillons (nullable) |
| `p_departements` | TEXT[] | Départements |
| `p_notes` | TEXT | Notes |
| `p_cree_par_id` | UUID | Créateur (profil) |
| `p_cree_par_nom` | TEXT | Nom créateur (dénormalisé) |
| `p_type_specimen` | TEXT | Type de spécimen |
| `p_glace_seche` | BOOLEAN | Glace sèche |

**Retourne :** Le numéro HSILP généré (ex. `HSILP00001`).

L'atomicité garantit qu'aucun numéro n'est perdu ni dupliqué, même en cas d'accès concurrent.

---

### Fonctions hors-grappe

#### `peek_next_hgrappe() → TEXT`

Retourne le prochain numéro HG sans consommer la séquence.

```
peek_next_hgrappe() → 'HG-260430-00001'
```

Format : `HG-AAMMJJ-NNNNN` (date du jour + séquence 5 chiffres).

#### `create_envoi_hgrappe(...) → JSON`

Crée atomiquement un envoi hors-grappe et retourne le numéro et le token de confirmation.

**Paramètres :** identiques à `create_envoi_hsilp` plus :

| Paramètre | Type | Description |
|-----------|------|-------------|
| `p_source` | TEXT | `silp` ou `hsilp` |
| `p_dest_ext_lab_id` | UUID | Labo externe destinataire |
| `p_numeros_silp` | TEXT[] | Liste des numéros SILP (vide si hsilp) |

**Retourne :** `{"numero": "HG-260430-00001", "token": "uuid-du-confirm-token"}`

#### `get_envoi_hgrappe_by_token(p_token UUID) → JSON`

Récupère les informations d'un envoi hors-grappe depuis son token de confirmation UUID. Accessible sans authentification (`anon`). Utilisée par la page de confirmation publique lors de l'accès via QR code.

**Retourne :**
```json
{
  "numero": "HG-260430-00001",
  "exp": "AA000 - Hôpital régional de Rimouski",
  "dest": "Laboratoire - HEJ",
  "temperature": "Congelé (−20°C)",
  "transporteur": "Guépard",
  "nb_echantillons": 4,
  "ts_envoi": "2026-04-30T20:53:00Z",
  "statut": "En transit",
  "already_confirmed": false,
  "confirm_conforme": null,
  "confirm_nc_types": [],
  "confirm_commentaire": "",
  "ts_confirm": null,
  "confirm_recu_par": "",
  "confirm_method": null
}
```

En cas d'erreur : `{"error": "not_found"}`.

#### `get_envoi_hgrappe_by_numero(p_numero TEXT, p_verify_code TEXT) → JSON`

Récupère un envoi hors-grappe par son **numéro d'envoi** et un **code de vérification à 6 caractères**. Accessible sans authentification.

Le code de vérification est calculé ainsi : 6 premiers caractères du `confirm_token` UUID (sans tirets), mis en majuscules. Exemple : token `a3f9b2c1-...` → code `A3F9B2`. Ce code est imprimé physiquement sur le F-G-74.

Avantages par rapport au token UUID :
- L'utilisateur peut saisir manuellement le code depuis le document papier.
- Le scan du code-barres CODE128 imprimé remplit automatiquement les deux champs.
- Impossible à deviner sans le document physique (sécurité par possession).

**Retourne :** identique à `get_envoi_hgrappe_by_token`, plus le champ `token`.  
En cas d'erreur : `{"error": "not_found"}` ou `{"error": "wrong_code"}`.

#### `get_hg_confirm_cfg() → JSON`

Retourne la configuration de la page de confirmation (activation de la recherche par numéro vs par token UUID). Accessible sans authentification.

**Retourne :** `{"confirm_by_numero": true}`

#### `confirm_envoi_hgrappe(...) → JSON`

Enregistre la confirmation de réception d'un envoi hors-grappe. Accessible sans authentification.

| Paramètre | Type | Description |
|-----------|------|-------------|
| `p_token` | UUID | Token de confirmation |
| `p_conforme` | BOOLEAN | Conforme (`true`) ou non conforme (`false`) |
| `p_nc_types` | TEXT[] | Types de non-conformité |
| `p_commentaire` | TEXT | Détails |
| `p_recu_par` | TEXT | Nom du réceptionnaire |
| `p_ts_confirm` | TIMESTAMPTZ | Date/heure de réception |

Le statut de l'envoi est mis à jour : `Reçu` si conforme, `Problème` si non conforme.

**Retourne :** `{"ok": true, "statut": "Reçu"}` ou `{"error": "not_found_or_already_confirmed"}`.

---

## 5. Numérotation des envois

### Envois SILP (intra-grappe)

Le numéro est directement le numéro de la liste de repérage SILP, saisi par l'utilisateur (chiffres uniquement, validé en temps réel contre les doublons).

### Envois HSILP (intra-grappe sans liste SILP)

Séquence `hsilp_seq` gérée par PostgreSQL. Format : `HSILP` + numéro 5 chiffres.

```
HSILP00001, HSILP00002, ..., HSILP99999
```

### Envois hors-grappe

Séquence `hgrappe_seq` gérée par PostgreSQL. Format : `HG-AAMMJJ-NNNNN`.

```
HG-260430-00001
HG-260430-00002
...
HG-260501-00001   ← séquence NON remise à zéro par jour
```

> La séquence n'est pas remise à zéro chaque jour. Le format inclut la date pour faciliter la lecture humaine, mais la numérotation est globale.

---

## 6. Statuts des envois

### Intra-grappe (`envois.statut`)

| Statut | Déclencheur |
|--------|-------------|
| `En transit` | À la création de l'envoi |
| `Reçu` | Après confirmation de réception par le destinataire |
| `En attente` | Manuellement (superviseur/admin) |
| `Problème` | Signalé lors de la réception (observations obligatoires) |
| `Perdu` | Déclaré perdu manuellement (superviseur/admin) |

### Hors-grappe (`envois_hgrappe.statut`)

| Statut | Déclencheur |
|--------|-------------|
| `En transit` | À la création de l'envoi |
| `Reçu` | Après confirmation conforme (en ligne ou fax) |
| `Problème` | Après confirmation non conforme |
| `Aucune réponse reçue` | Alarme déclenchée si pas de confirmation après X jours (configurable) |

---

## 7. Classification des spécimens

L'application gère trois classifications IATA/RTMD des matières biologiques :

| ID | Label | Symbole | Référence |
|----|-------|---------|-----------|
| `exempt` | Spécimen humain exempté | Boîte blanche | IATA P650 · 2.6.2.2 |
| `cat_b` | Catégorie B — UN 3373 | Losange blanc | IATA P650 · UN 3373 |
| `cat_a` | Catégorie A — UN 2814 | Losange biohazard | IATA P602 · UN 2814 · Classe 6 |

Pour les envois congelés avec glace sèche, la mention UN 1845 (CARBON DIOXIDE, SOLID, Classe 9) est ajoutée automatiquement sur tous les documents imprimés.
