const processing = document.getElementById('processing');
const results = document.getElementById('results');
const error = document.getElementById('error');
const summaryStats = document.getElementById('summaryStats');
const subjectFilters = document.getElementById('subjectFilters');
const tableHeader = document.getElementById('tableHeader');
const resultsBody = document.getElementById('resultsBody');

let globalData = null;
let allSubjects = [];

// Gemeinsame Upload-Komponente aus toolhub.js (Klick + Drag-and-drop + Badge)
toolhubUpload({
    input: 'fileInput',
    zone: 'uploadArea',
    list: 'fileList',
    extensions: ['.xlsx'],
    onInvalid: () => showError('Bitte wählen Sie eine XLSX-Datei aus.'),
    onChange: (files) => {
        if (files.length > 0) {
            processFile(files[0]);
        } else {
            // Datei entfernt: Auswertung zurücksetzen
            globalData = null;
            processing.style.display = 'none';
            error.style.display = 'none';
            results.style.display = 'none';
            hideDetailPopup();
        }
    }
});

function showError(message) {
    error.textContent = message;
    error.style.display = 'block';
    processing.style.display = 'none';
    results.style.display = 'none';
}

async function processFile(file) {
    processing.style.display = 'block';
    error.style.display = 'none';
    results.style.display = 'none';

    try {
        analyzeAbsences(toolhubSheetRows(await toolhubReadWorkbook(file)));
    } catch (err) {
        showError('Fehler beim Verarbeiten der Datei: ' + err.message);
    }
}

// Fachname aus einer Zeile der Spalte "Verp. Unterricht" ableiten:
// alles nach "in Kurs " (Jahrgang optional) bis zum optionalen "(...)"-Anhang am Ende.
// Beispiele: '6. Rel in Kurs 11 rel 1 Freu  (Freu)' -> 'rel 1 Freu'
//            '6.  in Kurs 11 phil 3 Yil '           -> 'phil 3 Yil'
//            '2. E Camb in Kurs 12 E cam 1 Frej  (Frej)' -> 'E cam 1 Frej'
//            '8. Mup in Kurs Popchor Dö  (Dö)'      -> 'Popchor Dö'
function extractSubject(line) {
    const match = line.match(/in Kurs\s+(?:\d+\s+)?(.+?)\s*(\([^)]*\))?\s*$/);
    if (match && match[1].trim()) {
        return match[1].trim();
    }
    return 'Unbekannt';
}

