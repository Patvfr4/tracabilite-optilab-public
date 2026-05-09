import { state } from './state.js';
import { escapeHtml } from './utils.js';

export function printBordereauFromEnvoi(id){
  var e=state.envois.find(function(x){return x.id===id;})||state.cacheModals[id];if(!e)return;
  state.donneesImpression={numero:e.numero,numerosSilp:e.numerosSilp||[],exp:e.exp,dest:e.dest,temp:e.temp,transporteur:e.transporteur,tubes:e.tubes,depts:e.departements||e.depts||[],notes:e.notes||'',creePar:e.creePar||'',tsEnvoi:e.tsEnvoi,typeSpecimen:e.typeSpecimen||'exempt',glaceSeche:e.glaceSeche||false,expAdresse:e.expAdresse||'',expAdresse2:e.expAdresse2||'',expVille:e.expVille||'',expProvince:e.expProvince||'',expCodePostal:e.expCodePostal||'',expPays:e.expPays||'',expTel:e.expTel||'',destAdresse:e.destAdresse||'',destAdresse2:e.destAdresse2||'',destVille:e.destVille||'',destProvince:e.destProvince||'',destCodePostal:e.destCodePostal||'',destPays:e.destPays||'',destTel:e.destTel||''};
  var fmt=(!e.numerosSilp||e.numerosSilp.length===0)?state.CFG.hsilpBordereauFormat||'bordereau':undefined;
  printBordereau(fmt);
}
export function printBordereau(overrideFormat,returnHtml){
  var d=state.donneesImpression;if(!d)return returnHtml?'':undefined;
  function xe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  var tmpSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  tmpSvg.id='_bc_tmp_brd';tmpSvg.style.display='none';document.body.appendChild(tmpSvg);
  try{JsBarcode('#_bc_tmp_brd',d.numero,{format:'CODE128',width:2,height:55,displayValue:true,fontSize:12,margin:6});}catch(ex){}
  var barcodeSvg=tmpSvg.outerHTML;document.body.removeChild(tmpSvg);

  var dmHtml='';
  if(typeof bwipjs!=='undefined'&&d.numero){
    try{
      var _dmc=document.createElement('canvas');
      bwipjs.toCanvas(_dmc,{bcid:'datamatrix',text:d.numero,scale:10,padding:2});
      dmHtml='<img src="'+_dmc.toDataURL('image/png')+'" style="height:16mm;width:auto;flex-shrink:0;display:block;image-rendering:pixelated;image-rendering:crisp-edges">';
    }catch(_dmex){}
  }

  var date=d.tsEnvoi?new Date(d.tsEnvoi).toLocaleString('fr-CA',{dateStyle:'long',timeStyle:'short'}):'—';
  var tCfg=state.CFG.temperatures.find(function(t){return t.label===d.temp;})||{};
  var hasDryIce=d.glaceSeche===true&&!!tCfg.ask_glace;
  var stCfg=state.CFG.bordereau.specTypes.find(function(t){return t.id===d.typeSpecimen;})||state.CFG.bordereau.specTypes[0]||{id:d.typeSpecimen,label:d.typeSpecimen,shape:'box',isDgr:false};
  var isDgr=!!stCfg.isDgr;

  var fmt=overrideFormat||state.CFG.bordereau.activeFormat||'grille';

  var isSpecDiamond=stCfg.shape==='diamond';
  var _labMm={grille:[43,85],pochette_labo:[72,90],pochette_portrait:[60,82]};
  var labMm=(_labMm[fmt]||[62,62])[isSpecDiamond?1:0];
  var labSz=labMm+'mm';
  var sizeOk=(fmt==='pochette_labo'||fmt==='pochette_portrait')?(labMm>=50):(labMm>=100);

  var tempMention=tCfg.ask_glace?(d.glaceSeche?(tCfg.mention_glace_oui||'Congelé : Glace sèche comme réfrigérant'):(tCfg.mention_glace_non||'Congelé : Sachet réfrigérant')):(tCfg.mention||d.temp);
  var tempMentionEn=tCfg.ask_glace?(d.glaceSeche?(tCfg.mention_glace_oui_en||''):(tCfg.mention_glace_non_en||'')):(tCfg.mentionEn||'');

  var specLabel=mkSpecLabel(stCfg,labSz,fmt==='grille'&&!isSpecDiamond);

  var tc=tCfg.color||(d.temp.indexOf('Frigo')!==-1?'#1B6E94':d.temp.indexOf('Congelé')!==-1?'#1C3A52':'#222');
  var tRange=(d.temp.match(/\(([^)]+)\)/)||[])[1]||'';
  var tBoxBorder=(tCfg.borderWidth!==undefined?tCfg.borderWidth:3)+'px solid '+(tCfg.borderColor||tc);
  var tBoxBg=tCfg.bgColor||'';

  function mkAddr(a,v,cp,tel,a2,prov,pays){var l=[];if(a)l.push(xe(a));if(a2)l.push(xe(a2));if(v){var pr=prov!==undefined?prov:'Qc';l.push(xe(v)+(pr&&cp?' ('+xe(pr)+') '+xe(cp):pr?' ('+xe(pr)+')':cp?' '+xe(cp):''));}else if(cp){l.push(xe(cp));}if(pays)l.push(xe(pays));if(tel)l.push('T&#233;l.&nbsp;: '+xe(tel));return l.join('<br>');}
  var destAddr=mkAddr(d.destAdresse,d.destVille,d.destCodePostal,d.destTel,d.destAdresse2,d.destProvince,d.destPays);
  var _ePrv=d.expProvince||'Qc';
  var expAddrLine=[xe(d.expAdresse||''),d.expAdresse2?xe(d.expAdresse2):'',xe(d.expVille||'')+(d.expVille?' ('+xe(_ePrv)+')'+(d.expCodePostal?' '+xe(d.expCodePostal):''):''),d.expPays?xe(d.expPays):'',d.expTel?xe(d.expTel):''].filter(Boolean).join(' &#183; ');

  var dpts=d.depts||d.departements||[];
  var depStr=dpts.map(function(x){return x.charAt(0)+x.slice(1).toLowerCase();}).join(', ')||'&#8212;';
  var rows=[
    ['Exp&#233;diteur',xe(d.exp)],
    ['Destinataire',xe(d.dest).replace(/\n/g,'<br>')],
    ['Date d\'envoi',xe(date)],
    ['Temp&#233;rature',xe(d.temp)],
    ['Type de sp&#233;cimen',xe(stCfg.label||d.typeSpecimen)],
    hasDryIce?['R&#233;frig&#233;rant','Glace s&#232;che (UN 1845)']:(tCfg.ask_glace?['R&#233;frig&#233;rant','Sachet r&#233;frig&#233;rant']:null),
    d.numerosSilp&&d.numerosSilp.length?['Liste(s) SILP',d.numerosSilp.map(xe).join(' &middot; ')]:null,
    ['Transporteur',xe(d.transporteur)],
    ['D&#233;partement(s)',depStr],
    ['&#201;chantillons',d.tubes||'&#8212;'],
    ['Cr&#233;&#233; par',xe(d.creePar)],
  ].filter(Boolean).map(function(r){return'<tr><th>'+r[0]+'</th><td>'+r[1]+'</td></tr>';}).join('');
  var notesRow=d.notes?'<tr><th>Notes</th><td style="white-space:pre-wrap">'+xe(d.notes)+'</td></tr>':'';

  var html, ifrW='215.9mm', ifrH='279.4mm';
  if(fmt==='pochette_labo'){
    ifrW='279.4mm';ifrH='215.9mm';
    html=brdHtmlPochetteLabo(d,xe,date,barcodeSvg,rows,notesRow,specLabel,hasDryIce,tempMention,tempMentionEn,tRange,tc,tBoxBorder,tBoxBg,isDgr,labMm,sizeOk,expAddrLine,destAddr,stCfg,dmHtml);
  }else if(fmt==='pochette_portrait'){
    html=brdHtmlPochettePortrait(d,xe,date,barcodeSvg,rows,notesRow,specLabel,hasDryIce,tempMention,tempMentionEn,tRange,tc,tBoxBorder,tBoxBg,isDgr,labMm,sizeOk,expAddrLine,destAddr,stCfg,dmHtml);
  }else if(fmt==='bordereau'){
    html=brdHtmlBordereauSeul(xe,date,d.numero,barcodeSvg,rows,notesRow);
  }else{
    html=brdHtmlGrille(d,xe,date,barcodeSvg,rows,notesRow,specLabel,hasDryIce,tempMention,tempMentionEn,tRange,tc,tBoxBorder,tBoxBg,isDgr,labMm,sizeOk,expAddrLine,destAddr,isSpecDiamond,dmHtml);
  }
  if(returnHtml)return html;
  var ifr=document.createElement('iframe');
  ifr.style.cssText='position:fixed;top:-9999px;left:-9999px;width:'+ifrW+';height:'+ifrH+';border:none';
  document.body.appendChild(ifr);
  ifr.contentDocument.open();ifr.contentDocument.write(html);ifr.contentDocument.close();
  ifr.contentWindow.focus();
  setTimeout(function(){ifr.contentWindow.print();setTimeout(function(){document.body.removeChild(ifr);},500);},300);
}

