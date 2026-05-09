// ── APP-CONFIG.JS ─────────────────────────────────────────────────────────────
// Chargement / sauvegarde de la configuration (app_config), rendu des panels
// Config (Général, Réseau, Envois, Impression), éditeur Markdown, badges.
//
// NOTE : ce fichier s'appelle app-config.js (et non config.js) pour éviter
// le conflit avec public/js/config.js qui définit SUPABASE_URL/KEY.
//
// Dépendances :
//   state.js  — sb, BADGE_STATUTS, EXT_LABS
//   utils.js  — esc
//   ui.js     — ban, confirm2
//   labs.js   — addLab, renderTempPills, populateSels
//
// Appels vers window.* :
//   window.CFG  (toujours global dans app.js en phase 2)
//   window.classesPills (utils via window, exposé par main.js)
//   window.addExtLab (hgrappe.js, pas encore extrait)
// ─────────────────────────────────────────────────────────────────────────────

import { state, sbCall } from './state.js';
import { escapeHtml, departements } from './utils.js';
import { notifier, confirm2 } from './ui.js';
import { addLab, renderTempPills, populateSels } from './labs.js';
import { estAdmin } from './auth.js';

// ── Chargement de la configuration ───────────────────────────────────────────

export async function loadConfig() {
  var r; try { r = await state.sb.from('app_config').select('key,value'); } catch(e) { return; }
  if (r.error) return;
  var CFG = window.CFG;
  function unquote(v) { if (typeof v === 'string' && v.length >= 2 && v[0] === '"' && v[v.length-1] === '"') { try { return JSON.parse(v); } catch(e) {} } return v; }
  r.data.forEach(function(row) {
    if (row.key === 'app_name')                CFG.name           = unquote(row.value);
    if (row.key === 'app_subtitle')            CFG.subtitle       = unquote(row.value);
    if (row.key === 'alarm_hours')             CFG.alarmR         = Number(row.value) || 18;
    if (row.key === 'alarm_days')              CFG.alarmP         = Number(row.value) || 5;
    if (row.key === 'temperatures')            CFG.temperatures   = row.value;
    if (row.key === 'transporters')            CFG.transporters   = row.value;
    if (row.key === 'msg_login')               CFG.messages.login = unquote(row.value);
    if (row.key === 'msg_home')                CFG.messages.home  = unquote(row.value);
    if (row.key === 'badge_colors' && row.value && typeof row.value === 'object') CFG.badges = row.value;
    if (row.key === 'custom_css')              CFG.customCss      = unquote(row.value) || '';
    if (row.key === 'print_bordereau')         CFG.printBordereau = row.value !== false && row.value !== 'false';
    if (row.key === 'hsilp_bordereau_format')  CFG.hsilpBordereauFormat  = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : 'bordereau';
    // hgrappe_enabled_labs maintenant dans module_config — ligne conservée pour rétro-compatibilité
    // bons_depart_enabled_labs maintenant dans module_config — ligne conservée pour rétro-compatibilité
    if (row.key === 'hgrappe_bordereau_format') CFG.hgrappeFormat         = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : 'bordereau';
    if (row.key === 'hgrappe_alarm_days')      CFG.hgrappeAlarmDays      = Number(row.value) || 3;
    if (row.key === 'hgrappe_auto_close_days') CFG.hgrappeAutoCloseDays  = Number(row.value) || 10;
    if (row.key === 'hgrappe_confirm_by_numero') CFG.hgrappeConfirmByNumero = row.value !== false && row.value !== 'false';
    if (row.key === 'bordereau_cfg' && row.value && typeof row.value === 'object') {
      var _codeFmts = CFG.bordereau.formats;
      CFG.bordereau = Object.assign({}, CFG.bordereau, row.value);
      if (Array.isArray(row.value.formats)) { row.value.formats.forEach(function(sf) { var cf = _codeFmts.find(function(f) { return f.id === sf.id; }); if (cf) { if (sf.nom) cf.nom = sf.nom; if (sf.desc) cf.desc = sf.desc; } }); }
      CFG.bordereau.formats = _codeFmts;
      if (!Array.isArray(CFG.bordereau.specTypes)) CFG.bordereau.specTypes = [];
      var _defSt = { tempFrigo: { color: '#1B6E94' }, tempGele: { color: '#1C3A52' }, tempAmb: { color: '#222' } };
      CFG.bordereau.styles = Object.assign({}, _defSt, CFG.bordereau.styles || {});
    }
  });
  if (!CFG.hgrappeEnabledLabs)     CFG.hgrappeEnabledLabs   = [];
  if (!CFG.bonsDepartEnabledLabs)  CFG.bonsDepartEnabledLabs = [];
  // Charger les labs BD et HG depuis module_config (source de vérité V2)
  var _rMods = await state.sb.from('module_config').select('module,labo_id').eq('active',true).in('module',['bons_depart','hgrappe']);
  if (!_rMods.error && _rMods.data) {
    CFG.bonsDepartEnabledLabs = _rMods.data.filter(function(r){return r.module==='bons_depart';}).map(function(r){return r.labo_id;});
    CFG.hgrappeEnabledLabs    = _rMods.data.filter(function(r){return r.module==='hgrappe';}).map(function(r){return r.labo_id;});
  }
  if (!CFG.hgrappeFormat)         CFG.hgrappeFormat         = 'bordereau';
  if (!CFG.hgrappeAlarmDays)      CFG.hgrappeAlarmDays      = 3;
  if (!CFG.hgrappeAutoCloseDays)  CFG.hgrappeAutoCloseDays  = 10;
  if (CFG.hgrappeConfirmByNumero === undefined) CFG.hgrappeConfirmByNumero = true;
  applyBranding(); applyMessages(); applyBadges(); applyCustomCss();
  var elL = document.getElementById('cfg-msg-login'); if (elL) { elL.value = CFG.messages.login; mdeUpdate('login'); }
  var elH = document.getElementById('cfg-msg-home');  if (elH) { elH.value = CFG.messages.home;  mdeUpdate('home');  }
  var bT   = document.getElementById('brd-titre');         if (bT)   bT.value   = CFG.bordereau.titre;
  var bP   = document.getElementById('brd-pli');           if (bP)   bP.value   = CFG.bordereau.pli;
  var bC   = document.getElementById('brd-canutec');       if (bC)   bC.value   = CFG.bordereau.canutec;
  var bCL  = document.getElementById('brd-canutec-label');    if (bCL)  bCL.value  = CFG.bordereau.canutecLabel  || 'Urgences 24h';
  var bCLE = document.getElementById('brd-canutec-label-en'); if (bCLE) bCLE.value = CFG.bordereau.canutecLabelEn || 'Emergency 24h';
  var bW   = document.getElementById('brd-warn-size');        if (bW)   bW.checked = CFG.bordereau.warnSize !== false;
  if (document.getElementById('spec-list'))        renderCfgSpec();
  if (document.getElementById('fmt-list'))         renderCfgFormats();
  if (document.getElementById('hsilp-fmt-list'))  renderCfgHsilpFormat();
  if (document.getElementById('cfgp-modules-body')) renderCfgModules();
}

export async function saveCfg(key, value) {
  var r = await sbCall(state.sb.from('app_config').upsert({ key: key, value: value, updated_at: new Date().toISOString() }), 'cfgerr');
  if (r.error) return false;
  return true;
}

export async function saveBrdCfg() { return await saveCfg('bordereau_cfg', window.CFG.bordereau); }

// ── Config par grappe ─────────────────────────────────────────────────────────

var _cfgGrappeId = null;

export async function saveGrappeCfg(key, value) {
  if (!_cfgGrappeId) { notifier('cfgerr', 'Contexte de grappe non défini.', 'e'); return false; }
  var r = await sbCall(state.sb.from('grappe_config').upsert(
    { grappe_id: _cfgGrappeId, key: key, value: value, updated_at: new Date().toISOString() },
    { onConflict: 'grappe_id,key' }
  ), 'cfgerr');
  return !r.error;
}

