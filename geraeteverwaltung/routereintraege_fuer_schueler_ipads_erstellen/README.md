# Routereinträge für Schüler-iPads erstellen

Aus den Anmeldelisten der Schülergeräte entsteht die Tabelle, die der Router erwartet:
**Hostname, MAC, IP** – herunterladbar als CSV.

## Eingabe

Eine oder mehrere Tabellen (CSV, XLSX/XLS/XLSM), üblicherweise der Export des
Anmeldeformulars. Gebraucht werden die Spalten

| Spalte | wofür |
| --- | --- |
| `Nachname`, `Vorname` | Hostname |
| `Klasse/Information` | Jahrgang (die Zahl darin) – für Hostname und IP-Bereich |
| `Import-ID` | Hostname; zugleich der Schlüssel, unter dem ein Gerät geführt wird |
| `Ausgefüllt am` | Reihenfolge der IP-Vergabe und Auswahl bei Mehrfachanmeldungen |
| `WLAN-Adresse` | MAC |

Die Spaltennamen werden ohne Rücksicht auf Groß-/Kleinschreibung und Sonderzeichen
gesucht; gebräuchliche Abweichungen (`MAC-Adresse` statt `WLAN-Adresse`, `Klasse` statt
`Klasse/Information`) werden erkannt. Mehrere Dateien werden zusammen ausgewertet.

## Vorhandene Routereinträge (freiwillig)

Im zweiten Feld lässt sich der Bestand aus dem Router ablegen – eine Tabelle mit den
Spalten `Name`, `MAC` und `IP`. Sie wirkt an drei Stellen:

* **Bekannte WLAN-Adressen** bekommen keinen neuen Eintrag. Das gilt unabhängig davon,
  wie der Eintrag im Router heißt.
* **Neues Gerät bei bekannter Import-ID:** Der neue Eintrag übernimmt die IP, die diese
  Import-ID bisher belegt hat. Der alte Eintrag ist damit überholt und steht im Panel
  „Überholte Einträge im Router" – er muss dort von Hand entfernt werden, sonst ist die
  Adresse doppelt vergeben.
* **Alle belegten Adressen** bleiben bei der Vergabe außen vor, auch die von Geräten, die
  nichts mit dem Anmeldeformular zu tun haben (Drucker, Server, Fremdgeräte).

Die Import-ID liest das Tool aus dem Namen, sofern er dem hier erzeugten Schema folgt
(`S-…-…-…-…-<Import-ID>`). Alles andere zählt als Eintrag ohne Import-ID: Seine Adresse
ist belegt, mehr wird daraus nicht abgeleitet. Hat eine Import-ID mehrere Einträge, gilt
der mit der niedrigsten Adresse.

## Hostname

```
S-<Jahrgang>-<Jahr>-<Nachname>-<Initial Vorname>-<Import-ID>
S-10-2026-Mueller-M-B2W5P1
```

Der Jahrgang ist die Zahl aus `Klasse/Information` (`10D`, `11 Life S.`, `12 NuT` →
`10`, `11`, `12`), das Jahr ist einstellbar und steht anfangs auf dem laufenden Jahr.

Namen werden auf ASCII gebracht: Umlaute werden ausgeschrieben (`ä` → `ae`, `ß` → `ss`),
diakritische Zeichen entfallen (`ç` → `c`, `é` → `e`), Leerzeichen werden zu
Bindestrichen, alles Übrige (Apostroph, Punkt) fällt weg – aus `Öztürk-Meyer, Ann-Sophie`
wird `Oeztuerk-Meyer-A`, aus `D'Angelo, José` wird `DAngelo-J`.

## MAC

Aus der WLAN-Adresse zählen allein die zwölf Hexadezimalstellen; geschrieben wird
kleingeschrieben mit Doppelpunkten (`AA-BB-CC-DD-EE-01` → `aa:bb:cc:dd:ee:01`). Zeilen
mit fehlender oder unvollständiger Adresse werden übersprungen und aufgelistet.

## IP-Vergabe

Je Jahrgang fortlaufend ab einer Start-IP. Voreingestellt sind

