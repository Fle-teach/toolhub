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

Das Panel bleibt eingeklappt, solange alle Felder zugeordnet sind – gibt es Felder ohne
Spalte, öffnet es sich von selbst, hebt diese Zeilen hervor und stellt sie nach oben.

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

## Schriftgröße der eingesetzten Werte

Betrifft ausschließlich die Werte, die in die Felder eingesetzt werden – nicht den übrigen
Text der Vorlage.

| Einstellung | Wirkung |
| --- | --- |
| Wie im Feld (Standard) | Der Wert übernimmt die Schriftgröße der Stelle, an der das Feld steht. |
| Feste Schriftgröße | Alle eingesetzten Werte erhalten die angegebene Punktgröße. |
| Automatisch verkleinern | Lange Werte werden kleiner gesetzt, um zusätzliche Seitenumbrüche zu vermeiden. |

Die Größe wirkt genau auf den Wert: Steht ein Feld mitten im Satz (`für {{Vorname}} aus
der Klasse …`), wird nur der Name kleiner gesetzt, der umgebende Satz behält seine Größe. Eine
vorhandene Auszeichnung des Feldes (fett, kursiv, Farbe) bleibt erhalten. In der Textvorschau
ist die Größe nicht sichtbar – sie zeigt nur den Inhalt, nicht die Formatierung; erst das
erzeugte Dokument gibt sie wieder.

### Automatisch verkleinern

Die Anpassung erfolgt **pro Seite einheitlich**: Alle (langen) Felder einer Seite erhalten
dieselbe Größe. Diese ergibt sich daraus, wie voll die Seite wird – aus dem festen
Vorlagentext, der ohnehin auf der Seite steht, und dem durch die Felder hinzukommenden Text.
Je mehr zusammenkommt, desto kleiner die Schrift; passt alles bequem, bleibt es bei der
Startgröße.

Als „Seite" gelten die in der Vorlage **fest gesetzten** Seitenumbrüche. Die tatsächliche, erst
beim Öffnen entstehende Seitenaufteilung kann das Tool nicht sehen (es läuft ohne Word/Writer im
Browser) – es schätzt sie. Text in Tabellenzellen zählt nicht zum „vollen" festen Text, weil
Zellen eine weitgehend feste Höhe haben; Feldwerte zählen dagegen überall, auch in Zellen.

Einstellungen:

| Feld | Bedeutung |
| --- | --- |
| Startgröße | größte Größe; wird verwendet, wenn die Seite noch nicht voll ist |
| Mindestgröße | Untergrenze; darunter wird nicht verkleinert, auch wenn es dann noch nicht passt |
| Zeichen pro Zeile | wie viele Zeichen als eine Zeile gelten (steuert, wie stark manuelle Umbrüche zählen) |
| **Kapazität je Seite** | wie voll die jeweilige Seite werden darf, bevor verkleinert wird: **höher** = größere Schrift, aber eher eine zusätzliche Seite; **niedriger** = sichereres Einpassen mit kleinerer Schrift. Für jede Seite der Vorlage getrennt einstellbar. |
| Manuelle Zeilenumbrüche in Leerzeichen umwandeln | ersetzt harte Umbrüche im Wert durch ein Leerzeichen; der Text fließt dann und braucht weniger Platz |
| Nur Felder ab einer Mindestlänge anpassen | Schalter (standardmäßig aus). Ist er an, werden nur Felder ab *n* Zeichen **oder** *m* Umbrüchen verkleinert; kürzere Felder behalten die Größe ihrer Fundstelle oder erhalten eine feste Größe. Bei „Umbrüche → Leerzeichen" ist die Umbruch-Schwelle deaktiviert. |

Steht der Schalter aus (Standard), bekommen alle Felder einer Seite die berechnete Größe.

**Wichtig – es ist eine Näherung, keine Garantie.** Ob ein Inhalt wirklich auf eine weitere
Seite rutscht, entscheidet erst Word bzw. Writer. Die Automatik senkt die Wahrscheinlichkeit
zusätzlicher Seiten deutlich; bei sehr vollen Seiten kann es sein, dass selbst die Mindestgröße
nicht ausreicht. Für ein verlässliches Ergebnis die erzeugten Dokumente kurz durchsehen und die
Werte bei Bedarf nachjustieren.

### Kapazität einstellen

Weil das Tool die echte Seitenaufteilung nicht kennt, lässt sich nicht für jede Vorlage – und
nicht einmal für jede Seite derselben Vorlage – dieselbe „Fülle" ansetzen. Sobald eine Vorlage
geladen ist, erscheint deshalb **je Vorlagen-Seite ein eigenes Feld** („Seite 1", „Seite 2", …),
vorbelegt mit dem Standard **1100** (Startgröße 11 pt, Mindestgröße 6 pt).

* Wirkt die Schrift auf einer Seite **unnötig klein** und wäre dort noch Platz → Kapazität
  dieser Seite **erhöhen**.
* Rutscht Inhalt auf eine **zusätzliche Seite** → Kapazität der betroffenen Seite **verringern**.

Das lohnt sich besonders bei Bögen, deren Seiten unterschiedlich voll sind: Beim
Oberstufen-LEG-Bogen enthält Seite 1 vor allem Tabellen mit kurzen Einträgen, Seite 2 dagegen
die langen Kommentarfelder. Mit „Seite 1 = 2600, Seite 2 = 750" bleibt Seite 1 bei voller
Schriftgröße und der Bogen hält trotzdem seine zwei Seiten – mit einem einheitlichen Wert ging
beides nicht gleichzeitig.

Als „Seiten" zählen die fest gesetzten Seitenumbrüche der Vorlage; die Zählung beginnt bei jedem
Datensatz neu, sodass „Seite 2" immer die zweite Seite des jeweiligen Serienbriefs meint.

## Beispieldateien

| Datei | Zweck |
| --- | --- |
| `Elternbrief-Vorlage.docx` / `.odt` | derselbe Brief mit `{{Feldern}}`, einmal je Format |
| `datensaetze.csv` / `.xlsx` | die zugehörigen Datensätze; die XLSX hat zwei Blätter, um die Blattauswahl auszuprobieren |

Frei erfundene Beispieldaten. Weitere Vorlagen mit echten Testdatensätzen (Ordner `LEGs/` und
`LFV/`) liegen nur lokal zum Ausprobieren und sind über `.gitignore` vom Repository
ausgeschlossen, weil sie Personendaten enthalten.

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

Für die automatische Verkleinerung werden die Blöcke eines Datensatzes an den festen
Seitenumbrüchen in Seiten zerlegt. Je Seite schätzt `toolhubVorlageSeitengroesse` aus der festen
Textlast (ohne dicht gepackte Tabellen) und der Feldtextlast eine gemeinsame Größe: Der
vertikale Platzbedarf wächst etwa mit `Zeichen · Größe²`, gesucht ist die größte Größe, mit der
die Seite noch in ihre Kapazität passt. Diese Größe bekommen alle Felder der Seite. Die Kapazität
kommt je Seitenindex aus `autoSchrift.kapazitaeten` (`toolhubVorlageKapazitaet`); ohne Angabe
gilt `TOOLHUB_SEITEN_KAPAZITAET`, an den LEG-Bögen kalibriert. Wie viele Seiten eine Vorlage hat,
meldet `vorlage.seitenAnzahl` – daraus baut das Tool die Eingabefelder.
