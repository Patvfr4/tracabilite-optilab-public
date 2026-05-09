var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.sessionStorage,
    storageKey: 'optilab-auth',
    autoRefreshToken: true,
    persistSession: true,
  }
});

// ── GLOSSAIRE ────────────────────────────────────────────────────────────────
// Variables globales d'état
//   sb                    Supabase client (window.supabase.createClient)
//   CFG                   Configuration complète de l'application (chargée depuis app_config)
//   currentUser           Utilisateur connecté (objet Supabase Auth + profil labo)
//   laboratoires          Liste des laboratoires intra-grappe (tableau, chargé au démarrage)
//   envois                Liste des envois intra-grappe affichés
//   envoisHG              Liste des envois hors-grappe affichés
//   labsExternes          Liste des laboratoires externes / destinataires hors-grappe
//   utilisateurs          Liste des utilisateurs du système
//   cacheModals           Cache des données d'envois ouvertes en modal (intra-grappe)
//   hgCacheModals         Idem pour les envois hors-grappe
//   modeHG                Booléen — mode actif : false = intra-grappe, true = hors-grappe
//   termeRecherche        Terme de recherche actif (intra-grappe)
//   departementsActifs    Départements filtrés actifs (tableau)
//   indexLigne            Index de la ligne courante dans la liste
//   elementFocus          Référence à l'élément UI actif (input focus)
//   canalRealtime         Canal Supabase Realtime actif
//   typeSpecimen          Type de spécimen sélectionné dans le formulaire
//   refrigerantChoisi     Réfrigérant sélectionné (glace sèche / sachet / null)
//   sansSilp              Checkbox "pas de liste SILP" cochée (intra-grappe)
//   hgTemperature/hgRefrigerant/hgListesSilp/hgSansSilp  Équivalents pour le formulaire hors-grappe
//   hgEditId/hgEditTemperature/hgEditRefrigerant/hgEditListesSilp  État du formulaire de modification hors-grappe
//   editEnvoiId/editTemperature/editDepts/editRefrigerant  État du formulaire de modification intra-grappe
//   donneesImpression     Données de l'envoi en cours d'impression (intra-grappe)
//   hgDonneesImpression   Idem pour hors-grappe
//   hgFaxId/hgFaxConforme Id et statut de la confirmation fax en cours
//   timerInactivite       Timer de déconnexion automatique par inactivité
//   resumePageDone/resumeLaboDone/resumePageEnvois/resumeLaboEnvois/…  Pagination de chaque vue
//
// Fonctions fréquentes
//   showPanel(n)           affiche le panel "panel-{n}" et active "nav-{n}"
//   notifier(id,msg,t)     affiche une notification (t='s' succès, 'e' erreur)
//   escapeHtml(str)        échappe HTML (& < > ") pour insertion sécurisée dans le DOM
//   xe(str)                alias escapeHtml() utilisé dans les templates d'impression (print.js)
//   deepKey(d,k)           lit la clé k dans l'objet d (support notation pointée)
//   formatDateTime(ts)     formate un timestamp en date + heure lisible
//   formatDate(ts)         idem sans l'heure
//
// Patterns de nommage récurrents (variables locales / paramètres)
//   d             objet envoi (data)
//   e             élément DOM ou objet envoi selon le contexte
//   el            élément DOM ciblé (element)
//   fmt           format d'impression actif (bordereau / grille / pochette_labo…)
//   tc            couleur de texte température (temperature color)
//   xe            fonction d'échappement HTML passée en paramètre aux renderers
//   isDgr         booléen — la matière est-elle dangereuse (DanGerous Regulated)
//   stCfg         configuration du type de spécimen sélectionné (Specimen Type Config)
//   tCfg          configuration de la température sélectionnée (Temperature Config)
// ─────────────────────────────────────────────────────────────────────────────

