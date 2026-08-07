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
<h1><span data-kategorie-titel>Serienbrief</span><span data-icon="brief" class="title-icon"></span></h1>
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
| `assets/toolhub.js` | Theme, Kopfzeile (Zurück-Link + Umschalter), Icon-Vorrat (`TOOLHUB_ICONS`), `toolhubUpload()` (Datei-Auswahl inkl. Drag-and-drop) |
| `assets/tools.js` | Verzeichnis aller Kategorien und Tools, Kacheln der Startseite |
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

## Icons statt Emojis

Die Oberfläche verwendet eigene Icons, keine Emojis: einfarbige Strichzeichnungen auf
`viewBox="0 0 24 24"`, Kontur in `currentColor`, `stroke-width="1.5"`, ohne Füllung. Emojis
sehen je nach Betriebssystem anders aus und passen farblich nicht zum übrigen Design.
Umgestellt sind alle Tools außer den LEG-Bögen.

Damit gleiche Aktionen in allen Tools gleich aussehen:

| Stelle | Motiv |
| --- | --- |
| Herunterladen, Exportieren | `download` &ndash; unabhängig vom Dateiformat |
| Importieren, Hochladen (Button) | `upload` |
| Ablagefläche (`.upload-box`) | nach erwarteter Dateiart: `tabelle` (CSV/XLSX), `dokument` (DOCX/ODT/TXT) |
| Meldungen | `haken` (erledigt), `kreuz` (fehlt), `warnung` |

Ausnahme sind Zeichen, die eine Bedeutung *tragen* statt sie nur zu bebildern: die Emojis,
mit denen der Optimierer Schülerpaare kennzeichnet, ebenso `♂`/`♀` in der WPB-Kurseinteilung,
der Notenstern `★` und typografische Pfeile (`→`, `▸`). Sie bleiben Text.

Mehrfach verwendete Motive stehen in `assets/toolhub.js` (`TOOLHUB_ICONS`) und werden im
Markup als Platzhalter eingesetzt – die Klasse bestimmt die Größe:

```html
<span data-icon="knoten" class="panel-icon"></span>     <!-- großes Wasserzeichen im Panel -->
<span data-icon="brief" class="title-icon"></span>      <!-- angeschrägt hinter der Seitenüberschrift -->
<span data-icon="download" class="inline-icon"></span>  <!-- in Button und Fließtext -->
<span data-icon="tabelle" class="upload-icon"></span>   <!-- über der Ablagefläche -->
```

`title-icon` gehört als letztes Kind in die `<h1>`; es ist absolut positioniert, damit die
Überschrift mittig bleibt. Jede Tool-Seite trägt dort ein Motiv, das den **Gegenstand des
Tools** benennt (Serienbrief → `brief`, Förderlisten kombinieren → `zusammenfuehren`) &ndash;
nicht das Kategorie-Motiv, denn das steht schon als Wasserzeichen im ersten Panel.

Ein Motiv, das nur ein einziges Tool braucht, bleibt als `<svg>` in dessen Seite. Meldungen
bekommen ihr Icon über den vierten Parameter:

```js
toolhubMessage('erzeugenMeldung', 'Fertig.', 'success', 'haken');
```

In Buttons stehen Icon und Beschriftung als Flex-Paar (`.btn-primary`/`.btn-secondary` in
`toolhub.css`). Blendet ein Skript so einen Button ein, muss es `display = 'inline-flex'`
setzen &ndash; `'inline-block'` würde das Flex-Layout und damit den Abstand überschreiben.

## Bewegte Kachel-Motive

Auf der Startseite bewegt sich das Wasserzeichen einer Kachel, sobald der Zeiger darauf
liegt. Die Regeln stehen gesammelt in `styles.css` und gelten nur dort: Jede hängt unter
`.card:hover`, damit dieselben Motive auf den Tool-Seiten (`.panel-icon`) ruhig bleiben.
Alles steckt in `@media (prefers-reduced-motion: no-preference)` &ndash; wer Bewegung
abbestellt hat, sieht den unveränderten Ruhezustand.

Neben der gemeinsamen Grundbewegung kann ein Motiv eine eigene bekommen. Der bewegte Teil
braucht dafür eine Klasse im Icon-String (`TOOLHUB_ICONS` in `toolhub.js`); gehören mehrere
Pfade zusammen, fasst sie ein `<g>`:

```js
'<g class="blatt">' +
  '<path d="M12 6c2-1.5 4.5-2 8-2V18c-3.5 0-6 .5-8 2z"/>' +   // Kontur des Blatts
  '<path d="M14 9.4c1-.3 2-.4 3-.4"/>' +                      // seine Zeilen
  '<path d="M14 12.9c1-.3 2-.4 3-.4"/>' +
'</g>'
```

```css
.cat-iserv_klassenbuch:hover .card-icon .blatt {
  transform-box: view-box;      /* Prozente im viewBox-System, nicht in der Bounding-Box */
  transform-origin: 50% 50%;    /* x = 12: der Buchrücken */
  animation: blaettern 1.1s ease-in-out;
}
```

Was ein bewegtes Teil freigibt, gehört auf eine eigene Ebene darunter. Beim Klassenbuch sind
das die Zeilen der rechten Seite: Sie zeichnen sich ein, während das Blatt sie freigibt &ndash;
von rechts nach links, in der Reihenfolge, in der es sie aufdeckt. Ein `pathLength="1"` am
Pfad macht die Strichrechnung unabhängig von der tatsächlichen Länge:

```css
.cat-iserv_klassenbuch:hover .card-icon .zeile {
  stroke-dasharray: 1;                        /* eine Strichlänge = die ganze Zeile */
  animation: zeile-erscheinen 1.1s ease-in-out;
}
@keyframes zeile-erscheinen {
  from { stroke-dashoffset: -1; }   /* negativ: die Zeile erscheint von ihrem Ende her */
  50%, to { stroke-dashoffset: 0; }
}
```

Vier Punkte, die beim Klassenbuch die Arbeit gemacht haben und bei weiteren Motiven wieder
anfallen:

* Ein zusätzlicher Pfad wird **deckungsgleich** mit einem vorhandenen gezeichnet, dann fällt
  er im Ruhezustand nirgends auf &ndash; auch nicht auf den Tool-Seiten.
* Anfang und Ende der Animation sollten **beide unsichtbar** sein (hier: rechte bzw. linke
  Buchhälfte), sonst springt das Motiv zurück, wenn die Animation ausläuft.
* Ein bewegtes Teil nimmt **mit, was auf ihm steht**. Klappt nur die Kontur des Blatts um und
  seine Zeilen bleiben liegen, wirkt das Blatt durchsichtig statt wie ein Blatt Papier.
* Was es **freigibt, darf nicht leer bleiben**: Die Ebene darunter füllt sich im selben Takt,
  sonst hat die rechte Seite mitten in der Bewegung nichts stehen. Die Zeilen sind fertig,
  sobald das Blatt hochkant steht &ndash; also nach der halben Laufzeit.

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
