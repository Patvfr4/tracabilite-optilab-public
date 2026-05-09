# Changelog

Toutes les modifications notables de ce projet sont documentées ici.  
Format : `BETA MAJEUR.MINEUR.CORRECTIF` — incrémentation du correctif pour les bugs, du mineur pour les nouvelles fonctionnalités.

---

## [BETA 1.9.6] — 2026-05-09

### Fonctionnalité — Configuration par grappe

- Nouveau concept de **grappe** : table `grappes`, table `grappe_config` (miroir de `app_config` scopé par grappe), colonne `grappe_id` sur `laboratories`.
- **Migration `024_grappes.sql`** : crée les tables, insère « Grappe 1 — Bas-Saint-Laurent / Gaspésie (BSL-GAS) », rattache tous les labos existants, migre les 6 paramètres concernés (`alarm_hours`, `alarm_days`, `transporters`, `hgrappe_alarm_days`, `hgrappe_auto_close_days`, `hgrappe_confirm_by_numero`).
- Nouvel onglet **Grappe** dans Config (remplace Réseau) : nom de la grappe, sélecteur multi-grappes (admin), liste des labos, transporteurs, alarmes intra et HG, confirmation par numéro.
- Nouvelles fonctions : `loadGrappeConfig(grappeId)`, `saveGrappeCfg(key, value)`, `renderCfgGrappe()`, `switchCfgGrappe(grappeId)`.
- Les fonctions `saveAlarms`, `addTrans`, `removeTrans`, `saveHGAlarms`, `saveHgrappeConfirmByNumero` écrivent désormais dans `grappe_config`.
- `loadGrappeConfig` est appelé après `loadLabs` dans `finaliserConnexion` pour peupler `CFG` avec les valeurs de la grappe active.

### Fonctionnalité — Modal laboratoire : notifications par labo

- L'activation des notifications (master + types NC / Perdu / Alarme) est désormais **configurable par laboratoire** dans le modal « Modifier le laboratoire ».
- Stocké dans `module_config` avec `module='notifications'`, `active` = master, `config = {nc, lost, alarm}`.
- La section globale "Notifications" ne conserve plus que le master système + provider + email de secours. Les types d'événements disparaissent du niveau global.

### Fonctionnalité — Emails de notification dans le modal laboratoire

- La section « Adresses email par département » est retirée de l'onglet Notifications (Config) et intégrée dans le **modal de modification du laboratoire correspondant**.
- Chargement frais depuis la DB à chaque ouverture du modal. Ajout / suppression d'email rafraîchit la section en place sans fermer le modal.

### Amélioration — Affichage des labos dans la liste des utilisateurs

- La colonne Laboratoire de la table utilisateurs affiche désormais tous les labos assignés avec un indicateur coloré : point bleu + badge **Resp.** pour les responsables, point gris pour les techniciens.

### Amélioration — Formulaire d'assignation de labos utilisateur

- Remplace la liste complète de tous les labos (checkboxes désactivées) par une interface en deux parties : labos déjà assignés (avec rôle éditable et bouton ×) + ligne « Ajouter » (sélecteur des labos non assignés + rôle + bouton).

### Amélioration — Suppression de l'heure d'envoi des notifications

- Le champ « Heure d'envoi du lot » retiré de la config Notifications (l'heure est gérée par le cron externe, non configurable dans l'app).

### Correction — F-G-74 : Option 1 conditionnelle selon la config

- Si **Confirmation par numéro d'envoi** est désactivé dans Config > Grappe, l'**Option 1 (QR code + URL)** n'apparaît plus dans le F-G-74.
- L'Option 2 Fax est alors renommée « Confirmation par fax / By fax » (sans numéro, sans la mention « si confirmation en ligne non disponible »).

---

## [BETA 1.9.5] — 2026-05-08

### Fonctionnalité — Autorisations par laboratoire

- Nouveau système de **rôles par laboratoire** via la table `user_lab_memberships` : un utilisateur peut être `technicien` dans un labo et `responsable` dans un autre.
- **Responsable** : peut modifier et annuler n'importe quel envoi de son laboratoire (pas seulement les siens). Le `technicien` ne peut modifier que ses propres envois.
- Formulaire utilisateur entièrement revu : remplace le sélecteur "labo principal + labos secondaires" par une liste de laboratoires avec checkbox + dropdown rôle par ligne. Badge **R** dans la colonne Laboratoire pour les responsables.
- `current_labo_ids()` mise à jour : lit depuis `user_lab_memberships` pour les utilisateurs non-admin (avec fallback sur `labo_ids` legacy).
- Nouvelle fonction SQL `current_lab_role(labo_id)` : retourne le rôle du user courant pour un labo donné.
- `annuler_envoi()` mise à jour : vérifie que l'appelant est créateur, responsable du labo, ou superviseur/admin.
- **Migration `023_user_lab_memberships.sql`** : crée la table, les RLS, met à jour les fonctions SQL, et migre les utilisateurs existants (tous en `technicien` sur leurs labos actuels).

---

## [BETA 1.9.4] — 2026-05-08

### Fonctionnalité — Onglet Modules dans la configuration

- Nouvel onglet **Modules** dans la page Config (accessible aux admins/superviseurs).
- Vue d'ensemble de tous les modules activables par laboratoire : **Bons de départ** et **Hors-grappe**, avec toggles directs (sauvegarde immédiate, pas de bouton Enregistrer).
- Les sections BD et HG sont retirées de leurs onglets respectifs (Envois et Hors-grappe).

### Fonctionnalité — Modal de modification de laboratoire

- La liste des laboratoires (Config > Réseau) utilise désormais un **modal** à la place de l'expansion inline.
- Le modal regroupe : coordonnées (adresse, téléphone), numéros de fax F-G-74, et les **toggles de modules** (BD + HG) pour ce laboratoire.
- Les badges **BD** / **HG** apparaissent dans la liste pour voir d'un coup d'œil les modules actifs par labo.
- Synchronisation bidirectionnelle : modifier les modules dans le modal ou dans l'onglet Modules met à jour le même état.

### Fonctionnalité — Hors-grappe migré vers module_config

- `hgrappeEnabledLabs` migré de `app_config` vers `module_config` (même source de vérité que BD).
- `loadConfig()` charge BD et HG en une seule requête `module_config` au lieu de deux sources distinctes.
- `toggleModuleLab('hgrappe', ...)`, `saveLabModal()` et `saveHgrappeLabs()` écrivent tous dans `module_config`.
- **Migration `022_hg_module_config.sql`** : copie les données existantes de `app_config` vers `module_config`.

### Fonctionnalité — Bons de départ : module V2 activable par laboratoire

- Les bons de départ passent sous le **système de modules V2** : activation par laboratoire stockée dans la nouvelle table `module_config` (remplace `app_config.bons_depart_enabled_labs`).
- Quand les bons de départ sont activés pour un laboratoire, le champ **Transporteur** disparaît du formulaire de création d'envoi. Il n'est plus requis à cette étape.
- Le transporteur est désormais **choisi à la création du bon** : chaque envoi en attente affiche un dropdown transporteur dans la liste de sélection (intra + HG).
- Plusieurs transporteurs par bon possibles — les sections sont créées automatiquement lors de la validation (`create_bon_depart`).
- Pour les envois déjà créés avec un transporteur, ce dernier est pré-sélectionné dans le dropdown et reste modifiable.
- Même logique dans la modal « Ajouter des colis » à un bon existant.
- **Migration `021_module_config.sql`** : table `module_config`, fonction `is_module_active()`, `envois.transporteur` rendu nullable, mise à jour de `create_bon_depart` et `add_envois_to_bon` avec paramètre `p_transporteur_map JSONB` optionnel.

