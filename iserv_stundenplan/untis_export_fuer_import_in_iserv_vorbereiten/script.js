// Normalisierung der Kursbezeichnungen (Schülergruppen) in der Untis-Exportdatei GPU002.TXT
// Schema: <Klasse|Jahrgang|Jahrgangsspanne> <Fachkürzel> <Lehrerkürzel...> <ggf. laufende Nummer>
//
// Garantien:
//  - Zeilen mit gleicher alter Kursbezeichnung erhalten dieselbe neue Bezeichnung.
//  - Zeilen mit unterschiedlicher alter Kursbezeichnung erhalten unterschiedliche neue
//    Bezeichnungen (bei Bedarf durch laufende Nummern).
//  - Alle übrigen Felder der Datei bleiben unverändert.
//
// Optionen:
//  - nurKlassenuebergreifend: Zeilen von Kursen, die genau eine Klasse betreffen, werden
//    gelöscht (diese Unterrichte werden in IServ der Klasse statt einem Kurs zugeordnet).
//    Ausnahme: Oberstufenkurse (einzige "Klasse" ist der Jahrgang 11 oder 12) sind echte
//    Parallelkurse und bleiben erhalten.
//  - fachNormalisieren: Fachkürzel in der Kursbezeichnung werden anhand von
//    Fachkürzel.csv (aus dem zsr_divis_merger) vereinheitlicht.

const FELD_KLASSE = 4;
const FELD_LEHRER = 5;
const FELD_FACH = 6;
const FELD_SCHUELERGRUPPE = 41;

const OBERSTUFEN_KLASSEN = new Set(['11', '12']);

// Zerlegt eine CSV-Zeile in ihre Roh-Felder (inkl. Anführungszeichen),
// damit die Zeile später unverändert wieder zusammengesetzt werden kann.
function splitRaw(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            current += char;
        } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current);
    return fields;
}

function unquote(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
}

