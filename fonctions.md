# Fonctions — Traçabilité OPTILAB

> Généré le 2026-05-09 — BETA 1.9.6
> Couvre tous les modules JS client + fonctions SQL Supabase.
> **Audience :** référence rapide + onboarding développeur.

---

## Table des matières

- [state.js](#statejs) — Proxy état global + wrapper Supabase
- [utils.js](#utilsjs) — Fonctions pures (formatage, calculs, HTML)
- [ui.js](#uijs) — Toasts, spinner, panels, thème, modals
- [auth.js](#authjs) — Authentification, session, inactivité, multi-labo
- [labs.js](#labsjs) — Laboratoires, sélecteurs destinataire, températures, départements
- [envois.js](#envoisjs) — CRUD envois intra, réception, résumé, historique, utilisateurs, recherche
- [hgrappe.js](#hgrappejs) — Mode hors-grappe, envois HG, confirmations, résumé, config
- [app-config.js](#app-configjs) — Configuration application, branding, badges, formats, notifications
- [bons-depart.js](#bons-departjs) — Module bons de départ (création, détail, impression)
- [print.js](#printjs) — Impression bordereau intra-grappe
- [print-hg.js](#print-hgjs) — Impression bordereau + F-G-74 hors-grappe
- [kpi.js](#kpijs) — Tableau de bord KPI
- [Fonctions SQL](#fonctions-sql) — Fonctions PostgreSQL + triggers Supabase

---

## state.js

Objet proxy qui encapsule l'accès à l'état global `window.*` pour permettre une migration progressive vers ES modules. Toutes les propriétés lisent/écrivent sur `window`.

### `state` — Getters & Setters

| Getter/Setter | Proxy de | Rôle |
|---|---|---|
| `get sb()` | `window.sb` | Client Supabase |
| `get CFG()` | `window.CFG` | Configuration globale |
| `get/set currentUser` | `window.currentUser` | Profil utilisateur connecté |
| `get/set activeLabo` | `window.activeLabo` | Labo actif (contexte de travail) |
| `get activeLaboId()` | `window.activeLabo.id` | ID labo actif avec fallback `labo_id` |
| `get/set grappes` | `window.grappes` | Liste des grappes |
| `get/set activeGrappeId` | `window.activeGrappeId` | ID grappe active |
| `get/set laboratoires` | `window.laboratoires` | Liste des labs |
| `get/set envois` | `window.envois` | Envois intra chargés |
| `get/set envoisHG` | `window.envoisHG` | Envois HG chargés |
| `get/set labsExternes` | `window.labsExternes` | Labs externes |
| `get/set utilisateurs` | `window.utilisateurs` | Liste utilisateurs |
| `get/set cacheModals` | `window.cacheModals` | Cache des modals intra |
| `get/set hgCacheModals` | `window.hgCacheModals` | Cache des modals HG |
| `get/set termeRecherche` | `window.termeRecherche` | Température sélectionnée (formulaire) |
| `get/set departementsActifs` | `window.departementsActifs` | Départements cochés |
| `get/set refrigerantChoisi` | `window.refrigerantChoisi` | Glace sèche (true) / sachet (false) / null |
| `get/set sansSilp` | `window.sansSilp` | Mode HSILP actif |
| `get/set modeHG` | `window.modeHG` | Mode hors-grappe actif |
| `get/set editEnvoiId` | `window.editEnvoiId` | ID envoi en cours d'édition |
| `get/set editTemperature` | `window.editTemperature` | Température en édition |
| `get/set editDepts` | `window.editDepts` | Départements en édition |
| `get/set editRefrigerant` | `window.editRefrigerant` | Réfrigérant en édition |
| `get/set hgEditId/Temperature/Refrigerant/ListesSilp` | `window.hgEdit*` | État formulaire édition HG |
| `get/set hgTemperature/Refrigerant/ListesSilp/SansSilp` | `window.hg*` | État formulaire création HG |
| `get/set donneesImpression` | `window.donneesImpression` | Données impression intra |
| `get/set hgDonneesImpression` | `window.hgDonneesImpression` | Données impression HG |
| `get/set hgFaxId/Conforme` | `window.hgFax*` | État modal fax HG |
| `get/set canalRealtime` | `window.canalRealtime` | Canal Supabase Realtime |
| `get/set timerInactivite` | `window.timerInactivite` | Timer déconnexion inactivité |
| `get/set resumePage*/Labo*` | `window.resumePage*` | Pagination résumé |
| `get/set hgcPage/hghPage/hgrPage*` | `window.hg*Page` | Pagination panels HG |

---

### `sbCall(promise, notifierId)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Wrapper sécurisé pour tous les appels Supabase — gère les erreurs réseau, la détection de session expirée et l'affichage de notifications.
**Paramètres :**
- `promise` (Promise) — promesse Supabase à exécuter
- `notifierId` (string, optionnel) — ID d'un élément DOM pour afficher l'erreur
**Algorithme :**
1. `await promise` dans un try/catch
2. Exception réseau → `notifier(notifierId, msg)` si présent, retourner `{data:null, error}`
3. Erreur Supabase 401 ou message JWT → planifier `seDeconnecter()` après 1 500 ms, afficher toast session expirée
4. Autre erreur → `notifier(notifierId, error.message)` si présent
5. Retourner `{data, error}` dans tous les cas
**Retourne :** `{data, error}` compatible Supabase

---

## utils.js

Fonctions pures, sans effets de bord sur le DOM ni sur l'état global.

### Constantes exportées

| Constante | Valeur | Rôle |
|---|---|---|
| `classesPills` | `['tp-0','tp-1','tp-2','tp-3','tp-4']` | Classes CSS rotation pills température |
| `departements` | Array 4 objets | Définition des 4 départements (id, label, short, cls) |

---

### `escapeHtml(str)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Échappe les caractères HTML pour prévenir les injections XSS.
**Algorithme :** `null/undefined → ''` puis remplace `& < > " '` par leurs entités HTML dans cet ordre.
**Retourne :** String sécurisée pour `innerHTML`

### `formatDateTime(iso)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Formate une date ISO en `JJ/MM/AAAA HH:MM` (locale `fr-CA`).
**Retourne :** String ou `'—'` si valeur vide

### `formatDate(iso)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Formate une date ISO en `lundi 12 mai 2025` (locale `fr-FR`, format long).
**Retourne :** String ou `''`

### `deepKey(iso)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Retourne la clé de tri `YYYY-MM-DD` d'une date ISO (utilisée pour grouper les résumés).
**Retourne :** `'YYYY-MM-DD'` ou `'0000-00-00'`

### `heuresTransit(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Calcule la durée de transit d'un envoi en heures.
**Paramètres :** `e` (objet envoi avec `tsEnvoi` et `tsRecep`)
**Algorithme :** `(tsRecep || now) - tsEnvoi` converti en heures. Retourne `null` si pas de `tsEnvoi`.

### `formatDuree(h)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Formate des heures en `Xh05`.
**Retourne :** String ou `'—'`

### `classeBadge(s)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Classe CSS du badge de statut d'un envoi.
**Retourne :** `'ba'` (En attente) / `'bt'` (En transit) / `'br'` (Reçu) / `'bperdu'` (Perdu/Annulé) / `'bp2'` (Problème)

### `libelleRole(r)` / `classeBadgeRole(r)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Libellé et classe CSS badge d'un rôle utilisateur (`admin`, `superviseur_grappe`, `superviseur_labo`, technicien).

### `formaterCP(v)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Formate un code postal canadien (`G5L 5T1`) — supprime espaces, majuscules, coupe à 6 chars, insère espace après 3.

### `formaterTel(v)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Formate un numéro de téléphone nord-américain `(418) 724-3000` — 10 chiffres max, format progressif.

### `separateurModal(t)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Génère le HTML d'un séparateur de section (ligne + label) dans les modals de formulaire.

### `departementsHtml(d)` / `departementsTexte(d)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Génèrent respectivement des badges `<span>` HTML et un texte séparé par virgules pour un tableau d'IDs de départements.

---

## ui.js

### `notifier(id, msg, t)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Wrapper de `toast()` avec type simplifié (`'e'` = erreur, `'s'` = succès). Le paramètre `id` est ignoré, conservé pour compatibilité.

### `toast(msg, type, duration)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche une notification toast temporaire en haut de l'écran.
**Paramètres :** `type` : `'s'` (succès, vert), `'e'` (erreur, rouge), `'i'` (info, bleu) | `duration` : ms (défaut 4 000)
**Algorithme :**
1. Crée un `div.toast` avec icône SVG + message + bouton fermeture
2. Ajoute une barre de progression animée (`div.toast-bar`)
3. Insère dans `#toast-container`
4. Planifie `removeToast()` après `duration` ms

### `removeToast(el)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Supprime un toast avec animation de disparition (classe `removing` → suppression DOM après 220 ms).

### `spin(on)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche (`on=true`) ou masque (`on=false`) le spinner `#spinner` via toggle de la classe `done`.

### `showScr(s)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche l'écran spécifié (`'login'`, `'cpw'`, `'labo'`, `'app'`) en masquant les autres. L'écran `app` reçoit la classe `on`.

### `showPanel(n)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche le panel de navigation spécifié et initialise son contexte.
**Algorithme :**
1. Normalise le nom (`'hsilp'` → `'nouveau'`, `'hg-hsilp'` → `'hg-silp'`)
2. Vérifie que `#panel-{n}` existe, sinon utilise le panel par défaut
3. Sauvegarde dans `sessionStorage`
4. Active le panel et le bouton nav correspondants
5. Gère les abonnements Realtime (subscribe si panel dans `_RT_PANELS`, unsub sinon)
6. Appelle la fonction d'initialisation spécifique selon le panel :
   - `reception` → focus `#rnum`
   - `historique` / `hg-historique` → vérif droits + chargement stats
   - `resume` → `renderResume()`
   - `utilisateurs` → `loadUsersAndRender()`
   - `config` → tous les rendus de config
   - `moncompte` → `renderMonCompte()`
   - `hg-silp` → `initHgSilpForm()`
   - `hg-confirmations` → `renderHGConfirmations()`
   - `hg-resume` → `renderHGResume()`
   - `kpi` → vérif droits + `initDashboard()`
   - `bons-depart` → vérif module + `initBonsDepart()`
   - `recherche` → `renderRecherche()`

### `closeGMod()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ferme la modal générale `#gmod` (retire classe `show`) et rend le focus au déclencheur `window._gmodTrigger`.

### `_isDarkNow()` *(interne)*
**Rôle :** Retourne `true` si le thème sombre est actif (attribut `data-theme` ou préférence système).

### `initTheme()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Initialise le thème au chargement — lit `localStorage('optilab-theme')` ou détecte le dark mode système.

### `toggleTheme()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Bascule clair/sombre, persiste dans `localStorage` et met à jour `profiles.theme` en BD.

### `updateThemeBtn()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Met à jour l'icône et le `title` des boutons thème (`#theme-btn`, `#login-theme-btn`, `#cpw-theme-btn`).

### `setupKeyboard()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Initialise le listener `keydown` Escape pour fermer la modal visible en priorité (liste prédéfinie : `#hsilp-warn-modal`, `#annul-envoi-modal`, `#edit-envoi-modal`, `#hg-edit-modal`, `#hg-fax-modal`, `#hg-success-modal`, `#success-modal`, `#gmod`, `#confirm-modal`).

### `setupConfirmModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Attache les handlers click sur `#confirm-ok` et `#confirm-cancel` pour résoudre la Promise de `confirm2()`.

### `confirm2(title, msg, btnLabel, danger)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche une modal de confirmation et retourne une `Promise<boolean>`.
**Paramètres :** `danger` : `true` (rouge), `'warn'` (orange), falsy (bleu)
**Retourne :** `Promise<true>` si OK, `Promise<false>` si Annuler/Escape

### `showSuccessModal(num)` / `closeSuccessModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche/ferme la modal de succès après enregistrement d'un envoi. Affiche ou masque le bouton "Imprimer" selon `CFG.printBordereau`.

### `initNlistValidation()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Attache un `oninput` sur `#nlist` qui valide le format SILP (chiffres uniquement = erreur, dupliqué dans les envois = erreur, ≥ 4 chars = valid).

---

## auth.js

Variables de module internes : `_loginAttempts`, `_loginLocked`, `_loginLockUntil`, `_inactActive`, `_pendingP`, `_pendingLabos`, `_laboFromLogin`.

### `estAdmin()` / `estGrappe()` / `estSuperviseur()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Vérifient le rôle de `state.currentUser`. `estGrappe()` = superviseur_grappe OU admin. `estSuperviseur()` = superviseur_labo OU grappe OU admin.

### `initLoginBg()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Choisit une photo aléatoire dans `state.LOGIN_PHOTOS`, la précharge, applique en `backgroundImage` sur `#login-bg`, `#cpw-bg`, `#labo-bg` et affiche le crédit.

### `seConnecter()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Authentifie l'utilisateur avec rate limiting (5 tentatives → verrou 30 s).
**Algorithme :**
1. Lit `#lid` et `#lpw`, vérifie le verrou
2. `auth.signInWithPassword({ email: id+'@optilab.internal', password })`
3. Erreur → incrémente compteur, verrouille si ≥ 5 tentatives
4. Succès → réinitialise compteur, appelle `loadProfileAndInit(uid)`

### `loadProfileAndInit(uid)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge le profil complet + memberships, vérifie `active`, gère `must_change_password` et le routage multi-labo.
**Algorithme :**
1. SELECT `profiles` avec jointures `lab` + `memberships:user_lab_memberships`
2. Si inactif → déconnexion
3. Construit `p.labMemberships`, `p.labs`, `p.labo_ids` depuis les memberships (avec fallback `labo_ids` pour les anciens profils)
4. Si `must_change_password` → afficher écran `cpw`
5. Sinon → `finaliserConnexion(p)`

### `enregistrerMotDePasse()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide et enregistre un nouveau mot de passe (changement forcé). Appelle `auth.updateUser()` puis met `must_change_password = false` et appelle `finaliserConnexion()`.

### `finaliserConnexion(p)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Phase principale de connexion — charge config et labs, détermine la grappe active, gère le choix de labo.
**Algorithme :**
1. Appels parallèles `loadConfig()` + `loadLabs()`
2. Détermine `state.activeGrappeId` depuis le `grappe_id` du labo principal
3. Appelle `loadGrappeConfig(grappeId)`
4. Multi-labo (labs.length > 1) : cherche le labo mémorisé dans `localStorage`, sinon affiche `_showLaboPicker()`
5. Labo unique : appelle directement `_completeInit(p)`

### `_completeInit(p)` *(interne)*
**Async :** Oui
**Rôle :** Phase finale — remplit l'UI (avatar, nom, labo, rôle), affiche/masque les éléments nav selon les droits, remplit les sélecteurs, applique le thème, restaure le panel, démarre l'inactivité.

### `_inactStart()` / `_inactReset()` / `_inactStop()` *(internes)*
**Rôle :** Gestion du timer d'inactivité (15 min). `_inactStart` attache des listeners passifs (mousemove, keydown, click, touchstart, scroll). Chaque événement appelle `_inactReset()` qui replanifie `seDeconnecter()`.

### `_showLaboPicker(labos, fromLogin)` *(interne)*
**Rôle :** Affiche l'écran de sélection de labo — boutons pour chaque labo, chacun appelle `choisirLabo()`.

### `choisirLabo(lab)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Applique un labo sélectionné : mémorise dans `localStorage`, recharge les envois, appelle `_completeInit()` (depuis login) ou `_applyLaboChange()` (depuis l'app).

### `changerLabo()` / `annulerChangementLabo()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre / ferme l'écran de sélection de labo pour les utilisateurs multi-labo.

### `initLabSwitch(labos)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Rafraîchit l'indicateur de labo actif dans la sidebar.

### `seDeconnecter()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Déconnexion complète — arrête l'inactivité, supprime le canal Realtime, appelle `auth.signOut()`, réinitialise tout le state, affiche l'écran `login`.

---

## labs.js

### `loadLabs()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge tous les labs actifs depuis `laboratories` (avec `grappe_id`) et stocke dans `state.laboratoires`.

### `formaterAdresseLabo(lab)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Retourne une string `Adresse · Ville Province CP · Téléphone` depuis un objet lab.

### `buildLdestOpts()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Remplit `#ldest-opts` avec des divs cliquables pour chaque lab (sauf le labo actif). Chaque div appelle `pickLdest()` sur `mousedown`.

### `filterLdest()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Filtre les options de `#ldest-opts` selon `#ldest-input` (case-insensitive) et ouvre le dropdown.

### `openLdestDrop()` / `closeLdestDrop()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ajoute/retire la classe `open` sur `#ldest-opts`.

### `pickLdest(id, name)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Sélectionne un labo destinataire — remplit `#ldest` (id) et `#ldest-input` (nom), ferme le dropdown, appelle `updateDestAddr(id)`.

### `ldestKeyNav(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Navigation clavier dans le dropdown destinataire (ArrowUp/Down déplace la classe `kfocus`, Enter appelle `pickLdest()`, Escape ferme).

### `updateExpAddr()` / `updateDestAddr(labId)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affichent l'adresse formatée du labo expéditeur (`#lexp-addr`) et destinataire (`#ldest-addr`) depuis `state.laboratoires`.

### `populateSels()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Remplit tous les sélecteurs du formulaire d'envoi : destinataires, transporteurs, labs responsable, types de spécimen. Appelle `renderTempPills()` et `updateTransporteurVisibility()`.

### `updateTransporteurVisibility()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche `#trans-row` si le module Bons de départ est inactif pour le labo, masque sinon.

### `renderTempPills()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Crée les pilules de sélection température dans `#tpills-c` depuis `CFG.temperatures`. Reset `state.termeRecherche`.

### `selectionnerTemp(lbl, pc)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Sélectionne une température — met à jour `state.termeRecherche`, toggle les classes pilules, affiche/masque `#glace-section` selon `ask_glace`, applique le réfrigérant par défaut du labo.

### `setGlace(val)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Enregistre le choix glace sèche (`true`) / sachet (`false`) dans `state.refrigerantChoisi`, met à jour les outlines des boutons.

### `toggleDept(d)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ajoute ou retire un département de `state.departementsActifs`, met à jour les classes des pilules `#dp-{DEPT_ID}`.

### `renderCfgLabs()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche la liste des labs dans le panneau config (Grappe) avec tags BD/HG, adresse résumée et boutons Modifier/Désactiver.

### `openLabModal(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Ouvre le modal d'édition d'un lab — remplit coordonnées, réfrigérant, fax, modules (BD/HG), charge la config notifications depuis `module_config`, appelle `renderLabModalEmails()`.

### `closeLabModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ferme `#lab-edit-modal`, réinitialise `_labModalId` et `window._currentLabModalId`.

### `saveLabModal()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegarde le modal lab en 5 étapes séquentielles :
1. UPDATE `laboratories` (coordonnées)
2. UPSERT `module_config` module `bons_depart`
3. UPSERT `module_config` module `hgrappe`
4. UPSERT `module_config` module `notifications`
5. Met à jour `state.laboratoires` localement, rafraîchit `renderCfgLabs()`, `renderCfgModules()`, `updateTransporteurVisibility()`.

### `addLab()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Crée un lab (INSERT `laboratories` avec `grappe_id = window._cfgGrappeId`). Gère le doublon (code 23505).

### `removeLab(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Désactive un lab (soft delete : `active = false`) après confirmation `confirm2()`.

---

## envois.js

### Alarmes & Affichage

### `libelleTemp(t)` / `libelleTempCourt(t)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Retournent l'icône + label complet ou court d'une température depuis `CFG.temperatures`.

### `estAlarmeRetard(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** `true` si statut `'En transit'` et heures de transit > `CFG.alarmR`.

### `estAlarmePerdu(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** `true` si statut `'En transit'` et heures > `CFG.alarmP * 24`.

### `estArriveeRetard(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** `true` si statut `'Reçu'` et durée de transit > `CFG.alarmR`.

### `classeLigne(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Classe CSS de la ligne tableau : `'row-perdu'`, `'row-probleme'`, `'ar-lost'`, `'ar'` ou `''`.

### `estAlerte(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** `true` si l'envoi est en alarme retard, perdu, arrivée retard, Problème ou Perdu.

### `afficherLegende(elId, arr)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Construit et injecte le HTML `<details>` de légende des alarmes dans l'élément `elId`, en analysant `arr`. Si aucune alerte, vide l'élément.

### `celluleTransit(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Génère le HTML de la cellule durée de transit avec code couleur et SVG alerte selon l'état de l'envoi.

---

### Chargement

### `_mapEnvoi(row)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Transforme une ligne brute Supabase en objet envoi normalisé (40+ propriétés : `id`, `numero`, `numerosSilp`, `exp`, `dest`, `expId`, `destId`, `statut`, `temperature`, `transporteur`, `departements`, `tsEnvoi`, `tsRecep`, `creePar`, `annuleAt`, etc.).

### `loadEnvois()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge les envois actifs + récents dans `state.envois`.
**Algorithme :**
1. `cutoff = now - 7 jours`
2. q1 : `En attente` + `En transit` (pas de filtre temporel — bornés naturellement)
3. q2 : `Reçu` + `Problème` depuis J−7
4. Filtré par labo actif si non-grappe
5. Merge, tri DESC, `_mapEnvoi()` sur chaque ligne

---

### Création d'envoi

### `saveEnvoi()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Crée un envoi SILP ou délègue à `_doSaveEnvoiHsilp()` si `state.sansSilp`.
**Algorithme (SILP) :**
1. Valide : labo dest, température, réfrigérant, transporteur (sauf BD actif), départements, chips SILP
2. INSERT `envois` — statut `'En attente'` si BD actif, sinon `'En transit'`
3. Construit `state.donneesImpression`
4. `resetForm()` + `showSuccessModal(numero)`

### `_doSaveEnvoiHsilp(_bdOn)` *(interne)*
**Async :** Oui
**Rôle :** Crée un envoi HSILP via RPC `create_envoi_hsilp`. Construit `state.donneesImpression`, appelle `showSuccessModalHsilp()`.

### `resetForm()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Réinitialise complètement le formulaire d'envoi — vide tous les champs, `_silpChips = []`, reset état (température, glace, départements, SILP), désactive mode HSILP.

---

### Réception

### `showRlabErr(title, sub)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche un message d'erreur dans le panneau réception et remet le focus sur `#rnum`.

### `rechercher()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Recherche un envoi par numéro interne ou SILP physique.
**Algorithme :**
1. Teste si format interne (regex `SILP-`/`HSILP-`) → cherche dans `state.envois` par `numero`
2. Sinon → cherche par `numerosSilp.indexOf(v)`
3. Filtre par droits d'accès (labo)
4. 0 résultat → vérifie DB si envoi perdu, sinon erreur
5. >1 résultat → modal de sélection multi-SILP
6. 1 résultat → `_afficherResultatReception(e)`

### `confirmer()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** UPDATE `statut='Reçu'`, `ts_recep`, `recep_par_nom`, `recep_obs`. Gère la race condition (vérifie que l'UPDATE a affecté 1 ligne). Flash vert, notification succès, reset UI après 600 ms.

### `signaler()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** UPDATE `statut='Problème'` (valide que l'observation est non-vide). INSERT `notification_queue` type `'nc'`. Flash orange.

### `_queueNotif(type, e, extra)` *(interne)*
**Rôle :** Fire-and-forget INSERT dans `notification_queue` (type `'nc'` ou `'lost'`).

---

### Modal de détail

### `showGMod(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Ouvre la modal générale de détail d'un envoi.
**Algorithme :**
1. Cherche dans `state.envois` ou cache. Si absent → SELECT DB + `_mapEnvoi()`
2. Calcule alarmes, récupère config température et spécimen
3. Construit le HTML : banner annulation, infos de base, parties, spécimen/transport, traçabilité, notes
4. Détermine les boutons : `canPrint` (HSILP/config + expéditeur + non-reçu), `canModify` (non-annulé + droits : créateur OU responsable OU grappe), `canDeclare` (superviseurs)
5. Affiche la modal
6. Charge en parallèle : dernier audit UPDATE + info bon de départ associé

### `declarerPerdu(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Après `confirm2()`, UPDATE `statut='Perdu'`, INSERT `notification_queue` type `'lost'`, ferme modal, recharge envois.

---

### Résumé

### `switchRTab(t)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Bascule entre les 3 onglets du résumé (`'sent'`, `'recv'`, `'done'`).

### `loadResumeDonePage(laboId, page)` / `loadResumeSentPage(laboId, page)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge une page paginée (10/page) du résumé — reçus ou envoyés. En mode alertes (page 0), charge jusqu'à 500 envois et filtre localement par `estAlerte()`. Groupe par date, render tableau, met à jour paginateur.

### `renderResumeRecvPage(page)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche une page du résumé "En attente de réception" (pagination locale sur `state.resumeDonneesRecus`).

### `changeResumeDonePage(delta)` / `changeResumeSentPage(delta)` / `changeResumeRecvPage(delta)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Incrémentent/décrémentent la page du résumé correspondant.

### `getResData()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Agrège depuis `state.envois` les envois reçus et en attente pour le labo courant, avec les filtres date/département actifs. Retourne `{laboId, laboName, recv, pending}`.

### `renderResume()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Orchestrateur — récupère les données via `getResData()`, affiche le titre et la légende, lance les 3 `loadResume*Page(0)` en parallèle.

### `toggleResumeAlerts()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Bascule le mode alertes du résumé et re-render.

---

### Export PDF

### `togglePdfDrop(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre/ferme le menu déroulant PDF (stop propagation + toggle classe `'open'`).

### `pdfStr(s)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Nettoie une string pour PDF — remplace les tirets unicode par ASCII, les caractères non-ASCII par `?`.

### `exportPDF(orient)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Génère un PDF du résumé (jsPDF) avec tous les envois filtrés, groupés par date, avec durations en rouge si alarme. `orient` = `'portrait'` ou `'landscape'`.

---

### Historique

### `loadHistPage(page)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge une page (10/page) de l'historique avec filtres (texte, statut, département, transporteur, dates). En mode alertes, charge 1 000 envois en alerte et pagine localement.

### `loadHistStats()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge en parallèle 3 counts (total, ce mois, en transit) et le nombre de labs actifs.

### `changeHistPage(delta)` / `onHistSearch()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Navigation et recherche debounce (400 ms) de l'historique.

### `toggleHistAlerts()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Bascule le mode alertes de l'historique et recharge la page 0.

---

### Modification d'envoi

### `openEditEnvoi(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Ouvre le modal d'édition — pré-remplit tous les champs, détermine `canPrint`/`canModify`/`canDelete` selon droits (créateur OU responsable OU superviseur), vérifie si l'envoi est dans un bon actif.

### `closeEditEnvoi()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Masque `#edit-envoi-modal`, reset `state.editEnvoiId`.

### `afficherPillsTempEdit()` / `selectionnerTempEdit(lbl, pc)` / `setEditGlace(val)` / `toggleDeptEdit(d)` / `updatePillsDeptEdit()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Gèrent l'UI du formulaire d'édition — identiques à leurs équivalents du formulaire de création, mais opèrent sur `state.edit*`.

### `saveEditEnvoi()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide, détecte les changements, UPDATE `envois`, INSERT `envois_audit`, reconstruit `state.donneesImpression`, affiche `showSuccessModalEdit()`.

### `showSuccessModalEdit(num, isHsilp)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche la modal succès "Envoi modifié" avec bouton imprimer conditionnel.

---

### SILP / HSILP

### `addSilpList()` / `removeSilpList(v)` / `renderSilpChips()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Gèrent la liste `_silpChips` — ajout (avec validation format + doublon + doublon actif → modal `confirmSilpDup`), suppression, rendu HTML des chips.

### `confirmSilpDup()` / `cancelSilpDup()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Confirme ou annule l'ajout d'un SILP déjà présent dans un envoi actif.

### `showNoListModal(cb)` / `cancelNoList()` / `confirmNoList()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche/gère la modal d'avertissement avant de basculer en mode HSILP.

### `toggleNoSilp()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Bascule le mode HSILP avec confirmation modale. Si confirmé : `state.sansSilp = true`, `_applyNoSilpUi(true)`, `fetchHsilpPreviewNum()`.

### `fetchHsilpPreviewNum()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Appelle RPC `peek_next_hsilp` et affiche le numéro prévisualisé dans le formulaire.

### `showSuccessModalHsilp(num)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche la modal succès HSILP avec bouton imprimer et lance l'impression automatiquement après 400 ms.

### `_afficherResultatReception_global(id)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Wrapper global qui retrouve l'envoi par ID dans `state.envois` et appelle `_afficherResultatReception()` (utilisé par la modal multi-SILP).

---

### Mon Compte

### `renderMonCompte()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche le profil courant (nom, N° employé, labo, rôle, audit). Masque la section MDP pour les comptes `is_test`.

### `saveMcPw()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide et enregistre un nouveau MDP via `auth.updateUser()`. Affiche succès 4 s ou erreur.

---

### Gestion des utilisateurs

### `loadUsersAndRender()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** SELECT `profiles` avec jointures `lab` + `memberships:user_lab_memberships`. Filtré par labo actif si non-grappe. Stocke dans `state.utilisateurs`, appelle `renderUT()`.

### `renderUT()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche le tableau des utilisateurs — chaque ligne inclut les labs avec dots de couleur + badge `Resp.` si responsable, colonne audit, boutons actions conditionnels.

### `_renderUfMembershipsUI()` *(interne)*
**Rôle :** Affiche dans le formulaire utilisateur uniquement les memberships attribués (pas la liste complète des labs). Ajoute un sélecteur d'ajout pour les labs restants.

### `addUfMembership()` / `removeUfMembership(laboId)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ajoutent/retirent un membership de `_ufMemberships` et re-rendent l'UI.

### `openAddU()` / `openEditU(id)` / `cancelUF()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvrent le formulaire d'ajout ou d'édition utilisateur (pré-rempli), ferment le formulaire.

### `callEdge(action, payload)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Appelle la fonction Edge `/manage-user` avec l'action demandée (`'create'`, `'reset_password'`, `'toggle_active'`) via `fetch` avec Authorization Bearer.

### `saveUser()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Crée ou met à jour un utilisateur.
**Algorithme (création) :** Valide champs + MDP → `callEdge('create')` → `_saveMemberships()` → UPDATE audit
**Algorithme (édition) :** UPDATE `profiles` → `_saveMemberships()` → `callEdge('reset_password')` si MDP renseigné → met à jour `state.currentUser` si c'est soi-même

### `_saveMemberships(profileId, memberships)` *(interne)*
**Async :** Oui
**Rôle :** Synchronise `user_lab_memberships` — DELETE les anciens non présents (NOT IN), UPSERT les nouveaux (conflit sur `profile_id + labo_id`).

### `togU(id, active)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Active ou désactive un utilisateur via `callEdge('toggle_active')` après vérification des droits.

### `_renderUfLaboIdsOnChange()` *(no-op)*
**Rôle :** Conservé pour compatibilité `window.*` — ne fait rien (remplacé par le système de memberships).

---

### Temps réel

### `subscribeRT()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Crée un canal Realtime `'envois-rt'` avec listeners sur `envois` et `envois_hgrappe`. Chaque changement vide le cache modal correspondant, recharge les envois, et re-rend le panel actif.

---

### Recherche globale

### `renderRecherche()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Focus + select sur le champ recherche à l'ouverture du panel.

### `onRechercheInput()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Debounce 500 ms avant d'appeler `doRecherche()`. Affiche un message si < 3 caractères.

### `doRecherche()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Recherche globale sur 5 requêtes parallèles (envois intra par numéro, par SILP, envois HG par numéro, par SILP, bons de départ par numéro). Déduplique, filtre par droits, trie par date, construit le tableau de résultats avec badges et click handlers.

### `showRchDetail(id, type)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche le détail d'un résultat de recherche — modal complète si l'utilisateur a accès au labo, sinon modal restreinte (sans spécimen, notes, traçabilité).

---

### Annulation logique

### `openAnnulationEnvoi()` / `closeAnnulationEnvoi()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre/ferme le modal d'annulation. `openAnnulationEnvoi` remplit le numéro de référence et stocke `_annulEnvoiId`.

### `saveAnnulationEnvoi()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide que la note est non-vide, appelle RPC `annuler_envoi(envoi_id, note)`, ferme les modals, recharge les envois.

---

## hgrappe.js

### Mapping & Chargement

### `_mapEnvoiHG(row)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Transforme une ligne `envois_hgrappe` en objet normalisé (propriétés : `id`, `numero`, `source`, `exp`, `dest`, `destLab`, `expId`, `destId`, `temp`, `transporteur`, `numerosSilp`, `statut`, `confirmToken`, `confirmMethod`, `confirmConforme`, `confirmNcTypes`, `tsConfirm`, `tsEnvoi`, etc.).

### `loadExtLabs()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge tous les labs externes actifs depuis `external_labs` (avec adresses) et stocke dans `state.labsExternes`.

### `loadEnvoisHG()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge les envois HG actifs + récents (J−7 pour Reçu/Aucune réponse). Filtre par labo actif si non-grappe. Appelle `autoCloseHGEnvois()`.

### `autoCloseHGEnvois()` *(interne)*
**Async :** Oui
**Rôle :** Passe automatiquement au statut `'Aucune réponse reçue'` les envois En transit sans confirmation depuis plus de `CFG.hgrappeAutoCloseDays` jours.

---

### Helpers d'affichage

### `classeBadgeHG(s)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Classe CSS badge HG : `'br'` (Reçu), `'bp2'` (Problème), `'bperdu'` (Aucune réponse), `'ba'` (En attente), `'bt'` (En transit).

### `estAlarmeHG(e)` / `estSansReponse(e)` / `classeLigneHG(e)` / `estAlerteHG(e)` / `afficherLegendeHG(elId, arr)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Équivalents HG de `estAlarmeRetard`, `classeLigne`, `estAlerte`, `afficherLegende` — basés sur `CFG.hgrappeAlarmDays` et le statut `'Aucune réponse reçue'`.

### `ligneDestHG(e)` / `texteDestHG(e)` / `adresseDestHG(lab)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Formatent le destinataire HG (avec hiérarchie parent/enfant) en HTML, texte brut, et objet adresse (avec fallback parent).

---

### Mode & Basculement

### `isHGEnabled()`
**Async :** Non | **Exportée :** Oui
**Rôle :** `true` si admin, ou si le labo actif est dans `CFG.hgrappeEnabledLabs`.

### `initHGMode()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Initialise le mode HG au login — lit `localStorage('optilab-mode')`, appelle `updateSidebarForMode()`, charge labs externes + envois HG si mode HG, initialise les dates par défaut.

### `updateSidebarForMode()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Met à jour la sidebar selon le mode — affiche/masque les groupes nav, label, icône SVG, badge de mode, classe `hg-mode`.

### `setMode(mode)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Change le mode (`'hgrappe'` ou `'intra'`), persiste dans `localStorage`, met à jour la sidebar, charge les données et affiche le panel par défaut.

### `toggleModeDrop(e)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre/ferme le dropdown du switcher de mode. Auto-ferme sur click externe (listener `once`).

---

### Sélecteurs destinataire HG

### `buildHgParentSelect(selId)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Remplit un select avec les labs racines (sans `parent_id` ou dont le parent n'existe pas).

### `updateHgDestSelection(parentSelId, childSelId, childWrapId, hiddenId, addrId)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Met à jour le select enfant quand le parent change — charge les enfants, affiche/masque le wrapper, met à jour le champ hidden et l'adresse.

### `updateHgDestChild(parentSelId, childSelId, hiddenId, addrId)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Met à jour le champ hidden quand un enfant est sélectionné (ou retombe sur le parent si aucun enfant).

### `showHgDestAddrEl(labId, addrEl)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche l'adresse d'un lab externe dans un élément HTML (avec fallback parent).

### `onHgSilpParentChange()` / `onHgSilpChildChange()` / `onHghParentChange()` / `onHghChildChange()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Callbacks d'événements pour les sélecteurs destinataire dans les formulaires SILP et historique.

### `buildHgDestLabObj(destId)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Retourne un objet lab externe enrichi de son parent pour l'affichage dans les modals.

---

### Formulaire envoi HG (SILP)

### `initHgSilpForm()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Initialise le formulaire SILP HG — nom labo expéditeur, adresse, select parents, transporteurs, spécimens, pills température.

### `addHgsList()` / `removeHgsList(v)` / `renderHgsChips()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Gèrent la liste `state.hgListesSilp` avec validation (format, doublon, doublon actif) et rendu des chips.

### `setHgsSGC(val)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Setter glace sèche/sachet pour le formulaire SILP HG (`state.hgRefrigerant`).

### `resetHgSilpForm()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Réinitialise entièrement le formulaire SILP HG (état + DOM).

### `saveEnvoiHgSilp()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide et crée l'envoi HG — valide tous les champs, délègue à `_doSaveEnvoiHgHsilp()` si sans SILP, sinon RPC `create_envoi_hgrappe`. Construit `state.hgDonneesImpression`, appelle `showHGSuccessModal()`.

### `fetchHgHsilpPreviewNum()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** RPC `peek_next_hgrappe` pour afficher le prochain numéro HG HSILP.

### `toggleHgsNoSilp()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Bascule le mode sans SILP avec confirmation modale.

---

### Modal succès HG

### `showHGSuccessModal(num)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche la modal succès HG — désactive le bouton fermeture jusqu'à ce que la checkbox "J'ai imprimé" soit cochée.

### `toggleHGClose()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Active/désactive le bouton fermeture selon la checkbox `#hg-printed-cb`.

### `closeHGSuccessModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ferme la modal et retourne au panel `hg-silp`.

---

### Confirmations

### `getHGRLaboId()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Retourne l'ID labo sélectionné dans le select résumé, ou `state.activeLaboId` par défaut.

### `loadHGConfirmationsPage(page)` / `changeHGCPage(delta)` / `renderHGConfirmations()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Chargent le tableau Confirmations paginé (10/page) avec filtres dates/statut. `renderHGConfirmations()` = charge page 0.

---

### Résumé HG

### `loadHGRSentPage(laboId, page)` / `loadHGRConfPage(laboId, page)` / `loadHGRWaitPage(laboId, page)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Chargent les 3 onglets du résumé HG (tous les envois / confirmés / en attente), paginés, groupés par date.

### `switchHGRTab(t)` / `changeHGRPage(delta)` / `renderHGResume()`
**Async :** Non/Oui | **Exportée :** Oui
**Rôle :** Basculent l'onglet actif, changent la page, ou rechargent les totaux + page 0 pour le labo courant.

---

### Historique HG

### `loadHGHistPage(page)` / `changeHGHistPage(delta)` / `onHGHistSearch()` / `renderHGHistorique()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Identiques à leurs équivalents intra — `loadHGHistPage` filtre sur `envois_hgrappe`, supporte recherche texte + filtre statut + dates. `onHGHistSearch` débounce à 400 ms.

### `loadHGHistStats()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** 4 counts parallèles (total, ce mois, En transit, Confirmés) pour les éléments de stats.

---

### Modal détail HG

### `showHGDetail(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Ouvre la modal de détail HG — cherche dans `state.envoisHG` ou cache, sinon SELECT DB. Construit le HTML (infos, confirmation, traçabilité, boutons imprimer/modifier). Charge en parallèle audit + info bon de départ.

---

### Modal fax confirmation

### `openHGFaxModal(id)` / `closeHGFaxModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre/ferme le modal de saisie fax. `openHGFaxModal` pré-remplit la date courante, reset la conformité.

### `setHgFaxConforme(val)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Setter conformité (`state.hgFaxConforme`), affiche/masque la section non-conformités.

### `saveHGFaxConfirm()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide (date, nom, conformité, NC obligatoire si non-conforme), UPDATE `envois_hgrappe` (statut, méthode `'fax'`, détails), INSERT `notification_queue` si NC, ferme modal, recharge confirmations.

---

### Édition envoi HG

### `openEditHGEnvoi(id)` / `closeHGEditModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre/ferme le modal d'édition HG. `openEditHGEnvoi` pré-remplit tous les champs depuis `state.envoisHG`.

### `setHgeSGC(val)` / `addHgeList()` / `removeHgeList(v)` / `renderHgeChips()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Gèrent glace sèche et liste SILP dans le formulaire d'édition HG.

### `saveEditHGEnvoi()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide et UPDATE `envois_hgrappe`, reconstruit `state.hgDonneesImpression`, ferme modal, recharge envois HG, affiche succès.

---

### Config HG

### `renderCfgHgrappe()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Orchestrateur config HG — appelle `renderHgrappeLabsToggle()`, `renderExtLabsList()`, `renderHGAlarmsCfg()`, `renderCfgHgrappeConfirmByNumero()`, `renderCfgHgrappeFormat()`.

### `saveHGAlarms()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide (alarm < auto), sauvegarde les deux seuils via `saveGrappeCfg()` en parallèle.

### `saveHgrappeConfirmByNumero()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Lit la checkbox, appelle `saveGrappeCfg('hgrappe_confirm_by_numero', v)`, met à jour `state.CFG`.

### `saveHgrappeLabs()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Upsert `module_config` pour chaque lab (module `'hgrappe'`) en parallèle, met à jour `state.CFG.hgrappeEnabledLabs`, actualise la visibilité du switcher de mode.

### `saveHgrappeFormat(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegarde le format bordereau HG via `saveCfg`.

---

### Labs externes

### `renderExtLabsList()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche la liste hiérarchique (parents + enfants indentés) des labs externes avec formulaires d'édition inline cachés.

### `toggleExtLabEdit(id)` / `saveExtLabEdit(id)` / `addExtLab()` / `toggleExtLabActive(id, active)`
**Async :** Non/Oui | **Exportée :** Oui
**Rôle :** Affichent/masquent le formulaire, sauvegardent les modifications (UPDATE), créent un nouveau lab (INSERT), activent/désactivent un lab (UPDATE `active`).

---

## app-config.js

### Chargement

### `loadConfig()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge `app_config` + `module_config` (BD/HG par lab) depuis Supabase et initialise `window.CFG`. Applique branding, messages, badges, CSS. Appelle `mdeUpdate()` si les éléments Markdown existent.

### `saveCfg(key, value)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** UPSERT dans `app_config`. Retourne `true` si succès.

### `saveBrdCfg()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegarde l'objet complet `CFG.bordereau` via `saveCfg('bordereau_cfg', ...)`.

### `loadGrappeConfig(grappeId)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge `grappe_config` pour la grappe, applique les surcharges sur `window.CFG` (alarmes, transporteurs), met à jour `_cfgGrappeId`.

### `saveGrappeCfg(key, value)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** UPSERT dans `grappe_config` avec `grappe_id = _cfgGrappeId`. Retourne `true` si succès.

### `renderCfgGrappe()` / `switchCfgGrappe(grappeId)`
**Async :** Non/Oui | **Exportée :** Oui
**Rôle :** Affichent le panneau de config grappe (nom, alarms intra/HG, toggle confirmation par numéro). `switchCfgGrappe` charge une autre grappe et re-render.

---

### Branding & Messages

### `applyBranding()`
**Rôle :** Applique `CFG.appName` et `CFG.appSubtitle` à tous les éléments DOM correspondants.

### `applyMessages()`
**Rôle :** Convertit les messages Markdown en HTML via `mdToHtml()` et les affiche dans les éléments login/home.

### `applyBadges()`
**Rôle :** Génère et injecte les règles CSS des badges de statut dans `#badge-styles`.

### `applyCustomCss()`
**Rôle :** Injecte `CFG.customCss` dans `#custom-css`.

### `mdToHtml(s)`
**Rôle :** Convertisseur Markdown simplifié vers HTML sécurisé (titres, gras, italique, code, liens validés, listes, HR, sauts de ligne).

### `mdeUpdate(key)` / `mdeWrap(key, before, after)` / `mdeLink(key)` / `mdeLinePrefix(key, prefix)` / `mdeBlock(key, text)`
**Rôle :** Utilitaires de l'éditeur Markdown inline — aperçu temps réel, entourage sélection, insertion de lien/préfixe/bloc.

---

### Navigation config

### `showCfgTab(t)`
**Rôle :** Bascule l'onglet actif de configuration (retire `active` de tous, l'ajoute à l'onglet `t` et son panneau).

---

### Modules

### `renderCfgModules()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Affiche les toggles BD + HG par lab dans l'onglet Modules.

### `toggleModuleLab(module, labId, active)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Active/désactive un module pour un lab — met à jour `CFG`, UPSERT `module_config`, actualise la visibilité du switcher HG ou du champ transporteur.

### `openCfgAddModal(type)` / `closeCfgAddModal()` / `submitCfgAddModal()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Ouvre une modal d'ajout générique (lab, transporteur, température, spécimen, lab externe), ferme, ou exécute le callback `_cfgAmFn`.

---

### Sauvegarde — Général

### `saveBranding()` / `saveMessages()` / `saveInterfaceCfg()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegardent respectivement : nom/sous-titre, messages Markdown, checkbox `printBordereau`.

### `saveAlarms()` / `saveAlarmR()` / `saveAlarmP()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegardent les seuils d'alarme via `saveGrappeCfg`.

---

### Badges

### `renderCfgBadges()`
**Rôle :** Affiche les color pickers pour chaque badge de statut.

### `livePreviewBadge(cls)`
**Rôle :** Met à jour l'aperçu du badge en temps réel.

### `resetBadge(label, cls)`
**Rôle :** Réinitialise un badge aux couleurs par défaut (`BADGE_DEFAULTS`).

### `saveBadges()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegarde les couleurs via `saveCfg`, applique via `applyBadges()`.

---

### Thème

### `renderCfgTheme()` / `saveCustomCss()`
**Async :** Non/Oui | **Exportée :** Oui
**Rôle :** Affichent et sauvegardent le CSS personnalisé.

---

### Formats bordereau

### `_buildFmtCards(activeId, radioName, onChangeFn)` *(interne)*
**Rôle :** Génère le HTML des cartes de sélection de format.

### `renderCfgFormats()` / `setActiveFormat(id)` / `renderCfgHsilpFormat()` / `saveHsilpFormat(id)`
**Rôle :** Affichent et sauvegardent les formats actifs pour envois SILP et HSILP.

---

### Bordereau — Général, Styles, Spécimens, Températures, Transporteurs

### `saveBrdGeneral()`
**Rôle :** Sauvegarde les paramètres généraux du bordereau (titre, pli, CANUTEC, labels).

### `renderCfgStyles()` / `previewStyleTemp(inp, key)` / `saveBrdStyles()`
**Rôle :** Affichent, prévisualisent et sauvegardent les couleurs de température.

### `renderCfgSpec()` / `toggleSpecEdit(i)` / `saveSpecType(i)` / `addSpecType()` / `removeSpecType(i)`
**Rôle :** Gèrent la liste des types de spécimen (affichage, édition inline, ajout, suppression après confirmation).

### `renderCfgTemps()` / `saveTempMention(i)` / `addTemp()` / `removeTemp(i)`
**Rôle :** Gèrent la liste des températures (affichage avec color pickers, sauvegarde, ajout, suppression avec vérification qu'il en reste au moins une).

### `renderCfgTrans()` / `addTrans()` / `removeTrans(i)`
**Rôle :** Gèrent la liste des transporteurs via `saveGrappeCfg`.

---

### Notifications

### `renderCfgNotifications()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge en parallèle la config, les emails et les logs, puis appelle les rendus secondaires.

### `saveNotifConfig()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegarde `enabled` + `fallback_email` dans `notification_config`.

### `saveNotifProvider()` / `testNotification()` / `toggleNotifProvider()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegardent la config provider (Resend/SMTP), envoient un email de test via RPC, basculant l'affichage des champs provider.

### `renderLabModalEmails(laboId)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge et affiche les emails de notification par département pour un lab dans le modal lab.

### `addNotifEmail(laboId, deptId, email)` / `removeNotifEmail(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Ajoutent/suppriment un email dans `notification_emails`, re-rendent la modal du lab.

---

## bons-depart.js

Variable de module `_cfgBD` : `{selectedIntra: Map, selectedHG: Map, pendingEnvois: [], pendingHG: []}`.

### `isBDEnabled()`
**Async :** Non | **Exportée :** Oui
**Rôle :** `true` si `CFG.bonsDepartEnabledLabs` contient `state.activeLaboId`.

### `initBonsDepart()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Point d'entrée du module — reset la vue et pagination, charge la page 0, affiche la liste.

### `loadBDPage(page)` / `changeBDPage(p)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge une page paginée de `bons_depart` avec count exact. Filtre par labo actif si non-grappe.

### `openCreateBon()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Ouvre le formulaire de création — charge les envois En attente (intra + HG) non encore dans un bon actif, affiche le formulaire et focus le champ de scan.

### `bdToggleEnvoi(cb)` / `bdSelectAll()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Sélectionnent/désélectionnent des envois dans le formulaire de création.

### `saveCreateBon()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Valide qu'au moins un envoi est sélectionné + tous ont un transporteur, appelle RPC `create_bon_depart` avec `p_transporteur_map`, affiche le détail du bon créé, recharge les envois.

### `showBDDetail(id, offerPrint)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Charge bon + sections + liens (enrichis avec infos labs), appelle `_renderDetail()`.

### `saveBDSection(btn)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Sauvegarde les champs d'une section (bon connaissement, date prise en charge, nom transporteur réel) — valide que la date n'est pas dans le futur, UPDATE `bons_depart_sections`.

### `cancelBon(id)` / `removeEnvoiFromBon(linkId, bonId)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Annulent un bon entier (`cancel_bon_depart`) ou retirent un envoi d'un bon (`remove_envoi_from_bon`), tous deux avec confirmation.

### `openAddColis(bonId, laboId)` / `closeAddColis()` / `bdToggleAddEnvoi(cb)` / `saveAddColis(bonId)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Gèrent l'ajout de colis à un bon existant — chargent les envois disponibles, permettent la sélection + choix transporteur, appellent RPC `add_envois_to_bon`.

### `printBon(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Génère le document HTML du bon (en-tête + sections par transporteur + liste envois), l'injecte dans une iframe cachée et lance l'impression.

### `renderBonsDepartLabsToggle()` / `saveBonsDepartLabs()`
**Async :** Non/Oui | **Exportée :** Oui
**Rôle :** Affichent et sauvegardent les toggles d'activation BD par lab (UPSERT `module_config` en parallèle).

### `bdScanEnvoi()`
**Async :** Non | **Exportée :** Oui
**Rôle :** Traite le scan d'un code — cherche l'envoi dans la liste de création, coche sa checkbox et scrolle vers elle (ou toast erreur si non trouvé), puis reset le champ.

---

## print.js

### `printBordereauFromEnvoi(id)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Trouve l'envoi dans `state.envois` ou cache, construit `state.donneesImpression`, détermine l'éventuel format override (HSILP), appelle `printBordereau()`.

### `printBordereau(overrideFormat, returnHtml)`
**Async :** Non | **Exportée :** Oui
**Rôle :** Génère et imprime le bordereau selon le format actif.
**Algorithme :**
1. Récupère `state.donneesImpression`
2. Génère les codes-barres CODE128 et DataMatrix
3. Résout configs température et spécimen
4. Détermine le format (override > format actif > défaut)
5. Appelle le constructeur HTML correspondant (`brdHtmlBordereauSeul`, `brdHtmlPochetteLabo`, `brdHtmlPochettePortrait`, `brdHtmlGrille`)
6. Injecte dans une iframe cachée, lance l'impression, supprime l'iframe

### `mkSpecLabel(st, sz, wide)` *(interne)*
**Rôle :** Génère un SVG du pictogramme de type de spécimen (losange ou boîte, avec calcul dynamique de la taille de fonte).

### `brdHtmlBordereauSeul(...)` *(interne)*
**Rôle :** Format "Bordereau seul" — page simple avec en-tête, code-barres et tableau d'infos.

### `brdHtmlPochetteLabo(...)` / `brdHtmlPochettePortrait(...)` *(internes)*
**Rôle :** Formats "Pochette labo" (paysage) et "Pochette portrait" — grille 2 colonnes avec destination, expéditeur, départements, température et pictogramme. Scripts inline de redimensionnement dynamique.

### `brdHtmlGrille(...)` *(interne)*
**Rôle :** Format "Grille" — 4 zones d'étiquette + bordereau en bas, départements avec cases STAT, CANUTEC si DGR. Scripts de redimensionnement dynamique.

---

## print-hg.js

### `reprintHGDocsFromEnvoi(id)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Récupère l'envoi HG, construit `state.hgDonneesImpression` (avec hiérarchie parent/enfant du destinataire), ferme la modal, appelle `printHGDocs()`.

### `printHGDocs()`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Génère le document combiné Bordereau + F-G-74.
**Algorithme :**
1. Extrait le token, génère le code de vérification (6 premiers chars du token, sans tirets, majuscules)
2. Génère CODE128 pour numéro et code de vérification
3. Génère le QR code (async) pointant vers `/confirm?n=...&c=...`
4. Construit `state.donneesImpression` pour le bordereau standard et appelle `printBordereau(undefined, true)` pour obtenir le HTML
5. Génère le HTML du F-G-74 via `printHGCombined()`

### `printHGCombined(d, barcodeUrl, bordereauHtml, bcNumeroSvg, bcCodeSvg, qrDataUrl)` *(interne)*
**Rôle :** Combine bordereau + F-G-74 en un seul document HTML.
**Algorithme :**
1. Extrait le style et le body du HTML bordereau
2. Construit le F-G-74 bilingue FR/EN :
   - En-tête expéditeur + numéro envoi
   - Champs à compléter par l'expéditeur (date, température, spécimen, destination, transporteur, signature)
   - Option 1 (si `CFG.hgrappeConfirmByNumero`) : confirmation en ligne — QR code + code de vérification + URL
   - Option 2 : confirmation par fax — libellé sans numérotation si Option 1 absente
   - Champs à compléter par le destinataire (date/heure, reçu par, non-conformités)
3. Injecte les deux parties dans une iframe, lance l'impression

---

## kpi.js

### `initDashboard(days)`
**Async :** Oui | **Exportée :** Oui
**Rôle :** Initialise le tableau de bord KPI pour une période (30/60/90 jours).
**Algorithme :**
1. Marque la pill active via `_setPillActive(days)`
2. Appelle RPC `get_labo_kpis(laboId, days)`
3. Appelle `_renderWidgets(stats)` et `_renderChart(flux_quotidien)`

### `_card(color, icon, label, value, sub, alert)` *(interne)*
**Rôle :** Génère le HTML d'une carte KPI (volume, taux NC, transit moyen, hors-grappe).

### `_renderWidgets(stats)` *(interne)*
**Rôle :** Affiche les 4 cartes de stats — taux NC en rouge si > 5 %.

### `_renderChart(data)` *(interne)*
**Rôle :** Crée un graphique Chart.js en barres des volumes quotidiens, avec couleurs lues depuis les variables CSS du thème. Détruit l'instance précédente si elle existe.

---

## Fonctions SQL

> Toutes les fonctions SECURITY DEFINER s'exécutent avec les droits de leur propriétaire. Les politiques RLS s'appliquent aux requêtes dans les fonctions SECURITY INVOKER.

---

### Accès utilisateur

### `current_labo_ids() → UUID[]`
**Migration :** 012 (màj 023) | **Sécurité :** DEFINER
**Rôle :** Retourne les labos accessibles à l'utilisateur courant.
**Algorithme :**
- `admin` / `superviseur_grappe` → tous les labos actifs
- Autres → labos de `user_lab_memberships`, fallback sur `labo_ids`/`labo_id` pour compatibilité
**Utilisée dans :** toutes les politiques RLS

### `current_lab_role(p_labo_id UUID) → TEXT`
**Migration :** 023 | **Sécurité :** DEFINER
**Rôle :** Retourne le rôle de l'utilisateur dans un lab donné (`'responsable'`, `'technicien'` ou NULL).
**Algorithme :** Si admin/superviseur_grappe → `'responsable'`. Sinon, cherche dans `user_lab_memberships`.

### `sync_labo_ids_on_insert() → TRIGGER`
**Migration :** 012 | **Trigger :** BEFORE INSERT ON `profiles`
**Rôle :** Si `labo_id` fourni et `labo_ids` vide, initialise `labo_ids = [labo_id]`.

---

### Gestion envois intra-grappe

### `annuler_envoi(p_envoi_id UUID, p_note TEXT) → VOID`
**Migration :** 019 (màj 023) | **Sécurité :** DEFINER
**Rôle :** Annulation logique d'un envoi avec vérification des droits et traçabilité.
**Vérifications séquentielles :**
1. Envoi existe
2. Utilisateur a accès au labo (`current_labo_ids()`)
3. Créateur OU responsable (`current_lab_role()`) OU superviseur/admin
4. Pas déjà annulé
5. Statut `'En attente'` ou `'En transit'`
6. Pas dans un bon actif
7. Note non-vide
**Effets :** UPDATE `envois` (statut `'Annulé'`, `annule_at`, `annule_par_id/nom/note`) + INSERT `envois_audit`

---

### Numérotation envois

### `generate_envoi_numero() → TRIGGER`
**Migration :** 016 (correctif 017) | **Trigger :** BEFORE INSERT ON `envois`
**Rôle :** Auto-génère `numero` si NULL — préfixe `HSILP-` si `numeros_silp` vide, sinon `SILP-`. Format : `PREFIX-YYMMDD-NNNNN` (séquence `envoi_seq`).

### `peek_next_hsilp() → TEXT`
**Migration :** 016 (correctif 017) | **Sécurité :** DEFINER
**Rôle :** Lit la séquence `envoi_seq` et retourne le prochain numéro HSILP formaté, sans l'incrémenter (pour affichage UI uniquement).

### `peek_next_hgrappe() → TEXT`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Idem pour la séquence `hgrappe_seq` — retourne le prochain `HG-YYMMDD-NNNNN`.

---

### Gestion envois hors-grappe

### `create_envoi_hsilp(p_exp_labo_id, p_dest_labo_id, p_temperature, p_transporteur, p_nb_echantillons, p_departements, p_notes, p_cree_par_id, p_cree_par_nom, p_type_specimen, p_glace_seche, p_statut) → TEXT`
**Migration :** 015 (màj 016) | **Sécurité :** DEFINER
**Rôle :** Crée un envoi intra-grappe HSILP (sans liste de repérage). Le numéro est auto-généré par le trigger. Retourne le numéro.

### `create_envoi_hgrappe(p_source, p_exp_labo_id, p_dest_ext_lab_id, p_temperature, p_transporteur, p_nb_echantillons, p_numeros_silp, p_notes, p_cree_par_id, p_cree_par_nom, p_type_specimen, p_glace_seche, p_statut) → JSON`
**Migration :** 015 (màj 016) | **Sécurité :** DEFINER
**Rôle :** Crée un envoi hors-grappe (destination lab externe). Génère numéro `HG-YYMMDD-NNNNN` + `confirm_token` UUID. Retourne `{numero, token}`.

### `get_envoi_hgrappe_by_token(p_token UUID) → JSON`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Retourne les données d'un envoi HG pour la page publique de confirmation (accès anonyme).

### `get_envoi_hgrappe_by_numero(p_numero TEXT, p_verify_code TEXT) → JSON`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Retourne les données d'un envoi HG après vérification du code 6 chars.

### `confirm_envoi_hgrappe(p_token, p_conforme, p_nc_types, p_commentaire, p_recu_par, p_ts_confirm) → JSON`
**Migration :** 020 | **Sécurité :** DEFINER
**Rôle :** Confirme un envoi HG via la page publique. UPDATE `envois_hgrappe` (statut, méthode `'online'`, détails). Si non-conforme, INSERT `notification_queue` type `'hg_nc'`. Exécutable sans authentification.

### `get_hg_confirm_cfg() → JSON`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Retourne la config publique nécessaire à la page de confirmation (accessible anonymement).

---

### Bons de départ

### `create_bon_depart(p_labo_id, p_cree_par_id, p_cree_par_nom, p_envoi_ids, p_hg_envoi_ids, p_bon_connaissements, p_transporteur_map) → JSON`
**Migration :** 015 (màj 021) | **Sécurité :** DEFINER
**Rôle :** Création atomique d'un bon de départ avec validation complète.
**Vérifications :** accès labo, au moins 1 envoi, statuts valides, transporteurs non-vides (v0.21)
**Effets :** INSERT `bons_depart` + `bons_depart_envois` (1 ligne/envoi) + `bons_depart_sections` (1/transporteur distinct) + UPDATE `envois`/`envois_hgrappe` (statut `'En transit'`, `ts_envoi = NOW()`)
**Retourne :** `{numero, id}`

### `cancel_bon_depart(p_bon_id UUID) → JSON`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Annule un bon actif — vérifie qu'aucun envoi n'est réceptionné et qu'aucune section n'a de date de prise en charge. Remet les envois en `'En attente'` avec `ts_envoi = created_at`.

### `remove_envoi_from_bon(p_link_id UUID) → JSON`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Retire un envoi d'un bon actif — vérifie statut de l'envoi et l'absence de date de prise en charge. Remet l'envoi en `'En attente'`, DELETE la liaison.

### `add_envois_to_bon(p_bon_id, p_envoi_ids, p_hg_envoi_ids, p_transporteur_map) → JSON`
**Migration :** 015 (màj 021) | **Sécurité :** DEFINER
**Rôle :** Ajoute des envois à un bon actif — vérifie qu'aucun envoi du bon n'est réceptionné et qu'aucune section n'a de date de prise en charge. INSERT nouvelles liaisons + nouvelles sections si nouveau transporteur.

### `check_bon_completion(p_bon_id UUID) → VOID`
**Migration :** 015 | **Sécurité :** DEFINER
**Rôle :** Si une section a une date de prise en charge, ou si un envoi lié est réceptionné/perdu → UPDATE `bons_depart.statut = 'récupéré'`.

### `trg_bd_section_completion() → TRIGGER`
**Migration :** 015 | **Trigger :** AFTER UPDATE ON `bons_depart_sections`
**Rôle :** Si `date_prise_en_charge` est renseignée, appelle `check_bon_completion(bon_id)`.

### `trg_envois_bon_completion() → TRIGGER`
**Migration :** 015 | **Trigger :** AFTER UPDATE ON `envois`
**Rôle :** Si statut passe de actif (En attente/En transit) à terminal (Reçu/Problème/Perdu/Annulé), cherche le bon lié et appelle `check_bon_completion()`.

### `trg_hgrappe_bon_completion() → TRIGGER`
**Migration :** 015 | **Trigger :** AFTER UPDATE ON `envois_hgrappe`
**Rôle :** Identique à `trg_envois_bon_completion()` pour les envois HG.

---

### Modules

### `is_module_active(p_module TEXT, p_labo_id UUID) → BOOLEAN`
**Migration :** 021 | **Sécurité :** DEFINER
**Rôle :** Retourne `module_config.active` pour le couple `(module, labo_id)`, ou `FALSE` si absent.

---

### KPI & Reporting

### `get_labo_kpis(p_labo_id UUID, p_days INTEGER) → JSON`
**Migration :** 014 (màj 018) | **Sécurité :** DEFINER
**Rôle :** Retourne les KPIs d'un lab pour le tableau de bord (admin/superviseur_grappe uniquement).
**Retourne :**
```json
{
  "stats_globales": {
    "total_intra": N, "nc_intra": N, "transit_moyen_h": N,
    "hg_total": N, "hg_confirmed": N, "hg_nc": N
  },
  "flux_quotidien": [{"date": "YYYY-MM-DD", "total": N}, ...]
}
```
**Algorithme :** Agrégations SQL sur `envois` + `envois_hgrappe` depuis `now() - p_days DAYS`. Flux quotidien fusionné intra+HG, groupé par date (TZ America/Montreal).

---

### Récapitulatif des triggers

| Trigger | Table | Événement | Fonction | Migration |
|---|---|---|---|---|
| `trg_profiles_labo_ids` | `profiles` | BEFORE INSERT | `sync_labo_ids_on_insert()` | 012 |
| `trg_profiles_updated` | `profiles` | BEFORE UPDATE | `update_updated_at()` | — |
| `trg_envoi_numero` | `envois` | BEFORE INSERT | `generate_envoi_numero()` | 016, 017 |
| `trg_envois_updated` | `envois` | BEFORE UPDATE | `update_updated_at()` | — |
| `trg_envois_bon_completion` | `envois` | AFTER UPDATE | `trg_envois_bon_completion()` | 015 |
| `trg_envois_hgrappe_updated` | `envois_hgrappe` | BEFORE UPDATE | `update_updated_at()` | — |
| `trg_hgrappe_bon_completion` | `envois_hgrappe` | AFTER UPDATE | `trg_hgrappe_bon_completion()` | 015 |
| `trg_bd_sections_after_update` | `bons_depart_sections` | AFTER UPDATE | `trg_bd_section_completion()` | 015 |
