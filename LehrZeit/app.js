const DEFAULT_CATEGORIES = [
  "Unterrichtsvorbereitung",
  "Unterrichtsnachbereitung",
  "Systembetreuung",
  "Elternarbeit",
  "AK-Tätigkeiten",
  "Konferenzen / Besprechungen",
  "Verwaltung",
  "Schulentwicklung",
  "Fortbildung",
  "Sonstiges"
];

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "lehrzeit_entries_v1";
const CATEGORY_KEY = "lehrzeit_categories_v1";
let mode = "times";
let editingId = null;
let deferredPrompt = null;

function loadEntries(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []}catch{return []} }
function saveEntries(v){ localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) }
function loadCustomCategories(){ try{return JSON.parse(localStorage.getItem(CATEGORY_KEY)) || []}catch{return []} }
function saveCustomCategories(v){ localStorage.setItem(CATEGORY_KEY, JSON.stringify(v)) }
function allCategories(){
  const custom = loadCustomCategories().filter(c =>
    c &&
    !DEFAULT_CATEGORIES.includes(c) &&
    c !== "Sonstiges"
  );
  const defaultsWithoutOther = DEFAULT_CATEGORIES.filter(c => c !== "Sonstiges");
  return [...defaultsWithoutOther, ...custom, "Sonstiges"];
}

