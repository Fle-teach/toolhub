// Standardwerte für die Förderbedarf-Kriterien (über die Einstellungen anpassbar)
const DEFAULT_SETTINGS = {
    foerderbedarfHauptfach: ["4-", "5+", "5-", "6+"],
    foerderbedarfNebenfach: ["5+", "5-", "6+"],
    hauptfaecher: ["D", "Ma", "E"]
};

// DOM-Elemente
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeLabel = document.getElementById('analyzeLabel');
const exportTopBtn = document.getElementById('exportTopBtn');
const nebenfaecherCard = document.getElementById('nebenfaecherCard');
const nebenfaecherOutput = document.getElementById('nebenfaecher');
const messageDiv = document.getElementById('message');
const resultsSection = document.getElementById('resultsSection');
const tableContainer = document.getElementById('tableContainer');
const statKlassen = document.getElementById('statKlassen');
const statSchueler = document.getElementById('statSchueler');
const statEintraege = document.getElementById('statEintraege');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const notenHauptfachInput = document.getElementById('notenHauptfach');
const notenNebenfachInput = document.getElementById('notenNebenfach');
const hauptfaecherInput = document.getElementById('hauptfaecher');

let resultEntries = []; // {klasse, schueler, fach, lehrkraft, note}

// Jede Datei wird nur einmal eingelesen: schon beim Hochladen (für die Liste der
// Nebenfächer), beim Auswerten liegt die Arbeitsmappe dann bereits vor.
const workbookCache = new WeakMap();

function loadWorkbook(file) {
    if (!workbookCache.has(file)) workbookCache.set(file, toolhubReadWorkbook(file));
    return workbookCache.get(file);
}

// --- Einstellungen ---

function applyDefaultSettings() {
    notenHauptfachInput.value = DEFAULT_SETTINGS.foerderbedarfHauptfach.join(', ');
    notenNebenfachInput.value = DEFAULT_SETTINGS.foerderbedarfNebenfach.join(', ');
    hauptfaecherInput.value = DEFAULT_SETTINGS.hauptfaecher.join(', ');
}

function parseListInput(value) {
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function readSettings() {
    const settings = {
        foerderbedarfHauptfach: parseListInput(notenHauptfachInput.value),
        foerderbedarfNebenfach: parseListInput(notenNebenfachInput.value),
        hauptfaecher: parseListInput(hauptfaecherInput.value)
    };
    if (settings.foerderbedarfHauptfach.length === 0 || settings.foerderbedarfNebenfach.length === 0) {
        throw new Error('Bitte für Haupt- und Nebenfach mindestens eine Note angeben (durch Komma getrennt).');
    }
    return settings;
}

applyDefaultSettings();
resetSettingsBtn.addEventListener('click', () => {
    applyDefaultSettings();
    renderNebenfaecher();
});
hauptfaecherInput.addEventListener('input', renderNebenfaecher);

// --- Nebenfächer (nur Anzeige, Gegenstück zu den Hauptfächern) ---

let faecherInDateien = []; // Fachkürzel aller hochgeladenen Notenübersichten, in Spaltenreihenfolge
let faecherStand = 0;      // verwirft Ergebnisse überholter Uploads

async function updateFaecherInDateien(files) {
    const stand = ++faecherStand;
    const faecher = [];
    for (const file of files) {
        try {
            const parsed = parseNotenuebersicht(await loadWorkbook(file));
            parsed.faecher.forEach(fach => {
                if (fach.hatNoten && fach.kuerzel && !faecher.includes(fach.kuerzel)) faecher.push(fach.kuerzel);
            });
        } catch (error) {
            // Fehlerhafte Dateien meldet erst die Auswertung
        }
    }
    if (stand !== faecherStand) return;
    faecherInDateien = faecher;
    renderNebenfaecher();
}

function renderNebenfaecher() {
    nebenfaecherCard.classList.toggle('hidden', upload.files.length === 0);
    const hauptfaecher = parseListInput(hauptfaecherInput.value);
    const nebenfaecher = faecherInDateien.filter(fach => !hauptfaecher.includes(fach));
    nebenfaecherOutput.textContent = nebenfaecher.length > 0 ? nebenfaecher.join(', ') : '–';
}

// --- Dateiauswahl (gemeinsame Upload-Komponente aus toolhub.js) ---

// Merkt sich, ob im aktuellen Upload ungültige Dateien gemeldet wurden,
// damit onChange die Fehlermeldung nicht sofort wieder löscht
let ungueltigGemeldet = false;

const upload = toolhubUpload({
    input: 'fileInput',
    zone: 'uploadBox',
    list: 'fileList',
    extensions: ['.xlsx'],
    onInvalid: (names) => {
        ungueltigGemeldet = true;
        showMessage(`Bitte nur XLSX-Dateien auswählen. Ungültig: ${names.join(', ')}`, 'error');
    },
    onChange: (files) => {
        analyzeBtn.disabled = files.length === 0;
        renderNebenfaecher();
        updateFaecherInDateien(files);
        if (ungueltigGemeldet) {
            ungueltigGemeldet = false;
        } else {
            messageDiv.innerHTML = '';
        }
    }
});

// --- Auswertung ---

analyzeBtn.addEventListener('click', analyzeFiles);

async function analyzeFiles() {
    if (upload.files.length === 0) {
        showMessage('Bitte mindestens eine XLSX-Datei auswählen.', 'error');
        return;
    }

    let settings;
    try {
        settings = readSettings();
    } catch (error) {
        showMessage(error.message, 'error');
        return;
    }

    messageDiv.innerHTML = '';
    resultEntries = [];
    const errors = [];
    const files = upload.files.slice();

    setBusy(true);
    try {
        for (const [index, file] of files.entries()) {
            analyzeLabel.textContent = files.length > 1
                ? `Wird ausgewertet … (${index + 1}/${files.length})`
                : 'Wird ausgewertet …';
            // dem Browser Zeit geben, Beschriftung und Drehkreis zu zeichnen,
            // bevor das Einlesen der Datei den Hauptthread blockiert
            await nextFrame();
            try {
                const workbook = await loadWorkbook(file);
                const entries = extractFoerderbedarf(workbook, settings);
                resultEntries.push(...entries);
            } catch (error) {
                errors.push(`${file.name}: ${error.message}`);
            }
        }
    } finally {
        setBusy(false);
    }

    if (errors.length > 0) {
        showMessage(['Fehler bei der Auswertung:', ...errors], 'error');
        if (resultEntries.length === 0) {
            hideResults();
            return;
        }
    }

    displayResults();
}

function setBusy(busy) {
    analyzeBtn.classList.toggle('busy', busy);
    analyzeBtn.disabled = busy || upload.files.length === 0;
    analyzeBtn.setAttribute('aria-busy', String(busy));
    if (!busy) analyzeLabel.textContent = 'Auswerten';
}

// requestAnimationFrame ruht in verdeckten Tabs – ohne den Zeitgeber als Rückfallebene
// bliebe die Auswertung stehen, sobald man währenddessen den Tab wechselt
function nextFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
        setTimeout(resolve, 100);
    });
}