// ── PICTO BUILDERS ────────────────────────────────────────────────────────────
var _AF="Arial,Helvetica,sans-serif";
var _SYM="'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols2',sans-serif";

function mkSpecLabel(st,sz,wide){
  var l1=st.line1||'',l2=st.line2||'';

  if(st.shape==='diamond'){
    var base='<svg style="display:block;width:100%;height:auto;flex-shrink:0" viewBox="-6 -6 212 212" xmlns="http://www.w3.org/2000/svg">'
      +'<polygon points="100,5 195,100 100,195 5,100" fill="white" stroke="black" stroke-width="7"/>';

    if(st.icon==='biohazard'){
      return base
        +'<text x="100" y="82" text-anchor="middle" font-family="'+_SYM+'" font-size="60" fill="black">&#x2623;</text>'
        +(l1?'<text x="100" y="111" text-anchor="middle" font-family="'+_AF+'" font-size="11" font-weight="bold" fill="black">'+escapeHtml(l1)+'</text>':'')
        +(st.line1_fr?'<text x="100" y="124" text-anchor="middle" font-family="'+_AF+'" font-size="9" fill="#555">'+escapeHtml(st.line1_fr)+'</text>':'')
        +(st.un?'<text x="100" y="146" text-anchor="middle" font-family="'+_AF+'" font-size="20" font-weight="900" fill="black" textLength="84" lengthAdjust="spacingAndGlyphs">'+escapeHtml(st.un)+'</text>':'')
        +(st.classe?'<text x="100" y="168" text-anchor="middle" font-family="'+_AF+'" font-size="15" font-weight="900" fill="black">'+escapeHtml(st.classe)+'</text>':'')
        +'</svg>';
    }

    return base
      +(l1?'<text x="100" y="68" text-anchor="middle" font-family="'+_AF+'" font-size="11" font-weight="bold" fill="black" textLength="100" lengthAdjust="spacingAndGlyphs">'+escapeHtml(l1)+'</text>':'')
      +(l2?'<text x="100" y="81" text-anchor="middle" font-family="'+_AF+'" font-size="11" font-weight="bold" fill="black">'+escapeHtml(l2)+'</text>':'')
      +(st.line1_fr||st.line2_fr?'<line x1="65" y1="88" x2="135" y2="88" stroke="#ccc" stroke-width="1.5"/>':'')
      +(st.line1_fr?'<text x="100" y="99" text-anchor="middle" font-family="'+_AF+'" font-size="10" fill="#444">'+escapeHtml(st.line1_fr)+'</text>':'')
      +(st.line2_fr?'<text x="100" y="112" text-anchor="middle" font-family="'+_AF+'" font-size="10" fill="#444">'+escapeHtml(st.line2_fr)+'</text>':'')
      +(st.un?'<text x="100" y="140" text-anchor="middle" font-family="'+_AF+'" font-size="22" font-weight="900" fill="black" textLength="96" lengthAdjust="spacingAndGlyphs">'+escapeHtml(st.un)+'</text>':'')
      +(st.classe?'<text x="100" y="168" text-anchor="middle" font-family="'+_AF+'" font-size="18" font-weight="900" fill="black">'+escapeHtml(st.classe)+'</text>':'')
      +'</svg>';
  }

  var full=(l1+(l2?' '+l2:'')).trim();
  var words=full.split(' ');
  var split3=words.length>=3;
  var split=!split3&&full.length>16&&words.length>=2;
  var tl1,tl2,tl3='';
  if(split3){tl1=words[0];tl2=words[1];tl3=words.slice(2).join(' ');}
  else if(split){var mid=Math.ceil(words.length/2);tl1=words.slice(0,mid).join(' ');tl2=words.slice(mid).join(' ');}
  else{tl1=full;tl2='';}
  var maxLen=Math.max(tl1.length,tl2?tl2.length:0,tl3?tl3.length:0);
  var bFs=Math.min(split3?34:26,Math.floor(170/(maxLen*0.72)));
  var tlB=function(t){return' textLength="'+Math.min(Math.round(t.length*bFs*0.72),168)+'" lengthAdjust="spacingAndGlyphs"';};

  if(wide){
    if(split3){
      var wFs3=Math.min(34,Math.floor(360/(maxLen*0.75)));
      var wLnH=wFs3+6;
      var wH3=4+wLnH*3+(st.subtitle?22:4)+8;
      return '<svg style="display:block;width:100%;flex-shrink:0" viewBox="0 0 400 '+wH3+'" xmlns="http://www.w3.org/2000/svg">'
        +'<rect x="4" y="4" width="392" height="'+(wH3-8)+'" fill="white" stroke="black" stroke-width="5"/>'
        +'<text x="200" y="'+(4+wLnH)+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+wFs3+'" font-weight="900" fill="black" textLength="'+Math.min(Math.round(tl1.length*wFs3*0.72),360)+'" lengthAdjust="spacingAndGlyphs">'+escapeHtml(tl1)+'</text>'
        +'<text x="200" y="'+(4+wLnH*2)+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+wFs3+'" font-weight="900" fill="black" textLength="'+Math.min(Math.round(tl2.length*wFs3*0.72),360)+'" lengthAdjust="spacingAndGlyphs">'+escapeHtml(tl2)+'</text>'
        +'<text x="200" y="'+(4+wLnH*3)+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+wFs3+'" font-weight="900" fill="black" textLength="'+Math.min(Math.round(tl3.length*wFs3*0.72),360)+'" lengthAdjust="spacingAndGlyphs">'+escapeHtml(tl3)+'</text>'
        +(st.subtitle?'<text x="200" y="'+(4+wLnH*3+18)+'" text-anchor="middle" font-family="'+_AF+'" font-size="14" font-style="italic" fill="#444">'+escapeHtml(st.subtitle)+'</text>':'')
        +'</svg>';
    }
    var wFs=Math.min(28,Math.floor(360/(full.length*0.75)));
    var wTL=Math.min(Math.round(full.length*wFs*0.72),360);
    return '<svg style="display:block;width:100%;flex-shrink:0" viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">'
      +'<rect x="4" y="4" width="392" height="72" fill="white" stroke="black" stroke-width="5"/>'
      +(full?'<text x="200" y="36" text-anchor="middle" font-family="'+_AF+'" font-size="'+wFs+'" font-weight="900" fill="black" textLength="'+wTL+'" lengthAdjust="spacingAndGlyphs">'+escapeHtml(full)+'</text>':'')
      +(st.subtitle?'<text x="200" y="54" text-anchor="middle" font-family="'+_AF+'" font-size="14" font-style="italic" fill="#444">'+escapeHtml(st.subtitle)+'</text>':'')
      +(st.note?'<line x1="80" y1="62" x2="320" y2="62" stroke="#ccc" stroke-width="1"/>':'')
      +(st.note?'<text x="200" y="73" text-anchor="middle" font-family="'+_AF+'" font-size="10" fill="#888">'+escapeHtml(st.note)+'</text>':'')
      +'</svg>';
  }

  var y1=split3?58:split?70:84;var y2=(split||split3)?y1+bFs+4:0;var y3=split3?y2+bFs+4:0;
  var ySub=(split3?y3:split?y2:y1)+18;var yLine=ySub+14;var yNote=yLine+18;
  return '<svg style="display:block;width:'+sz+';height:'+sz+';max-width:100%;flex-shrink:0" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'
    +'<rect x="4" y="4" width="192" height="192" fill="white" stroke="black" stroke-width="7"/>'
    +(tl1?'<text x="100" y="'+y1+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+bFs+'" font-weight="900" fill="black"'+tlB(tl1)+'>'+escapeHtml(tl1)+'</text>':'')
    +(tl2?'<text x="100" y="'+y2+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+bFs+'" font-weight="900" fill="black"'+tlB(tl2)+'>'+escapeHtml(tl2)+'</text>':'')
    +(tl3?'<text x="100" y="'+y3+'" text-anchor="middle" font-family="'+_AF+'" font-size="'+bFs+'" font-weight="900" fill="black"'+tlB(tl3)+'>'+escapeHtml(tl3)+'</text>':'')
    +(st.subtitle?'<text x="100" y="'+ySub+'" text-anchor="middle" font-family="'+_AF+'" font-size="13" font-style="italic" fill="#444">'+escapeHtml(st.subtitle)+'</text>':'')
    +(st.note?'<line x1="30" y1="'+yLine+'" x2="170" y2="'+yLine+'" stroke="#ccc" stroke-width="1"/>':'')
    +(st.note?'<text x="100" y="'+yNote+'" text-anchor="middle" font-family="'+_AF+'" font-size="11" fill="#888">'+escapeHtml(st.note)+'</text>':'')
    +'</svg>';
}


