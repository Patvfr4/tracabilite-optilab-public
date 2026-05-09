// ── MAIN.JS — Point d'entrée ES modules ──────────────────────────────────────
// Importe tous les modules et expose leurs exports sur window pour que
// app.js (script global) et les handlers HTML inline puissent les appeler.
//
// Modules chargés :
//   state.js       Bridge window.* → accès unifié à l'état global
//   utils.js       Utilitaires purs (escapeHtml, formatDateTime, classeBadge, …)
//   auth.js        Authentification, session, inactivité
//   ui.js          Toasts, spinner, panels, thème, modals
//   labs.js        Gestion des labos, sélecteurs, températures, départements
//   app-config.js  Configuration application (CFG), branding, badges, formats
//   envois.js      CRUD envois intra-grappe, historique, résumé, utilisateurs
//   hgrappe.js     Mode hors-grappe, SILP HG, confirmations, labs externes
//   print.js       Impression bordereau (tous formats)
//   print-hg.js    Impression bordereau HG + F-G-74
// ─────────────────────────────────────────────────────────────────────────────

import { state } from './state.js';
import { initDashboard } from './kpi.js';
import {
  isBDEnabled, initBonsDepart, loadBDPage, changeBDPage,
  openCreateBon, bdToggleEnvoi, bdSelectAll, saveCreateBon,
  showBDDetail, saveBDSection, cancelBon, removeEnvoiFromBon, printBon,
  openAddColis, closeAddColis, bdToggleAddEnvoi, saveAddColis,
  renderBonsDepartLabsToggle, saveBonsDepartLabs,
  bdScanEnvoi,
} from './bons-depart.js';
import {
  classesPills, departements,
  escapeHtml, formatDateTime, formatDate, deepKey, heuresTransit, formatDuree,
  classeBadge, libelleRole, classeBadgeRole, formaterCP, formaterTel, separateurModal, departementsHtml, departementsTexte,
} from './utils.js';
import {
  estAdmin, estGrappe, estSuperviseur,
  initLoginBg, seConnecter, loadProfileAndInit, enregistrerMotDePasse, finaliserConnexion, seDeconnecter,
  initLabSwitch, changerLabo, choisirLabo, annulerChangementLabo,
} from './auth.js';
import {
  notifier, toast, removeToast, spin, showScr, showPanel, closeGMod,
  initTheme, toggleTheme, updateThemeBtn,
  setupKeyboard, setupConfirmModal, confirm2,
  showSuccessModal, closeSuccessModal, initNlistValidation, switchAideTab,
} from './ui.js';
import {
  loadLabs, formaterAdresseLabo,
  buildLdestOpts, filterLdest, openLdestDrop, closeLdestDrop, pickLdest, ldestKeyNav,
  populateSels, renderTempPills, selectionnerTemp, setGlace, toggleDept,
  updateExpAddr, updateDestAddr,
  renderCfgLabs, addLab, removeLab,
  updateTransporteurVisibility,
  openLabModal, closeLabModal, saveLabModal,
} from './labs.js';
import {
  libelleTemp, libelleTempCourt, estAlarmeRetard, estAlarmePerdu, estArriveeRetard, classeLigne, estAlerte, afficherLegende, celluleTransit,
  _mapEnvoi, loadEnvois,
  saveEnvoi, resetForm, showRlabErr,
  addSilpList, removeSilpList, renderSilpChips, confirmSilpDup, cancelSilpDup, _afficherResultatReception_global,
  rechercher, confirmer, signaler,
  showGMod, declarerPerdu,
  switchRTab, loadResumeDonePage, changeResumeDonePage, renderResumeRecvPage, changeResumeRecvPage,
  loadResumeSentPage, changeResumeSentPage, getResData, renderResume,
  togglePdfDrop, pdfStr, exportPDF,
  toggleHistAlerts, toggleResumeAlerts, loadHistPage, loadHistStats, changeHistPage, onHistSearch,
  openEditEnvoi, closeEditEnvoi, afficherPillsTempEdit, selectionnerTempEdit, setEditGlace,
  toggleDeptEdit, updatePillsDeptEdit, saveEditEnvoi, showSuccessModalEdit,
  showNoListModal, cancelNoList, confirmNoList, toggleNoSilp, fetchHsilpPreviewNum, showSuccessModalHsilp,
  renderMonCompte, saveMcPw,
  loadUsersAndRender, renderUT, openAddU, openEditU, cancelUF, callEdge, saveUser, togU, _renderUfLaboIdsOnChange,
  addUfMembership, removeUfMembership,
  subscribeRT,
  renderRecherche, onRechercheInput, doRecherche, showRchDetail,
  openAnnulationEnvoi, closeAnnulationEnvoi, saveAnnulationEnvoi,
} from './envois.js';
import { printBordereauFromEnvoi, printBordereau } from './print.js';
import { reprintHGDocsFromEnvoi, printHGDocs } from './print-hg.js';
import {
  _mapEnvoiHG, loadEnvoisHG, loadExtLabs,
  classeBadgeHG, estAlarmeHG, estSansReponse, classeLigneHG, estAlerteHG, afficherLegendeHG,
  ligneDestHG, texteDestHG, adresseDestHG,
  isHGEnabled, initHGMode, updateSidebarForMode, setMode, toggleModeDrop,
  buildHgParentSelect, updateHgDestSelection, updateHgDestChild, showHgDestAddrEl,
  onHgSilpParentChange, onHgSilpChildChange, onHghParentChange, onHghChildChange, buildHgDestLabObj,
  initHgSilpForm, addHgsList, removeHgsList, renderHgsChips, resetHgSilpForm,
  saveEnvoiHgSilp, fetchHgHsilpPreviewNum, toggleHgsNoSilp,
  showHGSuccessModal, toggleHGClose, closeHGSuccessModal,
  getHGRLaboId, loadHGConfirmationsPage, changeHGCPage, renderHGConfirmations,
  loadHGRSentPage, loadHGRConfPage, loadHGRWaitPage, switchHGRTab, changeHGRPage, renderHGResume,
  loadHGHistPage, loadHGHistStats, changeHGHistPage, onHGHistSearch, renderHGHistorique,
  showHGDetail, openHGFaxModal, closeHGFaxModal, setHgFaxConforme, saveHGFaxConfirm,
  openEditHGEnvoi, closeHGEditModal, setHgsSGC, setHgeSGC, addHgeList, removeHgeList, renderHgeChips, saveEditHGEnvoi,
  renderCfgHgrappe, renderCfgHgrappeConfirmByNumero, saveHgrappeConfirmByNumero,
  renderHGAlarmsCfg, saveHGAlarms, renderHgrappeLabsToggle, saveHgrappeLabs,
  renderCfgHgrappeFormat, saveHgrappeFormat,
  renderExtLabsList, toggleExtLabEdit, saveExtLabEdit, addExtLab, toggleExtLabActive,
} from './hgrappe.js';

