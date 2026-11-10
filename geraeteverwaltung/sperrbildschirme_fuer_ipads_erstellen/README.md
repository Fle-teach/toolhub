# Sperrbildschirme für iPads erstellen

Erzeugt zu einer fortlaufenden Gerätenummer je einen Sperrbildschirm: einfarbiger
Hintergrund, links das Wort **iPad** und rechts die Nummer – beide neben dem Kreis, den
iOS auf geteilten iPads mit dem Benutzerbild darüberlegt –, darunter das Logo der Schule.
Heraus kommt ein ZIP-Archiv mit allen Bildern – als PNG oder SVG.

Auf Wunsch kommen ein **Hinweisschild** für den iPad-Koffer und eine **Ladeanleitung**
dazu, beide in der Farbe der Sperrbildschirme, als PDF (DIN A4 quer oder hochkant) und/oder SVG – siehe
[Hinweisschild und Ladeanleitung](#hinweisschild-und-ladeanleitung).

Es wird nichts hochgeladen: Das Logo wird im Browser gelesen, gerechnet wird ebenfalls
dort. Ohne Internetzugang funktioniert das Tool genauso.

## Einstellungen

| Einstellung | Bedeutung |
| --- | --- |
| Auflösung | `2360 × 1640` (iPads ohne Home-Button), `2160 × 1620` (mit Home-Button) oder eigene Werte |
| Ausrichtung | ordnet die beiden Werte der Auflösung an – Querformat legt die längere Kante waagerecht |
| Farben | Hintergrund und Schrift, je über den Farbwähler oder als Hex-Wert |
| Präfix | steht vor der Nummer; `C ` (mit Leerzeichen) ergibt `C 13`. Ab vier Zeichen rückt die Nummer in eine zweite Zeile |
| Start / Ende | die erste und die letzte Nummer der Reihe (höchstens 500 Bilder) |
| Führende Nullen | füllt jede Nummer auf die Stellenzahl der größten auf (`01` … `15`, aber `001` … `120`) |
| Logo | Schulzeichen (voreingestellt), eigenes Logo oder keines |
| Logofarbe | färbt ein SVG-Logo ein; voreingestellt weiß |
| Dateiformat | PNG (fertiges Pixelbild) oder SVG (skalierbar, zum Weiterbearbeiten) |
| Hintergrundbild | zusätzlich eine Datei ohne Text und Logo, nur die Hintergrundfarbe |

## Logo

Voreingestellt ist das Schulzeichen aus [`assets/goa-logo.svg`](../../assets/goa-logo.svg),
weiß eingefärbt – die üblichen Sperrbildschirme sind damit ohne einen Handgriff fertig.
Daneben lässt sich ein eigenes Logo hochladen (`.svg`, `.png`, `.jpg`, `.webp`) oder die
Fläche freilassen.

Das Logo wird in ein Feld eingepasst, nicht verzerrt: Ein breites Logo wird an seiner
Breite begrenzt, ein hohes an seiner Höhe.

### Einfärben

**Vektorlogos (SVG)** lassen sich auf eine Farbe bringen. Das Tool bettet sie dafür in
den Sperrbildschirm ein, statt sie als eigenes Bild zu verweisen – nur so erreicht die
Farbe sie überhaupt. Gesetzt werden `color` (für `fill="currentColor"` wie im
Schulzeichen) und zwei Regeln, die Füllung und Kontur überschreiben, auch wenn im Logo
feste Farbwerte stehen. Ausgenommen bleibt, was ausdrücklich auf `none` steht: Bei einer
Strichzeichnung ist die Fläche bewusst leer und würde sonst zulaufen.

Ein mehrfarbiges Logo wird dabei auf eine Farbe gebracht – dafür die Option abwählen.
Ohne Einfärben zeichnet sich das Schulzeichen allerdings schwarz: `currentColor` findet
in einer eigenständigen Datei keine Farbe vor.

**Pixelbilder (PNG, JPG, WEBP)** behalten immer ihre eigenen Farben; die stecken in den
Bildpunkten. Auf dunklem Hintergrund braucht es also eine helle, am besten freigestellte
Datei.

### Grenzen bei SVG-Logos

* Ohne `viewBox`-Attribut hat die Datei kein festes Seitenverhältnis und zieht sich auf
  das ganze Feld auseinander; das Tool weist beim Einlesen darauf hin.
* Ein SVG, das seinerseits eine Schrift oder eine Bilddatei nachlädt, bleibt leer –
  Schrift in Pfade umwandeln oder ein PNG verwenden.
* Skripte und Ereignis-Attribute werden beim Einlesen entfernt: Das Logo landet auch in
  der Vorschau innerhalb dieser Seite.

## Aufbau der Bilder

Alle Maße hängen an der kürzeren Bildkante, damit Quer- und Hochformat und jede eigene
Auflösung dasselbe Bild ergeben:

| Element | Lage |
| --- | --- |
| Schriftgröße | 8,2 % der kürzeren Kante, so weit verkleinert, wie der Platz es verlangt (siehe unten) |
| „iPad" | endet 1,4 % der kürzeren Kante vor dem linken Rand des Benutzerkreises |
| Laufnummer | beginnt mit demselben Abstand hinter seinem rechten Rand |
| Abstand nach außen | mindestens 2 % der kürzeren Kante zum Bildrand bzw. zur Schnittkante |
| Grundlinie | so, dass die Versalhöhe mittig zur Kreismitte steht (bei zwei Zeilen der Zeilenblock) |
| Logo | Feld von 36 % × 17 % der kürzeren Kante, mittig zwischen Kreis und Seriennummer |

Die Schrift ist Open Sans Bold aus `assets/fonts` – dieselbe wie in der Oberfläche.

## Geteilte iPads: der Benutzerkreis

Auf geteilten iPads legt iOS mittig einen Kreis mit dem Benutzerbild über den
Sperrbildschirm. Die Beschriftung weicht ihm aus: „iPad" links davor, die Nummer rechts
dahinter, beide mit demselben Abstand zum Kreisrand und senkrecht auf seine Mitte
ausgerichtet – nicht auf die Bildmitte, denn der Kreis sitzt etwas höher.

Lage und Größe sind an Screenshots eines iPads ausgemessen, quer und hochkant. Bezogen
auf die **kürzere** Bildkante fielen beide Ausrichtungen genau gleich aus:

| Maß | Anteil der kürzeren Kante |
| --- | --- |
| Durchmesser | 0,3115 (bei 2360 × 1640 also 511 Pixel) |
| Mitte über der Bildmitte | 0,0248 (41 Pixel) |
| Oberkante der Seriennummer über dem unteren Rand | 0,0453 (74 Pixel) |

Zwischen dem unteren Rand des Kreises und der Seriennummer bleibt eine freie Fläche –
dort steht das Logo, mittig darin.

In der Vorschau lassen sich Kreis, Ausschnitt und die Höhe der Seriennummer einblenden
(voreingestellt); in den erzeugten Dateien steht davon nichts.

## Drehen ins Hochformat

Wird ein iPad mit einem Querformat-Bild gedreht, vergrößert iOS das Bild auf die neue
Höhe und schneidet die Ränder ab. Von der langen Bildkante bleibt nur das mittlere Stück
`kurz² / lang` stehen – bei 2360 × 1640 sind das 48 % der Breite.

Neben dem Kreis ist deshalb wenig Platz: vom Kreisrand bis zum Rand des Ausschnitts sind
es 314 Pixel. Davon bleiben 2 % der kurzen Kante als Abstand zum Rand frei – bündig
angeschnitten sieht ein Schriftzug nach Versehen aus –, sodass 258 Pixel für die Schrift
bleiben. „iPad" bräuchte in voller Größe 291; im Querformat steht die Beschriftung
deshalb von vornherein auf etwa 89 % der gewünschten Größe. Im Hochformat wird waagerecht
nicht beschnitten, dort bleibt es bei den vollen 8,2 %.

Zwei Stufen halten die Beschriftung trotzdem im Bild:

1. **Zweizeilig ab vier Zeichen Präfix.** Das Präfix steht über der Nummer, die Nummer
   mittig darunter; den Abstand zum Kreis hält die breitere der beiden Zeilen. Damit wird
   `Kunst 01` von 546 auf 391 Pixel schmaler.
2. **Kleinere Schrift, wenn das noch nicht reicht.** Gemessen wird die breiteste
   Beschriftung der Reihe – bei `Kunst` bleiben so drei Viertel der Größe, die das Format
   sonst hergibt. Verkleinert wird für **alle** Bilder der Reihe gleich; sonst stünden
   `iPad 1` und `iPad 115` nebeneinander in verschiedenen Größen. Die Vorschau sagt, wenn
   das eingegriffen hat – verglichen wird dafür mit der Größe, die in diesem Format
   ohnehin herauskommt, nicht mit den gewünschten 8,2 %.

Unter 55 % geht es nicht weiter – kleiner wäre auf dem Gerät kaum zu lesen. Ein Präfix
wie `Naturwissenschaften` wird deshalb weiterhin beschnitten; die Vorschau meldet dann,
wie viele Pixel fehlen. Gemessen wird dafür der tatsächlich gesetzte Schriftzug, nicht
seine Zeichenzahl.

## Dateien im Archiv

```
Sperrbildschirme.zip
  iPad-01.png … iPad-15.png     ein Bild je Nummer
  Hintergrund.png               nur die Hintergrundfarbe (abwählbar)
  Hinweisschild-Koffer-1.pdf    wenn gewählt, ebenso als .svg
  Ladeanleitung-Koffer-1.pdf    wenn gewählt, ebenso als .svg
```

Zeichen, die in Dateinamen Ärger machen, werden zu `-`: aus `C 13` wird `iPad-C-13.png`.

## Hinweisschild und Ladeanleitung

Für den Koffer, in dem die iPads geladen werden. Beide entstehen aus Vorlagen in
[`vorlagen/`](vorlagen/) (DIN A4, Einheiten in Millimetern), je eine für Quer- und
Hochformat:

| Datei | Was sich ändert |
| --- | --- |
| `Hinweisschild_iPad-Koffer.svg`, `…_hoch.svg` | Koffernummer, Farbe, Farbwort im Satz, das abgebildete iPad |
| `Hinweisschild_iPad-Koffer_qr.svg`, `…_qr_hoch.svg` | dasselbe Schild mit QR-Feld – nur, wenn ein Link eingetragen ist |
| `Anleitung_iPad-Koffer_laden.svg`, `…_hoch.svg` | nur Karte 1: zwei Koffer samt iPad und Pfeil; Karten 2–4 bleiben |

**Seitenformat** – Querformat ist der Entwurf, wie er vorlag. Hochkant stehen auf dem
Schild der Titel oben, darunter die Nummer mit dem iPad daneben und der Hinweis über die
volle Breite; in der Anleitung stehen die vier Schritte untereinander, das Bild links,
Nummer und Text rechts. Die Bilder der Schritte sind dieselben, nur auf 92 % verkleinert;
die Texte sind neu umbrochen. Die Hochformat-Vorlagen wurden aus den querformatigen
abgeleitet, sind jetzt aber eigenständige Dateien – wer eine Fassung ändert, muss die
andere selbst nachziehen.

**Koffernummer** – übernimmt das Präfix der Laufnummer (`Kunst ` → `Kunst`, `1` → `1`),
solange das Feld nicht von Hand geändert ist; ein geleertes Feld folgt wieder dem Präfix.
Ohne Präfix gibt es keine Nummer, dann muss sie eingetragen werden. Das abgebildete iPad
heißt wie das erste der Reihe: Präfix `1`, Nummern `01` bis `15` → `iPad-101`.

**Farbwort** – „… nur iPads mit *rotem* Bildschirmhintergrund". Aus dem Farbwert lässt
sich nur grob ableiten, wie man eine Farbe nennt; das Tool schlägt deshalb ein Wort vor
(rot, dunkelblau, hellgrün, orangefarben, …) und lässt es ändern.

**Zweiter Koffer** – Karte 1 der Anleitung zeigt zum Vergleich einen weiteren Koffer,
etwa den der Nachbarklasse. Farbe, Nummer und iPad sind frei; die Schrift auf seinem iPad
wird schwarz oder weiß, je nachdem, was auf der Farbe zu lesen ist.

### QR-Code auf dem Schild

Mit einem Link – etwa zur Seite mit Störungsmeldung, Buchung und Anleitungen – teilt sich
das Schild: Die eine Hälfte nimmt das Schild der *anderen* Ausrichtung auf, um 1/√2
verkleinert (A4 halbiert ist wieder A-Format, es passt genau), die andere Hälfte den
QR-Code. Quer steht also links das Hochformat-Schild und rechts der Code, hochkant oben das
Querformat-Schild und unten der Code. Ohne Link bleibt es beim Schild allein.

Um den Code stehen handschriftliche Notizen mit Pfeilen darauf: „technische Probleme? Hier
gibt es Hilfe!", „Störungsmeldung", „Buchung", „Ladeanleitung", „Anleitung zur An- und
Abmeldung", „etc." und „Bitte auch bei spontaner Nutzung hier eine Buchung vornehmen!".
Die erste und die letzte tragen die Schildfarbe, die übrigen stehen in Schwarz. Die
Notizen sind fest in den Vorlagen gesetzt, nicht im Tool einstellbar.

Kodiert wird mit **qrcode-generator** (`assets/vendor/qrcode.js`, MIT) in UTF-8 und mit
Fehlerkorrektur Q – ein Viertel des Codes darf zerkratzt oder verdeckt sein. Der Platz in
der Vorlage (52 mm) schließt die Ruhezone von vier Modulen ein; ein langer Link macht die
Module kleiner, nicht den Code größer. Beginnt der Link nicht mit `https://`, weist das Tool
darauf hin: Manche Handys bieten ihn dann nicht zum Öffnen an.

Die Handschrift ist **Caveat** (OFL), als fester fetter Schnitt aus der variablen Datei
erzeugt und wie Inter auf den lateinischen Zeichensatz beschränkt
(`assets/fonts/caveat-latin-700.ttf`). Ihre Kontextvarianten sind entfernt: jsPDF wertet sie
nicht aus, und der Browser zeigte sonst andere Buchstabenformen als das PDF.

### Nummern auf dem Kofferdeckel

Auf den Deckeln steht die Nummer wie von Hand gemalt, einmal aufrecht und einmal
kopfstehend. Die Vorlage hatte nur die „1" und die „3"; die übrigen Ziffern sind im
selben Strich nachgezeichnet (`HANDZIFFERN` in `koffer.js`). Mehrstellige Nummern werden
aus ihnen zusammengesetzt und schmaler, wenn sie nicht auf die Deckelhälfte passen.
Enthält die Nummer Buchstaben, steht sie in Inter. Die Pfeilspitze rückt mit der Breite
der Nummer, damit sie nie darauf liegt.

### Farben und Kontrast

Bildschirm und Pfeil tragen die Farbe exakt – an ihr erkennt man den Koffer. Wo die Farbe
dagegen als Schrift steht, wird sie bei Bedarf aufgehellt bzw. abgedunkelt, bis sie sich
genug abhebt (Kontrast 3 : 1): die Ziffern auf dem schwarzen Deckel, Nummer und
Farbwort auf dem weißen Schild. Dunkelblau wäre auf dem Koffer sonst kaum zu sehen, Gelb
auf dem Schild ebenso wenig.

Gerade Gelb muss für 3 : 1 auf Weiß so weit abgedunkelt werden, dass es nach Oliv
aussieht. Unter „Farbe als Schrift" lässt sich deshalb jede der drei Stellen (Schild,
eigener Deckel, zweiter Deckel) von Hand festlegen: Der Farbwähler zeigt die angepasste
Farbe, wer ihn ändert, setzt damit das Häkchen „von Hand", und der Wert bleibt stehen,
auch wenn sich die Kofferfarbe ändert. Ohne Häkchen rechnet das Tool wieder selbst.
Daneben steht das Kontrastverhältnis; unter 3 : 1 wird es hervorgehoben, aber nicht
verhindert.

