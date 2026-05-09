import { notifier } from './ui.js';

// ── STATE.JS ──────────────────────────────────────────────────────────────────
// Bridge entre l'état global (window.*) et les modules ES.
//
// PENDANT LA MIGRATION : app.js tourne encore comme script global ; toutes les
// variables d'état vivent sur window. Ce fichier expose un objet `state` dont
// les getters/setters proxient vers window.*, afin que les futurs modules
// puissent importer `state` sans dépendre des globaux directement.
//
// APRÈS LA MIGRATION : chaque variable sera possédée ici, et window.* disparaît.
// ─────────────────────────────────────────────────────────────────────────────

export const state = {

  // ── Client Supabase ─────────────────────────────────────────────────────────
  get sb()               { return window.sb; },

  // ── Configuration application ───────────────────────────────────────────────
  get CFG()              { return window.CFG; },
  get BADGE_STATUTS()    { return window.BADGE_STATUTS; },
  get LOGIN_PHOTOS()     { return window.LOGIN_PHOTOS; },

  // ── Session utilisateur ─────────────────────────────────────────────────────
  get currentUser()               { return window.currentUser; },
  set currentUser(v)              { window.currentUser = v; },

  // Laboratoire actif (contexte de travail courant, peut être != labo_id principal)
  get activeLabo()                { return window.activeLabo; },
  set activeLabo(v)               { window.activeLabo = v; },
  // Raccourci : id du labo actif, avec fallback sur labo_id du profil
  get activeLaboId()              { return window.activeLabo ? window.activeLabo.id : (window.currentUser ? window.currentUser.labo_id : null); },

  // ── Grappes ─────────────────────────────────────────────────────────────────
  get grappes()                  { return window.grappes; },
  set grappes(v)                 { window.grappes = v; },
  get activeGrappeId()           { return window.activeGrappeId; },
  set activeGrappeId(v)          { window.activeGrappeId = v; },

  // ── Données intra-grappe ────────────────────────────────────────────────────
  get laboratoires()             { return window.laboratoires; },
  set laboratoires(v)            { window.laboratoires = v; },

  get envois()                { return window.envois; },
  set envois(v)               { window.envois = v; },

  get cacheModals()      { return window.cacheModals; },
  set cacheModals(v)     { window.cacheModals = v; },

  get utilisateurs()             { return window.utilisateurs; },
  set utilisateurs(v)            { window.utilisateurs = v; },

  // ── État formulaire intra-grappe ────────────────────────────────────────────
  get termeRecherche()               { return window.termeRecherche; },           // Search Term
  set termeRecherche(v)              { window.termeRecherche = v; },

  get departementsActifs()               { return window.departementsActifs; },           // Selected Departments
  set departementsActifs(v)              { window.departementsActifs = v; },

  get indexLigne()              { return window.indexLigne; },          // Current Row Index
  set indexLigne(v)             { window.indexLigne = v; },

  get elementFocus()              { return window.elementFocus; },          // Element UI (focus)
  set elementFocus(v)             { window.elementFocus = v; },

  get typeSpecimen()             { return window.typeSpecimen; },         // Selected Specimen tyPe
  set typeSpecimen(v)            { window.typeSpecimen = v; },

  get refrigerantChoisi()             { return window.refrigerantChoisi; },         // STAT Checked
  set refrigerantChoisi(v)            { window.refrigerantChoisi = v; },

  get sansSilp()     { return window.sansSilp; },
  set sansSilp(v)    { window.sansSilp = v; },

  // ── Canal Realtime & inactivité ─────────────────────────────────────────────
  get canalRealtime()            { return window.canalRealtime; },
  set canalRealtime(v)           { window.canalRealtime = v; },

  get timerInactivite()      { return window.timerInactivite; },
  set timerInactivite(v)     { window.timerInactivite = v; },

  // ── Pagination intra-grappe ─────────────────────────────────────────────────
  get resumePageDone()      { return window.resumePageDone; },
  set resumePageDone(v)     { window.resumePageDone = v; },

  get resumeLaboDone()    { return window.resumeLaboDone; },
  set resumeLaboDone(v)   { window.resumeLaboDone = v; },

  get resumePageEnvois()      { return window.resumePageEnvois; },
  set resumePageEnvois(v)     { window.resumePageEnvois = v; },

  get resumeLaboEnvois()    { return window.resumeLaboEnvois; },
  set resumeLaboEnvois(v)   { window.resumeLaboEnvois = v; },

  get resumePageRecus()      { return window.resumePageRecus; },
  set resumePageRecus(v)     { window.resumePageRecus = v; },

  get resumeDonneesRecus()      { return window.resumeDonneesRecus; },
  set resumeDonneesRecus(v)     { window.resumeDonneesRecus = v; },

  get resumeAlertesEnvois() { return window.resumeAlertesEnvois; },
  set resumeAlertesEnvois(v){ window.resumeAlertesEnvois = v; },

  get resumeAlertesRecus() { return window.resumeAlertesRecus; },
  set resumeAlertesRecus(v){ window.resumeAlertesRecus = v; },

  // ── Mode hors-grappe ────────────────────────────────────────────────────────
  get modeHG()          { return window.modeHG; },
  set modeHG(v)         { window.modeHG = v; },

  get labsExternes()         { return window.labsExternes; },
  set labsExternes(v)        { window.labsExternes = v; },

  get envoisHG()              { return window.envoisHG; },
  set envoisHG(v)             { window.envoisHG = v; },

  get hgCacheModals()   { return window.hgCacheModals; },
  set hgCacheModals(v)  { window.hgCacheModals = v; },

  // ── État formulaire hors-grappe (envoi) ─────────────────────────────────────
  get hgTemperature()           { return window.hgTemperature; },
  set hgTemperature(v)          { window.hgTemperature = v; },

  get hgRefrigerant()          { return window.hgRefrigerant; },
  set hgRefrigerant(v)         { window.hgRefrigerant = v; },

  get hgListesSilp()        { return window.hgListesSilp; },
  set hgListesSilp(v)       { window.hgListesSilp = v; },

  get hgSansSilp()      { return window.hgSansSilp; },
  set hgSansSilp(v)     { window.hgSansSilp = v; },

  // ── État formulaire hors-grappe (modification) ──────────────────────────────
  get hgEditId()        { return window.hgEditId; },
  set hgEditId(v)       { window.hgEditId = v; },

  get hgEditTemperature()        { return window.hgEditTemperature; },
  set hgEditTemperature(v)       { window.hgEditTemperature = v; },

  get hgEditRefrigerant()       { return window.hgEditRefrigerant; },
  set hgEditRefrigerant(v)      { window.hgEditRefrigerant = v; },

  get hgEditListesSilp()     { return window.hgEditListesSilp; },
  set hgEditListesSilp(v)    { window.hgEditListesSilp = v; },

  // ── État formulaire modification intra-grappe ───────────────────────────────
  get editEnvoiId()       { return window.editEnvoiId; },
  set editEnvoiId(v)      { window.editEnvoiId = v; },

  get editTemperature()             { return window.editTemperature; },
  set editTemperature(v)            { window.editTemperature = v; },

  get editDepts()             { return window.editDepts; },
  set editDepts(v)            { window.editDepts = v; },

  get editRefrigerant()           { return window.editRefrigerant; },
  set editRefrigerant(v)          { window.editRefrigerant = v; },

  // ── Impression ──────────────────────────────────────────────────────────────
  get donneesImpression()       { return window.donneesImpression; },
  set donneesImpression(v)      { window.donneesImpression = v; },

  get hgDonneesImpression()     { return window.hgDonneesImpression; },
  set hgDonneesImpression(v)    { window.hgDonneesImpression = v; },

  get hgFaxId()         { return window.hgFaxId; },
  set hgFaxId(v)        { window.hgFaxId = v; },

  get hgFaxConforme()   { return window.hgFaxConforme; },
  set hgFaxConforme(v)  { window.hgFaxConforme = v; },

  // ── Pagination hors-grappe ──────────────────────────────────────────────────
  get hghPage()         { return window.hghPage; },
  set hghPage(v)        { window.hghPage = v; },

  get hghTimer()  { return window.hghTimer; },
  set hghTimer(v) { window.hghTimer = v; },

  get hgrPageEnvois()     { return window.hgrPageEnvois; },
  set hgrPageEnvois(v)    { window.hgrPageEnvois = v; },

  get hgrLaboEnvois()   { return window.hgrLaboEnvois; },
  set hgrLaboEnvois(v)  { window.hgrLaboEnvois = v; },

  get hgrPageConfirmes()     { return window.hgrPageConfirmes; },
  set hgrPageConfirmes(v)    { window.hgrPageConfirmes = v; },

  get hgrLaboConfirmes()   { return window.hgrLaboConfirmes; },
  set hgrLaboConfirmes(v)  { window.hgrLaboConfirmes = v; },

  get hgrPageAttente()     { return window.hgrPageAttente; },
  set hgrPageAttente(v)    { window.hgrPageAttente = v; },

  get hgrLaboAttente()   { return window.hgrLaboAttente; },
  set hgrLaboAttente(v)  { window.hgrLaboAttente = v; },

  get hgcPage()         { return window.hgcPage; },
  set hgcPage(v)        { window.hgcPage = v; },

};

// ── Wrapper Supabase ──────────────────────────────────────────────────────────
// Encapsule un appel Supabase : détecte l'expiration de session, attrape les
// erreurs réseau, et affiche un notifier si un identifiant est fourni.
// Retourne {data, error} — même forme que Supabase, compatible avec l'existant.
export async function sbCall(promise, notifierId) {
  var r;
  try {
    r = await promise;
  } catch (ex) {
    if (notifierId) notifier(notifierId, 'Erreur réseau. Vérifiez votre connexion.', 'e');
    return { data: null, error: ex };
  }
  if (!r.error) return r;
  var msg = r.error.message || '';
  if (r.error.status === 401 || /JWT|not authenticated|session/i.test(msg)) {
    notifier('_auth', 'Session expirée — reconnexion en cours…', 'e');
    setTimeout(function() { if (typeof window.seDeconnecter === 'function') window.seDeconnecter(); }, 1500);
    return { data: null, error: r.error };
  }
  if (notifierId) notifier(notifierId, 'Erreur : ' + msg, 'e');
  return { data: null, error: r.error };
}
