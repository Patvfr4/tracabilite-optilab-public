import { state } from './state.js';
import { closeGMod, confirm2 } from './ui.js';
import { printBordereau } from './print.js';
import { adresseDestHG } from './hgrappe.js';

export async function reprintHGDocsFromEnvoi(id){
  var e=state.envoisHG.find(function(x){return x.id===id;});if(!e)return;
  var dl=e.destLab||null;
  var destDispName=dl?(dl.parent?(dl.parent.name+'\n'+dl.name):(dl.name||e.dest)):(e.dest||'—');
  state.hgDonneesImpression={
    numero:e.numero,token:e.confirmToken,source:e.source,
    exp:e.exp,dest:destDispName,destLab:dl,temp:e.temp,transporteur:e.transporteur,tubes:e.tubes,
    numerosSilp:e.numerosSilp||[],notes:e.notes||'',creePar:e.creePar||'',
    tsEnvoi:e.tsEnvoi,typeSpecimen:e.typeSpecimen||'exempt',glaceSeche:e.glaceSeche||false,
    expLab:e.expLab||{}
  };
  closeGMod();
  await printHGDocs();
}

export async function printHGDocs(){
  if(!state.hgDonneesImpression)return;
  if(/Edg\//.test(navigator.userAgent)&&!sessionStorage.getItem('_epw')){
    var ok=await confirm2(
      'Aperçu d\'impression — Navigateur Edge',
      'L\'aperçu d\'impression peut ne pas correspondre au résultat réel (orientation de la page F-G-74). Le document imprimé sera correct.\n\nIgnorez l\'aperçu et cliquez directement sur « Imprimer ».',
      'J\'ai compris — Imprimer',
      'warn'
    );
    if(!ok)return;
    sessionStorage.setItem('_epw','1');
  }
  var d=state.hgDonneesImpression;
  var _vc=d.token?d.token.replace(/-/g,'').slice(0,6).toUpperCase():'';
  var barcodeUrl=d.token?d.token+'.c.'+window.location.hostname:'';
  var _da=adresseDestHG(d.destLab)||{};
  var _dl=d.destLab||null,_pl=_dl&&_dl.parent?_dl.parent:null;
  var destLabelText=(_dl&&_dl.label_text)||(_pl&&_pl.label_text)||'';
  state.donneesImpression={numero:d.numero,exp:d.exp,dest:d.dest,temp:d.temp,transporteur:d.transporteur,tubes:d.tubes,depts:[],notes:d.notes,creePar:d.creePar,tsEnvoi:d.tsEnvoi,typeSpecimen:d.typeSpecimen,glaceSeche:d.glaceSeche,isHG:true,destLabelText:destLabelText,expAdresse:d.expLab.adresse||'',expVille:d.expLab.ville||'',expCodePostal:d.expLab.code_postal||'',expTel:d.expLab.telephone||'',destAdresse:_da.adresse||'',destAdresse2:_da.adresse2||'',destVille:_da.ville||'',destCodePostal:_da.code_postal||'',destProvince:_da.province||'',destPays:_da.pays||'',destTel:_da.telephone||''};
  var bordereauHtml=printBordereau(state.CFG.hgrappeFormat||'bordereau',true)||'';
  var bcNumeroSvg='';
  var tmpSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  tmpSvg.id='_bc_fg74_num';tmpSvg.style.display='none';document.body.appendChild(tmpSvg);
  try{JsBarcode('#_bc_fg74_num',d.numero,{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:10,margin:4});tmpSvg.setAttribute('width','100%');tmpSvg.setAttribute('height','62');}catch(ex){}
  bcNumeroSvg=tmpSvg.outerHTML;document.body.removeChild(tmpSvg);
  var bcCodeSvg='';
  if(_vc){
    var tmpSvg2=document.createElementNS('http://www.w3.org/2000/svg','svg');
    tmpSvg2.id='_bc_fg74_vc';tmpSvg2.style.display='none';document.body.appendChild(tmpSvg2);
    try{JsBarcode('#_bc_fg74_vc',_vc,{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:10,margin:4});tmpSvg2.setAttribute('width','100%');tmpSvg2.setAttribute('height','62');}catch(ex){}
    bcCodeSvg=tmpSvg2.outerHTML;document.body.removeChild(tmpSvg2);
  }
  var qrDataUrl='';
  try{
    qrDataUrl=await new Promise(function(resolve){
      var div=document.createElement('div');div.style.cssText='position:fixed;top:-9999px;left:-9999px;width:120px;height:120px;overflow:hidden';document.body.appendChild(div);
      try{
        new QRCode(div,{text:barcodeUrl,width:120,height:120,colorDark:'#000000',colorLight:'#ffffff'});
        setTimeout(function(){var canvas=div.querySelector('canvas');var img=div.querySelector('img');var url2=canvas?canvas.toDataURL():(img&&img.src&&img.src.startsWith('data:')?img.src:'');document.body.removeChild(div);resolve(url2);},350);
      }catch(e2){if(document.body.contains(div))document.body.removeChild(div);resolve('');}
    });
  }catch(e3){}
  printHGCombined(d,barcodeUrl,bordereauHtml,bcNumeroSvg,bcCodeSvg,qrDataUrl);
}

