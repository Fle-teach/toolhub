// ===== KONFIGURATION =====
const CONFIG = {
    // ZSR-Header-Zeile wird dynamisch erkannt (siehe findZSRHeaderRow)
    DIVIS_HEADER_ROW: 0,
    DIVIS_DATA_START_ROW: 1,
    BATCH_SIZE: 50, // Verarbeitung in 50er-Batches für bessere Performance
    
    REQUIRED_ZSR_COLUMNS: ['ZSR-ID', 'Nachname', 'Vorname', 'Geburtsdatum'],
    REQUIRED_DIVIS_COLUMNS: ['Nachname', 'Namenszusatz', 'Vorname', 'Rufname', 'Geburtsdatum', 'Klassenname'],
    REQUIRED_COURSE_COLUMNS: ['Angebotsname', 'Lehrkräfte (kürzel)', 'Klasse'],
    REQUIRED_ELECTIVE_COLUMNS: ['Nachname', 'Vorname', 'Namenszusatz', 'Rufname', 'Geburtsdatum', 'Klassenname']
}

// ===== GEBURTSDATUM-NORMALISIERUNG =====

// Wandelt beliebige Geburtsdatum-Zellwerte in einheitliches TT.MM.JJJJ um.
// Excel speichert Datumszellen intern als Serienzahl (z. B. 42420 = 20.02.2016);
// je nach Zellformatierung liefert die Datei daher Zahlen, Date-Objekte oder
// unterschiedlich formatierte Strings. Ohne Normalisierung schlägt das Matching
// zwischen ZSR- und DiViS-Daten über das Geburtsdatum fehl.
function normalizeBirthdate(value) {
    if (value === undefined || value === null || value === "") return "";

    // Date-Objekt (falls XLSX Zellen bereits als Datum liefert)
    if (value instanceof Date && !isNaN(value)) {
        return formatDateDDMMYYYY(value.getDate(), value.getMonth() + 1, value.getFullYear());
    }

    // Excel-Serienzahl: Zahl oder rein numerischer String (z. B. 42420)
    const str = String(value).trim();
    const numericValue = typeof value === 'number' ? value :
        (/^\d{4,6}$/.test(str) ? parseInt(str, 10) : NaN);
    if (!isNaN(numericValue) && numericValue > 10000 && numericValue < 80000) {
        // Excel-Epoche 30.12.1899; Offset 25569 Tage bis zum 01.01.1970 (Unix-Epoche)
        const date = new Date(Math.round((numericValue - 25569) * 86400000));
        return formatDateDDMMYYYY(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear());
    }

    // TT.MM.JJJJ, T.M.JJJJ, TT/MM/JJJJ, TT-MM-JJJJ (auch zweistelliges Jahr)
    let match = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (match) {
        let year = parseInt(match[3], 10);
        if (match[3].length === 2) year += year < 50 ? 2000 : 1900;
        return formatDateDDMMYYYY(parseInt(match[1], 10), parseInt(match[2], 10), year);
    }

    // ISO-Format JJJJ-MM-TT, optional mit Zeitanteil (z. B. "2016-02-20" oder "2016-02-20 00:00:00")
    match = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})([T\s].*)?$/);
    if (match) {
        return formatDateDDMMYYYY(parseInt(match[3], 10), parseInt(match[2], 10), parseInt(match[1], 10));
    }

    // Unbekanntes Format: unverändert zurückgeben
    return str;
}

function formatDateDDMMYYYY(day, month, year) {
    return String(day).padStart(2, '0') + '.' + String(month).padStart(2, '0') + '.' + year;
}

// ===== KURSDATEN-VERARBEITUNG =====

function processCourseData(courseData) {
    // Erstelle eine Map: Klassenname (lowercase) -> Array von Gruppen
    const coursesByClass = new Map();
    let cleanupCount = 0; // Zähler für bereinigte Einträge
    
    courseData.forEach(course => {
        const className = course["Klasse"].toLowerCase().trim(); // Case-insensitive
        
        // Datenbereinigung: Semikolons entfernen oder ersetzen
        let angebotsname = course["Angebotsname"].trim();
        const originalAngebotsname = angebotsname;
        angebotsname = angebotsname.replace(/;/g, ''); // Semikolons entfernen
        
        let lehrkraft = course["Lehrkräfte (kürzel)"] ? course["Lehrkräfte (kürzel)"].trim() : "";
        const originalLehrkraft = lehrkraft;
        lehrkraft = lehrkraft.replace(/;/g, ''); // Semikolons entfernen
        
        // Zähle bereinigte Einträge
        if (originalAngebotsname !== angebotsname || originalLehrkraft !== lehrkraft) {
            cleanupCount++;
        }
        
        // Gruppennamen erstellen: Angebotsname + Lehrkraft (falls vorhanden)
        let groupName = angebotsname;
        if (lehrkraft && lehrkraft !== "") {
            groupName += " " + lehrkraft;
        }
        
        if (!coursesByClass.has(className)) {
            coursesByClass.set(className, []);
        }
        
        coursesByClass.get(className).push(groupName);
    });
    
    // Info über Datenbereinigung anzeigen
    if (cleanupCount > 0) {
        showAlert(`Datenbereinigung: ${cleanupCount} Kurseinträge mit Semikolons wurden bereinigt (Semikolons durch Kommas ersetzt).`, 'info');
    }
    
    // Gruppen pro Klasse sortieren und zu String zusammenfassen
    const classGroups = new Map();
    coursesByClass.forEach((groups, className) => {
        // Duplikate entfernen und sortieren
        const uniqueGroups = [...new Set(groups)].sort();
        classGroups.set(className, uniqueGroups.join("; "));
    });
    
    return classGroups;
}

function processElectiveData(electiveData, mergedStudentData) {
    if (!electiveData || electiveData.length === 0) {
        return { matches: 0, mismatches: [] };
    }
    
    // Index für schnelle Lookups erstellen: Geburtsdatum -> Schüler
    const studentsByBirthdate = new Map();
    mergedStudentData.forEach(student => {
        const birthdate = student["Geburtsdatum-DiViS"];
        if (birthdate) {
            if (!studentsByBirthdate.has(birthdate)) {
                studentsByBirthdate.set(birthdate, []);
            }
            studentsByBirthdate.get(birthdate).push(student);
        }
    });
    
    let matchCount = 0;
    const mismatches = [];
    const studentElectives = new Map(); // ZSR-ID -> Array von Kursnamen
    
    // Für jeden Wahlpflichtkurs-Teilnehmer
    electiveData.forEach(participant => {
        const birthdate = participant["Geburtsdatum"];
        const candidateStudents = studentsByBirthdate.get(birthdate) || [];
        
        if (candidateStudents.length === 0) {
            mismatches.push({
                participant,
                reason: 'Kein Schüler mit passendem Geburtsdatum gefunden'
            });
            return;
        }
        
        // Finde besten Match über Namen
        let bestMatch = null;
        let minDistance = Infinity;
        
        candidateStudents.forEach(student => {
            // Zusammengesetzten Namen für Vergleich erstellen
            const participantFullName = (participant["Namenszusatz"] + " " + participant["Nachname"]).trim();
            const studentFullName = student["Zusammengesetzter-Nachname-DiViS"];
            
            const levenshteinVorname = levenshtein(student["Vorname-DiViS"], participant["Vorname"]);
            const levenshteinNachname = levenshtein(studentFullName, participantFullName);
            const totalDistance = levenshteinVorname + levenshteinNachname;
            
            if (totalDistance < minDistance) {
                minDistance = totalDistance;
                bestMatch = student;
            }
        });
        
        if (bestMatch && minDistance <= 2) { // Toleranz für kleine Schreibfehler
            const zsrId = bestMatch["ZSR-ID-ZSR"];
            if (!studentElectives.has(zsrId)) {
                studentElectives.set(zsrId, []);
            }
            // Gleicher Gruppenname wie bei den Lehrern ("Kurs " + normalisierter Name)
            studentElectives.get(zsrId).push("Kurs " + participant.courseName);
            matchCount++;
        } else {
            mismatches.push({
                participant,
                bestMatch,
                distance: minDistance,
                reason: minDistance > 2 ? 'Namensabweichung zu groß' : 'Kein passender Schüler gefunden'
            });
        }
    });
    
    // Wahlpflichtkurse zu den Schülern hinzufügen
    mergedStudentData.forEach(student => {
        const zsrId = student["ZSR-ID-ZSR"];
        const electives = studentElectives.get(zsrId) || [];
        
        if (electives.length > 0) {
            // Zu bestehenden Gruppen hinzufügen
            let existingGroups = student["Gruppen"] || "";
            const allGroups = [];
            
            // Bestehende Gruppen hinzufügen
            if (existingGroups && existingGroups.trim() !== "") {
                allGroups.push(existingGroups);
            }
            
            // Wahlpflichtkurse hinzufügen
            allGroups.push(...electives);
            
            student["Gruppen"] = allGroups.join("; ");
        }
    });
    
    return { matches: matchCount, mismatches };
};

// ===== GLOBALE VARIABLEN =====
let zsrData = [];
let divisData = [];
let courseData = [];
let electiveData = [];
let classTeacherData = [];
let teacherList = [];
let courseList = []; // Übersicht aller angelegten Kurse (für den Kursliste-Export)
let mergedData = [];
let filteredElternImportOutput = [];
// Schüler ohne ZSR-Datensatz: je Eintrag { divisRow, status, zsrId }
// status: 'open' | 'assigned' | 'ignored'
let unmatchedStudents = [];

// ===== UTILITY FUNKTIONEN =====

// Levenshtein-Distanz Berechnung (optimiert)
function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let tmp;
    if (a.length > b.length) {
        tmp = a; a = b; b = tmp;
    }

    const row = [];
    for (let i = 0; i <= a.length; i++) {
        row[i] = i;
    }

    for (let i = 1; i <= b.length; i++) {
        let prev = i;
        for (let j = 1; j <= a.length; j++) {
            let val;
            if (b.charAt(i-1) === a.charAt(j-1)) {
                val = row[j-1];
            } else {
                val = Math.min(row[j-1] + 1, prev + 1, row[j] + 1);
            }
            row[j-1] = prev;
            prev = val;
        }
        row[a.length] = prev;
    }
    return row[a.length];
}

