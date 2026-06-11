# ⚡ Quick Start Guide - 5 Minuten Anleitung

## 🚀 Installation (30 Sekunden)

### Option A: Sofort starten (empfohlen)
```bash
# Terminal öffnen und folgende Befehle eingeben:
cd "/Users/samuel/Desktop/Schule/GOA/Digitalisierung & Automatisierung von Arbeitsabläufen/LEG-JS-Verarbeitung 2"
python3 server.py
```

### Option B: Oder einfach öffnen
- Öffnen Sie `index.html` per Doppelklick im Finder
- Browser startet automatisch

---

## 📝 Schritt 1: Template erstellen (2-3 Minuten)

### In Word/LibreOffice:
1. Neues Dokument öffnen
2. Folgenden Text eingeben:
```
Sehr geehrter {{Anrede}} {{Nachname}},

vielen Dank für Ihr Interesse. Wir freuen uns, Sie bei {{Unternehmen}} zu unterstützen.

Mit freundlichen Grüßen,
Ihr Team
```

3. Speichern als: `template.docx` (Format: Word 2007-365)

### Feldnamen merken:
- `{{Anrede}}`
- `{{Nachname}}`
- `{{Unternehmen}}`

---

## 📊 Schritt 2: CSV-Datei vorbereiten (1-2 Minuten)

### In Excel/LibreOffice Calc:
1. Neue Tabelle öffnen
2. Header eintippen (erste Zeile):
```
Anrede | Nachname | Unternehmen
```

3. Daten eingeben:
```
Herr    | Müller   | TechCorp GmbH
Frau    | Schmidt  | InnovateTech AG
Herr    | Weber    | BuildSoft Systems
```

4. Speichern als: `daten.csv` (Format: CSV)

**Wichtig**: Header müssen exakt den Feldnamen im Template entsprechen!

---

## ✨ Schritt 3: Serienbriefe generieren (1-2 Minuten)

### Im Browser:
1. **Template hochladen**: `template.docx` auswählen
2. **CSV hochladen**: `daten.csv` auswählen
3. **Generieren klicken**: "Serienbriefe generieren" Button
4. **Herunterladen**: "Alle Serienbriefe herunterladen (ZIP)" klicken

---

## 📥 Schritt 4: Fertig!

Sie erhalten eine ZIP-Datei mit allen Serienbriefen:
- `Serienbrief_1.docx` (für Müller)
- `Serienbrief_2.docx` (für Schmidt)
- `Serienbrief_3.docx` (für Weber)
- ...

Öffnen Sie die Dateien mit Word und überprüfen Sie sie.

---

## ❌ Häufige Fehler

| Problem | Lösung |
|---------|--------|
| "Feldname nicht gefunden" | Header in CSV und {{Feldname}} müssen gleich sein |
| Datei lädt nicht | Überprüfen Sie: Ist es wirklich DOCX/CSV? |
| Server startet nicht | Port 8000 ist belegt - andere Anwendung beenden |
| Schriftgröße stimmt nicht | Erhöhen Sie "Max. Zeichen pro Zeile" in Einstellungen |

---

## 💡 Profi-Tipps

1. **Feldlänge testen**: Verwenden Sie Testdaten ähnlicher Länge wie echte Daten
2. **Mehrere Templates**: Sie können verschiedene Template-Dateien nacheinander verarbeiten
3. **Große Datenmengen**: Testen Sie zuerst mit 5-10 Zeilen
4. **Formatierung erhalten**: Fett, kursiv, Farben bleiben automatisch erhalten
5. **Offline-Modus**: Nach erstem Start auch ohne Internet nutzbar

---

## 📚 Mehr Infos

- Vollständige Dokumentation: **README.md**
- Detaillierte Anleitung: **GETTING_STARTED.md**
- Technische Details: **PROJECT_STRUCTURE.md**
- Beispiele: **examples/README.md**

---

**Fertig! 🎉 Viel Erfolg!**