// ── RENDERERS ─────────────────────────────────────────────────────────────────
var _brdPrint='@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
var _brdTable='table{width:100%;border-collapse:collapse}'
  +'th{text-align:left;font-weight:600;color:#555;padding:2px 8px 2px 0;width:110px;vertical-align:top;font-size:9pt}'
  +'td{padding:2px 0;border-bottom:.5px solid #eee;font-size:10pt}';
function _brdHead(num,xe){return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Bordereau &#8212; '+xe(num)+'</title><style>';}

function fmtDestLabel(dest,xe){
  var parts=(dest||'').split('\n');
  if(parts.length<2)return xe(dest||'—');
  return '<span style="display:block">'+xe(parts[0])+'</span>'
        +'<span style="display:block;font-size:.68em;font-weight:600;opacity:.72;margin-top:.8mm;letter-spacing:.01em">'+xe(parts[1])+'</span>';
}

function brdHtmlBordereauSeul(xe,date,numero,barcodeSvg,rows,notesRow){
  return _brdHead(numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:14mm 16mm}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111}'
    +'.bh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #1C3A52;padding-bottom:3.5mm;margin-bottom:7mm}'
    +'.bt2{font-size:18pt;font-weight:700;color:#1C3A52}.bd{font-size:10pt;color:#666}'
    +'.bc{text-align:center;margin-bottom:7mm}.bc svg{max-width:240px}'
    +'th{text-align:left;font-weight:600;color:#555;padding:3.5px 10px 3.5px 0;width:140px;vertical-align:top;font-size:10pt}'
    +'td{padding:3.5px 0;border-bottom:.5px solid #eee;font-size:11pt}'
    +'table{width:100%;border-collapse:collapse}'
    +_brdPrint
    +'</style></head><body>'
    +'<div class="bh"><div class="bt2">'+xe(state.CFG.bordereau.titre)+'</div><div class="bd">'+xe(date)+'</div></div>'
    +'<div class="bc">'+barcodeSvg+'</div>'
    +'<table><tbody>'+rows+notesRow+'</tbody></table>'
    +'</body></html>';
}