function calculateInitPW(zsrId) {
    if (!zsrId || zsrId.length < 6) return "";
    
    let initPWvorn = "";
    let initPWhinten = "";

    for (let i = 0; i < zsrId.length; i++) {
        const char = zsrId[i];
        if (i % 2 === 0) {
            initPWvorn += String.fromCharCode((char.charCodeAt(0) - 65 + 1) % 26 + 65);
        } else {
            initPWhinten += (parseInt(char) + 1) % 10;
        }
    }
    let initPW = initPWvorn + initPWhinten;

    // Längeres Passwort (zweite Iteration)
    initPWvorn = "";
    initPWhinten = "";
    
    for (let i = 0; i < zsrId.length; i++) {
        const char = zsrId[i];
        if (i % 2 === 0) {
            initPWvorn += String.fromCharCode((char.charCodeAt(0) - 65 + 2) % 26 + 65);
        } else {
            initPWhinten += (parseInt(char) + 2) % 10;
        }
    }

    return initPW + initPWvorn + initPWhinten;
}

// ===== FACHKÜRZEL-NORMALISIERUNG =====

// Zuordnungstabelle aus fachkuerzel.csv: Schreibvariante (lowercase) -> normalisiertes Kürzel
let fachKuerzelMap = null;
let fachKuerzelLoadError = false;


// Fach-Anteil einer Kursbezeichnung vereinheitlichen. Die Phrase wird als Ganzes
// geprüft (Semantik siehe toolhubNormalisiereFach in assets/toolhub-kurse.js);
// hier bleibt nur die Umhüllung als Array, wie der Kursname-Aufbau sie erwartet.
function normalizeFachKuerzel(subjectParts) {
    if (subjectParts.length === 0) return subjectParts;
    return [toolhubNormalisiereFach(subjectParts.join(' '), fachKuerzelMap)];
}

// Normalisiert einen Kursnamen auf das einheitliche Muster:
//   <Klasse/Jahrgang> <Fachkürzel/Zusatz> <Lehrerkürzel (alphabetisch)>
// Beispiele: "11-12 frz 1"    + [Ben]        -> "11-12 Frz Ben"
//            "Rel 8.1"        + [Woh]        -> "08 Rel Woh"
//            "5a D"           + [Sn]         -> "05A Deu Sn"
//            "5a Geo"         + [Zer], [Möh] -> "05A Geo Möh Zer"
//            "11-12 muPr Band" + [Adva]      -> "11-12 muPr_Band Adva"
// Regeln:
// - Klasse/Jahrgang steht vorn; einstellige Zahlen erhalten eine führende Null.
// - Buchstabenanteile der Klasse werden großgeschrieben ("5a" -> "05A").
// - Zahlen, die keine Klasse/Jahrgang repräsentieren (Kursnummern wie "1" oder ".1"), entfallen.
// - Fachkürzel werden anhand von fachkuerzel.csv vereinheitlicht (siehe normalizeFachKuerzel).
// - Lehrerkürzel werden alphabetisch sortiert angehängt.
function normalizeCourseName(courseTitle, teacherKuerzelList, participants) {
    const parts = (courseTitle || '').toString().trim().split(/\s+/).filter(p => p !== '');
    const kuerzelLower = new Set((teacherKuerzelList || []).map(k => k.toLowerCase()));

    // Klassenstufen der Teilnehmer: Plausibilitätsprüfung für reine Zahlen und Fallback,
    // falls der Titel keine Klasse/Jahrgang enthält
    const stufen = new Set();
    (participants || []).forEach(p => {
        const match = (p["Klassenstufe"] || '').toString().match(/(\d{1,2})/);
        if (match) stufen.add(parseInt(match[1], 10));
    });

    const padClass = num => String(num).padStart(2, '0');

    let classToken = '';
    const subjectParts = [];

    parts.forEach(part => {
        // Lehrerkürzel im Titel überspringen (z. B. wenn der Blattname als Quelle dient)
        if (kuerzelLower.has(part.toLowerCase())) return;

        // Klasse/Jahrgang: Zahl oder Zahlbereich, optional Buchstaben und/oder Kursnummer,
        // z. B. "5a", "8", "11-12", "8.1", "11-12.2"
        const classMatch = part.match(/^(\d{1,2})(?:-(\d{1,2}))?([A-Za-zÄÖÜäöü]{0,2})(?:\.\d+)?$/);
        if (classMatch && !classToken) {
            const isPlainNumber = !classMatch[2] && !classMatch[3] && !part.includes('.');
            // Reine Zahlen nur als Klasse werten, wenn sie zur Klassenstufe der Teilnehmer
            // passen – sonst ist es eine Kursnummer, die gestrichen wird
            if (!isPlainNumber || stufen.size === 0 || stufen.has(parseInt(classMatch[1], 10))) {
                classToken = padClass(classMatch[1]) +
                    (classMatch[2] ? '-' + padClass(classMatch[2]) : '') +
                    (classMatch[3] || '').toUpperCase();
                return;
            }
        }

        // Übrige reine Zahlen (Kursnummern) streichen
        if (/^\d+(\.\d+)?$/.test(part)) return;

        subjectParts.push(part);
    });

    // Fallback: Klasse/Jahrgang aus den Klassenstufen der Teilnehmer ableiten
    if (!classToken && stufen.size > 0) {
        const sorted = [...stufen].sort((a, b) => a - b);
        classToken = sorted.length === 1
            ? padClass(sorted[0])
            : padClass(sorted[0]) + '-' + padClass(sorted[sorted.length - 1]);
    }

    const sortedKuerzel = [...(teacherKuerzelList || [])].sort((a, b) => a.localeCompare(b, 'de'));

    const normalizedSubjects = normalizeFachKuerzel(subjectParts);

    const result = [classToken, ...normalizedSubjects, ...sortedKuerzel].filter(p => p).join(' ');
    return result || (courseTitle || '').toString().trim();
}

function removeLineBreaks(value) {
    return value ? value.replace(/[\r\n]+/g, ' ').trim() : value;
}

function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alertsContainer.appendChild(alert);
    // Make clear button visible
    const clearBtn = document.getElementById('clearAlertsButton');
    if (clearBtn) clearBtn.style.display = 'inline-block';
}

// Clear alerts button wiring (added below event listeners)

