# Changelog

Toutes les modifications notables de ce projet sont documentées ici.  
Format : `BETA MAJEUR.MINEUR.CORRECTIF` — incrémentation du correctif pour les bugs, du mineur pour les nouvelles fonctionnalités.

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
