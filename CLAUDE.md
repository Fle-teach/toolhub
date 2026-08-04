# toolhub – Konventionen

Sammlung eigenständiger, rein statischer Web-Tools für den Schulalltag. Kein Build-Schritt,
kein Paketmanager, keine Server-Logik: Jedes Tool ist eine HTML-Seite, die im Browser läuft
und Dateien ausschließlich lokal verarbeitet.

## Verzeichnisaufbau

```
index.html                 Startseite (leeres Gerüst, Kacheln kommen aus assets/tools.js)
styles.css                 nur für die Startseite
assets/                    gemeinsame Stile, Skripte und Daten
assets/vendor/             Fremdbibliotheken (lokal abgelegt, kein CDN)
<kategorie>/<tool>/        ein Ordner je Tool
```

Der Kategorie-Ordner entspricht einer Kachel auf der Startseite. Ordnernamen in
`kleinbuchstaben_mit_unterstrich`.

## Ein neues Tool eintragen

Es genügt der Eintrag in `assets/tools.js` – die Startseite wird daraus erzeugt und
bleibt unverändert:

```js
{ name: 'Fehlzeiten nach Fächern auswerten', ordner: 'fehlzeiten_nach_faechern_auswerten' }
```

Ein Eintrag ohne `ordner` gilt als geplant und erscheint ausgegraut statt als toter Link.
Neue Kategorie? Zusätzlich ein Icon in `TOOLHUB_ICONS` und eine Farbklasse `.cat-<id>`
in `toolhub.css` anlegen.

## Ein Tool in mehreren Kategorien zeigen

Statt ein Tool zu kopieren, bekommt der Eintrag `ziel` (Pfad ab dem Wurzelverzeichnis)
anstelle von `ordner`. Mit `?kategorie=<id>` übernimmt die Zielseite Farbe, Icon und
Bezeichnung der aufrufenden Kategorie:

```js
{ name: 'Lernfördervereinbarungen erstellen',
  ziel: 'allgemein/serienbrief/index.html?kategorie=foerderkoordination' }
```

Die Farbe (Klasse `.cat-<id>` am `<body>`) setzt `toolhub.js` selbst. Icon und Bezeichnung
greifen, wenn die Zielseite zusätzlich `assets/tools.js` einbindet und ihre Platzhalter
markiert:

```html
<span data-icon="raster" data-kategorie-icon class="panel-icon"></span>
<h1>✉️ <span data-kategorie-titel>Serienbrief</span></h1>
```

`data-kategorie-titel` wird durch den `name` des Eintrags ersetzt (auch im `<title>`) – der
Name steht damit weiterhin nur in `tools.js`. Fehlen die Markierungen oder `tools.js`,
bleibt es beim eigenen Icon bzw. Titel; die Farbe wirkt trotzdem.

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
| `assets/toolhub.css` | Grunddesign, Kategoriefarben, `.panel`, `.section`, `.stats`, Meldungen, Buttons, Upload, Tabellen |
| `assets/toolhub.js` | Theme, Kopfzeile (Zurück-Link + Umschalter), `toolhubUpload()` (Datei-Auswahl inkl. Drag-and-drop) |
| `assets/tools.js` | Verzeichnis aller Kategorien und Tools, Icon-Vorrat, Kacheln der Startseite |
| `assets/toolhub-io.js` | Dateien lesen, Kodierung erkennen, CSV lesen/schreiben, Downloads, Meldungen, `toolhubEscapeHtml()` |
| `assets/toolhub-xlsx.js` | Arbeitsmappen lesen und schreiben, Spaltenbreiten, Blattnamen |
| `assets/toolhub-vorlagen.js` | Serienbrief-Vorlagen (DOCX/ODT): Felder `{{…}}` sowie Word- und Writer-Seriendruckfelder auswerten |
| `assets/toolhub-kurse.js` | Fachkürzel-Tabelle und Normalisierung von Fach- und Kursbezeichnungen |
| `assets/vendor/` | PapaParse, SheetJS (`xlsx`), vis-network, JSZip |
| `assets/fonts/` | Open Sans (woff2); die `@font-face`-Regeln stehen in `toolhub.css` |

Fremdbibliotheken und Schriften werden **lokal** abgelegt, nie aus einem CDN oder von Google
Fonts geladen – die Tools müssen ohne Internetzugang funktionieren. Eine Tool-Seite bindet
deshalb weder `fonts.googleapis.com` noch sonst einen fremden Host ein.

Wird eine Funktion in einem zweiten Tool gebraucht, wandert sie nach `assets/`, statt kopiert zu
werden.

## Gestaltung

Farben, Abstände und Komponenten kommen aus `toolhub.css`. Ein Tool setzt keine Farbe
selbst, sondern nur seine Kategorie-Klasse am `<body>` (Name = Kategorie-Ordner):

```html
<body class="cat-klassenzusammensetzung">
```

Die Klasse setzt `--accent` und `--accent-text`; dieselbe Klasse trägt die Kachel auf der
Startseite, damit Hub und Tool nicht auseinanderlaufen. Definiert sind die Farben
ausschließlich in `toolhub.css`. Eigene Farbwerte in Tool-CSS nur, wenn sie fachlich nötig
sind (z. B. Legendenfarben) – ansonsten `var(--accent)`, `var(--text-muted)`, `var(--ok)` usw.

Zurück-Link und Theme-Umschalter erzeugt `toolhub.js` selbst – kein Markup dafür in der
Tool-Seite. Der Zurück-Link erscheint, sobald der `<body>` eine `cat-*`-Klasse trägt;
ein abweichendes Ziel geht über `<body data-zurueck="…">`.

Mehrfach verwendete Icons stehen in `assets/tools.js` (`TOOLHUB_ICONS`) und werden im
Markup als Platzhalter eingesetzt – nur für Motive, die auch anderswo vorkommen:

```html
<span data-icon="knoten" class="panel-icon"></span>
```

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