function showLoading(message) {
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function updateProgress(percent, message) {
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = message;
}

function updateStats(zsrCount, divisCount, mergedCount) {
    document.getElementById('zsrCount').textContent = zsrCount;
    document.getElementById('divisCount').textContent = divisCount;
    document.getElementById('mergedCount').textContent = mergedCount;
    document.getElementById('statsContainer').style.display = 'grid';
}

// ===== DATEI-VERARBEITUNG =====

// Vereinheitlicht Spaltennamen unterschiedlicher ZSR-Exporte,
// z. B. schreibt "S_L_falsche_Schulnummer" die ID-Spalte als "ZSRID" statt "ZSR-ID".
function canonicalZSRHeader(header) {
    const trimmed = header.toString().trim();
    if (trimmed.replace(/[\s_-]/g, '').toUpperCase() === 'ZSRID') return 'ZSR-ID';
    return trimmed;
}

// Findet die Header-Zeile einer ZSR-Datei dynamisch, da die Zeilennummer
// je nach Export-Variante abweichen kann: Gesucht wird eine Zeile, die eine
// ZSR-ID-Spalte (auch "ZSRID"), "Nachname" und "Geburtsdatum" enthält.
function findZSRHeaderRow(rawData) {
    const maxScan = Math.min(rawData.length, 20);
    for (let i = 0; i < maxScan; i++) {
        const row = rawData[i];
        if (!row) continue;
        const cells = row.map(c => (c === undefined || c === null) ? '' : c.toString().trim());
        const hasZsrId = cells.some(c => c.replace(/[\s_-]/g, '').toUpperCase() === 'ZSRID');
        const hasNachname = cells.some(c => c.includes('Nachname'));
        const hasGeburtsdatum = cells.some(c => c.includes('Geburtsdatum'));
        if (hasZsrId && hasNachname && hasGeburtsdatum) return i;
    }
    return -1;
}

// Liest mehrere ZSR-Dateien (ggf. mit unterschiedlichem Aufbau) und führt sie
// zusammen. Bei doppelten ZSR-IDs zählt das erste Vorkommen.
async function readZSRFiles(fileList) {
    const files = Array.from(fileList);
    const allRows = [];
    const seenIds = new Set();
    let duplicateCount = 0;

    for (const file of files) {
        const rows = await readZSRFile(file);
        rows.forEach(row => {
            const id = row["ZSR-ID-ZSR"];
            if (seenIds.has(id)) {
                duplicateCount++;
                return;
            }
            seenIds.add(id);
            allRows.push(row);
        });
        if (files.length > 1) {
            showAlert(`ZSR-Datei "${file.name}": ${rows.length} Datensätze eingelesen.`, 'info');
        }
    }

    if (duplicateCount > 0) {
        showAlert(`${duplicateCount} doppelte ZSR-Datensätze (gleiche ZSR-ID in mehreren Dateien) wurden übersprungen – es zählt jeweils das erste Vorkommen.`, 'info');
    }

    return allRows;
}

async function readZSRFile(file) {
    const workbook = await toolhubReadWorkbook(file);
    try {
        const rawData = toolhubSheetRows(workbook, { header: false });

        const headerRowIndex = findZSRHeaderRow(rawData);
        if (headerRowIndex === -1) {
            throw new Error('Keine Header-Zeile mit den Spalten ZSR-ID, Nachname und Geburtsdatum gefunden');
        }

        const headers = rawData[headerRowIndex].map(h =>
            (h === undefined || h === null) ? '' : canonicalZSRHeader(h)
        );
        const dataRows = rawData.slice(headerRowIndex + 1);

        if (dataRows.length === 0) {
            throw new Error('Keine Datenzeilen unterhalb der Header-Zeile gefunden');
        }

        // Validierung der erforderlichen Spalten
        const missingColumns = CONFIG.REQUIRED_ZSR_COLUMNS.filter(col =>
            !headers.some(header => header && header.includes(col))
        );

        if (missingColumns.length > 0) {
            throw new Error(`Fehlende Spalten: ${missingColumns.join(', ')}`);
        }

        const processedData = dataRows.map(row => {
            const zsrRow = {};
            headers.forEach((header, index) => {
                if (header) {
                    zsrRow[header + "-ZSR"] = header.includes('Geburtsdatum')
                        ? normalizeBirthdate(row[index])
                        : (row[index] ? row[index].toString().trim() : "");
                }
            });

            zsrRow["InitPW"] = calculateInitPW(zsrRow["ZSR-ID-ZSR"]);
            // "Bestandteil Familienname" existiert nicht in allen Export-Varianten
            zsrRow["Zusammengesetzter-Nachname-ZSR"] =
                ((zsrRow["Bestandteil Familienname-ZSR"] || "") + " " + (zsrRow["Nachname-ZSR"] || "")).trim();

            return zsrRow;
        }).filter(row =>
            // Nur Zeilen mit ZSR-ID; wiederholte Header-Zeilen (mehrseitige Print-Exporte) überspringen
            row["ZSR-ID-ZSR"] &&
            row["ZSR-ID-ZSR"].replace(/[\s_-]/g, '').toUpperCase() !== 'ZSRID'
        );

        return processedData;

    } catch (error) {
        throw new Error(`Fehler beim Lesen der ZSR-Datei "${file.name}": ${error.message}`);
    }
}

async function readDivisFile(file) {
    const workbook = await toolhubReadWorkbook(file);
    try {
        const rawData = toolhubSheetRows(workbook, { header: false });
        
        const headers = rawData[CONFIG.DIVIS_HEADER_ROW];
        const dataRows = rawData.slice(CONFIG.DIVIS_DATA_START_ROW);
        
        // Validierung der erforderlichen Spalten
        const missingColumns = CONFIG.REQUIRED_DIVIS_COLUMNS.filter(col => 
            !headers.includes(col)
        );
        
        if (missingColumns.length > 0) {
            throw new Error(`DiViS-Datei: Fehlende Spalten: ${missingColumns.join(', ')}`);
        }
        
        const processedData = dataRows.map(row => {
            const divisRow = {};
            headers.forEach((header, index) => {
                if (header) {
                    divisRow[header.trim() + "-DiViS"] = header.includes('Geburtsdatum')
                        ? normalizeBirthdate(row[index])
                        : (row[index] ? row[index].toString().trim() : "");
                }
            });
            
            
            /*
            // Klasseninformation aufbereiten
            const klassenname = divisRow["Klassenname-DiViS"];
            if (!klassenname) {
                divisRow["Klasse/Information"] = "NN";
            } else if (klassenname.startsWith("11")) {
                divisRow["Klasse/Information"] = "11";
            } else if (klassenname.startsWith("12")) {
                divisRow["Klasse/Information"] = "12";
            } else if (klassenname.startsWith("IVK")) {
                divisRow["Klasse/Information"] = "IVK";
            } else {
                divisRow["Klasse/Information"] = klassenname;
            }
            */

            divisRow["Klasse/Information"] = divisRow["Klassenname-DiViS"];
            
            divisRow["Zusammengesetzter-Nachname-DiViS"] = 
                (divisRow["Namenszusatz-DiViS"] + " " + divisRow["Nachname-DiViS"]).trim();
            
            return divisRow;
        }).filter(row => row["Geburtsdatum-DiViS"]); // Nur Zeilen mit Geburtsdatum
        
        return processedData;
        
    } catch (error) {
        throw new Error(`Fehler beim Lesen der DiViS-Datei: ${error.message}`);
    }
}


// Löst Namenskollisionen zwischen Kursen auf: Entstehen durch die Normalisierung
// (z. B. Wegfall der Kursnummer) identische Namen für unterschiedliche Kurse,
// werden fortlaufende Nummern angehängt:
//   "Rel 8.2 Bra" und "Rel 8.4 Bra" -> "08 Rel Bra 1" und "08 Rel Bra 2"
// Setzt course.finalName und aktualisiert die courseName-Einträge der Teilnehmer.
// Gibt eine Map der umbenannten Namen zurück: Name -> Anzahl der Kurse.
function resolveCourseNameCollisions(courses) {
    const nameCounts = new Map();
    courses.forEach(course => {
        nameCounts.set(course.courseName, (nameCounts.get(course.courseName) || 0) + 1);
    });

    const nameCounters = new Map();
    courses.forEach(course => {
        if (nameCounts.get(course.courseName) > 1) {
            const n = (nameCounters.get(course.courseName) || 0) + 1;
            nameCounters.set(course.courseName, n);
            course.finalName = `${course.courseName} ${n}`;
        } else {
            course.finalName = course.courseName;
        }
        course.participants.forEach(p => { p.courseName = course.finalName; });
    });

    const renamed = new Map();
    nameCounters.forEach((count, name) => renamed.set(name, count));
    return renamed;
}

// Neue Funktion liest mehrere Dateien nacheinander
async function readElectiveFiles(fileList) {
    if (!fileList || fileList.length === 0) return [];

    // Alle Kurse (ein Kurs = ein Tabellenblatt) aus allen Dateien einsammeln
    let allCourses = [];
    for (let i = 0; i < fileList.length; i++) {
        const courses = await readElectiveFile(fileList[i]);
        allCourses = allCourses.concat(courses);
    }

    // Namenskollisionen über alle Dateien hinweg auflösen
    const renamed = resolveCourseNameCollisions(allCourses);
    if (renamed.size > 0) {
        const details = [...renamed.entries()].map(([name, count]) => `"${name}" (${count} Kurse)`).join(', ');
        showAlert(`Gleichnamige Kurse durch fortlaufende Nummern unterschieden: ${details}.`, 'info');
    }

    // Kurs-Gruppen der Lehrer erst jetzt vergeben, damit sie die endgültigen
    // (ggf. nummerierten) Kursnamen erhalten
    allCourses.forEach(course => {
        const courseGroup = "Kurs " + course.finalName;
        course.teachers.forEach(t => {
            const existing = teacherList.find(e => e.importId === t.importId && e.firstName === t.firstName && e.lastName === t.lastName);
            if (existing && !existing.groups.includes(courseGroup)) {
                existing.groups.push(courseGroup);
            }
        });
    });

    // Kursliste für den Export befüllen (ein Eintrag pro angelegtem Kurs)
    courseList = allCourses.map(course => ({
        "Kursname": "Kurs " + course.finalName,
        "Ursprünglicher Name (Tabellenblatt)": course.originalCourseName,
        "Lehrkräfte": course.teachers.map(t => t.kuerzel).sort((a, b) => a.localeCompare(b, 'de')).join(', '),
        "Anzahl Teilnehmer": course.participants.length
    }));

    // Flache Teilnehmerliste zurückgeben (bisheriges Format)
    return allCourses.flatMap(course => course.participants);
}

async function readElectiveFile(file) {
    const workbook = await toolhubReadWorkbook(file);
    try {
        const electiveCourses = [];
        
        // Durchlaufe alle Tabellenblätter
        workbook.SheetNames.forEach(sheetName => {
            const rawData = toolhubSheetRows(workbook.Sheets[sheetName], { header: false });
            
            if (rawData.length < 4) {
                console.warn(`Tabellenblatt "${sheetName}" hat zu wenige Zeilen und wird übersprungen`);
                return;
            }
            
            // FLEXIBEL: Suche nach der Zeile die mit "Nachname" beginnt
            let headerRowIndex = -1;
            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                if (row && row[0] && row[0].toString().trim() === "Nachname") {
                    headerRowIndex = i;
                    break;
                }
            }
            
            if (headerRowIndex === -1) {
                console.warn(`Tabellenblatt "${sheetName}": Keine Zeile mit "Nachname" als erstem Eintrag gefunden`);
                return;
            }
            
            // Struktur prüfen - Fach und Lehrer aus den ersten Zeilen extrahieren
            let fach = '';
            let lehrer = '';
            
            // Suche in den ersten Zeilen vor dem Header nach Fach- und Lehrerinformationen
            for (let i = 0; i < headerRowIndex; i++) {
                const row = rawData[i];
                if (row && row[0]) {
                    const cellContent = row[0].toString().trim();
                    // Wenn es wie der Kurstitel aussieht (ohne eckige Klammern), z. B. "11-12 muPr Band"
                    if (cellContent.length < 40 && !cellContent.includes('[') && !fach) {
                        fach = cellContent;
                    }
                    // Wenn es wie ein Lehrer aussieht (mit eckigen Klammern oder "Herr"/"Frau")
                    else if ((cellContent.includes('[') || cellContent.includes('Herr') || cellContent.includes('Frau')) && !lehrer) {
                        lehrer = cellContent;
                    }
                }
            }
            
            const headers = rawData[headerRowIndex] || [];
            
            // Validierung der erforderlichen Spalten
            const missingColumns = CONFIG.REQUIRED_ELECTIVE_COLUMNS.filter(col => 
                !headers.includes(col)
            );
            
            if (missingColumns.length > 0) {
                console.warn(`Tabellenblatt "${sheetName}": Fehlende Spalten: ${missingColumns.join(', ')}`);
                return;
            }
            
            // --- Lehrer-Extraktion aus den Zeilen oberhalb des Headers ---
            // Jeder Lehrer steht in einer eigenen Zelle in den Zeilen oberhalb des Header.
            // Beispiel: "[Adva] Herr Advani, Anil"
            const teachersInSheet = [];
            for (let i = 0; i < headerRowIndex; i++) {
                const row = rawData[i];
                if (!row || !row[0]) continue;
                const cell = row[0].toString().trim();
                // Identify teacher pattern by presence of square brackets and comma
                if (cell.includes('[') && cell.includes(']') && cell.includes(',')) {
                    const parsed = parseTeacherCell(cell);
                    if (parsed) teachersInSheet.push(parsed);
                }
            }

            // Teilnehmer verarbeiten (ab der Zeile nach dem Header)
            const participants = rawData.slice(headerRowIndex + 1).map(row => {
                if (!row || row.length === 0 || !row[0]) return null; // Leere Zeilen überspringen

                const participant = {
                    originalCourseName: sheetName, // Originaler Name für Debug-Zwecke
                    fach: fach,
                    lehrer: lehrer
                };

                headers.forEach((header, index) => {
                    if (header) {
                        participant[header] = header.includes('Geburtsdatum')
                            ? normalizeBirthdate(row[index])
                            : (row[index] ? row[index].toString().trim() : "");
                    }
                });

                return participant;
            }).filter(p => p !== null && p["Geburtsdatum"]); // Nur Teilnehmer mit Geburtsdatum

            // Kursname normalisieren: Quelle ist der Kurstitel aus der ersten Zeile
            // (Fallback: Blattname) plus die Lehrerkürzel aus den [Kürzel]-Zeilen
            const formattedCourseName = normalizeCourseName(
                fach || sheetName,
                teachersInSheet.map(t => t.kuerzel),
                participants
            );
            participants.forEach(p => { p.courseName = formattedCourseName; });

            // Lehrer registrieren; die Kurs-Gruppen werden erst nach der
            // Kollisionsprüfung in readElectiveFiles vergeben (endgültige Namen)
            teachersInSheet.forEach(t => {
                const existing = teacherList.find(e => e.importId === t.importId && e.firstName === t.firstName && e.lastName === t.lastName);
                if (!existing) {
                    teacherList.push({ ...t, groups: [] });
                }
            });

            // --- NEU: Lehrer-Gruppen für unterrichtete Klassen ---
            // Alle unterschiedlichen Klassen der Teilnehmer ermitteln
            const klassenSet = new Set();
            participants.forEach(p => {
                if (p["Klassenname"]) {
                    const raw = p["Klassenname"].toString().trim();
                    if (raw === '') return;
                    // Normalisieren: Jahrgang 11/12 -> Jg 11 / Jg 12
                    const startMatch = raw.match(/^(11|12)\b/);
                    if (startMatch) {
                        klassenSet.add(`Jg ${startMatch[1]}`);
                    } else {
                        klassenSet.add(raw);
                    }
                }
            });
            // Für jeden Lehrer im Kurs: passende Gruppen ergänzen
            teachersInSheet.forEach(t => {
                const existing = teacherList.find(e => e.importId === t.importId && e.firstName === t.firstName && e.lastName === t.lastName);
                if (existing) {
                    klassenSet.forEach(klasseKey => {
                        // Wenn klasseKey ist "Jg 11" oder "Jg 12", nutzen wir "Lehrer Jg X"
                        const lehrerGroup = klasseKey.startsWith('Jg ') ? `Lehrer ${klasseKey}` : `Lehrer ${klasseKey}`;
                        if (!existing.groups.includes(lehrerGroup)) {
                            existing.groups.push(lehrerGroup);
                        }
                    });
                }
            });
            
            // Kurs-Objekt sammeln; die Kollisionsprüfung über alle Dateien
            // und die flache Teilnehmerliste erstellt readElectiveFiles
            electiveCourses.push({
                courseName: formattedCourseName,
                originalCourseName: sheetName,
                teachers: teachersInSheet,
                participants: participants
            });
        });

        return electiveCourses;
        
    } catch (error) {
        throw new Error(`Fehler beim Lesen der Kurs-Datei: ${error.message}`);
    }
}