function formatDuration(mins){
  mins = Math.max(0, Number(mins)||0);
  const h = Math.floor(mins/60), m = mins%60;
  return `${h}:${String(m).padStart(2,"0")} h`;
}
function todayISO(){
  const d = new Date(); const z = new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
}
function minutesBetween(start,end){
  if(!start||!end) return 0;
  const [sh,sm]=start.split(":").map(Number), [eh,em]=end.split(":").map(Number);
  let diff=(eh*60+em)-(sh*60+sm);
  if(diff<0) diff += 24*60;
  return diff;
}
function isSameDay(dateStr,d){ return dateStr===localISO(d) }
function localISO(d){ const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10) }
function startOfWeek(d){
  const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;
}
function renderCategoryOptions(){
  const cats=allCategories();
  $("category").innerHTML=cats.map(c=>`<option>${escapeHtml(c)}</option>`).join("");
  $("filterCategory").innerHTML=`<option value="">Alle Kategorien</option>`+cats.map(c=>`<option>${escapeHtml(c)}</option>`).join("");
  $("customCategories").innerHTML=loadCustomCategories().map(c=>`<span class="chip">${escapeHtml(c)}</span>`).join("");
}
function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])) }
function render(){
  renderCategoryOptions();
  const entries=loadEntries().sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt));
  renderEntryList($("entryList"), entries.slice(0,8));
  const filter=$("filterCategory").value;
  renderEntryList($("allEntryList"), filter?entries.filter(e=>e.category===filter):entries);
  renderStats(entries);
}
function renderEntryList(container, entries){
  container.innerHTML="";
  if(!entries.length){ container.innerHTML=`<div class="empty">Noch keine Einträge vorhanden.</div>`; return; }
  const tpl=$("entryTemplate");
  for(const e of entries){
    const node=tpl.content.cloneNode(true);
    node.querySelector(".entry-category").textContent=e.category;
    node.querySelector(".entry-duration").textContent=formatDuration(e.duration);
    node.querySelector(".entry-meta").textContent=`${new Date(e.date+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"})}${e.startTime&&e.endTime?` · ${e.startTime}–${e.endTime}`:""}`;
    node.querySelector(".entry-note").textContent=e.note||"";
    node.querySelector(".edit").onclick=()=>startEdit(e.id);
    node.querySelector(".duplicate").onclick=()=>duplicateEntry(e.id);
    node.querySelector(".delete").onclick=()=>deleteEntry(e.id);
    container.appendChild(node);
  }
}
function renderStats(entries){
  const now=new Date(), weekStart=startOfWeek(now), monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const sum=arr=>arr.reduce((a,b)=>a+Number(b.duration||0),0);
  const today=entries.filter(e=>isSameDay(e.date,now));
  const week=entries.filter(e=>new Date(e.date+"T12:00:00")>=weekStart);
  const month=entries.filter(e=>new Date(e.date+"T12:00:00")>=monthStart);
  $("sumToday").textContent=formatDuration(sum(today));
  $("sumWeek").textContent=formatDuration(sum(week));
  $("sumMonth").textContent=formatDuration(sum(month));
  $("sumAll").textContent=formatDuration(sum(entries));
  $("todayTotal").textContent=`${formatDuration(sum(today))} heute`; $("heroTodayTotal").textContent=formatDuration(sum(today));
}
function getFormEntry(){
  const date=$("date").value, category=$("category").value, note=$("note").value.trim();
  if(!date) throw new Error("Bitte ein Datum auswählen.");
  let duration=0, startTime="", endTime="";
  if(mode==="times"){
    startTime=$("startTime").value; endTime=$("endTime").value;
    if(!startTime||!endTime) throw new Error("Bitte Beginn und Ende eingeben.");
    duration=minutesBetween(startTime,endTime);
  } else {
    duration=Number($("durationMinutes").value);
    if(!duration||duration<1) throw new Error("Bitte eine gültige Dauer eingeben.");
  }
  return {date,category,note,duration,startTime,endTime};
}
function saveForm(){
  try{
    const data=getFormEntry(); const entries=loadEntries();
    if(editingId){
      const i=entries.findIndex(e=>e.id===editingId);
      entries[i]={...entries[i],...data,updatedAt:new Date().toISOString()};
    }else{
      entries.push({id:crypto.randomUUID(),...data,createdAt:new Date().toISOString()});
    }
    saveEntries(entries); resetForm(); render();
  }catch(err){ alert(err.message) }
}
function resetForm(){
  editingId=null; $("date").value=todayISO(); $("note").value=""; $("durationMinutes").value="";
  $("startTime").value=""; $("endTime").value=""; document.querySelectorAll(".quick-btn").forEach(b=>b.classList.remove("selected")); $("saveBtn").innerHTML='<span class="btn-icon">＋</span> Eintrag speichern';
  $("cancelEditBtn").classList.add("hidden");
}
function startEdit(id){
  const e=loadEntries().find(x=>x.id===id); if(!e)return;
  editingId=id; $("date").value=e.date; $("category").value=e.category; $("note").value=e.note||"";
  if(e.startTime&&e.endTime){
    setMode("times"); $("startTime").value=e.startTime; $("endTime").value=e.endTime;
  }else{
    setMode("duration"); $("durationMinutes").value=e.duration;
  }
  $("saveBtn").textContent="Änderungen speichern"; $("cancelEditBtn").classList.remove("hidden");
  switchTab("entry"); window.scrollTo({top:0,behavior:"smooth"});
}
function duplicateEntry(id){
  const entries=loadEntries(); const e=entries.find(x=>x.id===id); if(!e)return;
  const copy={...e,id:crypto.randomUUID(),date:todayISO(),createdAt:new Date().toISOString(),note:e.note||""};
  entries.push(copy); saveEntries(entries); render(); startEdit(copy.id);
}
function deleteEntry(id){
  if(!confirm("Diesen Eintrag wirklich löschen?")) return;
  saveEntries(loadEntries().filter(e=>e.id!==id)); render();
}
function setMode(m){
  mode=m;
  $("modeTimes").classList.toggle("active",m==="times");
  $("modeDuration").classList.toggle("active",m==="duration");
  $("timeFields").classList.toggle("hidden",m!=="times");
  $("durationFields").classList.toggle("hidden",m!=="duration");
}
function switchTab(name){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  $(`tab-${name}`).classList.add("active");
  document.querySelector(`.nav-item[data-tab="${name}"]`).classList.add("active");
  if(name==="overview") render();
}
function download(name,content,type){
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function exportJson(){
  const payload={version:1,exportedAt:new Date().toISOString(),entries:loadEntries(),customCategories:loadCustomCategories()};
  download(`lehrzeit-backup-${todayISO()}.json`,JSON.stringify(payload,null,2),"application/json");
}
function exportCsv(){
  const rows=[["Datum","Kategorie","Beginn","Ende","Dauer_Minuten","Notiz"]];
  loadEntries().forEach(e=>rows.push([e.date,e.category,e.startTime||"",e.endTime||"",e.duration,e.note||""]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  download(`lehrzeit-${todayISO()}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");
}
async function importJson(file){
  try{
    const payload=JSON.parse(await file.text());
    if(!Array.isArray(payload.entries)) throw new Error();
    if(!confirm(`Backup mit ${payload.entries.length} Einträgen importieren und aktuelle Daten ersetzen?`)) return;
    saveEntries(payload.entries);
    saveCustomCategories(Array.isArray(payload.customCategories)?payload.customCategories:[]);
    render();
  }catch{ alert("Die Datei ist kein gültiges LehrZeit-Backup.") }
}

document.addEventListener("DOMContentLoaded",()=>{
  // Migration/Cleanup: remove duplicate default categories from previously saved custom categories.
  const cleanedCustomCategories = loadCustomCategories().filter((c, i, arr) =>
    c &&
    !DEFAULT_CATEGORIES.includes(c) &&
    c !== "Sonstiges" &&
    arr.indexOf(c) === i
  );
  saveCustomCategories(cleanedCustomCategories);

  $("date").value=todayISO(); renderCategoryOptions(); render();
  $("saveBtn").onclick=saveForm; $("cancelEditBtn").onclick=resetForm;
  $("modeTimes").onclick=()=>setMode("times"); $("modeDuration").onclick=()=>setMode("duration");
  document.querySelectorAll(".quick-btn").forEach(btn=>{
    btn.onclick=()=>{
      setMode("duration");
      $("durationMinutes").value=btn.dataset.minutes;
      document.querySelectorAll(".quick-btn").forEach(b=>b.classList.remove("selected"));
      btn.classList.add("selected");
    };
  });
  $("durationMinutes").addEventListener("input", ()=>{
    const value = $("durationMinutes").value;
    document.querySelectorAll(".quick-btn").forEach(b=>b.classList.toggle("selected", b.dataset.minutes===value));
  });
  document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  $("filterCategory").onchange=render;
  $("exportJsonBtn").onclick=exportJson; $("exportCsvBtn").onclick=exportCsv;
  $("importJsonInput").onchange=e=>e.target.files[0]&&importJson(e.target.files[0]);
  $("addCategoryBtn").onclick=()=>{
    const val=$("newCategory").value.trim(); if(!val)return;
    const cats=loadCustomCategories();
    if(!DEFAULT_CATEGORIES.includes(val) && val !== "Sonstiges" && !cats.includes(val)){
      cats.push(val);
      saveCustomCategories(cats);
    }
    $("newCategory").value=""; render();
  };
  $("clearDataBtn").onclick=()=>{
    if(confirm("Wirklich alle Arbeitszeitdaten auf diesem Gerät löschen?")){ saveEntries([]); render(); }
  };

  if("serviceWorker" in navigator){ navigator.serviceWorker.register("./sw.js"); }
  window.addEventListener("beforeinstallprompt",(e)=>{
    e.preventDefault(); deferredPrompt=e; $("installBtn").classList.remove("hidden");
  });
  $("installBtn").onclick=async()=>{
    if(!deferredPrompt)return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $("installBtn").classList.add("hidden");
  };
});