function brdHtmlPochetteLabo(d,xe,date,barcodeSvg,rows,notesRow,specLabel,hasDryIce,tempMention,tempMentionEn,tRange,tc,tBoxBorder,tBoxBg,isDgr,labMm,sizeOk,expAddrLine,destAddr,stCfg,dmHtml){
  var isSpecDiamond=stCfg&&stCfg.shape==='diamond';
  var _hgt=d.isHG&&!!d.destLabelText;
  var dpts=d.depts||d.departements||[];
  var DLIST=[{id:'BIOCHIMIE',lbl:'Biochimie'},{id:'HEMATOLOGIE',lbl:'H&#233;mato.&#160;/ BDS'},{id:'MICROBIOLOGIE',lbl:'Micro.&#160;/ S&#233;ro.'},{id:'PATHOLOGIE',lbl:'Patho.&#160;/ Cyto.'}];
  var deptsGrid='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 5mm;align-items:center;flex:1;min-width:0">';
  DLIST.forEach(function(dep){var on=dpts.indexOf(dep.id)!==-1;var bk=on?'background:#1C3A52;color:white;border-color:#1C3A52;':'';deptsGrid+='<div style="display:flex;align-items:center;gap:2mm"><div style="display:inline-flex;align-items:center;justify-content:center;width:7mm;height:7mm;border:2px solid #333;border-radius:.5mm;flex-shrink:0;font-size:10pt;font-weight:900;'+bk+'">'+(on?'&#x2713;':'')+'</div><span style="font-size:11pt;font-family:Arial,Helvetica,sans-serif">'+dep.lbl+'</span></div>';});
  deptsGrid+='</div>';
  var tLen=tempMention.length;var tFs=tLen<=12?'30pt':tLen<=20?'24pt':tLen<=32?'18pt':'14pt';if(hasDryIce)tFs=tLen<=24?'28pt':tLen<=36?'22pt':'18pt';
  var tempBox='<div style="flex-shrink:0;width:100%;border:'+tBoxBorder+';'+(tBoxBg?'background:'+tBoxBg+';':'')+'padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;margin-top:3mm"><div style="font-size:'+tFs+';font-weight:900;color:'+tc+';line-height:1.25">'+xe(tempMention)+'</div>'+((!hasDryIce)&&tRange?'<div style="font-size:10pt;color:'+tc+';margin-top:1.5mm;opacity:.75">'+xe(tRange)+'</div>':'')+'</div>';
  var canutecHtml=isDgr?'<div style="flex-shrink:0;width:100%;padding:1.5mm 2mm;background:#FFF8E1;border:1px solid #F5C518;border-radius:1mm;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;margin-top:3mm;box-sizing:border-box"><div style="display:flex;align-items:center;gap:2mm"><span style="font-weight:700">'+xe(state.CFG.bordereau.canutecLabel||'Urgences 24h')+'&#160;:</span><span style="font-weight:900;font-size:9pt;color:#B8860B">'+xe(state.CFG.bordereau.canutec)+'</span></div>'+'</div>':'';
  var rightCol;
  if(!isDgr&&stCfg){var sc='#555';var st1=stCfg.line1||stCfg.label||'';var st1w=st1.split(' ');var st1is3=st1w.length>=3;var maxWL=st1is3?Math.max.apply(null,st1w.map(function(w){return w.length;})):0;var specFs=st1is3?(maxWL<=10?'26pt':'18pt'):(st1.length<=14?'18pt':st1.length<=22?'14pt':'11pt');var specInner=st1is3?st1w.map(function(w){return'<div>'+xe(w)+'</div>';}).join(''):xe(st1);var exemptBox='<div style="flex:1;width:100%;border:3px solid '+sc+';padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box"><div style="font-size:'+specFs+';font-weight:900;color:'+sc+';line-height:1.3">'+specInner+'</div>'+(stCfg.subtitle?'<div style="font-size:9pt;color:#777;margin-top:1.5mm;font-style:italic">'+xe(stCfg.subtitle)+'</div>':'')+'</div>';rightCol=exemptBox+tempBox;}
  else{var pictoWrap='<div id="pl-picto-fill" style="flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden">'+specLabel+'</div>';rightCol=pictoWrap+tempBox+canutecHtml;}
  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter landscape;margin:6mm}'
    +'html,body{height:100%;width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column;position:relative}'
    +'.vfold{position:absolute;left:19mm;top:0;bottom:0;border-left:2px dashed #777;pointer-events:none}'
    +'.etq{flex:0 0 '+(isSpecDiamond?'72':'64')+'%;display:flex;min-height:0;overflow:hidden}'
    +'.col-l{flex:1;display:flex;flex-direction:column;padding:4mm 5mm 3mm 22mm;border-right:1px solid #ccc;min-width:0;overflow:hidden}'
    +'.dest{flex:2;display:flex;flex-direction:column;min-height:0;overflow:hidden}'
    +'.exp{flex-shrink:0;padding-top:2.5mm;border-top:.5px solid #ddd;margin-top:2.5mm}'
    +'.depts{flex:1;min-height:0;display:flex;align-items:center;gap:3.5mm;padding-top:2.5mm;border-top:1.5px solid #bbb;margin-top:2.5mm}'
    +'.col-r{width:'+(isSpecDiamond?'116':'96')+'mm;flex:none;display:flex;flex-direction:column;align-items:center;padding:4mm 4mm 3mm 4mm;overflow:hidden}'
    +'.fold{flex-shrink:0;height:0;border-top:2px dashed #777;position:relative}'
    +'.flbl{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:white;padding:0 3mm;font-size:7pt;color:#999;white-space:nowrap}'
    +'.bord{flex:1;display:flex;gap:5mm;align-items:flex-start;padding:4mm 6mm 4mm 22mm;overflow:hidden}'
    +'.bord-bc svg{display:block;max-height:38mm}'
    +'table{border-collapse:collapse;width:100%}'
    +'th{text-align:left;font-weight:600;color:#555;padding:1px 6px 1px 0;width:90px;vertical-align:top;font-size:8pt}'
    +'td{padding:1px 0;border-bottom:.3px solid #eee;font-size:9pt}'
    +_brdPrint
    +'</style></head><body>'
    +'<div class="vfold"></div>'
    +'<div class="etq">'
      +'<div class="col-l">'
        +'<div class="dest">'
          +'<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1.5mm">Destinataire</div>'
          +'<div id="pl-dname" style="font-size:22pt;font-weight:900;text-transform:uppercase;line-height:1.15;color:#1C3A52;font-family:Arial,Helvetica,sans-serif">'+fmtDestLabel(d.dest,xe)+'</div>'
          +'<div id="pl-daddr" style="font-size:14pt;line-height:1.5;color:#222;font-family:Arial,Helvetica,sans-serif;margin-top:2mm">'+destAddr+'</div>'
        +'</div>'
        +'<div class="exp" style="display:flex;align-items:center;gap:3mm">'
          +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:.5mm">Exp&#233;diteur</div>'
            +'<div style="font-size:10pt;font-weight:700;color:#333;font-family:Arial,Helvetica,sans-serif">'+xe(d.exp)+'</div>'
            +(expAddrLine?'<div style="font-size:8.5pt;color:#666;font-family:Arial,Helvetica,sans-serif;margin-top:.3mm">'+expAddrLine+'</div>':'')
          +'</div>'
          +dmHtml
        +'</div>'
        +(_hgt
          ?'<div class="depts" style="justify-content:center;align-items:stretch;padding:2mm 3mm 7mm 3mm"><div id="pl-hg-box" style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 4mm"><div id="pl-hg-txt" style="font-weight:900;color:#1C3A52;text-align:center;white-space:nowrap;line-height:1.3;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div></div>'
          :d.isHG?''
          :'<div class="depts"><div style="display:flex;align-items:center;gap:2.5mm;flex-shrink:0;align-self:center"><div style="width:10mm;height:10mm;border:3px solid #1C3A52;border-radius:1mm;flex-shrink:0"></div><span style="font-size:16pt;font-weight:900;color:#1C3A52;font-family:Arial,Helvetica,sans-serif;white-space:nowrap">Analyses STAT</span></div><div style="width:.5px;align-self:stretch;background:#ccc;flex-shrink:0"></div>'+deptsGrid+'</div>'
        )
      +'</div>'
      +'<div class="col-r">'+rightCol+'</div>'
    +'</div>'
    +'<div class="fold"><span class="flbl">'+xe(state.CFG.bordereau.pli)+'</span></div>'
    +'<div class="bord"><div class="bord-bc">'+barcodeSvg+'</div><div style="flex:1;min-width:0;overflow:hidden"><table><tbody>'+rows+notesRow+'</tbody></table></div></div>'
    +'<script>(function(){setTimeout(function(){'
    +'var dn=document.getElementById("pl-dname"),da=document.getElementById("pl-daddr"),dc=dn&&dn.closest(".dest");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.88;for(var ns=22;ns>=8;ns--){var as=Math.max(7,Math.round(ns*0.64));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    +'},50);'
    +'setTimeout(function(){'
    +'var pf=document.getElementById("pl-picto-fill");'
    +'if(pf){var r=pf.getBoundingClientRect();var ph=r.height,pw=r.width;'
    +'var sqSvgs=Array.prototype.filter.call(pf.querySelectorAll("svg"),function(sv){var vb=(sv.getAttribute("viewBox")||"").split(" ");return Math.abs((+vb[2])-(+vb[3]))<10;});'
    +'if(sqSvgs.length>0){var n=sqSvgs.length;var sz=Math.floor(Math.min(ph,pw/n));if(sz>20)sqSvgs.forEach(function(sv){sv.style.width=sz+"px";sv.style.height=sz+"px";});}}'
    +'},150);'
    +'setTimeout(function(){'
    +'var hb=document.getElementById("pl-hg-box"),ht=document.getElementById("pl-hg-txt");'
    +'if(hb&&ht){'
    +'  ht.style.fontSize="1pt";'
    +'  var r=hb.getBoundingClientRect();'
    +'  var hh=r.height,hw=r.width;'
    +'  if(!(hh>10&&hw>10)){'
    +'    var _W=Math.max(window.innerWidth,window.innerHeight);'
    +'    var _H=Math.min(window.innerWidth,window.innerHeight);'
    +'    var _mm=_W/279.4;'
    +'    hh=(_H*0.64-22*_mm)/3-4*_mm;'
    +'    hw=_W-96*_mm-34*_mm-1;'
    +'  }'
    +'  if(hh>10&&hw>10){for(var s=120;s>=6;s--){ht.style.fontSize=s+"pt";if(ht.scrollHeight<=hh*0.85&&ht.scrollWidth<=hw*0.88)break;}}'
    +'}'
    +'},250);})()</scr'+'ipt>'
    +'</body></html>';
}

