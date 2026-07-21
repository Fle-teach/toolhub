// Standardwerte für die Förderbedarf-Kriterien (über die Einstellungen anpassbar)
const DEFAULT_SETTINGS = {
    foerderbedarfHauptfach: ["4-", "5+", "5-", "6+"],
    foerderbedarfNebenfach: ["5+", "5-", "6+"],
    hauptfaecher: ["D", "Ma", "E"]
};

// DOM-Elemente
const analyzeBtn = document.getElementById('analyzeBtn');
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
resetSettingsBtn.addEventListener('click', applyDefaultSettings);

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

    for (const file of upload.files) {
        try {
            const workbook = await toolhubReadWorkbook(file);
            const entries = extractFoerderbedarf(workbook, settings);
            resultEntries.push(...entries);
        } catch (error) {
            errors.push(`${file.name}: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        showMessage(['Fehler bei der Auswertung:', ...errors], 'error');
        if (resultEntries.length === 0) {
            resultsSection.classList.remove('visible');
            return;
        }
    }

    displayResults();
}

function extractFoerderbedarf(workbook, settings) {
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

    const entries = [];

    for (let rowIndex = pupilIndex + 1; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex];
        // Zeilen mit 'Total' überspringen (Fußzeile der Tabelle)
        if (row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('total'))) continue;

        const pupilName = row[1]; // Leere Spalte überspringen
        if (!pupilName) continue;

        subjectIndexes.forEach(subjectIndex => {
            const subjectName = jsonData[pupilIndex - 1][subjectIndex];
            const mark = row[subjectIndex];
            const lehrer = lehrerZeile[subjectIndex];

            // Fachkürzel steht ggf. in einer verbundenen Zelle weiter links
            let fachKuerzel = fachZeile[subjectIndex];
            let i = subjectIndex - 1;
            while (subjectName && !fachKuerzel && i > 0) {
                fachKuerzel = fachZeile[i];
                i--;
            }

            const foerderbedarf = settings.hauptfaecher.includes(fachKuerzel)
                ? settings.foerderbedarfHauptfach
                : settings.foerderbedarfNebenfach;

            if (mark && (foerderbedarf.includes(mark) || mark > 4)) {
                entries.push({
                    klasse: klasse,
                    schueler: pupilName,
                    fach: fachKuerzel,
                    lehrkraft: lehrer,
                    note: mark
                });
            }
        });
    }

    return entries;
}

// --- Ergebnisanzeige ---

function displayResults() {
    resultsSection.classList.add('visible');

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
            <div class="group-section">
                <div class="group-header">
                    <h3>Klasse ${toolhubEscapeHtml(klasse)}</h3>
                    <div class="count">${klassenEntries.length} ${klassenEntries.length === 1 ? 'Eintrag' : 'Einträge'}</div>
                </div>
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
            </div>
        `;
    });

    tableContainer.innerHTML = html;
}

function showMessage(text, type) {
    toolhubMessage(messageDiv, text, type);
}

// --- Export & Zurücksetzen ---

exportBtn.addEventListener('click', () => {
    if (resultEntries.length === 0) {
        showMessage('Keine Daten zum Exportieren.', 'error');
        return;
    }

    const rows = [['Klasse', 'Schüler_in', 'Fach', 'Fachlehrkraft', 'Note', 'Angebot']];
    resultEntries.forEach(entry => {
        rows.push([entry.klasse, entry.schueler, entry.fach, entry.lehrkraft, entry.note, '']);
    });

    const alleKlassen = [...new Set(resultEntries.map(e => e.klasse))].map(k => `_${k}`).join('');
    toolhubWriteXlsx({ 'Förderbedarf': rows }, `Übersicht_Förderbedarf${alleKlassen}.xlsx`);
});

resetBtn.addEventListener('click', () => {
    resultEntries = [];
    tableContainer.innerHTML = '';
    resultsSection.classList.remove('visible');
    // leert die Auswahl und setzt über onChange auch Button und Meldung zurück
    upload.clear();
});
