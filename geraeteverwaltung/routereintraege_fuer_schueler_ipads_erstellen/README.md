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

Alle Werte lassen sich ändern, Jahrgänge hinzufügen und entfernen. Taucht in den Dateien
ein Jahrgang ohne hinterlegte Start-IP auf, wird dafür eine leere Zeile zum Ausfüllen
angeboten; bleibt sie leer, erhalten diese Geräte keine IP und das Tool meldet es.

Ein Bereich endet eine Adresse **vor der nächsthöheren Start-IP** – so laufen zwei
Jahrgänge nicht ineinander, auch wenn ihre Startadressen im selben Block liegen
(Jahrgang 11 reicht damit von `10.9.149.180` bis `10.9.150.1`, also bis kurz vor den
Beginn von Jahrgang 12). Der oberste Bereich hat keinen Nachbarn über sich und endet am
Ende seines Blocks.

Adressen, die auf `.0`, `.254` oder `.255` enden, werden übersprungen (Netz- und
Broadcast-Adresse, Gateway). Die Tabelle zeigt zu jedem Jahrgang den errechneten Bereich
und die Zahl der verfügbaren Adressen; reichen sie nicht, wird gewarnt und die Zahl
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

CSV mit den Spalten `Hostname`, `MAC`, `IP`; das Trennzeichen ist einstellbar
(Semikolon, Komma, Tabulator). Die Datei wird ohne BOM geschrieben, weil sie in den
Router eingelesen wird und nach der Normalisierung ohnehin nur ASCII-Zeichen enthält.
Sortiert wird nach Jahrgang und IP.

## Beispieldaten

`beispiele/input.csv` ist eine gekürzte, anonymisierte Anmeldeliste; sie enthält unter
anderem eine doppelt angemeldete Import-ID (`B9Q5A9`). `beispiele/routereintraege_2026.csv`
ist die zugehörige Ausgabe mit den Voreinstellungen und dem Jahr 2026.