import {
  loadConfig, saveCfg, saveBrdCfg,
  applyBranding, applyMessages, applyBadges, applyCustomCss,
  mdToHtml, mdeUpdate, mdeWrap, mdeLink, mdeLinePrefix, mdeBlock,
  showCfgTab, openCfgAddModal, closeCfgAddModal, submitCfgAddModal,
  renderCfgModules, toggleModuleLab,
  loadGrappeConfig, saveGrappeCfg, renderCfgGrappe, switchCfgGrappe,
  saveBranding, saveMessages, saveInterfaceCfg,
  saveAlarms, saveAlarmR, saveAlarmP,
  renderCfgBadges, livePreviewBadge, resetBadge, saveBadges,
  renderCfgTheme, saveCustomCss,
  _buildFmtCards, renderCfgFormats, setActiveFormat,
  renderCfgHsilpFormat, saveHsilpFormat,
  saveBrdGeneral, renderCfgStyles, previewStyleTemp, saveBrdStyles,
  renderCfgSpec, toggleSpecEdit, saveSpecType, addSpecType, removeSpecType,
  renderCfgTemps, saveTempMention, addTemp, removeTemp,
  renderCfgTrans, addTrans, removeTrans,
  renderCfgNotifications, saveNotifConfig, saveNotifProvider, testNotification,
  addNotifEmail, removeNotifEmail, toggleNotifProvider, renderLabModalEmails,
} from './app-config.js';