function brdHtmlPochettePortrait(d,xe,date,barcodeSvg,rows,notesRow,specLabel,hasDryIce,tempMention,tempMentionEn,tRange,tc,tBoxBorder,tBoxBg,isDgr,labMm,sizeOk,expAddrLine,destAddr,stCfg,dmHtml){
  var isSpecDiamond=stCfg&&stCfg.shape==='diamond';
  var _hgt=d.isHG&&!!d.destLabelText;
  var dpts=d.depts||d.departements||[];
  var DLIST=[{id:'BIOCHIMIE',lbl:'Biochimie'},{id:'HEMATOLOGIE',lbl:'H&#233;mato.&#160;/ BDS'},{id:'MICROBIOLOGIE',lbl:'Micro.&#160;/ S&#233;ro.'},{id:'PATHOLOGIE',lbl:'Patho.&#160;/ Cyto.'}];
  var deptsGrid='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 5mm;align-items:center;flex:1;min-width:0">';
  DLIST.forEach(function(dep){var on=dpts.indexOf(dep.id)!==-1;var bk=on?'background:#1C3A52;color:white;border-color:#1C3A52;':'';deptsGrid+='<div style="display:flex;align-items:center;gap:2mm"><div style="display:inline-flex;align-items:center;justify-content:center;width:7mm;height:7mm;border:2px solid #333;border-radius:.5mm;flex-shrink:0;font-size:10pt;font-weight:900;'+bk+'">'+(on?'&#x2713;':'')+'</div><span style="font-size:11pt;font-family:Arial,Helvetica,sans-serif">'+dep.lbl+'</span></div>';});
  deptsGrid+='</div>';
  var tLen=tempMention.length;var tFs=tLen<=12?'30pt':tLen<=20?'24pt':tLen<=32?'18pt':'14pt';
  var tempBox='<div style="flex-shrink:0;width:100%;border:'+tBoxBorder+';'+(tBoxBg?'background:'+tBoxBg+';':'')+'padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;margin-top:3mm"><div style="font-size:'+tFs+';font-weight:900;color:'+tc+';line-height:1.25">'+xe(tempMention)+'</div>'+((!hasDryIce)&&tRange?'<div style="font-size:10pt;color:'+tc+';margin-top:1.5mm;opacity:.75">'+xe(tRange)+'</div>':'')+'</div>';
  var canutecHtml=isDgr?'<div style="flex-shrink:0;width:100%;padding:1.5mm 2mm;background:#FFF8E1;border:1px solid #F5C518;border-radius:1mm;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;margin-top:3mm;box-sizing:border-box"><div style="display:flex;align-items:center;gap:2mm"><span style="font-weight:700">'+xe(state.CFG.bordereau.canutecLabel||'Urgences 24h')+'&#160;:</span><span style="font-weight:900;font-size:9pt;color:#B8860B">'+xe(state.CFG.bordereau.canutec)+'</span></div>'+'</div>':'';
  var rightCol;
  if(!isDgr&&stCfg){var sc='#555';var st1=stCfg.line1||stCfg.label||'';var st1w=st1.split(' ');var st1is3=st1w.length>=3;var maxWL=st1is3?Math.max.apply(null,st1w.map(function(w){return w.length;})):0;var specFs=st1is3?(maxWL<=10?'26pt':'18pt'):(st1.length<=14?'18pt':st1.length<=22?'14pt':'11pt');var specInner=st1is3?st1w.map(function(w){return'<div>'+xe(w)+'</div>';}).join(''):xe(st1);var exemptBox='<div style="flex:1;width:100%;border:3px solid '+sc+';padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box"><div style="font-size:'+specFs+';font-weight:900;color:'+sc+';line-height:1.3">'+specInner+'</div>'+(stCfg.subtitle?'<div style="font-size:9pt;color:#777;margin-top:1.5mm;font-style:italic">'+xe(stCfg.subtitle)+'</div>':'')+'</div>';rightCol=exemptBox+tempBox;}
  else{var pictoWrap='<div id="pp-picto-fill" style="flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden">'+specLabel+'</div>';rightCol=pictoWrap+tempBox+canutecHtml;}
  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter portrait;margin:6mm}'
    +'html,body{height:100%;width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column}'
    +'.etq{flex:0 0 '+(isSpecDiamond?'74':'66')+'%;display:flex;flex-direction:row;min-height:0;overflow:hidden}'
    +'.col-l{flex:1;display:flex;flex-direction:column;padding:4mm;border-right:1px solid #ccc;min-width:0;overflow:hidden}'
    +'.dest{flex:2;display:flex;flex-direction:column;min-height:0;overflow:hidden}'
    +'.exp{flex-shrink:0;padding-top:2.5mm;border-top:.5px solid #ddd;margin-top:2.5mm}'
    +'.depts{flex:1;min-height:0;display:flex;align-items:center;gap:3.5mm;padding-top:2.5mm;border-top:1.5px solid #bbb;margin-top:2.5mm}'
    +'.col-r{width:'+(isSpecDiamond?'92':'72')+'mm;flex:none;display:flex;flex-direction:column;align-items:center;padding:3mm 4mm;overflow:hidden}'
    +'.fold{flex-shrink:0;height:0;border-top:2px dashed #777;position:relative}'
    +'.flbl{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:white;padding:0 3mm;font-size:7pt;color:#999;white-space:nowrap}'
    +'.bord{flex:1;display:flex;gap:5mm;align-items:flex-start;padding:4mm;overflow:hidden}'
    +'.bord-bc svg{display:block;max-height:38mm}'
    +'table{border-collapse:collapse;width:100%}'
    +'th{text-align:left;font-weight:600;color:#555;padding:1px 6px 1px 0;width:90px;vertical-align:top;font-size:8pt}'
    +'td{padding:1px 0;border-bottom:.3px solid #eee;font-size:9pt}'
    +_brdPrint
    +'</style></head><body>'
    +'<div class="etq">'
      +'<div class="col-l">'
        +'<div class="dest">'
          +'<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1.5mm">Destinataire</div>'
          +'<div id="pp-dname" style="font-size:22pt;font-weight:900;text-transform:uppercase;line-height:1.15;color:#1C3A52;font-family:Arial,Helvetica,sans-serif">'+fmtDestLabel(d.dest,xe)+'</div>'
          +'<div id="pp-daddr" style="font-size:14pt;line-height:1.5;color:#222;font-family:Arial,Helvetica,sans-serif;margin-top:2mm">'+destAddr+'</div>'
        +'</div>'
        +'<div class="exp" style="display:flex;align-items:center;gap:3mm">'
          +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:.5mm">Exp&#233;diteur</div>'
            +'<div style="font-size:10pt;font-weight:700;color:#333;font-family:Arial,Helvetica,sans-serif">'+xe(d.exp)+'</div>'
            +(expAddrLine?'<div style="font-size:8.5pt;color:#666;font-family:Arial,Helvetica,sans-serif;margin-top:.3mm">'+expAddrLine+'</div>':'')
          +'</div>'
          +dmHtml
        +'</div>'
        +(_hgt
          ?'<div class="depts" style="justify-content:center;align-items:stretch;padding:2mm 2mm 5mm 2mm"><div id="pp-hg-box" style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 4mm"><div id="pp-hg-txt" style="font-weight:900;color:#1C3A52;text-align:center;white-space:nowrap;line-height:1.3;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div></div>'
          :d.isHG?''
          :'<div class="depts"><div style="display:flex;align-items:center;gap:2.5mm;flex-shrink:0;align-self:center"><div style="width:10mm;height:10mm;border:3px solid #1C3A52;border-radius:1mm;flex-shrink:0"></div><span style="font-size:16pt;font-weight:900;color:#1C3A52;font-family:Arial,Helvetica,sans-serif;white-space:nowrap">Analyses STAT</span></div><div style="width:.5px;align-self:stretch;background:#ccc;flex-shrink:0"></div>'+deptsGrid+'</div>'
        )
      +'</div>'
      +'<div class="col-r">'+rightCol+'</div>'
    +'</div>'
    +'<div class="fold"><span class="flbl">'+xe(state.CFG.bordereau.pli)+'</span></div>'
    +'<div class="bord"><div class="bord-bc">'+barcodeSvg+'</div><div style="flex:1;min-width:0;overflow:hidden"><table><tbody>'+rows+notesRow+'</tbody></table></div></div>'
    +'<script>(function(){setTimeout(function(){'
    +'var dn=document.getElementById("pp-dname"),da=document.getElementById("pp-daddr"),dc=dn&&dn.closest(".dest");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.88;for(var ns=22;ns>=8;ns--){var as=Math.max(7,Math.round(ns*0.64));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    +'},50);'
    +'setTimeout(function(){'
    +'var pf=document.getElementById("pp-picto-fill");'
    +'if(pf){var r=pf.getBoundingClientRect();var ph=r.height,pw=r.width;'
    +'var sqSvgs=Array.prototype.filter.call(pf.querySelectorAll("svg"),function(sv){var vb=(sv.getAttribute("viewBox")||"").split(" ");return Math.abs((+vb[2])-(+vb[3]))<10;});'
    +'if(sqSvgs.length>0){var n=sqSvgs.length;var sz=Math.floor(Math.min(ph,pw/n));if(sz>20)sqSvgs.forEach(function(sv){sv.style.width=sz+"px";sv.style.height=sz+"px";});}}'
    +'},150);'
    +'setTimeout(function(){'
    +'var hb=document.getElementById("pp-hg-box"),ht=document.getElementById("pp-hg-txt");'
    +'if(hb&&ht){'
    +'  ht.style.fontSize="1pt";'
    +'  var r=hb.getBoundingClientRect();'
    +'  var hh=r.height,hw=r.width;'
    +'  if(!(hh>10&&hw>10)){'
    +'    var _mm=Math.min(window.innerWidth,window.innerHeight)/216;'
    +'    hh=Math.min(window.innerWidth,window.innerHeight)*0.66*0.4-6*_mm;'
    +'    hw=Math.max(window.innerWidth,window.innerHeight)-72*_mm-16*_mm;'
    +'  }'
    +'  if(hh>10&&hw>10){for(var s=120;s>=6;s--){ht.style.fontSize=s+"pt";if(ht.scrollHeight<=hh*0.85&&ht.scrollWidth<=hw*0.88)break;}}'
    +'}'
    +'},250);})()</scr'+'ipt>'
    +'</body></html>';
}

