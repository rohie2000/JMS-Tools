import QrScanner from './vendor/qr-scanner.min.js';
import { checkTeacherPassword } from './teacher-access.js?v=2';
let teacherUnlocked = false;
import { mergeCollection, readDeletedIds } from './collection.js?v=2';
const $ = id => document.getElementById(id);
const STORAGE = 'jms-qr-cards-v1';
let deletedIds = [], lastDeleted = null;
const collectionData = () => ({version:1, cards, deletedIds});
let published = [], cards = [], selected = null, mode = 'saved', currentText = '', scanner, qrPayload = '', qrName = '', utterance, readRun = 0;
const say = message => { $('status').textContent = message; };
const getStored = key => { try { return localStorage.getItem(key); } catch { return null; } };
function setStored(key, value) { try { localStorage.setItem(key, value); return true; } catch { say('Dieser Browser kann nicht dauerhaft speichern. Bitte exportiere deine Sammlung vor dem Schließen.'); return false; } }
function validate(data) {
  if (data?.version !== 1 || !Array.isArray(data.cards) || data.cards.length > 5000) throw Error('Bitte eine gültige Sammlung des QR-Vorlesers auswählen.');
  const ids = new Set();
  return data.cards.map(c => {
    if (!c || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(c.id) || ids.has(c.id) || typeof c.title !== 'string' || !c.title.trim() || c.title.length > 150 || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 30000 || typeof c.category !== 'string' || c.category.length > 100) throw Error('Die Sammlung enthält ungültige oder doppelte Karten. Es wurde nichts übernommen.');
    ids.add(c.id); return {id:c.id,title:c.title,category:c.category,text:c.text};
  });
}
function persist() { const ok = setStored(STORAGE, JSON.stringify(collectionData())); listCards(); return ok; }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
function stopSpeech() { readRun++; if ('speechSynthesis' in window) speechSynthesis.cancel(); document.querySelectorAll('.paragraph.active').forEach(p=>p.classList.remove('active')); }
function speak(text, all = false) {
  stopSpeech();
  if (!('speechSynthesis' in window)) { say('Diese Browser-Version unterstützt keine Sprachausgabe. Bitte Safari auf dem iPad verwenden.'); return; }
  const run = readRun;
  // Short utterances avoid long-text interruptions. Paragraphs remain individually selectable.
  const parts = text.split(/\n\s*\n/).filter(p=>p.trim());
  const queue = [];
  parts.forEach((p,i) => {
    const chunks = p.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [p];
    chunks.forEach(sentence => {
      const words = sentence.split(/\s+/); let chunk = '';
      words.forEach(word => { if (chunk.length + word.length > 220 && chunk) { queue.push({text:chunk,index:i}); chunk=''; } chunk += `${word} `; });
      if(chunk.trim()) queue.push({text:chunk,index:i});
    });
  });
  const next = () => {
    if (run !== readRun) return;
    const item = queue.shift();
    document.querySelectorAll('.paragraph.active').forEach(p=>p.classList.remove('active'));
    if (!item) { say('Fertig vorgelesen. Du kannst den Text noch einmal hören.'); return; }
    if(all) $('reading-text').children[item.index]?.classList.add('active');
    utterance = new SpeechSynthesisUtterance(item.text); utterance.lang='de-DE'; utterance.rate=Number($('rate').value);
    const voices = speechSynthesis.getVoices(); const voice = voices.find(v=>v.lang==='de-DE' && v.localService) || voices.find(v=>v.lang.startsWith('de'));
    if(voice) utterance.voice=voice;
    utterance.onend=next;
    utterance.onerror=e=> { if(run===readRun && e.error!=='canceled' && e.error!=='interrupted') { say('Tippe auf „Jetzt anhören“, um die Sprachausgabe zu starten. Prüfe bei Bedarf die Lautstärke.'); document.querySelectorAll('.paragraph.active').forEach(p=>p.classList.remove('active')); } };
    speechSynthesis.speak(utterance);
  };
  next();
}
function showText(card, auto=false) {
  stopSpeech(); currentText=card.text;
  $('read-title').textContent=card.title || 'Dein QR-Text'; $('card-category').textContent=card.category || 'Dein Hörtext';
  $('reading-text').replaceChildren();
  card.text.split(/\n\s*\n/).filter(p=>p.trim()).forEach((text,i)=> {
    const section=document.createElement('div'); section.className='paragraph';
    const p=document.createElement('p'); p.textContent=text;
    const button=document.createElement('button'); button.textContent=`▶ Abschnitt ${i+1} anhören`; button.onclick=()=>speak(text);
    section.append(p,button); $('reading-text').append(section);
  });
  $('speak').disabled=false;
  $('student').classList.add('has-card'); document.querySelector('.reader').hidden=false;
  ['section-view','reader-settings'].forEach(id=>$(id).hidden=true);
  ['toggle-sections','toggle-settings'].forEach(id=>$(id).setAttribute('aria-expanded','false'));
  $('read-title').focus({preventScroll:true}); window.scrollTo(0,0);
  if(auto && $('auto-speak').checked) speak(currentText,true);
}
async function resolveCode(raw, auto=true) {
  if(!raw?.trim()) return;
  let cardId=null, text=null;
  try {
    const u=new URL(raw);
    const own=new URL(location.href); const expected=new URL('./',own).pathname;
    if(u.origin!==own.origin || u.pathname!==expected && u.pathname!==`${expected}index.html`) { say('Dieser QR-Code enthält einen anderen Internetlink. Für das Vorlesen bitte einen Lernwerkstatt-Code oder einen Text-Code verwenden.'); return; }
    const p=new URLSearchParams(u.hash.slice(1)); cardId=p.get('karte'); text=p.get('text');
    if(!cardId && text===null) { say('Der Link enthält keinen Lernwerkstatt-Text.'); return; }
  } catch { text=raw; }
  if(cardId) {
    try {
      const response=await fetch('cards.json',{cache:'no-store'});
      if(!response.ok) throw Error(); published=validate(await response.json());
    } catch { say('Die veröffentlichte Sammlung konnte nicht geladen werden. Prüfe die Internetverbindung und versuche es erneut.'); return; }
    const card=published.find(c=>c.id===cardId);
    if(!card) { say('Dieser Text ist noch nicht veröffentlicht oder wurde entfernt. Bitte die Lehrkraft fragen.'); return; }
    showText(card,auto); say('');
  } else if(text?.trim()) {
    if(text.length>30000) { say('Dieser Text ist zu lang. Bitte die Lehrkraft fragen.'); return; }
    showText({title:'Dein QR-Text',text},auto); say('');
  }
}
function route() {
  stopSpeech(); scanner?.stop(); $('stop-camera').hidden=true; $('camera-placeholder').hidden=false;
  const teacher=location.hash==='#lehrkraft';
  if(!teacher) teacherUnlocked=false;
  $('teacher').hidden=!teacher || !teacherUnlocked;
  $('teacher-login').hidden=!teacher || teacherUnlocked;
  $('student').hidden=teacher; $('status').textContent='';
  $('teacher-password').value=''; $('login-error').textContent='';
  $('teacher-password').type='password'; $('show-password').textContent='Anzeigen'; $('show-password').setAttribute('aria-pressed','false');
  if(teacher && !teacherUnlocked) $('teacher-password').focus({preventScroll:true});
  if(!teacher && location.hash) resolveCode(location.href,false);
  else if(!teacher) { $('student').classList.remove('has-card'); document.querySelector('.reader').hidden=true; }
}
$('teacher-login-form').onsubmit=async event=> {
  event.preventDefault();
  const password=$('teacher-password').value;
  $('teacher-password').value=''; $('login-error').textContent=''; $('teacher-unlock').disabled=true;
  try {
    const valid=await checkTeacherPassword(password);
    if(location.hash!=='#lehrkraft')return;
    if(!valid){$('login-error').textContent='Das Kennwort stimmt nicht. Bitte versuche es erneut.';$('teacher-password').focus();return;}
    teacherUnlocked=true;route();$('new-card').focus({preventScroll:true});window.scrollTo(0,0);
  }catch{$('login-error').textContent='Die Kennwortprüfung ist nicht verfügbar. Bitte die App über ihre HTTPS-Adresse oder die lokale Vorschau öffnen.';}
  finally{$('teacher-unlock').disabled=false;}
};
$('show-password').onclick=()=> {
  const show=$('teacher-password').type==='password';
  $('teacher-password').type=show?'text':'password';$('show-password').textContent=show?'Verbergen':'Anzeigen';$('show-password').setAttribute('aria-pressed',String(show));
};
$('teacher-lock').onclick=()=>{stopSpeech();teacherUnlocked=false;route();window.scrollTo(0,0);};
window.addEventListener('pagehide',()=>{teacherUnlocked=false;});
window.addEventListener('pageshow',event=>{if(event.persisted)route();});
$('scan').onclick=async()=> {
  stopSpeech();
  try {
    scanner ||= new QrScanner($('video'),result=> { scanner.stop(); $('stop-camera').hidden=true; $('camera-placeholder').hidden=false; resolveCode(result.data); },{preferredCamera:'environment',returnDetailedScanResult:true,maxScansPerSecond:5});
    await scanner.start(); $('camera-placeholder').hidden=true; $('stop-camera').hidden=false; say('Halte den QR-Code ruhig in das Kamerabild.');
  } catch { say('Die Kamera ist nicht erreichbar. Bitte Safari öffnen, den Kamerazugriff erlauben und eine HTTPS-Adresse verwenden. Alternativ ein QR-Bild auswählen.'); }
};
$('stop-camera').onclick=()=>{scanner?.stop(); $('stop-camera').hidden=true; $('camera-placeholder').hidden=false;};
$('scan-file').onchange=async e=> { const file=e.target.files[0]; if(!file)return; scanner?.stop(); try { const result=await QrScanner.scanImage(file,{returnDetailedScanResult:true}); await resolveCode(result.data); } catch { say('In diesem Bild wurde kein lesbarer QR-Code gefunden. Bitte ein schärferes Bild auswählen.'); } e.target.value=''; };
[['toggle-sections','section-view'],['toggle-settings','reader-settings']].forEach(([button,panel])=> {
  $(button).onclick=()=> {const open=$(panel).hidden;$(panel).hidden=!open;$(button).setAttribute('aria-expanded',String(open));if(open)$(panel).scrollIntoView({block:'start',behavior:'smooth'});};
});
$('next-code').onclick=()=> {
  stopSpeech(); $('student').classList.remove('has-card'); document.querySelector('.reader').hidden=true;
  $('status').textContent='';
  // Clear the old card address so reloading returns to the scanner.
  history.replaceState(null,'',location.pathname+location.search);
  $('scan').focus({preventScroll:true});window.scrollTo(0,0);
};
$('speak').onclick=()=>speak(currentText,true); $('stop-speech').onclick=()=>{stopSpeech();say('Vorlesen gestoppt.');};
$('rate').oninput=()=>{$('rate-value').textContent=`${Number($('rate').value).toLocaleString('de-DE')} ×`;};
function listCards() {
  const query=$('search').value.toLocaleLowerCase('de'); $('card-list').replaceChildren();
  cards.filter(c=>`${c.title} ${c.category}`.toLocaleLowerCase('de').includes(query)).forEach(card=> {
    const b=document.createElement('button'); b.className=`card-item${card.id===selected?' selected':''}`;
    const title=document.createElement('strong'); title.textContent=card.title;
    const sub=document.createElement('small');
    const live=published.find(c=>c.id===card.id);
    sub.textContent=`${card.category || 'Ohne Fach'} · ${live && JSON.stringify(live)===JSON.stringify(card)?'Veröffentlicht':'Lokaler Entwurf'}`;
    b.append(title,sub); b.onclick=()=> { if(!discardChanges()) return; edit(card); }; $('card-list').append(b);
  });
  if(!$('card-list').children.length) $('card-list').textContent='Keine passenden Texte gefunden.';
  $('collection-state').textContent=`${cards.length} Texte · Entwürfe gelten nur in diesem Browser. Export regelmäßig als Sicherung speichern.`;
}
let baseline='';
const formState=()=>JSON.stringify([$('title').value,$('category').value,$('body').value]);
function discardChanges(){ return formState()===baseline || confirm('Ungespeicherte Eingaben verwerfen?'); }
function setMode(value) {
  mode=value; $('mode-saved').setAttribute('aria-pressed',value==='saved'); $('mode-quick').setAttribute('aria-pressed',value==='quick');
  $('mode-help').textContent=value==='saved'?'Später änderbar. Der gedruckte QR-Code bleibt gleich.':'Text direkt im QR-Code. Bei Änderungen muss der Code neu gedruckt werden. Maximal 500 Zeichen.';
  $('save').hidden=value==='quick'; $('delete-card').hidden=value==='quick'||!selected; $('body').maxLength=value==='quick'?500:30000; invalidateQR();
}
function edit(card) {
  selected=card?.id||null; setMode('saved');
  $('title').value=card?.title||''; $('category').value=card?.category||''; $('body').value=card?.text||'';
  baseline=formState(); $('save-state').textContent=''; updateCount(); listCards();
}
function invalidateQR(){ $('qr-result').hidden=true; qrPayload=''; }
function updateCount(){ $('char-count').textContent=`${$('body').value.length.toLocaleString('de-DE')} Zeichen`; }
$('mode-saved').onclick=()=>setMode('saved'); $('mode-quick').onclick=()=>setMode('quick');
$('new-card').onclick=()=>{if(discardChanges()){edit(null);$('title').focus();}}; $('search').oninput=listCards;
['title','body','category'].forEach(id=>$(id).addEventListener('input',()=>{updateCount();invalidateQR();$('save-state').textContent='Noch nicht gespeichert.';}));
$('edit-form').onsubmit=e=> {
  e.preventDefault();
  const card={id:selected||crypto.randomUUID(),title:$('title').value.trim(),category:$('category').value.trim(),text:$('body').value.trim()};
  if(!card.title||!card.text){say('Bitte einen Titel und einen Text eingeben.');return;}
  const index=cards.findIndex(c=>c.id===card.id); if(index<0)cards.push(card);else cards[index]=card; selected=card.id;
  $('delete-card').hidden=false;
  const stored=persist(); baseline=formState();
  $('save-state').textContent=stored?'Entwurf in diesem Browser gespeichert. Für Schüler auf anderen Geräten: Sammlung exportieren und auf GitHub veröffentlichen.':'Nur für diese Sitzung gespeichert. Bitte die Sammlung jetzt exportieren.';
  invalidateQR();
};
$('delete-card').onclick=()=> {
  const index=cards.findIndex(card=>card.id===selected);
  if(index<0)return;
  const card=cards[index];
  if(!confirm(`„${card.title}“ aus deiner Sammlung löschen?\n\nUngespeicherte Änderungen an dieser Karte werden verworfen. Bereits gedruckte QR-Codes funktionieren nach dem Veröffentlichen der Löschung nicht mehr. Du kannst das Löschen hier zunächst rückgängig machen.`))return;
  stopSpeech(); lastDeleted={card:{...card},index};
  cards.splice(index,1); deletedIds=[...new Set([...deletedIds,card.id])];
  const stored=persist(); edit(null); $('undo-delete').hidden=false;
  $('save-state').textContent=stored?'Karte lokal gelöscht. Damit sie auch für Schüler entfernt wird, die Sammlung exportieren und veröffentlichen.':'Nur für diese Sitzung gelöscht. Bitte die Sammlung exportieren.';
  say('Karte aus der Sammlung entfernt. Du kannst die Löschung rückgängig machen.');
};
$('undo-delete').onclick=()=> {
  if(!lastDeleted || !discardChanges())return;
  const {card,index}=lastDeleted;
  deletedIds=deletedIds.filter(id=>id!==card.id);
  if(!cards.some(c=>c.id===card.id))cards.splice(Math.min(index,cards.length),0,card);
  persist(); lastDeleted=null; $('undo-delete').hidden=true; edit(card);say('Karte wiederhergestellt.');
};
$('preview').onclick=()=>{if($('body').value.trim())speak($('body').value);else say('Gib zuerst einen Text ein.');};
$('export').onclick=()=>{if(formState()!==baseline && !confirm('Der aktuelle Text ist noch nicht gespeichert und wird nicht mit exportiert. Trotzdem die gespeicherte Sammlung exportieren?'))return;download(new Blob([JSON.stringify(collectionData(),null,2)+'\n'],{type:'application/json'}),'cards.json');say('Sammlung exportiert. Ersetze damit QR-Vorleser/cards.json auf GitHub. Erst nach der Veröffentlichung werden Änderungen auf anderen Geräten sichtbar.');};
$('import').onchange=async e=> {
  const file=e.target.files[0]; if(!file)return;
  try {
    if(file.size>10*1024*1024)throw Error('Diese Datei ist zu groß.');
    const data=JSON.parse(await file.text());
    const imported=validate(data);
    const removed=readDeletedIds(data);
    const importedIds=new Set(imported.map(c=>c.id));
    const missing=published.filter(c=>!importedIds.has(c.id)).map(c=>c.id);
    if(!confirm('Die lokale Sammlung durch diese Datei ersetzen? Ungesicherte Entwürfe werden überschrieben.'))return;
    deletedIds=[...new Set([...removed,...missing])].filter(id=>!importedIds.has(id));
    cards=imported;lastDeleted=null;$('undo-delete').hidden=true;persist();edit(null);say('Sammlung importiert. Bestehende Kartenkennungen wurden übernommen.');
  } catch(error){say(error.message||'Die Datei konnte nicht importiert werden.');} finally {e.target.value='';}
};
const baseDefault=location.hostname==='localhost'||location.hostname==='127.0.0.1'?'https://rohie2000.github.io/JMS-Tools/QR-Vorleser/':new URL('./',location.href).href;
$('base-url').value=getStored('jms-qr-base')||baseDefault;
$('base-url').oninput=invalidateQR;
$('make-qr').onclick=async()=> {
  invalidateQR();
  try {
    const base=new URL($('base-url').value);
    if(base.protocol!=='https:'||base.username||base.password)throw Error('Bitte die vollständige veröffentlichte HTTPS-Adresse eingeben.');
    if(!base.pathname.endsWith('/')&&!base.pathname.endsWith('/index.html'))throw Error('Die App-Adresse muss mit / oder /index.html enden.');
    base.hash='';base.search='';
    const params=new URLSearchParams();
    if(mode==='saved') {
      if(!selected || formState()!==baseline)throw Error('Bitte den Text zuerst als Entwurf speichern.');
      params.set('karte',selected); qrName=cards.find(c=>c.id===selected).title;
      $('qr-note').textContent='Feste Kartenadresse. Vor dem Einsatz die Sammlung veröffentlichen. Der Text kann später bei gleicher Kennung geändert werden.';
    } else {
      const text=$('body').value.trim();if(!text)throw Error('Bitte zuerst einen Text eingeben.');if(text.length>500)throw Error('Für schnelle QR-Codes bitte höchstens 500 Zeichen verwenden. Längere Texte als gespeicherten Text anlegen.');
      params.set('text',text);qrName=$('title').value.trim()||'Mein Hörtext';
      $('qr-note').textContent='Der Text ist direkt im QR-Code gespeichert und lässt sich nach dem Ausdruck nicht ändern.';
    }
    base.hash=params.toString();
    await QRCode.toCanvas($('qr-canvas'),base.href,{width:600,margin:4,errorCorrectionLevel:'M'});
    qrPayload=base.href;setStored('jms-qr-base',$('base-url').value);$('qr-title').textContent=qrName;$('qr-target').href=qrPayload;$('qr-result').hidden=false;
  }catch(error){say(/amount of data|too big|code length/i.test(error.message||'')?'Dieser Text ergibt einen zu dichten QR-Code. Bitte einen gespeicherten Text verwenden.':error.message||'Der QR-Code konnte nicht erstellt werden.');}
};
$('download-qr').onclick=()=>{$('qr-canvas').toBlob(blob=>{if(blob)download(blob,`${qrName.replace(/[^\p{L}\p{N}_-]/gu,'_')}.png`);});};
$('print-qr').onclick=()=>{
  const area=$('print-area');area.replaceChildren();const h=document.createElement('h1');h.textContent=qrName;
  const image=document.createElement('img');image.src=$('qr-canvas').toDataURL();image.alt='QR-Code';
  const p=document.createElement('p');p.textContent='Scannen · Anhören · Loslegen\nLernwerkstatt · Jakob-Muth-Schule';area.append(h,image,p);image.onload=()=>window.print();
};
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',e=>{if(formState()!==baseline){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){scanner?.stop();stopSpeech();$('stop-camera').hidden=true;$('camera-placeholder').hidden=false;}});
async function init() {
  try {const r=await fetch('cards.json',{cache:'no-store'});if(!r.ok)throw Error();published=validate(await r.json());}catch{say('Die veröffentlichte Sammlung konnte nicht geladen werden. Schnelle Text-Codes funktionieren weiterhin.');}
  cards=published.map(c=>({...c}));const stored=getStored(STORAGE);
  if(stored)try{const data=JSON.parse(stored);const drafts=validate(data);deletedIds=readDeletedIds(data);cards=mergeCollection(published,drafts,deletedIds);}catch{say('Die lokale Sicherung ist nicht lesbar. Bitte eine exportierte Sammlung importieren.');}
  edit(null); route();
  $('demo-short').onclick=()=>showText(published.find(c=>c.id==='demo-schraube')||{title:'Die Sechskantschraube',category:'Werken',text:'Nimm die Sechskantschraube. Schraube sie auf der Gewindestange fest.'},true);
  $('demo-card').onclick=()=>{const c=published.find(c=>c.id==='demo-lernwerkstatt');if(c)showText(c);else say('Die Beispielkarte ist nicht in deiner Sammlung enthalten.');};
}
init();

// File controls remain operable without a mouse or touchscreen.
document.querySelectorAll('.file-button').forEach(label=>{label.tabIndex=0;label.setAttribute('role','button');label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();label.querySelector('input').click();}});});
