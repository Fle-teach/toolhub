# 📄 Serienbrief-Generator

Eine moderne, lokale JavaScript-Webanwendung zur Automatisierung von Serienbriefverarbeitung. Die Anwendung liest DOCX-Templates und CSV-Datensätze ein und generiert individualisierte Serienbriefe mit automatischer Schriftgrößenanpassung.

## Features

✨ **Kernfunktionen:**
- ✅ DOCX-Template-Verarbeitung mit Serienbrieffeldern (`{{Feldname}}`)
- ✅ CSV-Datensätze importieren (automatische Trennzeichen-Erkennung)
- ✅ Adaptive Schriftgröße für längere Textwerte
- ✅ Erhaltung der Seitenzahl des Originaledokuments
- ✅ Vorschau vor Verarbeitung
- ✅ Batch-Download aller Serienbriefe als ZIP
- ✅ Vollständig lokal - keine Serverkommunikation erforderlich
- ✅ Responsive Design für Desktop und Mobile

## Installation & Verwendung

### Voraussetzungen
- Moderner Webbrowser (Chrome, Firefox, Safari, Edge)
- DOCX-Template mit Serienbrieffeldern
- CSV-Datei mit Datensätzen

### Schnelstart

1. **Datei öffnen**: `index.html` im Browser öffnen
2. **Template hochladen**: DOCX-Datei mit Serienbrieffeldern auswählen
3. **Daten hochladen**: CSV-Datei mit Datensätzen auswählen
4. **Einstellungen anpassen** (optional):
   - Basis-Schriftgröße
   - Minimale Schriftgröße
   - Max. Zeichen pro Zeile
5. **Generieren**: "Serienbriefe generieren" klicken
6. **Herunterladen**: "Alle Serienbriefe herunterladen (ZIP)" klicken

## DOCX-Template erstellen

### Serienbrieffelder definieren

Serienbrieffelder werden in **doppelten geschweiften Klammern** geschrieben:

```
Sehr geehrter {{Anrede}} {{Nachname}},

[...]

Ihre {{Titel}}

Freundliche Grüße,
{{Unterschrift}}
```

**Wichtig**: Die Feldnamen (`Anrede`, `Nachname`, etc.) müssen exakt mit den **Spaltennamen in der CSV-Datei** übereinstimmen.

### Schriftformatierung

- Serienbrieffelder können normal formatiert werden (fett, kursiv, etc.)
- Die Anwendung passt die Schriftgröße automatisch an
- Das Originalformat bleibt weitgehend erhalten

## CSV-Datei Format

### Beispiel-CSV

```csv
Anrede,Nachname,Titel,Unterschrift
Herr,Müller,Geschäftsführer,Max Müller
Frau,Schmidt,Direktorin,Dr. Anna Schmidt
Herr,Weber,Projektleiter,Klaus Weber
```

### Anforderungen

- **Erste Zeile** = Spaltennamen (Header)
- **Spaltennamen** müssen den Feldnamen in den Serienbrieffeldern entsprechen
- **Trennzeichen**: Automatische Erkennung (Komma, Semikolon, Tab, Pipe)
- **Anführungszeichen**: Werte in Anführungszeichen werden korrekt verarbeitet
- **UTF-8 Encoding**: Empfohlen für Sonderzeichen

## Einstellungen

### Basis-Schriftgröße (pt)
- **Standard**: 11 pt
- **Bereich**: 6 - 24 pt
- Größe der eingefügten Werte im Normalfall

### Minimale Schriftgröße (pt)
- **Standard**: 7 pt
- **Bereich**: 4 - 20 pt
- Schriftgröße wird nicht kleiner als dieser Wert

### Max. Zeichen pro Zeile
- **Standard**: 40 Zeichen
- **Bereich**: 10 - 100 Zeichen
- Basis für die Berechnung der erforderlichen Schriftgrößenreduktion

## Funktionsweise der Schriftgrößenanpassung

Die Anwendung berechnet die erforderliche Schriftgröße basierend auf:

1. **Textlänge**: Durchschnittliche Zeilenläge des Wertes
2. **Maximale Zeichen pro Zeile**: Zielzeilenläge
3. **Skalierungsfaktor**: `neue_größe = basis_größe × (max_zeichen / durchschnitt_zeichen)`

**Beispiel**:
- Basis-Schriftgröße: 11 pt
- Max. Zeichen pro Zeile: 40
- Eingefügter Text: "Dieser sehr lange Name mit vielen Zeichen" (45 Zeichen)
- Neue Schriftgröße: `11 × (40/45) ≈ 9.8 pt → 10 pt`

Dies gewährleistet, dass der Text in den verfügbaren Platz passt, ohne die Seitenzahl zu ändern.

## Technische Details

### Verwendete Technologien

- **JSZip**: ZIP-Archiv-Verarbeitung (DOCX ist eine ZIP-Datei)
- **DOMParser/XMLSerializer**: XML-Manipulation
- **File API**: Datei-Upload und -Verarbeitung
- **Blob/ArrayBuffer**: Binäre Datenverarbeitung
- **FileSaver.js**: Download-Funktionalität

### Architektur