export async function loadGrappeConfig(grappeId) {
  if (!grappeId) return;
  _cfgGrappeId = grappeId;
  window._cfgGrappeId = grappeId;
  // Charger la liste des grappes si besoin
  if (!state.grappes || !state.grappes.length) {
    var rG = await state.sb.from('grappes').select('id,name,code').eq('active', true).order('name');
    if (!rG.error) state.grappes = rG.data || [];
  }
  var r = await state.sb.from('grappe_config').select('key,value').eq('grappe_id', grappeId);
  if (r.error) return;
  var CFG = window.CFG;
  (r.data || []).forEach(function(row) {
    if (row.key === 'alarm_hours')             CFG.alarmR                = Number(row.value) || 18;
    if (row.key === 'alarm_days')              CFG.alarmP                = Number(row.value) || 5;
    if (row.key === 'transporters')            CFG.transporters          = Array.isArray(row.value) ? row.value : CFG.transporters;
    if (row.key === 'hgrappe_alarm_days')      CFG.hgrappeAlarmDays      = Number(row.value) || 3;
    if (row.key === 'hgrappe_auto_close_days') CFG.hgrappeAutoCloseDays  = Number(row.value) || 10;
    if (row.key === 'hgrappe_confirm_by_numero') CFG.hgrappeConfirmByNumero = row.value !== false && row.value !== 'false';
  });
  applyBranding();
  if (window.populateSels) window.populateSels();
}

export async function switchCfgGrappe(grappeId) {
  await loadGrappeConfig(grappeId);
  renderCfgGrappe();
}

