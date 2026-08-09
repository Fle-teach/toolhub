# Sperrbildschirme für iPads erstellen

Erzeugt zu einer fortlaufenden Gerätenummer je einen Sperrbildschirm: einfarbiger
Hintergrund, auf halber Höhe links das Wort **iPad** und rechts die Nummer, darunter
das Logo der Schule. Heraus kommt ein ZIP-Archiv mit allen Bildern – als PNG oder SVG.

Es wird nichts hochgeladen: Das Logo wird im Browser gelesen, gerechnet wird ebenfalls
dort. Ohne Internetzugang funktioniert das Tool genauso.

## Einstellungen

| Einstellung | Bedeutung |
| --- | --- |
| Auflösung | `2360 × 1640` (iPads ohne Home-Button), `2160 × 1620` (mit Home-Button) oder eigene Werte |
| Ausrichtung | ordnet die beiden Werte der Auflösung an – Querformat legt die längere Kante waagerecht |
| Farben | Hintergrund und Schrift, je über den Farbwähler oder als Hex-Wert |
| Präfix | steht unverändert vor der Nummer; `C ` (mit Leerzeichen) ergibt `C 13` |
| Start / Ende | die erste und die letzte Nummer der Reihe (höchstens 500 Bilder) |
| Führende Nullen | füllt jede Nummer auf die Stellenzahl der größten auf (`01` … `15`, aber `001` … `120`) |
| Logo | optional; steht mittig im unteren Drittel |
| Dateiformat | PNG (fertiges Pixelbild) oder SVG (skalierbar, zum Weiterbearbeiten) |
| Hintergrundbild | zusätzlich eine Datei ohne Text und Logo, nur die Hintergrundfarbe |

## Logo

Angenommen werden `.svg`, `.png`, `.jpg` und `.webp`. Das Bild wird unverändert
eingesetzt – auf dunklem Hintergrund braucht es also eine helle, am besten freigestellte
Datei. Es wird in ein Feld eingepasst, nicht verzerrt: Ein breites Logo wird an seiner
Breite begrenzt, ein hohes an seiner Höhe.

SVG-Logos brauchen ein `viewBox`-Attribut, sonst hat die Datei kein festes
Seitenverhältnis und zieht sich auf das ganze Feld auseinander; das Tool weist beim
Einlesen darauf hin. Ein SVG-Logo, das seinerseits eine Schrift oder eine Bilddatei
nachlädt, bleibt leer – Schrift in Pfade umwandeln oder ein PNG verwenden.

## Aufbau der Bilder

Alle Maße hängen an der kürzeren Bildkante, damit Quer- und Hochformat und jede eigene
Auflösung dasselbe Bild ergeben:

| Element | Lage |
| --- | --- |
| Schriftgröße | 8,2 % der kürzeren Kante |
| „iPad" | Mitte bei ⅓ der Breite, Grundlinie so, dass die Versalhöhe auf halber Höhe mittig steht |
| Laufnummer | Mitte bei ⅔ der Breite, gleiche Grundlinie |
| Logo | Feld von 42 % × 20 % der kürzeren Kante, Mitte bei 75 % der Höhe |

Die Schrift ist Open Sans Bold aus `assets/fonts` – dieselbe wie in der Oberfläche.

## Dateien im Archiv

```
Sperrbildschirme.zip
  iPad-01.png … iPad-15.png     ein Bild je Nummer
  Hintergrund.png               nur die Hintergrundfarbe (abwählbar)
```

Zeichen, die in Dateinamen Ärger machen, werden zu `-`: aus `C 13` wird `iPad-C-13.png`.

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

Über einen Server öffnen, nicht per `file://` – sonst lässt sich die Schriftdatei nicht
lesen und das Erzeugen bricht mit einer Meldung ab:

```
python3 -m http.server 8741
```
