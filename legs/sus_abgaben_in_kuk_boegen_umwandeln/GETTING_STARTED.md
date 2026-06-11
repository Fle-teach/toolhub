# 🚀 Serienbrief-Generator starten

Die Anwendung ist eine reine Client-Side HTML/JavaScript/CSS Anwendung. Sie können sie auf verschiedene Arten starten:

## Option 1: Direktes Öffnen (einfachste Methode) ⭐

1. Navigieren Sie zum Projektordner
2. Doppelklicken Sie auf `index.html`
3. Die Anwendung öffnet sich im Standard-Browser

**Hinweis**: Beim direkten Öffnen funktionieren externe Bibliotheken über CDN. Die erste Verwendung lädt diese herunter.

---

## Option 2: Mit Python Server (empfohlen für beste Kompatibilität)

### Schritt 1: Terminal öffnen
- **macOS/Linux**: Terminal öffnen
- **Windows**: PowerShell oder CMD öffnen

### Schritt 2: Zum Projektordner navigieren
```bash
cd "/Users/samuel/Desktop/Schule/GOA/Digitalisierung & Automatisierung von Arbeitsabläufen/LEG-JS-Verarbeitung 2"
```

### Schritt 3: Server starten
```bash
python3 server.py
```

**Erwartete Ausgabe**:
```
🚀 Serienbrief-Generator Server
📁 Verzeichnis: /...

✓ Server läuft auf http://localhost:8000
✓ Drücken Sie STRG+C zum Beenden
✓ Browser wird geöffnet...
```

4. Browser öffnet sich automatisch auf `http://localhost:8000`
5. Zum Beenden: `STRG+C` im Terminal drücken

---

## Option 3: Mit Node.js Server

### Schritt 1: Node.js installieren (falls noch nicht vorhanden)
```bash
# macOS: Über Homebrew
brew install node

# Oder von https://nodejs.org/ herunterladen
```

### Schritt 2: Zum Projektordner navigieren
```bash
cd "/Users/samuel/Desktop/Schule/GOA/Digitalisierung & Automatisierung von Arbeitsabläufen/LEG-JS-Verarbeitung 2"
```

### Schritt 3: Server starten
```bash
node server.js
```

4. Browser öffnet sich automatisch auf `http://localhost:8000`
5. Zum Beenden: `STRG+C` im Terminal drücken

---

## Option 4: Mit http-server (Node.js Paket)

### Schritt 1: http-server installieren
```bash
npm install -g http-server
```

### Schritt 2: Zum Projektordner navigieren
```bash
cd "/Users/samuel/Desktop/Schule/GOA/Digitalisierung & Automatisierung von Arbeitsabläufen/LEG-JS-Verarbeitung 2"
```

### Schritt 3: Server starten
```bash
http-server -c-1
```

4. Öffnen Sie `http://localhost:8080` im Browser
5. Zum Beenden: `STRG+C` im Terminal drücken

---

## Option 5: Mit Live Server (VS Code Extension)

Falls Sie VS Code verwenden:

### Schritt 1: Extension installieren
- VS Code öffnen
- Extensions (Strg+Shift+X)
- "Live Server" suchen
- "Go Live" Extension installieren

### Schritt 2: index.html öffnen
- `index.html` im Editor öffnen
- Rechtsklick → "Open with Live Server"
- Server startet automatisch

---

## Troubleshooting

### ❌ "Port 8000 ist bereits in Verwendung"

**Lösung 1**: Anderen Server beenden
```bash
# macOS/Linux: Prozess auf Port 8000 finden und beenden
lsof -ti:8000 | xargs kill -9
```

**Lösung 2**: Anderen Port verwenden (Python)
```bash
python3 -m http.server 9000
# Dann öffnen: http://localhost:9000
```

### ❌ "python3: Befehl nicht gefunden"

**Lösung**: Python installieren
```bash
# macOS: Über Homebrew
brew install python3

# Oder von https://www.python.org/downloads/ herunterladen
```

### ❌ DOCX/CSV werden nicht hochgeladen

1. **Browser-Cache leeren**: Strg+Shift+Del
2. **Browser neu starten**
3. **JavaScript-Fehler prüfen**: F12 → Console-Tab
4. **Mit anderem Browser testen**: Chrome, Firefox, Safari

### ❌ Externe Bibliotheken laden nicht

**Ursache**: Keine Internetverbindung beim ersten Start  
**Lösung**: 
1. Mit Internet verbinden
2. F5 im Browser drücken (Seite neu laden)
3. Warten Sie 1-2 Minuten beim Laden

---

## Browser-Zugriff

Nach dem Start ist die Anwendung erreichbar unter:

| Methode | URL |
|---------|-----|
| Python Server | http://localhost:8000 |
| Node Server | http://localhost:8000 |
| http-server | http://localhost:8080 |
| Live Server | http://localhost:5500 |
| Direktes Öffnen | file:///... |

---

## Tipps

- 💡 **Empfehlung**: Python Server (Option 2) ist am einfachsten
- 💡 **Offline**: Die Anwendung arbeitet nach dem ersten Start auch offline
- 💡 **Persistenz**: Speichern Sie heruntergeladene Serienbriefe lokal
- 💡 **Mehrere Projekte**: Sie können mehrere Instanzen auf unterschiedlichen Ports starten

---

**Fertig!** 🎉 Die Anwendung sollte jetzt im Browser laufen.

Haben Sie Fragen? Siehe `README.md` für detaillierte Dokumentation.