---

## [BETA 1.9.3] — 2026-05-07

### Fonctionnalité — DataMatrix sur les bordereaux

- DataMatrix généré par `bwip-js` encodant le numéro interne de l'envoi (`SILP-XXXXXX` / `HSILP-XXXXXX`) ajouté dans la section expéditeur des trois formats de bordereau (Grille, Pochette labo, Pochette portrait).
- Aligné à droite du nom et de l'adresse de l'expéditeur, taille contrainte à la hauteur de la zone (16mm).
- Usage prévu : scan à la réception, création de bons de départ, mode chauffeur V2.

### Fonctionnalité — Scan DataMatrix dans la création de bon de départ

- Champ de scan ajouté en haut de la vue « Nouveau bon de départ », auto-focalisé à l'ouverture.
- Scanner le DataMatrix d'un bordereau coche automatiquement l'envoi correspondant dans la liste et le scrolle dans la vue.
- Feedback immédiat : message inline si déjà sélectionné, toast d'erreur + vibration du champ si numéro introuvable.
- Compatible saisie manuelle (numéro + Entrée).

### Fonctionnalité — Notifications non-conformités HG

- Les non-conformités déclarées via la **page publique** (`confirm_envoi_hgrappe`) insèrent désormais une entrée dans `notification_queue` avec `type: 'hg_nc'`.
- Les non-conformités saisies via la **modal fax** (`saveHGFaxConfirm`) déclenchent la même notification.
- `details` JSONB inclut : types de NC, commentaire, nom du réceptionnaire, méthode (`online` ou `fax`).
- **Migration `020_hg_nc_notifications.sql`** : redéploiement de `confirm_envoi_hgrappe` avec logique de notification.

### Améliorations — Bordereaux impression

- **Textes anglais supprimés** de la boîte de température : traduction anglaise (`tempMentionEn`), `CARBON DIOXIDE, SOLID — UN 1845`, sous-titre anglais CANUTEC (`canutecLabelEn`).
- **Police de température agrandie** : +8pt sur tous les formats (30pt / 32pt pour les mentions courtes, au lieu de 22pt / 24pt).
- **Glace sèche** : la boîte de température n'affiche que la mention principale (`Congelé : Glace sèche comme réfrigérant`), sans la plage de température (`-20°C`).
- **Police glace sèche boostée** : quand `hasDryIce`, la police est forcée à un palier supérieur (28pt pochette, 30pt grille) même si le texte est long.

### Librairies d'impression — passage en local

- `jsbarcode`, `qrcode.min.js` et `bwip-js` (nouveau) servis depuis `/lib/` (dossier local), plus de dépendance CDN pour les fonctionnalités d'impression.
- **Raison** : les CDN indisponibles le matin bloqueraient l'impression des bordereaux, flux critique du workflow quotidien.

---

## [BETA 1.9.2] — 2026-05-05

### Fonctionnalité — Annulation logique d'un envoi

