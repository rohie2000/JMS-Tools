# QR-Vorleser · Lernwerkstatt

Eigenständige, statische Web-App für Safari auf dem iPad. Gestaltung nach den vorhandenen JMS-Tools: Blau `#1269b0`, Lavendel `#ab7bb0`, Hintergrund `#eaeef9`, Systemschrift und große Bedienelemente.

## Starten

Im Projektordner `python3 -m http.server 8765` starten. Dann `http://localhost:8765/QR-Vorleser/` öffnen. Die HTML-Datei nicht direkt per Doppelklick öffnen: Module und Kartensammlung benötigen einen Webserver. Auf dem iPad die veröffentlichte HTTPS-Adresse verwenden. Die lokale Vorschauadresse auf dem Mac ist vom iPad aus nicht erreichbar.

## Schüleransicht

- Rückkamera oder QR-Code aus einer Bilddatei; Kamera nur mit Erlaubnis und über HTTPS (oder localhost).
- Ganze Texte oder einzelne Absätze vorlesen. Leerzeilen trennen Hörabschnitte.
- Deutschsprachige Gerätestimme, Lesetempo, Stopp, Wiederholen.
- Nach einem Scan wird die Sprachausgabe versucht. Safari kann einen zusätzlichen Tipp auf „Vorlesen“ verlangen. Beim Öffnen eines Links über die iPad-Kamera bewusst „Vorlesen“ antippen.
- Internetlinks außerhalb der eigenen App werden weder geöffnet noch als fremde Seiteninhalte vorgelesen. Reine Text-QR-Codes werden unterstützt.
- Kamera und Sprachausgabe werden beim Wechsel in den Hintergrund beendet.
- Zwei Beispieltexte sind enthalten, darunter eine längere Arbeitskarte.

## Persönlicher Lehrkräftebereich

Über „Lehrkräftebereich“ bzw. `#lehrkraft` erreichbar. Der Editor ist durch eine einfache Kennwortabfrage gesperrt. Die Prüfung erfolgt im Browser, ohne serverseitige Anmeldung. Technisch versierte Besucher können diese Sperre umgehen. Die veröffentlichte Sammlung lässt sich damit nicht verändern; Bearbeitungen werden weiterhin nur lokal gespeichert. Keine GitHub-Zugangsdaten werden im Browser gespeichert.

Entwürfe liegen im lokalen Browserspeicher. Dieser kann beim Löschen von Websitedaten verloren gehen. Regelmäßig die Sammlung exportieren. Ein Export enthält alle gespeicherten Texte, nicht ungespeicherte Eingaben im Editor. Ein Import ersetzt nach Rückfrage die lokale Sammlung vollständig.

### Gespeicherte Texte: ein Satz oder eine ganze Arbeitskarte

1. Titel, optional Fach und Text eingeben, dann „Entwurf speichern“.
2. Veröffentlichte App-Adresse prüfen, z. B. `https://rohie2000.github.io/JMS-Tools/QR-Vorleser/`.
3. QR-Code erstellen, als PNG herunterladen oder drucken.
4. Sammlung exportieren. Auf GitHub **`QR-Vorleser/cards.json`** durch den Export ersetzen und veröffentlichen.
5. Die Karte auf einem zweiten Gerät prüfen, bevor sie im Unterricht verwendet wird.

Die Kennung `id` ist dauerhaft und unabhängig von Titel/Text. Änderungen über den bestehenden Eintrag bearbeiten; kein neues Objekt für dieselbe gedruckte Karte anlegen. Den Eintrag nicht entfernen, solange seine QR-Codes verwendet werden. Die App lädt veröffentlichte Karten ohne Browsercache. Bereits angezeigte Texte werden durch erneutes Scannen bzw. erneutes Öffnen aktualisiert.

Nur die öffentlich veröffentlichte Sammlung wird in der Schüleransicht verwendet. Ein nur lokal angelegter Entwurf ist dort absichtlich nicht verfügbar. Die Sammlungsdatei enthält keine personenbezogenen Daten.

### Schneller QR-Code

Text direkt im Code, kein Speichern oder Veröffentlichen der Sammlung nötig. Der Code ist ein App-Link mit Text im URL-Fragment, sodass auch die normale iPad-Kamera ihn öffnen kann. Die App muss bereits veröffentlicht sein. Maximal 500 Zeichen; sehr viele Sonderzeichen können einen zu dichten Code ergeben. In dem Fall einen gespeicherten Text verwenden. Änderungen erfordern einen neuen Ausdruck.

## Über GitHub Pages veröffentlichen

Der ergänzte Workflow `.github/workflows/qr-vorleser-pages.yml` baut ausschließlich diesen Ordner in ein Pages-Artefakt. Der vorhandene Azure-Workflow bleibt unverändert.

