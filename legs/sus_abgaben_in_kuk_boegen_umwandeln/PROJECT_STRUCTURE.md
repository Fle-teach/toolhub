Serienbrief-Generator
├── 📄 index.html                    # Hauptdatei - in Browser öffnen
├── 🎨 styles.css                    # CSS Styling
├── 📜 app.js                        # Hauptanwendungs-Logik
├── 📜 csv-parser.js                 # CSV-Parser
├── 📜 docx-handler.js               # DOCX-Verarbeitung & Feldersetzung
│
├── 🚀 server.py                     # Python-Server (Option 1)
├── 🚀 server.js                     # Node.js-Server (Option 2)
├── 📦 package.json                  # Node.js Konfiguration
│
├── 📖 README.md                     # Vollständige Dokumentation
├── 📖 GETTING_STARTED.md           # Anleitung zum Starten
├── 📖 PROJECT_STRUCTURE.md         # Diese Datei
│
└── 📁 examples/
    ├── 📊 sample-data.csv           # Beispiel-CSV mit Testdaten
    └── 📖 README.md                 # Beispiel-Dokumentation

─────────────────────────────────────────────────────────────

🎯 SCHNELLEINSTIEG:

1. Öffnen Sie index.html im Browser
   ODER
   Starten Sie: python3 server.py

2. Laden Sie ein DOCX-Template mit Serienbrieffeldern ({{Feldname}})
   und eine CSV-Datei mit Datensätzen

3. Generieren Sie die Serienbriefe

4. Laden Sie alle als ZIP herunter

─────────────────────────────────────────────────────────────

📋 DATEIÜBERSICHT:

index.html
─────────
Die Benutzeroberfläche mit:
- Upload-Bereiche für DOCX und CSV
- Einstellungen für Schriftgrößen
- Prozess-Button
- Vorschau und Download-Bereich

styles.css
──────────
Responsive Design mit:
- Gradient-Hintergrund
- Upload-Boxen
- Buttons und Eingabefelder
- Vorschau-Komponenten
- Status-Meldungen

app.js
──────
Koordiniert die Anwendung:
- Event-Listener für Uploads
- Datei-Validierung
- Serienbriefverarbeitung
- Download-Verwaltung
- UI-Updates

csv-parser.js
─────────────
Parst CSV-Dateien:
- Automatische Trennzeichen-Erkennung (,;|Tab)
- Anführungszeichen-Behandlung
- Umwandlung in Array von Objekten

docx-handler.js
────────────────
Manipuliert DOCX-Dateien:
- ZIP-Verarbeitung (DOCX = ZIP + XML)
- XML-Parsing und -Serialisierung
- Feldersetzung ({{name}} → Wert)
- Automatische Schriftgrößen-Berechnung
- Run Properties (w:rPr) Manipulation

─────────────────────────────────────────────────────────────

🔧 EXTERNE BIBLIOTHEKEN (via CDN):

JSZip (3.10.1)
──────────────
- ZIP-Archiv-Verwaltung
- DOCX als ZIP-Datei laden/speichern
- https://cdnjs.cloudflare.com/ajax/libs/jszip/

Mammoth.js (1.4.21)
──────────────────
- DOCX zu HTML Konvertierung (optional für zukünftige Nutzung)
- https://cdnjs.cloudflare.com/ajax/libs/mammoth/

FileSaver.js (2.0.5)
────────────────────
- Browser-Download Funktionalität
- Unterstützt große Dateien
- https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/

─────────────────────────────────────────────────────────────

⚙️ SERVER OPTIONEN:

1. Python Server (python3 server.py)
   - Einfach, keine Abhängigkeiten
   - Automatische Browser-Öffnung
   - Port: 8000
   - Ideal für: Schnelles Testing

2. Node.js Server (node server.js)
   - Benötigt Node.js
   - Automatische Browser-Öffnung
   - Port: 8000
   - Ideal für: Entwicklung

3. http-server (npm i -g http-server && http-server -c-1)
   - Benötigt Node.js + npm
   - Einfach zu verwenden
   - Port: 8080
   - Ideal für: Produktionsumgebung

─────────────────────────────────────────────────────────────

🔄 WORKFLOW:

User Upload
    ↓
File Validation
    ↓
CSV Parsing → Detect Delimiter → Parse Records
    ↓
DOCX Loading → Extract XML → Parse as DOM
    ↓
Field Replacement Loop
    ├─ Find {{fieldname}} patterns
    ├─ Replace with CSV values
    ├─ Calculate font size
    ├─ Apply font size to runs
    └─ Generate new DOCX
    ↓
ZIP all documents
    ↓
Download as Serienbriefe.zip

─────────────────────────────────────────────────────────────

✨ BESONDERE FEATURES:

1. Adaptive Schriftgröße
   - Automatische Berechnung basierend auf Textlänge
   - Minimale und maximale Grenzen
   - Erhaltung der Seitenzahl

2. Automatische Delimiter-Erkennung
   - Erkennt Komma, Semikolon, Tab, Pipe
   - Funktioniert mit verschiedenen Regionen

3. Anführungszeichen-Behandlung
   - Doppelte Anführungszeichen als Escape
   - Korrekte Feldtrennung in komplexen Fällen

4. Batch-Processing
   - Mehrere Datensätze gleichzeitig
   - Progress-Anzeige
   - ZIP-Download aller Dokumente

5. Vorschau
   - Preview der ersten Datensätze
   - Text-Ausgabe vor Download

─────────────────────────────────────────────────────────────

🚨 KNOWN LIMITATIONS:

- Grafiken/Bilder: Können durch Formatierungsänderungen beeinträchtigt werden
- Formularfelder: Nur {{...}} Syntax wird unterstützt
- Große Dateien: >50 MB können langsam sein
- Kopf-/Fußzeilen: Nicht automatisch ersetzt
- Komplexe Layouts: Können verschoben werden

─────────────────────────────────────────────────────────────

📚 WEITERE DOKUMENTATION:

- README.md: Vollständige Dokumentation und FAQs
- GETTING_STARTED.md: Schritt-für-Schritt Anleitung
- examples/README.md: Beispiele und Templates

─────────────────────────────────────────────────────────────

Zuletzt aktualisiert: November 2025
Version: 1.0.0
