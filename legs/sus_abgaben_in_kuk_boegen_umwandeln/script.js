/**
 * Haupt-App: Serienbrief-Generator
 */

class SerienriefApp {
    constructor() {
        this.docxFile = null;
        this.csvFile = null;
        this.csvData = [];
        this.pageStructure = [];  // Speichere Seiten-Struktur als Instanzvariable
        this.pageCount = 0;       // Anzahl der Seiten im Template
        
        // Seiten-basierte Schriftgrößen-Einstellungen (pro Seite unterschiedliche Schwellen)
        // Struktur: Array von Seiten, jede Seite hat ein Array von Schwellen
        this.settings = {
            pageFontSizeThresholds: []  // Wird dynamisch basierend auf Seitenanzahl gefüllt
        };

        // Ausgabe-Einstellungen (Panel "Erweiterte Einstellungen")
        //   mode: 'grouped'   -> ein Dokument je Gruppe (Standard)
        //         'single'    -> alles in ein Dokument
        //         'perRecord' -> ein Dokument je Datensatz
        //   groupColumn: '' = automatisch (Klasse/Profil), sonst Spaltenname
        this.outputSettings = {
            mode: 'grouped',
            groupColumn: ''
        };

        this._initializeEventListeners();
    }

    /**
     * Initialisiert Event-Listener
     */
    _initializeEventListeners() {
        // Gemeinsame Upload-Komponente aus toolhub.js (Klick + Drag-and-drop + Badge)
        toolhubUpload({
            input: 'docxFile',
            zone: 'docxZone',
            list: 'docxList',
            extensions: ['.docx'],
            onInvalid: () => this._showStatus('Bitte wählen Sie eine gültige DOCX-Datei.', 'error'),
            onChange: (files) => this._handleDocxUpload(files[0] || null)
        });
        toolhubUpload({
            input: 'csvFile',
            zone: 'csvZone',
            list: 'csvList',
            extensions: ['.csv'],
            onInvalid: () => this._showStatus('Bitte wählen Sie eine gültige CSV-Datei.', 'error'),
            onChange: (files) => this._handleCsvUpload(files[0] || null)
        });

        // Process Button
        document.getElementById('processBtn').addEventListener('click', () => this._processSerienbrief());

        // Download Button
        document.getElementById('downloadAllBtn').addEventListener('click', () => this._downloadAll());

        // Data Overview Button
        document.getElementById('updateDataOverviewBtn').addEventListener('change', () => this._showDataOverview());
        document.getElementById('updateDataOverviewBtn').addEventListener('click', () => this._showDataOverview());
        document.getElementById('longContentThreshold').addEventListener('change', () => this._showDataOverview());

        // Erweiterte Einstellungen: Ausgabe-Modus und Gruppierungsspalte
        document.querySelectorAll('input[name="outputMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.outputSettings.mode = e.target.value;
                this._updateGroupColumnState();
            });
        });
        document.getElementById('groupColumnSelect').addEventListener('change', (e) => {
            this.outputSettings.groupColumn = e.target.value;
        });
    }

    /**
     * Aktiviert bzw. deaktiviert die Auswahl der Gruppierungsspalte –
     * sie ist nur im Modus "gruppiert" relevant.
     */
    _updateGroupColumnState() {
        const row = document.getElementById('groupColumnRow');
        const select = document.getElementById('groupColumnSelect');
        const active = this.outputSettings.mode === 'grouped';
        select.disabled = !active;
        row.classList.toggle('disabled', !active);
    }

    /**
     * Füllt die Auswahl der Gruppierungsspalte mit den CSV-Spalten.
     * Die aktuelle Auswahl bleibt erhalten, sofern die Spalte weiter existiert.
     */
    _populateGroupColumnSelect() {
        const select = document.getElementById('groupColumnSelect');

        // Alle vorkommenden Spaltennamen sammeln (Reihenfolge des ersten Auftretens)
        const columns = [];
        const seen = new Set();
        this.csvData.forEach(record => {
            Object.keys(record).forEach(key => {
                if (!seen.has(key)) {
                    seen.add(key);
                    columns.push(key);
                }
            });
        });

        const previous = this.outputSettings.groupColumn;
        select.innerHTML = '<option value="">Automatisch (Klasse/Profil)</option>';
        columns.forEach(col => {
            const option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            select.appendChild(option);
        });

        // Vorherige Auswahl wiederherstellen, falls die Spalte noch existiert
        if (previous && seen.has(previous)) {
            select.value = previous;
        } else {
            select.value = '';
            this.outputSettings.groupColumn = '';
        }
    }

    /**
     * Initialisiert die Schriftgrößen-Einstellungen für alle Seiten
     * @param {number} pageCount - Anzahl der Seiten
     */
    _initializePageFontSettings(pageCount) {
        // Default-Schwellen für alle Seiten
        const defaultThresholds = [
            { threshold: 0, size: 11 },
            { threshold: 500, size: 10 },
            { threshold: 1000, size: 9 },
            { threshold: 1500, size: 8 }
        ];

        // Erstelle Einstellungen für jede Seite
        this.settings.pageFontSizeThresholds = [];
        for (let i = 0; i < pageCount; i++) {
            // Kopiere Default-Schwellen für diese Seite
            this.settings.pageFontSizeThresholds.push(
                defaultThresholds.map(t => ({ ...t }))
            );
        }
    }

    /**
     * Rendert die UI für Schriftgrößen-Einstellungen pro Seite
     */
    _renderFontSizeSettings() {
        const container = document.getElementById('fontTierContainer');
        if (!container) return;

        container.innerHTML = '';

        // Ohne Vorlage nur den Platzhalter-Hinweis anzeigen
        if (this.pageCount === 0) {
            const placeholder = document.createElement('p');
            placeholder.className = 'placeholder';
            placeholder.textContent = 'Die Einstellungen erscheinen, sobald eine DOCX-Vorlage ausgewählt wurde.';
            container.appendChild(placeholder);
            return;
        }

        // Für jede Seite ein Einstellungs-Block
        for (let pageIdx = 0; pageIdx < this.pageCount; pageIdx++) {
            const pageThresholds = this.settings.pageFontSizeThresholds[pageIdx];

            // Wrapper pro Seite, damit Überschrift keinen seitlichen Versatz erzeugt
            const pageGroup = document.createElement('div');
            pageGroup.className = 'page-group';

            const pageTitle = document.createElement('div');
            pageTitle.className = 'page-title';
            pageTitle.textContent = `Seite ${pageIdx + 1}`;
            pageGroup.appendChild(pageTitle);

            // Vier Schwellen pro Seite
            for (let tierIdx = 0; tierIdx < 4; tierIdx++) {
                const threshold = pageThresholds[tierIdx];
                
                const tierDiv = document.createElement('div');
                tierDiv.className = 'font-tier';

                const sizeLabel = document.createElement('label');
                sizeLabel.htmlFor = `fontSize_p${pageIdx}_t${tierIdx}`;
                sizeLabel.textContent = `Stufe ${tierIdx + 1} - Schriftgröße (pt):`;

                const sizeInput = document.createElement('input');
                sizeInput.type = 'number';
                sizeInput.id = `fontSize_p${pageIdx}_t${tierIdx}`;
                sizeInput.value = threshold.size;
                sizeInput.min = '6';
                sizeInput.max = '24';
                sizeInput.step = '0.5';
                sizeInput.addEventListener('change', (e) => {
                    this.settings.pageFontSizeThresholds[pageIdx][tierIdx].size = parseFloat(e.target.value);
                });

                const thresholdLabel = document.createElement('label');
                thresholdLabel.htmlFor = `fontThreshold_p${pageIdx}_t${tierIdx}`;
                if (tierIdx === 0) {
                    thresholdLabel.textContent = 'ab 0 Zeichen (Standard)';
                } else {
                    thresholdLabel.textContent = 'ab (Zeichen pro Seite):';
                }

                const thresholdInput = document.createElement('input');
                thresholdInput.type = 'number';
                thresholdInput.id = `fontThreshold_p${pageIdx}_t${tierIdx}`;
                thresholdInput.value = threshold.threshold;
                thresholdInput.min = '0';
                thresholdInput.max = '100000';
                thresholdInput.step = '50';
                if (tierIdx === 0) {
                    thresholdInput.disabled = true;
                }
                thresholdInput.addEventListener('change', (e) => {
                    this.settings.pageFontSizeThresholds[pageIdx][tierIdx].threshold = parseInt(e.target.value);
                });

                tierDiv.appendChild(sizeLabel);
                tierDiv.appendChild(sizeInput);
                tierDiv.appendChild(thresholdLabel);
                tierDiv.appendChild(thresholdInput);
                pageGroup.appendChild(tierDiv);
            }

            container.appendChild(pageGroup);
        }
    }

    /**
     * Aktualisiert Button-Status
     */
    _updateProcessButton() {
        const button = document.getElementById('processBtn');
        const overviewBtn = document.getElementById('updateDataOverviewBtn');
        const hasData = this.docxFile && this.csvData.length > 0;
        button.disabled = !hasData;
        overviewBtn.disabled = !(this.csvData.length > 0);
    }

    /**
     * Verarbeitet DOCX-Upload (file = null, wenn die Datei entfernt wurde)
     */
    async _handleDocxUpload(file) {
        if (!file) {
            this.docxFile = null;
            this.pageStructure = [];
            this.pageCount = 0;
            this._renderFontSizeSettings();
            this._updateProcessButton();
            return;
        }

        this.docxFile = file;

        // Lade Seiten-Struktur aus DOCX
        try {
            const zip = await DOCXHandler.loadDOCX(file);
            const xmlDoc = await DOCXHandler.getDocumentXML(zip);
            this.pageStructure = this._extractPageStructure(xmlDoc);
            this.pageCount = this.pageStructure.length;

            // Fallback: Falls keine Felder gefunden, nutze geschätzte Seitenzahl
            if (this.pageCount === 0) {
                this.pageCount = DOCXHandler.estimatePageCount(xmlDoc);
                this.pageStructure = Array.from({ length: this.pageCount }, () => []);
            }

            // Generiere Einstellungen basierend auf Seitenanzahl
            this._initializePageFontSettings(this.pageCount);

            // Aktualisiere UI mit Seiten-spezifischen Einstellungen
            this._renderFontSizeSettings();
        } catch (err) {
            console.warn('Konnte Seiten-Struktur nicht extrahieren:', err);
            this.pageStructure = [];
            this.pageCount = 0;
        }

        this._updateProcessButton();
    }

    /**
     * Verarbeitet CSV-Upload (file = null, wenn die Datei entfernt wurde)
     */
    _handleCsvUpload(file) {
        if (!file) {
            this.csvData = [];
            document.getElementById('dataOverviewSection').style.display = 'none';
            document.getElementById('preview').style.display = 'none';
            document.getElementById('downloadSection').style.display = 'none';
            this._populateGroupColumnSelect();
            this._updateProcessButton();
            return;
        }

        toolhubReadCsv(file).then(({ rows }) => {
            this.csvData = rows;

            if (this.csvData.length === 0) {
                throw new Error('CSV enthält keine Datensätze');
            }

            this._populateGroupColumnSelect();
            this._updateProcessButton();
            this._showStatus(`✓ CSV erfolgreich geladen: ${this.csvData.length} Datensätze`, 'success');
        }).catch(error => {
            this.csvData = [];
            this._updateProcessButton();
            this._showStatus(`CSV-Fehler: ${error.message}`, 'error');
        });
    }

    /**
     * Zeigt permanente Übersicht mit Datensätzen, die lange Inhalte enthalten
     */
    _showDataOverview() {
        const threshold = parseInt(document.getElementById('longContentThreshold').value) || 100;

        if (this.csvData.length === 0) {
            document.getElementById('dataOverviewSection').style.display = 'none';
            return;
        }

        // Finde Spalten mit Werten, die Schwellenwert überschreiten
        const columnsWithLongContent = this._getColumnsWithLongContent(this.csvData, threshold);

        if (columnsWithLongContent.length === 0) {
            document.getElementById('dataOverviewSection').style.display = 'none';
            return;
        }

        // Rendere Tabelle
        this._renderDataOverviewTable(this.csvData, columnsWithLongContent, threshold);

        // Zeige Sektion
        document.getElementById('dataOverviewSection').style.display = 'block';
    }

    /**
     * Findet Spalten, in denen mindestens ein Wert den Schwellenwert überschreitet
     */
    _getColumnsWithLongContent(data, threshold) {
        const columns = new Set();

        for (const record of data) {
            for (const [key, value] of Object.entries(record)) {
                const text = (value || '').toString();
                if (text.length > threshold) {
                    columns.add(key);
                }
            }
        }

        return Array.from(columns).sort();
    }

    /**
     * Bestimmt Farbklasse basierend auf Schwellenwert-Vielfachen
     */
    _getColorTierClass(charCount, threshold) {
        if (charCount < threshold) return '';
        const factor = Math.floor(charCount / threshold);
        if (factor >= 4) return 'cell-tier-4';
        if (factor >= 3) return 'cell-tier-3';
        if (factor >= 2) return 'cell-tier-2';
        return 'cell-tier-1';
    }

    /**
     * Extrahiert die Seiten-Struktur aus einem DOCX XML
     * Gibt Array zurück mit Infos pro Seite
     */
    _extractPageStructure(xmlDoc) {
        const ns = {
            w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        };

        const pages = [];
        const paragraphs = xmlDoc.getElementsByTagNameNS(ns.w, 'p');
        let currentPageFields = [];

        for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];
            
            // Suche nach {{...}} Feldern in diesem Paragraph
            const runs = para.getElementsByTagNameNS(ns.w, 'r');
            for (let j = 0; j < runs.length; j++) {
                const textElements = runs[j].getElementsByTagNameNS(ns.w, 't');
                for (let k = 0; k < textElements.length; k++) {
                    const text = textElements[k].textContent || '';
                    const matches = text.match(/\{\{([^}]+)\}\}/g);
                    if (matches) {
                        matches.forEach(match => {
                            const fieldName = match.slice(2, -2);
                            currentPageFields.push(fieldName);
                        });
                    }
                }
            }
            
            // Prüfe auf Seitenumbruch
            const hasPageBreak = this._paragraphHasPageBreak(para, ns);
            if (hasPageBreak) {
                // Seite abschließen, auch wenn keine Felder enthalten sind
                pages.push(currentPageFields);
                currentPageFields = [];
            }
        }

        // Füge letzte Seite hinzu (auch wenn sie keine Felder enthält)
        pages.push(currentPageFields);

        return pages;
    }

    /**
     * Prüft, ob ein Paragraph einen Seitenumbruch enthält
     */
    _paragraphHasPageBreak(para, ns) {
        const runs = para.getElementsByTagNameNS(ns.w, 'r');
        for (let i = 0; i < runs.length; i++) {
            const breaks = runs[i].getElementsByTagNameNS(ns.w, 'br');
            for (let j = 0; j < breaks.length; j++) {
                const breakType = breaks[j].getAttributeNS(ns.w, 'type');
                if (breakType === 'page') {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Berechnet die Zeichenanzahl pro Seite für einen Datensatz
     * Zählt nur die Felder, die in pageStructure definiert sind
     * Ergänzt fehlende Spalten aus columns pro Seite
     */
    _getCharCountPerPage(record, pageStructure, columns = []) {
        // Wenn keine Spalten vorhanden, nutze nur pageStructure
        if (columns.length === 0) {
            return pageStructure.map(fieldNames => {
                let charCount = 0;
                fieldNames.forEach(fieldName => {
                    const value = (record[fieldName] || record[fieldName.toLowerCase()] || '').toString();
                    charCount += value.length;
                });
                return charCount;
            });
        }

        // Verteile columns auf Seiten basierend auf ihrer Reihenfolge
        const columnsPerPage = Math.ceil(columns.length / pageStructure.length);
        
        return pageStructure.map((fieldNames, pageIdx) => {
            let charCount = 0;
            
            // Zähle Felder aus pageStructure
            fieldNames.forEach(fieldName => {
                const value = (record[fieldName] || record[fieldName.toLowerCase()] || '').toString();
                charCount += value.length;
            });
            
            // Zähle zugewiesene columns für diese Seite
            const startColIdx = pageIdx * columnsPerPage;
            const endColIdx = Math.min(startColIdx + columnsPerPage, columns.length);
            
            for (let i = startColIdx; i < endColIdx; i++) {
                const col = columns[i];
                // Nutze nur Spalten, die nicht bereits in fieldNames sind
                if (!fieldNames.includes(col)) {
                    const value = (record[col] || record[col.toLowerCase()] || '').toString();
                    charCount += value.length;
                }
            }
            
            return charCount;
        });
    }


    /**
     * Rendert die permanente Datensätze-Übersichtstabelle
     */
    _renderDataOverviewTable(data, columns, threshold) {
        const container = document.getElementById('dataOverviewContainer');
        container.innerHTML = '';

        // Bestimme die Gruppierungsspalte (Klasse oder Profil)
        const hasClassColumn = data.some(r => Object.prototype.hasOwnProperty.call(r, 'Klasse'));
        const hasProfileColumn = data.some(r => Object.prototype.hasOwnProperty.call(r, 'Profil'));
        const groupingColumn = hasClassColumn ? 'Klasse' : (hasProfileColumn ? 'Profil' : 'Klasse');

        // Nutze die geladene Seiten-Struktur; falls leer, erstelle Platzhalter basierend auf pageCount
        let pageStructure = this.pageStructure || [];
        if ((!pageStructure || pageStructure.length === 0) && this.pageCount > 0) {
            pageStructure = Array.from({ length: this.pageCount }, () => []);
        }

        // Erstelle Tabelle
        const table = document.createElement('table');
        table.className = 'data-overview-table-element';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Baue Header zusammen
        let headerHtml = '<th>Datensatz #</th><th>Vorname</th><th>Nachname</th><th>' + groupingColumn + '</th>';
        headerHtml += columns.map(col => `<th>${col}</th>`).join('');
        headerHtml += '<th>Summe</th>';
        
        // Füge Seiten-Spalten hinzu (wenn Seiten vorhanden)
        if (pageStructure.length > 0) {
            for (let p = 0; p < pageStructure.length; p++) {
                headerHtml += `<th>S${p + 1}</th>`;
            }
        }
        
        headerRow.innerHTML = headerHtml;
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');

        // Sammle zuerst alle Zeilen, filtere nach Schwellenwert und sortiere später nach Summe
        const displayedRows = [];
        for (let i = 0; i < data.length; i++) {
            const record = data[i];

            let hasLongContent = false;
            let rowSum = 0;
            let cellsHtml = `<td class="row-num">${i + 1}</td>`;
            // Identifikations-Spalten für bessere Auffindbarkeit (case-insensitive keys)
            const vorname = (record['Vorname'] || record['vorname'] || '').toString();
            const nachname = (record['Nachname'] || record['nachname'] || '').toString();
            const groupValue = (record[groupingColumn] || record[groupingColumn.toLowerCase()] || '').toString();
            cellsHtml += `<td class="id-cell col-1">${vorname}</td>`;
            cellsHtml += `<td class="id-cell col-2">${nachname}</td>`;
            cellsHtml += `<td class="id-cell col-3">${groupValue}</td>`;

            for (const col of columns) {
                const value = (record[col] || record[col.toLowerCase()] || '').toString();
                const charCount = value.length;
                rowSum += charCount;

                if (charCount > threshold) {
                    hasLongContent = true;
                }

                const tierClass = this._getColorTierClass(charCount, threshold);
                cellsHtml += `<td class="${tierClass}">${charCount}</td>`;
            }

            // Summen-Spalte
            const sumTierClass = this._getColorTierClass(rowSum, threshold * columns.length);
            cellsHtml += `<td class="cell-sum ${sumTierClass}">${rowSum}</td>`;

            // Seiten-Zeichenanzahlen hinzufügen (falls Seiten vorhanden)
            let pageCharCounts = [];
            if (pageStructure.length > 0) {
                pageCharCounts = this._getCharCountPerPage(record, pageStructure, columns);
                pageCharCounts.forEach(charCount => {
                    const pageTierClass = this._getColorTierClass(charCount, threshold * columns.length);
                    cellsHtml += `<td class="${pageTierClass}">${charCount}</td>`;
                });
            }

            if (hasLongContent) {
                displayedRows.push({ html: cellsHtml, sum: rowSum, pageCharCounts: pageCharCounts });
            }
        }

        // Sortiere absteigend nach Summe (größte Summe oben)
        displayedRows.sort((a, b) => b.sum - a.sum);

        // Hänge sortierte Zeilen an den tbody an
        displayedRows.forEach((r) => {
            const row = document.createElement('tr');
            row.innerHTML = r.html;
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        const tableWrap = document.createElement('div');
        tableWrap.className = 'table-wrap';
        tableWrap.appendChild(table);
        container.appendChild(tableWrap);

        // Info-Text
        const info = document.createElement('p');
        info.className = 'data-overview-info';
        let infoText = `Zeigt Zeichenanzahl pro Zelle. Nur Datensätze mit mindestens einem Wert > ${threshold} Zeichen werden angezeigt.`;
        if (pageStructure.length > 0) {
            infoText += ` Spalten S1–S${pageStructure.length} zeigen Zeichenanzahlen pro Seite.`;
        }
        info.textContent = infoText;
        container.appendChild(info);

        // Legende
        const legend = document.createElement('div');
        legend.className = 'data-overview-legend';
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-box cell-tier-1"></div>
                <span>≥ ${threshold} (1x)</span>
            </div>
            <div class="legend-item">
                <div class="legend-box cell-tier-2"></div>
                <span>≥ ${threshold * 2} (2x)</span>
            </div>
            <div class="legend-item">
                <div class="legend-box cell-tier-3"></div>
                <span>≥ ${threshold * 3} (3x)</span>
            </div>
            <div class="legend-item">
                <div class="legend-box cell-tier-4"></div>
                <span>≥ ${threshold * 4} (4x)</span>
            </div>
        `;
        container.appendChild(legend);
    }

    /**
     * Bestimmt die Spalte, nach der gruppiert wird.
     * Leere Auswahl ('') bedeutet automatisch: bevorzugt 'Klasse', sonst 'Profil'.
     * Gibt null zurück, wenn keine passende Spalte gefunden wird.
     */
    _resolveGroupingColumn() {
        const chosen = this.outputSettings.groupColumn;
        if (chosen) return chosen;

        const hasClassColumn = this.csvData.some(r => Object.prototype.hasOwnProperty.call(r, 'Klasse'));
        const hasProfileColumn = this.csvData.some(r => Object.prototype.hasOwnProperty.call(r, 'Profil'));
        return hasClassColumn ? 'Klasse' : (hasProfileColumn ? 'Profil' : null);
    }

    /**
     * Stellt die Ausgabedokumente als Liste { name, label, records } zusammen –
     * abhängig vom gewählten Ausgabe-Modus. Die Reihenfolge der (bereits sortierten)
     * Datensätze bleibt innerhalb der Gruppen erhalten.
     */
    _buildOutputUnits() {
        const mode = this.outputSettings.mode;

        // Ein Dokument je Datensatz
        if (mode === 'perRecord') {
            return this.csvData.map((record, i) => ({
                name: `Serienbrief_${i + 1}.docx`,
                label: `Datensatz ${i + 1}`,
                records: [record]
            }));
        }

        // Alles in ein Dokument
        if (mode === 'single') {
            return [{
                name: 'Serienbriefe_gesamt.docx',
                label: '(alle)',
                records: this.csvData.slice()
            }];
        }

        // Gruppiert (Standard) – nach automatisch erkannter oder gewählter Spalte
        const col = this._resolveGroupingColumn();
        if (!col) {
            // Keine Gruppierungsspalte vorhanden -> alles in ein Dokument
            return [{
                name: 'Serienbriefe_gesamt.docx',
                label: '(alle)',
                records: this.csvData.slice()
            }];
        }

        const groups = {};
        const order = [];
        this.csvData.forEach(record => {
            const key = (record[col] || 'UNCLASSIFIED').toString();
            if (!groups[key]) {
                groups[key] = [];
                order.push(key);
            }
            groups[key].push(record);
        });

        return order.map(key => {
            const safeKey = key.replace(/[^a-z0-9\-_\.]/gi, '_');
            return {
                name: `Serienbrief_${col}_${safeKey}.docx`,
                label: key,
                records: groups[key]
            };
        });
    }

    /**
     * Baut aus einer Liste von Datensätzen ein einzelnes DOCX: Für jeden Datensatz
     * wird das Template mit ausgefüllten Feldern angehängt, dazwischen ein
     * Seitenumbruch. Bei nur einem Datensatz entsteht ein einseitiger Bogen.
     */
    async _buildCombinedDoc(xmlDoc, records, originalBuffer) {
        const ns = { w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' };

        const newZip = await JSZip.loadAsync(originalBuffer);
        const mainXml = await DOCXHandler.getDocumentXML(newZip);

        // Body leeren, danach die Datensätze nacheinander einfügen
        const mainBody = mainXml.getElementsByTagNameNS(ns.w, 'body')[0];
        while (mainBody.firstChild) mainBody.removeChild(mainBody.firstChild);

        for (let i = 0; i < records.length; i++) {
            // Template klonen und Serienbrieffelder ersetzen
            const xmlClone = xmlDoc.cloneNode(true);
            DOCXHandler.replaceMailMergeFields(xmlClone, records[i], this.settings);

            const cloneBody = xmlClone.getElementsByTagNameNS(ns.w, 'body')[0];
            for (const child of Array.from(cloneBody.childNodes)) {
                mainBody.appendChild(mainXml.importNode(child, true));
            }

            // Seitenumbruch zwischen Datensätzen (nicht nach dem letzten)
            if (i < records.length - 1) {
                const p = mainXml.createElementNS(ns.w, 'w:p');
                const r = mainXml.createElementNS(ns.w, 'w:r');
                const br = mainXml.createElementNS(ns.w, 'w:br');
                br.setAttributeNS(ns.w, 'w:type', 'page');
                r.appendChild(br);
                p.appendChild(r);
                mainBody.appendChild(p);
            }
        }

        await DOCXHandler.saveDocumentXML(newZip, mainXml);
        return newZip.generateAsync({ type: 'blob' });
    }

    /**
     * Verarbeitet die Serienbriefe
     */
    async _processSerienbrief() {
        try {
            this._showStatus('Verarbeite Serienbriefe...', 'info');

            // Deaktiviere Button während Verarbeitung
            document.getElementById('processBtn').disabled = true;

            // Lade DOCX
            const zip = await DOCXHandler.loadDOCX(this.docxFile);
            const xmlDoc = await DOCXHandler.getDocumentXML(zip);

            // Sortiere CSV-Daten nach Priorität: Klasse, Nachname, Vorname
            // Normalisiert dabei Groß-/Kleinschreibung und fehlende Werte werden als '' behandelt
            try {
                this.csvData.sort((a, b) => {
                    const keys = ['Klasse', 'Nachname', 'Vorname'];
                    for (const key of keys) {
                        const va = (a[key] || '').toString().trim().toLowerCase();
                        const vb = (b[key] || '').toString().trim().toLowerCase();
                        if (va < vb) return -1;
                        if (va > vb) return 1;
                        // sonst weiter zur nächsten Priorität
                    }
                    return 0;
                });
            } catch (e) {
                // Falls Sortieren fehlschlägt, fahre ohne Sortierung fort
                console.warn('CSV-Sortierung fehlgeschlagen, fahre ohne Sortierung fort.', e);
            }

            // Zeige Vorschau (nun geordnet)
            await this._showPreview(xmlDoc);

            // Speichere generierte Dokumente
            this.generatedDocs = [];

            // Ausgabedokumente je nach Einstellung bestimmen (gruppiert, alles in
            // einem Dokument oder ein Dokument je Datensatz)
            const units = this._buildOutputUnits();

            // Rohdaten-Buffer der Original-DOCX (wird zur Erzeugung neuer ZIPs verwendet)
            const originalBuffer = await this.docxFile.arrayBuffer();

            for (let u = 0; u < units.length; u++) {
                const unit = units[u];
                const finalBlob = await this._buildCombinedDoc(xmlDoc, unit.records, originalBuffer);
                this.generatedDocs.push({
                    name: unit.name,
                    blob: finalBlob,
                    group: unit.label,
                    count: unit.records.length
                });

                // Update Progress
                const progress = Math.round((u + 1) / units.length * 100);
                this._showStatus(`Verarbeitet: ${progress}%`, 'info');
            }

            // Zeige Download-Section
            document.getElementById('downloadSection').style.display = 'block';
            document.getElementById('downloadInfo').textContent = `${this.generatedDocs.length} Serienbriefe bereit zum Download`;

            this._showStatus(`✓ ${this.generatedDocs.length} Serienbriefe erfolgreich generiert!`, 'success');

        } catch (error) {
            this._showStatus(`Fehler: ${error.message}`, 'error');
            console.error(error);
        } finally {
            document.getElementById('processBtn').disabled = false;
        }
    }

    /**
     * Zeigt Statistik-Vorschau mit Datensätzen pro Klasse und erwarteter Seitenzahl
     */
    async _showPreview(xmlDoc) {
        const previewContent = document.getElementById('previewContent');
        previewContent.innerHTML = '';

        // Schätze die Seitenzahl des Template-DOCX
        const templatePages = DOCXHandler.estimatePageCount(xmlDoc);

        // Die Übersicht orientiert sich an der aktuell aufgelösten Gruppierungsspalte
        // (gewählt oder automatisch Klasse/Profil) – unabhängig vom Ausgabe-Modus.
        const groupingColumn = this._resolveGroupingColumn();
        const groupHeader = groupingColumn || 'Gruppe';

        let stats = [];

        if (groupingColumn) {
            // Gruppiere Datensätze nach Gruppierungsspalte
            const groups = {};
            this.csvData.forEach((record) => {
                const key = (record[groupingColumn] || 'UNCLASSIFIED').toString();
                if (!groups[key]) groups[key] = [];
                groups[key].push(record);
            });

            // Erstelle Statistiken
            stats = Object.keys(groups)
                .sort()
                .map(key => ({
                    klasse: key,
                    recordCount: groups[key].length,
                    expectedPages: groups[key].length * templatePages
                }));
        } else {
            // Fallback: alle Datensätze als eine Gruppe
            stats = [{
                klasse: '(alle)',
                recordCount: this.csvData.length,
                expectedPages: this.csvData.length * templatePages
            }];
        }

        // Erstelle HTML-Tabelle
        const table = document.createElement('table');
        table.className = 'statistics-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>${toolhubEscapeHtml(groupHeader)}</th>
            <th>Abgaben</th>
            <th>Seitenzahl (Vorlage)</th>
            <th>Erwartete Seiten</th>
        `;
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        let totalRecords = 0;
        let totalPages = 0;

        for (const stat of stats) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${stat.klasse}</td>
                <td>${stat.recordCount}</td>
                <td>${templatePages}</td>
                <td>${stat.expectedPages}</td>
            `;
            tbody.appendChild(row);
            totalRecords += stat.recordCount;
            totalPages += stat.expectedPages;
        }

        // Gesamt-Zeile
        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>GESAMT</strong></td>
            <td><strong>${totalRecords}</strong></td>
            <td><strong>${templatePages}</strong></td>
            <td><strong>${totalPages}</strong></td>
        `;
        tbody.appendChild(totalRow);

        table.appendChild(tbody);
        const tableWrap = document.createElement('div');
        tableWrap.className = 'table-wrap';
        tableWrap.appendChild(table);
        previewContent.appendChild(tableWrap);

        // Beschreibe den gewählten Ausgabe-Modus und die Anzahl der Dokumente
        const units = this._buildOutputUnits();
        let modeText;
        if (this.outputSettings.mode === 'single') {
            modeText = 'Alles in ein Dokument';
        } else if (this.outputSettings.mode === 'perRecord') {
            modeText = 'Ein Dokument je Datensatz';
        } else {
            modeText = `Gruppiert nach „${groupHeader}“ – ein Dokument je Gruppe`;
        }

        // Zeige Info-Text
        const infoDiv = document.createElement('div');
        infoDiv.className = 'statistics-info';
        infoDiv.innerHTML = `
            <p>Vorlage: ${templatePages} Seite(n) |
               Gesamt Datensätze: ${totalRecords} |
               Erwartete Gesamtseiten: ${totalPages}</p>
            <p>Ausgabe: ${toolhubEscapeHtml(modeText)} → ${units.length} Dokument(e)</p>
        `;
        previewContent.appendChild(infoDiv);

        document.getElementById('preview').style.display = 'block';
    }

    /**
     * Extrahiert Text aus XML Document
     */
    _extractTextFromXML(xmlDoc) {
        const ns = {
            w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        };

        let text = '';
        const textElements = xmlDoc.getElementsByTagNameNS(ns.w, 't');
        
        for (let i = 0; i < textElements.length; i++) {
            text += textElements[i].textContent;
        }

        return text;
    }

    /**
     * Lädt alle Serienbriefe als ZIP herunter
     */
    async _downloadAll() {
        try {
            this._showStatus('Erstelle ZIP-Datei...', 'info');

            const zip = new JSZip();

            for (const doc of this.generatedDocs) {
                zip.file(doc.name, doc.blob);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            toolhubDownload(zipBlob, 'Serienbriefe.zip');

            this._showStatus(`✓ ZIP erfolgreich heruntergeladen!`, 'success');
        } catch (error) {
            this._showStatus(`Fehler beim Download: ${error.message}`, 'error');
            console.error(error);
        }
    }

    /**
     * Zeigt Statusmeldung
     */
    _showStatus(message, type = 'info') {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status-message show ${type}`;

        // Auto-Hide nach 5 Sekunden (außer bei Fehlern)
        if (type !== 'error') {
            setTimeout(() => {
                if (status.classList.contains(type)) {
                    status.classList.remove('show');
                }
            }, 5000);
        }
    }
}

// Initialisiere App bei Document Ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SerienriefApp();
});