1. Änderungen an `QR-Vorleser/` und den neuen Workflow auf GitHub übertragen.
2. Im Repository unter **Settings → Pages → Build and deployment → Source** „GitHub Actions“ wählen.
3. Unter **Actions → QR-Vorleser · GitHub Pages → Run workflow** veröffentlichen. Später starten Änderungen an diesem Ordner auf `main` automatisch eine Veröffentlichung.
4. Erwartete Adresse: `https://rohie2000.github.io/JMS-Tools/QR-Vorleser/`. Maßgeblich ist die tatsächlich von GitHub zurückgegebene Pages-Adresse.

Achtung: Ein Repository hat nur eine GitHub-Pages-Website. Vor dem Aktivieren prüfen, ob bereits eine andere Pages-Veröffentlichung genutzt wird. Der Workflow veröffentlicht nur den QR-Vorleser unter `/QR-Vorleser/`, keine anderen JMS-Tools. Die vorhandene Azure-Veröffentlichung ist davon unabhängig.

## Spätere Mehrbenutzer-Version

Die Oberfläche und das Modell mit festen Kennungen sind getrennt. Später kann die Speicherung durch eine geschützte API ersetzt werden: Anmeldung, Rollen, eigene/gemeinsame Karten, Änderungen veröffentlichen. Die bisherigen `#karte=ID`-Adressen bleiben erhalten, wenn die App-Adresse und Kennungen bestehen bleiben. GitHub Pages allein bietet diese Benutzerverwaltung nicht. Die Backend-Anbindung ist noch nicht implementiert.

## Bibliotheken

Alle Bibliotheken liegen lokal in `vendor/`; im Betrieb keine CDN-Abhängigkeit:
- `qr-scanner` 1.4.2, Nimiq, MIT: https://github.com/nimiq/qr-scanner
- `qrcode` Browser-Build 1.2.2, MIT: https://github.com/soldair/node-qrcode

Die jeweiligen Lizenztexte liegen daneben. Die Dateien sind unveränderte Browserfassungen aus dem npm-CDN. Die Schülertexte werden nicht an diese Anbieter übertragen. Bei GitHub Pages gelten die normalen Hosting-Zugriffe auf GitHub; ob eine Gerätestimme Netzwerkzugriff braucht, hängt von den installierten Stimmen ab.

## Prüfen

Syntax: `node --check QR-Vorleser/app.js`.
Browserprüfung: Beispielkarte mit sechs Hörabschnitten, Öffnen vorhandener Texte im Editor und QR-Erstellung. Auf dem echten iPad zusätzlich prüfen: Kamerafreigabe, Scan eines Ausdrucks, deutsche Stimme, Lautstärke, Vorlesestart nach Scan, längere Arbeitskarte, Drucken/AirPrint.

## Karten löschen

Eine gespeicherte Karte öffnen und „Karte löschen“ wählen. Nach der Rückfrage verschwindet sie aus der lokalen Sammlung. „Löschen rückgängig machen“ stellt die zuletzt gelöschte Karte während derselben Sitzung wieder her. Löschmarkierungen verhindern, dass sie beim Neuladen aus der veröffentlichten Sammlung erneut ergänzt wird. Der Export enthält diese Markierungen. Für Schüler wird eine veröffentlichte Karte erst durch Export und Veröffentlichung der geänderten Sammlung entfernt; ihr gedruckter QR-Code führt dann zu einem Hinweis auf den fehlenden Text. Ein Import einer älteren Sicherung mit der Karte stellt sie wieder her.

## Schüleransicht nach dem Scannen

Kartenlinks und eingelesene QR-Codes öffnen die konzentrierte Vorleseansicht: Kartentitel und großer Play-Button „Jetzt anhören“. Scanner und Start-Einführung sind dort ausgeblendet. Unterhalb führen kleine Bedienelemente zur Arbeitskarte in Hörabschnitten, zu Lesetempo und Einstellungen sowie zum nächsten Scan. Die Abschnitte und Einstellungen sind zunächst zugeklappt. Die bestehenden QR-Adressen bleiben unverändert.

## Einfaches Kennwort für den Lehrkräftebereich

Vor dem Öffnen des Editors erscheint eine Kennwortabfrage, auch beim direkten Aufruf von `#lehrkraft`. Die Freigabe gilt nur für die aktuelle geladene Seite. „Bereich sperren“, der Wechsel zur Schüleransicht und Neuladen sperren den Zugang erneut. Eingaben im Editor bleiben beim Sperren während derselben Sitzung erhalten; zum dauerhaften Sichern vorher speichern oder exportieren.

Das Kennwort wird nicht im Browserspeicher oder als Klartext in den Projektdateien abgelegt. `teacher-access.js` enthält nur seinen SHA-256-Prüfwert. Dieser Schutz ist eine Bedienungssperre und keine echte Authentifizierung; Quelltext und Kartentexte bleiben öffentlich zugänglich. Kein Kennwort verwenden, das auch für andere Dienste genutzt wird.

Kennwort ändern: SHA-256-Prüfwert des neuen App-Kennworts in `teacher-access.js` ersetzen und veröffentlichen. Das ursprünglich eingerichtete Kennwort wurde im Chat mitgeteilt. Die Kennwortprüfung benötigt HTTPS oder localhost.
