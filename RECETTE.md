# Plan de recette — Traçabilité OPTILAB

> Dernière mise à jour : 2026-05-09 — BETA 1.9.6
> Stack : HTML/CSS/JS vanilla · Supabase (PostgreSQL + Auth + Realtime) · Cloudflare Pages

---

## 1. Authentification & Session

- [ ] Connexion réussie (N° employé + mot de passe) → accès à l'application
- [ ] Mauvais mot de passe → message d'erreur, pas de crash
- [ ] Compte désactivé → accès refusé, message explicite
- [ ] Changement de mot de passe obligatoire à la première connexion
- [ ] Mot de passe trop court → message d'erreur
- [ ] Déconnexion → retour écran de connexion, données vidées
- [ ] Reconnexion automatique après expiration du token
- [X] Dernière page visitée restaurée après F5 (`sessionStorage`)
- [ ] Compte `is_test` → pas de contrainte mot de passe, pas de changement obligatoire

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
- [ ] Redimensionnement automatique du texte sans débordement
- [ ] Lancement de l'impression navigateur sans téléchargement
- [ ] Format HSILP utilise le bon template

---

## 17. Documents hors-grappe (Bordereau + F-G-74)

- [ ] Bordereau de transport HG complet (labo externe, pictogrammes, réfrigérant)
- [ ] F-G-74 bilingue FR/EN
- [ ] Code-barres N° envoi lisible
- [ ] Code-barres code de vérification lisible
- [ ] Numéros de fax du labo expéditeur par département
- [ ] Section à compléter par le destinataire (nom, date, signature, NC)
- [ ] Impression combinée (bordereau + F-G-74) dans le même document
- [ ] Compatible impression noir/blanc (fax)
- [ ] Réimpression depuis le modal de détail HG
- [ ] **`hgrappeConfirmByNumero` = ON** : Option 1 (QR + URL) présente, Option 2 = "Option 2 — Confirmation par fax"
- [ ] **`hgrappeConfirmByNumero` = OFF** : Option 1 absente, Option 2 = "Confirmation par fax" sans numérotation
- [ ] QR code pointant vers `/confirm?n=...&c=...` scannable (si ON)

---

## 18. Page de confirmation publique (`/confirm`)

- [ ] Accessible sans connexion
- [ ] Focus automatique sur le champ N° envoi
- [ ] Navigation clavier : Entrée passe du N° au code, Entrée soumet
- [ ] Numéro invalide → message "Envoi introuvable"
- [ ] Code incorrect → message "Code invalide"
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
- [ ] Nouveau mot de passe trop court → message d'erreur
- [ ] Compte test → section mot de passe remplacée par mention explicative

---

## 21. Gestion des utilisateurs & Memberships

**Liste et droits**
- [ ] Liste avec rôle système, labo(s), statut, audit
- [ ] Colonne labo : dots de couleur par labo + badge "Resp." si Responsable
- [ ] Créer un utilisateur → compte Auth + profil `profiles`
- [ ] N° employé déjà existant → message d'erreur
- [ ] Modifier rôle système / nom d'un utilisateur
- [ ] Réinitialiser le mot de passe → `must_change_password = true`
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
- [ ] Configurer provider Resend (clé API + expéditeur) → enregistrer
- [ ] Configurer provider SMTP (serveur, port, identifiants) → enregistrer
- [ ] Bouton "Envoyer un test" → email reçu à l'adresse saisie
- [ ] Email de secours global → utilisé si aucune adresse labo configurée
- [ ] **Signaler un problème (intra)** → `notification_queue` insérée, envoyée au prochain batch
- [ ] **Déclarer perdu (intra)** → idem
- [ ] **Confirmation fax NC (HG)** → trigger PostgreSQL → `notification_queue`
- [ ] **Confirmation en ligne NC (HG)** → idem
- [ ] Email HTML reçu avec mise en page (badge coloré, tableau, en-tête OPTILAB)
- [ ] Historique des 50 derniers envois affiché
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

- [ ] `DEMO-ADM01` / `Optilab2026!` → admin, accès complet
- [ ] `DEMO-SGR01` / `Optilab2026!` → superviseur grappe, historique OK, tous labos
- [ ] `DEMO-SRI01` / `Optilab2026!` → superviseur labo Rimouski, historique refusé
- [ ] `DEMO-TRI01` / `Optilab2026!` → technicien, historique refusé
- [ ] `DEMO-TMA01` / `Optilab2026!` → technicien Matane, ne voit que son labo

---

## 31. Migrations & Vérification base de données

```sql
-- Vérifier toutes les tables présentes
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
-- Attendu : app_config, bons_depart, bons_depart_envois, bons_depart_sections,
--           envois, envois_audit, envois_hgrappe, external_labs, grappes, grappe_config,
--           laboratories, module_config, notification_config, notification_emails,
--           notification_log, notification_queue, profiles, user_lab_memberships

-- Migration 021 — module_config
SELECT is_module_active('bons_depart', '<labo_id>');

-- Migration 022 — HG dans module_config (plus dans app_config)
SELECT * FROM module_config WHERE module = 'hgrappe';

-- Migration 023 — Memberships
SELECT current_lab_role('<labo_id>');
SELECT COUNT(*) FROM user_lab_memberships; -- >= nombre d'utilisateurs actifs

-- Migration 024 — Grappes
SELECT * FROM grappes;  -- 1 ligne : BSL-GAS
SELECT COUNT(*) FROM grappe_config;  -- >= 6 clés migrées
SELECT COUNT(*) FROM laboratories WHERE grappe_id IS NOT NULL;  -- tous les labos

-- Triggers actifs
SELECT tgname, tgrelid::regclass FROM pg_trigger ORDER BY tgrelid::regclass;

-- RLS active sur toutes les tables sensibles
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;

-- Séquences
SELECT sequence_name, last_value FROM information_schema.sequences
JOIN pg_sequences USING(sequence_name)
WHERE sequence_schema = 'public';

-- Envois sans statut invalide
SELECT DISTINCT statut FROM envois;
-- Valeurs attendues : En transit, Reçu, Problème, Perdu, Annulé (pas "En attente")

-- Trigger notifications HG actif
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%hgrappe%';
```

---

## 32. Capacité Supabase

> Analyse complète dans [CAPACITE_SUPABASE.md](CAPACITE_SUPABASE.md) — mis à jour le 2026-05-09 (BETA 1.9.6).

**Résumé des conclusions :**

- **Bande passante** : architecture actuelle déjà optimisée (filtre J−7 + pagination côté serveur) → ~181 MB/mois (3,6 % du quota Free), stable indéfiniment. ✅
- **Realtime** : ~100 000 msg/mois — non limitant. ✅
- **Stockage hors audit** : libre 5–6 ans à 200 envois/jour. ✅
- **`envois_audit`** : ⚠️ risque principal — ~438 MB/an à 200 envois/jour. **Purge automatique > 1 an requise avant mise en production.**
- **Plan Pro recommandé en production** (25 USD/mois) pour PITR, SLA, backup quotidien.

- [ ] Ajouter cron de purge `envois_audit > 1 an` avant mise en production
- [ ] Surveiller *Project → Reports → Database* (stockage) pendant le pilote
- [ ] Surveiller *Project → Reports → Bandwidth* (doit rester < 1 GB/mois)

---

## 33. Compatibilité navigateurs

- [ ] Chrome / Chromium (dernière version)
- [ ] Firefox (dernière version)
- [ ] Safari (macOS + iOS)
- [ ] Edge
- [ ] Impression depuis chaque navigateur (bordereaux + F-G-74)
- [ ] Scan code-barres depuis mobile (page `/confirm`)