function analyzeAbsences(data) {
    const studentSubjectAbsences = {};
    const studentTotals = {}; // Summe aller Fehlstunden pro Schüler (über alle Fächer)
    let totalProcessedRows = 0;
    let totalIgnoredRows = 0;
    const subjects = new Set();
    const processedLessons = new Set(); // Zur Vermeidung von Doppelzählungen (pro Schüler/Datum/Stunde)

    const ensureStudent = (studentName) => {
        if (!studentSubjectAbsences[studentName]) {
            studentSubjectAbsences[studentName] = {};
            studentTotals[studentName] = { total: 0, unexcused: 0, lateMinutes: 0, lateEntries: [] };
        }
    };

    data.forEach(row => {
        const studentName = row.Schüler || row['Schüler'] || '';
        if (!studentName) return;

        // Verspätungen aus der Spalte "Zeitraum" aufsummieren - unabhängig von
        // Fächern und Status, z.B. "1. Std.  (15 Min. zu spät)". Muss vor dem
        // "(keine Fehlzeit)"-Filter passieren, da Verspätungen meist genau
        // diesen Status tragen.
        const zeitraum = String(row.Zeitraum || row['Zeitraum'] || '');
        for (const lateMatch of zeitraum.matchAll(/(\d+)\s*Min\.\s*zu\s*spät/g)) {
            ensureStudent(studentName);
            const minuten = parseInt(lateMatch[1], 10);
            studentTotals[studentName].lateMinutes += minuten;
            // Datum/Zeitraum für die Detail-Ansicht merken
            studentTotals[studentName].lateEntries.push({
                datum: String(row.Datum || row['Datum'] || ''),
                minuten: minuten,
                zeitraum: zeitraum.replace(/\s*\(\d+\s*Min\.\s*zu\s*spät\)\s*/, ' ').trim()
            });
        }

        // Prüfen ob Status "(keine Fehlzeit)" enthält - dann keine Fehlstunden zählen
        if (row.Status && row.Status.includes('(keine Fehlzeit)')) {
            totalIgnoredRows++;
            return;
        }

        const lessons = row['Verp. Unterricht'] || '';
        const status = row.Status || '';
        const datum = row.Datum || row['Datum'] || '';

        if (!lessons) {
            return;
        }

        totalProcessedRows++;

        // Prüfen ob unentschuldigt (alle Varianten)
        const isUnexcused = status.includes('nicht (schriftlich) entschuldigt') ||
                           status.includes('ohne Information - noch offen') ||
                           status.includes('Unentschuldigt') ||
                           status.includes('Attest noch ausstehend');

        ensureStudent(studentName);

        // Verpasste Unterrichtsstunden analysieren
        const lessonLines = String(lessons).split(/\r?\n/);
        const processedHoursThisRow = new Set(); // Bereits verarbeitete Stundennummern in diesem Feld

        lessonLines.forEach(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // Fehlstunden existieren nur hinter einer Nummerierung (z.B. "5.");
            // Zeilen ohne Nummerierung (z.B. nur "-") werden nicht gezählt
            const numberMatch = trimmedLine.match(/^(\d+)\./);
            if (!numberMatch) return;
            const lessonNumber = numberMatch[1];

            // Eindeutigen Schlüssel für diese Unterrichtsstunde erstellen (OHNE Fach!)
            const lessonKey = `${studentName}_${datum}_${lessonNumber}`;

            // Bei doppelter Nummerierung zählt nur das erste Vorkommen
            if (processedLessons.has(lessonKey) || processedHoursThisRow.has(lessonNumber)) {
                return; // Überspringen, da bereits gezählt
            }

            // Stunde als verarbeitet markieren (global und für dieses Feld)
            processedLessons.add(lessonKey);
            processedHoursThisRow.add(lessonNumber);

            const subject = extractSubject(trimmedLine);
            subjects.add(subject);

            // Initialisiere Fach wenn noch nicht vorhanden
            if (!studentSubjectAbsences[studentName][subject]) {
                studentSubjectAbsences[studentName][subject] = {
                    total: 0,
                    unexcused: 0,
                    entries: []
                };
            }

            // Erhöhe Zähler und merke Datum/Stunde für die Detail-Ansicht
            studentSubjectAbsences[studentName][subject].total++;
            studentTotals[studentName].total++;
            studentSubjectAbsences[studentName][subject].entries.push({
                datum: String(datum),
                stunde: parseInt(lessonNumber, 10),
                unexcused: isUnexcused
            });
            if (isUnexcused) {
                studentSubjectAbsences[studentName][subject].unexcused++;
                studentTotals[studentName].unexcused++;
            }
        });
    });

    // Globale Daten speichern
    globalData = {
        studentSubjectAbsences,
        studentTotals,
        totalProcessedRows,
        totalIgnoredRows
    };

    // Alphabetisch sortieren (sprachgerecht, Groß-/Kleinschreibung ignorieren)
    allSubjects = Array.from(subjects).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));

    createSubjectFilters();
    displayResults();
}

function createSubjectFilters() {
    // Standardmäßig ist weder Summe noch Verspätungen noch ein Fach ausgewählt
    subjectFilters.innerHTML = `
        <div class="subject-filter sum-filter">
            <input type="checkbox" id="sumFilter">
            <label for="sumFilter">Summe (alle Fächer)</label>
        </div>
        <div class="subject-filter late-filter">
            <input type="checkbox" id="lateFilter">
            <label for="lateFilter">Verspätungen (alle Fächer, in Min.)</label>
        </div>
    ` + allSubjects.map((subject, index) => `
        <div class="subject-filter">
            <input type="checkbox" id="subject_${index}">
            <label for="subject_${index}">${toolhubEscapeHtml(subject)}</label>
        </div>
    `).join('');
}

// Die Filter-Checkboxen werden bei jedem Einlesen neu erzeugt – daher am
// Container lauschen statt an den einzelnen Feldern
subjectFilters.addEventListener('change', displayResults);

