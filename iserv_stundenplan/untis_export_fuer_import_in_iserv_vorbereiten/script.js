// Aufbereitung der Untis-Exportdateien GPU001.TXT (Stundenplan) und GPU002.TXT (Unterricht)
// für den Import in IServ. GPU001 bleibt unverändert; in GPU002 werden die Kursbezeichnungen
// (Schülergruppen) normalisiert:
//   <Klasse|Jahrgang|Jahrgangsspanne> <Fachkürzel> <Lehrerkürzel...> <ggf. Zeitangabe>
//
// Garantien:
//  - Zeilen mit gleicher alter Kursbezeichnung erhalten dieselbe neue Bezeichnung.
//  - Zeilen mit unterschiedlicher alter Kursbezeichnung erhalten unterschiedliche neue
//    Bezeichnungen. Kollisionen werden durch die Unterrichtszeiten aus GPU001 unterschieden
//    (z. B. "11-12 Lat Se (Di 1.+2.)"); reicht das nicht, zusätzlich durch laufende Nummern.
//  - Alle übrigen Felder der Datei bleiben unverändert.
//
// Optionen:
//  - nurKlassenuebergreifend: Zeilen von Kursen, die genau eine Klasse betreffen, werden
//    gelöscht (diese Unterrichte werden in IServ der Klasse statt einem Kurs zugeordnet).
//    Ausnahme: Oberstufenkurse (einzige "Klasse" ist der Jahrgang 11 oder 12) sind echte
//    Parallelkurse und bleiben erhalten.
//  - fachNormalisieren: Fachkürzel in der Kursbezeichnung werden anhand von
//    Fachkürzel.csv (aus dem zsr_divis_merger) vereinheitlicht.

const FELD_UNR = 0;
const FELD_KLASSE = 4;
const FELD_LEHRER = 5;
const FELD_FACH = 6;
const FELD_SCHUELERGRUPPE = 41;

// GPU001: eine Zeile pro Unterrichtsnummer, Kopplungszeile (Lehrer/Fach) und Einzelstunde.
const GPU001_UNR = 0;
const GPU001_LEHRER = 2;
const GPU001_FACH = 3;
const GPU001_TAG = 5;
const GPU001_STUNDE = 6;