// ── MODULES ──────────────────────────────────────────────────────────────────
// Toutes les fonctions métier sont dans les modules ES chargés via main.js :
//   utils.js       escapeHtml, formatDateTime, formatDate, deepKey, heuresTransit, formatDuree, classeBadge, libelleRole, classeBadgeRole, formaterCP, formaterTel, separateurModal, departementsHtml, departementsTexte, classesPills, departements
//   auth.js        estAdmin, estGrappe, estSuperviseur, seConnecter, loadProfileAndInit, enregistrerMotDePasse, finaliserConnexion, seDeconnecter, initLoginBg
//   ui.js          notifier, toast, spin, showScr, showPanel, closeGMod, initTheme, toggleTheme, setupKeyboard, confirm2, showSuccessModal, …
//   labs.js        loadLabs, populateSels, renderTempPills, selectionnerTemp, setGlace, toggleDept, updateExpAddr, updateDestAddr, …
//   app-config.js  loadConfig, saveCfg, applyBranding, applyMessages, renderCfgSpec, renderCfgFormats, …
//   envois.js      loadEnvois, saveEnvoi, rechercher, confirmer, showGMod, renderResume, loadHistPage, subscribeRT, …
//   hgrappe.js     loadEnvoisHG, loadExtLabs, initHGMode, setMode, showHGDetail, renderHGConfirmations, …
//   print.js       printBordereau, printBordereauFromEnvoi
//   print-hg.js    printHGDocs, reprintHGDocsFromEnvoi
// ─────────────────────────────────────────────────────────────────────────────

// Photos de fond — page de connexion.
var LOGIN_PHOTOS = [
  { url: 'https://images.unsplash.com/photo-1663354863356-18a03be40a53?q=80&w=2070&auto=format', credit: 'Photo : Unsplash' },
  { url: 'https://images.unsplash.com/photo-1606206591513-adbfbdd7a177?q=80&w=2070&auto=format', credit: 'Photo : Unsplash' },
  { url: 'https://images.unsplash.com/photo-1606206522398-de3bd05b1615?q=80&w=2070&auto=format', credit: 'Photo : Unsplash' },
  { url: '/img/img1inspq.jpg', credit: "Photo : INSPQ - Procédure de collecte et d'envoi d'échantillons sanguins" },
  { url: 'https://cdn.pixabay.com/photo/2018/06/26/05/08/lab-3498584_1280.jpg', credit: 'Photo : fernandozhiminaicela / Pixabay' },
  { url: 'https://images.pexels.com/photos/8442572/pexels-photo-8442572.jpeg?_gl=1*8njumv*_ga*MTczOTMwMDM1MC4xNzc3MjUyNTA0*_ga_8JE65Q40S6*czE3NzczOTcwMTkkbzIkZzEkdDE3NzczOTcxMzgkajExJGwwJGgw', credit: 'Photo : Pavel Danilyuk / Pexels' },
];