function printHGCombined(d,barcodeUrl,bordereauHtml,bcNumeroSvg,bcCodeSvg,qrDataUrl){
  function xe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  var bordereauStyle='',bordereauBody='';
  var bsi=bordereauHtml.indexOf('<style');
  if(bsi!==-1){var bse=bordereauHtml.indexOf('</style>',bsi);if(bse!==-1)bordereauStyle=bordereauHtml.substring(bordereauHtml.indexOf('>',bsi)+1,bse);}
  var bdi=bordereauHtml.indexOf('<body');var bde=bordereauHtml.lastIndexOf('</body>');
  if(bdi!==-1&&bde!==-1){bordereauBody=bordereauHtml.substring(bordereauHtml.indexOf('>',bdi)+1,bde);}else{bordereauBody=bordereauHtml;}
  var brdPageMatch=bordereauStyle.match(/@page\s*\{([^}]*)\}/);
  var brdPageContent=brdPageMatch?brdPageMatch[1]:'size:letter;margin:14mm 16mm';
  var _isLand=brdPageContent.indexOf('landscape')!==-1;
  var _pH=_isLand?215.9:279.4;
  var _mStr=(brdPageContent.match(/margin:([^;]+)/)||['','14mm'])[1].trim();
  var _mPts=_mStr.split(/\s+/).map(parseFloat);
  var _mT=_mPts[0]||0;var _mB=_mPts.length>2?_mPts[2]:_mT;
  var _brdH=Math.round((_pH-_mT-_mB)*10)/10;
  var transformedBrdStyle=bordereauStyle
    .replace(/@page\s*\{[^}]*\}/g,'')
    .replace(/html,body\{height:100%;width:100%\}/g,'.brd-wrap{height:'+_pH+'mm;width:100%}@media print{.brd-wrap{height:'+_brdH+'mm}}')
    .replace(/(^|[};])body\{/g,function(m,p){return p+'.brd-wrap{';});
  var expLab=d.expLab||{};
  var date=d.tsEnvoi?new Date(d.tsEnvoi).toLocaleString('fr-CA',{dateStyle:'long',timeStyle:'short'}):'—';
  var stCfg=state.CFG.bordereau.specTypes.find(function(t){return t.id===d.typeSpecimen;})||{label:d.typeSpecimen};
  var tubes=d.tubes;
  var silpHtml=d.numerosSilp&&d.numerosSilp.length?'<tr><td style="font-weight:700;white-space:nowrap;border:1px solid #999;padding:5px 8px">N° liste(s) SILP</td><td style="font-family:monospace;font-size:9pt;border:1px solid #999;padding:5px 8px">'+d.numerosSilp.map(xe).join(' · ')+'</td></tr>':'';
  var fBH=xe(expLab.fax_bio_hema||'');var fM=xe(expLab.fax_micro||'');var fP=xe(expLab.fax_patho||'');var fG=xe(expLab.fax_general||'');
  var hasFax=expLab.fax_bio_hema||expLab.fax_micro||expLab.fax_patho||expLab.fax_general;
  var qrHtml=qrDataUrl?'<img src="'+qrDataUrl+'" style="width:100px;height:100px;display:block;flex-shrink:0" alt="QR code"/>':'<div style="width:100px;height:100px;flex-shrink:0;background:#f5f5f5;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7pt;color:#999;padding:4px;line-height:1.3">QR code<br>non disponible</div>';
  function bil(fr,en){return fr+' <span style="font-style:italic;color:#666;font-weight:400;font-size:.88em">/ '+en+'</span>';}
  var verifyCode=d.token?d.token.replace(/-/g,'').slice(0,6).toUpperCase():'——';
  var confirmBase=window.location.origin+'/confirm';
  var TEMP_EN={'Ambiant':'Ambient','Température ambiante':'Ambient temperature','Réfrigéré':'Refrigerated','Réfrigérée':'Refrigerated','Congelé':'Frozen','Congelée':'Frozen','Congelé (-80°C)':'Frozen (-80°C)','Congelé (-20°C)':'Frozen (-20°C)','Congelé (azote liquide)':'Frozen (liquid nitrogen)','Température contrôlée':'Controlled temperature'};
  var SPEC_EN={'Exempt':'Exempt','Exempt de réglementation':'Exempt from regulation','Biologique (A)':'Biological (A)','Biologique (B)':'Biological (B)','Matière infectieuse (A)':'Infectious Substance (A)','Matière infectieuse (B)':'Infectious Substance (B)','Substance biologique – Catégorie A':'Biological Substance – Category A','Substance biologique – Catégorie B':'Biological Substance – Category B','Diagnostic':'Diagnostic specimen','Patient':'Patient specimen'};
  function bil2(fr,map){var en=map[fr];return en?xe(fr)+' <em style="color:#666;font-size:8pt">/ '+xe(en)+'</em>':xe(fr);}
  var tempDisplay=bil2(d.temp,TEMP_EN);var specDisplay=bil2(stCfg.label||d.typeSpecimen,SPEC_EN);
  var TD='border:1px solid #999;padding:4px 7px';var TH='font-weight:700;white-space:nowrap;'+TD+';width:44%';
  var showOnline=!!state.CFG.hgrappeConfirmByNumero;
  var fg74Body=''
    +'<table style="margin-bottom:3mm;border-collapse:collapse;width:100%">'
    +'<tr><td colspan="3" style="text-align:center;font-size:10pt;font-weight:700;background:#ebebeb;border:1.5px solid #333;padding:4px">MANAGEMENT DE LA QUALITÉ <span style="font-weight:400;font-size:9pt;color:#555">/ Quality Management</span></td><td style="text-align:center;font-weight:700;font-size:9.5pt;border:1.5px solid #333;padding:4px">F-G-74</td></tr>'
    +'<tr><td colspan="3" style="text-align:center;font-size:9.5pt;font-weight:700;border:1.5px solid #333;padding:4px">Confirmation de réception de colis <span style="font-weight:400;font-size:8pt;color:#555">/ Shipment Receipt Confirmation</span></td><td style="text-align:center;font-size:8.5pt;border:1.5px solid #333;padding:4px">Version 5<br><span style="color:#555">Approuvé</span></td></tr>'
    +'</table>'
    +'<div style="display:flex;gap:6mm;margin-bottom:3mm;font-size:9pt">'
    +'<div style="flex:1"><div><strong>Expéditeur / <em style="font-weight:400">Sender</em> :</strong> Service de biologie médicale / Medical Biology Service</div><div>CISSS Bas-Saint-Laurent</div><div>Installation / <em>Facility</em> : '+xe(expLab.name||'—')+'</div><div>Téléphone / <em>Phone</em> : '+xe(expLab.telephone||'—')+'</div></div>'
    +'<div style="flex:none;display:flex;flex-direction:column;justify-content:center;align-items:center;border:1.5px solid #333;border-radius:3mm;padding:3mm 5mm;background:#ebebeb"><div style="font-size:7pt;color:#555;margin-bottom:1.5mm;letter-spacing:.04em;text-transform:uppercase">N° d\'envoi / Shipment No.</div><div style="font-family:monospace;font-size:13pt;font-weight:700;color:#000;letter-spacing:.05em">'+xe(d.numero)+'</div></div></div>'
    +'<table style="margin-bottom:3mm;border-collapse:collapse;width:100%">'
    +'<tr><td colspan="2" style="background:#333;color:#fff;text-align:center;font-size:9pt;font-weight:700;padding:4px;letter-spacing:.04em">À compléter par le laboratoire expéditeur <span style="font-weight:400;font-size:8pt;opacity:.8">/ To be completed by the sending laboratory</span></td></tr>'
    +'<tr><td style="'+TH+'">Date et heure d\'emballage <em style="font-weight:400;color:#666;font-size:8pt">/ Packaging date &amp; time</em></td><td style="'+TD+'">'+xe(date)+'</td></tr>'
    +'<tr><td style="'+TH+'">Température <em style="font-weight:400;color:#666;font-size:8pt">/ Temperature</em></td><td style="'+TD+'">'+tempDisplay+'</td></tr>'
    +'<tr><td style="'+TH+'">Type de spécimen <em style="font-weight:400;color:#666;font-size:8pt">/ Specimen type</em></td><td style="'+TD+'">'+specDisplay+'</td></tr>'
    +(tubes?'<tr><td style="'+TH+'">Nb spécimens <em style="font-weight:400;color:#666;font-size:8pt">/ No. of specimens</em></td><td style="'+TD+'">'+xe(tubes)+'</td></tr>':'')
    +'<tr><td style="'+TH+'">Destination</td><td style="'+TD+'">'+(function(){var lab=d.destLab;if(!lab)return xe(d.dest);var pn=lab.parent?lab.parent.name:null;return pn?xe(pn)+'<br><span style="font-size:8pt;color:#555">↳ '+xe(lab.name)+'</span>':xe(lab.name||d.dest);})()+'</td></tr>'
    +'<tr><td style="'+TH+'">Transporteur <em style="font-weight:400;color:#666;font-size:8pt">/ Carrier</em></td><td style="'+TD+'">'+xe(d.transporteur)+'</td></tr>'
    +silpHtml
    +'<tr><td style="'+TH+'">Signature</td><td style="'+TD+';font-family:\'Brush Script MT\',\'Segoe Script\',cursive;font-size:14pt;color:#222">'+xe(d.creePar)+'</td></tr>'
    +'</table>'
    +(showOnline?'<div style="padding:3mm 4mm;border:2px solid #333;border-radius:3mm;margin-bottom:3mm;background:#f0f0f0"><div style="display:flex;align-items:flex-start;gap:5mm">'+qrHtml
    +'<div style="font-size:8.5pt;line-height:1.6;flex:1"><div style="font-weight:700;font-size:9pt;color:#000;margin-bottom:1.5mm">Option 1 — Confirmation en ligne <span style="font-weight:400;font-size:8pt">/ Online Confirmation</span></div>'
    +'<div style="color:#333;margin-bottom:2mm">Scannez le QR code avec votre navigateur pour confirmer directement.<br><em style="color:#555;font-size:7.5pt">Scan the QR code with your browser to confirm directly.</em></div>'
    +'<div style="color:#333;font-size:8pt;margin-bottom:1.5mm">OU / OR — Accédez à <strong>'+xe(confirmBase)+'</strong> et saisissez :</div>'
    +'<div style="display:flex;gap:4mm;align-items:stretch">'
    +'<div style="flex:1;background:#fff;border:1.5px solid #555;border-radius:2mm;padding:2.5mm 3mm;display:flex;flex-direction:column;align-items:center;text-align:center"><div style="font-size:7pt;color:#444;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1.5mm;font-weight:700">N° d\'envoi / Shipment No.</div><div style="font-family:monospace;font-size:10pt;font-weight:700;color:#000;letter-spacing:.05em;margin-bottom:2mm">'+xe(d.numero)+'</div>'+(bcNumeroSvg?'<div style="width:100%">'+bcNumeroSvg+'</div>':'')+'</div>'
    +'<div style="flex:1;background:#fff;border:1.5px solid #555;border-radius:2mm;padding:2.5mm 3mm;display:flex;flex-direction:column;align-items:center;text-align:center"><div style="font-size:7pt;color:#444;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1.5mm;font-weight:700">Code de vérification / Verify code</div><div style="font-family:monospace;font-size:10pt;font-weight:700;color:#000;letter-spacing:.14em;margin-bottom:2mm">'+verifyCode+'</div>'+(bcCodeSvg?'<div style="width:100%">'+bcCodeSvg+'</div>':'')+'</div>'
    +'</div></div></div></div>':'')
    +(hasFax?'<div style="margin-bottom:2.5mm;font-size:8.5pt"><strong>'+(showOnline?'Option 2 — ':'')+'Confirmation par fax / By fax</strong>'+(showOnline?' <em style="color:#555;font-size:8pt">(si confirmation en ligne non disponible / if online confirmation unavailable — voir numéros ci-dessous)</em>':'')+'</div>':'')
    +'<table style="margin-bottom:3mm;border-collapse:collapse;width:100%">'
    +'<tr><td colspan="2" style="background:#333;color:#fff;text-align:center;font-size:9pt;font-weight:700;padding:4px;letter-spacing:.04em">À compléter par le laboratoire sous-traitant à l\'arrivée du colis <span style="font-weight:400;font-size:8pt;opacity:.8">/ To be completed by the receiving laboratory upon arrival</span></td></tr>'
    +'<tr><td style="'+TH+'">Date et heure de réception <em style="font-weight:400;color:#666;font-size:8pt">/ Receipt date &amp; time</em></td><td style="'+TD+'"></td></tr>'
    +'<tr><td style="'+TH+'">Reçu par <em style="font-weight:400;color:#666;font-size:8pt">/ Received by</em></td><td style="'+TD+'"></td></tr>'
    +'<tr><td style="'+TH+'">Signature</td><td style="'+TD+';height:22px"></td></tr>'
    +'<tr><td style="'+TH+'">Non-conformité (si observée) <em style="font-weight:400;color:#666;font-size:8pt">/ Non-conformity (if observed)</em></td><td style="'+TD+'"><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 4px;font-size:8pt"><span style="white-space:nowrap">□ Température&nbsp;/ Temperature</span><span style="white-space:nowrap">□ Spécimen&nbsp;/ Specimen</span><span style="white-space:nowrap">□ Emballage&nbsp;/ Packaging</span><span style="white-space:nowrap">□ Transport&nbsp;/ Transport</span><span style="white-space:nowrap">□ Documentation&nbsp;/ Documentation</span><span style="white-space:nowrap">□ Autre&nbsp;/ Other</span></div></td></tr>'
    +'<tr><td style="'+TH+'">Détailler la non-conformité <em style="font-weight:400;color:#666;font-size:8pt">/ Describe non-conformity</em></td><td style="'+TD+';height:32px"></td></tr>'
    +'</table>'
    +(hasFax?'<div style="font-size:8.5pt;border-top:1px solid #ccc;padding-top:3mm"><div style="font-weight:700;margin-bottom:3px">Faxer le formulaire complété au / Fax completed form to :</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">'+(fBH?'<div>□ '+fBH+' <em style="color:#555">(biochimie–hématologie)</em></div>':'')+(fM?'<div>□ '+fM+' <em style="color:#555">(microbiologie)</em></div>':'')+(fP?'<div>□ '+fP+' <em style="color:#555">(pathologie)</em></div>':'')+(fG?'<div>□ '+fG+' <em style="color:#555">(laboratoire)</em></div>':'')+'</div></div>':'');

  var combinedHtml='<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>'
    +'<title>OPTILAB — Bordereau + F-G-74 — '+xe(d.numero)+'</title>'
    +'<style>'
    +'@page :first{'+brdPageContent+'}'
    +'@page{size:letter portrait;margin:12mm 14mm}'
    +transformedBrdStyle
    +'@media print{.fg74-page{page-break-before:always;break-before:page}}'
    +'.fg74-page{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;padding:0}'
    +'</style>'
    +'</head><body>'
    +'<div class="brd-wrap">'+bordereauBody+'</div>'
    +'<div class="fg74-page">'+fg74Body+'</div>'
    +'</body></html>';

  var ifr=document.createElement('iframe');
  var _ifrW=_isLand?'1056px':'816px';var _ifrH=_isLand?'816px':'1056px';
  ifr.style.cssText='position:fixed;top:-9999px;left:-9999px;width:'+_ifrW+';height:'+_ifrH+';border:none';
  document.body.appendChild(ifr);
  ifr.contentDocument.open();ifr.contentDocument.write(combinedHtml);ifr.contentDocument.close();
  ifr.contentWindow.focus();
  setTimeout(function(){ifr.contentWindow.print();setTimeout(function(){document.body.removeChild(ifr);},800);},400);
}