### Schrift und PDF

Gesetzt wird in **Inter**, wie die Vorlagen entworfen sind. Die Schrift liegt in
`assets/fonts` in fünf festen Stärken (400–800) als TTF, beschränkt auf den lateinischen
Zeichensatz: jsPDF kann nur TrueType einbetten und keine variablen Schriften.

Das PDF ist echte Vektorgrafik, erzeugt mit **jsPDF** und **svg2pdf.js** (beide in
`assets/vendor`). Es bettet nur die Zeichen ein, die vorkommen, und bleibt deshalb klein
(Schild ~30 kB, Anleitung ~120 kB). Das SVG bringt die Schrift dagegen vollständig mit.

jsPDF unterschneidet nicht (kein Kerning) – Schriftzüge laufen im PDF dadurch bis zu 2 %
breiter als im Browser. svg2pdf misst die Textstücke aber im Browser, der unterschneidet;
ohne Abhilfe rückte deshalb ein fett gesetztes Wort in den Wortabstand davor. Während des
Exports misst der Browser deshalb ohne Unterschneidung (`ohneUnterschneidungMessen` in
`koffer.js`).

`letter-spacing` kennt svg2pdf nicht. Gesperrte Beschriftungen (`Aux1/Charge` und `Aux2` auf
der Zeitschaltuhr) zerlegt das Tool für den Export deshalb in einzeln gesetzte Buchstaben
(`gesperrteTexteZerlegen`); das gilt für einfache `<text>` mit eigener `font-size` und ohne
`<tspan>`.