// Liest Klasse, Fachspalten und Schülerzeilen aus einer DIVIS-Notenübersicht
function parseNotenuebersicht(workbook) {
    const jsonData = toolhubSheetRows(workbook, { header: false });

    // Festes Layout der DIVIS-Notenübersicht:
    // Zeile ab der die Schüler beginnen, Fachkürzel-Zeile und Lehrer-Zeile händisch setzen
    const pupilIndex = 6;
    const fachZeile = jsonData[4];
    const lehrerZeile = jsonData[6];

    if (!jsonData[1] || typeof jsonData[1][2] !== 'string' || !fachZeile || !lehrerZeile) {
        throw new Error('Unerwartetes Dateiformat – ist dies eine von DIVIS generierte Notenübersicht?');
    }

    const klasse = jsonData[1][2].substring(8); // "Klasse: " überspringen

    // Angebots-Spalten dynamisch auf Grundlage des Schlagworts 'Angebot' bestimmen
    let subjectIndexes = [];
    for (const row of jsonData) {
        if (row.includes('Angebot')) {
            subjectIndexes = row.map((cell, index) => cell === 'Angebot' ? null : index).filter(index => index !== null);
            break;
        }
    }

    if (subjectIndexes.length === 0) {
        throw new Error('Schlagwort "Angebot" nicht gefunden – ist dies eine von DIVIS generierte Notenübersicht?');
    }

    const schuelerZeilen = [];
    for (let rowIndex = pupilIndex + 1; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex];
        // Zeilen mit 'Total' überspringen (Fußzeile der Tabelle)
        if (row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('total'))) continue;
        if (!row[1]) continue; // Leere Spalte überspringen
        schuelerZeilen.push(row);
    }

    const faecher = subjectIndexes.map(subjectIndex => {
        const subjectName = jsonData[pupilIndex - 1][subjectIndex];

        // Fachkürzel steht ggf. in einer verbundenen Zelle weiter links
        let kuerzel = fachZeile[subjectIndex];
        let i = subjectIndex - 1;
        while (subjectName && !kuerzel && i > 0) {
            kuerzel = fachZeile[i];
            i--;
        }

        return {
            index: subjectIndex,
            kuerzel: kuerzel,
            lehrer: lehrerZeile[subjectIndex],
            // Unter den Spalten sind auch Nummer und Name der Schüler; als Fach zählt
            // für die Nebenfächer-Liste nur eine Spalte, in der tatsächlich Noten stehen
            hatNoten: schuelerZeilen.some(row => /^[1-6][+-]?$/.test(String(row[subjectIndex] ?? '').trim()))
        };
    });

    return { klasse, faecher, schuelerZeilen };
}