- **Soft delete** : un envoi peut être annulé depuis le modal de modification (bouton « Annuler l'envoi »). L'envoi reste en base pour la traçabilité mais disparaît de toutes les vues de l'application (liste active, historique, résumé, statistiques, PDF). Seul le panel **Recherche** retrouve les envois annulés.
- **Statut `Annulé`** : le statut change en `Annulé` (nouveau statut ajouté à la contrainte `envois_statut_check`) et `annule_at`, `annule_par_nom`, `annule_note` sont renseignés.
- **Motif obligatoire** : le modal d'annulation exige un commentaire avant confirmation.
- **Visibilité du motif** : affiché dans le détail de l'envoi (via Recherche) uniquement pour les superviseurs et admins.
- **Entrée d'audit** : l'annulation est tracée dans `envois_audit` avec action `ANNULATION`.
- **Badge 🚫** : dans les résultats de Recherche, les envois annulés affichent un badge rouge distinct.
- **Accès** : même règle que la modification — technicien pour ses propres envois, superviseur/admin pour tous.
- **Migration `019_annulation_envoi.sql`** : colonnes `annule_at`, `annule_par_id`, `annule_par_nom`, `annule_note` + contrainte statut étendue + RPC `annuler_envoi` + contrainte audit étendue.

### Correction — Modification d'un envoi dans un bon de départ

- **Blocage** : si l'envoi est dans un bon de départ actif, le bouton « Enregistrer » est désactivé et un toast d'avertissement s'affiche à l'ouverture du modal.
- **Vérification réelle en base** : la vérification interroge `bons_depart_envois` + `bons_depart` pour confirmer l'existence d'un bon actif, au lieu de se baser uniquement sur le statut.
- **Court-circuit** : si le labo expéditeur n'a pas les bons de départ activés (`bonsDepartEnabledLabs`), aucune requête inutile n'est faite.
- **Garde-fou** dans `saveEditEnvoi` : la sauvegarde est bloquée si le bouton est désactivé.

### Correction — Recherche par numéro SILP

- Remplacement du filtre `numeros_silp::text ILIKE` (cast texte non fiable via PostgREST, échec silencieux) par `.contains('numeros_silp', [q])` (opérateur `@>` natif, utilise le GIN index). La recherche partielle sur SILP est abandonnée ; le numéro complet est requis (cohérent avec la saisie par scanner).
- Texte d'aide de l'onglet Recherche mis à jour pour refléter cette contrainte.

### Amélioration — Bons de départ

- Le numéro interne de l'envoi (`SILP-YYMMDD-NNNNN`) est affiché en secondaire sous le numéro de liste SILP dans le détail d'un bon et à l'impression. S'applique uniquement aux envois intra avec au moins une liste SILP.

---

## [BETA 1.9.1] — 2026-05-05

### Fonctionnalité — QR code via sous-domaine (compatibilité scanner HID)

- **Problème résolu** : les scanners code-barres en émulation clavier AZERTY transformaient `?` en `É` et `/` en `é`, rendant les QR codes du F-G-74 illisibles par les navigateurs.
- **Solution** : le QR code encode désormais `UUID.c.optilab.ca` (uniquement lettres hex, chiffres, tirets et points). Aucun caractère spécial susceptible d'être recodé par le scanner.
- **Flux** : à l'ouverture de `UUID.c.optilab.ca`, `index.html` détecte le sous-domaine UUID via regex, redirige vers `/confirm/?token=UUID`. La page `/confirm` charge l'envoi par token — flux déjà existant.
- **Infrastructure requise** : enregistrement DNS wildcard `*.c` (CNAME → app Render) + domaine personnalisé `*.c.optilab.ca` ajouté dans le dashboard Render.
- Le N° d'envoi + code de vérification imprimés sur le F-G-74 pour la saisie manuelle restent inchangés.

### Fonctionnalité — KPI hors-grappe

- **4e carte KPI** : nouvelle carte « Hors-grappe » (violet) dans le panneau KPI affichant le volume total HG et le nombre de confirmations reçues (ex. « 3 / 5 confirmés »).
- **Migration `018_kpi_hg.sql`** : `get_labo_kpis` retourne désormais `hg_total` et `hg_confirmed` dans `stats_globales`, et fusionne les flux quotidiens intra + HG dans `flux_quotidien`.

### Améliorations — Impression

- **Pictogramme matière dangereuse agrandi** : le losange UN occupe désormais tout l'espace disponible dans les formats grille, pochette labo paysage et pochette portrait. Les largeurs de colonnes et ratios de grille s'adaptent automatiquement selon `isSpecDiamond`.
- **Texte « Spécimen humain exempté » sur 3 lignes** : dans les formats pochette, chaque mot est affiché sur sa propre ligne avec une taille de police plus grande (jusqu'à 26pt).
- **Losange diamant — textes repositionnés** : positions Y recalculées pour maximiser l'espacement ; `textLength` ajusté pour éviter le débordement sur le trait de bord ; tailles de police agrandies (UN : 18→22pt Cat A, 15→20pt biohazard).
- **Glace sèche supprimée** : le second losange « glace sèche » (UN 1845) n'est plus généré. La mention reste dans la boîte température si applicable. La fonction `mkDryIceLabel` est retirée.
- **Resize des SVG carrés** : la détection du type de SVG (carré vs rectangulaire) est faite via `viewBox` — les SVG pictogrammes sont redimensionnés en bloc carré, les autres par scale.

### Corrections

- **Préfixe SILP- sur les envois HSILP** : la migration `017_fix_hsilp_prefix.sql` corrige le trigger `generate_envoi_numero()` et renomme les envois existants avec un mauvais préfixe (`SILP-` → `HSILP-`).
- **Bouton Imprimer dans les modals « En attente »** : `canPrint` inclut désormais le statut `En attente` pour les envois intra et HG.
- **Badge « En attente » hors-grappe** : `classeBadgeHG` retournait `'bt'` (bleu) au lieu de `'ba'` (ambre) pour le statut `En attente`.
- **Modifier un envoi HG « En attente »** : `canEdit` inclut désormais `En attente` pour les envois hors-grappe.
- **Message d'erreur réception « En attente »** : le message inline indique désormais explicitement que l'envoi n'a pas encore été déclaré expédié par l'expéditeur.
- **Largeur colonne Statut** : les colonnes statut des tableaux résumé intra (80px→100px) et HG (90/95px→130px) sont élargies pour afficher « En attente » sans troncature.
- **Bouton « Créer un bon »** : la classe `bsmi` (qui écrasait la couleur primaire) est retirée — contraste et lisibilité restaurés.

### Nettoyage de code

- `dryIceLabel` : paramètre retiré des 3 signatures de fonctions renderer et de tous les appels (n'était jamais utilisé dans les corps de fonctions).
- `mkDryIceLabel` : fonction supprimée (code mort depuis la suppression du losange glace sèche).
- `labMm` : chaîne de ternaires imbriqués remplacée par une table de lookup `{grille:[43,85], pochette_labo:[72,90], pochette_portrait:[60,82]}`.
- Branche `else if(fmt==='grille')` dupliquée collapsée en un seul `else`.
- BOM UTF-8 parasite retiré de `kpi.js`.

---

## [BETA 1.9.0] — 2026-05-04

### Fonctionnalité — Numéros SILP multiples + identifiant interne d'envoi

- **`numero_liste` supprimé** : remplacé par deux nouveaux champs — `numero` (identifiant interne unique) et `numeros_silp` (tableau TEXT[] des listes de repérage physiques). Migration automatique des données existantes via `016_numeros_silp.sql`.
- **Numéro interne** : auto-généré par trigger BEFORE INSERT depuis la séquence `envoi_seq`. Format `SILP-YYMMDD-NNNNN` pour les envois avec liste(s) SILP, `HSILP-YYMMDD-NNNNN` pour les envois sans liste (ex-HSILP). Le préfixe est déterminé automatiquement selon `array_length(numeros_silp)`.
- **Listes SILP multiples** : le formulaire de création utilise maintenant un système de chips (scanner ou saisie + touche Entrée), identique aux envois hors-grappe. Minimum 1 liste, sans limite maximale.
- **Doublon SILP actif** : si un numéro SILP saisi est déjà présent dans un envoi actif (En transit / En attente), un modal de confirmation s'affiche avec le numéro d'envoi, le **statut** (badge), l'expéditeur, le destinataire et la date. L'utilisateur peut continuer ou annuler.
- **Réception** : accepte le numéro interne `SILP-` / `HSILP-` (match direct, pas de confirmation supplémentaire) OU n'importe quel numéro SILP du tableau. Si l'envoi est `En attente` (bon de départ non récupéré), un message bloquant l'indique. Toutes les listes SILP associées s'affichent dans la fiche de réception pour vérification.
- **Bordereau** : le code-barres CODE128 imprime le numéro interne (`SILP-`/`HSILP-`). La ligne « Liste(s) SILP » liste les numéros physiques si applicable.
- **Tableaux** (historique, résumé) : premier numéro SILP affiché + badge `+N` si plusieurs. Les envois HSILP affichent leur numéro interne.
- **Recherche globale** : cherche dans `numero` (ilike) ET `numeros_silp::text` (ilike) avec déduplication, en plus des envois HG et bons de départ déjà couverts.
- **Index** : GIN sur `numeros_silp`, B-tree sur `numero` pour les performances de recherche.
- **Page d'aide** : nouvelle section accessible depuis le bouton `?` en bas de la barre latérale, avec guides imprimante, session/connexion, confirmation HG, et FAQ accordéon (8 questions). Les 4 cartes sont collapsibles nativement (`<details>`).

---

## [BETA 1.8.1] — 2026-05-03

### Fonctionnalité — Bons de départ

- **Nouveau module `bons-depart.js`** : regroupe les envois en attente (intra + hors-grappe) en un document de départ imprimable, désactivable par labo depuis le panneau admin.
- **Statut « En attente »** : les envois créés lorsque les bons de départ sont activés passent en attente au lieu d'aller directement en transit ; le transit débute à la récupération du bon.
- **Création de bon** : sélection des envois en attente, sections par transporteur avec date/heure de prise en charge.
- **Impression** : mise en page portrait en sections par transporteur, sous-sections par destination, avec comptage des colis. Labo parent affiché pour les envois HG vers un labo enfant.
- **Verrouillage** : le bon n'est plus modifiable si un envoi est reçu ou si la date de prise en charge est saisie (`isEditable`). Bandeaux visuels ambre (verrouillé) et vert (récupéré).
- **Statut auto « récupéré »** : trois triggers DB (`trg_bd_section_completion`, `trg_envois_bon_completion`, `trg_hgrappe_bon_completion`) appellent `check_bon_completion()` (SECURITY DEFINER) pour basculer le statut sans intervention frontend.
- **Ajout de colis** : possibilité d'ajouter des envois à un bon actif non verrouillé.
- **Infos bon dans les modals d'envoi** : les modals détail intra et HG affichent le bon de départ lié avec lien direct.
- **`date_prise_en_charge`** : champ datetime, futur interdit (`max = maintenant`), converti en ISO pour stockage.
- **Indexes partiels** : `WHERE envoi_id IS NOT NULL` / `WHERE hg_envoi_id IS NOT NULL` pour les performances des triggers.
- **Toggle admin** : section « Bons de départ » dans la config avec activation par labo.

### Fonctionnalité — Recherche globale étendue

- **Bons de départ** : recherche par numéro de bon (`BD-YYYY-NNNN`), badge « Bon dép. », clic → navigation directe vers le détail du bon.
- **Listes SILP dans les envois HG** : recherche dans `numeros_silp::text` (cast du tableau PostgreSQL) avec `ilike`, déduplication des résultats HG par id.
- En-têtes de colonnes renommés en « N° / Référence » et « Expéditeur / Labo » pour refléter les trois types de résultats.

### Corrections

- **Type de réfrigérant HG non saisissable** : `setHgsSGC` et `setHgeSGC` n'étaient pas exportées depuis `hgrappe.js` et donc inaccessibles depuis les boutons HTML inline. Corrigé — les deux fonctions sont maintenant exportées et exposées sur `window`.
- **Adresse des labs parents sans enfant sur les bordereaux** : `adresseDestHG` utilisait uniquement l'objet `destLab` stocké au moment de la création de l'envoi (potentiellement périmé). La fonction consulte maintenant `state.labsExternes` comme source de vérité, alignant son comportement avec `showHgDestAddrEl`. Résout l'absence d'adresse lors des réimpressions après mise à jour de l'adresse d'un labo.
- **Brouillon `kpi.js` supprimé** de la racine du projet (doublon avec `public/js/kpi.js`).

---

## [BETA 1.8.0] — 2026-05-03

### Fonctionnalité — Notifications par email (non-conformités, perdu, alarmes)

- **Nouveau tab « Notifications »** dans la configuration (admin uniquement).
- **4 nouvelles tables** (migration 013) : `notification_config` (1 ligne de paramètres), `notification_emails` (adresses par labo × département), `notification_queue` (file d'attente), `notification_log` (historique, purge auto à 90 jours).
- **Déclencheurs** : `signaler()` et `declarerPerdu()` insèrent dans `notification_queue` après succès. Idem pour `saveHGFaxConfirm()` en cas de non-conformité HG.
- **Alarme "potentiellement perdu"** : détectée par l'Edge Function au moment du batch (compare le délai `alarm_days` de la config avec les envois encore en transit).
- **Edge Function `send-notifications`** : déclenchée via HTTP (cron externe, ex. cron-job.org). Groupe les notifications par adresse email et envoie un récapitulatif unique par destinataire. Supporte Resend (recommandé) et SMTP personnel.
- **Edge Function `test-notification`** : envoie un email de test depuis l'interface admin.
- **Routing par département** : chaque département (Biochimie, Hématologie, Microbiologie, Pathologie) peut avoir ses propres adresses. Fallback par labo, puis fallback global.
- **Historique** : 50 derniers emails affichés dans l'interface avec statut (✓/✗).
- **Cron** : plan Supabase Free compatible — utiliser cron-job.org (gratuit) pour appeler l'Edge Function à l'heure configurée avec `Authorization: Bearer <NOTIF_SECRET>`.

---

## [BETA 1.7.0] — 2026-05-03

### Fonctionnalité — Support multi-laboratoire

- **Utilisateurs rattachés à plusieurs laboratoires** : nouvelle colonne `labo_ids UUID[]` dans `profiles` (migration 012). Chaque utilisateur conserve un `labo_id` principal et peut avoir des labos supplémentaires.
- **Sélecteur de labo actif** (`lab-switch`) dans la sidebar, visible uniquement pour les utilisateurs multi-labos. Permet de basculer de contexte sans se déconnecter.
- **État `activeLabo`** dans `state.js` : toute l'application (création d'envoi, filtre résumé, réception, HG, impression) utilise désormais `state.activeLaboId` au lieu de `state.currentUser.labo_id` pour les opérations. Le changement de labo actif recharge automatiquement les données.
- **Formulaire utilisateur** : section "Accès à d'autres laboratoires" avec cases à cocher (visible pour superviseur grappe et admin). L'Edge Function `manage-user` accepte maintenant `labo_ids` à la création.
- **Politiques RLS mises à jour** : `current_labo_ids()` (nouvelle fonction SQL) utilisée dans les policies INSERT/UPDATE de `envois` et `envois_hgrappe` — un utilisateur multi-labo peut créer et modifier des envois pour tous ses labos.
- **Recherche globale** : la restriction d'accès aux envois vérifie `labo_ids` (tous les labos de l'utilisateur) plutôt que le seul labo principal.
- **`isHGEnabled`** : vérifie le labo actif dans la liste des labos HG autorisés.

---

## [BETA 1.6.0] — 2026-05-03

### Architecture

- **Refactorisation complète en modules ES natifs** : `app.js` (~2450 lignes) découpé en 9 modules (`utils.js`, `auth.js`, `ui.js`, `labs.js`, `app-config.js`, `envois.js`, `hgrappe.js`, `print.js`, `print-hg.js`) + `state.js` (bridge d'état) + `main.js` (point d'entrée).
- **`app.js` réduit à ~120 lignes** : ne contient plus que l'initialisation de Supabase, les déclarations de variables globales et le bloc `DOMContentLoaded`.
- **`print.js` et `print-hg.js` convertis en modules ES** — plus chargés comme scripts séparés dans le HTML ; importés par `main.js` et exposés sur `window` via `Object.assign`.
- **Pattern `state.js`** : bridge getters/setters `window.*` → `state.*` pour un accès unifié à l'état global dans les modules, tout en maintenant la compatibilité avec le code existant.

### Lisibilité du code

- **Renommage complet des abréviations** : `CU` → `currentUser`, `E` → `envois`, `EHG` → `envoisHG`, `LABS` → `laboratoires`, `EXT_LABS` → `labsExternes`, `ULST` → `utilisateurs`, `ST` → `termeRecherche`, `SD` → `departementsActifs`, `SGSP` → `typeSpecimen`, `SGSC` → `refrigerantChoisi`, `SILP_NO_LIST` → `sansSilp`, `HG_MODE` → `modeHG`, `HGS_LISTS` → `hgListesSilp`, `HGS_NO_LIST` → `hgSansSilp`, `_rtCh` → `canalRealtime`, `_printData` → `donneesImpression`, `_hgPrintData` → `hgDonneesImpression`, `MODAL_CACHE` → `cacheModals`, `HG_MODAL_CACHE` → `hgCacheModals`, et 20+ autres variables de pagination et formulaire.
- **Renommage des fonctions** : `sp` → `showPanel`, `ban` → `notifier`, `esc` → `escapeHtml`, `fdt` → `formatDateTime`, `fdo` → `formatDate`, `dk` → `deepKey`, `thrs` → `heuresTransit`, `ft` → `formatDuree`, `bc` → `classeBadge`, `rl` → `libelleRole`, `rb` → `classeBadgeRole`, `fmtCP` → `formaterCP`, `fmtTel` → `formaterTel`, `isG` → `estGrappe`, `isS` → `estSuperviseur`, `isAdmin` → `estAdmin`, `doLogin` → `seConnecter`, `doLogout` → `seDeconnecter`, `hgDestAddr` → `adresseDestHG`, et 20+ autres.
- Handlers HTML d'`index.html` mis à jour pour refléter les nouveaux noms de fonctions.

---

## [BETA 1.5.1] — 2026-05-02

### Sécurité

**Déconnexion automatique**
- Déconnexion après **15 minutes d'inactivité** (souris, clavier, toucher, défilement remettent le timer à zéro).
- Déconnexion automatique à la **fermeture du navigateur ou de l'onglet** : la session est désormais stockée dans `sessionStorage` au lieu de `localStorage` — elle disparaît sans code `beforeunload` fragile. Chaque onglet est une session indépendante.

**Réception — protection double-réception**
- `confirmer()` et `signaler()` ajoutent `.eq('statut','En transit')` côté serveur : si un autre utilisateur a déjà modifié l'envoi entre la recherche et la confirmation, l'opération est bloquée et la liste est rechargée automatiquement.

### Corrections

- **Export PDF alertes** — le filtre `isAlert()` est maintenant appliqué sur les données quand le mode Alertes est actif ; le titre du PDF mentionne « Alertes uniquement ».
- **Statistiques Historique** — `loadHistStats()` se recalcule à chaque changement de filtre (dates, statut, département, recherche), pas seulement à l'ouverture du panel.
- **Tableau Réceptionnés (Résumé labo)** — séparateur de groupe date corrigé : `colspan` passé de 9 à 10 (la colonne Transit n'était pas couverte).
- **Réception d'un envoi "Perdu"** — affiche un message explicite (« Cet envoi est déclaré perdu — Noter cette information… ») au lieu de « Numéro de liste introuvable ».
- **Focus champ réception** — focus automatique sur le champ de saisie à chaque activation du panel Réceptionner.

### Optimisations

**Realtime Supabase — abonnement conditionnel**
- Le canal Realtime n'est actif que sur les panels qui affichent des données live : Résumé labo, Historique, Confirmations HG, Historique HG, Résumé HG.
- Sur tous les autres panels (Réceptionner, Nouvel envoi, Config, etc.), aucun message Realtime n'est consommé.

### Page de confirmation F-G-74

**Compatibilité scanner HID (clavier FR-CA)**
- Le code QR encode désormais `domaine?confirm&n=NUMERO&c=CODE` sans `https://` ni slash — le caractère `/` n'apparaît plus, éliminant le problème de substitution `é` sur les claviers canadiens-français.
- `index.html` détecte le paramètre `?confirm` et redirige vers `/confirm/` avant le chargement de l'app.

**Améliorations UX**
- "Conforme" présélectionné à l'ouverture du formulaire.
- Focus automatique sur le champ "Reçu par".
- Touche Entrée depuis le champ "Reçu par" envoie directement la confirmation ; icône `↵` sur le bouton.
- Textes bilingues FR/EN séparés sur deux lignes distinctes (plus de mélange dans une même phrase).
- Icône boîte 3D (Lucide Box) dans le titre « Informations de l'envoi ».
- Nom du **labo parent** affiché sous le destinataire quand applicable (RPCs `get_envoi_hgrappe_by_token` et `get_envoi_hgrappe_by_numero` mises à jour).

---

## [BETA 1.5.0] — 2026-05-02

### Ajouts

**Traductions EN sur les gabarits d'impression**
- *Températures* (Config → Températures) : champ `Mention EN` par type ; pour les types avec réfrigérant, 4 champs indépendants FR/EN (glace sèche + sachet). La traduction apparaît en italique sous la mention FR sur le bordereau.
- *Numéro d'urgence* (Config → Bordereaux → Paramètres généraux) : libellé FR (`Urgences 24h`) et EN (`Emergency 24h`) configurables. Le libellé EN s'affiche en dessous si renseigné.
- *Types de spécimen* : champ "Traduction EN" (`subtitle`) ajouté dans l'éditeur de type, visible uniquement pour les types non réglementaires (boîte). Masqué pour Cat A et Cat B dont le texte bilingue réglementaire est intégré dans le pictogramme.

**Couleur configurable par température**
- Chaque type de température possède son propre color picker dans l'onglet Températures. La couleur s'applique au texte et à la bordure de la boîte température sur tous les gabarits. Remplace les clés statiques `tempFrigo/Gele/Amb` de `CFG.bordereau.styles`.

**Bordure et fond de la boîte température**
- Trois nouvelles options par température : épaisseur de bordure (0–10 px, pas 0,5), couleur de bordure indépendante, couleur de fond (checkbox + color picker).
- Appliqué sur `pochette_labo` (bordure + fond) et `grille` (fond uniquement si activé).

### Modifications

**Suppression de 3 formats d'impression**
- Formats `folded` (Lettre pliée), `etiquette` (Étiquette seule) et `pochette` (Pochette colis) retirés du code et du sélecteur de configuration. Seuls `bordereau`, `grille` et `pochette_labo` subsistent.
- `print.js` réduit de 655 à 447 lignes (−32 %). Code mort nettoyé : `tempBox`, `regRow`, `canutec` (local), `warn`, `DLIST`, `deptsHtml`.
- Format par défaut et fallback : `grille`.

**Libellé "CANUTEC" supprimé des gabarits**
- Le mot "CANUTEC" ne précède plus le numéro dans les bannières d'urgence (`pochette_labo`, `grille`) ni dans le tableau du bordereau. Le numéro s'affiche directement.

**Pictogramme Cat B — mise en page corrigée**
- Texte EN réduit de 13 à 11 pt ; `textLength` uniquement sur `line1` pour compresser (jamais pour étirer).
- Texte FR plus grand (10 pt, `#444`) et séparateur visuel fin entre les blocs EN et FR.
- Bloc de texte mieux centré verticalement dans le losange.

### Corrections

- **Crash au chargement** : apostrophes non échappées dans la description du format `bordereau` dans `CFG` — introduit lors du remplacement du tableau `formats` par script Node.js.
- **`ReferenceError: dpts is not defined`** à l'impression : variable supprimée avec le code mort lors du nettoyage, mais encore utilisée pour construire le tableau du bordereau.

---

## [BETA 1.4.0] — 2026-05-01

### Ajouts

**Favicon**
- Favicon OPTILAB ajouté sur toutes les pages (`index.html` et `/confirm`).
- Formats inclus : `favicon.ico` (racine), 16×16, 32×32, 180×180 (Apple touch), 192×192.

**Onglet Recherche globale**
- Nouvel onglet « Recherche » accessible depuis la sidebar intra-grappe et hors-grappe.
- Recherche partielle sur le numéro d'envoi dans les deux tables (`envois` et `envois_hgrappe`) simultanément.
- Résultats limités à 5 par table avec message d'avertissement si la limite est atteinte.
- Résultats triés par date décroissante avec badge Type (Intra / HG) et statut coloré.
- Accès restreint : les envois n'appartenant pas au laboratoire de l'utilisateur s'affichent avec un badge cadenas et ouvrent un modal réduit (numéro, statut, expéditeur, destinataire, date seulement — sans données sensibles).
- Pas de filtre de date : recherche sur la totalité de la base de données.
- Recherche automatique après 500 ms de pause, ou immédiate sur Entrée / bouton.

**Pagination server-side généralisée**
- Tous les onglets de consultation (Résumé Labo envoyés/reçus, Historique intra et HG, Confirmations HG, Résumé HG) utilisent désormais la pagination serveur : 10 envois par page, requête `LIMIT/OFFSET`, boutons Précédent/Suivant.
- Filtre Alertes : charge tous les candidats côté serveur, applique `isAlert()` côté client, pagine depuis le cache.
- Les statistiques des panneaux Historique (Total, Ce mois, En transit, Labos) portent sur la totalité de la base de données (note affichée sous les cards).

**Blocage des dates futures**
- Tous les filtres de date (`pfrom`, `pto`, `hfrom`, `hto`, `hgc-from/to`, `hgr-from/to`, `hgh-from/to`) ont un attribut `max = date du jour` posé au chargement de la page.

**Modals HG avec fallback serveur**
- `showHGDetail(id)` cherche d'abord dans `EHG`, puis `HG_MODAL_CACHE`, puis effectue un fetch serveur si introuvable. Affiche « Chargement… » pendant le fetch.
- `openHGFaxModal()` bénéficie du même fallback.

### Modifications

**Renommage de l'application**
- L'application est renommée **Traçabilité OPTILAB** (était *Envois - OPTILAB BSL-GAS*).
- Mise à jour dans le titre HTML, les pages de connexion, `CFG.name`, `seed.sql`, `package.json` et `README.md`.

**Suppression du statut « En attente »**
- Statut retiré du schéma PostgreSQL (`CHECK` constraint), du code JS, des filtres et des seeds.
- Les 3 entrées seed en statut « En attente » migrées vers « En transit ».

**Filtres de date — valeur par défaut J-5**
- Au login et à la bascule de mode HG, tous les filtres de date sont initialisés à J-5 / aujourd'hui (au lieu de J-30).

**Export PDF Résumé labo**
- `exportPDF()` est maintenant asynchrone et effectue des requêtes serveur avec les filtres actifs (dates, département, labo sélectionné).
- Plus de dépendance au cache local `E[]` — les envois de toute la période sélectionnée sont exportés.

**Tableaux HG**
- Colonne Source supprimée de tous les tableaux HG (Confirmations, Résumé, Historique).
- Largeur des tableaux HG corrigée : colonne Destinataire flexible, `width:100%` appliqué, `min-width` ajusté.

**Thème — détection automatique OS**
- `initTheme()` détecte automatiquement le mode sombre du système d'exploitation si aucune préférence utilisateur n'est sauvegardée.
- Suppression des blocs `@media (prefers-color-scheme: dark)` redondants dans `app.css` (remplacés par la détection JS).

**Cache E — périmètre réduit**
- `E[]` ne contient plus que : tous les `En transit` (sans limite de date) + `Reçu` et `Problème` des 7 derniers jours.
- `Perdu` retiré du cache (statut final, aucune action possible).
- `Problème` déplacé de la requête illimitée vers la requête 7 jours (statut final).

### Sécurité

**Protection des comptes administrateur**
- Les comptes de rôle `admin` ne peuvent plus être modifiés, désactivés ou réinitialisés par les rôles `superviseur_grappe` ou `superviseur_labo`.
- Protection en 3 couches : interface (boutons masqués), Edge Function `manage-user` (rejet 403), politique RLS `Modification profils` (filtre `role <> 'admin'`).

**Correction — `toggle_active` sans vérification de laboratoire**
- La fonction Edge `manage-user` — action `toggle_active` ne vérifiait pas que l'utilisateur cible appartenait au même laboratoire que le demandeur.
- Un `superviseur_labo` pouvait activer/désactiver n'importe quel utilisateur non-admin d'un autre laboratoire (la fonction utilise `adminClient` qui contourne le RLS).
- Correction : ajout de la vérification `targetProfile.labo_id !== requesterProfile.labo_id` → rejet 403, cohérent avec l'action `reset_password` qui appliquait déjà ce contrôle.

### Performance

**Optimisation de la bande passante — Option C**
- Chargement initial filtré : seuls les envois `En transit` et les envois `Reçu`/`Problème` des 7 derniers jours sont chargés au démarrage.
- Filtre par laboratoire : les techniciens et superviseurs labo ne chargent que les envois de leur laboratoire (`exp_labo_id` ou `dest_labo_id`).
- Historique réservé aux admin et superviseur grappe : panneau masqué et bloqué pour les autres rôles.
- Tous les panneaux de consultation utilisent la pagination server-side.
- Réduction estimée de la bande passante Supabase : **~97 %** par rapport à l'architecture précédente.

### Nettoyage de code

- Suppression de la variable globale `EHIST` (jamais peuplée).
- Simplification de `getResData()` : calculs `sent` et `done` supprimés (non consommés par `renderResume()`).
- Suppression du `forEach` redondant dans `initHGMode()` (bug de condition + immédiatement écrasé par les setters explicites).
- `printBordereauFromEnvoi()` et `openEditEnvoi()` : fallback `MODAL_CACHE` ajouté pour les envois non présents dans `E[]`.
- CSS : suppression de 3 blocs `@media (prefers-color-scheme: dark)` devenus redondants après la détection JS.

**Séparation des fonctions d'impression**
- Les 14 fonctions d'impression extraites de `app.js` vers deux nouveaux fichiers dédiés :
  - `public/js/print.js` (~580 lignes) : 11 fonctions intra-grappe (`printBordereauFromEnvoi`, `printBordereau`, `mkSpecLabel`, `mkDryIceLabel`, `_brdHead`, `fmtDestLabel`, `brdHtmlFolded`, `brdHtmlBordereauSeul`, `brdHtmlEtiquetteSeule`, `brdHtmlPochette`, `brdHtmlGrille`).
  - `public/js/print-hg.js` (~228 lignes) : 3 fonctions hors-grappe (`reprintHGDocsFromEnvoi`, `printHGDocs`, `printHGCombined` avec le template F-G-74 bilingue).
- `app.js` réduit de 3 260 à 2 447 lignes (−25 %).
- Aucun changement fonctionnel : les fonctions partagent le même scope `window`.

---

## [BETA 1.3.0] — 2026-04-29

### Ajouts

**Mode Hors-grappe**
- Nouveau mode d'envoi vers les laboratoires externes au réseau BSL-GAS.
- Formulaire de création d'envoi avec sélection du laboratoire externe et sous-laboratoires.
- Gestion de listes SILP multiples (chips, scan code-barres, validation anti-doublon).
- Case à cocher "Je n'ai pas de liste de repérage SILP" avec modal de confirmation.
- Numérotation automatique `HG-AAMMJJ-NNNNN` via séquence PostgreSQL.
- Modal de succès avec impression obligatoire avant fermeture (bordereau + F-G-74).
- Onglet Confirmations : tableau des envois avec statut, saisie de confirmation par fax.
- Alarmes configurables pour les confirmations manquantes.
- Résumé et historique spécifiques au mode hors-grappe.

**F-G-74 (Formulaire de confirmation de réception)**
- Génération automatique du formulaire bilingue (FR/EN) à l'impression.
- QR code vers la page de confirmation en ligne.
- Codes-barres CODE128 : numéro d'envoi et code de vérification.
- Section fax avec numéros par département (configurables par laboratoire).
- Adaptation automatique impression noir/blanc (compatible fax).

**Page de confirmation publique (`/confirm`)**
- Page accessible sans connexion, dédiée aux laboratoires destinataires externes.
- Confirmation par numéro d'envoi + code de vérification à 6 caractères.
- Formulaire bilingue avec sélection de conformité et types de non-conformité.
- Mise au point automatique sur le champ N° d'envoi (optimisé pour scanner code-barres).
- Navigation au clavier : Entrée passe du N° au code, Entrée soumet.

**Laboratoires externes**
- Nouveau référentiel `external_labs` avec hiérarchie parent/enfant.
- Interface d'administration des laboratoires externes (Configuration > Hors-grappe).
- Adresses complètes avec fallback par champ (enfant → parent).
- Texte d'étiquette personnalisable par sous-laboratoire.

**Bordereaux (nouveaux formats)**
- Format Grille colis (pochette 8×10 po).
- Redimensionnement automatique du texte destination (plus de débordement).
- Pictogrammes IATA dans tous les formats (conformité réglementaire).

**Intra-grappe — Formulaire unifié**
- Fusion des formulaires SILP et Hors-SILP en un seul formulaire.
- Case à cocher "Je n'ai pas de liste de repérage SILP" (remplace l'onglet séparé).
- Modal de confirmation à la sélection de la case.

### Modifications

- Renommage de tous les onglets de navigation pour plus de clarté.
- Configuration Hors-grappe accessible depuis le panneau Configuration.
- Numéros de fax configurables par labo et par département.
- Adresses des laboratoires intra-grappe étendues : adresse2, province, pays.

### Corrections

- Correction du décodage Punycode des QR codes (URL courte `?n=...&c=...` au lieu de l'UUID).
- Correction du débordement du texte sur la ligne de pli dans tous les formats de bordereau.
- Correction des temporisations de redimensionnement automatique (passage à `setTimeout(f, 50)`).

---

## [BETA 1.3.0] — 2026-04-28

### Ajouté

**Formulaire de création (SILP)**
- Titre mis à jour en « Créer un envoi — SILP », formulaire découpé en trois sections étiquetées — « Expéditeur & destinataire », « Spécimen & transport », « Liste de repérage & notes »
- Étoiles rouges sur tous les champs requis
- Prévisualisation des adresses sous les sélecteurs expéditeur et destinataire, mises à jour dynamiquement
- Réfrigérant par défaut par laboratoire (`glace_seche` / `sachet` / non défini) — présélectionné automatiquement à la sélection de la température
- Modal de confirmation après enregistrement : numéro de liste, bouton « Imprimer le bordereau », bouton « Nouvel envoi » ; fermeture par Échap ou clic sur le fond

**Envoi Hors SILP**
- Nouveau formulaire pour les envois sans liste de repérage SILP (pathologie, banque de sang, etc.), accessible depuis la sidebar
- Modal d'avertissement à l'ouverture décrivant les cas d'usage valides
- Numérotation automatique préfixée `HSILP` (ex. `HSILP00002`) via séquence PostgreSQL atomique — aucun risque de doublon en accès simultané
- Impression du bordereau forcée après validation ; template dédié configurable dans Config → Bordereau (défaut : Bordereau seul — Lettre)
- Fonctions DB : `hsilp_seq`, `peek_next_hsilp()`, `create_envoi_hsilp()` — migration `migration_hsilp.sql`

**Modification d'envoi**
- Bouton « Modifier l'envoi » dans la fiche détail pour les envois En transit et En attente (créateur, superviseurs labo de l'expéditeur, superviseurs grappe, admins) — désactivé pour les statuts Reçu, Perdu et Problème
- Modal d'édition pré-rempli : transporteur, température, réfrigérant, type spécimen, nb échantillons, départements, notes — numéro et destinataire non modifiables
- Proposition de réimpression du bordereau avec rappel de remplacer le document dans la boîte
- Ligne « ✎ Modifié par X — date » dans la fiche détail, chargée en asynchrone
- Table d'audit `envois_audit` : journal générique (`table_name`, `record_id`, `action`, `old_data`, `new_data`, `changed_fields`, `changed_by`) — migration `migration_audit.sql`

**Bordereau & impression**
- Nouvel onglet Config → Bordereau avec trois sections : Format d'impression, Paramètres généraux, Types de spécimen
- Cinq formats d'impression sélectionnables : Lettre pliée, Bordereau seul — Lettre, Étiquette seule, Pochette colis, Grille colis
- Paramètres généraux : titre, texte de ligne de pli, numéro CANUTEC (urgences 24h), avertissement de taille réglementaire (100×100 mm)
- Types de spécimen configurables : libellé, forme (boîte / losange), textes bilingues, numéro UN, indicateur matière dangereuse (`isDgr`)
- Mention de température sur le bordereau : champ configurable par température, affiché sur l'étiquette
- Bandeau CANUTEC sur le bordereau pour les envois de Catégorie A et B
- Taille des pictogrammes adaptative selon le format et le nombre de pictos
- Adresses complètes (adresse, ville, code postal, téléphone) pour expéditeur et destinataire dans tous les templates
- Option d'activation des bordereaux SILP dans Config → Bordereau (section Activation)

**Gestion des utilisateurs**
- Comptes de test (`is_test`) : changement de mot de passe désactivé, validation de longueur ignorée
- Audit des profils : champs `created_by`, `created_at`, `updated_by`, `updated_at` — affichés dans Mon compte et la gestion des utilisateurs
- Thème clair/sombre sauvegardé par utilisateur en base (`profiles.theme`), restauré à la connexion
- Badge « TEST » dans Mon compte ; section mot de passe remplacée par une mention explicative pour les comptes test
- Colonne Audit dans la liste des utilisateurs (créé par/le, modifié par/le)
- Case « Compte de test » dans le formulaire d'ajout/modification, visible uniquement pour les admins
- Migration `migration_users_audit.sql` : colonnes `is_test`, `created_by/at`, `updated_by/at`, `theme`

**Interface & design**
- Brand kit OPTILAB : couleur azure `#5BCBF5` (Pantone 2985), typographie Oswald, `border-radius:4px`, logos PNG officiels (couleur / blanc / noir)
- Logo OPTILAB affiché pleine largeur dans la sidebar
- Page de première connexion (CPW) : refonte visuelle identique à la page de connexion — fond photo, voiles, motif croix, logo complet, bouton thème, crédit photo

### Modifié
- **Formats de bordereau — normes canadiennes** : tous les templates utilisent désormais le format lettre (8½ × 11 po / 215,9 × 279,4 mm)
  - « Bordereau seul » : `@page{size:A4}` remplacé par `@page{size:letter}`, marges ajustées, iframe aligné sur les autres formats
  - Renommé « Bordereau seul — Lettre » — description mise à jour — migration `migration_bordereau_lettre.sql` pour mettre à jour la valeur en base
- **Export PDF résumé labo** : `jsPDF` passe à `format:'letter'` (était A4 par défaut)
- **`printBordereauFromEnvoi()`** : détecte automatiquement les envois HSILP et applique le template `hsilpBordereauFormat` ; les envois SILP utilisent le format général
- **Bouton « Imprimer » dans la fiche détail** : toujours visible pour les envois Hors SILP (indépendamment de la config), conditionnel à la config pour les envois SILP
- **Sidebar — Réceptionner** : bouton déplacé au-dessus du groupe Saisie avec style distinctif vert (fond vert doux, texte vert clair, texte gras) pour en faire l'action principale la plus visible
- **Boutons de département** : `border-radius` harmonisé avec le reste de l'interface, pleine largeur du formulaire, opacité réduite quand non sélectionné
- **Émoji sachet réfrigéré** : remplacé par ❄️ (flocon)
- **`printBordereau()`** : refonte complète pour prendre en charge les 5 formats, les types de spécimen configurables, les adresses complètes et le CANUTEC
- **Chargement config** : la clé `bordereau_cfg` est fusionnée avec les valeurs par défaut du code — les formats sont toujours ceux du code (nouvelles versions sans perte de config)

### Corrigé
- **Bouton thème — page CPW** : l'icône ne s'affichait pas car le bouton n'avait pas d'ID ; `id="cpw-theme-btn"` ajouté et enregistré dans `updateThemeBtn()`
- **Crédit photo — page de connexion** : le crédit ne s'affichait pas malgré la présence d'une source ; `:not(:empty)` CSS non fiable pour le contenu injecté par JS → remplacement par `style.display` explicite dans `initLoginBg()`
- **Crédit photo — page CPW** : élément `#cpw-credit` manquant dans le HTML ; ajouté et itéré dans `initLoginBg()` au même titre que `#login-credit`

### Supprimé
- **Configuration de logos personnalisés** : toute la fonctionnalité de logo personnalisé (application, connexion, favicon) est retirée — champs de config, prévisualisation, boutons de suppression, fonctions `applyLogo` / `applyLoginLogo` / `applyFavicon` ; les logos OPTILAB officiels sont utilisés en dur
- **Champ « Créé par »** dans le formulaire de création d'envoi

---

## [BETA 1.2.1] — 2026-04-26

### Ajouté
- **Page de connexion — voile azure** : couche `rgba(118,202,241,.12)` intercalée entre le voile sombre et le motif de croix pour accentuer l'identité de marque
- **Page de connexion — crédit photo** : mention de source affichée en bas à gauche, même style verre dépoli que le bouton thème (fond semi-transparent, bordure fine, `backdrop-filter:blur`)
- **Page de connexion — message personnalisé** : boîte positionnée à gauche de la carte, hauteur identique à la carte, message centré verticalement — masquée automatiquement si aucun message n'est configuré en base
- **Config → Thème — logo page de connexion** : nouveau champ d'import (PNG/SVG/JPG/WebP, max 500 Ko) avec prévisualisation et bouton de suppression — remplace le logo OPTILAB par défaut sur la page de connexion
- **Config → Thème — favicon par fichier** : le champ URL est remplacé par un import de fichier (même principe que le logo application), conversion base64 et stockage en `app_config`
- **Config → Thème — boutons poubelle** : suppression immédiate en base pour chacun des trois champs (logo application, logo connexion, favicon), sans passer par le bouton Enregistrer
- **Config → Thème — indicateurs de statut** : libellé « Logo personnalisé actif » / « Aucun logo — par défaut » sous chaque champ, avec coloration selon l'état

### Corrigé
- **Motif croix invisible sur la page de connexion** : la route `/img` était absente d'Express — le serveur renvoyait `index.html` à la place du SVG ; route ajoutée dans `server.js`
- **Motif croix trop grand** : `background-size:cover` étirait le SVG 400×400 sur tout l'écran ; remplacé par `background-size:400px 400px; background-repeat:repeat` pour tuiler le motif correctement
- **Opacité des croix insuffisante** : voile sombre réduit de 65 % à 55 %, opacité du motif augmentée de 18 % à 35 %
- **Logo configurable disparu après rebrand** : les éléments `.app-icon` avaient été supprimés lors du rebrand — `applyLogo()` ne trouvait plus de cibles ; éléments restaurés dans la sidebar, la carte de connexion et la carte de première connexion
- **Logo application envahi le wordmark OPTILAB** : le logo personnalisé s'affichait en supplément du wordmark au lieu de le remplacer ; corrigé via sélecteur CSS adjacent (`.app-icon.has-logo + .sb-logo { display:none }`) et redimensionnement de l'icône à la hauteur du wordmark (20 px)
- **Option emoji supprimée** : le sélecteur Emoji / Image et la grille d'emojis sont retirés de la configuration logo application — seul l'import de fichier est conservé ; la compatibilité avec les emojis déjà enregistrés en base est maintenue dans `applyLogo()`
- **Alignement des champs logo** : prévisualisation déplacée à gauche du champ de fichier, libellés, hints et boutons poubelle alignés de façon identique pour les trois entrées

---

## [BETA 1.2.0] — 2026-04-26

### Ajouté
- **Rebrand visuel** : intégration complète du brand kit OPTILAB BSL–Gaspésie — palette azure, typographies Quicksand / Mulish / JetBrains Mono
- **Logo sidebar** : wordmark OPTILAB blanc intégré en SVG inline dans l'en-tête de la barre latérale
- **Page de connexion — fond photo** : photo aléatoire sélectionnée depuis une liste configurable (`LOGIN_PHOTOS` dans `app.js`), avec chargement progressif (fade-in à la fin du préchargement)
- **Page de connexion — motif croix** : pattern OP+ILAB superposé à la photo avec voile sombre et voile azure intermédiaire
- **Page de connexion — logo complet** : logo principal OPTILAB avec mention régionale « Bas-Saint-Laurent / Gaspésie », titre et sous-titre de l'application affichés dans l'en-tête de la carte
- **Page de connexion — message personnalisé** : boîte flottante à gauche de la carte, style verre dépoli (fond semi-transparent, bordure fine, `backdrop-filter:blur`), même hauteur que la carte, message centré — masquée automatiquement si aucun message n'est configuré
- **Page de connexion — bouton thème** : bascule clair / sombre accessible directement sur la page de connexion (coin supérieur droit)
- **Page de connexion — crédit photo** : texte de source affiché en bas à gauche, même aspect visuel que le bouton thème
- **Motif croix — page de chargement** : pattern affiché sur l'écran de chargement initial — bleu (`#76CAF1`) sur fond clair, blanc sur fond sombre
- **Motif croix — sidebar** : pattern très subtil (opacité 3 %) en superposition dans la barre latérale via `::after`

---

## [BETA 1.1.0] — 2026-04-26

### Ajouté
- **Bordereau d'impression** : après la création d'un envoi, un bouton « Imprimer le bordereau » génère une page A4 avec code-barres CODE128, les informations de l'envoi et déclenche l'impression sans téléchargement
- **Bordereau depuis le modal** : le bouton est également disponible dans la fiche détail d'un envoi « En transit » lorsque l'utilisateur appartient au laboratoire expéditeur
- **Config** : option dans Configuration → Général pour activer ou désactiver le bouton d'impression du bordereau

---

## [BETA 1.0.1] — 2026-04-26

### Ajouté
- **Résumé labo** : l'onglet réception est séparé en deux — « À réceptionner » (En transit / En attente) et « Réceptionnés » (Reçu / Problème / Perdu), avec compteurs distincts
- **Historique** : trois onglets — « Colis envoyés », « À réceptionner » et « Réceptionnés » — avec les mêmes règles de statut que le résumé labo
- **Historique** : barre de filtres alignée sur le résumé labo — Du / Au, Rechercher, Statut, Département, Transporteur — avec filtrage par date d'envoi
- **Filtres** : libellé « Tous transporteurs » harmonisé en « Tous » dans tous les sélecteurs
- **Alertes** : bouton filtre dans l'historique et le résumé labo pour n'afficher que les lignes nécessitant attention — alarme R, alarme P, statut Problème et statut Perdu
- **Légende** : ajoutée dans l'historique et le résumé labo — collapsée par défaut, affiche les quatre types de lignes (alarme R, alarme P, Problème, Perdu) uniquement quand au moins un cas est présent

### Corrigé
- Icône du bouton thème sombre rendue de façon incorrecte (croissant déformé) → remplacée par le path Feather Icons `fill` dans un `viewBox 0 0 24 24`
- Le bouton « Déclarer perdu » n'est plus affiché pour les colis avec le statut « Problème » — ce statut est désormais considéré comme final au même titre que « Reçu » et « Perdu »

---

## [BETA 1.0.0] — 2026-04-26

### Ajouté
- **Nouvel envoi** : enregistrement avec labo destinataire, température, transporteur, départements, nombre d'échantillons, notes
- **Réception** : confirmation par numéro de liste, saisie d'observations, signalement de problème
- **Résumé labo** : tableaux filtrables (date, département), groupement par date d'envoi ou de réception, export PDF paysage/portrait — onglets séparés « Colis envoyés » / « À réceptionner »
- **Historique** : recherche et filtrage multi-critères (statut, labo, transporteur, période), statistiques globales
- **Alarmes** : seuil H (heures en transit) et seuil D (jours, potentiellement perdu), surlignage visuel configurable
- **Déclaration de perte** : depuis la fiche détail par les superviseurs ; restreinte aux `superviseur_labo` pour leurs propres envois/réceptions
- **Configuration** : nom de l'application, messages d'accueil Markdown, températures, transporteurs, couleurs des badges, seuils d'alarme, CSS personnalisé
- **Thème** : bascule manuelle clair/sombre persistée dans `localStorage` ; logo emoji ou image importée ; favicon configurable
- **Gestion des utilisateurs** : création, modification, activation/désactivation via Edge Function Supabase
- **Mon compte** : consultation du profil, changement de mot de passe
- **Rôles** : `technicien`, `superviseur_labo`, `superviseur_grappe`, `admin`
- **Realtime** : mise à jour en temps réel des envois via Supabase Realtime
- **Persistance de navigation** : onglet actif conservé lors d'un rechargement de page (`sessionStorage`)
- **Version** : numéro affiché dans la sidebar, injecté par le serveur depuis `package.json`
- **Sécurité** : RLS sur toutes les tables, `esc()` systématique, injection des clés côté serveur uniquement, rate limiting login
- **Architecture** : Node.js 20 + Express, Supabase (PostgreSQL + RLS + Realtime + Edge Functions), HTML/CSS/JS vanilla