const OBERSTUFEN_KLASSEN = new Set(['11', '12']);
const WOCHENTAGE = [null, 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

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
// Stundenplan (GPU001)
// ---------------------------------------------------------------------------

// Liest GPU001 und liefert eine Map "U-Nr|Lehrer|Fach" -> Menge der Einzelstunden
// ("Tag,Stunde"). Über diesen Schlüssel finden die Kopplungszeilen aus GPU002 ihre Zeiten.
function parseGPU001(text) {
    const map = new Map();
    for (const line of text.split(/\r?\n/)) {
        if (line.trim() === '') continue;
        const raw = splitRaw(line);
        if (raw.length <= GPU001_STUNDE) continue;
        const key = unquote(raw[GPU001_UNR]) + '|' + unquote(raw[GPU001_LEHRER]) + '|' + unquote(raw[GPU001_FACH]);
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(unquote(raw[GPU001_TAG]) + ',' + unquote(raw[GPU001_STUNDE]));
    }
    return map;
}

// Baut die Zeitangabe eines Kurses aus seinen Einzelstunden, z. B. "Di 1.+2." oder
// "Di 1.+2., Do 5." — leere Zeichenkette, wenn keine Stunden gefunden wurden.
function zeitAngabe(zeilenGruppe, gpu001Map) {
    const stunden = new Set();
    for (const z of zeilenGruppe) {
        const zeiten = gpu001Map.get(z.unr + '|' + z.lehrer + '|' + z.fach);
        if (zeiten) for (const s of zeiten) stunden.add(s);
    }
    if (stunden.size === 0) return '';

    const proTag = new Map();
    for (const s of stunden) {
        const [tag, stunde] = s.split(',').map(Number);
        if (!proTag.has(tag)) proTag.set(tag, []);
        proTag.get(tag).push(stunde);
    }
    return [...proTag.keys()]
        .sort((a, b) => a - b)
        .map((tag) => {
            const name = WOCHENTAGE[tag] ?? 'Tag' + tag;
            const std = proTag.get(tag).sort((a, b) => a - b).map((s) => s + '.').join('+');
            return name + ' ' + std;
        })
        .join(', ');
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

// Baut aus allen Zeilen eines Kurses den Basis-Namen (ohne Unterscheidungszusatz).
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
    const {
        nurKlassenuebergreifend = false,
        fachNormalisieren = false,
        fachMap = null,
        gpu001Map = null,
    } = optionen;
    const zeilenumbruch = text.includes('\r\n') ? '\r\n' : '\n';
    const zeilen = text.split(/\r?\n/);

    // 1. Zeilen parsen und nach alter Kursbezeichnung gruppieren.
    const parsed = zeilen.map((line) => {
        if (line.trim() === '') return null;
        const raw = splitRaw(line);
        if (raw.length <= FELD_SCHUELERGRUPPE) return null;
        return {
            raw,
            unr: unquote(raw[FELD_UNR]),
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
    const mapping = new Map(); // alte Bezeichnung -> { neu, unterschieden, entfernt }
    const basisZuAlt = new Map(); // Basis-Name -> alte Bezeichnungen
    for (const [alt, zeilenGruppe] of gruppen) {
        if (nurKlassenuebergreifend && istEinKlassenKurs(zeilenGruppe)) {
            mapping.set(alt, { neu: null, unterschieden: false, entfernt: true });
            continue;
        }
        const basis = basisName(zeilenGruppe, fachNormalisieren ? fachMap : null);
        if (!basisZuAlt.has(basis)) basisZuAlt.set(basis, []);
        basisZuAlt.get(basis).push(alt);
    }

    // 3. Endgültige Namen vergeben. Kollidieren mehrere Kurse auf demselben Basis-Namen,
    //    werden sie durch ihre Unterrichtszeiten aus GPU001 unterschieden, z. B.
    //    "11-12 Lat Se (Di 1.+2.)". Haben Kurse identische Zeiten oder fehlt GPU001,
    //    erhalten sie zusätzlich laufende Nummern. Kollisionspartner werden alphanumerisch
    //    nach alter Bezeichnung sortiert, damit die Vergabe stabil bleibt.
    const vergeben = new Set();
    for (const [basis, alte] of basisZuAlt) {
        alte.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));

        // Kandidaten mit Zeitangabe bilden (nur bei Kollision nötig).
        const kandidaten = alte.map((alt) => {
            if (alte.length === 1 || !gpu001Map) return basis;
            const zeit = zeitAngabe(gruppen.get(alt), gpu001Map);
            return zeit === '' ? basis : basis + ' (' + zeit + ')';
        });

        // Kandidaten, die mehrfach vorkommen, zusätzlich durchnummerieren.
        const haeufigkeit = new Map();
        for (const k of kandidaten) haeufigkeit.set(k, (haeufigkeit.get(k) ?? 0) + 1);
        const zaehler = new Map();
        alte.forEach((alt, index) => {
            const kandidat = kandidaten[index];
            let neu = kandidat;
            if (haeufigkeit.get(kandidat) > 1) {
                const n = (zaehler.get(kandidat) ?? 0) + 1;
                zaehler.set(kandidat, n);
                neu = kandidat + ' ' + n;
            }
            let nummer = 1;
            while (vergeben.has(neu)) {
                nummer++;
                neu = kandidat + ' ' + nummer;
            }
            vergeben.add(neu);
            mapping.set(alt, { neu, unterschieden: alte.length > 1, entfernt: false });
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
// ZIP-Archiv (Store-Verfahren ohne Kompression, ausreichend für den IServ-Import)
// ---------------------------------------------------------------------------

const CRC32_TABELLE = (() => {
    const tabelle = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tabelle[i] = c >>> 0;
    }
    return tabelle;
})();

function crc32(daten) {
    let crc = 0xffffffff;
    for (let i = 0; i < daten.length; i++) {
        crc = CRC32_TABELLE[(crc ^ daten[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Erzeugt ein ZIP-Archiv aus Dateien { name (ASCII), daten (Uint8Array) }.
function erzeugeZip(dateien, datum = new Date()) {
    const dosZeit = (datum.getHours() << 11) | (datum.getMinutes() << 5) | Math.floor(datum.getSeconds() / 2);
    const dosDatum = ((datum.getFullYear() - 1980) << 9) | ((datum.getMonth() + 1) << 5) | datum.getDate();

    const teile = [];
    const zentral = [];
    let offset = 0;

    for (const { name, daten } of dateien) {
        const nameBytes = new TextEncoder().encode(name);
        const crc = crc32(daten);

        const lokal = new DataView(new ArrayBuffer(30));
        lokal.setUint32(0, 0x04034b50, true); // Signatur Local File Header
        lokal.setUint16(4, 20, true); // benötigte Version
        lokal.setUint16(8, 0, true); // Methode: Store
        lokal.setUint16(10, dosZeit, true);
        lokal.setUint16(12, dosDatum, true);
        lokal.setUint32(14, crc, true);
        lokal.setUint32(18, daten.length, true); // komprimiert (= unkomprimiert bei Store)
        lokal.setUint32(22, daten.length, true);
        lokal.setUint16(26, nameBytes.length, true);
        teile.push(new Uint8Array(lokal.buffer), nameBytes, daten);

        const eintrag = new DataView(new ArrayBuffer(46));
        eintrag.setUint32(0, 0x02014b50, true); // Signatur Central Directory
        eintrag.setUint16(4, 20, true);
        eintrag.setUint16(6, 20, true);
        eintrag.setUint16(10, 0, true); // Methode: Store
        eintrag.setUint16(12, dosZeit, true);
        eintrag.setUint16(14, dosDatum, true);
        eintrag.setUint32(16, crc, true);
        eintrag.setUint32(20, daten.length, true);
        eintrag.setUint32(24, daten.length, true);
        eintrag.setUint16(28, nameBytes.length, true);
        eintrag.setUint32(42, offset, true);
        zentral.push(new Uint8Array(eintrag.buffer), nameBytes);

        offset += 30 + nameBytes.length + daten.length;
    }

    let zentralGroesse = 0;
    for (const t of zentral) zentralGroesse += t.length;

    const ende = new DataView(new ArrayBuffer(22));
    ende.setUint32(0, 0x06054b50, true); // Signatur End of Central Directory
    ende.setUint16(8, dateien.length, true);
    ende.setUint16(10, dateien.length, true);
    ende.setUint32(12, zentralGroesse, true);
    ende.setUint32(16, offset, true);

    const alleTeile = [...teile, ...zentral, new Uint8Array(ende.buffer)];
    let gesamt = 0;
    for (const t of alleTeile) gesamt += t.length;
    const zip = new Uint8Array(gesamt);
    let pos = 0;
    for (const t of alleTeile) {
        zip.set(t, pos);
        pos += t.length;
    }
    return zip;
}

// ---------------------------------------------------------------------------
// Browser-UI (wird unter Node.js für Tests übersprungen)
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined') {
    const FACHKUERZEL_URL = '../../iserv_benutzerverwaltung/zsr_divis_merger/Fachk%C3%BCrzel.csv';

    let gpu002Text = null;
    let gpu001Text = null;
    let gpu001Bytes = null; // Original für das ZIP-Archiv
    let ergebnis = null;
    let erkannteKodierung = null;
    let fachMap = null;

    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const fileStatus = document.getElementById('fileStatus');
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
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    optKlassenuebergreifend.addEventListener('change', aktualisiere);
    optFachNormalisieren.addEventListener('change', aktualisiere);

    // Untis exportiert je nach System UTF-8 oder Windows-1252.
    function dekodiere(buffer) {
        try {
            return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), kodierung: 'UTF-8' };
        } catch {
            return { text: new TextDecoder('windows-1252').decode(buffer), kodierung: 'Windows-1252' };
        }
    }

    // Unterscheidet GPU001 (9 Felder) und GPU002 (47 Felder) anhand der Spaltenzahl;
    // der Dateiname dient nur als Rückfallebene.
    function erkenneDatei(name, text) {
        const ersteZeile = text.split(/\r?\n/).find((l) => l.trim() !== '');
        if (ersteZeile) {
            const felder = splitRaw(ersteZeile).length;
            if (felder > FELD_SCHUELERGRUPPE) return 'GPU002';
            if (felder >= 7) return 'GPU001';
        }
        if (/001/.test(name)) return 'GPU001';
        if (/002/.test(name)) return 'GPU002';
        return null;
    }

    function handleFiles(files) {
        errorDiv.textContent = '';
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = () => {
                const { text, kodierung } = dekodiere(reader.result);
                const typ = erkenneDatei(file.name, text);
                if (typ === 'GPU002') {
                    gpu002Text = text;
                    erkannteKodierung = kodierung;
                } else if (typ === 'GPU001') {
                    gpu001Text = text;
                    gpu001Bytes = new Uint8Array(reader.result);
                } else {
                    errorDiv.textContent = `"${file.name}" wurde nicht als GPU001 oder GPU002 erkannt.`;
                }
                aktualisiere();
            };
            reader.readAsArrayBuffer(file);
        }
    }

    function aktualisiere() {
        fileStatus.innerHTML =
            `GPU001.TXT: <strong>${gpu001Text ? '✓ geladen' : 'fehlt'}</strong> &middot; ` +
            `GPU002.TXT: <strong>${gpu002Text ? '✓ geladen' : 'fehlt'}</strong>`;
        downloadBtn.disabled = !(gpu001Text && gpu002Text);

        if (gpu002Text === null) return;
        errorDiv.textContent = '';
        warnDiv.textContent = '';
        try {
            const hinweise = [];
            if (optFachNormalisieren.checked && !fachMap) {
                hinweise.push('Fachkürzel.csv ist nicht geladen — die Fachkürzel bleiben unverändert.');
            }
            if (gpu001Text === null) {
                hinweise.push('GPU001.TXT fehlt — Kurse mit gleichem Namen werden vorerst nummeriert statt ' +
                    'über ihre Unterrichtszeiten unterschieden, und der ZIP-Download ist noch nicht möglich.');
            }
            warnDiv.textContent = hinweise.join(' ');
            ergebnis = normalisiereGPU002(gpu002Text, {
                nurKlassenuebergreifend: optKlassenuebergreifend.checked,
                fachNormalisieren: optFachNormalisieren.checked,
                fachMap,
                gpu001Map: gpu001Text !== null ? parseGPU001(gpu001Text) : null,
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
        const unterschieden = behalten.filter(([, e]) => e.unterschieden);
        const normal = behalten.filter(([, e]) => !e.unterschieden);

        statsDiv.innerHTML =
            `<p>Datenzeilen: <strong>${ergebnis.anzahlZeilen}</strong> ` +
            `(davon ${ergebnis.anzahlOhneGruppe} ohne Kursbezeichnung, bleiben unverändert)</p>` +
            `<p>Kurse: <strong>${eintraege.length}</strong> &middot; ` +
            `behalten: <strong>${behalten.length}</strong> (umbenannt: ${geaendert.length}, ` +
            `mit Unterscheidungszusatz: ${unterschieden.length}) &middot; ` +
            `entfernt: <strong>${entfernt.length}</strong> (${ergebnis.entfernteZeilen} Zeilen)</p>` +
            `<p>Erkannte Kodierung: ${erkannteKodierung} (GPU002 im ZIP als UTF-8, GPU001 unverändert)</p>`;

        unterschieden.sort((a, b) => a[1].neu.localeCompare(b[1].neu, 'de'));
        normal.sort((a, b) => a[1].neu.localeCompare(b[1].neu, 'de'));
        entfernt.sort((a, b) => a[0].localeCompare(b[0], 'de'));

        mappingBody.innerHTML = '';
        for (const [alt, e] of [...unterschieden, ...normal, ...entfernt]) {
            const tr = document.createElement('tr');
            if (e.entfernt) tr.className = 'entfernt';
            else if (e.unterschieden) tr.className = 'unterschieden';
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
        if (!ergebnis || !gpu001Bytes) return;
        const zip = erzeugeZip([
            { name: 'GPU001.TXT', daten: gpu001Bytes },
            { name: 'GPU002.TXT', daten: new TextEncoder().encode(ergebnis.inhalt) },
        ]);
        const blob = new Blob([zip], { type: 'application/zip' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'untis_iserv_import.zip';
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
        parseGPU001, zeitAngabe, erzeugeZip, crc32,
    };
}