function quote(value) {
    return '"' + value.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------------------
// Fachkürzel-Normalisierung (Tabelle und Semantik wie im zsr_divis_merger)
// ---------------------------------------------------------------------------

// Erwartetes Format: "Fach;Normalisiertes Kürzel;Zu Ersetzen[;weitere Varianten...]"
// Es wird gegen alle Spalten (Fachname, Kürzel, Varianten) case-insensitiv gematcht.
function parseFachKuerzelCSV(text) {
    const map = new Map();
    const lines = text.replace(/^﻿/, '').split(/\r?\n/); // BOM entfernen
    lines.slice(1).forEach((line) => {
        if (!line.trim()) return;
        const fields = line.split(';').map((f) => f.trim());
        const normalized = fields[1];
        if (!normalized) return;
        fields.forEach((key) => {
            if (!key) return;
            map.set(key.toLowerCase().replace(/\s+/g, ' '), normalized);
        });
    });
    return map;
}

// Normalisiert ein einzelnes Fachkürzel:
// - Ist die komplette Phrase bekannt (case-insensitiv), wird sie ersetzt.
// - Sonst gilt sie als EIN unbekanntes Kürzel: mehrteilige werden mit Unterstrich
//   verbunden ("RS Fö" -> "RS_Fö"), damit die Bestandteile der Kursbezeichnung
//   eindeutig durch Leerzeichen getrennt bleiben; einteilige bleiben unverändert.
function normalisiereFach(fach, fachMap) {
    if (fachMap && fachMap.size > 0) {
        const key = fach.toLowerCase().replace(/\s+/g, ' ');
        const normalized = fachMap.get(key);
        if (normalized) return normalized;
    }
    return fach.replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// Kursbezeichnungen
// ---------------------------------------------------------------------------

// Zerlegt ein Klassenkürzel in Jahrgang (Zahl) und Suffix, z. B. "8A" -> {jahrgang: 8, suffix: "A"}.
// Nicht-numerische Klassen (z. B. "IVK") liefern jahrgang = null.
function parseKlasse(klasse) {
    const match = klasse.match(/^(\d+)(.*)$/);
    if (!match) return { jahrgang: null, suffix: klasse };
    return { jahrgang: parseInt(match[1], 10), suffix: match[2] };
}

function padJahrgang(jahrgang) {
    return String(jahrgang).padStart(2, '0');
}

// Bestimmt den Klassen-Teil der Kursbezeichnung aus allen Klassen eines Kurses.
function klassenTeil(klassen) {
    const eindeutig = [...new Set(klassen.filter((k) => k !== ''))];
    if (eindeutig.length === 0) return '';

    const geparst = eindeutig.map(parseKlasse);
    const jahrgaenge = [...new Set(geparst.filter((p) => p.jahrgang !== null).map((p) => p.jahrgang))];

    if (jahrgaenge.length === 0) {
        // Nur nicht-numerische Klassen (z. B. IVK): unverändert übernehmen.
        return eindeutig.sort((a, b) => a.localeCompare(b, 'de')).join(' ');
    }
    if (eindeutig.length === 1) {
        // Genau eine Klasse: Jahrgang mit führender Null, Suffix erhalten (z. B. "08A", "11").
        const p = geparst[0];
        return p.jahrgang !== null ? padJahrgang(p.jahrgang) + p.suffix : eindeutig[0];
    }
    const min = Math.min(...jahrgaenge);
    const max = Math.max(...jahrgaenge);
    // Mehrere Klassen: Jahrgang (z. B. "08") oder Jahrgangsspanne (z. B. "08-10").
    return min === max ? padJahrgang(min) : padJahrgang(min) + '-' + padJahrgang(max);
}

// Baut aus allen Zeilen eines Kurses den Basis-Namen (ohne laufende Nummer).
function basisName(zeilen, fachMap) {
    const klassen = zeilen.map((z) => z.klasse);
    let faecher = [...new Set(zeilen.map((z) => z.fach).filter((f) => f !== ''))];
    if (fachMap) {
        faecher = [...new Set(faecher.map((f) => normalisiereFach(f, fachMap)))];
    }
    faecher.sort((a, b) => a.localeCompare(b, 'de'));
    // '?' ist der Untis-Platzhalter für "keine Lehrkraft zugewiesen" und entfällt.
    const lehrer = [...new Set(zeilen.map((z) => z.lehrer).filter((l) => l !== '' && l !== '?'))]
        .sort((a, b) => a.localeCompare(b, 'de'));

    return [klassenTeil(klassen), faecher.join(' '), lehrer.join(' ')]
        .filter((teil) => teil !== '')
        .join(' ');
}

// Kurse, die genau eine Klasse betreffen, werden in IServ direkt der Klasse zugeordnet
// und aus der Datei entfernt — außer in der Oberstufe (Jahrgang 11/12), wo es sich um
// echte Parallelkurse handelt.
function istEinKlassenKurs(zeilen) {
    const klassen = new Set(zeilen.map((z) => z.klasse).filter((k) => k !== ''));
    if (klassen.size !== 1) return false;
    return !OBERSTUFEN_KLASSEN.has([...klassen][0]);
}

// Kernfunktion: berechnet Umbenennung/Filterung und gibt Datei-Inhalt + Mapping zurück.
function normalisiereGPU002(text, optionen = {}) {
    const { nurKlassenuebergreifend = false, fachNormalisieren = false, fachMap = null } = optionen;
    const zeilenumbruch = text.includes('\r\n') ? '\r\n' : '\n';
    const zeilen = text.split(/\r?\n/);

    // 1. Zeilen parsen und nach alter Kursbezeichnung gruppieren.
    const parsed = zeilen.map((line) => {
        if (line.trim() === '') return null;
        const raw = splitRaw(line);
        if (raw.length <= FELD_SCHUELERGRUPPE) return null;
        return {
            raw,
            klasse: unquote(raw[FELD_KLASSE]),
            lehrer: unquote(raw[FELD_LEHRER]),
            fach: unquote(raw[FELD_FACH]),
            gruppe: unquote(raw[FELD_SCHUELERGRUPPE]),
        };
    });

    const gruppen = new Map(); // alte Bezeichnung -> Zeilen (in Dateireihenfolge)
    for (const p of parsed) {
        if (!p || p.gruppe === '') continue;
        if (!gruppen.has(p.gruppe)) gruppen.set(p.gruppe, []);
        gruppen.get(p.gruppe).push(p);
    }

    // 2. Ein-Klassen-Kurse bestimmen und Basis-Namen der verbleibenden Kurse berechnen.
    const mapping = new Map(); // alte Bezeichnung -> { neu, nummeriert, entfernt }
    const basisZuAlt = new Map(); // Basis-Name -> alte Bezeichnungen
    for (const [alt, zeilenGruppe] of gruppen) {
        if (nurKlassenuebergreifend && istEinKlassenKurs(zeilenGruppe)) {
            mapping.set(alt, { neu: null, nummeriert: false, entfernt: true });
            continue;
        }
        const basis = basisName(zeilenGruppe, fachNormalisieren ? fachMap : null);
        if (!basisZuAlt.has(basis)) basisZuAlt.set(basis, []);
        basisZuAlt.get(basis).push(alt);
    }

    // 3. Endgültige Namen vergeben: bei Kollision erhalten alle Kurse eine laufende Nummer.
    // Kollisionspartner werden alphanumerisch nach alter Bezeichnung sortiert, damit eine
    // bereits vorhandene Nummerierung (z. B. "... 1" / "... 2") erhalten bleibt.
    const vergeben = new Set();
    for (const [basis, alte] of basisZuAlt) {
        alte.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
        alte.forEach((alt, index) => {
            let neu = alte.length > 1 ? basis + ' ' + (index + 1) : basis;
            let nummer = index + 1;
            while (vergeben.has(neu)) {
                nummer++;
                neu = basis + ' ' + nummer;
            }
            vergeben.add(neu);
            mapping.set(alt, { neu, nummeriert: alte.length > 1, entfernt: false });
        });
    }

    // 4. Zeilen neu zusammensetzen; Zeilen entfernter Kurse werden ausgelassen,
    //    sonst wird nur das Schülergruppen-Feld ersetzt.
    const ausgabe = [];
    let entfernteZeilen = 0;
    zeilen.forEach((line, i) => {
        const p = parsed[i];
        if (!p || p.gruppe === '') {
            ausgabe.push(line);
            return;
        }
        const eintrag = mapping.get(p.gruppe);
        if (eintrag.entfernt) {
            entfernteZeilen++;
            return;
        }
        const raw = p.raw.slice();
        raw[FELD_SCHUELERGRUPPE] = quote(eintrag.neu);
        ausgabe.push(raw.join(','));
    });

    return {
        inhalt: ausgabe.join(zeilenumbruch),
        mapping,
        anzahlZeilen: parsed.filter((p) => p !== null).length,
        anzahlOhneGruppe: parsed.filter((p) => p !== null && p.gruppe === '').length,
        entfernteZeilen,
    };
}

// ---------------------------------------------------------------------------
// Browser-UI (wird unter Node.js für Tests übersprungen)
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined') {
    const FACHKUERZEL_URL = '../../iserv_benutzerverwaltung/zsr_divis_merger/Fachk%C3%BCrzel.csv';

    let dateiText = null;
    let ergebnis = null;
    let erkannteKodierung = null;
    let fachMap = null;

    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorDiv = document.getElementById('error');
    const warnDiv = document.getElementById('warnung');
    const resultsDiv = document.getElementById('results');
    const statsDiv = document.getElementById('stats');
    const mappingBody = document.getElementById('mappingBody');
    const optKlassenuebergreifend = document.getElementById('optKlassenuebergreifend');
    const optFachNormalisieren = document.getElementById('optFachNormalisieren');
    const fachCsvFallback = document.getElementById('fachCsvFallback');
    const fachCsvInput = document.getElementById('fachCsvInput');

    // Fachkürzel.csv aus dem zsr_divis_merger laden. Schlägt das fehl (z. B. beim Öffnen
    // der Seite über file://), kann die Datei manuell ausgewählt werden.
    fetch(FACHKUERZEL_URL)
        .then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then((text) => {
            fachMap = parseFachKuerzelCSV(text);
            aktualisiere();
        })
        .catch(() => {
            fachCsvFallback.style.display = 'block';
            aktualisiere();
        });

    fachCsvInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        const reader = new FileReader();
        reader.onload = () => {
            fachMap = parseFachKuerzelCSV(reader.result);
            fachCsvFallback.style.display = 'none';
            aktualisiere();
        };
        reader.readAsText(e.target.files[0], 'UTF-8');
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
    optKlassenuebergreifend.addEventListener('change', aktualisiere);
    optFachNormalisieren.addEventListener('change', aktualisiere);

    function handleFile(file) {
        errorDiv.textContent = '';
        resultsDiv.style.display = 'none';
        dateiText = null;
        ergebnis = null;

        const reader = new FileReader();
        reader.onload = () => {
            // Untis exportiert je nach System UTF-8 oder Windows-1252.
            const buffer = reader.result;
            try {
                dateiText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
                erkannteKodierung = 'UTF-8';
            } catch {
                dateiText = new TextDecoder('windows-1252').decode(buffer);
                erkannteKodierung = 'Windows-1252';
            }
            aktualisiere();
        };
        reader.readAsArrayBuffer(file);
    }

    function aktualisiere() {
        if (dateiText === null) return;
        errorDiv.textContent = '';
        warnDiv.textContent = '';
        try {
            if (optFachNormalisieren.checked && !fachMap) {
                warnDiv.textContent = 'Fachkürzel.csv ist nicht geladen — die Fachkürzel bleiben unverändert.';
            }
            ergebnis = normalisiereGPU002(dateiText, {
                nurKlassenuebergreifend: optKlassenuebergreifend.checked,
                fachNormalisieren: optFachNormalisieren.checked,
                fachMap,
            });
            zeigeErgebnis();
        } catch (err) {
            errorDiv.textContent = 'Fehler beim Verarbeiten der Datei: ' + err.message;
        }
    }

    function zeigeErgebnis() {
        const eintraege = [...ergebnis.mapping.entries()];
        const behalten = eintraege.filter(([, e]) => !e.entfernt);
        const entfernt = eintraege.filter(([, e]) => e.entfernt);
        const geaendert = behalten.filter(([alt, e]) => alt !== e.neu);
        const nummeriert = behalten.filter(([, e]) => e.nummeriert);

        statsDiv.innerHTML =
            `<p>Datenzeilen: <strong>${ergebnis.anzahlZeilen}</strong> ` +
            `(davon ${ergebnis.anzahlOhneGruppe} ohne Kursbezeichnung, bleiben unverändert)</p>` +
            `<p>Kurse: <strong>${eintraege.length}</strong> &middot; ` +
            `behalten: <strong>${behalten.length}</strong> (umbenannt: ${geaendert.length}, ` +
            `mit laufender Nummer: ${nummeriert.length}) &middot; ` +
            `entfernt: <strong>${entfernt.length}</strong> (${ergebnis.entfernteZeilen} Zeilen)</p>` +
            `<p>Erkannte Kodierung: ${erkannteKodierung} (Download erfolgt als UTF-8)</p>`;

        behalten.sort((a, b) => a[1].neu.localeCompare(b[1].neu, 'de'));
        entfernt.sort((a, b) => a[0].localeCompare(b[0], 'de'));

        mappingBody.innerHTML = '';
        for (const [alt, e] of [...behalten, ...entfernt]) {
            const tr = document.createElement('tr');
            if (e.entfernt) tr.className = 'entfernt';
            else if (e.nummeriert) tr.className = 'nummeriert';
            const tdAlt = document.createElement('td');
            tdAlt.textContent = alt;
            const tdNeu = document.createElement('td');
            tdNeu.textContent = e.entfernt ? '— entfernt (nur eine Klasse) —' : e.neu;
            tr.append(tdAlt, tdNeu);
            mappingBody.appendChild(tr);
        }

        resultsDiv.style.display = 'block';
    }

    downloadBtn.addEventListener('click', () => {
        if (!ergebnis) return;
        const blob = new Blob([ergebnis.inhalt], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'GPU002.TXT';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    });
}

// Export für Tests unter Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        normalisiereGPU002, klassenTeil, basisName, splitRaw, unquote,
        parseFachKuerzelCSV, normalisiereFach, istEinKlassenKurs,
    };
}