export function renderCfgGrappe() {
  // Nom de la grappe
  var grappeNameEl = document.getElementById('cfg-grappe-name');
  var g = (state.grappes || []).find(function(g) { return g.id === _cfgGrappeId; });
  if (grappeNameEl) grappeNameEl.textContent = g ? g.name : '—';
  // Sélecteur de grappe (admin uniquement, si plusieurs grappes)
  var selEl = document.getElementById('cfg-grappe-sel');
  if (selEl) {
    var grappes = state.grappes || [];
    if (window.estAdmin && window.estAdmin() && grappes.length > 1) {
      selEl.style.display = '';
      selEl.innerHTML = grappes.map(function(g) {
        return '<option value="' + escapeHtml(g.id) + '"' + (g.id === _cfgGrappeId ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
      }).join('');
    } else {
      selEl.style.display = 'none';
    }
  }
  // Champs alarmes intra
  var alR = document.getElementById('cfg-alarm-r'); if (alR) alR.value = window.CFG.alarmR || 18;
  var alP = document.getElementById('cfg-alarm-p'); if (alP) alP.value = window.CFG.alarmP || 5;
  // Champs alarmes HG
  var hgA = document.getElementById('cfg-hg-alarm-days'); if (hgA) hgA.value = state.CFG.hgrappeAlarmDays || 3;
  var hgB = document.getElementById('cfg-hg-auto-days');  if (hgB) hgB.value = state.CFG.hgrappeAutoCloseDays || 10;
  // Confirmation par numéro
  var cnEl = document.getElementById('cfg-hg-confirm-by-numero'); if (cnEl) cnEl.checked = !!state.CFG.hgrappeConfirmByNumero;
  // Labs et transporteurs
  if (window.renderCfgLabs) window.renderCfgLabs();
  renderCfgTrans();
}

export function applyBranding() {
  var CFG = window.CFG;
  var m = { 'l-name': CFG.name, 'l-sub': CFG.subtitle, 'cpw-appname': CFG.name, 'cp-name': CFG.name,
    'sb-name': CFG.name.replace('Envois - ', ''), 'sb-sub': CFG.subtitle };
  Object.keys(m).forEach(function(id) { var el = document.getElementById(id); if (el) el.textContent = m[id]; });
  document.getElementById('ptitle').textContent = CFG.name;
}

export function applyMessages() {
  var CFG = window.CFG;
  var lm = document.getElementById('login-msg'); lm.innerHTML = mdToHtml(CFG.messages.login); lm.style.display = CFG.messages.login ? 'block' : 'none';
  var aside = document.getElementById('login-aside'); if (aside) aside.style.display = CFG.messages.login ? 'flex' : 'none';
  var hm = document.getElementById('home-msg'); hm.innerHTML = mdToHtml(CFG.messages.home); hm.style.display = CFG.messages.home ? 'block' : 'none';
}

export function applyBadges() {
  var CFG = window.CFG;
  var map = { 'En transit': 'bt', 'Reçu': 'br', 'Problème': 'bp2', 'Perdu': 'bperdu' };
  var css = Object.keys(map).map(function(s) { var c = CFG.badges[s]; return c ? '.' + map[s] + '{background:' + c.bg + '!important;color:' + c.color + '!important}' : ''; }).join('');
  var el = document.getElementById('badge-styles');
  if (!el) { el = document.createElement('style'); el.id = 'badge-styles'; document.head.appendChild(el); }
  el.textContent = css;
}

export function applyCustomCss() {
  var el = document.getElementById('custom-css');
  if (el) el.textContent = window.CFG.customCss || '';
}

export function mdToHtml(s) {
  if (!s) return '';
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  s = s.replace(/^### (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>');
  s = s.replace(/^## (.+)$/gm,  '<strong style="font-size:1.1em">$1</strong>');
  s = s.replace(/^# (.+)$/gm,   '<strong style="font-size:1.15em">$1</strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  s = s.replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,.08);padding:1px 5px;border-radius:3px;font-family:var(--fm);font-size:.92em">$1</code>');
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, function(m, txt, url) {
    if (/^(javascript|data|vbscript):/i.test(url.trim())) return escapeHtml(txt);
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">' + txt + '</a>';
  });
  s = s.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid currentColor;opacity:.25;margin:6px 0">');
  s = s.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  s = s.replace(/((<li>.*?<\/li>\n?)+)/g, function(m) { return '<ul style="margin:4px 0 4px 18px;padding:0">' + m + '</ul>'; });
  s = s.replace(/\n/g, '<br>');
  return s;
}

export function mdeUpdate(key) {
  var ta = document.getElementById('cfg-msg-' + key);
  var prev = document.getElementById('mde-' + key + '-prev');
  if (!prev) return;
  prev.innerHTML = mdToHtml(ta.value) || '<span class="mde-empty">Aperçu…</span>';
}

export function mdeWrap(key, before, after) {
  var ta = document.getElementById('cfg-msg-' + key);
  var s = ta.selectionStart, e = ta.selectionEnd;
  var sel = ta.value.substring(s, e) || 'texte';
  ta.value = ta.value.substring(0, s) + before + sel + after + ta.value.substring(e);
  ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + sel.length;
  ta.focus(); mdeUpdate(key);
}

export function mdeLink(key) {
  var ta = document.getElementById('cfg-msg-' + key);
  var s = ta.selectionStart, e = ta.selectionEnd;
  var sel = ta.value.substring(s, e) || 'texte';
  var ins = '[' + sel + '](https://)';
  ta.value = ta.value.substring(0, s) + ins + ta.value.substring(e);
  ta.selectionStart = s + sel.length + 3; ta.selectionEnd = s + ins.length - 1;
  ta.focus(); mdeUpdate(key);
}

export function mdeLinePrefix(key, prefix) {
  var ta = document.getElementById('cfg-msg-' + key);
  var s  = ta.selectionStart;
  var ls = ta.value.lastIndexOf('\n', s - 1) + 1;
  ta.value = ta.value.substring(0, ls) + prefix + ta.value.substring(ls);
  ta.selectionStart = ta.selectionEnd = s + prefix.length;
  ta.focus(); mdeUpdate(key);
}

export function mdeBlock(key, text) {
  var ta  = document.getElementById('cfg-msg-' + key);
  var s   = ta.selectionStart;
  var pre = s > 0 && ta.value[s - 1] !== '\n' ? '\n' : '';
  var ins = pre + text + '\n';
  ta.value = ta.value.substring(0, s) + ins + ta.value.substring(s);
  ta.selectionStart = ta.selectionEnd = s + ins.length;
  ta.focus(); mdeUpdate(key);
}

export function showCfgTab(t) {
  document.querySelectorAll('.cfg-tab').forEach(function(el)  { el.classList.remove('active'); });
  document.querySelectorAll('.cfg-pane').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('cfgt-' + t).classList.add('active');
  document.getElementById('cfgp-' + t).classList.add('active');
}

// ── Onglet Modules ─────────────────────────────────────────────────────────────

export function renderCfgModules() {
  var body = document.getElementById('cfgp-modules-body');
  if (!body) return;
  var bdEnabled = (window.CFG && window.CFG.bonsDepartEnabledLabs) || [];
  var hgEnabled = (state.CFG && state.CFG.hgrappeEnabledLabs)      || [];

  function labToggleRow(l, isOn, module) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--b3)">'
      + '<label class="cfg-toggle">'
      + '<input type="checkbox"' + (isOn ? ' checked' : '') + ' onchange="toggleModuleLab(\'' + module + '\',\'' + escapeHtml(l.id) + '\',this.checked)"/>'
      + '<span class="cfg-toggle-sl"></span></label>'
      + '<span style="font-size:13px;flex:1">' + escapeHtml(l.name) + '</span>'
      + (isOn ? '<span style="font-size:10px;color:var(--ts);font-weight:600">Actif</span>' : '<span style="font-size:10px;color:var(--t3)">Inactif</span>')
      + '</div>';
  }

  var html = '<div class="cfg-sec">'
    + '<div class="cfg-stitle">Bons de départ</div>'
    + '<div class="cfg-hint" style="margin-bottom:12px">Quand actif, le transporteur n\'est pas requis sur l\'envoi — il est assigné à la création du bon de départ.</div>'
    + state.laboratoires.map(function(l) { return labToggleRow(l, bdEnabled.indexOf(l.id) !== -1, 'bons_depart'); }).join('')
    + '</div>';

  html += '<div class="cfg-sec">'
    + '<div class="cfg-stitle">Hors-grappe</div>'
    + '<div class="cfg-hint" style="margin-bottom:12px">Donne accès au mode Hors-grappe (envois vers des laboratoires externes).</div>'
    + state.laboratoires.map(function(l) { return labToggleRow(l, hgEnabled.indexOf(l.id) !== -1, 'hgrappe'); }).join('')
    + '</div>';

  body.innerHTML = html;
}

export async function toggleModuleLab(module, labId, active) {
  if (module === 'bons_depart') {
    var bdEnabled = (window.CFG && window.CFG.bonsDepartEnabledLabs || []).filter(function(id) { return id !== labId; });
    if (active) bdEnabled.push(labId);
    if (window.CFG) window.CFG.bonsDepartEnabledLabs = bdEnabled;
    var r = await state.sb.from('module_config').upsert({ module: 'bons_depart', labo_id: labId, active: active, updated_at: new Date().toISOString() }, { onConflict: 'module,labo_id' });
    if (r.error) { notifier('cfgerr', 'Erreur : ' + r.error.message, 'e'); return; }
    if (window.updateTransporteurVisibility) window.updateTransporteurVisibility();
  } else if (module === 'hgrappe') {
    var hgEnabled = (state.CFG && state.CFG.hgrappeEnabledLabs || []).filter(function(id) { return id !== labId; });
    if (active) hgEnabled.push(labId);
    if (state.CFG) state.CFG.hgrappeEnabledLabs = hgEnabled;
    var rHG = await state.sb.from('module_config').upsert({ module: 'hgrappe', labo_id: labId, active: active, updated_at: new Date().toISOString() }, { onConflict: 'module,labo_id' });
    if (rHG.error) { notifier('cfgerr', 'Erreur : ' + rHG.error.message, 'e'); return; }
    var canHG = window.isHGEnabled && window.isHGEnabled();
    var sw = document.getElementById('mode-sw'); if (sw) sw.classList.toggle('gone', !canHG);
  }
  renderCfgModules();
  if (window.renderCfgLabs) window.renderCfgLabs();
}

var _cfgAmFn = null;

export function openCfgAddModal(type) {
  var title, body;
  if (type === 'lab') {
    title = 'Ajouter un laboratoire';
    var refOpts = '<option value="">— Non défini (demander à chaque fois) —</option>'
      + '<option value="sachet">❄️ Sachet réfrigérant</option>'
      + '<option value="glace_seche">🧊 Glace sèche</option>';
    body = '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<div class="fgg"><label style="font-size:10px">Nom <span style="color:var(--te)">*</span></label><input type="text" id="newlab" placeholder="Ex. Hôpital de Gaspé" autocomplete="off"/></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div class="fgg"><label style="font-size:10px">Adresse (ligne 1)</label><input type="text" id="newlab-adr" placeholder="150, rue X" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Adresse (ligne 2)</label><input type="text" id="newlab-adr2" placeholder="Bureau 200" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Ville</label><input type="text" id="newlab-vil" placeholder="Rimouski" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Province / État</label><input type="text" id="newlab-prv" placeholder="QC" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Code postal</label><input type="text" id="newlab-cp" placeholder="G5L 5T1" maxlength="7" oninput="this.value=formaterCP(this.value)" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Pays</label><input type="text" id="newlab-pays" placeholder="Canada" style="width:100%"/></div>'
      + '<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Téléphone</label><input type="text" id="newlab-tel" placeholder="(418) 724-8711" maxlength="14" oninput="this.value=formaterTel(this.value)" style="width:100%"/></div>'
      + '<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Réfrigérant par défaut</label><select id="newlab-ref" style="width:100%;font-size:12px">' + refOpts + '</select></div>'
      + '<div style="grid-column:1/-1;height:1px;background:var(--b3);margin:2px 0"></div>'
      + '<div style="grid-column:1/-1;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">Numéros de fax — F-G-74 Hors-grappe</div>'
      + '<div class="fgg"><label style="font-size:10px">Biochimie / Hématologie</label><input type="text" id="newlab-fbh" placeholder="(418) xxx-xxxx" maxlength="14" oninput="this.value=formaterTel(this.value)" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Microbiologie</label><input type="text" id="newlab-fm" placeholder="(418) xxx-xxxx" maxlength="14" oninput="this.value=formaterTel(this.value)" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Pathologie</label><input type="text" id="newlab-fp" placeholder="(418) xxx-xxxx" maxlength="14" oninput="this.value=formaterTel(this.value)" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Laboratoire (général)</label><input type="text" id="newlab-fg" placeholder="(418) xxx-xxxx" maxlength="14" oninput="this.value=formaterTel(this.value)" style="width:100%"/></div>'
      + '</div></div>';
    _cfgAmFn = addLab;
  } else if (type === 'trans') {
    title = 'Ajouter un transporteur';
    body  = '<div class="fgg"><label>Nom <span style="color:var(--te)">*</span></label><input type="text" id="newtrans" placeholder="Nom du transporteur" autocomplete="off"/></div>';
    _cfgAmFn = addTrans;
  } else if (type === 'temp') {
    title = 'Ajouter une température';
    body  = '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<div style="display:grid;grid-template-columns:64px 1fr;gap:8px">'
      + '<div class="fgg"><label style="font-size:10px">Emoji</label><input type="text" id="newtmp-ic" placeholder="❄" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Libellé <span style="color:var(--te)">*</span></label><input type="text" id="newtmp-lbl" placeholder="Ex. Frigo (2–8°C)" autocomplete="off"/></div>'
      + '</div>'
      + '<div class="fgg"><label style="font-size:10px">Mention FR</label><input type="text" id="newtmp-mention" placeholder="Mention française" autocomplete="off"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Mention EN</label><input type="text" id="newtmp-mention-en" placeholder="English mention" autocomplete="off"/></div>'
      + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="newtmp-glace"/> Demander un réfrigérant</label>'
      + '</div>';
    _cfgAmFn = addTemp;
  } else if (type === 'spec') {
    title = 'Ajouter un type de spécimen';
    body  = '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<div class="fgg"><label style="font-size:10px">Libellé <span style="color:var(--te)">*</span></label><input type="text" id="newspec-label" placeholder="Ex. Catégorie C" autocomplete="off"/></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div class="fgg"><label style="font-size:10px">Forme du pictogramme</label><select id="newspec-shape" style="width:100%"><option value="box">Boîte (texte)</option><option value="diamond">Losange (UN)</option></select></div>'
      + '<div class="fgg"><label style="font-size:10px">Numéro UN</label><input type="text" id="newspec-un" placeholder="Ex. UN 3373"/></div>'
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="newspec-dgr"/> Marchandises dangereuses (CANUTEC)</label>'
      + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="newspec-bio"/> Pictogramme biohazard &#x2623;</label>'
      + '</div>';
    _cfgAmFn = addSpecType;
  } else if (type === 'extlab') {
    title = 'Ajouter un laboratoire externe';
    var parentOpts = '<option value="">— Aucun parent —</option>'
      + state.labsExternes.filter(function(l) { return !l.parent_id && l.active; })
          .map(function(l) { return '<option value="' + l.id + '">' + escapeHtml(l.name) + '</option>'; }).join('');
    body = '<div style="display:flex;flex-direction:column;gap:10px">'
      + '<div class="fgg"><label style="font-size:10px">Nom <span style="color:var(--te)">*</span></label><input type="text" id="extlab-new-name" placeholder="Ex. HEJ - Immunosupprimés" autocomplete="off"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Laboratoire parent</label><select id="extlab-parent-sel" style="width:100%">' + parentOpts + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Adresse (ligne 1)</label><input type="text" id="extlab-new-adresse" style="width:100%"/></div>'
      + '<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Adresse (ligne 2)</label><input type="text" id="extlab-new-adresse2" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Ville</label><input type="text" id="extlab-new-ville" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Province</label><input type="text" id="extlab-new-province" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Code postal</label><input type="text" id="extlab-new-cp" style="width:100%"/></div>'
      + '<div class="fgg"><label style="font-size:10px">Pays</label><input type="text" id="extlab-new-pays" style="width:100%"/></div>'
      + '<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Téléphone</label><input type="text" id="extlab-new-tel" style="width:100%"/></div>'
      + '<div class="fgg" style="grid-column:1/-1"><label style="font-size:10px">Texte étiquette HG</label><textarea id="extlab-new-label" rows="2" style="width:100%;resize:vertical"></textarea></div>'
      + '</div></div>';
    _cfgAmFn = window.addExtLab;
  }
  document.getElementById('cfg-am-title').textContent = title;
  document.getElementById('cfg-am-body').innerHTML    = body;
  document.getElementById('cfg-am').classList.add('show');
  setTimeout(function() { var f = document.querySelector('#cfg-am-body input[type="text"]'); if (f) f.focus(); }, 50);
}

export function closeCfgAddModal() { document.getElementById('cfg-am').classList.remove('show'); _cfgAmFn = null; }
export function submitCfgAddModal() { if (_cfgAmFn) _cfgAmFn(); }

export async function saveBranding() {
  var n = document.getElementById('cfg-name').value.trim(), s = document.getElementById('cfg-sub').value.trim();
  if (!n) { notifier('cfgerr', 'Le nom ne peut pas être vide.', 'e'); return; }
  if (await saveCfg('app_name', n) && await saveCfg('app_subtitle', s)) { window.CFG.name = n; window.CFG.subtitle = s; applyBranding(); notifier('cfgsuc', 'Branding mis à jour.', 's'); }
}

export async function saveMessages() {
  var ml = document.getElementById('cfg-msg-login').value.trim(), mh = document.getElementById('cfg-msg-home').value.trim();
  if (await saveCfg('msg_login', ml) && await saveCfg('msg_home', mh)) { window.CFG.messages.login = ml; window.CFG.messages.home = mh; applyMessages(); notifier('cfgsuc', 'Messages mis à jour.', 's'); }
}

export async function saveInterfaceCfg() {
  var v = document.getElementById('cfg-print-bordereau').checked;
  if (await saveCfg('print_bordereau', v)) { window.CFG.printBordereau = v; notifier('cfgsuc', 'Paramètre mis à jour.', 's'); }
}

export async function saveAlarms() {
  var h = parseInt(document.getElementById('cfg-alarm-r').value);
  var d = parseInt(document.getElementById('cfg-alarm-p').value);
  if (!h || h < 1 || !d || d < 1) { notifier('cfgerr', 'Durée invalide.', 'e'); return; }
  var ok = await saveGrappeCfg('alarm_hours', h) && await saveGrappeCfg('alarm_days', d);
  if (ok) { window.CFG.alarmR = h; window.CFG.alarmP = d; applyBranding(); notifier('cfgsuc', 'Seuils mis à jour — R : ' + h + ' h, P : ' + d + ' j.', 's'); }
}

export async function saveAlarmR() {
  var h = parseInt(document.getElementById('cfg-alarm-r').value);
  if (!h || h < 1) { notifier('cfgerr', 'Durée invalide.', 'e'); return; }
  if (await saveGrappeCfg('alarm_hours', h)) { window.CFG.alarmR = h; applyBranding(); notifier('cfgsuc', 'Seuil alarme R : ' + h + ' heures.', 's'); }
}

export async function saveAlarmP() {
  var d = parseInt(document.getElementById('cfg-alarm-p').value);
  if (!d || d < 1) { notifier('cfgerr', 'Durée invalide.', 'e'); return; }
  if (await saveGrappeCfg('alarm_days', d)) { window.CFG.alarmP = d; applyBranding(); notifier('cfgsuc', 'Seuil alarme P : ' + d + ' jours.', 's'); }
}

export function renderCfgBadges() {
  document.getElementById('cfg-badges-list').innerHTML = state.BADGE_STATUTS.map(function(b) {
    var c = window.CFG.badges[b.label] || { bg: '#E5E7EB', color: '#374151' };
    return '<div class="cfg-badge-row">'
      + '<span class="badge ' + b.cls + '" id="badge-prev-' + b.cls + '" style="background:' + c.bg + ';color:' + c.color + '">' + b.label + '</span>'
      + '<div style="display:flex;align-items:center;gap:14px">'
        + '<label class="cfg-badge-lbl">Fond<input type="color" id="badge-bg-' + b.cls + '" value="' + c.bg + '" oninput="livePreviewBadge(\'' + b.cls + '\')"/></label>'
        + '<label class="cfg-badge-lbl">Texte<input type="color" id="badge-txt-' + b.cls + '" value="' + c.color + '" oninput="livePreviewBadge(\'' + b.cls + '\')"/></label>'
        + '<button class="bsm" onclick="resetBadge(\'' + b.label + '\',\'' + b.cls + '\')">Défaut</button>'
      + '</div>'
    + '</div>';
  }).join('');
}

export function livePreviewBadge(cls) {
  var bg = document.getElementById('badge-bg-' + cls).value;
  var txt = document.getElementById('badge-txt-' + cls).value;
  var prev = document.getElementById('badge-prev-' + cls);
  if (prev) { prev.style.background = bg; prev.style.color = txt; }
}

var BADGE_DEFAULTS = { 'En transit': { bg: '#D7EEF9', color: '#1B6E94' }, 'Reçu': { bg: '#E1F2E8', color: '#2E8B57' }, 'Problème': { bg: '#FBE3E1', color: '#B3261E' }, 'Perdu': { bg: '#FCE7F3', color: '#9D174D' } };

export function resetBadge(label, cls) {
  var d = BADGE_DEFAULTS[label]; if (!d) return;
  document.getElementById('badge-bg-' + cls).value = d.bg;
  document.getElementById('badge-txt-' + cls).value = d.color;
  livePreviewBadge(cls);
}

export async function saveBadges() {
  var nb = {};
  state.BADGE_STATUTS.forEach(function(b) { nb[b.label] = { bg: document.getElementById('badge-bg-' + b.cls).value, color: document.getElementById('badge-txt-' + b.cls).value }; });
  if (await saveCfg('badge_colors', nb)) { window.CFG.badges = nb; applyBadges(); notifier('cfgsuc', 'Couleurs des badges mises à jour.', 's'); }
}

export function renderCfgTheme() { var cc = document.getElementById('cfg-custom-css'); if (cc) cc.value = window.CFG.customCss; }

export async function saveCustomCss() {
  var css = document.getElementById('cfg-custom-css').value;
  if (await saveCfg('custom_css', css)) { window.CFG.customCss = css; applyCustomCss(); notifier('cfgsuc', 'CSS personnalisé appliqué.', 's'); }
}

export function _buildFmtCards(activeId, radioName, onChangeFn) {
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">'
    + window.CFG.bordereau.formats.map(function(f) {
      return '<label class="fmt-card">'
        + '<input type="radio" name="' + radioName + '" value="' + escapeHtml(f.id) + '"' + (f.id === activeId ? ' checked' : '') + ' onchange="' + onChangeFn + '(this.value)"/>'
        + '<div class="fmt-card-inner"><div class="fmt-card-name">' + escapeHtml(f.nom) + '</div>'
        + (f.desc ? '<div class="fmt-card-desc">' + escapeHtml(f.desc) + '</div>' : '')
        + '</div></label>';
    }).join('') + '</div>';
}

export function renderCfgFormats() {
  var el = document.getElementById('fmt-list'); if (!el) return;
  el.innerHTML = _buildFmtCards(window.CFG.bordereau.activeFormat || 'grille', 'brd-fmt', 'setActiveFormat');
}

export async function setActiveFormat(id) {
  window.CFG.bordereau.activeFormat = id;
  if (await saveBrdCfg()) notifier('cfgsuc', 'Format du bordereau mis à jour.', 's');
}

export function renderCfgHsilpFormat() {
  var el = document.getElementById('hsilp-fmt-list'); if (!el) return;
  el.innerHTML = _buildFmtCards(window.CFG.hsilpBordereauFormat || 'bordereau', 'hsilp-fmt', 'saveHsilpFormat');
}

export async function saveHsilpFormat(id) {
  window.CFG.hsilpBordereauFormat = id;
  var hint = document.getElementById('hsilp-fmt-hint');
  if (hint) { var f = window.CFG.bordereau.formats.find(function(x) { return x.id === id; }) || {}; hint.textContent = f.desc || ''; }
  if (await saveCfg('hsilp_bordereau_format', id)) notifier('cfgsuc', 'Format Hors SILP mis à jour.', 's');
}

export async function saveBrdGeneral() {
  var CFG = window.CFG;
  CFG.bordereau.titre      = document.getElementById('brd-titre').value.trim()          || "OPTILAB — Bordereau d'envoi";
  CFG.bordereau.pli        = document.getElementById('brd-pli').value.trim()            || '✄ Plier ici — Fold here';
  CFG.bordereau.canutec    = document.getElementById('brd-canutec').value.trim()        || '1-613-996-6666';
  CFG.bordereau.canutecLabel   = document.getElementById('brd-canutec-label').value.trim()   || 'Urgences 24h';
  CFG.bordereau.canutecLabelEn = document.getElementById('brd-canutec-label-en').value.trim();
  CFG.bordereau.warnSize   = document.getElementById('brd-warn-size').checked;
  if (await saveBrdCfg()) notifier('cfgsuc', 'Paramètres du bordereau mis à jour.', 's');
}

export function renderCfgStyles() {
  var el = document.getElementById('brd-styles'); if (!el) return;
  var s = window.CFG.bordereau.styles || {};
  var TEMPS = [{ key: 'tempFrigo', lbl: 'Frigo (2–8°C)', def: '#1B6E94' }, { key: 'tempGele', lbl: 'Congelé', def: '#1C3A52' }, { key: 'tempAmb', lbl: 'Temp. pièce', def: '#222222' }];
  var tempsHtml = TEMPS.map(function(t) {
    var cur = (s[t.key] && s[t.key].color) || t.def;
    return '<div style="display:flex;flex-direction:column;gap:4px"><div style="font-size:11px;color:var(--t2)">' + t.lbl + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
        + '<input type="color" id="st-' + t.key + '" value="' + escapeHtml(cur) + '" style="width:44px;height:34px;cursor:pointer;border:1px solid var(--bd);border-radius:4px;padding:2px" oninput="previewStyleTemp(this,\'' + t.key + '\')">'
        + '<span id="st-' + t.key + '-lbl" style="font-size:12px;font-weight:700;color:' + escapeHtml(cur) + '">' + escapeHtml(cur) + '</span>'
      + '</div></div>';
  }).join('');
  el.innerHTML = '<div style="margin-bottom:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3)">Température</div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">' + tempsHtml + '</div>'
    + '<button class="bp" onclick="saveBrdStyles()">Enregistrer</button>';
}

export function previewStyleTemp(inp, key) {
  var lbl = document.getElementById('st-' + key + '-lbl');
  if (lbl) { lbl.style.color = inp.value; lbl.textContent = inp.value; }
}

export async function saveBrdStyles() {
  if (!window.CFG.bordereau.styles) window.CFG.bordereau.styles = {};
  var s = window.CFG.bordereau.styles;
  ['tempFrigo', 'tempGele', 'tempAmb'].forEach(function(k) { var el = document.getElementById('st-' + k); if (el) s[k] = { color: el.value }; });
  if (await saveBrdCfg()) notifier('cfgsuc', 'Couleurs de température enregistrées.', 's');
}

export function renderCfgSpec() {
  var el = document.getElementById('spec-list'); if (!el) return;
  el.innerHTML = window.CFG.bordereau.specTypes.map(function(st, i) {
    var tag = st.shape === 'diamond' ? 'Losange UN' : 'Boîte';
    var dgr = st.isDgr ? '<span style="font-size:9px;color:var(--te);border:1px solid var(--te);border-radius:3px;padding:0 3px;margin-left:4px">DGR</span>' : '';
    var bio = st.icon === 'biohazard' ? '<span style="font-size:9px;color:#666;border:1px solid #ccc;border-radius:3px;padding:0 3px;margin-left:4px">☣</span>' : '';
    var summary = [tag, st.un, st.line1, st.line2].filter(Boolean).join(' · ');
    return '<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<div><div style="font-weight:600;font-size:13px">' + escapeHtml(st.label) + dgr + bio + '</div>'
        + '<div style="font-size:11px;color:var(--t2);margin-top:2px">' + escapeHtml(summary) + '</div></div>'
        + '<div style="display:flex;gap:6px;flex-shrink:0">'
          + '<button class="bsm bsmi" onclick="toggleSpecEdit(' + i + ')">Modifier</button>'
          + '<button class="bsm bsmd" onclick="removeSpecType(' + i + ')">Supprimer</button>'
        + '</div></div>'
      + '<div id="spef-' + i + '" style="display:none;margin-top:8px;padding:10px;background:var(--b2);border-radius:6px">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Libellé</div><input type="text" id="se-lbl-' + i + '" value="' + escapeHtml(st.label || '') + '"/></div>'
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Numéro UN</div><input type="text" id="se-un-' + i + '" value="' + escapeHtml(st.un || '') + '"/></div>'
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 1 (EN)</div><input type="text" id="se-l1-' + i + '" value="' + escapeHtml(st.line1 || '') + '"/></div>'
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 2 (EN)</div><input type="text" id="se-l2-' + i + '" value="' + escapeHtml(st.line2 || '') + '"/></div>'
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 1 (FR)</div><input type="text" id="se-l1fr-' + i + '" value="' + escapeHtml(st.line1_fr || '') + '"/></div>'
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Ligne 2 (FR)</div><input type="text" id="se-l2fr-' + i + '" value="' + escapeHtml(st.line2_fr || '') + '"/></div>'
          + (!st.isDgr ? '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Traduction EN</div><input type="text" id="se-sub-' + i + '" value="' + escapeHtml(st.subtitle || '') + '"/></div>' : '')
          + (!st.isDgr ? '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Note de bas</div><input type="text" id="se-note-' + i + '" value="' + escapeHtml(st.note || '') + '"/></div>' : '')
          + '<div><div style="font-size:10px;color:var(--t2);margin-bottom:3px">Classe</div><input type="text" id="se-cls-' + i + '" value="' + escapeHtml(st.classe || '') + '" placeholder="ex. 6"/></div>'
          + '<div style="display:flex;flex-direction:column;gap:6px;padding-top:6px">'
            + '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" id="se-dgr-' + i + '"' + (st.isDgr ? ' checked' : '') + '/> Marchandises dangereuses</label>'
            + '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" id="se-bio-' + i + '"' + (st.icon === 'biohazard' ? ' checked' : '') + '/> Pictogramme biohazard</label>'
          + '</div>'
        + '</div>'
        + '<button class="bp" style="font-size:11px;padding:5px 14px" onclick="saveSpecType(' + i + ')">Enregistrer</button>'
      + '</div></div>';
  }).join('');
}

export function toggleSpecEdit(i) { var el = document.getElementById('spef-' + i); if (el) el.style.display = el.style.display === 'none' ? '' : 'none'; }

export async function saveSpecType(i) {
  var st = window.CFG.bordereau.specTypes[i]; if (!st) return;
  st.label = document.getElementById('se-lbl-' + i).value.trim();
  st.un    = document.getElementById('se-un-'  + i).value.trim();
  st.line1 = document.getElementById('se-l1-'  + i).value.trim();
  st.line2 = document.getElementById('se-l2-'  + i).value.trim();
  st.line1_fr = document.getElementById('se-l1fr-' + i).value.trim();
  st.line2_fr = document.getElementById('se-l2fr-' + i).value.trim();
  var seS = document.getElementById('se-sub-'  + i); if (seS)  st.subtitle = seS.value.trim();
  var seN = document.getElementById('se-note-' + i); if (seN)  st.note     = seN.value.trim();
  st.classe = document.getElementById('se-cls-' + i).value.trim();
  st.isDgr  = document.getElementById('se-dgr-' + i).checked;
  st.icon   = document.getElementById('se-bio-' + i).checked ? 'biohazard' : '';
  if (await saveBrdCfg()) { document.getElementById('spef-' + i).style.display = 'none'; renderCfgSpec(); populateSels(); notifier('cfgsuc', 'Type mis à jour.', 's'); }
}

export async function addSpecType() {
  var shape = document.getElementById('newspec-shape').value;
  var label = document.getElementById('newspec-label').value.trim();
  var un    = document.getElementById('newspec-un').value.trim();
  var dgr   = document.getElementById('newspec-dgr').checked;
  var bio   = document.getElementById('newspec-bio').checked;
  if (!label) { notifier('cfgerr', 'Saisissez un libellé.', 'e'); return; }
  var nst = { id: 'spec_' + Date.now(), label: label, shape: shape, line1: label, un: un, isDgr: dgr, icon: bio ? 'biohazard' : '' };
  window.CFG.bordereau.specTypes.push(nst);
  if (await saveBrdCfg()) { closeCfgAddModal(); renderCfgSpec(); populateSels(); notifier('cfgsuc', '"' + label + '" ajouté.', 's'); }
  else window.CFG.bordereau.specTypes.pop();
}

export async function removeSpecType(i) {
  if (!await confirm2('Supprimer ce type de spécimen', 'Les envois existants conservent leur valeur stockée.', 'Supprimer')) return;
  var removed = window.CFG.bordereau.specTypes.splice(i, 1);
  if (await saveBrdCfg()) { renderCfgSpec(); populateSels(); notifier('cfgsuc', 'Type supprimé.', 's'); }
  else window.CFG.bordereau.specTypes.splice(i, 0, removed[0]);
}

export function renderCfgTemps() {
  document.getElementById('temps-list').innerHTML = window.CFG.temperatures.map(function(t, i) {
    var PCLS = window.classesPills;
    var mentionHtml = t.ask_glace
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">'
          + '<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Glace sèche — FR</div><input type="text" id="tmp-gou-' + i + '" value="' + escapeHtml(t.mention_glace_oui || '') + '" style="width:100%;font-size:11px"/></div>'
          + '<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Glace sèche — EN</div><input type="text" id="tmp-gou-en-' + i + '" value="' + escapeHtml(t.mention_glace_oui_en || '') + '" style="width:100%;font-size:11px"/></div>'
          + '<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Sachet réfrigérant — FR</div><input type="text" id="tmp-gno-' + i + '" value="' + escapeHtml(t.mention_glace_non || '') + '" style="width:100%;font-size:11px"/></div>'
          + '<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Sachet réfrigérant — EN</div><input type="text" id="tmp-gno-en-' + i + '" value="' + escapeHtml(t.mention_glace_non_en || '') + '" style="width:100%;font-size:11px"/></div>'
        + '</div>'
      : '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">'
        + '<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Mention FR</div><input type="text" id="tmp-men-' + i + '" value="' + escapeHtml(t.mention || '') + '" style="width:100%;font-size:11px"/></div>'
        + '<div><div style="font-size:9px;color:var(--t2);margin-bottom:3px">Mention EN</div><input type="text" id="tmp-men-en-' + i + '" value="' + escapeHtml(t.mentionEn || '') + '" style="width:100%;font-size:11px"/></div>'
        + '</div>';
    return '<div class="cfg-item" style="flex-direction:column;align-items:stretch;gap:0">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<div style="display:flex;align-items:center;gap:8px">'
          + '<span class="tpill ' + PCLS[i % PCLS.length] + '" style="flex:none;padding:4px 10px;font-size:11px">' + escapeHtml(t.icon) + ' ' + escapeHtml(t.label) + '</span>'
          + '<input type="color" id="tmp-col-' + i + '" value="' + escapeHtml(t.color || '#222222') + '" style="width:32px;height:28px;cursor:pointer;border:1px solid var(--bd);border-radius:4px;padding:1px;flex:none">'
          + (t.ask_glace ? '<span style="font-size:9px;color:var(--t2);font-style:italic">Demande réfrigérant</span>' : '')
        + '</div>'
        + '<div style="display:flex;gap:6px">'
          + '<button class="bsm bsms" onclick="saveTempMention(' + i + ')">Enregistrer</button>'
          + '<button class="bsm bsmd" onclick="removeTemp(' + i + ')">Supprimer</button>'
        + '</div></div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:var(--t2)">'
        + '<span>Bordure</span>'
        + '<input type="number" id="tmp-bw-' + i + '" value="' + (t.borderWidth !== undefined ? t.borderWidth : 3) + '" min="0" max="10" step="0.5" style="width:48px;font-size:11px"> px'
        + '<input type="color" id="tmp-bc-' + i + '" value="' + escapeHtml(t.borderColor || t.color || '#222222') + '" style="width:32px;height:26px;cursor:pointer;border:1px solid var(--bd);border-radius:4px;padding:1px;flex:none">'
        + '<span style="margin-left:6px">Fond</span>'
        + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" id="tmp-bg-on-' + i + '"' + (t.bgColor ? ' checked' : '') + ' onchange="var p=document.getElementById(\'tmp-bg-' + i + '\');if(p)p.disabled=!this.checked"> Activer</label>'
        + '<input type="color" id="tmp-bg-' + i + '" value="' + escapeHtml(t.bgColor || '#ffffff') + '"' + (t.bgColor ? '' : ' disabled') + ' style="width:32px;height:26px;cursor:pointer;border:1px solid var(--bd);border-radius:4px;padding:1px;flex:none">'
      + '</div>' + mentionHtml + '</div>';
  }).join('');
}

export async function saveTempMention(i) {
  var t = window.CFG.temperatures[i]; if (!t) return;
  var col = document.getElementById('tmp-col-' + i); if (col) t.color = col.value;
  var bwEl = document.getElementById('tmp-bw-' + i); if (bwEl) t.borderWidth = parseFloat(bwEl.value);
  var bcEl = document.getElementById('tmp-bc-' + i); if (bcEl) t.borderColor = bcEl.value;
  var bgOnEl = document.getElementById('tmp-bg-on-' + i), bgEl = document.getElementById('tmp-bg-' + i);
  if (bgOnEl && bgEl) t.bgColor = bgOnEl.checked ? bgEl.value : '';
  if (t.ask_glace) {
    t.mention_glace_oui    = document.getElementById('tmp-gou-'    + i).value.trim();
    t.mention_glace_oui_en = document.getElementById('tmp-gou-en-' + i).value.trim();
    t.mention_glace_non    = document.getElementById('tmp-gno-'    + i).value.trim();
    t.mention_glace_non_en = document.getElementById('tmp-gno-en-' + i).value.trim();
  } else {
    t.mention   = document.getElementById('tmp-men-'    + i).value.trim();
    t.mentionEn = document.getElementById('tmp-men-en-' + i).value.trim();
  }
  if (await saveCfg('temperatures', window.CFG.temperatures)) notifier('cfgsuc', 'Mention mise à jour.', 's');
}

export async function addTemp() {
  var ic = document.getElementById('newtmp-ic').value.trim() || '🧪';
  var lbl = document.getElementById('newtmp-lbl').value.trim();
  var men = document.getElementById('newtmp-mention').value.trim();
  var menEn = document.getElementById('newtmp-mention-en').value.trim();
  var askG = document.getElementById('newtmp-glace').checked;
  if (!lbl) { notifier('cfgerr', 'Saisissez un libellé.', 'e'); return; }
  var nt = { icon: ic, label: lbl, mention: men, mentionEn: menEn };
  if (askG) { nt.ask_glace = true; nt.mention_glace_oui = 'Congelé : Glace sèche comme réfrigérant'; nt.mention_glace_non = 'Congelé : Sachet réfrigérant'; }
  window.CFG.temperatures.push(nt);
  if (await saveCfg('temperatures', window.CFG.temperatures)) { closeCfgAddModal(); renderCfgTemps(); renderTempPills(); notifier('cfgsuc', '"' + lbl + '" ajouté.', 's'); }
  else window.CFG.temperatures.pop();
}

export async function removeTemp(i) {
  if (window.CFG.temperatures.length <= 1) { notifier('cfgerr', 'Au moins une température requise.', 'e'); return; }
  if (!await confirm2('Supprimer cette température', 'Cette action est irréversible.', 'Supprimer')) return;
  var removed = window.CFG.temperatures.splice(i, 1);
  if (await saveCfg('temperatures', window.CFG.temperatures)) { renderCfgTemps(); renderTempPills(); notifier('cfgsuc', 'Supprimé.', 's'); }
  else window.CFG.temperatures.splice(i, 0, removed[0]);
}

export function renderCfgTrans() {
  document.getElementById('trans-list').innerHTML = window.CFG.transporters.map(function(t, i) {
    return '<div class="cfg-item"><span>' + escapeHtml(t) + '</span><button class="bsm bsmd" onclick="removeTrans(' + i + ')">Supprimer</button></div>';
  }).join('');
}

export async function addTrans() {
  var v = document.getElementById('newtrans').value.trim();
  if (!v || window.CFG.transporters.indexOf(v) !== -1) { notifier('cfgerr', !v ? 'Saisissez un transporteur.' : 'Existe déjà.', 'e'); return; }
  window.CFG.transporters.push(v);
  if (await saveGrappeCfg('transporters', window.CFG.transporters)) { closeCfgAddModal(); renderCfgTrans(); populateSels(); notifier('cfgsuc', '"' + v + '" ajouté.', 's'); }
  else window.CFG.transporters.pop();
}

export async function removeTrans(i) {
  if (!await confirm2('Supprimer ce transporteur', 'Cette action est irréversible.', 'Supprimer')) return;
  var removed = window.CFG.transporters.splice(i, 1);
  if (await saveGrappeCfg('transporters', window.CFG.transporters)) { renderCfgTrans(); populateSels(); notifier('cfgsuc', 'Supprimé.', 's'); }
  else window.CFG.transporters.splice(i, 0, removed[0]);
}

// ── Notifications par mail ────────────────────────────────────────────────────

var _notifCfg = null;
var _notifEmails = [];
var _notifLog = [];

var _NOTIF_DEPTS = departements.concat([{ id: null, label: 'Fallback laboratoire (tous depts)' }]);

export async function renderCfgNotifications() {
  if (!estAdmin()) return;
  var results = await Promise.all([
    state.sb.from('notification_config').select('*').eq('id', 1).single(),
    state.sb.from('notification_emails').select('*').order('labo_id').order('dept_id'),
    state.sb.from('notification_log').select('id,batch_id,type,to_email,subject,status,sent_at').order('sent_at', { ascending: false }).limit(50),
  ]);
  _notifCfg    = results[0].data || {};
  _notifEmails = results[1].data || [];
  _notifLog    = results[2].data || [];
  _renderNotifToggles();
  _renderNotifProvider();
  _renderNotifEmailsAll();
  _renderNotifLog();
}

function _renderNotifToggles() {
  var c = _notifCfg || {};
  var el = document.getElementById('notif-enabled');  if (el) el.checked = !!c.enabled;
  var fe = document.getElementById('notif-fallback');  if (fe) fe.value = c.fallback_email || '';
}

function _renderNotifProvider() {
  var c = _notifCfg || {};
  var prov = c.provider || 'resend';
  var rEl = document.getElementById('notif-prov-resend'); if (rEl) rEl.checked = (prov === 'resend');
  var sEl = document.getElementById('notif-prov-smtp');   if (sEl) sEl.checked = (prov === 'smtp');
  _toggleNotifProviderFields(prov);
  var rk  = document.getElementById('notif-resend-key'); if (rk)  rk.value  = c.resend_api_key ? '●●●●●●●●' : '';
  var sf  = document.getElementById('notif-smtp-from');  if (sf)  sf.value  = c.smtp_from  || '';
  var sh  = document.getElementById('notif-smtp-host');  if (sh)  sh.value  = c.smtp_host  || '';
  var sp  = document.getElementById('notif-smtp-port');  if (sp)  sp.value  = c.smtp_port  || 587;
  var su  = document.getElementById('notif-smtp-user');  if (su)  su.value  = c.smtp_user  || '';
  var spw = document.getElementById('notif-smtp-pass');  if (spw) spw.value = c.smtp_pass  ? '●●●●●●●●' : '';
  var sf2 = document.getElementById('notif-smtp-from2'); if (sf2) sf2.value = c.smtp_from  || '';
}

export function toggleNotifProvider() {
  var rEl = document.getElementById('notif-prov-resend');
  _toggleNotifProviderFields(rEl && rEl.checked ? 'resend' : 'smtp');
}

function _toggleNotifProviderFields(prov) {
  var rDiv = document.getElementById('notif-resend-cfg');
  var sDiv = document.getElementById('notif-smtp-cfg');
  if (rDiv) rDiv.style.display = prov === 'resend' ? 'block' : 'none';
  if (sDiv) sDiv.style.display = prov === 'smtp'   ? 'block' : 'none';
}

export async function saveNotifConfig() {
  if (!estAdmin()) return;
  var payload = {
    enabled:        !!document.getElementById('notif-enabled').checked,
    fallback_email: (document.getElementById('notif-fallback').value || '').trim(),
    updated_at:     new Date().toISOString(),
  };
  var r = await sbCall(state.sb.from('notification_config').update(payload).eq('id', 1), 'cfgerr');
  if (r.error) return;
  Object.assign(_notifCfg, payload);
  notifier('cfgsuc', 'Configuration enregistrée.', 's');
}

export async function saveNotifProvider() {
  if (!estAdmin()) return;
  var rEl = document.getElementById('notif-prov-resend');
  var prov = rEl && rEl.checked ? 'resend' : 'smtp';
  var payload = { provider: prov, updated_at: new Date().toISOString() };
  if (prov === 'resend') {
    var key = (document.getElementById('notif-resend-key').value || '').trim();
    if (key && key !== '●●●●●●●●') payload.resend_api_key = key;
    payload.smtp_from = (document.getElementById('notif-smtp-from').value || '').trim();
  } else {
    payload.smtp_host = (document.getElementById('notif-smtp-host').value || '').trim();
    payload.smtp_port = parseInt(document.getElementById('notif-smtp-port').value, 10) || 587;
    payload.smtp_user = (document.getElementById('notif-smtp-user').value || '').trim();
    var pw = document.getElementById('notif-smtp-pass').value;
    if (pw && pw !== '●●●●●●●●') payload.smtp_pass = pw;
    payload.smtp_from = (document.getElementById('notif-smtp-from2').value || '').trim();
  }
  var r = await sbCall(state.sb.from('notification_config').update(payload).eq('id', 1), 'cfgerr');
  if (r.error) return;
  Object.assign(_notifCfg, payload);
  notifier('cfgsuc', 'Configuration provider enregistrée.', 's');
}

export async function testNotification() {
  if (!estAdmin()) return;
  var email = window.prompt('Adresse email de test :');
  if (!email || !email.trim()) return;
  email = email.trim();
  var r = await sbCall(state.sb.functions.invoke('test-notification', { body: { email: email } }), 'cfgerr');
  if (r.error) return;
  if (r.data && r.data.error) { notifier('cfgerr', 'Erreur envoi : ' + r.data.error, 'e'); return; }
  notifier('cfgsuc', 'Email de test envoyé à ' + email + '.', 's');
  renderCfgNotifications();
}

function _renderNotifEmailsAll() {
  var container = document.getElementById('notif-emails-list');
  if (!container) return;
  var labs = state.laboratoires;
  if (!labs || !labs.length) { container.innerHTML = '<p class="cfg-hint">Aucun laboratoire configuré.</p>'; return; }
  container.innerHTML = labs.map(function(lab) {
    var sid = lab.id.slice(0, 8);
    var deptsHtml = _NOTIF_DEPTS.map(function(d) {
      var key = sid + '-' + (d.id || 'fallback');
      var emails = _notifEmails.filter(function(e) { return e.labo_id === lab.id && e.dept_id === d.id; });
      var emailsHtml = emails.map(function(e) {
        return '<span class="notif-email-chip">'
          + escapeHtml(e.email)
          + '<button class="notif-chip-del" onclick="removeNotifEmail(\'' + e.id + '\')" title="Supprimer">✕</button>'
          + '</span>';
      }).join('');
      return '<div class="notif-dept-row">'
        + '<div class="notif-dept-label">' + escapeHtml(d.label) + '</div>'
        + '<div class="notif-dept-emails">'
        + (emailsHtml || '<span class="notif-no-email">—</span>')
        + '</div>'
        + '<div class="notif-dept-add">'
        + '<input type="email" class="notif-add-input" id="nei-' + key + '" placeholder="ajouter@exemple.com"'
        + ' onkeydown="if(event.key===\'Enter\'){addNotifEmail(\'' + lab.id + '\',\'' + (d.id || '') + '\',this.value);event.preventDefault();}"/>'
        + '<button class="bsm" onclick="addNotifEmail(\'' + lab.id + '\',\'' + (d.id || '') + '\',document.getElementById(\'nei-' + key + '\').value)">+</button>'
        + '</div>'
        + '</div>';
    }).join('');
    return '<div class="cfg-item notif-lab-block">'
      + '<div class="notif-lab-name">' + escapeHtml(lab.name) + '</div>'
      + '<div class="notif-lab-depts">' + deptsHtml + '</div>'
      + '</div>';
  }).join('');
}

export async function renderLabModalEmails(laboId) {
  var container = document.getElementById('lem-emails-body');
  if (!container || !laboId) return;
  container.innerHTML = '<div style="color:var(--t3);font-size:12px">Chargement…</div>';
  var r = await state.sb.from('notification_emails').select('*').eq('labo_id', laboId).order('dept_id');
  if (r.error) { container.innerHTML = '<div style="color:var(--te);font-size:12px">Erreur de chargement.</div>'; return; }
  var emails = r.data || [];
  var sid = laboId.slice(0, 8);
  container.innerHTML = _NOTIF_DEPTS.map(function(d) {
    var key = sid + '-' + (d.id || 'fallback');
    var deptEmails = emails.filter(function(e) { return e.dept_id === d.id; });
    var emailsHtml = deptEmails.map(function(e) {
      return '<span class="notif-email-chip">' + escapeHtml(e.email)
        + '<button class="notif-chip-del" onclick="removeNotifEmail(\'' + e.id + '\')" title="Supprimer">✕</button>'
        + '</span>';
    }).join('');
    return '<div class="notif-dept-row">'
      + '<div class="notif-dept-label">' + escapeHtml(d.label) + '</div>'
      + '<div class="notif-dept-emails">' + (emailsHtml || '<span class="notif-no-email">—</span>') + '</div>'
      + '<div class="notif-dept-add">'
      + '<input type="email" class="notif-add-input" id="nei-' + key + '" placeholder="ajouter@exemple.com"'
      + ' onkeydown="if(event.key===\'Enter\'){addNotifEmail(\'' + laboId + '\',\'' + (d.id || '') + '\',this.value);event.preventDefault();}"/>'
      + '<button class="bsm" onclick="addNotifEmail(\'' + laboId + '\',\'' + (d.id || '') + '\',document.getElementById(\'nei-' + key + '\').value)">+</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

export async function addNotifEmail(laboId, deptId, email) {
  email = (email || '').trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) { notifier('cfgerr', 'Adresse email invalide.', 'e'); return; }
  var r = await sbCall(state.sb.from('notification_emails').insert({ labo_id: laboId, dept_id: deptId || null, email: email, active: true }).select('*').single(), 'cfgerr');
  if (r.error) return;
  _notifEmails.push(r.data);
  if (window.renderLabModalEmails) window.renderLabModalEmails(laboId);
}

export async function removeNotifEmail(id) {
  if (!await confirm2('Supprimer cet email ?', 'Cette adresse ne recevra plus de notifications.', 'Supprimer')) return;
  var r = await sbCall(state.sb.from('notification_emails').delete().eq('id', id), 'cfgerr');
  if (r.error) return;
  var removed = _notifEmails.find(function(e) { return e.id === id; });
  _notifEmails = _notifEmails.filter(function(e) { return e.id !== id; });
  if (removed && window.renderLabModalEmails) window.renderLabModalEmails(removed.labo_id);
}

function _renderNotifLog() {
  var container = document.getElementById('notif-log-list');
  if (!container) return;
  if (!_notifLog.length) { container.innerHTML = '<p class="cfg-hint">Aucun email envoyé pour le moment.</p>'; return; }
  var typeMap = { nc: 'Non-conf.', lost: 'Perdu', alarm: 'Alarme', hg_nc: 'HG NC', test: 'Test' };
  container.innerHTML = '<div class="notif-log-wrap"><table class="notif-log-table"><thead><tr>'
    + '<th>Date</th><th>Type</th><th>Destinataire</th><th>Statut</th>'
    + '</tr></thead><tbody>'
    + _notifLog.map(function(l) {
      var dt = l.sent_at ? new Date(l.sent_at).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var types = (l.type || '').split(',').map(function(t) { return typeMap[t.trim()] || t.trim(); }).join(', ');
      return '<tr class="' + (l.status === 'error' ? 'notif-log-err' : '') + '">'
        + '<td>' + escapeHtml(dt) + '</td>'
        + '<td>' + escapeHtml(types) + '</td>'
        + '<td>' + escapeHtml(l.to_email) + '</td>'
        + '<td style="text-align:center">' + (l.status === 'error' ? '<span style="color:var(--te)">✗</span>' : '<span style="color:var(--ts)">✓</span>') + '</td>'
        + '</tr>';
    }).join('')
    + '</tbody></table></div>';
}


