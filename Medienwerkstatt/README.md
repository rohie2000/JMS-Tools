# JMS Medienwerkstatt

Die Medienwerkstatt ist ein Modul im Repository **JMS-Tools**. Sie läuft absichtlich als kleine lokale App auf dem jeweiligen Mac oder Windows-Gerät: Nur so können `yt-dlp` und FFmpeg Dateien im gewünschten Ordner speichern und Audio bzw. Video verarbeiten. Die bestehende Azure-Static-Web-App bleibt dabei unverändert; sie kann keinen lokalen Medien-Download ausführen.

Bitte nur Medien verarbeiten, für deren Download, Nutzung und Weitergabe eine Berechtigung besteht. Private oder zugangsgeschützte Inhalte werden nicht unterstützt.

## Start

### Mac

`start_medienwerkstatt.command` per Doppelklick starten. Falls macOS die Datei zunächst blockiert: Rechtsklick → **Öffnen**.

### Windows / Surface

`start_medienwerkstatt_windows.bat` per Doppelklick starten.

Beim ersten Start richtet die App eine eigene lokale Python-Umgebung ein und installiert:

- `yt-dlp[default]`, einschließlich der aktuellen EJS-Komponente für YouTube;
- `imageio-ffmpeg` als FFmpeg-Medienkomponente;
- `curl_cffi` für eine robustere Verbindung zu unterstützten Plattformen.

Für aktuelle YouTube-Prüfungen wird zusätzlich **Node.js 22 oder neuer** benötigt. Installiere es einmalig von <https://nodejs.org/>. Wenn ein Download wegen Änderungen bei YouTube nicht klappt, `yt-dlp_aktualisieren.command` ausführen.

## Verwendung

### Herunterladen

1. Öffentliche YouTube- oder Instagram-URL einfügen. Die Quelle wird direkt erkannt.
2. Video als MP4 oder Ton als MP3/M4A auswählen; bei Video eine Obergrenze bis 1080p, 720p oder 480p festlegen.
3. Bei Bedarf Dateinamen, Zielordner und einen Ausschnitt mit Start-/Endzeit eintragen.
4. **Download starten**. Der Fortschritt und verständliche Hinweise stehen direkt unter dem Formular.

Ohne eingetragenen Dateinamen verwendet die App den Titel des Mediums. Nicht verfügbare Qualitätsstufen werden automatisch durch die beste verfügbare passende Variante ersetzt.

### Konvertieren

1. Den Bereich **Konvertieren** öffnen und eine oder mehrere lokale Mediendateien auswählen.
2. MP3-Qualität und Zielordner festlegen.
3. **In MP3 konvertieren** anklicken.

Unterstützt werden unter anderem M4A, AAC, AIFF, CAF, WAV, FLAC, OGG, WMA, MP4, M4V und Opus. Bereits vorhandene Dateien werden nicht überschrieben; die App hängt bei Bedarf eine fortlaufende Nummer an. DRM-geschützte Dateien, etwa aus Apple Music, können nicht konvertiert werden.

## Erweiterung

Die lokale Backend-Struktur trennt Oberfläche (`web/`) und Medienverarbeitung (`app.py`). Weitere Werkzeuge wie Schneiden, Wiederholen, Lautstärke normalisieren und Komprimieren können daher als weitere Aktionen derselben Medienwerkstatt ergänzt werden.