function isSumSelected() {
    const sumFilter = document.getElementById('sumFilter');
    return sumFilter ? sumFilter.checked : false;
}

function isLateSelected() {
    const lateFilter = document.getElementById('lateFilter');
    return lateFilter ? lateFilter.checked : false;
}

function getSelectedSubjects() {
    return allSubjects.filter((subject, index) =>
        document.getElementById(`subject_${index}`).checked
    );
}

function selectAllSubjects() {
    document.getElementById('sumFilter').checked = true;
    document.getElementById('lateFilter').checked = true;
    allSubjects.forEach((subject, index) => {
        document.getElementById(`subject_${index}`).checked = true;
    });
    displayResults();
}

function deselectAllSubjects() {
    document.getElementById('sumFilter').checked = false;
    document.getElementById('lateFilter').checked = false;
    allSubjects.forEach((subject, index) => {
        document.getElementById(`subject_${index}`).checked = false;
    });
    displayResults();
}

function displayResults() {
    if (!globalData) return;

    const { studentSubjectAbsences, studentTotals, totalProcessedRows, totalIgnoredRows } = globalData;
    const selectedSubjects = getSelectedSubjects();

    // Statistiken berechnen (über alle Fächer, unabhängig vom Filter)
    const students = Object.keys(studentSubjectAbsences);
    let totalAbsences = 0;
    let totalUnexcused = 0;
    let totalLateMinutes = 0;

    students.forEach(student => {
        totalAbsences += studentTotals[student].total;
        totalUnexcused += studentTotals[student].unexcused;
        totalLateMinutes += studentTotals[student].lateMinutes;
    });

    // Zusammenfassung anzeigen
    summaryStats.innerHTML = `
        <div class="stat-item">
            <div class="stat-number">${students.length}</div>
            <div class="stat-label">Schüler</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${selectedSubjects.length} / ${allSubjects.length}</div>
            <div class="stat-label">Ausgewählte Fächer</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${totalAbsences}</div>
            <div class="stat-label">Fehlstunden (alle Fächer)</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${totalUnexcused}</div>
            <div class="stat-label">Unentschuldigt (alle Fächer)</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${totalLateMinutes}</div>
            <div class="stat-label">Verspätungen (alle Fächer, in Min.)</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${totalProcessedRows}</div>
            <div class="stat-label">Verarbeitete Zeilen</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${totalIgnoredRows}</div>
            <div class="stat-label">Ignorierte Zeilen</div>
        </div>
    `;

    const showSum = isSumSelected();
    const showLate = isLateSelected();

    // Tabellenkopf erstellen: ausgewählte Fächer, danach (ganz rechts) optional
    // Summe und Verspätungen
    let headerHTML = '<tr><th class="student-header">Schüler</th>';
    selectedSubjects.forEach(subject => {
        headerHTML += `
            <th class="subject-group" colspan="2">${subject}</th>
        `;
    });
    if (showSum) {
        headerHTML += '<th class="sum-group" colspan="2">Summe (alle Fächer)</th>';
    }
    if (showLate) {
        headerHTML += '<th class="late-group">Verspätungen (alle Fächer)</th>';
    }
    headerHTML += '</tr><tr><th></th>';
    selectedSubjects.forEach(subject => {
        headerHTML += `
            <th class="total-col">Gesamt</th>
            <th class="unexcused-col">Unentschuldigt</th>
        `;
    });
    if (showSum) {
        headerHTML += `
            <th class="total-col">Gesamt</th>
            <th class="unexcused-col">Unentschuldigt</th>
        `;
    }
    if (showLate) {
        headerHTML += '<th class="late-col">Minuten</th>';
    }
    headerHTML += '</tr>';
    tableHeader.innerHTML = headerHTML;

    // Tabellenkörper erstellen; Zellen mit Werten > 0 sind klickbar (Detail-Popup)
    const sortedStudents = students.sort();
    currentRender = { students: sortedStudents, subjects: selectedSubjects };
    hideDetailPopup();

    const detailCell = (value, cssClass, studentIndex, subjectRef, mode) => {
        const clickable = value > 0;
        const classes = `${cssClass}${value === 0 ? ' zero' : ''}${clickable ? ' clickable' : ''}`;
        const attrs = clickable
            ? ` data-student="${studentIndex}" data-subject="${subjectRef}" data-mode="${mode}" title="Klicken für Details"`
            : '';
        return `<td class="${classes}"${attrs}>${value}</td>`;
    };

    const bodyRows = sortedStudents.map((student, studentIndex) => {
        let rowHTML = `<td class="student-name">${student}</td>`;
        selectedSubjects.forEach((subject, subjectIndex) => {
            const data = studentSubjectAbsences[student][subject] || { total: 0, unexcused: 0 };
            rowHTML += detailCell(data.total, 'total-cell', studentIndex, subjectIndex, 'total');
            rowHTML += detailCell(data.unexcused, 'unexcused-cell', studentIndex, subjectIndex, 'unexcused');
        });
        if (showSum) {
            const sums = studentTotals[student];
            rowHTML += detailCell(sums.total, 'total-cell', studentIndex, 'sum', 'total');
            rowHTML += detailCell(sums.unexcused, 'unexcused-cell', studentIndex, 'sum', 'unexcused');
        }
        if (showLate) {
            rowHTML += detailCell(studentTotals[student].lateMinutes, 'late-cell', studentIndex, 'late', 'late');
        }
        return `<tr>${rowHTML}</tr>`;
    });

    resultsBody.innerHTML = bodyRows.join('');

    processing.style.display = 'none';
    results.style.display = 'block';
}