function brdHtmlGrille(d,xe,date,barcodeSvg,rows,notesRow,specLabel,hasDryIce,tempMention,tempMentionEn,tRange,tc,tBoxBorder,tBoxBg,isDgr,labMm,sizeOk,expAddrLine,destAddr,isSpecDiamond,dmHtml){
  var _hgt=d.isHG&&!!d.destLabelText;
  var _hgBox='<div id="hg-dept-box" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:4mm"><div id="hg-dept-txt" style="font-weight:900;color:#1C3A52;text-align:center;word-break:normal;line-height:1.3;hyphens:none;overflow-wrap:normal;max-width:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'+xe(d.destLabelText||'').replace(/\n/g,'<br>')+'</div></div>';
  var _hgScript=_hgt?'<script>(function(){var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");if(!b||!t)return;function f(){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}setTimeout(f,50);})();<\/script>':'';
  var dpts=d.depts||d.departements||[];
  var DLIST=[{id:'BIOCHIMIE',lbl:'Biochimie'},{id:'HEMATOLOGIE',lbl:'H&#233;matologie / BDS'},{id:'MICROBIOLOGIE',lbl:'Microbiologie / S&#233;ro'},{id:'PATHOLOGIE',lbl:'Pathologie / Cyto'}];
  var tLen=tempMention.length;var tFs=tLen<=12?'32pt':tLen<=20?'26pt':tLen<=30?'20pt':'15pt';if(hasDryIce)tFs=tLen<=24?'30pt':tLen<=36?'23pt':'19pt';
  var rtCell='<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:2mm;font-family:Arial,Helvetica,sans-serif;padding:4mm 4mm 0 4mm">D&#233;partements</div>';
  rtCell+='<div style="padding:0 4mm;font-family:Arial,Helvetica,sans-serif"><div style="display:flex;align-items:center;gap:2.5mm;margin-bottom:3mm"><div style="width:9mm;height:9mm;border:2.5px solid #1C3A52;border-radius:.5mm;flex-shrink:0"></div><span style="font-size:18pt;font-weight:900;color:#1C3A52">Analyses STAT</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2mm 2mm">';
  DLIST.forEach(function(dep){var on=dpts.indexOf(dep.id)!==-1;var cs=on?'background:#1C3A52;color:white;border-color:#1C3A52;':'';rtCell+='<div style="display:flex;align-items:center;gap:2mm;min-width:0"><div style="display:inline-flex;align-items:center;justify-content:center;width:8mm;height:8mm;border:2px solid #333;border-radius:.5mm;flex-shrink:0;font-size:11pt;font-weight:900;'+cs+'">'+(on?'&#x2713;':'')+'</div><span style="font-size:12pt;line-height:1.3;flex:1;min-width:0">'+dep.lbl+'</span></div>';});
  rtCell+='</div></div>';
  var deptCell='<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1.5mm;font-family:Arial,Helvetica,sans-serif">Temp&#233;rature</div>';
  deptCell+='<div style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-family:Arial,Helvetica,sans-serif">'+(tBoxBg?'<div style="background:'+tBoxBg+';padding:2.5mm;border-radius:.5mm;border:'+tBoxBorder+'">':'<div>')+'<div style="font-size:'+tFs+';font-weight:900;color:'+tc+';line-height:1.2">'+xe(tempMention)+'</div>'+((!hasDryIce)&&tRange?'<div style="font-size:10pt;color:'+tc+';margin-top:1mm;opacity:.75">'+xe(tRange)+'</div>':'')+'</div></div>';
  if(isDgr)deptCell='<div style="flex-shrink:0;padding:1.5mm 2mm;background:#FFF8E1;border:1px solid #F5C518;border-radius:1mm;font-family:Arial,Helvetica,sans-serif;font-size:6.5pt;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8mm;margin-bottom:2mm"><div style="display:flex;align-items:center;gap:1.5mm"><span style="font-weight:700">'+xe(state.CFG.bordereau.canutecLabel||'Urgences 24h')+'&nbsp;:</span><span style="font-weight:900;color:#B8860B">'+xe(state.CFG.bordereau.canutec)+'</span></div>'+'</div>'+deptCell;
  var warnHtml=((isDgr||hasDryIce)&&labMm<100&&state.CFG.bordereau.warnSize!==false&&(specLabel||hasDryIce))?'<div style="margin-top:auto;padding-top:2mm;font-size:5pt;color:#AA0000;font-style:italic;font-family:Arial,Helvetica,sans-serif;line-height:1.3">&#9888; Pictogrammes &#224; '+labMm+'mm (r&#233;gl. 100mm). Si n&#233;cessaire, apposer les &#233;tiquettes homologu&#233;es 100&#215;100mm sur le colis.</div>':'';
  var pictoContent=specLabel||'';
  return _brdHead(d.numero,xe)
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'@page{size:letter;margin:8mm}'
    +'html,body{height:100%;width:100%}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#111;display:flex;flex-direction:column}'
    +'.etq{height:50%;flex-shrink:0;display:grid;overflow:hidden;'
      +'grid-template-areas:"dest rt" "exp dept" "picto picto";'
      +'grid-template-columns:1fr 1fr;'
      +'grid-template-rows:'+( isSpecDiamond?'minmax(0,2fr) minmax(0,1fr) minmax(0,5fr)':'minmax(0,3fr) minmax(0,1.5fr) minmax(0,2.5fr)')+'}'
    +'.cell-dest{grid-area:dest;padding:4mm 4mm 2mm 5mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-rt{grid-area:rt;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-exp{grid-area:exp;padding:3mm 4mm 2mm 5mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-dept{grid-area:dept;padding:3mm 4mm 2mm 4mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.cell-picto{grid-area:picto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3mm;overflow:hidden}'
    +'.fold{flex-shrink:0;height:0;border-top:2px dashed #777;position:relative}'
    +'.flbl{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:white;padding:0 3mm;font-size:7pt;color:#999;white-space:nowrap}'
    +'.bord{flex:1;padding:7mm 9mm;display:flex;flex-direction:column;overflow:hidden}'
    +'.bh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1C3A52;padding-bottom:2.5mm;margin-bottom:3mm;flex-shrink:0}'
    +'.bt2{font-size:15pt;font-weight:700;color:#1C3A52}.bd{font-size:9pt;color:#666}'
    +'.bc{text-align:center;margin-bottom:2.5mm;flex-shrink:0}.bc svg{max-width:200px}'
    +_brdTable+_brdPrint
    +'</style></head><body>'
    +'<div class="etq">'
      +'<div class="cell-dest">'
        +'<div style="font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1.5mm">Destinataire</div>'
        +'<div id="gc-dname" style="font-size:20pt;font-weight:900;color:#1C3A52;line-height:1.2;margin-bottom:2mm">'+fmtDestLabel(d.dest,xe)+'</div>'
        +'<div id="gc-daddr" style="font-size:13pt;line-height:1.6;color:#333">'+destAddr+'</div>'
      +'</div>'
      +(_hgt?'<div class="cell-rt">'+_hgBox+'</div>':'<div class="cell-rt">'+rtCell+'</div>')
      +'<div class="cell-exp" style="display:flex;align-items:center;gap:3mm">'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#aaa;margin-bottom:1mm">Exp&#233;diteur</div>'
          +'<div style="font-size:10.5pt;font-weight:700;color:#333;line-height:1.25;margin-bottom:1.5mm">'+xe(d.exp)+'</div>'
          +(expAddrLine?'<div style="font-size:8.5pt;line-height:1.55;color:#555">'+expAddrLine+'</div>':'')
          +warnHtml
        +'</div>'
        +dmHtml
      +'</div>'
      +'<div class="cell-dept">'+deptCell+'</div>'
      +'<div class="cell-picto"><div id="gc-picto" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%">'+pictoContent+'</div></div>'
    +'</div>'
    +'<div class="fold"><span class="flbl">'+xe(state.CFG.bordereau.pli)+'</span></div>'
    +'<div class="bord">'
      +'<div class="bh"><div class="bt2">'+xe(state.CFG.bordereau.titre)+'</div><div class="bd">'+xe(date)+'</div></div>'
      +'<div class="bc">'+barcodeSvg+'</div>'
      +'<table><tbody>'+rows+notesRow+'</tbody></table>'
    +'</div>'
    +'<script>(function(){setTimeout(function(){'
    +'var dn=document.getElementById("gc-dname"),da=document.getElementById("gc-daddr"),dc=dn&&dn.closest(".cell-dest");'
    +'if(dn&&da&&dc){var av=dc.clientHeight*0.9;for(var ns=20;ns>=9;ns--){var as=Math.max(7,Math.round(ns*0.65));dn.style.fontSize=ns+"pt";da.style.fontSize=as+"pt";if(dn.scrollHeight+da.scrollHeight<=av)break;}}'
    +'var b=document.getElementById("hg-dept-box"),t=document.getElementById("hg-dept-txt");'
    +'if(b&&t){var h=b.offsetHeight,w=b.offsetWidth;for(var s=72;s>=7;s-=2){t.style.fontSize=s+"pt";if(t.scrollHeight<=h*0.88&&t.scrollWidth<=w*0.88)break;}}'
    +'var gp=document.getElementById("gc-picto"),pc=gp&&gp.closest(".cell-picto");'
    +'if(gp&&pc){var ph=pc.clientHeight,pw=pc.clientWidth;'
    +'var sqSvgs=Array.prototype.filter.call(gp.querySelectorAll("svg"),function(sv){var vb=(sv.getAttribute("viewBox")||"").split(" ");return Math.abs((+vb[2])-(+vb[3]))<10;});'
    +'if(sqSvgs.length>0){var n=sqSvgs.length;var sz=Math.floor(Math.min(ph,pw/n));if(sz>20)sqSvgs.forEach(function(sv){sv.style.width=sz+"px";sv.style.height=sz+"px";});}'
    +'else{var sh=gp.scrollHeight,sw=gp.scrollWidth;if(sh>ph*0.95||sw>pw*0.95){var sc=Math.min(ph*0.95/sh,pw*0.95/sw);gp.style.transform="scale("+sc+")";gp.style.transformOrigin="center center";}}}'
    +'},50);})()</scr'+'ipt>'
    +'</body></html>';
}

