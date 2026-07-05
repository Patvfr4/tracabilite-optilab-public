# Liste des fonctions — Traçabilité OPTILAB (BSL-GAS)

> Document destiné aux **auditeurs** du projet « Traçabilité OPTILAB — BSL-GAS ».
> Inventaire exhaustif des fonctions du **frontend** (client web), organisé par fichier / module.
> Chaque fonction est décrite en une ligne. Les fonctions exportées (`export function`) constituent l'API publique du module ; les fonctions internes notables sont signalées par *(interne)*.

---

## Table des matières

- [state.js](#statejs) — Proxy d'état global + wrapper Supabase
- [utils.js](#utilsjs) — Fonctions pures (formatage, calculs, HTML)
- [ui.js](#uijs) — Toasts, spinner, panels, thème, modals, journal des versions
- [auth.js](#authjs) — Authentification, session, inactivité, multi-labo
- [labs.js](#labsjs) — Laboratoires, sélecteur destinataire, températures, départements
- [envois.js](#envoisjs) — CRUD envois intra, réception, résumé, historique, utilisateurs, recherche, ICR/hors-corridor
- [echantillons.js](#echantillonsjs) — **NOUVEAU** — Scan et vérification des échantillons hors-SILP
- [hgrappe.js](#hgrappejs) — Mode hors-grappe, envois HG, confirmations, résumé, config, ICR/hors-corridor
- [bons-depart.js](#bons-departjs) — Bons de départ (création, détail, impression, scan caméra)
- [print.js](#printjs) — Impression étiquette + bordereau intra-grappe
- [print-hg.js](#print-hgjs) — Impression bordereau + F-G-74 hors-grappe
- [app-config.js](#app-configjs) — Configuration application, branding, badges, gabarits, notifications, secrets
- [kpi.js](#kpijs) — Tableau de bord KPI + section ICR
- [tour.js](#tourjs) — **NOUVEAU** — Visite guidée interactive de l'application
- [main.js](#mainjs) — Point d'entrée ES modules, exposition sur `window`

---

## state.js

Objet proxy qui encapsule l'accès à l'état global `window.*` pour permettre une migration progressive vers les modules ES. Toutes les propriétés lisent/écrivent sur `window`.

### `state` — Getters & Setters
Proxy d'état global : client Supabase (`sb`), config (`CFG`), utilisateur (`currentUser`), labo actif (`activeLabo`, `activeLaboId`), grappes, laboratoires, envois intra (`envois`) et HG (`envoisHG`), labs externes, utilisateurs, caches de modals, pagination, et état des formulaires de création/édition.

### État ICR / hors-corridor (ajout BETA 1.10)
`get/set horsCorridorChoisi`, `get/set editHorsCorridor`, `get/set hgHorsCorridor`, `get/set hgEditHorsCorridor` — état de la case « hors-corridor » (code ICR 70009) dans les formulaires création/édition intra et HG.

### `sbCall(promise, notifierId)`
**Exportée · async** — Wrapper sécurisé pour tous les appels Supabase : gère les erreurs réseau, détecte la session expirée (401 / JWT → `seDeconnecter()` différé) et affiche une notification. Retourne toujours `{data, error}`.

---

## utils.js

Fonctions pures, sans effet de bord sur le DOM ni sur l'état global.

### Constantes exportées
`classesPills` (classes CSS de rotation des pilules de température) ; `departements` (définition des 4 départements : Biochimie, Hématologie/BDS, Microbiologie/Séro, Pathologie/Cyto).

### `escapeHtml(str)`
**Exportée** — Échappe les caractères HTML (`& < > " '`) pour prévenir les injections XSS avant insertion dans `innerHTML`.

### `formatDateTime(iso)`
**Exportée** — Formate une date ISO en `JJ/MM/AAAA HH:MM` (locale `fr-CA`), ou `'—'` si vide.

### `formatDate(iso)`
**Exportée** — Formate une date ISO en format long `lundi 12 mai 2025` (locale `fr-FR`).

### `deepKey(iso)`
**Exportée** — Retourne la clé de tri `YYYY-MM-DD` d'une date ISO (utilisée pour grouper les résumés par jour).

### `heuresTransit(e)`
**Exportée** — Calcule la durée de transit d'un envoi en heures (`tsRecep || now − tsEnvoi`), ou `null`.

### `formatDuree(h)`
**Exportée** — Formate un nombre d'heures en `Xh05`, ou `'—'`.

### `classeBadge(s)`
**Exportée** — Classe CSS du badge de statut d'un envoi (`ba`, `bt`, `br`, `bperdu`, `bp2`).

### `libelleRole(r)` / `classeBadgeRole(r)`
**Exportée** — Libellé et classe CSS du badge d'un rôle utilisateur (admin, superviseur_grappe/labo, technicien).

### `formaterCP(v)`
**Exportée** — Formate un code postal canadien (`G5L 5T1`).

### `formaterTel(v)`
**Exportée** — Formate un numéro de téléphone nord-américain `(418) 724-3000`.

### `separateurModal(t)`
**Exportée** — Génère le HTML d'un séparateur de section (ligne + label) dans les modals de formulaire.

### `departementsHtml(d)` / `departementsTexte(d)`
**Exportée** — Génèrent des badges HTML `<span>` et un texte séparé par virgules pour un tableau d'IDs de départements.

---

## ui.js

Rôle : notifications toast, spinner, gestion des écrans et panels, thème clair/sombre, modals génériques, et journal des versions (onglet « À propos »).

### `notifier(id, msg, t)`
**Exportée** — Wrapper de `toast()` avec type simplifié (`'e'` = erreur, `'s'` = succès). `id` ignoré (compatibilité).

### `toast(msg, type, duration)`
**Exportée** — Affiche une notification temporaire (succès/erreur/info) avec icône, barre de progression et fermeture auto.

### `removeToast(el)`
**Exportée** — Supprime un toast avec animation de disparition.

### `spin(on)`
**Exportée** — Affiche ou masque le spinner global `#spinner`.

### `showScr(s)`
**Exportée** — Affiche l'écran spécifié (`login`, `cpw`, `labo`, `app`) et masque les autres.

### `showPanel(n)`
**Exportée** — Affiche le panel de navigation et déclenche son initialisation spécifique (réception, résumé, utilisateurs, config, hg-*, kpi, bons-depart, recherche, moncompte…). Gère l'abonnement Realtime.

### `closeGMod()`
**Exportée** — Ferme la modal générale de détail `#gmod` et rend le focus au déclencheur.

### `_isDarkNow()` *(interne)*
Retourne `true` si le thème sombre est actif (attribut `data-theme` ou préférence système).

### `initTheme()`
**Exportée** — Initialise le thème au chargement (localStorage ou dark mode système).

### `toggleTheme()`
**Exportée** — Bascule clair/sombre, persiste dans `localStorage` et met à jour `profiles.theme` en BD.

### `updateThemeBtn()`
**Exportée** — Met à jour l'icône et le `title` des boutons thème.

### `setupKeyboard()`
**Exportée** — Installe le listener Escape qui ferme la modal visible prioritaire.

### `setupConfirmModal()`
**Exportée** — Attache les handlers OK/Annuler qui résolvent la Promise de `confirm2()`.

### `confirm2(title, msg, btnLabel, danger)`
**Exportée** — Affiche une modal de confirmation et retourne une `Promise<boolean>`. `danger` : `true` (rouge), `'warn'` (orange), falsy (bleu).

### `showSuccessModal(num)` / `closeSuccessModal()`
**Exportée** — Affiche/ferme la modal de succès après enregistrement d'un envoi (bouton Imprimer conditionnel).

### `initNlistValidation()`
**Exportée** — Attache la validation du format SILP au champ `#nlist` (chiffres seuls = erreur, doublon = erreur, ≥ 4 chars = valide).

### `switchAideTab(tab)`
**Exportée** — **NOUVEAU** — Bascule les onglets de l'écran d'aide ; sur l'onglet « À propos », déclenche `loadChangelog()`.

### `loadChangelog()` *(interne)* — **NOUVEAU**
Charge `/CHANGELOG.md` une seule fois, le rend via `_renderChangelog()`, avec repli vers un lien GitHub en cas d'échec.

### `_renderChangelog(md)` *(interne)* — **NOUVEAU**
Convertisseur Markdown minimal et sûr, spécialisé pour le format du journal : chaque « ## [BETA x] — date » devient un bloc `<details>` repliable (le premier ouvert).

---

## auth.js

Variables de module internes : `_loginAttempts`, `_loginLocked`, `_loginLockUntil`, `_inactActive`, `_pendingP`, `_pendingLabos`, `_laboFromLogin`.

### `estAdmin()` / `estGrappe()` / `estSuperviseur()`
**Exportée** — Vérifient le rôle de `state.currentUser` (avec hiérarchie : grappe ⊇ superviseur_grappe/admin ; superviseur ⊇ labo/grappe/admin).

### `initLoginBg()`
**Exportée** — Choisit une photo aléatoire, la précharge et l'applique en fond des écrans login/cpw/labo, affiche le crédit.

### `seConnecter()`
**Exportée · async** — Authentifie l'utilisateur (`signInWithPassword`) avec rate limiting (5 tentatives → verrou 30 s), puis appelle `loadProfileAndInit()`.

### `loadProfileAndInit(uid)`
**Exportée · async** — Charge le profil complet + memberships, vérifie `active`, gère `must_change_password` et le routage multi-labo.

### `enregistrerMotDePasse()`
**Exportée · async** — Valide et enregistre un nouveau mot de passe (changement forcé), met `must_change_password = false`, finalise la connexion.

### `finaliserConnexion(p)`
**Exportée · async** — Phase principale : charge config + labs en parallèle, détermine la grappe active, gère le choix de labo (unique ou picker).

### `_completeInit(p)` *(interne · async)*
Phase finale : remplit l'UI (avatar, nom, labo, rôle), gère la visibilité nav selon les droits, applique le thème, restaure le panel, démarre le timer d'inactivité, et déclenche `tourMaybeAutoStart()`.

### `_inactStart()` / `_inactReset()` / `_inactStop()` *(internes)*
Gestion du timer d'inactivité (15 min) : listeners passifs replanifiant `seDeconnecter()`.

### `_showLaboPicker(labos, fromLogin)` *(interne)*
Affiche l'écran de sélection de labo (un bouton par labo → `choisirLabo()`).

### `choisirLabo(lab)`
**Exportée · async** — Applique un labo : mémorise dans `localStorage`, recharge les envois, appelle `_completeInit()` (depuis login) ou `_applyLaboChange()` (depuis l'app).

### `changerLabo()` / `annulerChangementLabo()`
**Exportée** — Ouvre / ferme l'écran de sélection de labo pour les utilisateurs multi-labo.

### `initLabSwitch(labos)`
**Exportée** — Rafraîchit l'indicateur de labo actif dans la sidebar.

### `seDeconnecter()`
**Exportée · async** — Déconnexion complète : arrête l'inactivité, supprime le canal Realtime, `signOut()`, réinitialise le state, affiche l'écran login.

---

## labs.js

Rôle : chargement des laboratoires de la grappe, sélecteur destinataire, températures, départements et configuration des labs (coordonnées, fax, modules, emails de notification).

### `loadLabs()`
**Exportée · async** — Charge tous les labs actifs (avec `grappe_id`, coordonnées et fax par département) dans `state.laboratoires`.

### `formaterAdresseLabo(lab)`
**Exportée** — Retourne la string `Adresse · Ville Province CP · Téléphone`.

### `buildLdestOpts()`
**Exportée** — Remplit le dropdown destinataire avec des divs cliquables (sauf le labo actif).

### `filterLdest()`
**Exportée** — Filtre les options destinataire selon la saisie et ouvre le dropdown.

### `openLdestDrop()` / `closeLdestDrop()`
**Exportée** — Ajoutent/retirent la classe `open` du dropdown destinataire.

### `pickLdest(id, name)`
**Exportée** — Sélectionne un labo destinataire, remplit les champs et met à jour l'adresse.

### `ldestKeyNav(e)`
**Exportée** — Navigation clavier dans le dropdown destinataire (flèches / Enter / Escape).

### `updateExpAddr()` / `updateDestAddr(labId)`
**Exportée** — Affichent l'adresse formatée du labo expéditeur et destinataire.

### `populateSels()`
**Exportée** — Remplit tous les sélecteurs du formulaire d'envoi (destinataires, transporteurs, labs responsable, types de spécimen) et déclenche `renderTempPills()` + `updateTransporteurVisibility()`.

### `updateTransporteurVisibility()`
**Exportée** — Affiche le champ transporteur uniquement si le module Bons de départ est inactif pour le labo.

### `renderTempPills()`
**Exportée** — Crée les pilules de sélection de température depuis `CFG.temperatures`.

### `selectionnerTemp(lbl, pc)`
**Exportée** — Sélectionne une température, gère l'affichage de la section glace et le réfrigérant par défaut.

### `setGlace(val)`
**Exportée** — Enregistre le choix glace sèche / sachet dans `state.refrigerantChoisi`.

### `toggleDept(d)`
**Exportée** — Ajoute/retire un département de `state.departementsActifs`.

### `renderCfgLabs()`
**Exportée** — Affiche la liste des labs dans le panneau config (tags BD/HG, adresse, boutons Modifier/Désactiver).

### `openLabModal(id)`
**Exportée · async** — Ouvre le modal d'édition d'un lab (coordonnées, réfrigérant, fax par département, modules BD/HG, config notifications, emails).

### `closeLabModal()`
**Exportée** — Ferme le modal lab et réinitialise l'état.

### `saveLabModal()`
**Exportée · async** — Sauvegarde en 5 étapes : UPDATE coordonnées, UPSERT `module_config` (bons_depart, hgrappe, notifications), mise à jour locale + rafraîchissement des rendus.

### `addLab()`
**Exportée · async** — Crée un lab (INSERT avec `grappe_id`) ; gère le doublon (23505).

### `removeLab(id)`
**Exportée · async** — Désactive un lab (soft delete `active = false`) après confirmation.

---

## envois.js

Rôle : cœur métier intra-grappe — création, chargement, réception, détail, résumé, historique, export PDF, édition, gestion des utilisateurs, recherche globale, annulation logique. Depuis BETA 1.10, gère les **codes ICR** (`70008` glace sèche, `70009` hors-corridor/urgent).

### Alarmes & affichage

### `libelleTemp(t)` / `libelleTempCourt(t)`
**Exportée** — Retournent l'icône + label complet ou court d'une température depuis `CFG.temperatures`.

### `estAlarmeRetard(e)` / `estAlarmePerdu(e)` / `estArriveeRetard(e)`
**Exportée** — Détectent les états d'alarme (retard de transit, perdu, arrivée en retard) selon `CFG.alarmR` / `CFG.alarmP`.

### `classeLigne(e)`
**Exportée** — Classe CSS de la ligne du tableau (`row-perdu`, `row-probleme`, `ar-lost`, `ar`, `''`).

### `estAlerte(e)`
**Exportée** — `true` si l'envoi est en alarme retard, perdu, arrivée retard, Problème ou Perdu.

### `afficherLegende(elId, arr)`
**Exportée** — Construit et injecte la légende `<details>` des alarmes en analysant un tableau d'envois.

### `celluleTransit(e)`
**Exportée** — Génère le HTML de la cellule durée de transit (code couleur + SVG d'alerte).

### Chargement

### `_mapEnvoi(row)`
**Exportée** — Transforme une ligne Supabase brute en objet envoi normalisé (40+ propriétés dont `codesIcr`, `horsCorridorChoisi`, `echantillonsDepart`).

### `loadEnvois()`
**Exportée · async** — Charge les envois actifs (En attente/En transit) + récents (Reçu/Problème depuis J−7), filtrés par labo si non-grappe, triés DESC.

### Création d'envoi

### `saveEnvoi()`
**Exportée · async** — Crée un envoi SILP (ou délègue à `_doSaveEnvoiHsilp()` si sans SILP). Valide les champs, construit les **codes ICR** (`70008` si glace sèche, `70009` si hors-corridor), INSERT `envois`, prépare l'impression et affiche la modal de succès.

### `_doSaveEnvoiHsilp(_bdOn)` *(interne · async)*
Crée un envoi HSILP via RPC `create_envoi_hsilp`, prépare l'impression et affiche la modal HSILP.

### `resetForm()`
**Exportée** — Réinitialise complètement le formulaire d'envoi (champs, chips SILP, température, glace, départements, hors-corridor, mode HSILP).

### Réception

### `showRlabErr(title, sub)`
**Exportée** — Affiche un message d'erreur dans le panneau réception et remet le focus sur `#rnum`.

### `rechercher()`
**Exportée · async** — Recherche un envoi à réceptionner par numéro interne ou SILP physique, filtre par droits, gère les cas 0 / multiple / unique.

### `confirmer()`
**Exportée · async** — Confirme la réception (`statut='Reçu'`) avec protection contre la race condition, flash vert, reset UI. Génère une NC échantillons si discordance détectée.

### `signaler()`
**Exportée · async** — Signale un problème (`statut='Problème'`, observation obligatoire), INSERT `notification_queue` type `nc`, flash orange.

### `_queueNotif(type, e, extra)` *(interne)*
INSERT fire-and-forget dans `notification_queue` (type `nc` ou `lost`).

### Modal de détail

### `showGMod(id)`
**Exportée · async** — Ouvre la modal générale de détail d'un envoi ; détermine les droits (`canPrint`, `canModify`, `canDeclare`), affiche les codes ICR, charge audit + bon de départ associé.

### `declarerPerdu(id)`
**Exportée · async** — Après confirmation, UPDATE `statut='Perdu'`, INSERT notification `lost`, recharge.

### Résumé

### `switchRTab(t)`
**Exportée** — Bascule entre les 3 onglets du résumé (`sent`, `recv`, `done`).

### `loadResumeDonePage(laboId, page)` / `loadResumeSentPage(laboId, page)`
**Exportée · async** — Chargent une page paginée (10/page) des reçus / envoyés ; en mode alertes, filtrent localement par `estAlerte()`.

### `renderResumeRecvPage(page)`
**Exportée** — Affiche une page du résumé « En attente de réception » (pagination locale).

### `changeResumeDonePage(delta)` / `changeResumeSentPage(delta)` / `changeResumeRecvPage(delta)`
**Exportée** — Incrémentent/décrémentent la page du résumé correspondant.

### `getResData()`
**Exportée** — Agrège les envois reçus et en attente pour le labo courant avec les filtres actifs.

### `renderResume()`
**Exportée** — Orchestrateur du résumé : titre, légende, lancement des 3 pages en parallèle.

### `toggleResumeAlerts()`
**Exportée** — Bascule le mode alertes du résumé et re-render.

### Export PDF

### `togglePdfDrop(e)`
**Exportée** — Ouvre/ferme le menu déroulant d'export PDF.

### `pdfStr(s)`
**Exportée** — Nettoie une string pour PDF (tirets unicode → ASCII, non-ASCII → `?`).

### `exportPDF(orient)`
**Exportée · async** — Génère un PDF du résumé (jsPDF) groupé par date, durées en rouge si alarme (portrait/landscape).

### Historique

### `loadHistPage(page)`
**Exportée · async** — Charge une page (10/page) de l'historique avec filtres (texte, statut, département, transporteur, dates) ; mode alertes paginé localement.

### `loadHistStats()`
**Exportée · async** — Charge 3 compteurs (total, ce mois, en transit) + nombre de labs actifs.

### `changeHistPage(delta)` / `onHistSearch()`
**Exportée** — Navigation et recherche avec debounce (400 ms) de l'historique.

### `toggleHistAlerts()`
**Exportée** — Bascule le mode alertes de l'historique.

### Modification d'envoi

### `openEditEnvoi(id)`
**Exportée · async** — Ouvre le modal d'édition, pré-remplit les champs (dont hors-corridor et échantillons), détermine les droits, vérifie l'appartenance à un bon actif.

### `closeEditEnvoi()`
**Exportée** — Ferme le modal d'édition.

### `afficherPillsTempEdit()` / `selectionnerTempEdit(lbl, pc)` / `setEditGlace(val)` / `toggleDeptEdit(d)` / `updatePillsDeptEdit()`
**Exportée** — Gèrent l'UI du formulaire d'édition (équivalents création, opérant sur `state.edit*`).

### `setHorsCorridor(val)` / `setEditHorsCorridor(val)`
**Exportée** — **NOUVEAU** — Setters de la case « hors-corridor » (code ICR 70009) pour les formulaires de création et d'édition intra.

### `saveEditEnvoi()`
**Exportée · async** — Valide, détecte les changements, recalcule les **codes ICR**, UPDATE `envois` + INSERT `envois_audit`, met à jour les échantillons, reconstruit l'impression, affiche la modal.

### `showSuccessModalEdit(num, isHsilp)`
**Exportée** — Affiche la modal succès « Envoi modifié » avec bouton imprimer conditionnel.

### SILP / HSILP

### `addSilpList()` / `removeSilpList(v)` / `renderSilpChips()`
**Exportée** — Gèrent la liste de chips SILP (ajout avec validation + doublon, suppression, rendu HTML).

### `confirmSilpDup()` / `cancelSilpDup()`
**Exportée** — Confirment/annulent l'ajout d'un SILP déjà présent dans un envoi actif.

### `showNoListModal(cb)` / `cancelNoList()` / `confirmNoList()`
**Exportée** — Modal d'avertissement avant bascule en mode HSILP.

### `toggleNoSilp()`
**Exportée** — Bascule le mode HSILP avec confirmation, applique l'UI et prévisualise le numéro.

### `fetchHsilpPreviewNum()`
**Exportée · async** — RPC `peek_next_hsilp` pour afficher le prochain numéro HSILP.

### `showSuccessModalHsilp(num)`
**Exportée** — Affiche la modal succès HSILP et lance l'impression automatique.

### `_afficherResultatReception_global(id)`
**Exportée** — Wrapper global retrouvant l'envoi par ID (utilisé par la modal multi-SILP).

### Mon compte

### `renderMonCompte()`
**Exportée** — Affiche le profil courant ; masque la section MDP pour les comptes `is_test`.

### `saveMcPw()`
**Exportée · async** — Valide et enregistre un nouveau MDP via `auth.updateUser()`.

### Gestion des utilisateurs

### `loadUsersAndRender()`
**Exportée · async** — SELECT `profiles` + memberships (filtré par labo si non-grappe), stocke et rend le tableau.

### `renderUT()`
**Exportée** — Affiche le tableau des utilisateurs (labs avec dots, badge Resp., audit, actions).

### `_renderUfMembershipsUI()` *(interne)*
Affiche dans le formulaire uniquement les memberships attribués + sélecteur d'ajout.

### `addUfMembership()` / `removeUfMembership(laboId)`
**Exportée** — Ajoutent/retirent un membership de `_ufMemberships`.

### `openAddU()` / `openEditU(id)` / `cancelUF()`
**Exportée** — Ouvrent/ferment le formulaire d'ajout ou d'édition utilisateur.

### `callEdge(action, payload)`
**Exportée · async** — Appelle la fonction Edge `/manage-user` (`create`, `reset_password`, `toggle_active`) avec Authorization Bearer.

### `saveUser()`
**Exportée · async** — Crée ou met à jour un utilisateur (validation, Edge, memberships, audit).

### `_saveMemberships(profileId, memberships)` *(interne · async)*
Synchronise `user_lab_memberships` (DELETE des anciens, UPSERT des nouveaux).

### `togU(id, active)`
**Exportée · async** — Active/désactive un utilisateur via `callEdge('toggle_active')`.

### `_renderUfLaboIdsOnChange()`
**Exportée · no-op** — Conservée pour compatibilité `window.*` (remplacée par le système de memberships).

### Temps réel

### `subscribeRT()`
**Exportée** — Crée le canal Realtime `envois-rt` (listeners sur `envois` et `envois_hgrappe`), vide le cache et re-rend le panel actif à chaque changement.

### Recherche globale

### `renderRecherche()`
**Exportée** — Focus + select du champ de recherche à l'ouverture du panel.

### `onRechercheInput()`
**Exportée** — Debounce 500 ms avant `doRecherche()` ; message si < 3 caractères.

### `doRecherche()`
**Exportée · async** — Recherche globale sur 5 requêtes parallèles (intra par numéro/SILP, HG par numéro/SILP, bons de départ), dédupliquée, filtrée par droits, avec tableau de résultats.

### `showRchDetail(id, type)`
**Exportée** — Affiche le détail d'un résultat (modal complète ou restreinte selon les droits d'accès au labo).

### Annulation logique

### `openAnnulationEnvoi()` / `closeAnnulationEnvoi()`
**Exportée** — Ouvrent/ferment le modal d'annulation.

### `saveAnnulationEnvoi()`
**Exportée · async** — Valide la note (obligatoire), appelle RPC `annuler_envoi`, ferme et recharge.

---

## echantillons.js

**NOUVEAU MODULE (BETA 1.10).** Scan des codes-barres d'échantillons pour les envois **hors-SILP** (HSILP / HG sans SILP). Trois contextes : départ (intra + HG), vérification à la réception (avec génération automatique de NC en cas de discordance), et édition. Actif uniquement pour les labs de `CFG.echantillonsEnabledLabs`.

### État interne
`_echDepart`, `_echHgDepart`, `_echVerif`, `_echDepartEdit` (listes de chips), `_echEnvoiCourant` (référence à l'envoi en réception).

### `isEchantillonsEnabled()`
**Exportée** — `true` si le labo actif est dans `CFG.echantillonsEnabledLabs`.

### `_renderChips(containerId, chips, removeFn)` *(interne)*
Génère le HTML des chips d'échantillons avec bouton de retrait.

### `_updateCount(countId, chips)` *(interne)*
Met à jour le compteur textuel « N échantillon(s) ».

### `_computeDiff(depart, reception)` *(interne)*
Compare deux listes et retourne `{manquants, inattendus}`.

### Section départ — Intra

### `updateEchDepartSectionVisibility()`
**Exportée** — Affiche/masque la section scan départ selon le module et le mode HSILP.

### `updateEchDepartScanVisible()`
**Exportée** — Affiche/masque la zone de scan selon la checkbox d'activation.

### `addEchDepart()`
**Exportée** — Ajoute un code scanné (majuscule, refuse les doublons).

### `removeEchDepart(v)` / `renderEchDepartChips()`
**Exportée** — Retirent un code / rendent les chips + compteur.

### `getEchantillonsDepart()`
**Exportée** — Retourne une copie de la liste des échantillons de départ (consommée par `saveEnvoi`).

### `resetEchantillonsDepart()`
**Exportée** — Réinitialise la section départ intra.

### Section départ — HG

### `updateEchHgDepartSectionVisibility()` / `updateEchHgDepartScanVisible()` / `addEchHgDepart()` / `removeEchHgDepart(v)` / `renderEchHgDepartChips()` / `getEchantillonsHgDepart()` / `resetEchantillonsHgDepart()`
**Exportée** — Équivalents HG des fonctions de départ intra (opèrent sur `_echHgDepart`, dépendent de `state.hgSansSilp`).

### Section vérification (réception)

### `initEchReceptionSection(envoi)`
**Exportée** — Initialise la section de vérification à la réception (nb attendu, reset), masquée si aucun échantillon au départ.

### `onEchNbRecuChange()`
**Exportée** — Affiche la zone de scan de vérification uniquement si le nombre reçu diffère du nombre expédié.

### `addEchVerif()`
**Exportée** — Ajoute un code scanné à la vérification (refuse les doublons).

### `removeEchVerif(v)` / `renderEchVerifChips()`
**Exportée** — Retirent un code / rendent les chips colorés (vert = présent au départ, rouge = inattendu) avec compteur manquants/inattendus.

### `getEchVerifNcData()`
**Exportée** — Calcule les données de non-conformité (commentaire détaillant manquants/inattendus/discordance de comptage) à joindre au signalement, ou `null` si conforme.

### `resetEchReceptionSection()`
**Exportée** — Réinitialise la section vérification.

### Section édition

### `initEchDepartEdit(envoi)`
**Exportée** — Initialise les chips modifiables dans le modal d'édition (visible seulement pour un HSILP d'un labo avec module actif).

### `addEchDepartEdit()` / `removeEchDepartEdit(v)` / `renderEchDepartEditChips()`
**Exportée** — Ajoutent/retirent/rendent les chips d'échantillons en édition.

### `getEchantillonsDepartEdit()`
**Exportée** — Retourne la liste éditée (consommée par `saveEditEnvoi`).

---

## hgrappe.js

Rôle : mode hors-grappe (envois vers labs externes). Mapping, chargement, helpers d'affichage, sélecteurs destinataire hiérarchiques, formulaire SILP HG, confirmations (fax / en ligne), résumé, historique, détail, édition et configuration HG. Depuis BETA 1.10, gère les **codes ICR** (`70008`/`70009`).

### Mapping & chargement

### `_mapEnvoiHG(row)`
**Exportée** — Transforme une ligne `envois_hgrappe` en objet normalisé (dont `codesIcr`, `horsCorridorChoisi`, `confirmToken`, `confirmMethod`, `confirmConforme`, `confirmNcTypes`).

### `loadExtLabs()`
**Exportée · async** — Charge les labs externes actifs (avec adresses et hiérarchie parent) dans `state.labsExternes`.

### `loadEnvoisHG()`
**Exportée · async** — Charge les envois HG actifs + récents (J−7), filtre par labo si non-grappe, appelle `autoCloseHGEnvois()`.

### `autoCloseHGEnvois()` *(interne · async)*
Passe automatiquement au statut « Aucune réponse reçue » les envois En transit non confirmés au-delà de `CFG.hgrappeAutoCloseDays`.

### Helpers d'affichage

### `classeBadgeHG(s)`
**Exportée** — Classe CSS du badge de statut HG.

### `estAlarmeHG(e)` / `estSansReponse(e)` / `classeLigneHG(e)` / `estAlerteHG(e)` / `afficherLegendeHG(elId, arr)`
**Exportée** — Équivalents HG des helpers d'alarme, basés sur `CFG.hgrappeAlarmDays` et le statut « Aucune réponse reçue ».

### `ligneDestHG(e)` / `texteDestHG(e)` / `adresseDestHG(lab)`
**Exportée** — Formatent le destinataire HG (hiérarchie parent/enfant) en HTML, texte brut et objet adresse (fallback parent).

### Mode & basculement

### `isHGEnabled()`
**Exportée** — `true` si admin, ou si le labo actif est dans `CFG.hgrappeEnabledLabs`.

### `initHGMode()`
**Exportée** — Initialise le mode HG au login (localStorage, sidebar, chargements, dates par défaut).

### `updateSidebarForMode()`
**Exportée** — Met à jour la sidebar selon le mode (groupes nav, label, icône, badge, classe `hg-mode`).

### `setMode(mode)`
**Exportée** — Change le mode (`hgrappe` / `intra`), persiste, met à jour la sidebar, charge les données et affiche le panel par défaut.

### `toggleModeDrop(e)`
**Exportée** — Ouvre/ferme le dropdown du switcher de mode.

### Sélecteurs destinataire HG

### `buildHgParentSelect(selId)`
**Exportée** — Remplit un select avec les labs externes racines.

### `updateHgDestSelection(...)` / `updateHgDestChild(...)`
**Exportée** — Mettent à jour le select enfant et le champ hidden quand le parent/enfant change.

### `showHgDestAddrEl(labId, addrEl)`
**Exportée** — Affiche l'adresse d'un lab externe (fallback parent).

### `onHgSilpParentChange()` / `onHgSilpChildChange()` / `onHghParentChange()` / `onHghChildChange()`
**Exportée** — Callbacks des sélecteurs destinataire (formulaires SILP et historique).

### `buildHgDestLabObj(destId)`
**Exportée** — Retourne un objet lab externe enrichi de son parent pour les modals.

### Formulaire envoi HG (SILP)

### `initHgSilpForm()`
**Exportée** — Initialise le formulaire SILP HG (expéditeur, adresse, parents, transporteurs, spécimens, pilules température).

### `addHgsList()` / `removeHgsList(v)` / `renderHgsChips()`
**Exportée** — Gèrent la liste `state.hgListesSilp` (validation + rendu).

### `setHgsSGC(val)`
**Exportée** — Setter glace sèche/sachet du formulaire SILP HG.

### `setHgsHorsCorridor(val)` / `setHgeHorsCorridor(val)`
**Exportée** — **NOUVEAU** — Setters de la case « hors-corridor » (code ICR 70009) pour les formulaires HG de création et d'édition.

### `resetHgSilpForm()`
**Exportée** — Réinitialise entièrement le formulaire SILP HG (dont hors-corridor).

### `saveEnvoiHgSilp()`
**Exportée · async** — Valide et crée l'envoi HG (RPC `create_envoi_hgrappe` ou variante sans SILP), construit les codes ICR, prépare l'impression, affiche la modal de succès.

### `fetchHgHsilpPreviewNum()`
**Exportée · async** — RPC `peek_next_hgrappe` pour afficher le prochain numéro HG.

### `toggleHgsNoSilp()`
**Exportée** — Bascule le mode sans SILP avec confirmation.

### Modal succès HG

### `showHGSuccessModal(num)`
**Exportée** — Affiche la modal succès HG (fermeture bloquée tant que « J'ai imprimé » n'est pas coché).

### `toggleHGClose()`
**Exportée** — Active/désactive le bouton fermeture selon la checkbox.

### `closeHGSuccessModal()`
**Exportée** — Ferme la modal et retourne au panel `hg-silp`.

### Confirmations

### `getHGRLaboId()`
**Exportée** — Retourne l'ID labo sélectionné dans le résumé, ou le labo actif par défaut.

### `loadHGConfirmationsPage(page)` / `changeHGCPage(delta)` / `renderHGConfirmations()`
**Exportée** — Chargent le tableau Confirmations paginé (10/page) avec filtres dates/statut.

### Résumé HG

### `loadHGRSentPage(...)` / `loadHGRConfPage(...)` / `loadHGRWaitPage(...)`
**Exportée · async** — Chargent les 3 onglets du résumé HG (tous / confirmés / en attente), paginés, groupés par date.

### `switchHGRTab(t)` / `changeHGRPage(delta)` / `renderHGResume()`
**Exportée** — Basculent l'onglet, changent la page, ou rechargent totaux + page 0.

### Historique HG

### `loadHGHistPage(page)` / `changeHGHistPage(delta)` / `onHGHistSearch()` / `renderHGHistorique()`
**Exportée** — Historique HG avec recherche texte + filtres (debounce 400 ms), équivalent intra.

### `loadHGHistStats()`
**Exportée · async** — 4 compteurs (total, ce mois, En transit, Confirmés).

### Modal détail HG

### `showHGDetail(id)`
**Exportée · async** — Ouvre la modal de détail HG (infos, confirmation, codes ICR, traçabilité, boutons imprimer/modifier), charge audit + bon associé.

### Modal fax confirmation

### `openHGFaxModal(id)` / `closeHGFaxModal()`
**Exportée** — Ouvrent/ferment le modal de saisie fax (date courante pré-remplie).

### `setHgFaxConforme(val)`
**Exportée** — Setter conformité (affiche/masque la section non-conformités).

### `saveHGFaxConfirm()`
**Exportée · async** — Valide et enregistre la confirmation par fax (statut, méthode `fax`), INSERT notification si NC, recharge.

### Édition envoi HG

### `openEditHGEnvoi(id)` / `closeHGEditModal()`
**Exportée** — Ouvrent/ferment le modal d'édition HG (pré-remplissage dont hors-corridor).

### `setHgeSGC(val)` / `addHgeList()` / `removeHgeList(v)` / `renderHgeChips()`
**Exportée** — Gèrent glace sèche et liste SILP en édition HG.

### `saveEditHGEnvoi()`
**Exportée · async** — Valide, recalcule les **codes ICR**, UPDATE `envois_hgrappe`, reconstruit l'impression, recharge, affiche succès.

### Config HG

### `renderCfgHgrappe()`
**Exportée** — Orchestrateur config HG (labs, labs externes, alarmes, confirmation par numéro, formats).

### `renderCfgHgrappeConfirmByNumero()` / `saveHgrappeConfirmByNumero()`
**Exportée** — Affichent/sauvegardent le toggle de confirmation en ligne par numéro.

### `renderHGAlarmsCfg()` / `saveHGAlarms()`
**Exportée** — Affichent/sauvegardent les seuils d'alarme HG (alarm < auto).

### `renderHgrappeLabsToggle()` / `saveHgrappeLabs()`
**Exportée** — Affichent/sauvegardent l'activation du module HG par lab.

### `renderExtLabsList()`
**Exportée** — Affiche la liste hiérarchique des labs externes avec formulaires inline.

### `toggleExtLabEdit(id)` / `saveExtLabEdit(id)` / `addExtLab()` / `toggleExtLabActive(id, active)`
**Exportée** — Affichent/sauvegardent/créent/activent-désactivent un lab externe.

---

## bons-depart.js

Rôle : regroupement de plusieurs envois en un bon de départ (colis) par transporteur, avec impression DataMatrix et scan (clavier ou caméra). Variable de module `_cfgBD` : `{selectedIntra, selectedHG, pendingEnvois, pendingHG}`.

### `isBDEnabled()`
**Exportée** — `true` si le labo actif est dans `CFG.bonsDepartEnabledLabs`.

### `initBonsDepart()`
**Exportée · async** — Point d'entrée : reset vue + pagination, charge la page 0, affiche la liste.

### `loadBDPage(page)` / `changeBDPage(p)`
**Exportée** — Chargent une page paginée de `bons_depart` (count exact, filtré par labo si non-grappe).

### `openCreateBon()`
**Exportée · async** — Ouvre le formulaire : charge les envois En attente (intra + HG) hors bon actif, focus le champ de scan.

### `bdToggleEnvoi(cb)` / `bdSelectAll()`
**Exportée** — Sélectionnent/désélectionnent des envois dans le formulaire.

### `saveCreateBon()`
**Exportée · async** — Valide (≥ 1 envoi + transporteurs renseignés), RPC `create_bon_depart` avec `p_transporteur_map`, affiche le détail, recharge.

### `showBDDetail(id, offerPrint)`
**Exportée · async** — Charge bon + sections + liens (enrichis labs), rend le détail.

### `saveBDSection(btn)`
**Exportée · async** — Sauvegarde une section (bon de connaissement, date prise en charge non future, transporteur réel).

### `cancelBon(id)` / `removeEnvoiFromBon(linkId, bonId)`
**Exportée · async** — Annulent un bon / retirent un envoi (avec confirmation, via RPC).

### `openAddColis(bonId, laboId)` / `closeAddColis()` / `bdToggleAddEnvoi(cb)` / `saveAddColis(bonId)`
**Exportée** — Gèrent l'ajout de colis à un bon existant (RPC `add_envois_to_bon`).

### `printBon(id)`
**Exportée · async** — Génère le document HTML du bon (sections par transporteur + liste), imprime via iframe cachée.

### `renderBonsDepartLabsToggle()` / `saveBonsDepartLabs()`
**Exportée** — Affichent/sauvegardent l'activation du module BD par lab.

### `bdScanEnvoi()`
**Exportée** — Traite un scan clavier : coche l'envoi et scrolle vers lui, ou toast d'erreur.

### `startCameraScan()`
**Exportée** — **NOUVEAU** — Démarre le scan par caméra (`getUserMedia` + `BarcodeDetector`) et coche l'envoi détecté.

### `stopCameraScan()`
**Exportée** — **NOUVEAU** — Arrête le flux caméra et libère les ressources.

---

## print.js

Rôle : impression du bordereau et de l'étiquette intra-grappe, tous formats. Génère les codes-barres CODE128 et DataMatrix via bwip-js.

### `_ensureBwip()`
**Exportée · async** — **NOUVEAU** — Charge dynamiquement la bibliothèque bwip-js (import à la demande) si absente.

### `printBordereauFromEnvoi(id, mode)`
**Exportée · async** — Retrouve l'envoi, construit `state.donneesImpression` et lance l'impression selon le `mode` (`etiquette`, `bordereau`, `les_deux` ; défaut : les deux pour HSILP, sinon étiquette).

### `printEtiquette()`
**Exportée · async** — **NOUVEAU** — Imprime uniquement l'étiquette (`printBordereau('etiquette')`).

### `printEtiquetteEtBordereau()`
**Exportée · async** — **NOUVEAU** — Génère étiquette (paysage) + bordereau (portrait) et les combine en un seul document multi-pages imprimé via iframe.

### `_printHtml(html, ifrW, ifrH)` *(interne)*
Injecte un HTML dans une iframe cachée, lance l'impression et la supprime.

### `printBordereau(overrideFormat, returnHtml)`
**Exportée · async** — Génère et imprime (ou retourne le HTML) le bordereau/étiquette selon le format actif : résout températures/spécimen, appelle le constructeur HTML approprié (bordereau seul, pochette labo/portrait, grille).

### `mkSpecLabel(...)` *(interne)*
Génère le SVG du pictogramme de type de spécimen (losange ou boîte).

### `brdHtmlBordereauSeul(...)` / `brdHtmlPochetteLabo(...)` / `brdHtmlPochettePortrait(...)` / `brdHtmlGrille(...)` *(internes)*
Constructeurs HTML des différents gabarits d'impression (avec scripts de redimensionnement dynamique).

---

## print-hg.js

Rôle : impression du document combiné Bordereau + F-G-74 hors-grappe (avec QR code de confirmation en ligne). Importe `adresseDestHG` de hgrappe.js.

### `reprintHGDocsFromEnvoi(id)`
**Exportée · async** — Récupère l'envoi HG, construit `state.hgDonneesImpression` (hiérarchie destinataire), ferme la modal, lance `printHGDocs()`.

### `printHGDocs()`
**Exportée · async** — Génère le code de vérification (6 chars du token), les CODE128, le QR code (async), le bordereau standard, puis combine avec le F-G-74.

### `printHGCombined(d, barcodeUrl, bordereauHtml, bcNumeroSvg, bcCodeSvg, qrDataUrl)` *(interne)*
Combine bordereau + F-G-74 bilingue FR/EN (champs expéditeur/destinataire, option confirmation en ligne QR ou fax) en un document imprimé.

---

## app-config.js

Rôle : chargement et sauvegarde de la configuration (app, grappe, modules), branding, messages Markdown, badges, thème, gabarits d'impression, paramètres de bordereau, notifications et secrets.

### Chargement

### `loadConfig()`
**Exportée · async** — Charge `app_config` + `module_config` (BD/HG/échantillons par lab), initialise `window.CFG`, applique branding/messages/badges/CSS.

### `saveCfg(key, value)`
**Exportée · async** — UPSERT dans `app_config`.

### `saveBrdCfg()`
**Exportée · async** — Sauvegarde l'objet complet `CFG.bordereau`.

### `loadGrappeConfig(grappeId)` / `saveGrappeCfg(key, value)`
**Exportée · async** — Chargent/sauvegardent `grappe_config` (alarmes, transporteurs) et appliquent les surcharges sur `CFG`.

### `renderCfgGrappe()` / `switchCfgGrappe(grappeId)`
**Exportée** — Affichent le panneau config grappe ; `switchCfgGrappe` charge une autre grappe.

### Branding & messages

### `applyBranding()` / `applyMessages()` / `applyBadges()` / `applyCustomCss()`
**Exportée** — Appliquent le nom/sous-titre, les messages Markdown convertis, les règles CSS des badges, et le CSS personnalisé.

### `mdToHtml(s)`
**Exportée** — Convertisseur Markdown simplifié et sécurisé (titres, gras, italique, code, liens validés, listes, HR).

### `mdeUpdate(key)` / `mdeWrap(key, before, after)` / `mdeLink(key)` / `mdeLinePrefix(key, prefix)` / `mdeBlock(key, text)`
**Exportée** — Utilitaires de l'éditeur Markdown inline (aperçu, entourage, insertion de lien/préfixe/bloc).

### Navigation config

### `showCfgTab(t)`
**Exportée** — Bascule l'onglet actif de configuration.

### Modules

### `renderCfgModules()`
**Exportée** — Affiche les toggles BD + HG par lab.

### `toggleModuleLab(module, labId, active)`
**Exportée · async** — Active/désactive un module pour un lab (UPSERT `module_config`, actualise la visibilité HG/transporteur).

### `openCfgAddModal(type)` / `closeCfgAddModal()` / `submitCfgAddModal()`
**Exportée** — Modal d'ajout générique (lab, transporteur, température, spécimen, lab externe).

### Sauvegarde — général

### `saveBranding()` / `saveMessages()` / `saveSilpPrintBordereau()`
**Exportée · async** — Sauvegardent nom/sous-titre, messages, et l'option d'impression bordereau SILP.

### `saveAlarms()` / `saveAlarmR()` / `saveAlarmP()`
**Exportée · async** — Sauvegardent les seuils d'alarme via `saveGrappeCfg`.

### Badges

### `renderCfgBadges()` / `livePreviewBadge(cls)` / `resetBadge(label, cls)` / `saveBadges()`
**Exportée** — Gèrent les color pickers des badges de statut (aperçu, reset, sauvegarde).

### Thème

### `renderCfgTheme()` / `saveCustomCss()`
**Exportée** — Affichent et sauvegardent le CSS personnalisé.

### Gabarits (formats)

### `_buildFmtCards(activeId, radioName, onChangeFn, formats)`
**Exportée** — Génère le HTML des cartes de sélection de gabarit.

### `renderCfgFormatsAll()`
**Exportée** — Affiche les cartes des 3 sélections de gabarit (étiquette intra, étiquette HG, bordereau).

### `saveFormatEtiquetteIntra(id)` / `saveFormatEtiquetteHG(id)` / `saveFormatBordereau(id)`
**Exportée · async** — Sauvegardent le gabarit actif de chaque type de document.

### Bordereau — général, styles, spécimens, températures, transporteurs

### `saveBrdGeneral()`
**Exportée · async** — Sauvegarde les paramètres généraux du bordereau (titre, pli, CANUTEC, labels).

### `renderCfgStyles()` / `previewStyleTemp(inp, key)` / `saveBrdStyles()`
**Exportée** — Affichent, prévisualisent et sauvegardent les couleurs de température.

### `renderCfgSpec()` / `toggleSpecEdit(i)` / `saveSpecType(i)` / `addSpecType()` / `removeSpecType(i)`
**Exportée** — Gèrent la liste des types de spécimen (affichage, édition inline, ajout, suppression).

### `renderCfgTemps()` / `saveTempMention(i)` / `addTemp()` / `removeTemp(i)`
**Exportée** — Gèrent la liste des températures (au moins une requise).

### `renderCfgTrans()` / `addTrans()` / `removeTrans(i)`
**Exportée** — Gèrent la liste des transporteurs.

### Notifications & secrets

### `renderCfgNotifications()`
**Exportée · async** — Charge en parallèle config, emails et logs de notification, puis rend les sous-sections.

### `openSecretModal(name, label, placeholder)` / `closeSecretModal()` / `saveSecretModal()`
**Exportée** — **NOUVEAU** — Modal de saisie sécurisée d'un secret (clé API provider, mot de passe SMTP) sans l'exposer dans le DOM.

### `toggleNotifProvider()`
**Exportée** — Bascule l'affichage des champs provider (Resend / SMTP).

### `saveNotifConfig()` / `saveNotifProvider()` / `testNotification()`
**Exportée · async** — Sauvegardent la config (`enabled`, `fallback_email`), la config provider, et envoient un email de test.

### `renderLabModalEmails(laboId)` / `addNotifEmail(laboId, deptId, email)` / `removeNotifEmail(id)`
**Exportée · async** — Chargent/ajoutent/suppriment les emails de notification par département dans le modal lab.

---

## kpi.js

Rôle : tableau de bord des indicateurs de performance (admin / superviseur_grappe uniquement), avec 4 cartes de stats, graphique de volumes quotidiens (Chart.js) et section ICR (BETA 1.10). Variables de module : `_volumeChart`, `_activeDays`.

### `initDashboard(days)`
**Exportée · async** — Initialise le tableau de bord pour une période (30/60/90 j) : appelle en parallèle RPC `get_labo_kpis` et **`get_icr_stats`**, puis rend widgets, graphique et section ICR.

### `_setPillActive(days)` *(interne)*
Active la pilule de période correspondante.

### `_card(color, icon, label, value, sub, alert)` *(interne)*
Génère le HTML d'une carte KPI.

### `_renderWidgets(stats)` *(interne)*
Affiche les 4 cartes (volume total, taux NC en rouge si > 5 %, transit moyen, hors-grappe).

### `_cssVar(name)` *(interne)*
Lit une variable CSS du thème courant.

### `_renderIcrSection(data)` *(interne)* — **NOUVEAU**
Affiche le tableau de répartition des **codes ICR** (code, libellé, nombre intra, nombre HG, total) sur la période, avec états vides.

### `_renderChart(data)` *(interne)*
Crée le graphique en barres des volumes quotidiens (couleurs lues du thème), en détruisant l'instance précédente.

---

## tour.js

**NOUVEAU MODULE (BETA 1.10).** Visite guidée interactive de l'application, adaptée au rôle de l'utilisateur (technicien / superviseur / grappe-admin). Superpose une bulle explicative et un surlignage sur des cibles DOM, avec exemples de données réalistes. La progression est persistée dans `profiles.tour_progress`. Variables : `TOUR_V` (version du parcours), `_active`, `_idx`, `_steps`, `_prog`.

### `_tier()` *(interne)*
Retourne le niveau de droits (0 = technicien, 1 = superviseur_labo, 2 = superviseur_grappe/admin) pour filtrer les étapes.

### `_eg(rows)` *(interne)*
Génère le HTML d'un bloc d'exemple (paires clé/valeur avec badges).

### `_ALL` *(constante interne)*
Liste ordonnée de toutes les étapes du parcours (welcome, navigation, création d'envoi, réception, résumé, bons de départ, KPI, mode HG, F-G-74, confirmations, utilisateurs, fin), chacune avec cible, position, niveau requis, action `before` et exemple.

### `_filtered()` *(interne)*
Filtre `_ALL` selon le niveau de droits de l'utilisateur.

### `_load()` *(interne · async)*
Charge la progression du tour depuis `profiles.tour_progress` (avec cache).

### `_save(data)` *(interne · async)*
Persiste la progression du tour en BD.

### `_isDemo()` *(interne)*
`true` si le compte est un compte de démonstration (`is_test`).

### `tourMaybeAutoStart()`
**Exportée · async** — Démarre automatiquement le tour au login si non terminé/passé (toujours pour les comptes démo).

### `tourStart()`
**Exportée** — Démarre le parcours (filtre les étapes, affiche l'overlay, montre l'étape 0).

### `tourNext()` / `tourPrev()`
**Exportée** — Navigation avant/arrière entre les étapes.

### `tourSkip()`
**Exportée** — Quitte le parcours et enregistre `skipped`.

### `tourFinish()`
**Exportée** — Termine le parcours et enregistre `finished`.

### `_show(i)` *(interne)*
Exécute l'action `before` de l'étape puis rend la bulle après stabilisation du layout (double rAF).

### `_render(step, i)` *(interne)*
Remplit la bulle (titre, texte, exemple, compteur, points de progression) et positionne le surlignage sur la cible.

### `_posBubble(bubble, tr, pos)` / `_centerBubble(bubble)` *(internes)*
Positionnent la bulle par rapport à la cible (droite/gauche/haut/bas) ou la centrent (mobile / sans cible).

### `_hide()` *(interne)*
Masque l'overlay, le surlignage, la bulle et les aperçus d'impression du tour.

---

## main.js

Rôle : point d'entrée ES modules. Importe tous les exports des modules et les ré-expose sur `window` (via `Object.assign`) pour que `app.js` (script global) et les handlers HTML inline (`onclick`) puissent les appeler sans import.

Expose sur `window` l'ensemble des fonctions exportées des modules : envois, hgrappe, print, print-hg, utils, auth, ui, labs, app-config, kpi (`initDashboard`), **echantillons** (nouveau), bons-depart (dont `startCameraScan`/`stopCameraScan`) et **tour** (nouveau).

### `window.toggleImpMenu(btn)` *(défini inline dans main.js)*
Ouvre/ferme le menu déroulant d'impression (étiquette / bordereau / les deux) et se ferme au clic externe.

En développement (localhost uniquement), journalise dans la console la confirmation du chargement des modules ES.

---

## Récapitulatif des ajouts (vs BETA 1.9.6)

- **Nouveaux modules :** `echantillons.js` (scan et vérification des échantillons hors-SILP, génération de NC), `tour.js` (visite guidée interactive persistée par rôle).
- **Codes ICR / hors-corridor :** setters `setHorsCorridor`/`setEditHorsCorridor` (envois.js), `setHgsHorsCorridor`/`setHgeHorsCorridor` (hgrappe.js) ; calcul des `codes_icr` (`70008` glace sèche, `70009` hors-corridor/urgent) dans `saveEnvoi`, `saveEditEnvoi`, `saveEnvoiHgSilp`, `saveEditHGEnvoi` ; état ICR ajouté dans state.js ; mapping `codesIcr`/`horsCorridorChoisi` dans `_mapEnvoi`/`_mapEnvoiHG`.
- **Section ICR dans kpi.js :** `_renderIcrSection` + RPC `get_icr_stats` dans `initDashboard`.
- **Journal des versions (ui.js) :** `switchAideTab`, `loadChangelog`, `_renderChangelog` (onglet « À propos », rendu de `CHANGELOG.md`).
- **Impression (print.js) :** `_ensureBwip` (chargement paresseux de bwip-js), `printEtiquette`, `printEtiquetteEtBordereau`, gabarits distincts étiquette/bordereau ; `printBordereauFromEnvoi(id, mode)` prend désormais un paramètre `mode`.
- **Gabarits (app-config.js) :** `renderCfgFormatsAll`, `saveFormatEtiquetteIntra`, `saveFormatEtiquetteHG`, `saveFormatBordereau` (remplacent les anciens `renderCfgFormats`/`setActiveFormat`/`renderCfgHsilpFormat`/`saveHsilpFormat`).
- **Secrets (app-config.js) :** `openSecretModal`, `closeSecretModal`, `saveSecretModal` (saisie sécurisée des clés API / SMTP).
- **Scan caméra (bons-depart.js) :** `startCameraScan`, `stopCameraScan` (`BarcodeDetector`).

---

Dernière mise à jour : 2026-07-04 — BETA 1.10.0