// ===== OPTIMIERTE DATEN-ZUSAMMENFÜHRUNG =====

async function mergeStudentData(zsrData, divisData) {
    const startTime = Date.now();
    
    updateProgress(10, 'Erstelle Geburtsdatum-Index...');
    
    // PERFORMANCE-OPTIMIERUNG: Index für schnelle Lookups erstellen
    const zsrByBirthdate = new Map();
    zsrData.forEach(row => {
        const birthdate = row["Geburtsdatum-ZSR"];
        if (birthdate) {
            if (!zsrByBirthdate.has(birthdate)) {
                zsrByBirthdate.set(birthdate, []);
            }
            zsrByBirthdate.get(birthdate).push(row);
        }
    });
    
    updateProgress(20, 'Beginne Daten-Matching...');
    
    const mergedData = [];
    const excludedRecords = []; // Datensätze, die durch bessere ersetzt wurden
    const noZsrFound = [];
    
    // BATCH-PROCESSING für bessere Performance
    for (let i = 0; i < divisData.length; i += CONFIG.BATCH_SIZE) {
        const batch = divisData.slice(i, i + CONFIG.BATCH_SIZE);
        const progress = 20 + ((i / divisData.length) * 60);
        
        updateProgress(progress, `Verarbeite Datensätze ${i + 1} - ${Math.min(i + CONFIG.BATCH_SIZE, divisData.length)} von ${divisData.length}...`);
        
        // Kleine Pause für UI-Reaktivität
        await new Promise(resolve => setTimeout(resolve, 10));
        
        for (const divisRow of batch) {
            const birthdate = divisRow["Geburtsdatum-DiViS"];
            const matchingZSRRows = zsrByBirthdate.get(birthdate) || [];
            
            // Performance metrics removed
            
            if (matchingZSRRows.length === 0) {
                noZsrFound.push(divisRow);
                continue;
            }
            
            let bestMatch = null;
            let minDistance = Infinity;
            
            for (const zsrRow of matchingZSRRows) {
                const levenshteinVorname = levenshtein(zsrRow["Vorname-ZSR"], divisRow["Vorname-DiViS"]);
                const levenshteinNachname = levenshtein(zsrRow["Zusammengesetzter-Nachname-ZSR"], divisRow["Zusammengesetzter-Nachname-DiViS"]);
                const totalDistance = levenshteinVorname + levenshteinNachname;
                
                if (totalDistance < minDistance) {
                    minDistance = totalDistance;
                    bestMatch = { zsrRow, totalDistance };
                }
            }
            
            if (bestMatch) {
                // Prüfen auf Duplikate (gleiche ZSR-ID)
                const existingIndex = mergedData.findIndex(record => 
                    record["ZSR-ID-ZSR"] === bestMatch.zsrRow["ZSR-ID-ZSR"]
                );
                
                if (existingIndex !== -1) {
                    const existingDistance = mergedData[existingIndex]["Levenshtein-Distanz"];
                    if (existingDistance > bestMatch.totalDistance) {
                        // Der neue Match ist besser - alten zu excludedRecords hinzufügen
                        excludedRecords.push({
                            ...mergedData[existingIndex],
                            "Ersetzt-durch-besseren-Match": true,
                            "Ursprüngliche-Distanz": existingDistance,
                            "Bessere-Distanz": bestMatch.totalDistance
                        });
                        mergedData[existingIndex] = { ...bestMatch.zsrRow, ...divisRow, "Levenshtein-Distanz": bestMatch.totalDistance };
                    } else {
                        // Der bestehende Match ist besser - neuen zu excludedRecords hinzufügen
                        excludedRecords.push({
                            ...divisRow,
                            "Ersetzt-durch-besseren-Match": true,
                            "Ursprüngliche-Distanz": bestMatch.totalDistance,
                            "Bessere-Distanz": existingDistance
                        });
                    }
                } else {
                    mergedData.push({ ...bestMatch.zsrRow, ...divisRow, "Levenshtein-Distanz": bestMatch.totalDistance });
                }
            }
        }
    }
    
    updateProgress(80, 'Erstelle Reports...');
    
    // Keine klassenbasierten Kurszuordnungen mehr verfügbar - füge leere Gruppen-Spalte hinzu
    mergedData.forEach(student => {
        student["Gruppen"] = "";
    });
    
    // Wahlpflichtkurse hinzufügen (falls vorhanden)
    if (electiveData && electiveData.length > 0) {
        updateProgress(86, 'Verarbeite Wahlpflichtkurse...');
        const electiveResult = processElectiveData(electiveData, mergedData);
        
        updateProgress(88, 'Wahlpflichtkurse abgeschlossen...');
        
        // Feedback über Wahlpflichtkurs-Matching
        if (electiveResult.matches > 0) {
            showAlert(`${electiveResult.matches} Wahlpflichtkurs-Teilnehmer erfolgreich zugeordnet.`, 'success');
        }
        
        if (electiveResult.mismatches.length > 0) {
            showAlert(`${electiveResult.mismatches.length} Wahlpflichtkurs-Teilnehmer konnten nicht zugeordnet werden.`, 'warning');
            console.warn('Nicht zugeordnete Wahlpflichtkurs-Teilnehmer:', electiveResult.mismatches);
        }
    }
    
    // ZSR-Datensätze ohne Match finden
    const excludedZsrRecords = zsrData.filter(zsrRow => 
        !mergedData.some(merged => merged["ZSR-ID-ZSR"] === zsrRow["ZSR-ID-ZSR"])
    );
    
    updateProgress(90, 'Sammle Namensabweichungen...');
    
    // WICHTIG: Namensabweichungen nur für die finalen, tatsächlich verwendeten Datensätze sammeln
    const nameDeviations = mergedData
        .filter(record => record["Levenshtein-Distanz"] > 0)
        .map(record => ({
            zsrRow: {
                "ZSR-ID-ZSR": record["ZSR-ID-ZSR"],
                "Zusammengesetzter-Nachname-ZSR": record["Zusammengesetzter-Nachname-ZSR"],
                "Vorname-ZSR": record["Vorname-ZSR"],
                "Geburtsdatum-ZSR": record["Geburtsdatum-ZSR"]
            },
            divisRow: record,
            levenshteinDistance: record["Levenshtein-Distanz"]
        }))
        .sort((a, b) => b.levenshteinDistance - a.levenshteinDistance);
    
    updateProgress(95, 'Tabellen werden erstellt...');

    // Schüler ohne ZSR-Datensatz für die manuelle Nachbearbeitung vormerken
    unmatchedStudents = noZsrFound.map(divisRow => ({ divisRow, status: 'open', zsrId: '' }));

    // Tabellen befüllen
    await populateTables(nameDeviations, noZsrFound, excludedRecords, excludedZsrRecords);
    
    updateProgress(100, 'Verarbeitung abgeschlossen!');
    
    // Statistiken aktualisieren
    updateStats(zsrData.length, divisData.length, mergedData.length);
    
    const processingTime = Date.now() - startTime;
    showAlert(`Verarbeitung abgeschlossen in ${(processingTime / 1000).toFixed(1)}s.`, 'success');
    // performance messages removed; only show transient alert
    
    setTimeout(() => {
        document.getElementById('progressContainer').style.display = 'none';
    }, 2000);
    
    return mergedData;
}

// ===== TABELLEN-FUNKTIONEN =====

