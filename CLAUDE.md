# toolhub – Konventionen

Sammlung eigenständiger, rein statischer Web-Tools für den Schulalltag. Kein Build-Schritt,
kein Paketmanager, keine Server-Logik: Jedes Tool ist eine HTML-Seite, die im Browser läuft
und Dateien ausschließlich lokal verarbeitet.

## Verzeichnisaufbau

```
index.html                 Startseite mit den Kacheln aller Kategorien
assets/                    gemeinsame Stile, Skripte und Daten
assets/vendor/             Fremdbibliotheken (lokal abgelegt, kein CDN)
<kategorie>/<tool>/        ein Ordner je Tool
```

Der Kategorie-Ordner entspricht einer Kachel auf der Startseite. Ordnernamen in
`kleinbuchstaben_mit_unterstrich`.

## Aufbau eines Tools

Verbindlich sind diese Dateinamen:

```
<kategorie>/<tool>/
  index.html      nur Markup + <head>-Einbindungen, kein Inline-JS
  script.js       gesamte Logik des Tools
  styles.css      nur tool-spezifisches CSS (Gemeinsames steht in assets/toolhub.css)
  README.md       optional: Bedienhinweise, Datenformate, Herkunft der Beispieldaten
  beispiele/      optional: Beispiel-Ein- und Ausgabedateien
```

`styles.css` und `script.js` entfallen, wenn ein Tool sie nicht braucht. Größere Teilbereiche
dürfen in weitere Skripte ausgelagert werden (z. B. `docx-handler.js`) – dann bleibt `script.js`
die Einstiegsdatei.

Kein `app.js`, kein Inline-`<script>` mit Tool-Logik, keine Beispieldateien direkt neben dem Code.

## Einbindung im `<head>`

```html
<link rel="stylesheet" href="../../assets/toolhub.css">
<link rel="stylesheet" href="styles.css">
<script src="../../assets/toolhub.js"></script>          <!-- synchron! setzt das Theme -->
<script src="../../assets/vendor/xlsx.full.min.js" defer></script>  <!-- nur wenn gebraucht -->
<script src="../../assets/toolhub-io.js" defer></script>
<script src="script.js" defer></script>
```

`toolhub.js` muss ohne `defer`/`async` geladen werden, damit das Theme vor dem ersten Rendern
steht und nichts aufblitzt.

## Gemeinsame Bausteine zuerst nutzen

Vor eigenen Hilfsfunktionen prüfen, ob es die Aufgabe schon gibt:

| Datei | Inhalt |
| --- | --- |
| `assets/toolhub.css` | Grunddesign, `.panel`, `.section`, `.stats`, Meldungen, Buttons, Upload, Tabellen |
| `assets/toolhub.js` | Theme-Umschaltung, `toolhubUpload()` (Datei-Auswahl inkl. Drag-and-drop) |
| `assets/toolhub-io.js` | Dateien lesen, Kodierung erkennen, CSV lesen/schreiben, Downloads, Meldungen, `toolhubEscapeHtml()` |
| `assets/toolhub-xlsx.js` | Arbeitsmappen lesen und schreiben, Spaltenbreiten, Blattnamen |
| `assets/toolhub-kurse.js` | Fachkürzel-Tabelle und Normalisierung von Fach- und Kursbezeichnungen |
| `assets/vendor/` | PapaParse, SheetJS (`xlsx`), vis-network, JSZip |

Fremdbibliotheken werden **lokal** unter `assets/vendor/` abgelegt, nie aus einem CDN geladen –
die Tools müssen ohne Internetzugang funktionieren.

Wird eine Funktion in einem zweiten Tool gebraucht, wandert sie nach `assets/`, statt kopiert zu
werden.

## Gestaltung

Farben, Abstände und Komponenten kommen aus `toolhub.css`. Ein Tool setzt nur seine
Kategoriefarbe, und zwar über die Kategorie-Klasse am `<body>`:

```html
<body class="cat-klassenzusammensetzung">
```

Die Kategoriefarben stehen ausschließlich in `toolhub.css` (`--cat-*`), damit Startseite und
Tool nicht auseinanderlaufen. Eigene Farbwerte in Tool-CSS nur, wenn sie fachlich nötig sind
(z. B. Legendenfarben) – ansonsten `var(--accent)`, `var(--text-muted)`, `var(--ok)` usw.

Emojis in Buttons und Hinweistexten sind gewollt und bleiben bei Umbauten erhalten.

## Sprache

Oberfläche, Kommentare und Dokumentation auf Deutsch. Bezeichner im Code englisch, gemeinsame
Funktionen mit dem Präfix `toolhub`. Kommentare erklären das *Warum* und fachliche Eigenheiten
(Datenformate, Sonderfälle der Quelldateien), nicht das Offensichtliche.

## Lokal testen

```
python3 -m http.server 8741
```

bzw. die Konfiguration `toolhub-static` aus `.claude/launch.json`. Über einen Server testen und
nicht per `file://`, sonst schlagen `fetch`-Zugriffe auf `assets/` fehl.
