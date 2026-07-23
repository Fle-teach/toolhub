# Serienbrief

Verbindet eine Vorlage (Word `.docx` oder Writer `.odt`) mit Datensätzen aus einer Tabelle
(`.csv`, `.xlsx`, `.xls`, `.xlsm`) zu fertigen Dokumenten. Alles läuft im Browser; es wird
nichts hochgeladen.

## Vorlage vorbereiten

Es gibt zwei Wege, und sie lassen sich mischen: eigene `{{Felder}}` oder die
Seriendruckfelder, die Word bzw. Writer selbst mitbringen.

### Eigene Felder

An jeder Stelle, die später ersetzt werden soll, steht der Feldname in doppelten
geschweiften Klammern:

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

### Vorhandene Word- und Writer-Vorlagen

Eine in Word eingerichtete Serienbriefvorlage kann unverändert verwendet werden. Gelesen
werden die Seriendruckfelder (`«Nachname»`, in Word als `MERGEFIELD` gespeichert) und die
Bedingungsfelder „Wenn-Dann-Sonst" (`IF`) – auch ineinander verschachtelt, wie sie beim
Aufbau von Ankreuzfeldern entstehen:

```
{ IF { MERGEFIELD Note } = "5+" "X" { IF { MERGEFIELD Note } = "5" "X" "" } }
```

Verglichen wird wie in Word: zwei Zahlen numerisch, sonst als Text ohne Rücksicht auf Groß-
und Kleinschreibung; bei `=` und `<>` sind die Platzhalter `*` und `?` erlaubt. Beachte, dass
`5+` keine Zahl ist und deshalb als Text verglichen wird. Unterstützte Vergleiche:
`=`, `<>`, `<`, `>`, `<=`, `>=`.

In Writer sind es die Datenbankfelder (Einfügen ▸ Feldbefehl ▸ Weitere ▸ Datenbank); die
Spaltennamen dienen als Feldnamen. Bedingungsfelder wertet das Tool in ODT **nicht** aus.

Andere Feldarten (Datum, Seitenzahl, Inhaltsverzeichnis …) bleiben unangetastet und werden
weiterhin von Word bzw. Writer selbst aktualisiert. In der Vorschau steht bei ihnen noch der
Wert, der zuletzt im Dokument gespeichert wurde.

War an der Vorlage eine Datenquelle angemeldet (der übliche Fall, wenn schon einmal mit Word
zusammengeführt wurde), wird diese Verknüpfung aus den erzeugten Dokumenten entfernt.
Andernfalls würde Word beim Öffnen jedes Serienbriefs nach der Datenbank fragen und der Pfad
zur Quelldatei bliebe in der Datei stehen.

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

| Datei | Zweck |
| --- | --- |
| `Elternbrief-Vorlage.docx` / `.odt` | derselbe Brief mit `{{Feldern}}`, einmal je Format |
| `datensaetze.csv` / `.xlsx` | die zugehörigen Datensätze; die XLSX hat zwei Blätter, um die Blattauswahl auszuprobieren |
| `Vorlage_2.docx` | echte Word-Serienbriefvorlage (Lern- und Fördervereinbarung) mit `MERGEFIELD`, verschachtelten `IF`-Feldern für die Ankreuzkästchen und einem `DATE`-Feld |
| `datensaetze_2.xlsx` | Datensätze zu `Vorlage_2.docx` |

Die Daten in den Beispielen sind frei erfunden.

## Technik

Das Lesen und Füllen der Vorlagen steckt in `assets/toolhub-vorlagen.js` und steht damit auch
anderen Tools zur Verfügung. DOCX und ODT sind ZIP-Archive mit XML; bearbeitet werden
`word/document.xml` bzw. `content.xml` (samt Kopf-/Fußzeilen in `word/header*.xml`,
`word/footer*.xml` bzw. `styles.xml`). Für den Seitenumbruch zwischen zwei Datensätzen setzt
DOCX ein `<w:br w:type="page"/>`, ODT eine Absatzvorlage mit `fo:break-before="page"`.

Word speichert ein Feld nicht als Element, sondern als Folge von Runs (`fldChar begin`,
`instrText`, `fldChar separate`, zwischengespeichertes Ergebnis, `fldChar end`), die sich
ineinander schachteln lassen. Deshalb baut das Modul daraus einen Feldbaum und wertet ihn
rekursiv aus; ausgewertete Felder verschwinden samt Anweisung und werden durch einen Run mit
dem Ergebnis ersetzt, der die Formatierung des bisherigen Ergebnisses übernimmt.