async function populateTables(nameDeviations, noZsrFound, excludedRecords, excludedZsrRecords) {
    // Namensabweichungen (nur finale, verwendete Datensätze)
    if (nameDeviations.length > 0) {
        const tbody = document.getElementById('nameDeviationBody');
        nameDeviations.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.zsrRow["ZSR-ID-ZSR"]}</td>
                <td>${item.zsrRow["Zusammengesetzter-Nachname-ZSR"]}</td>
                <td>${item.zsrRow["Vorname-ZSR"]}</td>
                <td>${item.zsrRow["Geburtsdatum-ZSR"]}</td>
                <td>${item.divisRow["Zusammengesetzter-Nachname-DiViS"]}</td>
                <td>${item.divisRow["Vorname-DiViS"]}</td>
                <td>${item.divisRow["Geburtsdatum-DiViS"]}</td>
                <td>${item.divisRow["Klassenname-DiViS"]}</td>
                <td>${item.levenshteinDistance}</td>
            `;
            tbody.appendChild(row);
        });
        document.getElementById('nameDeviationContainer').style.display = 'block';
    }
    
    // Kein ZSR gefunden – je Zeile ZSR-ID von Hand eintragen oder Schüler ignorieren
    if (unmatchedStudents.length > 0) {
        const tbody = document.getElementById('noZsrFoundBody');
        unmatchedStudents.forEach((entry, index) => {
            tbody.appendChild(buildUnmatchedRow(entry, index));
        });
        document.getElementById('noZsrFoundContainer').style.display = 'block';
        updateUnmatchedSummary();
    }
    
    // Ausgeschlossene Datensätze (durch besseren Match ersetzt)
    if (excludedRecords.length > 0) {
        const tbody = document.getElementById('excludedRecordsBody');
        excludedRecords.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item["Zusammengesetzter-Nachname-DiViS"] || ''}</td>
                <td>${item["Vorname-DiViS"] || ''}</td>
                <td>${item["Geburtsdatum-DiViS"] || ''}</td>
                <td>${item["Klassenname-DiViS"] || ''}</td>
                <td>${item["Ursprüngliche-Distanz"] || ''}</td>
                <td>${item["Bessere-Distanz"] || ''}</td>
            `;
            tbody.appendChild(row);
        });
        document.getElementById('excludedRecordsContainer').style.display = 'block';
    }
    
    // ZSR ohne Match
    if (excludedZsrRecords.length > 0) {
        const tbody = document.getElementById('excludedZsrRecordsBody');
        excludedZsrRecords.forEach(item => {
            const row = document.createElement('tr');
            // ID am Element, damit die Zeile verschwinden kann, sobald diese
            // ZSR-ID von Hand einem Schüler zugeordnet wird
            row.dataset.zsrId = item["ZSR-ID-ZSR"];
            row.innerHTML = `
                <td>${item["Auskunftssperre Leibund Leben-ZSR"] || ''}</td>
                <td>${item["Auskunftssperre Adoptionspflege-ZSR"] || ''}</td>
                <td>${item["ZSR-ID-ZSR"]}</td>
                <td>${item["Nachname-ZSR"]}</td>
                <td>${item["Vorname-ZSR"]}</td>
                <td>${item["Geburtsdatum-ZSR"]}</td>
            `;
            tbody.appendChild(row);
        });
        document.getElementById('excludedZsrRecordsContainer').style.display = 'block';
    }
}

// ===== MANUELLE ZSR-ZUORDNUNG =====
// Schüler ohne ZSR-Datensatz kommen sonst in keinen Export. Deshalb lässt sich
// je Zeile eine ZSR-ID von Hand eintragen oder der Schüler bewusst ignorieren.

// ZSR-IDs sind sechsstellig im Wechsel Buchstabe/Ziffer (z. B. C6H2R9); daraus
// berechnet calculateInitPW das Initialpasswort. Abweichende Eingaben werden
// angenommen, aber gemeldet – es zählt, was in der ZSR tatsächlich steht.
const ZSR_ID_PATTERN = /^([A-Z]\d){3}$/;

// Beschriftung der Statusspalte; die Status selbst heißen 'open'|'assigned'|'ignored'
const UNMATCHED_LABELS = { open: 'offen', assigned: 'zugeordnet', ignored: 'ignoriert' };

function buildUnmatchedRow(entry, index) {
    const row = document.createElement('tr');
    row.dataset.index = index;
    const item = entry.divisRow;
    row.innerHTML = `
        <td>${toolhubEscapeHtml(item["Zusammengesetzter-Nachname-DiViS"])}</td>
        <td>${toolhubEscapeHtml(item["Vorname-DiViS"])}</td>
        <td>${toolhubEscapeHtml(item["Geburtsdatum-DiViS"])}</td>
        <td>${toolhubEscapeHtml(item["Klassenname-DiViS"])}</td>
        <td class="cell-zsr-id"></td>
        <td class="cell-status"></td>
    `;
    fillUnmatchedRow(row, entry, index);
    return row;
}

// Füllt die beiden Aktionsspalten passend zum Status der Zeile.
function fillUnmatchedRow(row, entry, index) {
    const idCell = row.querySelector('.cell-zsr-id');
    const statusCell = row.querySelector('.cell-status');
    row.classList.toggle('done', entry.status !== 'open');

    if (entry.status === 'open') {
        idCell.innerHTML = `
            <span class="zsr-manual">
                <input type="text" maxlength="10" placeholder="C6H2R9"
                       aria-label="ZSR-ID von Hand eintragen" value="${toolhubEscapeHtml(entry.zsrId)}">
                <button type="button" class="btn-mini" data-action="assign">Übernehmen</button>
            </span>
        `;
        statusCell.innerHTML = `
            <span class="zsr-status open">${UNMATCHED_LABELS.open}</span>
            <button type="button" class="btn-mini" data-action="ignore">Ignorieren</button>
        `;

        // Enter im Eingabefeld übernimmt die ID – schneller bei mehreren Zeilen
        const input = idCell.querySelector('input');
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                assignManualZsrId(index, input.value);
            }
        });
        idCell.querySelector('[data-action="assign"]')
            .addEventListener('click', () => assignManualZsrId(index, input.value));
        statusCell.querySelector('[data-action="ignore"]')
            .addEventListener('click', () => ignoreUnmatchedStudent(index));
    } else {
        idCell.textContent = entry.status === 'assigned' ? entry.zsrId : '–';
        statusCell.innerHTML = `
            <span class="zsr-status ${entry.status}">${UNMATCHED_LABELS[entry.status]}</span>
            <button type="button" class="btn-mini" data-action="undo">Rückgängig</button>
        `;
        statusCell.querySelector('[data-action="undo"]')
            .addEventListener('click', () => undoUnmatchedDecision(index));
    }
}

// Ein von Hand zugeordneter ZSR-Datensatz ist nicht mehr "ohne DiViS-Match" –
// sonst widersprächen sich die beiden Tabellen.
function toggleUnmatchedZsrRow(zsrId, visible) {
    const row = document.querySelector(`#excludedZsrRecordsBody tr[data-zsr-id="${CSS.escape(zsrId)}"]`);
    if (row) row.style.display = visible ? '' : 'none';
}

function refreshUnmatchedRow(index) {
    const row = document.querySelector(`#noZsrFoundBody tr[data-index="${index}"]`);
    if (row) fillUnmatchedRow(row, unmatchedStudents[index], index);
    updateUnmatchedSummary();
}

// Weist einem Schüler von Hand eine ZSR-ID zu und nimmt ihn in die Exporte auf.
function assignManualZsrId(index, rawId) {
    const entry = unmatchedStudents[index];
    const zsrId = (rawId || '').trim().toUpperCase();

    if (!zsrId) {
        showAlert('Bitte zuerst eine ZSR-ID eintragen.', 'error');
        return;
    }

    // Doppelte ZSR-IDs würden im IServ-Import zwei Schüler vermischen
    if (mergedData.some(record => record["ZSR-ID-ZSR"] === zsrId)) {
        showAlert(`Die ZSR-ID "${zsrId}" ist bereits einem anderen Schüler zugeordnet.`, 'error');
        return;
    }

    if (!ZSR_ID_PATTERN.test(zsrId)) {
        showAlert(`Die ZSR-ID "${zsrId}" weicht vom üblichen Muster ab (z. B. C6H2R9). Sie wurde übernommen – bitte prüfen, ob das Initialpasswort brauchbar ist.`, 'warning');
    }

    const record = {
        ...entry.divisRow,
        "ZSR-ID-ZSR": zsrId,
        "InitPW": calculateInitPW(zsrId),
        // Name und Geburtsdatum stammen hier aus DiViS, da es keinen ZSR-Satz gibt
        "Zusammengesetzter-Nachname-ZSR": entry.divisRow["Zusammengesetzter-Nachname-DiViS"],
        "Nachname-ZSR": entry.divisRow["Nachname-DiViS"],
        "Vorname-ZSR": entry.divisRow["Vorname-DiViS"],
        "Geburtsdatum-ZSR": entry.divisRow["Geburtsdatum-DiViS"],
        "Levenshtein-Distanz": 0,
        "Von-Hand-zugeordnet": true,
        "Gruppen": ""
    };

    // Kursgruppen nachtragen: Der Schüler war beim Kurs-Matching noch nicht dabei.
    // Der Index in processElectiveData entsteht aus der übergebenen Liste, es
    // werden also nur die Gruppen dieses einen Schülers gesetzt.
    if (electiveData && electiveData.length > 0) {
        processElectiveData(electiveData, [record]);
    }

    mergedData.push(record);
    entry.status = 'assigned';
    entry.zsrId = zsrId;
    toggleUnmatchedZsrRow(zsrId, false);

    refreshUnmatchedRow(index);
    refreshAfterManualChange();
    showAlert(`${record["Vorname-DiViS"]} ${record["Zusammengesetzter-Nachname-DiViS"]} wurde mit der ZSR-ID ${zsrId} übernommen.`, 'success');
}

function ignoreUnmatchedStudent(index) {
    const entry = unmatchedStudents[index];
    entry.status = 'ignored';
    entry.zsrId = '';
    refreshUnmatchedRow(index);
}

// Nimmt eine Entscheidung zurück; zugeordnete Schüler fallen wieder aus den Exporten.
function undoUnmatchedDecision(index) {
    const entry = unmatchedStudents[index];

    if (entry.status === 'assigned') {
        const position = mergedData.findIndex(record => record["ZSR-ID-ZSR"] === entry.zsrId);
        if (position !== -1) mergedData.splice(position, 1);
        toggleUnmatchedZsrRow(entry.zsrId, true);
        entry.status = 'open';
        refreshUnmatchedRow(index);
        refreshAfterManualChange();
        return;
    }

    entry.status = 'open';
    refreshUnmatchedRow(index);
}

// Elterndaten und Statistik hängen an mergedData und müssen deshalb neu aufgebaut
// werden. Die Eltern-Tabellen werden vorher geleert, sonst stünden Zeilen doppelt.
async function refreshAfterManualChange() {
    ['deletedRecords', 'inconsistency', 'emailInconsistency'].forEach(name => {
        const container = document.getElementById(name + 'Container');
        if (container) {
            container.style.display = 'none';
            container.querySelector('tbody').innerHTML = '';
        }
    });

    await processParentData(mergedData);
    document.getElementById('progressContainer').style.display = 'none';
    updateStats(zsrData.length, divisData.length, mergedData.length);
}

// Meldet in der Tabellenüberschrift, wie viele Schüler noch keine Entscheidung haben.
function updateUnmatchedSummary() {
    const count = status => unmatchedStudents.filter(entry => entry.status === status).length;
    const open = count('open');

    const header = document.querySelector('#noZsrFoundContainer .table-header');
    if (!header) return;

    header.textContent = open > 0
        ? `Kein ZSR-Datensatz gefunden – ${open} von ${unmatchedStudents.length} noch offen`
        : `Kein ZSR-Datensatz gefunden – alle ${unmatchedStudents.length} bearbeitet (${count('assigned')} zugeordnet, ${count('ignored')} ignoriert)`;
}

