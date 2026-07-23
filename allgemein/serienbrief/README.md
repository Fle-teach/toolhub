# Serienbrief

Verbindet eine Vorlage (Word `.docx` oder Writer `.odt`) mit Datensätzen aus einer Tabelle
(`.csv`, `.xlsx`, `.xls`, `.xlsm`) zu fertigen Dokumenten. Alles läuft im Browser; es wird
nichts hochgeladen.

## Vorlage vorbereiten

Die Vorlage ist ein gewöhnliches Dokument. An jeder Stelle, die später ersetzt werden soll,
steht der Feldname in doppelten geschweiften Klammern:

```
{{Anrede}} {{Nachname}},

für {{Vorname}} aus der Klasse {{Klasse}} findet das Gespräch am {{Termin}} statt.
```

* Leerzeichen im Feld werden ignoriert: `{{ Vorname }}` ist dasselbe wie `{{Vorname}}`.
* Die Formatierung des Felds gilt auch für den eingesetzten Wert – ist `{{Vorname}}` fett,
  steht der Name fett im Ergebnis.
* Felder dürfen mitten im Satz stehen und beim Tippen zerschnitten worden sein; die
  Ersetzung arbeitet auf dem ganzen Absatz.
* Felder in Kopf- und Fußzeilen funktionieren ebenfalls. Sie gelten allerdings für das ganze
  Dokument: Enthält ein Dokument mehrere Datensätze, wird dort der erste eingesetzt.
* Word-eigene Seriendruckfelder (`«Nachname»`) werden **nicht** gelesen – nur `{{…}}`.

## Datensätze

Die erste Zeile der Tabelle enthält die Spaltennamen, jede weitere Zeile ist ein Datensatz.
Bei CSV wird das Trennzeichen erkannt (Semikolon wie im deutschen Excel, Komma, Tabulator,
senkrechter Strich), ebenso die Kodierung (UTF-8 oder Windows-1252). Bei Excel-Dateien mit
mehreren Blättern lässt sich das Blatt auswählen; Zahlen und Datumsangaben werden so
übernommen, wie Excel sie anzeigt.

Feld und Spalte werden automatisch verknüpft, wenn die Namen übereinstimmen – Groß- und
Kleinschreibung sowie Leerzeichen, Punkte, Binde- und Unterstriche spielen dabei keine Rolle.
Abweichende Zuordnungen (Feld `Anrede` ← Spalte `Briefanrede`) werden im Panel
„Felder zuordnen“ eingestellt. Ein Feld ohne Spalte bleibt im Dokument leer; auf Wunsch
bleibt stattdessen `{{Feld}}` stehen, was beim Prüfen einer neuen Vorlage hilft.

Zeilenumbrüche innerhalb einer Zelle bleiben erhalten und werden zu Zeilenumbrüchen im
Dokument.

## Ausgabe

| Einstellung | Ergebnis |
| --- | --- |
| Alles in ein Dokument (Standard) | ein Dokument, Datensätze durch Seitenumbrüche getrennt |
| Nach Spalte gruppieren | ein Dokument je Wert der Spalte, z. B. je Klasse |
| Ein Dokument je Datensatz | ein Dokument je Zeile; Dateiname über ein Muster wie `{{Klasse}}_{{Nachname}}` |

Das Ausgabeformat entspricht dem der Vorlage. Ein einzelnes Dokument wird direkt
heruntergeladen, mehrere gesammelt als ZIP-Datei.

## Beispieldateien

`beispiele/` enthält denselben Elternbrief einmal als `.docx` und einmal als `.odt` sowie die
zugehörigen Datensätze als `.csv` und `.xlsx` (dort auf zwei Tabellenblättern, um die
Blattauswahl auszuprobieren). Die Daten sind frei erfunden.

## Technik

Das Lesen und Füllen der Vorlagen steckt in `assets/toolhub-vorlagen.js` und steht damit auch
anderen Tools zur Verfügung. DOCX und ODT sind ZIP-Archive mit XML; bearbeitet werden
`word/document.xml` bzw. `content.xml` (samt Kopf-/Fußzeilen in `word/header*.xml`,
`word/footer*.xml` bzw. `styles.xml`). Für den Seitenumbruch zwischen zwei Datensätzen setzt
DOCX ein `<w:br w:type="page"/>`, ODT eine Absatzvorlage mit `fo:break-before="page"`.