```
┌─────────────────────────────────────┐
│         index.html (UI)             │
│    (Upload, Settings, Preview)      │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┬──────────┐
    │                     │          │
┌───▼──────────┐ ┌───────▼──────┐  │
│ app.js       │ │ csv-parser.js│  │
│(Koordination)│ │(CSV-Parsing) │  │
└──────────────┘ └──────────────┘  │
                                    │
              ┌─────────────────────▼─────┐
              │   docx-handler.js        │
              │  (DOCX-Manipulation)     │
              │  - ZIP-Verarbeitung      │
              │  - XML-Parsing           │
              │  - Feldersetzung         │
              │  - Schriftgrößen-Calc.   │
              └──────────────────────────┘
```

### DOCX-Struktur

DOCX-Dateien sind ZIP-Archive mit folgender Struktur:
```
document.docx
├── word/
│   └── document.xml       (Hauptinhalt - wird modifiziert)
├── _rels/
├── [Content_Types].xml
└── ...
```

Die Anwendung:
1. Lädt die DOCX-Datei als ZIP
2. Extrahiert `word/document.xml`
3. Parst XML mit DOM Parser
4. Ersetzt Serienbrieffelder durch Werte
5. Passt Schriftgröße an
6. Speichert XML zurück
7. Generiert neue DOCX-Datei

## Browser-Kompatibilität

| Browser | Kompatibilität | Anmerkungen |
|---------|---|---|
| Chrome  | ✅ | Vollständig unterstützt |
| Firefox | ✅ | Vollständig unterstützt |
| Safari  | ✅ | Vollständig unterstützt |
| Edge    | ✅ | Vollständig unterstützt |
| IE 11   | ❌ | Nicht unterstützt |

## Limitierungen & Bekannte Probleme

- **Komplexe Formatierungen**: Grafiken und komplexe Layouts können beeinträchtigt werden
- **Formularfelder**: Standard-Word-Formularfelder werden nicht als Serienbrieffelder erkannt (nur `{{...}}` Syntax)
- **Großdateien**: Bei sehr großen DOCX-Dateien (> 50 MB) kann die Verarbeitung langsam sein
- **Seitenumbrüche**: Erzwungene Seitenumbrüche können verschoben werden, wenn Text länger wird
- **Kopf-/Fußzeilen**: Serienbrieffelder in Kopf-/Fußzeilen werden nicht automatisch ersetzt

## Fehlerbehandlung

Die Anwendung zeigt klare Fehlermeldungen:

| Fehler | Lösung |
|--------|--------|
| "Bitte wählen Sie eine gültige DOCX-Datei" | Nur DOCX-Dateien werden unterstützt |
| "CSV enthält keine Datensätze" | CSV-Datei ist leer oder nur Header |
| "CSV erfolgreich geladen: X Datensätze" | ✓ CSV ist korrekt formatiert |
| "Feldname nicht gefunden" | Feldname in CSV nicht vorhanden oder Tippfehler |

## Beispieldateien

Im `examples/` Ordner finden Sie:
- `template.docx` - Beispiel-Template mit Serienbrieffeldern
- `sample-data.csv` - Beispiel-CSV mit Test-Datensätzen

## Tipps & Best Practices

### CSV-Erstellung
- 📌 Verwenden Sie ein Tabellenkalkulationsprogramm (Excel, LibreOffice Calc)
- 📌 Vermeiden Sie spezielle Zeichen im CSV-Header
- 📌 Testen Sie CSV mit wenigen Zeilen zuerst
- 📌 UTF-8 Encoding verwenden: Datei → Speichern unter → Encoding: UTF-8

### DOCX-Template
- 📌 Verwenden Sie einfache, konsistente Formatierung
- 📌 Testieren Sie Serienbrieffelder vor der Verarbeitung
- 📌 Nutzen Sie Placeholder-Text ähnlicher Länge wie echte Daten
- 📌 Prüfen Sie Schriftgrößen nach dem Test

### Verarbeitung
- 📌 Starten Sie mit kleinen Datenmengen (< 10 Datensätze)
- 📌 Überprüfen Sie die Vorschau vor dem Download
- 📌 Validieren Sie die generierten Dateien

## Häufig gestellte Fragen

**F: Kann ich die Anwendung offline verwenden?**  
A: Ja, nach dem ersten Laden werden externe Bibliotheken gecacht. Sie benötigen nur eine einmalige Internetverbindung.

**F: Wird meine Datei zum Server hochgeladen?**  
A: Nein, alle Verarbeitung findet lokal im Browser statt. Ihre Daten verlassen niemals Ihren Computer.

**F: Wie viele Datensätze kann ich verarbeiten?**  
A: Dies hängt von Browser und Gerät ab. Typisch: 100-1000 Datensätze problemlos, 10000+ möglich aber langsam.

**F: Kann ich Bilder in Serienbriefe einfügen?**  
A: Nein, die Anwendung ersetzt nur Textfelder. Bilder müssen im Template eingebunden werden.

**F: Funktioniert es mit LibreOffice/OpenOffice?**  
A: DOCX wird universal unterstützt. Konvertieren Sie ggf. in DOCX.

## Support & Kontakt

Bei Fragen oder Problemen:
- Überprüfen Sie die Browser-Konsole (F12 → Console)
- Testen Sie mit Beispieldateien
- Validieren Sie CSV-Format

## Lizenz

Diese Anwendung steht zur freien Verwendung zur Verfügung.

---

**Version**: 1.0  
**Zuletzt aktualisiert**: November 2025