// --- Detail-Popup: zeigt beim Klick auf eine Zelle, wie die Fehlzeiten zustande kommen ---

const detailPopup = document.getElementById('detailPopup');
let currentRender = { students: [], subjects: [] };
let openPopupKey = null;

function hideDetailPopup() {
    detailPopup.style.display = 'none';
    openPopupKey = null;
}

// "11.06.2026" -> "2026-06-11" (sortierbar)
function dateSortKey(datum) {
    const m = String(datum).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) return String(datum);
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#detailPopup')) return;
    const cell = e.target.closest('td.clickable');
    if (!cell) {
        hideDetailPopup();
        return;
    }
    toggleDetailPopup(cell);
});

function toggleDetailPopup(cell) {
    const { student: studentIndex, subject: subjectRef, mode } = cell.dataset;
    const key = `${studentIndex}|${subjectRef}|${mode}`;

    // Erneuter Klick auf dieselbe Zelle schließt das Popup wieder
    if (openPopupKey === key) {
        hideDetailPopup();
        return;
    }

    const student = currentRender.students[Number(studentIndex)];

    // Verspätungen: eigene Detail-Liste (Datum, Minuten, Zeitraum)
    if (subjectRef === 'late') {
        showLateDetailPopup(cell, student, key);
        return;
    }

    const isSum = subjectRef === 'sum';
    const subject = isSum ? null : currentRender.subjects[Number(subjectRef)];
    const subjectData = globalData.studentSubjectAbsences[student] || {};

    // Einträge sammeln (bei der Summe über alle Fächer, mit Fachangabe)
    let entries = [];
    if (isSum) {
        Object.keys(subjectData).forEach(subj => {
            (subjectData[subj].entries || []).forEach(entry => entries.push({ ...entry, fach: subj }));
        });
    } else {
        entries = ((subjectData[subject] || {}).entries || []).map(entry => ({ ...entry }));
    }
    if (mode === 'unexcused') {
        entries = entries.filter(entry => entry.unexcused);
    }
    entries.sort((a, b) =>
        dateSortKey(a.datum).localeCompare(dateSortKey(b.datum)) || a.stunde - b.stunde
    );

    const title = isSum ? `Alle Fächer – ${student}` : `${subject} – ${student}`;
    const unexcusedCount = entries.filter(entry => entry.unexcused).length;
    const subtitle = mode === 'unexcused'
        ? `${entries.length} unentschuldigte Fehlstunde${entries.length === 1 ? '' : 'n'}`
        : `${entries.length} Fehlstunde${entries.length === 1 ? '' : 'n'}, davon ${unexcusedCount} unentschuldigt`;

    const listHTML = entries.map(entry => `
        <div class="detail-entry">
            <span>${toolhubEscapeHtml(entry.datum)} – ${entry.stunde}. Stunde${entry.fach ? ` – ${toolhubEscapeHtml(entry.fach)}` : ''}</span>
            ${entry.unexcused && mode !== 'unexcused' ? '<span class="detail-badge">unentschuldigt</span>' : ''}
        </div>
    `).join('');

    detailPopup.innerHTML = `
        <div class="detail-title">${toolhubEscapeHtml(title)}</div>
        <div class="detail-subtitle">${subtitle}</div>
        ${listHTML || '<div class="detail-entry">Keine Einträge</div>'}
    `;

    positionAndShowPopup(cell, key);
}

