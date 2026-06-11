# Beispiele für Serienbrief-Generator

## sample-data.csv

Dies ist eine Beispiel-CSV-Datei mit 6 Testdatensätzen.

### Spalten:
- **Vorname**: Vorname der Person
- **Nachname**: Nachname der Person
- **Anrede**: Anrede (Herr/Frau)
- **Titel**: Berufstitel/Position
- **Unternehmen**: Name des Unternehmens
- **Stadt**: Stadt/Ort

### Verwendung:
1. Laden Sie diese CSV-Datei in den Serienbrief-Generator
2. Verwenden Sie die Feldnamen in doppelten Klammern in Ihrem DOCX-Template:
   - `{{Vorname}}`
   - `{{Nachname}}`
   - `{{Anrede}}`
   - `{{Titel}}`
   - `{{Unternehmen}}`
   - `{{Stadt}}`

## Ihr eigenes DOCX-Template erstellen

### Schritt 1: Word oder LibreOffice öffnen
- Erstellen Sie ein neues Dokument

### Schritt 2: Serienbrieffelder einfügen
```
Sehr geehrter {{Anrede}} {{Nachname}},

vielen Dank für Ihre Anfrage. Wir freuen uns, Sie bei {{Unternehmen}} zu unterstützen.

Ihre Position als {{Titel}} unterstreicht die Bedeutung Ihrer Rolle in {{Stadt}}.

Mit freundlichen Grüßen,
Das Support-Team
```

### Schritt 3: Speichern als DOCX
- Datei → Speichern unter
- Format: **Word 2007-365 (.docx)**
- Dateiname: `template.docx` (oder beliebig)

### Schritt 4: Upload
- Laden Sie Template und sample-data.csv in den Serienbrief-Generator
- Generieren Sie die Serienbriefe!

## Tipps

- **Feldnamen prüfen**: Feldnamen in `{{...}}` müssen exakt mit den Spaltennamen in der CSV übereinstimmen (Groß-/Kleinschreibung beachten)
- **Testen**: Starten Sie mit nur 2-3 Testdatensätzen
- **Formatierung**: Alle Formatierungen (fett, kursiv, Farbe) bleiben erhalten
- **Länge**: Achten Sie darauf, dass Ihre Testdaten ähnliche Längen wie die echten Daten haben, um die Schriftgrößenanpassung korrekt zu testen

## Beispiel-Template

Falls Sie kein eigenes Template haben, können Sie mit folgendem Template testen:

```
═══════════════════════════════════════════════════════════════

Serienbrief

Datum: {{Datum}}

Sehr geehrter {{Anrede}} {{Nachname}},

herzlichen Dank für Ihr Interesse. Wir haben Ihre Anfrage erhalten
und werden diese zeitnah bearbeiten.

Organisation: {{Unternehmen}}
Position: {{Titel}}
Ort: {{Stadt}}

Sie erhalten in Kürze weitere Informationen von unserem Team.

Mit freundlichen Grüßen,

Das Vertriebsteam

═══════════════════════════════════════════════════════════════
```

**Hinweis**: Das Feld `{{Datum}}` muss auch in der CSV vorhanden sein!
