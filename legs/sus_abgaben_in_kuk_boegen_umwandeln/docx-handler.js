/**
 * DOCX-Handler: Manipuliert DOCX-Dateien (basierend auf ZIP und XML-Struktur)
 */

class DOCXHandler {
    /**
     * Lädt eine DOCX-Datei und gibt eine Kopie zurück, die modifiziert werden kann
     * @param {File} docxFile - Die DOCX-Datei
     * @returns {Promise<JSZip>} JSZip-Objekt der DOCX-Datei
     */
    static async loadDOCX(docxFile) {
        const arrayBuffer = await docxFile.arrayBuffer();
        return JSZip.loadAsync(arrayBuffer);
    }

    /**
     * Extrahiert den Body (Hauptinhalt) aus dem document.xml
     * @param {JSZip} zip - Das JSZip-Objekt
     * @returns {Promise<Document>} Geparst als XML Document
     */
    static async getDocumentXML(zip) {
        const content = await zip.file('word/document.xml').async('string');
        const parser = new DOMParser();
        return parser.parseFromString(content, 'application/xml');
    }

    /**
     * Speichert das modifizierte XML zurück in die ZIP
     * @param {JSZip} zip - Das JSZip-Objekt
     * @param {Document} xmlDoc - Das modifizierte XML Document
     */
    static async saveDocumentXML(zip, xmlDoc) {
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(xmlDoc);
        zip.file('word/document.xml', xmlString);
    }

    /**
     * Ersetzt Serienbrieffelder und wendet seiten-basierte Schriftgrößen an
     * @param {Document} xmlDoc - Das XML Document
     * @param {Object} data - Daten-Objekt mit Feldnamen und Werten
     * @param {Object} settings - Einstellungen für Schriftgröße
     */
    static replaceMailMergeFields(xmlDoc, data, settings) {
        const ns = {
            w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        };

        // Tracking: Speichere Runs pro Paragraph, die ersetzt wurden
        const replacedRunsByParagraph = new Map();

        // Schritt 1: Ersetze alle Felder und tracke die ersetzen Runs
        const paragraphs = xmlDoc.getElementsByTagNameNS(ns.w, 'p');
        const paragraphsArray = Array.from(paragraphs);

        for (let paraIdx = 0; paraIdx < paragraphsArray.length; paraIdx++) {
            const para = paragraphsArray[paraIdx];
            const replacedRuns = [];
            
            // Wiederhole Ersetzung bis keine Felder mehr gefunden werden
            let maxAttempts = 20;
            while (maxAttempts-- > 0) {
                // Sammle alle Text-Inhalte aus allen Runs
                const runs = Array.from(para.getElementsByTagNameNS(ns.w, 'r'));
                const fullText = this._getFullParagraphText(para, ns);
                
                // Suche nach erstem {{...}} Muster
                const match = fullText.match(/\{\{([^}]+)\}\}/);
                
                if (!match) break; // Keine Felder mehr gefunden
                
                const fieldPattern = match[0];
                const fieldName = match[1];
                const fieldValue = data[fieldName] || '';
                
                // Finde Position des Feldes im Text
                const fieldPosition = fullText.indexOf(fieldPattern);
                
                // Finde welche Runs dieses Feld enthält
                let currentPos = 0;
                let startRunIdx = -1;
                let endRunIdx = -1;
                let startOffset = 0;
                
                for (let i = 0; i < runs.length; i++) {
                    const textElements = runs[i].getElementsByTagNameNS(ns.w, 't');
                    let runLength = 0;
                    for (let j = 0; j < textElements.length; j++) {
                        runLength += (textElements[j].textContent || '').length;
                    }
                    
                    // Prüfe ob Feld in diesem Run beginnt
                    if (startRunIdx === -1 && currentPos <= fieldPosition && fieldPosition < currentPos + runLength) {
                        startRunIdx = i;
                        startOffset = fieldPosition - currentPos;
                    }
                    
                    // Prüfe ob Feld in diesem Run endet
                    if (startRunIdx !== -1 && endRunIdx === -1 && 
                        (fieldPosition + fieldPattern.length) <= (currentPos + runLength)) {
                        endRunIdx = i;
                        break;
                    }
                    
                    currentPos += runLength;
                }
                
                // Wenn Feld komplett in einem Run ist
                if (startRunIdx !== -1 && startRunIdx === endRunIdx) {
                    const run = runs[startRunIdx];
                    this._replaceInSingleRun(run, fieldPattern, fieldValue, ns);
                    replacedRuns.push(run);
                } 
                // Wenn Feld über mehrere Runs verteilt ist
                else if (startRunIdx !== -1 && endRunIdx !== -1) {
                    const affectedRuns = this._replaceAcrossMultipleRuns(runs, startRunIdx, endRunIdx, fieldPattern, fieldValue, ns);
                    replacedRuns.push(...affectedRuns);
                }
            }
            
            // Speichere die ersetzen Runs für diesen Paragraph
            if (replacedRuns.length > 0) {
                replacedRunsByParagraph.set(para, replacedRuns);
            }
        }