### Vorlagen ändern

Das Skript findet die Stellen über diese ids und Klassen; wer eine Vorlage neu zeichnet,
muss sie wieder vergeben:

| Vorlage | id / Klasse | Inhalt |
| --- | --- | --- |
| Schild | `koffernummer` | `<text>` der großen Nummer; `data-rechts`: bis wohin sie reichen darf, sonst wird sie kleiner. `data-mitte` (hochkant): senkrechte Mitte, an der eine verkleinerte Nummer stehen bleibt – ohne die Angabe hält sie ihre Grundlinie |
| Schild | `hinweistext` | Gruppe des Satzes; `data-x`, `data-mitte`, `data-breite`, `data-groesse`, `data-zeilenabstand` beschreiben das Feld |
| Schild | `ipad-bildschirm`, `ipad-name`, `.ipad-deko` | Bildschirm, Beschriftung und Verzierung des iPads |
| Schild mit QR | `qr-code` | leere Gruppe; `data-x`, `data-y`, `data-groesse` beschreiben das Quadrat samt Ruhezone, in das der Code gezeichnet wird |
| Schild mit QR | `.notiz.akzent` | Notizen, die die Schildfarbe annehmen |
| Anleitung | `koffer-a-nummer`, `koffer-b-nummer` | Gruppe mit zwei Untergruppen (Lage per `transform`), deren Inhalt ersetzt wird |
| Anleitung | `pfeil-a`, `pfeil-b` | Pfeile; der erste Punkt ist das stumpfe Ende |
| Anleitung | `ipad-a-…`, `ipad-b-…` | wie beim Schild, je iPad |