function extractFoerderbedarf(workbook, settings) {
    const { klasse, faecher, schuelerZeilen } = parseNotenuebersicht(workbook);
    const entries = [];

    schuelerZeilen.forEach(row => {
        faecher.forEach(fach => {
            const mark = row[fach.index];

            const foerderbedarf = settings.hauptfaecher.includes(fach.kuerzel)
                ? settings.foerderbedarfHauptfach
                : settings.foerderbedarfNebenfach;

            if (mark && (foerderbedarf.includes(mark) || mark > 4)) {
                entries.push({
                    klasse: klasse,
                    schueler: row[1],
                    fach: fach.kuerzel,
                    lehrkraft: fach.lehrer,
                    note: mark
                });
            }
        });
    });

    return entries;
}

// --- Ergebnisanzeige ---

function displayResults() {
    resultsSection.classList.add('visible');
    exportTopBtn.style.display = resultEntries.length > 0 ? 'inline-flex' : 'none';

    const klassen = [...new Set(resultEntries.map(e => e.klasse))];
    const schueler = new Set(resultEntries.map(e => `${e.klasse}|${e.schueler}`));

    statKlassen.textContent = klassen.length;
    statSchueler.textContent = schueler.size;
    statEintraege.textContent = resultEntries.length;

    if (resultEntries.length === 0) {
        tableContainer.innerHTML = '<div class="no-results"><p>Keine Schülerinnen und Schüler mit Förderbedarf gefunden.</p></div>';
        return;
    }

    let html = '';
    klassen.forEach(klasse => {
        const klassenEntries = resultEntries.filter(e => e.klasse === klasse);
        html += `
            <details class="group-section" open>
                <summary class="group-header">
                    <h3>Klasse ${toolhubEscapeHtml(klasse)}</h3>
                    <div class="count">${klassenEntries.length} ${klassenEntries.length === 1 ? 'Eintrag' : 'Einträge'}</div>
                </summary>
                <table class="pairs-table">
                    <thead>
                        <tr>
                            <th>Schüler/in</th>
                            <th>Fach</th>
                            <th>Fachlehrkraft</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        klassenEntries.forEach(entry => {
            html += `
                <tr>
                    <td>${toolhubEscapeHtml(entry.schueler)}</td>
                    <td>${toolhubEscapeHtml(entry.fach)}</td>
                    <td>${toolhubEscapeHtml(entry.lehrkraft)}</td>
                    <td><span class="note-badge">${toolhubEscapeHtml(entry.note)}</span></td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </details>
        `;
    });

    tableContainer.innerHTML = html;
}

function showMessage(text, type) {
    toolhubMessage(messageDiv, text, type);
}

// --- Export & Zurücksetzen ---

function hideResults() {
    resultsSection.classList.remove('visible');
    exportTopBtn.style.display = 'none';
}

exportBtn.addEventListener('click', exportResults);
exportTopBtn.addEventListener('click', exportResults);

function exportResults() {
    if (resultEntries.length === 0) {
        showMessage('Keine Daten zum Exportieren.', 'error');
        return;
    }

    const rows = [['Klasse', 'Schüler_in', 'Fach', 'Fachlehrkraft', 'Note', 'Angebot']];
    resultEntries.forEach(entry => {
        rows.push([entry.klasse, entry.schueler, entry.fach, entry.lehrkraft, entry.note, '']);
    });

    const alleKlassen = [...new Set(resultEntries.map(e => e.klasse))].map(k => `_${k}`).join('');
    // Übrige Spalten passen sich dem Inhalt an; „Angebot" bleibt leer und wird später
    // von Hand ausgefüllt, braucht dafür also von vornherein Platz (70 Zeichen ≈ 13 cm)
    toolhubWriteXlsx([{ name: 'Förderbedarf', rows, cols: [null, null, null, null, null, 70] }],
        `Übersicht_Förderbedarf${alleKlassen}.xlsx`);
}

resetBtn.addEventListener('click', () => {
    resultEntries = [];
    tableContainer.innerHTML = '';
    hideResults();
    // leert die Auswahl und setzt über onChange auch Button und Meldung zurück
    upload.clear();
});
