const urlInput = document.querySelector("#url");
const sourceBadge = document.querySelector("#sourceBadge");
const sourceHint = document.querySelector("#sourceHint");
const outputDir = document.querySelector("#outputDir");
const converterOutputDir = document.querySelector("#converterOutputDir");
const quality = document.querySelector("#quality");
const qualityLabel = document.querySelector("#qualityLabel");
const filename = document.querySelector("#filename");
const startTime = document.querySelector("#startTime");
const endTime = document.querySelector("#endTime");
const download = document.querySelector("#download");
const convert = document.querySelector("#convert");
const chooseFolder = document.querySelector("#chooseFolder");
const converterChooseFolder = document.querySelector("#converterChooseFolder");
const chooseFiles = document.querySelector("#chooseFiles");
const converterFiles = document.querySelector("#converterFiles");
const bitrate = document.querySelector("#bitrate");
const clear = document.querySelector("#clear");
const log = document.querySelector("#log");
const dependencyNote = document.querySelector("#dependencyNote");
const outputButtons = [...document.querySelectorAll("[data-output]")];
const toolTabs = [...document.querySelectorAll("[data-tool]")];
const serverMode = window.location.protocol !== "file:";
let outputType = "video";
let selectedFiles = [];
let loadedState = null;

function detectSource(value) {
  try {
    const host = new URL(value.trim()).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "YouTube";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
  } catch (_) { /* incomplete URL */ }
  return null;
}

function updateSource() {
  const source = detectSource(urlInput.value);
  if (source) {
    sourceBadge.textContent = `${source} erkannt`;
    sourceBadge.className = "source-badge detected";
    sourceHint.textContent = `${source} wird automatisch verarbeitet. Öffentliche Inhalte funktionieren am zuverlässigsten.`;
  } else if (urlInput.value.trim()) {
    sourceBadge.textContent = "Quelle prüfen";
    sourceBadge.className = "source-badge warning";
    sourceHint.textContent = "Bitte eine öffentliche YouTube- oder Instagram-URL verwenden.";
  } else {
    sourceBadge.textContent = "URL einfügen";
    sourceBadge.className = "source-badge";
    sourceHint.textContent = "Unterstützt öffentliche YouTube-Videos und Instagram-Beiträge bzw. Reels.";
  }
}

function appendLog(lines) {
  if (!lines?.length) return;
  if (log.textContent.trim() === "Bereit.") log.textContent = "";
  log.textContent += `${lines.join("\n")}\n`;
  log.scrollTop = log.scrollHeight;
}

function populateQualities() {
  if (!loadedState || quality.options.length) return;
  Object.entries(loadedState.qualities).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    quality.append(option);
  });
}

function setOutput(type) {
  outputType = type;
  outputButtons.forEach((button) => button.classList.toggle("active", button.dataset.output === type));
  qualityLabel.childNodes[0].nodeValue = type === "video" ? "Qualität" : "Audioqualität";
}

function setTool(tool) {
  toolTabs.forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  document.querySelector("#downloaderPanel").classList.toggle("active", tool === "download");
  document.querySelector("#converterPanel").classList.toggle("active", tool === "convert");
  if (tool === "convert") {
    sourceBadge.textContent = "Audio-Dateien";
    sourceBadge.className = "source-badge detected";
  } else {
    updateSource();
  }
}

function renderFiles() {
  if (!selectedFiles.length) {
    converterFiles.textContent = "Noch keine Dateien ausgewählt.";
    converterFiles.classList.remove("has-files");
    return;
  }
  converterFiles.classList.add("has-files");
  converterFiles.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = `${selectedFiles.length} Datei(en) ausgewählt`;
  const list = document.createElement("ul");
  selectedFiles.forEach((path) => {
    const item = document.createElement("li");
    item.textContent = path.split(/[\\/]/).pop();
    list.append(item);
  });
  converterFiles.append(title, list);
}