// ===== ELTERN-DATENVERARBEITUNG =====

async function processParentData(mergedData) {
    updateProgress(0, 'Erstelle Elterndaten...');
    
    const elternImportOutput = [];
    
    mergedData.forEach(record => {
        // Mutter
        elternImportOutput.push({
            "ZSR-ID": record["ZSR-ID-ZSR"],
            "Vorname (Kind)": record["Vorname-DiViS"],
            "Nachname (Kind)": record["Zusammengesetzter-Nachname-DiViS"],
            "Vorname": record["Vorname (Mutter)-DiViS"],
            "Nachname": record["Nachname (Mutter)-DiViS"],
            "E-Mail": (record["E-Mail (Mutter)-DiViS"] || '').toLowerCase(),
            "Straße": (record["Straße (Mutter)-DiViS"] || '').toLowerCase(),
            "Geschlecht": 'w',
            "Personensorgeberechtigte": removeLineBreaks(record["Personensorgeberechtigte-DiViS"])
        });
        
        // Vater
        elternImportOutput.push({
            "ZSR-ID": record["ZSR-ID-ZSR"],
            "Vorname (Kind)": record["Vorname-DiViS"],
            "Nachname (Kind)": record["Zusammengesetzter-Nachname-DiViS"],
            "Vorname": record["Vorname (Vater)-DiViS"],
            "Nachname": record["Nachname (Vater)-DiViS"],
            "E-Mail": (record["E-Mail (Vater)-DiViS"] || '').toLowerCase(),
            "Straße": (record["Straße (Vater)-DiViS"] || '').toLowerCase(),
            "Geschlecht": 'm',
            "Personensorgeberechtigte": removeLineBreaks(record["Personensorgeberechtigte-DiViS"])
        });
    });
    
    updateProgress(30, 'Filtere Elterndaten...');
    
    // Leere Datensätze entfernen
    const validElternImportOutput = elternImportOutput.filter(row => 
        row["Vorname"] && row["Nachname"]
    );
    
    updateProgress(50, 'Prüfe Sorgeberechtigung...');
    
    const deletedRecords = [];
    
    // Sorgeberechtigung prüfen
    filteredElternImportOutput = validElternImportOutput.filter(row => {
        const vorname = row["Vorname"];
        const personensorgeberechtigte = row["Personensorgeberechtigte"];
        
        if (personensorgeberechtigte && !personensorgeberechtigte.includes(vorname)) {
            deletedRecords.push(row);
            return false;
        }
        return true;
    });
    
    updateProgress(70, 'Prüfe Inkonsistenzen...');
    
    // Inkonsistenzen prüfen
    await checkParentInconsistencies(filteredElternImportOutput, deletedRecords);
    
    updateProgress(100, 'Elterndaten fertig!');
    
    return filteredElternImportOutput;
}

