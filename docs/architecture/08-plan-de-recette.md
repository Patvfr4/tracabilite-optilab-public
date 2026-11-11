# Plan de recette — Traçabilité OPTILAB

> Dernière mise à jour : 2026-11-10 — BETA 1.10.2 (chantier « secrets et durcissement »)
> ⚠️ Tant qu'il n'existe pas de projet de développement distinct, la recette se fait sur une base de test **dédiée** : jamais de seed de démonstration ni de compte de test sur la production.
> Stack : HTML/CSS/JS vanilla · Supabase (PostgreSQL + Auth + Realtime) · Cloudflare Pages

---

## 1. Authentification & Session

- [ ] Connexion réussie (N° employé + mot de passe) → accès à l'application
- [ ] Mauvais mot de passe → message d'erreur, pas de crash
- [ ] Compte désactivé → connexion refusée avec le message générique (aucune indication sur l'existence du compte)
- [ ] Changement de mot de passe obligatoire à la première connexion
- [ ] Mot de passe de moins de 12 caractères → refusé (client et serveur), sur tous les comptes, comptes de test compris
- [ ] Mot de passe de plus de 72 octets (ex. long texte accentué) → refusé avec un message explicite
- [ ] Changement imposé : un mot de passe **identique** au temporaire → refusé (« doit être différent de l'actuel »)
- [ ] Changement imposé réussi → la session est conservée, l'application s'ouvre sans nouvelle connexion
- [ ] Changement imposé contourné (appel direct de l'API avec le jeton, avant changement) → aucune donnée métier lisible, `manage-user` refuse toute action sauf `change_own_password`
- [ ] Connexion sans jeton captcha (appel direct de `auth-gate` ou de `/auth/v1/token`) → refusée
- [ ] Inscription publique (`POST /auth/v1/signup` avec la clé publiable) → refusée (« Signups not allowed »)
- [ ] Panne de lecture du profil à la connexion → « Service momentanément indisponible », pas « identifiants incorrects »
- [ ] Ouverture de l'application sur un domaine absent de `config.js` (ex. une préversion) → message bloquant « Domaine non configuré », aucune requête vers Supabase
- [ ] Déconnexion → retour écran de connexion, données vidées
- [ ] Reconnexion automatique après expiration du token
- [X] Dernière page visitée restaurée après F5 (`sessionStorage`)
- [ ] Compte `is_test` → badge « Test » ; la carte « Mot de passe » de Mon compte est masquée, mais la règle des 12 caractères s'applique côté serveur

---

## 2. Interface générale

- [X] Thème clair / sombre — bascule fonctionnelle (page connexion + application)
- [X] Thème persisté après déconnexion / reconnexion
- [ ] Thème OS dark mode détecté automatiquement (sans préférence sauvegardée)
- [X] Logo OPTILAB affiché (sidebar, connexion, page CPW)
- [X] Photo de fond aléatoire à chaque chargement de la page de connexion
- [X] Badge de rôle et badge de mode (Intra / Hors-grappe) dans la sidebar
- [X] Messages d'accueil Markdown affichés (connexion + application)
- [X] CSS personnalisé injecté si configuré
- [X] Version de l'application affichée dans la sidebar
- [X] Tous les filtres de date bloquent la sélection dans le futur

---

## 3. Navigation & Droits d'accès

| Panneau | Technicien | Responsable¹ | Sup. labo | Sup. grappe | Admin |
|---|---|---|---|---|---|
| Nouvel envoi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Réceptionner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Résumé labo | ✓ | ✓ | ✓ | ✓ | ✓ |
| Historique | ✗ | ✗ | ✗ | ✓ | ✓ |
| Recherche | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mon compte | ✓ | ✓ | ✓ | ✓ | ✓ |
| Utilisateurs | ✗ | ✗ | ✓ | ✓ | ✓ |
| KPI | ✗ | ✗ | ✗ | ✓ | ✓ |
| Configuration | ✗ | ✗ | ✗ | ✗ | ✓ |
| HG — Nouvel envoi | ✓ | ✓ | ✓ | ✓ | ✓ |
| HG — Confirmations | ✓ | ✓ | ✓ | ✓ | ✓ |
| HG — Résumé | ✓ | ✓ | ✓ | ✓ | ✓ |
| HG — Historique | ✗ | ✗ | ✗ | ✓ | ✓ |
| Bons de départ | ✓² | ✓² | ✓² | ✓² | ✓² |

> ¹ Responsable = rôle **par labo** (membership `user_lab_memberships`), non un rôle système. Un technicien peut être Responsable sur un labo et Technicien sur un autre.
> ² Panneau visible uniquement si le module Bons de départ est activé pour ce labo.

- [ ] Tentative d'accès direct à un panneau restreint → redirection correcte
- [ ] Boutons "Déclarer perdu", "Modifier", "Annuler" masqués si l'utilisateur n'a pas les droits
- [ ] **Responsable** : peut modifier et annuler n'importe quel envoi de son labo (pas seulement les siens)
- [ ] Technicien sans rôle Responsable : ne peut modifier que ses propres envois

---

## 4. Intra-grappe — Nouvel envoi (SILP)

- [X] Sélection du laboratoire destinataire avec affichage de l'adresse complète
- [ ] Le laboratoire actif n'est pas proposé comme destinataire, y compris après un changement de laboratoire ; un envoi vers son propre laboratoire est refusé (message, puis contrainte `envois_exp_dest_distincts` en base)
- [X] Adresses expéditeur et destinataire mises à jour dynamiquement
- [X] Sélection température → réfrigérant par défaut présélectionné
- [X] Sélection Glace sèche / Sachet réfrigérant (si applicable)
- [X] Sélection multi-département (au moins un obligatoire)
- [X] Saisie numéro de liste SILP (manuel ou scan code-barres)
- [X] Anti-doublon numéro de liste → message d'erreur si déjà existant
- [X] Sélection transporteur (masqué si module Bons de départ actif pour ce labo)
- [X] Sélection type de spécimen
- [X] Saisie nombre d'échantillons et notes (optionnels)
- [X] Champs obligatoires manquants → messages d'erreur ciblés
- [X] Envoi réussi → modal de succès avec numéro de liste
- [X] Bouton "Imprimer le bordereau" dans le modal de succès (si activé en config)
- [X] Bouton "Nouvel envoi" → réinitialise le formulaire
- [ ] Mise à jour temps réel visible sur un autre poste

---

## 5. Intra-grappe — Nouvel envoi (Sans liste SILP / HSILP)

- [X] Cocher "Je n'ai pas de liste SILP" → modal de confirmation
- [X] Annuler → case reste décochée
- [X] Confirmer → champ N° masqué, aperçu HSILP affiché
- [X] Numéro HSILP prévisualisé depuis le serveur (`peek_next_hsilp`)
- [X] Envoi réussi → numéro HSILP unique généré (séquence atomique, format HSILP-YYMMDD-NNNNN)
- [X] Décocher → retour à l'état normal SILP
- [X] Impression bordereau au format HSILP configuré

---

## 6. Intra-grappe — Réceptionner

- [ ] Recherche par numéro → envoi trouvé et affiché
- [X] Envoi non destiné au labo → refus avec message
- [ ] Envoi déjà réceptionné → refus avec message
- [ ] Envoi En transit → confirmation OK
- [X] Confirmer réception → statut `Reçu`, `ts_recep` et `recep_par_nom` enregistrés
- [ ] Signaler un problème sans observations → message d'erreur
- [ ] Signaler un problème avec observations → statut `Problème`
- [ ] Mise à jour temps réel sur les autres postes

---

## 7. Intra-grappe — Résumé labo

- [X] Titre affiche le nom du laboratoire courant
- [X] Superviseur grappe / admin : sélecteur de laboratoire visible et fonctionnel
- [X] Filtres initialisés à J−5 / aujourd'hui au login
- [X] **Onglet Envoyés** — pagination 10/page
- [ ] **Onglet En attente de réception** — liste des En transit destinés au labo
- [X] **Onglet Réceptionnés** — filtré par date de réception
- [X] Filtre département : restreint les 3 onglets
- [X] Filtre dates : restreint les 3 onglets
- [X] Groupement par date d'envoi / date de réception
- [X] Compteurs sur les onglets corrects
- [X] **Mode Alertes** — n'affiche que les envois en alarme, pagination sans pages vides
- [ ] Alarme R (transit > seuil heures) → ligne rouge
- [ ] Alarme P (transit > seuil jours) → ligne bordeaux
- [ ] Statut Problème → ligne jaune
- [ ] Statut Perdu → ligne grisée italique
- [ ] Statut Annulé → ligne barrée
- [X] Légende visible uniquement si au moins un cas présent
- [X] Clic sur une ligne → modal de détail complet
- [X] Modifier un envoi En transit → formulaire pré-rempli, sauvegarde OK
- [X] Déclarer perdu (superviseurs) → statut passe à `Perdu`
- [ ] Annuler un envoi → statut `Annulé`, champ note obligatoire
- [X] Ligne "✎ Modifié par X" dans le modal si modifié
- [ ] Imprimer le bordereau depuis le modal
- [ ] **Export PDF paysage** — données correspondant aux filtres actifs
- [ ] **Export PDF portrait** — idem
- [ ] PDF (paysage et portrait) : aucun mot coupé en plein milieu (numéros, dates, statuts, en-têtes) ; date et heure sur deux lignes ; apostrophe typographique, « œ », « … », « – » et « — » imprimés tels quels (jamais « ? »)

---

## 8. Intra-grappe — Historique

- [X] Accès refusé technicien / superviseur labo → redirigé
- [X] Admin / superviseur grappe → accès, tous les labos visibles
- [ ] Statistiques (Total, Ce mois, En transit, Labos actifs) correctes
- [ ] Pagination 10/page — Précédent/Suivant
- [ ] Filtre statut (Tous, En transit, Reçu, Problème, Perdu, Annulé)
- [ ] Filtre département
- [ ] Filtre transporteur (liste dédupliquée)
- [ ] Recherche textuelle (numéro, labo, transporteur, créé par) — debounce 400 ms
- [ ] Combinaison de plusieurs filtres
- [ ] **Mode Alertes** — pagination sans pages vides
- [ ] Clic sur une ligne → modal de détail

---

## 9. Hors-grappe — Mode & Basculement

- [ ] Interrupteur Intra → HG dans la sidebar
- [ ] HG → Intra
- [ ] Mode mémorisé dans `localStorage` (persisté après F5 et reconnexion)
- [ ] Dates HG initialisées à J−5 / aujourd'hui à la première bascule
- [ ] Badge de mode mis à jour dans la sidebar

---

## 10. Hors-grappe — Nouvel envoi

- [ ] Sélection labo parent → sous-labos chargés en cascade
- [ ] Adresse destinataire avec fallback parent affichée
- [ ] Chips pour numéros SILP multiples (ajout, suppression)
- [ ] Anti-doublon entre numéros SILP saisis
- [ ] Type de spécimen, température, réfrigérant, transporteur, échantillons, notes
- [ ] Envoi réussi → numéro HG-YYMMDD-NNNNN généré
- [ ] Modal de succès — impression obligatoire (bouton "J'ai imprimé" déverrouille la fermeture)
- [ ] Case "Pas de liste SILP" → confirmation modale, numéro HSILP HG généré
- [ ] Mise à jour temps réel sur un autre poste

---

## 11. Hors-grappe — Confirmations

- [ ] Tableau paginé 10/page — Précédent/Suivant
- [ ] Filtres date et statut (Tous, En attente, En ligne, Fax, Aucune réponse)
- [ ] Filtres initialisés à J−5 / aujourd'hui
- [ ] Clic sur une ligne → modal de détail HG complet
- [ ] Bouton "Saisir fax" visible uniquement pour les envois sans confirmation
- [ ] Saisie fax : date/heure, nom, conformité, types NC, commentaire → sauvegarde OK
- [ ] Confirmation fax conforme → statut `Reçu`, badge vert
- [ ] Confirmation fax non conforme → statut `Problème`, badge orange
- [ ] Alarme HG (confirmation manquante trop longtemps) → ligne rouge
- [ ] "Aucune réponse reçue" → différencié visuellement

---

## 12. Hors-grappe — Résumé labo

- [ ] Superviseur grappe / admin : sélecteur de laboratoire
- [ ] Filtres initialisés à J−5 / aujourd'hui
- [ ] **Onglet Envoyés** — pagination 10/page
- [ ] **Onglet Confirmés** — pagination 10/page
- [ ] **Onglet En attente** — pagination 10/page
- [ ] Groupement par date d'envoi / date de confirmation
- [ ] Clic sur une ligne → modal de détail HG
- [ ] Compteurs sur les onglets corrects

---

## 13. Hors-grappe — Historique

- [ ] Accès refusé technicien / superviseur labo → redirigé
- [ ] Admin / superviseur grappe → accès, tous les labos
- [ ] Statistiques (Total, Ce mois, En transit, Confirmés) correctes
- [ ] Pagination 10/page — Précédent/Suivant
- [ ] Filtres date et statut fonctionnels
- [ ] Recherche textuelle (numéro, labo, transporteur) — debounce 400 ms
- [ ] Clic sur une ligne → modal de détail HG

---

## 14. Bons de départ (module V2)

> Module activable par labo dans Configuration → Modules.
> Quand actif : le transporteur est choisi au moment de créer le bon, pas à l'envoi.

**Activation**
- [ ] Module désactivé → panneau "Bons de départ" absent de la sidebar
- [ ] Module activé → panneau visible, champ transporteur masqué dans formulaire d'envoi
- [ ] Désactiver le module → envois existants sans bon conservent leur statut

**Création d'un bon**
- [ ] Liste des envois En transit du labo affichée (sans bon actif)
- [ ] Cases à cocher par envoi + "Tout sélectionner"
- [ ] Chaque envoi a un sélecteur transporteur (défaut = premier de la config)
- [ ] Transporteur modifiable indépendamment par envoi
- [ ] Bon créé → table `bons_depart` insérée, `bons_depart_envois` peuplée, `envois.transporteur` mis à jour par envoi

**Détail & modification d'un bon**
- [ ] Modal de détail : sections Informations, Envois, Transporteur
- [ ] Modifier une section (bon connaissement, date prise en charge) → sauvegardée
- [ ] Bon marqué `récupéré` automatiquement quand date prise en charge renseignée
- [ ] Bon marqué `récupéré` automatiquement quand tous les envois sont réceptionnés

**Actions sur un bon**
- [ ] Annuler un bon → statut `Annulé`, envois sans bon
- [ ] Retirer un envoi d'un bon → envoi revient en En transit sans bon
- [ ] Ajouter des colis à un bon existant (envois En transit non encore inclus)
- [ ] Scan code-barres → envoi identifié et ajouté au bon
- [ ] Imprimer le bon de départ → document avec liste des envois
- [ ] Bon de départ au format **Lettre** ; avec un transporteur de plus d'une page de colis, la 1re page n'est pas vide et aucune ligne n'est coupée ; départements affichés avec leur libellé

**Liste**
- [ ] Pagination 10/page
- [ ] Filtres date et statut (Actif / Récupéré / Annulé)

---

## 15. Recherche globale

- [ ] Accessible depuis sidebar intra et HG (même panneau)
- [ ] Focus automatique sur le champ à l'ouverture
- [ ] < 3 caractères → message "Entrez au moins 3 caractères"
- [ ] Recherche intra + HG → résultats triés par date décroissante
- [ ] Limite 5 par table → avertissement si atteinte
- [ ] Aucun résultat → message "Aucun résultat pour « X »"
- [ ] Envoi du labo de l'utilisateur → modal complet
- [ ] Envoi d'un autre labo → badge 🔒, modal restreint (sans spécimen, notes, traçabilité)
- [ ] Admin / superviseur grappe → toujours modal complet
- [ ] Recherche automatique après 500 ms de pause

---

## 16. Bordereaux intra-grappe

> Tester chaque format : Lettre pliée · Bordereau seul · Étiquette seule · Pochette colis · Grille colis

- [ ] Code-barres CODE128 lisible au scanner
- [ ] Adresses expéditeur et destinataire complètes
- [ ] Pictogrammes IATA conformes au type de spécimen
- [ ] Avertissement taille réglementaire si applicable
- [ ] Bandeau CANUTEC pour Catégorie A/B
- [ ] Mention réfrigérant (Glace sèche / Sachet) si applicable
- [ ] Redimensionnement automatique du texte sans débordement : sur l'étiquette seule **et** sur « étiquette + bordereau », avec un destinataire long (nom sur 3 lignes, adresse sur 2 lignes), le téléphone du destinataire et la dernière ligne des notes sont imprimés entiers
- [ ] Nom de l'expéditeur = laboratoire actif (admin sans laboratoire attitré, utilisateur multi-laboratoires), jamais « — »
- [ ] Lancement de l'impression navigateur sans téléchargement
- [ ] Format HSILP utilise le bon template

---

## 17. Documents hors-grappe (Bordereau + F-G-74)

- [ ] Bordereau de transport HG complet (labo externe, pictogrammes, réfrigérant)
- [ ] F-G-74 bilingue FR/EN
- [ ] Code-barres N° envoi lisible
- [ ] Code de vérification : **10 caractères**, imprimé par groupes de 5 (ex. `K7PMQ 4XR2D`), sans `I`, `O`, `0` ni `1`
- [ ] Code-barres du code de vérification lisible (porte le code sans espace)
- [ ] Réimpression d'un envoi : même code de vérification (immuable)
- [ ] Numéros de fax du labo expéditeur par département
- [ ] Section à compléter par le destinataire (nom, date, signature, NC)
- [ ] Impression combinée (bordereau + F-G-74) dans le même document
- [ ] Compatible impression noir/blanc (fax)
- [ ] Réimpression depuis le modal de détail HG
- [ ] **`hgrappeConfirmByNumero` = ON** : Option 1 (QR + URL) présente, Option 2 = "Option 2 — Confirmation par fax"
- [ ] **`hgrappeConfirmByNumero` = OFF** : Option 1 absente, Option 2 = "Confirmation par fax" sans numérotation
- [ ] QR code pointant vers `/confirm/?token=…` scannable

---

## 18. Page de confirmation publique (`/confirm`)

- [ ] Accessible sans connexion
- [ ] Focus automatique sur le champ N° envoi
- [ ] Navigation clavier : Entrée passe du N° au code, Entrée soumet
- [ ] Numéro invalide → message "Envoi introuvable"
- [ ] Code incorrect → message « code incorrect »
- [ ] Code saisi avec ou sans espaces, en minuscules → accepté (normalisé)
- [ ] Code hors format (moins de 10 caractères, `O`/`0`…) → message de format, **aucun appel** au serveur
- [ ] 5 échecs en 15 minutes sur un même numéro → blocage temporaire avec délai affiché
- [ ] Confirmation par numéro désactivée pour la grappe → message « confirmation en ligne indisponible, confirmer par fax »
- [ ] Ouverture par le lien du QR → le jeton disparaît aussitôt de la barre d'adresse
- [ ] `?n=<numéro>` dans l'URL → préremplit le numéro seulement ; `?c=` est ignoré
- [ ] Envoi déjà confirmé → message explicite
- [ ] Confirmation conforme → sauvegarde, message de succès
- [ ] Confirmation non conforme → type NC obligatoire
- [ ] Commentaire optionnel sauvegardé
- [ ] Formulaire bilingue FR/EN
- [ ] Visible sur mobile (responsive)

---

## 19. Temps réel

- [ ] Créer un envoi intra sur poste A → apparaît en temps réel sur poste B (destinataire)
- [ ] Réceptionner un envoi → statut mis à jour sur tous les postes
- [ ] Modifier un envoi → mise à jour visible sur les autres postes
- [ ] Modifier la configuration → visible sur tous les postes connectés
- [ ] Déconnexion réseau temporaire → reconnexion Realtime automatique

---

## 20. Mon compte

- [ ] Informations du profil affichées (nom, N° employé, labo, rôle)
- [ ] Badge "TEST" affiché pour les comptes `is_test`
- [ ] Changement de mot de passe réussi
- [ ] Nouveau mot de passe de moins de 12 caractères → message d'erreur
- [ ] Compte test → section mot de passe remplacée par mention explicative

---

## 21. Gestion des utilisateurs & Memberships

**Liste et droits**
- [ ] Liste avec rôle système, labo(s), statut, audit
- [ ] Colonne labo : dots de couleur par labo + badge "Resp." si Responsable
- [ ] Créer un utilisateur → compte Auth + profil `profiles`
- [ ] N° employé déjà existant → message d'erreur
- [ ] Modifier rôle système / nom d'un utilisateur
- [ ] Réinitialiser le mot de passe (12 caractères au moins) → `must_change_password = true`, changement imposé à la connexion suivante
- [ ] Désactiver un compte → sa session ouverte est coupée (au plus tard à l'expiration du jeton) et la connexion est refusée ; Réactiver → connexion de nouveau possible
- [ ] Passer le statut à « Inactif » depuis le formulaire « Modifier » → même effet que « Désactiver » (bannissement + sessions révoquées)
- [ ] Désactiver ou réactiver son propre compte → refusé (option masquée)
- [ ] Superviseur labo : créer un compte de rang égal au sien (superviseur labo) → refusé avec un message clair
- [ ] N° employé invalide (espaces, `@`, plus de 64 caractères) → refusé
- [ ] Activer / désactiver un compte
- [ ] Superviseur labo ne peut pas désactiver un utilisateur d'un autre labo
- [ ] Superviseur labo ne peut pas désactiver un admin
- [ ] Superviseur labo peut désactiver un technicien de son propre labo
- [ ] Personne (sauf admin) ne peut modifier un admin
- [ ] Colonne audit : créé par / le, modifié par / le

**Memberships par labo (`user_lab_memberships`)**
- [ ] Formulaire utilisateur affiche uniquement les labos avec un rôle attribué
- [ ] Ajouter un membership : sélectionner le labo puis le rôle (Technicien / Responsable)
- [ ] Labo déjà attribué disparaît du sélecteur d'ajout
- [ ] Supprimer un membership → retiré de la liste
- [ ] Sauvegarde → `user_lab_memberships` mis à jour (insert + delete)
- [ ] Responsable : peut modifier et annuler tout envoi de son labo
- [ ] Technicien : ne peut modifier que ses propres envois

---

## 22. Multi-laboratoire

- [ ] Utilisateur avec plusieurs memberships → écran de sélection au premier login
- [ ] Labo choisi mémorisé → écran sauté aux logins suivants
- [ ] Choix du labo actif → données rechargées
- [ ] Indicateur de labo actif dans la sidebar
- [ ] Bouton "Changer de labo" → retour à l'écran de sélection
- [ ] Annuler → retour sans changement
- [ ] Rôle Responsable appliqué selon le labo actif
- [ ] Création d'envoi → `exp_labo_id` correspond au labo actif

---

## 23. Configuration — Général & Interface

- [ ] Modifier nom et sous-titre de l'application → appliqué sans rechargement
- [ ] Modifier les messages d'accueil (Markdown) → affichés correctement
- [ ] CSS personnalisé injecté et appliqué
- [ ] Badges de statut : modifier couleurs → appliquées dans tableaux et modals
- [ ] Modifier les types de spécimen (libellé, pictogramme, mention DGR)
- [ ] Modifier les températures disponibles
- [ ] Format bordereau par défaut modifiable

---

## 24. Configuration — Grappe

> Onglet "Grappe" — réglages scoped à la grappe active (BSL-GAS)

- [ ] Nom de la grappe affiché en lecture seule
- [ ] **Transporteurs** : ajouter → disponible dans les formulaires d'envoi
- [ ] Supprimer un transporteur → retiré des sélecteurs (n'affecte pas les envois existants)
- [ ] Présélection automatique si un seul transporteur
- [ ] **Alarmes intra** : modifier seuil alarmR (heures) → alarmes visuelles mises à jour
- [ ] **Alarmes intra** : modifier seuil alarmP (jours) → idem
- [ ] **Alarmes HG** : modifier seuil non-réponse (jours) → sauvegardé dans `grappe_config`
- [ ] **Alarmes HG** : modifier fermeture auto (jours) → idem
- [ ] **Confirmation par numéro** : ON → Option 1 visible dans F-G-74
- [ ] **Confirmation par numéro** : OFF → Option 1 absente, Option 2 sans numérotation

---

## 25. Configuration — Modules

> Onglet "Modules" — toggles activables par labo

- [ ] Liste des labos avec colonnes Bons de départ / Hors-grappe
- [ ] Toggle BD clic → sauvegardé dans `module_config`, panel BD apparaît/disparaît pour ce labo
- [ ] Toggle HG clic → idem pour le mode HG
- [ ] Désactiver BD : envois existants conservés, champ transporteur réapparaît dans le formulaire
- [ ] Désactiver HG : panneau HG masqué pour ce labo

---

## 26. Configuration — Modal laboratoire

> Clic "Modifier" sur un labo dans l'onglet Grappe ou Modules → modal complet

- [ ] Modal ouvert avec toutes les sections (coordonnées, modules, notifications, emails)
- [ ] **Coordonnées** : adresse, téléphone, fax modifiables → sauvegardés dans `laboratories`
- [ ] **Modules** : toggles BD et HG cliquables → `module_config`
- [ ] **Notifications** : 4 toggles (Activer, NC, Perdu, Alarme) → `module_config` module='notifications'
- [ ] Notifications activées : envois NC/Perdu/Alarme de ce labo génèrent une entrée dans `notification_queue`
- [ ] **Emails** : ajouter une adresse par département → sauvegardée dans `notification_emails`
- [ ] Email "Fallback laboratoire" (dept NULL) → utilisé si aucune adresse de dept configurée
- [ ] Supprimer une adresse email → retirée
- [ ] Sauvegarde → fermeture modal + mise à jour de la liste

---

## 27. Configuration — Hors-grappe

- [ ] Ajouter / modifier / désactiver un labo externe
- [ ] Ajouter / modifier un sous-laboratoire
- [ ] Adresse avec fallback parent visible dans le formulaire HG
- [ ] Format HG configurable (Bordereau, HSILP)

---

## 28. Configuration — Notifications

> Section réduite au système global (les réglages par labo sont dans le modal lab)

- [ ] Tab "Notifications" visible uniquement pour les admins
- [ ] Activer/désactiver les notifications globalement
- [ ] Configurer le fournisseur Resend (expéditeur) → enregistrer
- [ ] Carte `RESEND_API_KEY` → Définir : la valeur n'est jamais réaffichée, le champ est vidé, la carte affiche « configuré », l'auteur et la date
- [ ] Carte `RESEND_API_KEY` → Supprimer → « non configuré » ; « Envoyer un test » échoue avec un message clair
- [ ] Double clic sur « Enregistrer » d'un secret → un seul enregistrement
- [ ] « Déclenchement automatique » : `NOTIFY_TRIGGER_SECRET` « configuré » dès l'installation ; « Régénérer » → date mise à jour, aucune valeur affichée ; l'envoi suivant fonctionne
- [ ] Un compte non admin (ou un admin qui doit changer son mot de passe) qui appelle `set_app_secret` / `list_app_secrets_status` par l'API → refusé
- [ ] Configurer le fournisseur SMTP (serveur, port, utilisateur) → enregistrer ; carte `SMTP_PASS` → Définir
- [ ] Modifier ensuite l'hôte, le port ou l'utilisateur SMTP → confirmation demandée, puis `SMTP_PASS` effacé (« non configuré ») et journalisé
- [ ] Bouton "Envoyer un test" → email reçu à l'adresse saisie
- [ ] Email de secours global → utilisé si aucune adresse labo configurée
- [ ] **Signaler un problème (intra)** → `notification_queue` insérée, envoyée au prochain batch
- [ ] **Déclarer perdu (intra)** → idem
- [ ] **Confirmation fax NC (HG)** → trigger PostgreSQL → `notification_queue`
- [ ] **Confirmation en ligne NC (HG)** → idem
- [ ] Email HTML reçu avec mise en page (badge coloré, tableau, en-tête OPTILAB)
- [ ] Historique des 50 derniers envois affiché, avec la colonne « Détail » pour les erreurs
- [ ] Alerte de surveillance (notifications en attente depuis plus de 30 h, ou URL du projet absente) → ligne « Alerte système » avec son motif
- [ ] Purge automatique des entrées > 90 jours

---

## 29. Tableau de bord KPI

- [ ] Accès réservé aux superviseurs grappe et admins
- [ ] Sélecteur de période (30 j / 60 j / 90 j) — pill active mise à jour
- [ ] Volume total (intra + hors-grappe) correct
- [ ] Taux de NC — passe en rouge si > 5 %
- [ ] Transit moyen en heures (envois intra reçus)
- [ ] Graphique de volume quotidien réactif au changement de période
- [ ] État vide si aucune donnée sur la période
- [ ] Cohérence avec les données Résumé / Historique

---

## 30. Comptes de démonstration

> Comptes créés par `supabase/seed_demo_users.sql`, **sur une base de test seulement**. Chaque compte reçoit un mot de passe aléatoire, affiché **une seule fois** dans le résultat de la requête et transmis hors bande : aucun mot de passe n'est écrit dans ce document ni dans le dépôt.

- [ ] Le script n'affiche que les comptes qu'il vient de créer ; relancé, il ne modifie ni n'affiche les comptes existants
- [ ] `DEMO-ADM01` → admin, accès complet
- [ ] `DEMO-SGR01` → superviseur grappe, historique OK, tous labos
- [ ] `DEMO-SRI01` → superviseur labo Rimouski, historique refusé
- [ ] `DEMO-TRI01` → technicien, historique refusé
- [ ] `DEMO-TMA01` → technicien Matane, ne voit que son labo

---

## 31. Installation & vérification de la base

> La base se construit **uniquement** depuis `supabase/schema.sql` (projet vierge) ; les migrations sont archivées et ne se rejouent pas. Procédure et requêtes de contrôle : [../deploiement/01-supabase.md](../deploiement/01-supabase.md) §4 à §14.

- [ ] Dernière ligne de `schema.sql` (état de l'installation) : extensions `true`, tâches `7 / 7`, secret `true`, URL `true`, « Installation complète. »
- [ ] `seed.sql` chargé : 16 laboratoires, grappe BSL-GAS, laboratoires rattachés à la grappe
- [ ] RLS activée sur toutes les tables de `public` (0 ligne sans RLS)
- [ ] `anon` n'exécute que les 4 RPC de `/confirm`
- [ ] Aucun privilège par défaut accordé à `anon`, `authenticated`, `service_role` dans `public` ni pour tous les schémas (requête `pg_default_acl` du §14 ; ceux du schéma `storage`, posés par Supabase, sont attendus)
- [ ] `cron.job` : 7 tâches actives, aucune commande contenant un secret ; pas de `send-notifications-hourly`
- [ ] `vault.secrets` (noms seulement) : `NOTIFY_TRIGGER_SECRET` présent dès l'installation
- [ ] Publication Realtime : `envois` et `envois_hgrappe` en listes de colonnes, sans `confirm_token` ni `verify_code`
- [ ] Fonctions Edge déployées : `auth-gate`, `manage-user`, `send-notifications`, `test-notification` (pas de `set-secret`), *Enforce JWT Verification* désactivé pour les 4
- [ ] Aucun Edge Function Secret applicatif (`supabase secrets list` : ni `RESEND_API_KEY`, ni `SMTP_PASS`, ni `NOTIFY_TRIGGER_SECRET`)
- [ ] Clés API héritées désactivées après les tests
- [ ] CI verte : `fonctions-supabase`, « schema.sql sur Postgres vierge » (droits exacts + tests fonctionnels), « Client », « Détection de secrets »

---

## 32. Capacité Supabase

> Analyse complète dans [07-capacite-supabase.md](07-capacite-supabase.md) — mis à jour le 2026-05-09 (BETA 1.9.6).

**Résumé des conclusions :**

- **Bande passante** : architecture actuelle déjà optimisée (filtre J−7 + pagination côté serveur) → ~181 MB/mois (3,6 % du quota Free), stable indéfiniment. ✅
- **Realtime** : ~100 000 msg/mois — non limitant. ✅
- **Stockage hors audit** : libre 5–6 ans à 200 envois/jour. ✅
- **`envois_audit`** : ⚠️ risque principal — ~438 MB/an à 200 envois/jour. **Purge automatique > 1 an requise avant mise en production.**
- **Plan Pro recommandé en production** (25 USD/mois) pour PITR, SLA, backup quotidien.

- [x] Purge `envois_audit` > 12 mois planifiée par `schema.sql` (tâche `purge-envois-audit`)
- [ ] Surveiller *Project → Reports → Database* (stockage) pendant le pilote
- [ ] Surveiller *Project → Reports → Bandwidth* (doit rester < 1 GB/mois)

---

## 33. Gestion des échantillons (module BETA 1.10.0)

> Module activable par laboratoire (`Configuration > Modules > Gestion des échantillons`).

- [ ] Activation / désactivation du module par labo depuis la configuration
- [ ] **Départ intra sans SILP (HSILP)** : la section de scan des échantillons n'apparaît que si le module est actif et l'envoi sans liste SILP
- [ ] Ajout d'un échantillon par scan ou saisie → chip créé
- [ ] Suppression d'un chip échantillon
- [ ] Anti-doublon : un même code scanné deux fois n'est pas ajouté en double
- [ ] **Départ hors-grappe sans SILP** : même comportement de scan
- [ ] Les échantillons du départ sont bien enregistrés sur l'envoi (`echantillons_depart`)
- [ ] **Réception** : champ « Nombre reçu » + scan de vérification disponibles
- [ ] Réception conforme (tous les échantillons attendus scannés) → aucune non-conformité générée
- [ ] Écart (échantillon manquant ou inattendu, ou nombre reçu ≠ attendu) → **génération automatique d'une non-conformité**
- [ ] **Édition d'un envoi intra** : chips d'échantillons modifiables dans le modal
- [ ] Module désactivé → aucune section « échantillons » visible au départ, en réception ni en édition

---

## 34. Codes ICR / valeurs pondérées (BETA 1.10.0)

- [ ] Référentiel `icr_codes` accessible et gérable par un administrateur (au moins `70008` Glace sèche, `70009` Transport hors corridor)
- [ ] **Formulaire intra** : case « Transport hors corridor » présente ; cochée → code `70009` attribué à l'envoi
- [ ] **Formulaire hors-grappe** : même case, même attribution
- [ ] Envoi avec glace sèche → code `70008` attribué automatiquement (vérifier la règle de calcul réelle)
- [ ] Colonnes `hors_corridor` / `codes_icr` correctement renseignées en base
- [ ] **KPI — section Codes ICR** : volumes pondérés par code sur la période sélectionnée
- [ ] État vide affiché si aucun envoi avec code ICR sur la période
- [ ] Cohérence des totaux ICR avec les envois de la période

---

## 35. Parcours de formation guidé (BETA 1.10.0)

- [ ] **Premier login** d'un utilisateur → le tour démarre automatiquement (~1 s après connexion)
- [ ] Navigation « Précédent » / « Suivant », compteur d'étapes et points de progression corrects
- [ ] Bouton « Passer » quitte le tour
- [ ] **Étapes adaptées au rôle** : un technicien voit moins d'étapes qu'un superviseur grappe / admin (modules non accessibles masqués)
- [ ] Surbrillance de l'élément ciblé et bulle positionnée correctement (y compris previews étiquette et F-G-74)
- [ ] Tour terminé ou passé → **ne se relance plus** au login suivant (progression dans `profiles.tour_progress`)
- [ ] Relance manuelle via **Aide → À propos → « Relancer le tour guidé »**
- [ ] Comptes de démonstration (`is_test`) : le tour se relance à chaque connexion
- [ ] Le tour fonctionne aussi bien en mode Intra-grappe qu'en bascule Hors-grappe

---

## 36. Journal des versions (À propos)

- [ ] `Aide → À propos → Journal des versions` charge et affiche le contenu de `CHANGELOG.md`
- [ ] Chaque version est un bloc repliable (la plus récente ouverte par défaut)
- [ ] Rendu correct (titres, listes, `code`, gras) et défilement dans l'encadré
- [ ] Version affichée (sidebar + À propos) cohérente avec la dernière entrée du journal

---

## 37. Compatibilité navigateurs

- [ ] Chrome / Chromium (dernière version)
- [ ] Firefox (dernière version)
- [ ] Safari (macOS + iOS)
- [ ] Edge
- [ ] Impression depuis chaque navigateur (bordereaux + F-G-74)
- [ ] Scan code-barres depuis mobile (page `/confirm`)

---

## 38. Contrôles de sécurité côté serveur (chantier « secrets et durcissement »)

> À jouer par l'API (clé publiable + jeton d'un compte de test), sur une base de test : un contrôle seulement dans le navigateur ne compte pas.

- [ ] Technicien : `UPDATE profiles SET role='admin'` sur soi → refusé ; `must_change_password`, `active`, `nom`, `employee_id` → refusés
- [ ] Gestionnaire : modifier `must_change_password` ou `active` d'un subordonné par UPDATE direct → refusé (passe par `manage-user`)
- [ ] Technicien : `rpc('get_app_secret')` → refusé ; `rpc('set_app_secret')` → refusé
- [ ] Admin : `rpc('list_app_secrets_status')` → état sans aucune valeur ; `set_app_secret('NOTIFY_TRIGGER_SECRET', …)` → refusé ; nom hors liste blanche → refusé
- [ ] Admin : modifier `app_config.supabase_url` depuis l'application → refusé
- [ ] Anonyme : lecture de `envois_hgrappe`, `profiles`, `notification_*` → aucune ligne / refus ; seules les 4 RPC de `/confirm` répondent
- [ ] INSERT direct dans `envois_hgrappe` avec un `confirm_token` ou un `verify_code` choisi → valeurs remplacées par le serveur ; UPDATE de ces colonnes → refusé
- [ ] INSERT direct dans `notification_queue`, `envois_audit`, `app_secrets_audit` → refusé
- [ ] Compte désactivé avec un jeton encore valide : appels à `manage-user` → refusés ; lectures → aucune donnée
- [ ] `send-notifications` appelée sans en-tête `x-trigger-secret` ou avec une valeur fausse → `403`, sans lecture du Vault pour une valeur hors format
- [ ] « Régénérer » `NOTIFY_TRIGGER_SECRET` puis déclencher l'envoi (`SELECT public._trigger_send_notifications();`) → `200` dans `net._http_response`