function showLateDetailPopup(cell, student, key) {
    const entries = (globalData.studentTotals[student].lateEntries || [])
        .slice()
        .sort((a, b) => dateSortKey(a.datum).localeCompare(dateSortKey(b.datum)));

    const totalMinutes = entries.reduce((sum, entry) => sum + entry.minuten, 0);
    const subtitle = `${entries.length} Verspätung${entries.length === 1 ? '' : 'en'}, insgesamt ${totalMinutes} Min.`;

    const listHTML = entries.map(entry => `
        <div class="detail-entry">
            <span>${toolhubEscapeHtml(entry.datum)} – ${entry.minuten} Min. zu spät${entry.zeitraum ? ` (${toolhubEscapeHtml(entry.zeitraum)})` : ''}</span>
        </div>
    `).join('');

    detailPopup.innerHTML = `
        <div class="detail-title">${toolhubEscapeHtml(`Verspätungen – ${student}`)}</div>
        <div class="detail-subtitle">${subtitle}</div>
        ${listHTML || '<div class="detail-entry">Keine Einträge</div>'}
    `;

    positionAndShowPopup(cell, key);
}

// Popup unterhalb der Zelle positionieren, am rechten Rand begrenzen
function positionAndShowPopup(cell, key) {
    detailPopup.style.display = 'block';
    const rect = cell.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - detailPopup.offsetWidth - 10;
    if (left > maxLeft) {
        left = Math.max(10, maxLeft);
    }
    detailPopup.style.left = `${left}px`;
    detailPopup.style.top = `${top}px`;
    openPopupKey = key;
}

function exportToExcel() {
    if (!globalData) return;

    const { studentSubjectAbsences, studentTotals } = globalData;
    const selectedSubjects = getSelectedSubjects();
    const students = Object.keys(studentSubjectAbsences).sort();

    // Daten für Export vorbereiten
    const exportData = [];

    const showSum = isSumSelected();
    const showLate = isLateSelected();

    // Header erstellen (Summe und Verspätungen ganz rechts)
    const headers = ['Schüler'];
    selectedSubjects.forEach(subject => {
        headers.push(`${subject} - Gesamt`);
        headers.push(`${subject} - Unentschuldigt`);
    });
    if (showSum) {
        headers.push('Summe (alle Fächer) - Gesamt');
        headers.push('Summe (alle Fächer) - Unentschuldigt');
    }
    if (showLate) {
        headers.push('Verspätungen (alle Fächer, in Min.)');
    }
    exportData.push(headers);

    // Datenzeilen erstellen
    students.forEach(student => {
        const row = [student];
        selectedSubjects.forEach(subject => {
            const data = studentSubjectAbsences[student][subject] || { total: 0, unexcused: 0 };
            row.push(data.total);
            row.push(data.unexcused);
        });
        if (showSum) {
            const sums = studentTotals[student];
            row.push(sums.total);
            row.push(sums.unexcused);
        }
        if (showLate) {
            row.push(studentTotals[student].lateMinutes);
        }
        exportData.push(row);
    });

    // Dateiname mit aktuellem Datum
    const dateStr = new Date().toISOString().split('T')[0];
    toolhubWriteXlsx({ Fehlzeiten: exportData }, `Fehlzeiten_Auswertung_${dateStr}.xlsx`);
}

document.getElementById('selectAllBtn').addEventListener('click', selectAllSubjects);
document.getElementById('deselectAllBtn').addEventListener('click', deselectAllSubjects);
document.getElementById('exportBtn').addEventListener('click', exportToExcel);
