# Sitzplan erstellen

Aus einer Schülerliste eine Sitzordnung für einen Klassenraum erzeugen: Tische stellen,
Regeln setzen, verteilen lassen, drucken. Alles läuft im Browser, es wird nichts
hochgeladen.

## Eingabe

CSV oder Excel (erstes Tabellenblatt), Kopfzeile in der ersten nicht leeren Zeile.
Erkannt werden:

| Feld | Kopfzeilen, die erkannt werden |
| --- | --- |
| Nachname | `Nachname`, `Familienname`, `Last Name`, `Surname` |
| Vorname | `Vorname`, `Rufname`, `First Name` |
| Name in einer Spalte | `Name`, `Schüler` – nur, wenn dort „Nachname, Vorname“ steht |
| Klasse oder Kurs | `Klasse`, `Kurs`, `Lerngruppe`, `Gruppe`, `Zusätzliche Informationen` |
| Geschlecht | `Geschlecht`, `Gender`, `Sex`, `m/w` |

Was nicht erkannt wird, ordnet man unter der Ablagefläche von Hand zu. Nachname und
Vorname sind Pflicht – oder statt beider die Spalte mit dem Gesamtnamen.

In der Geschlechtsspalte gelten `m`, `männlich`, `Junge`, `male`, `j`, `1` als männlich
und `w`, `f`, `weiblich`, `Mädchen`, `female`, `2` als weiblich. Jeder andere Eintrag –
auch `d` – zählt als *Angabe ohne binäre Festlegung*: Es wird dann **nicht** geraten,
und der Schüler bleibt aus den geschlechtsbezogenen Mustern heraus.

## Geschlecht aus dem Vornamen

Fehlt die Spalte oder ist ein Feld leer, schließt `assets/toolhub-geschlecht.js` das
Geschlecht aus dem Vornamen – lokales Wörterbuch mit rund 1500 Namen plus einer
Endungs-Heuristik, keine Online-Abfrage. Schritt 2 zeigt jede Zeile zur Durchsicht:

* **gelb** – nur über die Namensendung erschlossen
* **rot** – der Name wird für beide Geschlechter vergeben (Luca, Kim, Toni …)

Korrekturen werden unter `toolhub-geschlecht` im `localStorage` gemerkt und gelten für
alle Tools des toolhubs. Dieselbe Datei nutzt die WPB-Kurseinteilung.

## Raummodell

Der Raum ist ein Raster aus Feldern, **ein Feld ist ein Sitzplatz**. Ein Tisch belegt
`spalten × reihen` Felder und bringt ebenso viele Plätze mit; Gänge entstehen, indem
Felder frei bleiben. `y = 0` ist die vorderste Reihe, die Tafel steht darüber.

Acht Vorlagen (Frontalreihen 2er/3er, Gruppentische 4er/6er, durchgehende Reihen,
U-Form, doppeltes U, Einzeltische) sind Ausgangspunkte, keine Festlegung: Tische lassen
sich ziehen, drehen, entfernen und hinzufügen.

Nachbarschaft ist zweigeteilt, weil an einem Gruppentisch beides vorkommt:

* **nebeneinander** – gleicher Tisch, gleiche Tischreihe, direkt daneben
* **am selben Tisch** – beliebige zwei Plätze desselben Tisches (auch gegenüber)

## Regeln

Jede Regel ist **weich** (so gut wie möglich) oder **hart** (Vorrang vor allen weichen).
Gesucht wird mit simuliertem Abkühlen: Zwei Plätze tauschen, Kosten vergleichen,
schlechtere Tauschs nur zu Beginn zulassen.

* Ausgangsverteilung: zufällig, alphabetisch, nach Klasse
* Geschlechtermuster: Junge-Mädchen, Junge-Junge-Mädchen-Mädchen, je Tisch ausgewogen,
  gleichgeschlechtliche Tische
* Klassen mischen oder zusammenhalten (nur bei mehreren Klassen in der Liste)
* Paare und Gruppen, die zusammensitzen sollen
* Paare und Gruppen, die auseinander sollen – nicht nebeneinander, nicht am selben
  Tisch oder mit Mindestabstand in Plätzen
* Je Schüler: weit vorne sitzen, nicht in der letzten Reihe, einen freien Platz daneben
* Feste Plätze: ein Klick auf einen Platz heftet den Schüler dort fest

Ein Tausch von Hand (Platz auf Platz ziehen) geht jederzeit; der Bericht unter dem Plan
rechnet sofort nach und markiert die Plätze, an denen es hakt.

Das Muster **Junge-Junge-Mädchen-Mädchen** meint Zweierblöcke entlang einer Sitzbank:
Plätze 1+2 gleich, 3+4 gleich, benachbarte Blöcke verschieden. An einem 2er-Tisch bleibt
davon „beide gleich“ übrig – mehr gibt eine Bank aus zwei Plätzen nicht her.

## Ausgabe

* **Drucken / PDF** – quer auf DIN A4, nur der Plan, immer auf Weiß (auch aus dem
  dunklen Design heraus)
* **Bild (PNG)** – auf ein `<canvas>` gezeichnet, unabhängig vom gewählten Design
* **Sitzplan (JSON)** – Schüler, Raum, Regeln und Sitzordnung; über Schritt 1 wieder
  ladbar. Die Sitzordnung steht darin als Zuordnung Platz → Schüler, damit ein Stand
  auch dann noch passt, wenn die Plätze inzwischen anders gezählt werden.

Der Schalter „aus Sicht der Lehrkraft“ spiegelt den Plan waagerecht – so, wie man von
der Tafel aus in den Raum sieht. Die Beschriftungen bleiben lesbar.

## Beispieldaten

* `beispiele/klasse_7b.csv` – 28 Schüler einer Klasse **ohne** Geschlechtsspalte, um die
  Namenserkennung zu zeigen (darunter „Luca“ als mehrdeutiger Fall)
* `beispiele/kurs_wpb_9.csv` – 20 Schüler aus drei Klassen **mit** Geschlechtsspalte,
  darunter ein `d`-Eintrag

Beide Listen sind erfunden.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `script.js` | Zustand, Oberfläche der Schritte 3 bis 6, Verdrahtung |
| `liste.js` | Datei einlesen, Spalten zuordnen, Geschlecht prüfen (Schritt 1 und 2) |
| `raum.js` | Raummodell, Vorlagen, Geometrie (Nachbarschaft, Sitzbänke) |
| `verteilung.js` | Regeln, Kostenfunktion, Suche, Bericht |
| `export.js` | Drucken, Bild, Speicherstand |