async function checkParentInconsistencies(parentData, deletedRecords) {
    // Gelöschte Datensätze anzeigen
    if (deletedRecords.length > 0) {
        const tbody = document.getElementById('deletedRecordsBody');
        deletedRecords.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item["ZSR-ID"]}</td>
                <td>${item["Vorname (Kind)"]}</td>
                <td>${item["Nachname (Kind)"]}</td>
                <td>${item["Vorname"]}</td>
                <td>${item["Nachname"]}</td>
                <td>${item["E-Mail"]}</td>
                <td>${item["Straße"]}</td>
                <td>${item["Personensorgeberechtigte"]}</td>
            `;
            tbody.appendChild(row);
        });
        document.getElementById('deletedRecordsContainer').style.display = 'block';
    }
    
    // === NAMENS-/ADRESS-INKONSISTENZEN ===
    // Prüfung: Gleiche E-Mail-Adresse, aber unterschiedliche Namen oder Adressen
    const emailMap = new Map();

    parentData.forEach(record => {
        const kindID = record["ZSR-ID"];
        const vorname_kind = record["Vorname (Kind)"];
        const nachname_kind = record["Nachname (Kind)"];
        const email = record["E-Mail"];
        const vorname = record["Vorname"];
        const nachname = record["Nachname"];
        const adresse = record["Straße"];
        const geschlecht = record["Geschlecht"] || '';

        if (email && email.trim() !== '') {
            if (!emailMap.has(email)) {
                emailMap.set(email, []);
            }
            emailMap.get(email).push({ 
                kindID, vorname_kind, nachname_kind, 
                vorname, nachname, adresse, geschlecht
            });
        }
    });

    const inconsistencies = [];

    emailMap.forEach((records, email) => {
        if (records.length > 1) {
            // Prüfe alle Kombinationen von Datensätzen mit derselben E-Mail
            for (let i = 0; i < records.length; i++) {
                for (let j = i + 1; j < records.length; j++) {
                    const record1 = records[i];
                    const record2 = records[j];
                    
                    // Nur vergleichen, wenn das Geschlecht übereinstimmt ('' erlaubt für ältere/unspezifizierte Daten)
                    if (record1.geschlecht && record2.geschlecht && record1.geschlecht !== record2.geschlecht) continue;

                    // Inkonsistenz wenn unterschiedliche Namen oder Adressen bei verschiedenen Kindern
                    if (record1.kindID !== record2.kindID && 
                        (record1.vorname !== record2.vorname || 
                         record1.nachname !== record2.nachname || 
                         record1.adresse !== record2.adresse)) {
                        
                        inconsistencies.push({
                            zsr_id_kind1: record1.kindID,
                            vorname_kind1: record1.vorname_kind,
                            nachname_kind1: record1.nachname_kind,
                            zsr_id_kind2: record2.kindID,
                            vorname_kind2: record2.vorname_kind,
                            nachname_kind2: record2.nachname_kind,
                            email,
                            vorname1: record1.vorname,
                            nachname1: record1.nachname,
                            vorname2: record2.vorname,
                            nachname2: record2.nachname,
                            adresse1: record1.adresse,
                            adresse2: record2.adresse
                        });
                    }
                }
            }
        }
    });

    // Inkonsistenzen zur Tabelle hinzufügen
    if (inconsistencies.length > 0) {
        const tbody = document.getElementById('inconsistencyBody');
        inconsistencies.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.zsr_id_kind1}</td>
                <td>${item.vorname_kind1}</td>
                <td>${item.nachname_kind1}</td>
                <td>${item.zsr_id_kind2}</td>
                <td>${item.vorname_kind2}</td>
                <td>${item.nachname_kind2}</td>
                <td>${item.email}</td>
                <td>${item.vorname1}</td>
                <td>${item.nachname1}</td>
                <td>${item.vorname2}</td>
                <td>${item.nachname2}</td>
                <td>${item.adresse1}</td>
                <td>${item.adresse2}</td>
            `;
            tbody.appendChild(row);
        });
        document.getElementById('inconsistencyContainer').style.display = 'block';
    }

    // === E-MAIL-/ADRESS-INKONSISTENZEN ===
    // Prüfung: Gleicher Name, aber unterschiedliche E-Mails oder Adressen
    const nameMap = new Map();

    parentData.forEach(record => {
        const vorname = record["Vorname"];
        const nachname = record["Nachname"];
        const email = record["E-Mail"];
        const adresse = record["Straße"];
        const zsrId = record["ZSR-ID"];
        const vorname_kind = record["Vorname (Kind)"];
        const nachname_kind = record["Nachname (Kind)"];

        const key = `${vorname}|${nachname}`;

        if (!nameMap.has(key)) {
            nameMap.set(key, []);
        }
        nameMap.get(key).push({ 
            email, adresse, zsrId, vorname_kind, nachname_kind 
        });
    });

    const emailAddressInconsistencies = [];

    nameMap.forEach((records, key) => {
        if (records.length > 1) {
            // Prüfe alle Kombinationen von Datensätzen mit demselben Namen
            for (let i = 0; i < records.length; i++) {
                for (let j = i + 1; j < records.length; j++) {
                    const record1 = records[i];
                    const record2 = records[j];
                    
                    // Inkonsistenz wenn unterschiedliche E-Mails oder Adressen
                    if (record1.email !== record2.email || 
                        record1.adresse !== record2.adresse) {
                        
                        emailAddressInconsistencies.push({
                            vorname: key.split("|")[0],
                            nachname: key.split("|")[1],
                            email1: record1.email,
                            email2: record2.email,
                            adresse1: record1.adresse,
                            adresse2: record2.adresse,
                            zsrId1: record1.zsrId,
                            vorname_kind1: record1.vorname_kind,
                            nachname_kind1: record1.nachname_kind,
                            zsrId2: record2.zsrId,
                            vorname_kind2: record2.vorname_kind,
                            nachname_kind2: record2.nachname_kind
                        });
                    }
                }
            }
        }
    });

    // E-Mail-/Adress-Inkonsistenzen zur Tabelle hinzufügen
    if (emailAddressInconsistencies.length > 0) {
        const tbody = document.getElementById('emailInconsistencyBody');
        emailAddressInconsistencies.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.vorname}</td>
                <td>${item.nachname}</td>
                <td>${item.email1}</td>
                <td>${item.email2}</td>
                <td>${item.adresse1}</td>
                <td>${item.adresse2}</td>
                <td>${item.zsrId1}</td>
                <td>${item.vorname_kind1}</td>
                <td>${item.nachname_kind1}</td>
                <td>${item.zsrId2}</td>
                <td>${item.vorname_kind2}</td>
                <td>${item.nachname_kind2}</td>
            `;
            tbody.appendChild(row);
        });
        document.getElementById('emailInconsistencyContainer').style.display = 'block';
    }
}

// ===== EXPORT-FUNKTIONEN =====

function escapeCSVValue(value) {
    if (value == null || value === "") {
        return "";
    }
    
    const stringValue = value.toString();
    
    // Wenn der Wert Semikolons, Anführungszeichen oder Zeilenumbrüche enthält,
    // muss er in Anführungszeichen gesetzt werden
    // Beispiel: "10A Ch Ert; 10A D Kön; 10A E Sin" für die Gruppen-Spalte
    if (stringValue.includes(';') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        // Anführungszeichen im Wert müssen verdoppelt werden
        const escapedValue = stringValue.replace(/"/g, '""');
        return `"${escapedValue}"`;
    }
    
    return stringValue;
}

function generateSchuelerExport(mergedData) {
    // Offene Fälle blockieren den Export nicht, sollen aber auffallen:
    // Diese Schüler fehlen in der Datei, bis sie zugeordnet oder ignoriert sind.
    const openCases = unmatchedStudents.filter(entry => entry.status === 'open').length;
    if (openCases > 0) {
        showAlert(`Achtung: ${openCases} Schüler ohne ZSR-Datensatz sind noch offen und fehlen in dieser Datei. Bitte in der Tabelle "Kein ZSR-Datensatz gefunden" eine ZSR-ID eintragen oder die Schüler ignorieren.`, 'warning');
    }

    const exportData = mergedData.map(record => ({
        "ZSR-ID-ZSR": record["ZSR-ID-ZSR"],
        "Klasse/Information": record["Klasse/Information"],
        "Zusammengesetzter-Nachname-DiViS": record["Zusammengesetzter-Nachname-DiViS"],
        // Leerer Rufname: Vorname als Ersatz verwenden
        "Rufname-DiViS": record["Rufname-DiViS"] || record["Vorname-DiViS"] || "",
        "InitPW": record["InitPW"],
        "Geburtsdatum": record["Geburtsdatum-DiViS"],
        "Gruppen": record["Gruppen"] || ""
    }));
    
    if (exportData.length > 0) {
        // Header-Zeile
        const headers = Object.keys(exportData[0]);
        const headerLine = headers.join(";");
        
        // Datenzeilen mit korrektem CSV-Escaping
        const dataLines = exportData.map(record => 
            headers.map(header => escapeCSVValue(record[header])).join(";")
        );
        
        const csvContent = "data:text/csv;charset=utf-8," + 
            [headerLine].concat(dataLines).join("\n");
        
        const today = new Date().toISOString().split('T')[0];
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Schuelerimport IServ ${today}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert(`Schülerimport-Datei (${exportData.length} Datensätze) erfolgreich heruntergeladen!`, 'success');
    }
}

function generateElternExport() {
    if (filteredElternImportOutput.length > 0) {
        // Header-Zeile
        const headers = Object.keys(filteredElternImportOutput[0]);
        const headerLine = headers.join(";");
        
        // Datenzeilen mit korrektem CSV-Escaping
        const dataLines = filteredElternImportOutput.map(record => 
            headers.map(header => escapeCSVValue(record[header])).join(";")
        );
        
        const csvContent = "data:text/csv;charset=utf-8," + 
            [headerLine].concat(dataLines).join("\n");
        
        const today = new Date().toISOString().split('T')[0];
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Elternimport IServ ${today}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert(`Elternimport-Datei (${filteredElternImportOutput.length} Datensätze) erfolgreich heruntergeladen!`, 'success');
    } else {
        showAlert('Keine Elterndaten zum Herunterladen verfügbar.', 'error');
    }
}

// ===== KURSLISTE-EXPORT =====

function generateKurslisteExport() {
    if (courseList.length > 0) {
        // Header-Zeile
        const headers = Object.keys(courseList[0]);
        const headerLine = headers.join(";");

        // Datenzeilen mit korrektem CSV-Escaping
        const dataLines = courseList.map(record =>
            headers.map(header => escapeCSVValue(record[header])).join(";")
        );

        const csvContent = "data:text/csv;charset=utf-8," +
            [headerLine].concat(dataLines).join("\n");

        const today = new Date().toISOString().split('T')[0];
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Kursliste ${today}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showAlert(`Kursliste (${courseList.length} Kurse) erfolgreich heruntergeladen!`, 'success');
    } else {
        showAlert('Keine Kurse zum Herunterladen verfügbar.', 'error');
    }
}

// ===== LEHRER-EXPORT =====

// Test-Funktion für Lehrer-Parsing
function testTeacherParsing() {
    const testCases = [
        {
            input: "Möhring, Christian Walter [Möh]\nSchäfers, Ilka [Schä]",
            expected: ['Möh', 'Schä']
        },
        {
            input: "Dr. Schröder, Helge [Schrö]\nLassen, Thore Andreas Friedrich [Las]",
            expected: ['Schrö', 'Las']
        },
        {
            input: "[Schw][Stu][Mül][Pet]",
            expected: ['Mül', 'Pet']
        }
    ];

    console.log('=== Teste Lehrer-Parsing ===');
    testCases.forEach((testCase, index) => {
        const result = parseTeacherFromClassTeacherCell(testCase.input);
        const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
        console.log(`Test ${index + 1}:`, 
            `\nEingabe: "${testCase.input}"`,
            `\nErwartet: ${JSON.stringify(testCase.expected)}`,
            `\nErhalten: ${JSON.stringify(result)}`,
            `\nStatus: ${passed ? 'OK ✓' : 'FEHLER ✗'}`);
    });
    console.log('========================');
}

async function readClassTeacherFile(file) {
    const workbook = await toolhubReadWorkbook(file);
    try {
        const rawData = toolhubSheetRows(workbook, { header: false });
        
        if (rawData.length < 2) { // Mindestens Header + 1 Datenzeile
            throw new Error('Klassenlehrerdatei enthält nicht genügend Daten');
        }
        
        // Erste Zeile überspringen, Header ist in zweiter Zeile
        const headers = rawData[1];
        const dataRows = rawData.slice(2);
        
        const requiredColumns = ['Klasse', 'Schüler', 'Klassenleitung [Kürzel]', 'Stufe', 'Schulform', 'Klassenart'];
        const columnIndices = {};
        
        // Finde die Indizes der benötigten Spalten
        requiredColumns.forEach(col => {
            const index = headers.findIndex(header => header === col);
            if (index === -1) {
                throw new Error(`Klassenlehrerdatei: Spalte "${col}" nicht gefunden`);
            }
            columnIndices[col] = index;
        });
        
        // Verarbeite Datenzeilen
        const processedData = dataRows
            .filter(row => row && row.length >= headers.length)
            .map(row => {
                const record = {};
                requiredColumns.forEach(col => {
                    record[col] = row[columnIndices[col]] ? row[columnIndices[col]].toString().trim() : "";
                });
                return record;
            });
        
        return processedData;
        
    } catch (error) {
        throw new Error(`Fehler beim Lesen der Klassenlehrerdatei: ${error.message}`);
    }
}

function parseTeacherFromClassTeacherCell(cell) {
    if (!cell) return [];
    
    // Unicode-aware regex that includes umlauts
    const teacherRegex = /\[([^\]]+)\]/g;
    let allCodes = [];
    let match;

    // First collect all codes, preserving exact text within brackets
    const cellText = cell.toString();
    while ((match = teacherRegex.exec(cellText)) !== null) {
        const kuerzel = match[1].trim();
        if (kuerzel) {
            allCodes.push(kuerzel);
        }
    }

    // Debug logging
    console.log('Gefundene Kürzel in Zelle:', cellText, '→', allCodes);
    
    // If more than 2 codes, filter out Schw and Stu
    if (allCodes.length > 2) {
        allCodes = allCodes.filter(code => code !== 'Schw' && code !== 'Stu');
    }
    
    return allCodes;
}

function parseTeacherCell(cell) {
    // Erwartetes Format: "[Kuerzel] Anrede Nachname, Vorname"
    try {
        const bracketStart = cell.indexOf('[');
        const bracketEnd = cell.indexOf(']');
        if (bracketStart === -1 || bracketEnd === -1 || bracketEnd <= bracketStart) return null;
        const kuerzel = cell.substring(bracketStart + 1, bracketEnd).trim();

        // Rest nach der Klammer
        let rest = cell.substring(bracketEnd + 1).trim();
        // Entferne Anrede wie "Herr" oder "Frau"
        rest = rest.replace(/^(Herr|Frau)\s+/i, '');

        // Erwartung: "Nachname, Vorname"
        const commaIndex = rest.indexOf(',');
        if (commaIndex === -1) return null;
        const lastName = rest.substring(0, commaIndex).trim();
        // Extract only first name (split by spaces and take first part)
        const fullFirstName = rest.substring(commaIndex + 1).trim();
        const firstName = fullFirstName.split(' ')[0];

        return {
            firstName: firstName,
            lastName: lastName,
            importId: kuerzel,
            kuerzel: kuerzel
        };
    } catch (e) {
        return null;
    }
}

function generateLehrerExport() {
    if (!teacherList || teacherList.length === 0) {
        showAlert('Keine Lehrerdaten zum Herunterladen verfügbar.', 'error');
        return;
    }

    // CSV-Spalten: "Vorname","Nachname","Import-ID","Lehrer-Kürzel","Gruppen"
    const headers = ["Vorname", "Nachname", "Import-ID", "Lehrer-Kürzel", "Gruppen"];

    const dataLines = teacherList.map(t => {
        const values = [t.firstName || '', t.lastName || '', t.importId || '', t.kuerzel || '', (t.groups || []).join('; ')];
        return values.map(v => escapeCSVValue(v)).join(";");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(';')].concat(dataLines).join('\n');
    const today = new Date().toISOString().split('T')[0];
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Lehrerimport ${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showAlert(`Lehrerdatei (${teacherList.length} Datensätze) erfolgreich heruntergeladen!`, 'success');
}

// ===== EVENT LISTENERS =====

// Gemeinsame Upload-Komponente aus toolhub.js für alle vier Dateifelder
const divisUpload = toolhubUpload({
    input: 'divisFile', zone: 'divisFileZone', list: 'divisFileList',
    extensions: ['.xlsx'], onChange: checkFilesReady
});

const zsrUpload = toolhubUpload({
    input: 'zsrFile', zone: 'zsrFileZone', list: 'zsrFileList',
    extensions: ['.xlsx'], onChange: checkFilesReady
});

const electiveUpload = toolhubUpload({
    input: 'electiveFile', zone: 'electiveFileZone', list: 'electiveFileList',
    extensions: ['.xlsx'], onChange: checkFilesReady
});

const classTeacherUpload = toolhubUpload({
    input: 'classTeacherFile', zone: 'classTeacherFileZone', list: 'classTeacherFileList',
    extensions: ['.xlsx'], onChange: checkFilesReady
});

function checkFilesReady() {
    const zsrFile = zsrUpload.files[0];
    const divisFile = divisUpload.files[0];
    const electiveFile = electiveUpload.files[0];
    const classTeacherFile = classTeacherUpload.files[0];
    const processButton = document.getElementById('processButton');

    if (zsrFile && divisFile) {
        processButton.disabled = false;

    const features = [];
    if (electiveFile) features.push('Kursdaten');
    if (classTeacherFile) features.push('Klassenlehrerdaten');

        if (features.length > 0) {
            processButton.textContent = `Zusammenführen (mit ${features.join(' + ')})`;
        } else {
            processButton.textContent = 'Zusammenführen';
        }
    } else {
        processButton.disabled = true;
        processButton.textContent = 'Zusammenführen (ZSR- und DiViS-Dateien auswählen)';
    }
}

document.getElementById('processButton').addEventListener('click', async function() {
    const zsrFiles = zsrUpload.files;
    const divisFile = divisUpload.files[0];
    const electiveFile = electiveUpload.files[0];
    const classTeacherFile = classTeacherUpload.files[0];

    if (!zsrFiles.length || !divisFile) {
        showAlert('Bitte ZSR- und DiViS-Dateien auswählen.', 'error');
        return;
    }
    
    try {
        // UI zurücksetzen
        document.getElementById('alerts').innerHTML = '';
        document.querySelectorAll('.table-container').forEach(container => {
            container.style.display = 'none';
            container.querySelector('tbody').innerHTML = '';
        });
        
        showLoading('Verarbeitung gestartet...');

    // Reset teacher list and course list for each run
    teacherList = [];
    courseList = [];
        
        // ZSR-Datei(en) einlesen
        updateProgress(5, zsrFiles.length > 1 ? `Lese ${zsrFiles.length} ZSR-Dateien...` : 'Lese ZSR-Datei...');
        zsrData = await readZSRFiles(zsrFiles);
        
        // DiViS-Datei einlesen
        updateProgress(10, 'Lese DiViS-Datei...');
        divisData = await readDivisFile(divisFile);
        
        // Kursdatei-Upload entfernt: keine klassenbasierten Kurse mehr
        courseData = [];
        
        // Wahlpflichtkurs-Datei einlesen (optional)
        if (electiveFile) {
            updateProgress(17, 'Lese Wahlpflichtkurs-Datei...');

            // Fachkürzel-Zuordnung wird für die Kursnamen-Normalisierung benötigt
            await fachKuerzelLoadPromise;
            if (fachKuerzelLoadError) {
                showAlert('fachkuerzel.csv konnte nicht geladen werden – Fachkürzel in Kursnamen werden nicht normalisiert.', 'warning');
            }
            
            const electiveFiles = electiveUpload.files;
            if (electiveFiles.length > 0) {
                updateProgress(17, `Lese ${electiveFiles.length} Wahlpflichtkurs-Dateien...`);
                electiveData = await readElectiveFiles(electiveFiles);
            }

            const courseCount = [...new Set(electiveData.map(p => p.courseName))].length;
            const originalCourseCount = [...new Set(electiveData.map(p => p.originalCourseName))].length;
            showAlert(`Wahlpflichtkurs-Datei erfolgreich eingelesen: ${electiveData.length} Teilnehmer in ${courseCount} Kursen gefunden. Kursnamen wurden formatiert.`, 'success');
            
            // Debug: Zeige Beispiele der Namensnormalisierung
            const exampleMap = new Map();
            electiveData.forEach(p => {
                if (!exampleMap.has(p.originalCourseName)) exampleMap.set(p.originalCourseName, p.courseName);
            });
            const courseNameExamples = [...exampleMap.entries()]
                .slice(0, 3)
                .map(([original, formatted]) => `"${original}" → "${formatted}"`)
                .join(', ');
            if (courseNameExamples) {
                console.log('Kursname-Formatierung:', courseNameExamples);
            }
        } else {
            electiveData = [];
        }

        // Klassenlehrerdaten verarbeiten (optional)
        if (classTeacherFile) {
            updateProgress(19, 'Lese Klassenlehrerdaten...');
            // Test teacher parsing
            testTeacherParsing();
            try {
                classTeacherData = await readClassTeacherFile(classTeacherFile);
                
                // Füge Klassen- und Jahrgangsgruppen zu den Lehrern hinzu
                classTeacherData.forEach(record => {
                    const teacherCodes = parseTeacherFromClassTeacherCell(record['Klassenleitung [Kürzel]']);
                    const klasseGroup = "Klasse " + record['Klasse'].trim();
                    const jahrgangGroup = "Jahrgang " + record['Stufe'].trim();
                    const klassenleitungGroup = "Klassenleitungen Jg " + record['Stufe'].trim();
                    
                    teacherCodes.forEach(kuerzel => {
                        const teacher = teacherList.find(t => t.kuerzel === kuerzel);
                        if (teacher) {
                            // Add unique groups
                            const newGroups = new Set(teacher.groups || []);
                            if (!newGroups.has(klasseGroup)) {
                                newGroups.add(klasseGroup);
                            }
                            if (!newGroups.has(jahrgangGroup)) {
                                newGroups.add(jahrgangGroup);
                            }
                            if (!newGroups.has(klassenleitungGroup)) {
                                newGroups.add(klassenleitungGroup);
                            }
                            teacher.groups = Array.from(newGroups);
                        }
                    });
                });
                
                showAlert(`Klassenlehrerdaten erfolgreich eingelesen: ${classTeacherData.length} Einträge verarbeitet.`, 'success');
            } catch (error) {
                console.error('Fehler beim Verarbeiten der Klassenlehrerdaten:', error);
                showAlert('Warnung: Klassenlehrerdaten konnten nicht verarbeitet werden: ' + error.message, 'warning');
            }
        }
        
    // Zusammenfassung der geladenen Dateien
    const loadedFiles = [zsrFiles.length > 1 ? `${zsrFiles.length} ZSR-Dateien` : 'ZSR-Datei', 'DiViS-Datei'];
    if (electiveFile) loadedFiles.push('Wahlpflichtkurse');
        
        showAlert(`Dateien geladen: ${loadedFiles.join(', ')}`, 'info');
        
        // Daten zusammenführen
        mergedData = await mergeStudentData(zsrData, divisData);
        
        // Elterndaten verarbeiten
        await processParentData(mergedData);
        
        // Download-Buttons aktivieren (inline-flex, damit Icon und Beschriftung
        // ihren Abstand aus .btn-success behalten)
        document.getElementById('downloadSchuelerButton').style.display = 'inline-flex';
        document.getElementById('downloadSchuelerButton').disabled = false;
        document.getElementById('downloadElternButton').style.display = 'inline-flex';
        document.getElementById('downloadElternButton').disabled = false;
        // Lehrer-Export Button (falls vorhanden)
        const lehrerBtn = document.getElementById('downloadLehrerButton');
        if (lehrerBtn) {
            lehrerBtn.style.display = 'inline-flex';
            lehrerBtn.disabled = teacherList.length === 0;
        }
        // Kursliste-Export Button
        const kurslisteBtn = document.getElementById('downloadKurslisteButton');
        if (kurslisteBtn) {
            kurslisteBtn.style.display = 'inline-flex';
            kurslisteBtn.disabled = courseList.length === 0;
        }
        
        // Kein automatischer Download: Der Schülerimport wird erst auf Knopfdruck
        // erzeugt, damit offene Fälle vorher geklärt werden können.
        if (unmatchedStudents.length > 0) {
            showAlert(`${unmatchedStudents.length} Schüler haben keinen ZSR-Datensatz. Bitte in der Tabelle "Kein ZSR-Datensatz gefunden" je Schüler eine ZSR-ID eintragen oder ihn ignorieren – danach die Import-Dateien herunterladen.`, 'warning');
        } else {
            showAlert('Verarbeitung fertig. Die Import-Dateien lassen sich jetzt über die Schaltflächen herunterladen.', 'info');
        }

        hideLoading();
        
    } catch (error) {
        hideLoading();
        showAlert(error.message, 'error');
        console.error('Verarbeitungsfehler:', error);
    }
});

document.getElementById('downloadSchuelerButton').addEventListener('click', function() {
    generateSchuelerExport(mergedData);
});

document.getElementById('downloadElternButton').addEventListener('click', function() {
    generateElternExport();
});

// Optional Lehrer-Button
const downloadLehrerButton = document.getElementById('downloadLehrerButton');
if (downloadLehrerButton) {
    downloadLehrerButton.addEventListener('click', function() {
        generateLehrerExport();
    });
}

// Kursliste-Button
const downloadKurslisteButton = document.getElementById('downloadKurslisteButton');
if (downloadKurslisteButton) {
    downloadKurslisteButton.addEventListener('click', function() {
        generateKurslisteExport();
    });
}

const clearAlertsButton = document.getElementById('clearAlertsButton');
if (clearAlertsButton) {
    clearAlertsButton.addEventListener('click', function() {
        const alerts = document.getElementById('alerts');
        if (alerts) alerts.innerHTML = '';
        // hide button when no alerts
        clearAlertsButton.style.display = 'none';
    });
}

// Drag-and-drop übernimmt die gemeinsame Upload-Komponente (toolhub.js)

// === DEBUGGING-MODUS ===
// Blendet Auswertungen ein, die nur bei der Fehlersuche interessieren
// (zurzeit die Tabelle "Durch besseren Match ersetzt"). Die Wahl bleibt wie beim
// Design im localStorage stehen und gilt für weitere Besuche.
const DEBUG_STORAGE_KEY = 'zsr-divis-merger-debug';

function setDebugMode(on) {
    document.body.classList.toggle('debug-mode', on);
    const toggle = document.getElementById('debugToggle');
    if (toggle) toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    localStorage.setItem(DEBUG_STORAGE_KEY, on ? 'an' : 'aus');
}

const debugToggle = document.getElementById('debugToggle');
if (debugToggle) {
    setDebugMode(localStorage.getItem(DEBUG_STORAGE_KEY) === 'an');
    debugToggle.addEventListener('click', function() {
        setDebugMode(!document.body.classList.contains('debug-mode'));
    });
}

// === CLEANUP ===
window.addEventListener('beforeunload', function() {
    zsrData = null;
    divisData = null;
    courseData = null;
    electiveData = null;
    mergedData = null;
    filteredElternImportOutput = null;
    courseList = null;
});

// === INITIALIZATION ===

// Fachkürzel-Zuordnung beim Start laden (für die Normalisierung der Kursnamen).
// Schlägt das Laden fehl (z. B. Aufruf über file:// oder Datei fehlt), wird beim
// Verarbeiten von Kurse-Dateien eine Warnung angezeigt und ohne Zuordnung gearbeitet.
const fachKuerzelLoadPromise = toolhubLadeFachkuerzel()
    .then(map => {
        fachKuerzelMap = map;
    })
    .catch(error => {
        fachKuerzelLoadError = true;
        console.warn(error.message);
    });

document.addEventListener('DOMContentLoaded', function() {
    checkFilesReady();
});

// Initial state
checkFilesReady();