// Ré-expose tous les exports sur window pour que app.js (script global)
// et les handlers HTML inline puissent continuer à les appeler sans import.
Object.assign(window, {
  // envois
  libelleTemp, libelleTempCourt, estAlarmeRetard, estAlarmePerdu, estArriveeRetard, classeLigne, estAlerte, afficherLegende, celluleTransit,
  _mapEnvoi, loadEnvois,
  saveEnvoi, resetForm, showRlabErr,
  addSilpList, removeSilpList, renderSilpChips, confirmSilpDup, cancelSilpDup, _afficherResultatReception_global,
  rechercher, confirmer, signaler,
  showGMod, declarerPerdu,
  switchRTab, loadResumeDonePage, changeResumeDonePage, renderResumeRecvPage, changeResumeRecvPage,
  loadResumeSentPage, changeResumeSentPage, getResData, renderResume,
  togglePdfDrop, pdfStr, exportPDF,
  toggleHistAlerts, toggleResumeAlerts, loadHistPage, loadHistStats, changeHistPage, onHistSearch,
  openEditEnvoi, closeEditEnvoi, afficherPillsTempEdit, selectionnerTempEdit, setEditGlace,
  toggleDeptEdit, updatePillsDeptEdit, saveEditEnvoi, showSuccessModalEdit,
  showNoListModal, cancelNoList, confirmNoList, toggleNoSilp, fetchHsilpPreviewNum, showSuccessModalHsilp,
  renderMonCompte, saveMcPw,
  loadUsersAndRender, renderUT, openAddU, openEditU, cancelUF, callEdge, saveUser, togU, _renderUfLaboIdsOnChange,
  addUfMembership, removeUfMembership,
  subscribeRT,
  renderRecherche, onRechercheInput, doRecherche, showRchDetail,
  openAnnulationEnvoi, closeAnnulationEnvoi, saveAnnulationEnvoi,
  // hgrappe
  _mapEnvoiHG, loadEnvoisHG, loadExtLabs,
  classeBadgeHG, estAlarmeHG, estSansReponse, classeLigneHG, estAlerteHG, afficherLegendeHG,
  ligneDestHG, texteDestHG, adresseDestHG,
  isHGEnabled, initHGMode, updateSidebarForMode, setMode, toggleModeDrop,
  buildHgParentSelect, updateHgDestSelection, updateHgDestChild, showHgDestAddrEl,
  onHgSilpParentChange, onHgSilpChildChange, onHghParentChange, onHghChildChange, buildHgDestLabObj,
  initHgSilpForm, addHgsList, removeHgsList, renderHgsChips, resetHgSilpForm,
  saveEnvoiHgSilp, fetchHgHsilpPreviewNum, toggleHgsNoSilp,
  showHGSuccessModal, toggleHGClose, closeHGSuccessModal,
  getHGRLaboId, loadHGConfirmationsPage, changeHGCPage, renderHGConfirmations,
  loadHGRSentPage, loadHGRConfPage, loadHGRWaitPage, switchHGRTab, changeHGRPage, renderHGResume,
  loadHGHistPage, loadHGHistStats, changeHGHistPage, onHGHistSearch, renderHGHistorique,
  showHGDetail, openHGFaxModal, closeHGFaxModal, setHgFaxConforme, saveHGFaxConfirm,
  openEditHGEnvoi, closeHGEditModal, setHgsSGC, setHgeSGC, addHgeList, removeHgeList, renderHgeChips, saveEditHGEnvoi,
  renderCfgHgrappe, renderCfgHgrappeConfirmByNumero, saveHgrappeConfirmByNumero,
  renderHGAlarmsCfg, saveHGAlarms, renderHgrappeLabsToggle, saveHgrappeLabs,
  renderCfgHgrappeFormat, saveHgrappeFormat,
  renderExtLabsList, toggleExtLabEdit, saveExtLabEdit, addExtLab, toggleExtLabActive,
  // print
  printBordereauFromEnvoi, printBordereau,
  reprintHGDocsFromEnvoi, printHGDocs,
  // utils
  classesPills, departements,
  escapeHtml, formatDateTime, formatDate, deepKey, heuresTransit, formatDuree,
  classeBadge, libelleRole, classeBadgeRole, formaterCP, formaterTel, separateurModal, departementsHtml, departementsTexte,
  // auth
  estAdmin, estGrappe, estSuperviseur,
  initLoginBg, seConnecter, loadProfileAndInit, enregistrerMotDePasse, finaliserConnexion, seDeconnecter,
  initLabSwitch, changerLabo, choisirLabo, annulerChangementLabo,
  // ui
  notifier, toast, removeToast, spin, showScr, showPanel, closeGMod,
  initTheme, toggleTheme, updateThemeBtn,
  setupKeyboard, setupConfirmModal, confirm2,
  showSuccessModal, closeSuccessModal, initNlistValidation, switchAideTab,
  // labs
  loadLabs, formaterAdresseLabo,
  buildLdestOpts, filterLdest, openLdestDrop, closeLdestDrop, pickLdest, ldestKeyNav,
  populateSels, renderTempPills, selectionnerTemp, setGlace, toggleDept,
  updateExpAddr, updateDestAddr,
  renderCfgLabs, addLab, removeLab,
  updateTransporteurVisibility,
  openLabModal, closeLabModal, saveLabModal,
  // config
  loadConfig, saveCfg, saveBrdCfg,
  applyBranding, applyMessages, applyBadges, applyCustomCss,
  mdToHtml, mdeUpdate, mdeWrap, mdeLink, mdeLinePrefix, mdeBlock,
  showCfgTab, openCfgAddModal, closeCfgAddModal, submitCfgAddModal,
  renderCfgModules, toggleModuleLab,
  loadGrappeConfig, saveGrappeCfg, renderCfgGrappe, switchCfgGrappe,
  saveBranding, saveMessages, saveInterfaceCfg,
  saveAlarms, saveAlarmR, saveAlarmP,
  renderCfgBadges, livePreviewBadge, resetBadge, saveBadges,
  renderCfgTheme, saveCustomCss,
  _buildFmtCards, renderCfgFormats, setActiveFormat,
  renderCfgHsilpFormat, saveHsilpFormat,
  saveBrdGeneral, renderCfgStyles, previewStyleTemp, saveBrdStyles,
  renderCfgSpec, toggleSpecEdit, saveSpecType, addSpecType, removeSpecType,
  renderCfgTemps, saveTempMention, addTemp, removeTemp,
  renderCfgTrans, addTrans, removeTrans,
  renderCfgNotifications, saveNotifConfig, saveNotifProvider, testNotification,
  addNotifEmail, removeNotifEmail, toggleNotifProvider, renderLabModalEmails,
  initDashboard,
  // bons-depart
  isBDEnabled, initBonsDepart, loadBDPage, changeBDPage,
  openCreateBon, bdToggleEnvoi, bdSelectAll, saveCreateBon,
  showBDDetail, saveBDSection, cancelBon, removeEnvoiFromBon, printBon,
  openAddColis, closeAddColis, bdToggleAddEnvoi, saveAddColis,
  renderBonsDepartLabsToggle, saveBonsDepartLabs,
  bdScanEnvoi,
});

// Vérification de l'infrastructure au démarrage (dev uniquement)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  console.debug('[main.js] Modules ES chargés. State bridge actif.', state);
}