function renderDependencies(dependencies) {
  const missing = [];
  if (!dependencies.ytDlp) missing.push("yt-dlp");
  if (!dependencies.ffmpeg) missing.push("FFmpeg");
  if (!dependencies.node) missing.push("Node.js (für aktuelle YouTube-Prüfungen)");
  if (!missing.length) return;
  dependencyNote.classList.remove("hidden");
  dependencyNote.textContent = `Hinweis: ${missing.join(", ")} fehlt. Bitte die App erneut über die Startdatei ausführen bzw. Node.js 22 oder neuer installieren.`;
}

async function stateTick() {
  if (!serverMode) {
    appendLog(["Bitte die Medienwerkstatt über die Startdatei öffnen. Nur dann laufen Download, Umwandlung und Ordnerauswahl lokal."]);
    download.disabled = true;
    convert.disabled = true;
    return;
  }
  try {
    const response = await fetch("/api/state");
    const state = await response.json();
    loadedState = state;
    populateQualities();
    if (!outputDir.value) outputDir.value = state.defaultOutputDir;
    if (!converterOutputDir.value) converterOutputDir.value = state.defaultOutputDir;
    renderDependencies(state.dependencies);
    download.disabled = state.running;
    convert.disabled = state.running;
    download.innerHTML = state.running ? "Verarbeitung läuft …" : '<span class="btn-icon">↓</span> Download starten';
    convert.innerHTML = state.running ? "Verarbeitung läuft …" : '<span class="btn-icon">♫</span> In MP3 konvertieren';
    appendLog(state.messages);
  } catch (error) {
    appendLog([`Verbindung zur lokalen App fehlgeschlagen: ${error.message}`]);
  }
}

async function selectFolder(target) {
  const response = await fetch("/api/choose-folder", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initialDir: target.value }),
  });
  const result = await response.json();
  if (result.ok && result.path) target.value = result.path;
  if (!result.ok) appendLog([`Fehler: ${result.error || "Ordner konnte nicht ausgewählt werden."}`]);
}

urlInput.addEventListener("input", updateSource);
outputButtons.forEach((button) => button.addEventListener("click", () => setOutput(button.dataset.output)));
toolTabs.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));

download.addEventListener("click", async () => {
  if (!serverMode) return;
  const response = await fetch("/api/download", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: urlInput.value, outputType, quality: quality.value, filename: filename.value, startTime: startTime.value, endTime: endTime.value, outputDir: outputDir.value }),
  });
  const result = await response.json();
  if (!result.ok) appendLog([`Fehler: ${result.error || "Download konnte nicht gestartet werden."}`]);
  else appendLog([`${result.source} erkannt – Download läuft.`]);
  await stateTick();
});

chooseFiles.addEventListener("click", async () => {
  if (!serverMode) return;
  const response = await fetch("/api/choose-files", { method: "POST" });
  const result = await response.json();
  if (!result.ok) {
    appendLog([`Fehler: ${result.error || "Dateien konnten nicht ausgewählt werden."}`]);
    return;
  }
  selectedFiles = [...new Set([...selectedFiles, ...(result.paths || [])])];
  renderFiles();
});

convert.addEventListener("click", async () => {
  if (!serverMode) return;
  const response = await fetch("/api/convert", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: selectedFiles, bitrate: bitrate.value, outputDir: converterOutputDir.value }),
  });
  const result = await response.json();
  if (!result.ok) appendLog([`Fehler: ${result.error || "Konvertierung konnte nicht gestartet werden."}`]);
  else appendLog(["Konvertierung läuft."]);
  await stateTick();
});

chooseFolder.addEventListener("click", () => serverMode && selectFolder(outputDir));
converterChooseFolder.addEventListener("click", () => serverMode && selectFolder(converterOutputDir));
clear.addEventListener("click", async () => {
  if (serverMode) await fetch("/api/clear", { method: "POST" });
  log.textContent = "Bereit.";
});

setOutput("video");
setTool("download");
renderFiles();
stateTick();
setInterval(stateTick, 800);