a ist der Koffer der Sperrbildschirme (links, in der Vorlage rot), b der zweite (rechts,
grün). Beim Umbau der Vorlagen wurden außerdem ihre C2PA-Metadaten entfernt (sie
beschrieben den alten Inhalt) und `DejaVu Sans` durch Inter ersetzt.

Was im Browser richtig aussieht, muss svg2pdf noch lange nicht können. Beim Zeichnen
deshalb meiden:

* **Muster als Kontur** (`stroke="url(#…)"`): svg2pdf lässt die Linie weg. Die geflochtenen
  Ladekabel in Bild 2 sind deshalb zwei Linien übereinander – hell durchgezogen, darüber
  dunkel gestrichelt.
* **Muster in einer vergrößerten Ansicht** (`patternTransform` oder Muster innerhalb eines
  verschachtelten `<svg>` mit `slice`): svg2pdf setzt sie falsch zusammen. Die Noppen in der
  Lupe von Bild 3 sind deshalb einzelne Kreise, so groß und so weit auseinander, wie die
  Lupe vergrößert (4,5-fach).
* **`letter-spacing`** nur an einfachen Texten (siehe oben).

Danach die Anleitung einmal als PDF erzeugen und ansehen – die Vorschau im Tool zeigt das SVG,
nicht das PDF.

## PNG oder SVG

Grundlage ist immer das SVG; das PNG entsteht daraus im Browser. Beide Formate zeigen
deshalb dasselbe.

Damit das gelingt, steckt die Schriftdatei als Data-URL im SVG selbst: Beim Rastern
liegt das SVG als eigenes Bild vor und darf nichts von außen nachladen. Das macht die
SVG-Dateien rund 60 kB groß, dafür sehen sie auch auf einem fremden Rechner richtig aus.
Das Hintergrundbild ohne Text braucht keine Schrift und bleibt entsprechend klein.

Für die Geräte selbst ist PNG das richtige Format – iPadOS nimmt kein SVG als
Hintergrundbild an.

## Lokal testen

Über einen Server öffnen, nicht per `file://` – sonst lassen sich weder Schriftdateien
noch Schulzeichen und Vorlagen lesen; das Erzeugen bricht dann mit einer Meldung ab:

```
python3 -m http.server 8741
```