| Jahrgang | Start-IP |
| --- | --- |
| 10 | 10.9.150.100 |
| 11 | 10.9.149.180 |
| 12 | 10.9.150.2 |

Alle Werte lassen sich ändern, Bereiche hinzufügen und entfernen. **Ein Jahrgang darf
mehrere Bereiche haben** – sie werden von der niedrigsten Adresse an aufgefüllt, ist der
erste voll, geht es im nächsten weiter. Taucht in den Dateien ein Jahrgang ohne
hinterlegten Bereich auf, wird dafür eine leere Zeile zum Ausfüllen angeboten; bleibt sie
leer, erhalten diese Geräte keine IP und das Tool meldet es.

Die **End-IP ist freiwillig**. Bleibt sie leer, endet der Bereich eine Adresse vor der
nächsthöheren Start-IP – so laufen zwei Bereiche nicht ineinander, auch wenn sie im
selben Block liegen (Jahrgang 11 reicht damit von `10.9.149.180` bis `10.9.150.1`, also
bis kurz vor den Beginn von Jahrgang 12). Der oberste Bereich hat keinen Nachbarn über
sich und endet am Ende seines Blocks. Das jeweils errechnete Ende steht als Platzhalter
im Feld. Überschneiden sich zwei Bereiche oder liegt eine End-IP vor ihrer Start-IP, wird
das gemeldet und nichts erzeugt.

Adressen, die auf `.0`, `.254` oder `.255` enden, werden übersprungen (Netz- und
Broadcast-Adresse, Gateway), ebenso alle Adressen, die der Bestand schon belegt. Die
Spalte „Adressen" zeigt, wie viele davon im Bereich frei sind und wie viele der letzte
Lauf daraus vergeben hat; reichen sie für den Jahrgang nicht, wird gewarnt und die Zahl
farbig hervorgehoben – die überzähligen Geräte stehen ohne IP in der Ausgabe.

Die Reihenfolge innerhalb eines Jahrgangs richtet sich nach dem Ausfülldatum, die
früheste Anmeldung zuerst. Maßgeblich ist dabei die **erste** Anmeldung einer Import-ID:
Wer sich früh angemeldet und später korrigiert hat, behält seine Position.

## Mehrfach angemeldete Geräte

Gibt es zu einer Import-ID mehrere Datensätze, gilt der zuletzt ausgefüllte. Die
verworfenen Datensätze werden mit Datei, Zeile, Datum und WLAN-Adresse aufgelistet –
daneben steht jeweils der Datensatz, der stattdessen verwendet wurde.

Zusätzlich wird gemeldet, wenn dieselbe WLAN-Adresse unter mehreren Import-IDs auftaucht
(ein Gerät, zwei Anmeldungen) und wenn ein Hostname über 63 Zeichen lang wird – so lang
darf ein DNS-Label höchstens sein.

## Ausgabe

CSV mit den **neuen** Einträgen in den Spalten `Hostname`, `MAC`, `IP`; das Trennzeichen ist einstellbar
(Semikolon, Komma, Tabulator). Die Datei wird ohne BOM geschrieben, weil sie in den
Router eingelesen wird und nach der Normalisierung ohnehin nur ASCII-Zeichen enthält.
Sortiert wird nach Jahrgang und IP.

## Beispieldaten

`beispiele/input.csv` ist eine gekürzte, anonymisierte Anmeldeliste; sie enthält unter
anderem eine doppelt angemeldete Import-ID (`B9Q5A9`). `beispiele/routereintraege_2026.csv`
ist die zugehörige Ausgabe mit den Voreinstellungen und dem Jahr 2026.

`beispiele/input-bereits-existierende-routereintraege.csv` ist ein kleiner Router-Bestand:
zwei Einträge ohne Schüler-Schema und einer für `B3D6U7` mit derselben WLAN-Adresse, die
auch in der Anmeldeliste steht. Nimmt man beide Dateien zusammen, entfällt dieses Gerät –
es steht ja schon im Router – und `10.9.149.180` bleibt als belegt außen vor. Das Ergebnis
steht in `beispiele/routereintraege_2026-mit-bestand.csv`.
