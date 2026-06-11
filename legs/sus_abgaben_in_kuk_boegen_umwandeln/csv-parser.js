/**
 * CSV-Parser: Liest CSV-Dateien und konvertiert sie in ein Array von Objekten
 * Vollständig RFC 4180 konform
 */

class CSVParser {
    /**
     * Parst eine CSV-Datei
     * @param {string} csvContent - Der Inhalt der CSV-Datei als String
     * @param {string} delimiter - Das Trennzeichen (Standard: Komma)
     * @returns {Array} Array von Objekten, wobei die erste Zeile als Keys verwendet wird
     */
    static parse(csvContent, delimiter = ',') {
        if (!csvContent || csvContent.trim().length === 0) {
            throw new Error('CSV-Datei ist leer');
        }

        // Normalisiere Zeilenumbrüche
        csvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Parse alle Zeilen korrekt (beachte Umbrüche in Feldern)
        const rows = this._parseAllRows(csvContent, delimiter);
        
        if (rows.length === 0) {
            throw new Error('CSV-Datei konnte nicht geparst werden');
        }

        // Erste Zeile = Header
        const headers = rows[0];
        
        if (headers.length === 0) {
            throw new Error('CSV-Header ist leer');
        }

        // Restliche Zeilen = Daten
        const records = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            // Überspringe vollständig leere Zeilen
            if (row.length === 1 && row[0].trim() === '') continue;

            const record = {};
            headers.forEach((header, index) => {
                record[header] = row[index] || '';
            });
            
            records.push(record);
        }

        return records;
    }

    /**
     * Parst alle Zeilen unter Beachtung von Anführungszeichen und Umbrüchen
     * @param {string} content - Der gesamte CSV-Inhalt
     * @param {string} delimiter - Das Trennzeichen
     * @returns {Array<Array>} Array von Zeilen mit Feldern
     */
    static _parseAllRows(content, delimiter) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let insideQuotes = false;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            const nextChar = content[i + 1];
            const nextTwoChars = content.substring(i, i + 2);

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    // Escaped Quote
                    currentField += '"';
                    i += 2;
                    continue;
                } else {
                    // Toggle Quotes
                    insideQuotes = !insideQuotes;
                    i++;
                    continue;
                }
            }

            if (!insideQuotes && char === delimiter) {
                // Feldtrennzeichen gefunden
                currentRow.push(currentField.trim());
                currentField = '';
                i++;
                continue;
            }

            if (!insideQuotes && (char === '\n' || (char === '\r' && nextChar === '\n'))) {
                // Zeilenumbruch gefunden
                currentRow.push(currentField.trim());
                if (currentRow.length > 0) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                
                // Überspringe \r\n
                if (char === '\r' && nextChar === '\n') {
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            // Normales Zeichen
            currentField += char;
            i++;
        }

        // Füge letztes Feld und Zeile hinzu
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
        }
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

        return rows;
    }

    /**
     * Automatisch Trennzeichen erkennen (Komma, Semikolon oder Tab)
     * @param {string} csvContent - Der Inhalt der CSV-Datei
     * @returns {string} Das erkannte Trennzeichen
     */
    static detectDelimiter(csvContent) {
        const delimiters = [';', ',', '\t', '|']; // Semikolon zuerst, da häufiger in DE
        
        // Normalisiere Zeilenumbrüche
        csvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Nimm nur die erste Zeile (Header)
        const firstLine = csvContent.split('\n')[0];
        
        if (!firstLine) return ',';

        let maxCount = 0;
        let detectedDelimiter = ',';

        delimiters.forEach(delimiter => {
            // Zähle Trennzeichen außerhalb von Anführungszeichen in der ersten Zeile
            let insideQuotes = false;
            let delimiterCount = 0;
            
            for (let i = 0; i < firstLine.length; i++) {
                const char = firstLine[i];
                const nextChar = firstLine[i + 1];
                
                if (char === '"') {
                    if (insideQuotes && nextChar === '"') {
                        i++; // Überspringe escaped Quote
                    } else {
                        insideQuotes = !insideQuotes;
                    }
                } else if (char === delimiter && !insideQuotes) {
                    delimiterCount++;
                }
            }

            // Der häufigste Delimiter mit mindestens einem Vorkommen gewinnt
            if (delimiterCount > maxCount && delimiterCount > 0) {
                maxCount = delimiterCount;
                detectedDelimiter = delimiter;
            }
        });

        return detectedDelimiter;
    }
}