// ── ÉTAT GLOBAL ───────────────────────────────────────────────────────────────
// Ces variables sont lues/écrites via state.js (bridge window.*)
var CFG = {name:'Traçabilité OPTILAB',subtitle:'Application de suivi des envois',alarmR:18,alarmP:5,temperatures:[{icon:'🌡',label:'Température pièce',color:'#222'},{icon:'❄',label:'Frigo (2–8°C)',color:'#1B6E94'},{icon:'🧊',label:'Congelé (−20°C)',color:'#1C3A52'}],transporters:['Livraison ML','Guépard','Commissionnaire interne','Taxi','Autre'],messages:{login:'',home:''},badges:{'En transit':{bg:'#D7EEF9',color:'#1B6E94'},'Reçu':{bg:'#E1F2E8',color:'#2E8B57'},'Problème':{bg:'#FBE3E1',color:'#B3261E'},'Perdu':{bg:'#FCE7F3',color:'#9D174D'}},customCss:'',printBordereau:true,hsilpBordereauFormat:'bordereau',bordereau:{titre:"OPTILAB — Bordereau d'envoi",pli:'✄ Plier ici — Fold here',canutec:'1-613-996-6666',canutecLabel:'Urgences 24h',canutecLabelEn:'Emergency 24h',warnSize:true,activeFormat:'grille',formats:[{id:'bordereau',nom:'Bordereau seul — Lettre',desc:'Page lettre 8½ × 11 po : code-barres et tableau d\'informations, sans étiquette d\'expédition'},{id:'grille',nom:'Grille colis — Pochette 8×10 po',desc:'Étiquette en grille : Destinataire | Température — Expéditeur | Départements — Pictogrammes pleine largeur'},{id:'pochette_labo',nom:'Pochette labo — Paysage',desc:'Feuille lettre en paysage pliée pour pochette 8×10 po : destinataire en grand à gauche, pictogrammes + température à droite, STAT + départements en bas'},{id:'pochette_portrait',nom:'Pochette labo — Portrait',desc:'Feuille lettre en portrait pliée : destinataire pleine largeur en haut, expéditeur + départements à gauche, pictogrammes + température à droite, bordereau en bas'}],styles:{},specTypes:[{id:'exempt',label:'Spécimen humain exempté',shape:'box',line1:'SPÉCIMEN HUMAIN EXEMPTÉ',subtitle:'EXEMPT HUMAN SPECIMEN',note:'IATA P650 · 2.6.2.2',isDgr:false},{id:'cat_b',label:'Catégorie B — UN 3373',shape:'diamond',line1:'BIOLOGICAL SUBSTANCE,',line2:'CATEGORY B',line1_fr:'SUBSTANCE BIOLOGIQUE,',line2_fr:'CATÉGORIE B',un:'UN 3373',isDgr:true},{id:'cat_a',label:'Catégorie A — UN 2814',shape:'diamond',icon:'biohazard',line1:'INFECTIOUS SUBSTANCE',line1_fr:'SUBSTANCE INFECTIEUSE',un:'UN 2814',classe:'6',isDgr:true}]}};
var BADGE_STATUTS=[{label:'En transit',cls:'bt'},{label:'Reçu',cls:'br'},{label:'Problème',cls:'bp2'},{label:'Perdu',cls:'bperdu'}];

// Labo actif (contexte multi-labo)
var activeLabo=null;

// Intra-grappe
var currentUser=null,laboratoires=[],envois=[],cacheModals={},utilisateurs=[],termeRecherche='',departementsActifs=[],indexLigne=-1,elementFocus=null,canalRealtime=null,typeSpecimen='exempt',refrigerantChoisi=false;
var resumePageDone=0,resumeLaboDone=null,resumePageEnvois=0,resumeLaboEnvois=null,resumePageRecus=0,resumeDonneesRecus=[],resumeAlertesEnvois=[],resumeAlertesRecus=[];
var sansSilp=false;
var INACT_DELAY=15*60*1000;
var timerInactivite=null;
var editEnvoiId=null,editTemperature='',editDepts=[],editRefrigerant=false;
var donneesImpression=null;
var _gmodTrigger=null;

// Hors-grappe
var modeHG=false,labsExternes=[],envoisHG=[],hgCacheModals={};
var hgTemperature='',hgRefrigerant=false,hgListesSilp=[],hgSansSilp=false;
var hgDonneesImpression=null,hgFaxId=null,hgFaxConforme=null;
var hgEditId=null,hgEditTemperature='',hgEditRefrigerant=false,hgEditListesSilp=[];
var hghPage=0,hghTimer=null;
var hgrPageEnvois=0,hgrLaboEnvois=null,hgrPageConfirmes=0,hgrLaboConfirmes=null,hgrPageAttente=0,hgrLaboAttente=null;
var hgcPage=0;

// Panels rechargés par Realtime (lus par showPanel() dans ui.js)
var _RT_PANELS=['resume','historique','hg-confirmations','hg-historique','hg-resume'];

// ── INITIALISATION ────────────────────────────────────────────────────────────
function capDateInputsToToday(){
  var today=new Date().toISOString().slice(0,10);
  ['pfrom','pto','hfrom','hto','hgc-from','hgc-to','hgr-from','hgr-to','hgh-from','hgh-to'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.max=today;
  });
}

document.addEventListener('DOMContentLoaded',async function(){
  initTheme();
  initLoginBg();
  applyBranding();
  setupKeyboard();
  capDateInputsToToday();
  setupConfirmModal();
  try{
    var ses=(await sb.auth.getSession()).data.session;
    if(ses){await loadProfileAndInit(ses.user.id);}
    else{await loadConfig();spin(false);showScr('login');}
  }catch(e){
    console.error('[OPTILAB] init:',e);
    spin(false);showScr('login');
  }
});