        // Schritt 2: Gruppiere Paragraphs nach Seitenumbrüchen und wende Schriftgrößen an
        const pageGroups = this._groupParagraphsByPageBreaks(paragraphsArray, ns);
        
        pageGroups.forEach((pageParas, pageIdx) => {
            // Sammle alle ersethen Runs auf dieser Seite
            let pageCharCount = 0;
            const pageReplacedRuns = [];
            
            pageParas.forEach(para => {
                if (replacedRunsByParagraph.has(para)) {
                    const runs = replacedRunsByParagraph.get(para);
                    runs.forEach(run => {
                        pageReplacedRuns.push(run);
                        const textElements = run.getElementsByTagNameNS(ns.w, 't');
                        for (let j = 0; j < textElements.length; j++) {
                            pageCharCount += (textElements[j].textContent || '').length;
                        }
                    });
                }
            });
            
            // Wenn Seite ersethen Runs enthält, formatiere sie
            if (pageReplacedRuns.length > 0) {
                // Nutze Seiten-spezifische Schwellen
                const fontSize = this.getPageFontSize(pageCharCount, settings, pageIdx);
                pageReplacedRuns.forEach(run => {
                    this._setRunFontSize(run, fontSize, ns);
                });
            }
        });
    }

    /**
     * Ersetzt Feld in einem einzelnen Run (ohne Schriftgröße — wird im Pass 2 gemacht)
     */
    static _replaceInSingleRun(run, fieldPattern, fieldValue, ns) {
        const textElements = run.getElementsByTagNameNS(ns.w, 't');
        
        if (textElements.length > 0) {
            const textEl = textElements[0];
            if (textEl.textContent.includes(fieldPattern)) {
                // Ersetze den Text
                textEl.textContent = textEl.textContent.replace(fieldPattern, fieldValue);
                // Schriftgröße wird später in Pass 2 gesetzt
            }
        }
    }

    /**
     * Ersetzt Feld über mehrere Runs hinweg und gibt betroffene Runs zurück
     */
    static _replaceAcrossMultipleRuns(runs, startRunIdx, endRunIdx, fieldPattern, fieldValue, ns) {
        // Füge alle Runs zwischen Start und End zusammen
        let combinedText = '';
        let allTextElements = [];
        
        for (let i = startRunIdx; i <= endRunIdx; i++) {
            const textElements = Array.from(runs[i].getElementsByTagNameNS(ns.w, 't'));
            textElements.forEach(el => {
                allTextElements.push({ element: el, runIdx: i });
                combinedText += el.textContent || '';
            });
        }
        
        // Sammle alle betroffenen Runs
        const affectedRuns = [];
        for (let i = startRunIdx; i <= endRunIdx; i++) {
            affectedRuns.push(runs[i]);
        }
        
        // Ersetze im kombinierten Text
        if (combinedText.includes(fieldPattern)) {
            const newText = combinedText.replace(fieldPattern, fieldValue);
            
            // Verteile neuen Text wieder auf die Runs (vereinfacht)
            for (let i = 0; i < allTextElements.length; i++) {
                const { element } = allTextElements[i];
                
                // Vereinfachte Variante: Ersetze nur im ersten Element
                if (i === 0) {
                    element.textContent = newText;
                } else {
                    element.textContent = '';
                }
            }
        }
        
        // Gebe betroffene Runs zurück
        return affectedRuns;
    }

    /**
     * Liest den kompletten Text eines Paragraphen aus
     * @param {Element} para - Der w:p Element
     * @param {Object} ns - Namespace-Objekt
     * @returns {string} Der komplette Text des Paragraphen
     */
    static _getFullParagraphText(para, ns) {
        const runs = para.getElementsByTagNameNS(ns.w, 'r');
        let text = '';
        
        for (let i = 0; i < runs.length; i++) {
            const textElements = runs[i].getElementsByTagNameNS(ns.w, 't');
            for (let j = 0; j < textElements.length; j++) {
                text += textElements[j].textContent || '';
            }
        }

        return text;
    }

    /**
     * Berechnet die erforderliche Schriftgröße anhand von vier Stufen und Textlänge
     * @param {string} text - Der Text
     * @param {Object} settings - Einstellungen mit fontSizeTiers Array
     * @returns {number} Die Schriftgröße in Punkten
     */
    /**
     * Berechnet die Schriftgröße basierend auf Seiten-Gesamtzeichenanzahl
     * (seiten-basiert mit Unterstützung für unterschiedliche Schwellen pro Seite)
     * @param {number} pageCharCount - Gesamtzeichenanzahl aller Felder auf einer Seite
     * @param {Object} settings - Einstellungen mit pageFontSizeThresholds (Array oder Objekt)
     * @param {number} pageIdx - Index der Seite (optional, für Auswahl der seitenspezifischen Schwellen)
     * @returns {number} Schriftgröße in Punkt
     */
    static getPageFontSize(pageCharCount, settings, pageIdx = 0) {
        // Bestimme Schwellen für diese Seite
        let thresholds;
        
        if (settings && settings.pageFontSizeThresholds) {
            const thresholdsData = settings.pageFontSizeThresholds;
            
            // Neue Struktur: Array von Arrays (pro Seite unterschiedliche Schwellen)
            if (Array.isArray(thresholdsData) && thresholdsData.length > 0 && Array.isArray(thresholdsData[0])) {
                // Nutze Schwellen für diese Seite, oder Fallback auf erste Seite
                thresholds = thresholdsData[pageIdx] || thresholdsData[0];
            }
            // Alte Struktur: Array von Objekten (global für alle Seiten)
            else if (Array.isArray(thresholdsData)) {
                thresholds = thresholdsData;
            }
            // Fallback
            else {
                thresholds = [
                    { threshold: 0, size: 11 },
                    { threshold: 500, size: 10 },
                    { threshold: 1000, size: 9 },
                    { threshold: 1500, size: 8 }
                ];
            }
        } else {
            thresholds = [
                { threshold: 0, size: 11 },
                { threshold: 500, size: 10 },
                { threshold: 1000, size: 9 },
                { threshold: 1500, size: 8 }
            ];
        }

        // Sortiere Schwellen absteigend, um höchste Schwelle zuerst zu prüfen
        const sortedThresholds = [...thresholds].sort((a, b) => b.threshold - a.threshold);

        // Finde höchste Schwelle, bei der pageCharCount >= threshold
        for (const t of sortedThresholds) {
            if (pageCharCount >= t.threshold) {
                return t.size;
            }
        }

        // Fallback auf erste (niedrigste) Schwelle
        return thresholds[0].size;
    }

    /**
     * VERALTET: Berechnet Schriftgröße feld-basiert (wird nicht mehr verwendet)
     */
    static _calculateFontSize(text, settings) {
        // Fallback für alte Struktur (falls noch vorhanden)
        const pageSize = this.getPageFontSize((text ? text.length : 0), settings);
        return pageSize;
    }

    /**
     * Setzt die Schriftgröße für einen Run (w:r)
     * @param {Element} run - Der w:r Element
     * @param {number} fontSize - Schriftgröße in Punkten
     * @param {Object} ns - Namespace-Objekt
     */
    static _setRunFontSize(run, fontSize, ns) {
        // Finde oder erstelle w:rPr (Run Properties)
        let rPr = run.getElementsByTagNameNS(ns.w, 'rPr')[0];
        
        if (!rPr) {
            rPr = run.ownerDocument.createElementNS(ns.w, 'w:rPr');
            run.insertBefore(rPr, run.firstChild);
        }

        // Finde oder erstelle w:sz (Font Size)
        let sz = rPr.getElementsByTagNameNS(ns.w, 'sz')[0];
        
        if (!sz) {
            sz = run.ownerDocument.createElementNS(ns.w, 'w:sz');
            rPr.appendChild(sz);
        }

        // Word speichert Schriftgröße in halb-Punkten (pt * 2)
        sz.setAttributeNS(ns.w, 'w:val', (fontSize * 2).toString());

        // Auch w:szCs (Complex Script Size) setzen
        let szCs = rPr.getElementsByTagNameNS(ns.w, 'szCs')[0];
        
        if (!szCs) {
            szCs = run.ownerDocument.createElementNS(ns.w, 'w:szCs');
            rPr.appendChild(szCs);
        }

        szCs.setAttributeNS(ns.w, 'w:val', (fontSize * 2).toString());
    }

    /**
     * Gruppiert Paragraphs nach Seitenumbrüchen
     * Seitenumbruch wird erkannt als w:br mit w:type="page"
     * @param {Array} paragraphsArray - Array von Paragraph-Elementen
     * @param {Object} ns - Namespace-Objekt
     * @returns {Array<Array>} Array von Seiten-Gruppen (jede Gruppe ist ein Array von Paragraphs)
     */
    static _groupParagraphsByPageBreaks(paragraphsArray, ns) {
        const pageGroups = [];
        let currentPageGroup = [];

        paragraphsArray.forEach(para => {
            // Prüfe auf Seitenumbruch in diesem Paragraph
            const runs = para.getElementsByTagNameNS(ns.w, 'r');
            let hasPageBreak = false;

            for (let i = 0; i < runs.length; i++) {
                const breaks = runs[i].getElementsByTagNameNS(ns.w, 'br');
                for (let j = 0; j < breaks.length; j++) {
                    const breakType = breaks[j].getAttributeNS(ns.w, 'type');
                    if (breakType === 'page') {
                        hasPageBreak = true;
                        break;
                    }
                }
                if (hasPageBreak) break;
            }

            // Füge Paragraph zur aktuellen Seite hinzu
            currentPageGroup.push(para);

            // Falls Seitenumbruch gefunden, starte neue Seite
            if (hasPageBreak) {
                pageGroups.push(currentPageGroup);
                currentPageGroup = [];
            }
        });

        // Füge letzte Gruppe hinzu (falls nicht leer)
        if (currentPageGroup.length > 0) {
            pageGroups.push(currentPageGroup);
        }

        return pageGroups;
    }

    /**
     * Bestimmt die Seitenzahl eines DOCX-Dokuments anhand von gezählten Seitenumbrüchen
     * Seitenzahl = Anzahl Seitenumbrüche + 1 (erste Seite)
     * @param {Document} xmlDoc - Das XML Document
     * @returns {number} Seitenzahl
     */
    static estimatePageCount(xmlDoc) {
        const ns = {
            w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        };

        // Zähle explizite Seitenumbrüche (w:br mit w:type="page")
        let pageBreaks = 0;
        const breaks = xmlDoc.getElementsByTagNameNS(ns.w, 'br');
        for (let i = 0; i < breaks.length; i++) {
            const breakType = breaks[i].getAttributeNS(ns.w, 'type');
            if (breakType === 'page') {
                pageBreaks++;
            }
        }

        // Seitenzahl = Seitenumbrüche + 1 (erste Seite)
        return pageBreaks + 1;
    }

    /**
     * Generiert DOCX-Datei aus modifiziertem JSZip
     * @param {JSZip} zip - Das modifizierte JSZip-Objekt
     * @param {string} filename - Name der Ausgabedatei
     * @returns {Promise<Blob>} Blob der DOCX-Datei
     */
    static async generateDOCX(zip, filename = 'document.docx') {
        return zip.generateAsync({ type: 'blob' });
    }
}
