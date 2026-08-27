// Unter Node.js (Tests) die gemeinsamen Bausteine nachladen –
// im Browser stellt assets/toolhub-kurse.js sie global bereit.
if (typeof require !== 'undefined' && typeof toolhubNormalisiereFach === 'undefined') {
    Object.assign(globalThis, require('../../assets/toolhub-kurse.js'));
}

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
//    fachkuerzel.csv (aus assets/) vereinheitlicht.
//  - kursPraefix: den Kursbezeichnungen wird "Kurs " vorangestellt.
//  - bereitschaftKlasse: in GPU001 erhalten Bereitschaftsstunden (Fach "BER") dieselbe
//    Kennung als Klasse, sonst zeigt IServ sie mangels Klasse nicht an.

const FELD_UNR = 0;
const FELD_KLASSE = 4;
const FELD_LEHRER = 5;
const FELD_FACH = 6;
const FELD_SCHUELERGRUPPE = 41;

// GPU001: eine Zeile pro Unterrichtsnummer, Kopplungszeile (Lehrer/Fach) und Einzelstunde.
const GPU001_UNR = 0;
const GPU001_KLASSE = 1;
const GPU001_LEHRER = 2;
const GPU001_FACH = 3;
const GPU001_TAG = 5;
const GPU001_STUNDE = 6;

const OBERSTUFEN_KLASSEN = new Set(['11', '12']);
const WOCHENTAGE = [null, 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Fach der Bereitschaftsstunden. Sie stehen in Untis ohne Klasse; IServ zeigt Stunden
// ohne Klasse aber nicht an, deshalb kann dieselbe Kennung als künstliche Klasse dienen.
const BEREITSCHAFT = 'BER';

// Vorangestellte Kennzeichnung der Kursbezeichnungen, damit Kurse in IServ auf einen
// Blick von Klassen zu unterscheiden sind.
const KURS_PRAEFIX = 'Kurs ';

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

// Trägt bei Bereitschaftsstunden (Fach "BER") dieselbe Kennung als Klasse ein.
// Untis lässt die Klasse dort leer; IServ zeigt Stunden ohne Klasse jedoch nicht an.
function transformiereGPU001(text, optionen = {}) {
    const { bereitschaftKlasse = false } = optionen;
    if (!bereitschaftKlasse) return { inhalt: text, geaenderteZeilen: 0 };

    const zeilenumbruch = text.includes('\r\n') ? '\r\n' : '\n';
    let geaenderteZeilen = 0;
    const ausgabe = text.split(/\r?\n/).map((line) => {
        if (line.trim() === '') return line;
        const raw = splitRaw(line);
        if (raw.length <= GPU001_FACH) return line;
        if (unquote(raw[GPU001_FACH]).toUpperCase() !== BEREITSCHAFT) return line;
        raw[GPU001_KLASSE] = quote(BEREITSCHAFT);
        geaenderteZeilen++;
        return raw.join(',');
    });

    return { inhalt: ausgabe.join(zeilenumbruch), geaenderteZeilen };
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
        return p.jahrgang !== null ? toolhubPadJahrgang(p.jahrgang) + p.suffix : eindeutig[0];
    }
    const min = Math.min(...jahrgaenge);
    const max = Math.max(...jahrgaenge);
    // Mehrere Klassen: Jahrgang (z. B. "08") oder Jahrgangsspanne (z. B. "08-10").
    return min === max ? toolhubPadJahrgang(min) : toolhubPadJahrgang(min) + '-' + toolhubPadJahrgang(max);
}

// Baut aus allen Zeilen eines Kurses den Basis-Namen (ohne Unterscheidungszusatz).
function basisName(zeilen, fachMap) {
    const klassen = zeilen.map((z) => z.klasse);
    let faecher = [...new Set(zeilen.map((z) => z.fach).filter((f) => f !== ''))];
    if (fachMap) {
        faecher = [...new Set(faecher.map((f) => toolhubNormalisiereFach(f, fachMap)))];
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

// Sucht Schülergruppen, die vermutlich versehentlich mehrfach vergeben wurden.
//
// Die Schülergruppe benennt in Untis die Menge der teilnehmenden Schülerinnen und Schüler.
// Stehen unter demselben Namen mehrere Unterrichte, deren Lehrkräfte sich nicht überschneiden,
// können das nicht dieselben Personen sein – beim Anlegen wurde der Name dann von einem anderen
// Kurs übernommen. Das Tool fasst solche Kurse weiterhin zusammen (die Datei ist maßgeblich),
// meldet sie aber, damit der Fehler in Untis behoben werden kann.
//
// Ausgenommen sind Kurse genau einer Klasse: dort steht die Lerngruppe durch die Klasse fest,
// mehrere Lehrkräfte zu verschiedenen Zeiten sind also normal (z. B. geteilter Fachunterricht).
function findeNamenskonflikt(zeilenGruppe, gpu001Map) {
    if (istEinKlassenKurs(zeilenGruppe)) return null;

    const proUnterricht = new Map(); // U-Nr -> Menge der Lehrkräfte
    for (const z of zeilenGruppe) {
        if (!proUnterricht.has(z.unr)) proUnterricht.set(z.unr, new Set());
        if (z.lehrer !== '' && z.lehrer !== '?') proUnterricht.get(z.unr).add(z.lehrer);
    }
    if (proUnterricht.size < 2) return null;

    // Ein Kurs, der mehrmals pro Woche stattfindet, steht ebenfalls auf mehreren Unterrichten –
    // dort unterrichtet aber jeweils dieselbe Person. Erst gänzlich getrennte Lehrkräfte
    // (kein gemeinsamer Name) belegen, dass es verschiedene Kurse sein müssen.
    const mengen = [...proUnterricht.values()];
    const getrennt = mengen.some((a, i) => mengen.slice(i + 1).some(
        (b) => a.size > 0 && b.size > 0 && [...a].every((lehrer) => !b.has(lehrer))));
    if (!getrennt) return null;

    const unterrichte = [...proUnterricht.entries()]
        .map(([unr, lehrer]) => ({
            unr,
            lehrer: [...lehrer].sort((a, b) => a.localeCompare(b, 'de')),
            zeit: gpu001Map ? zeitAngabe(zeilenGruppe.filter((z) => z.unr === unr), gpu001Map) : '',
        }))
        .sort((a, b) => Number(a.unr) - Number(b.unr));
    return { unterrichte };
}

// Sucht Unterrichte, die mehrere Klassen umfassen, aber keine Schülergruppe tragen.
//
// Ohne Schülergruppe kann IServ nicht erkennen, dass die Kopplungszeilen eine gemeinsame
// Lerngruppe bilden: Der Unterricht erscheint dann in jeder beteiligten Klasse einzeln statt
// als ein Kurs. Richtig ist das nur, wenn wirklich alle Schülerinnen und Schüler dieser
// Klassen teilnehmen; bei Wahl- und Förderkursen (Orchester, Band, Förderunterricht) fehlt
// die Schülergruppe dagegen versehentlich.
//
// Zusammengefasst wird je Unterricht und Fach: Steht dieselbe Stunde mit einer noch nicht
// besetzten Lehrkraft ("?") ein zweites Mal in der Kopplung, ist das derselbe Kurs.
function findeFehlendeGruppen(parsed, gpu001Map) {
    const proUnterricht = new Map(); // "U-Nr|Fach" -> Angaben des Kurses
    for (const p of parsed) {
        if (!p || p.gruppe !== '' || p.klasse === '') continue;
        const schluessel = p.unr + '|' + p.fach;
        if (!proUnterricht.has(schluessel)) {
            proUnterricht.set(schluessel, {
                unr: p.unr, fach: p.fach, klassen: new Set(), lehrer: new Set(), zeilen: [],
            });
        }
        const eintrag = proUnterricht.get(schluessel);
        eintrag.klassen.add(p.klasse);
        if (p.lehrer !== '' && p.lehrer !== '?') eintrag.lehrer.add(p.lehrer);
        eintrag.zeilen.push(p);
    }

    return [...proUnterricht.values()]
        .filter((e) => e.klassen.size > 1)
        .map((e) => ({
            unr: e.unr,
            fach: e.fach,
            lehrer: [...e.lehrer].sort((a, b) => a.localeCompare(b, 'de')),
            klassen: [...e.klassen].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })),
            zeit: gpu001Map ? zeitAngabe(e.zeilen, gpu001Map) : '',
        }))
        // Je mehr Klassen betroffen sind, desto eindeutiger der Fehler – diese zuerst.
        .sort((a, b) => b.klassen.length - a.klassen.length || Number(a.unr) - Number(b.unr));
}

// Kernfunktion: berechnet Umbenennung/Filterung und gibt Datei-Inhalt + Mapping zurück.
function normalisiereGPU002(text, optionen = {}) {
    const {
        nurKlassenuebergreifend = false,
        fachNormalisieren = false,
        kursPraefix = false,
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
    const mapping = new Map(); // alte Bezeichnung -> { neu, unterschieden, entfernt, konflikt }
    const basisZuAlt = new Map(); // Basis-Name -> alte Bezeichnungen
    const namenskonflikte = [];
    for (const [alt, zeilenGruppe] of gruppen) {
        if (nurKlassenuebergreifend && istEinKlassenKurs(zeilenGruppe)) {
            mapping.set(alt, { neu: null, unterschieden: false, entfernt: true, konflikt: null });
            continue;
        }
        const konflikt = findeNamenskonflikt(zeilenGruppe, gpu001Map);
        if (konflikt) {
            konflikt.gruppe = alt;
            namenskonflikte.push(konflikt);
        }
        // Der Präfix gehört zum Basis-Namen, damit Zeitangabe und laufende Nummer
        // dahinter stehen ("Kurs 11-12 Lat Se (Di 1.+2.)").
        const basis = (kursPraefix ? KURS_PRAEFIX : '') + basisName(zeilenGruppe, fachNormalisieren ? fachMap : null);
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
            mapping.set(alt, {
                neu,
                unterschieden: alte.length > 1,
                entfernt: false,
                konflikt: namenskonflikte.find((k) => k.gruppe === alt) ?? null,
            });
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

    namenskonflikte.sort((a, b) => a.gruppe.localeCompare(b.gruppe, 'de'));

    return {
        inhalt: ausgabe.join(zeilenumbruch),
        mapping,
        namenskonflikte,
        fehlendeGruppen: findeFehlendeGruppen(parsed, gpu001Map),
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
    

    let gpu002Text = null;
    let gpu001Text = null;
    let gpu001Bytes = null; // Original für das ZIP-Archiv
    let ergebnis = null;
    let gpu001Ergebnis = null;
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
    const konfliktDiv = document.getElementById('konflikte');
    const mappingBody = document.getElementById('mappingBody');
    const optKlassenuebergreifend = document.getElementById('optKlassenuebergreifend');
    const optFachNormalisieren = document.getElementById('optFachNormalisieren');
    const optKursPraefix = document.getElementById('optKursPraefix');
    const optBereitschaft = document.getElementById('optBereitschaft');
    const fachCsvFallback = document.getElementById('fachCsvFallback');
    const fachCsvInput = document.getElementById('fachCsvInput');

    // Fachkürzel-Tabelle aus assets/ laden. Schlägt das fehl (z. B. beim Öffnen
    // der Seite über file://), kann die Datei manuell ausgewählt werden.
    toolhubLadeFachkuerzel()
        .then((map) => {
            fachMap = map;
            aktualisiere();
        })
        .catch(() => {
            fachCsvFallback.style.display = 'block';
            aktualisiere();
        });

    fachCsvInput.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) return;
        fachMap = toolhubParseFachkuerzelCsv(await toolhubReadText(e.target.files[0]));
        fachCsvFallback.style.display = 'none';
        aktualisiere();
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
    optKursPraefix.addEventListener('change', aktualisiere);
    optBereitschaft.addEventListener('change', aktualisiere);

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

    async function handleFiles(files) {
        errorDiv.textContent = '';
        for (const file of files) {
            // Untis exportiert je nach System UTF-8 oder Windows-1252 – toolhubDecode erkennt beides
            const buffer = await toolhubReadArrayBuffer(file);
            const { text, encoding } = toolhubDecode(buffer);
            const typ = erkenneDatei(file.name, text);
            if (typ === 'GPU002') {
                gpu002Text = text;
                erkannteKodierung = encoding;
            } else if (typ === 'GPU001') {
                gpu001Text = text;
                gpu001Bytes = new Uint8Array(buffer);
            } else {
                errorDiv.textContent = `"${file.name}" wurde nicht als GPU001 oder GPU002 erkannt.`;
            }
            aktualisiere();
        }
    }

    function aktualisiere() {
        // Icons aus TOOLHUB_ICONS: Haken für geladen, Kreuz für fehlend
        const stand = (geladen) => geladen
            ? `${toolhubIcon('haken', 'inline-icon geladen')} geladen`
            : `${toolhubIcon('kreuz', 'inline-icon fehlt')} fehlt`;
        fileStatus.innerHTML =
            `GPU001.TXT: <strong>${stand(gpu001Text)}</strong> &middot; ` +
            `GPU002.TXT: <strong>${stand(gpu002Text)}</strong>`;
        downloadBtn.disabled = !(gpu001Text && gpu002Text);

        if (gpu002Text === null) return;
        errorDiv.textContent = '';
        warnDiv.textContent = '';
        try {
            const hinweise = [];
            if (optFachNormalisieren.checked && !fachMap) {
                hinweise.push('fachkuerzel.csv ist nicht geladen — die Fachkürzel bleiben unverändert.');
            }
            if (gpu001Text === null) {
                hinweise.push('GPU001.TXT fehlt — Kurse mit gleichem Namen werden vorerst nummeriert statt ' +
                    'über ihre Unterrichtszeiten unterschieden, und der ZIP-Download ist noch nicht möglich.');
            }
            warnDiv.textContent = hinweise.join(' ');
            gpu001Ergebnis = gpu001Text !== null
                ? transformiereGPU001(gpu001Text, { bereitschaftKlasse: optBereitschaft.checked })
                : null;
            ergebnis = normalisiereGPU002(gpu002Text, {
                nurKlassenuebergreifend: optKlassenuebergreifend.checked,
                fachNormalisieren: optFachNormalisieren.checked,
                kursPraefix: optKursPraefix.checked,
                fachMap,
                gpu001Map: gpu001Text !== null ? parseGPU001(gpu001Text) : null,
            });
            zeigeErgebnis();
        } catch (err) {
            errorDiv.textContent = 'Fehler beim Verarbeiten der Datei: ' + err.message;
        }
    }

    // Meldet Auffälligkeiten der Quelldaten. Beide Fälle sind Eingabefehler in Untis und
    // dort zu beheben – das Tool kann sie nur benennen, nicht auflösen.
    function zeigeKonflikte() {
        const konflikte = ergebnis.namenskonflikte;
        const fehlende = ergebnis.fehlendeGruppen;
        if (konflikte.length === 0 && fehlende.length === 0) {
            konfliktDiv.innerHTML = '';
            return;
        }

        let html = '';

        // Fall 1: derselbe Name auf mehreren Kursen – sie werden zusammengefasst.
        if (konflikte.length > 0) {
            const liste = konflikte.map((k) => {
                const unterrichte = k.unterrichte.map((u) => {
                    const lehrer = u.lehrer.join(', ') || 'ohne Lehrkraft';
                    const zeit = u.zeit === '' ? 'nicht verplant' : u.zeit;
                    return `<span class="unterricht">Unterricht ${toolhubEscapeHtml(u.unr)}: ` +
                        `${toolhubEscapeHtml(lehrer)} (${toolhubEscapeHtml(zeit)})</span>`;
                }).join('');
                return `<li><span class="gruppe">${toolhubEscapeHtml(k.gruppe)}</span> ` +
                    `&rarr; ${toolhubEscapeHtml(ergebnis.mapping.get(k.gruppe).neu)}${unterrichte}</li>`;
            }).join('');

            html +=
                `<p>${toolhubIcon('warnung', 'msg-icon')}<strong>${konflikte.length} ` +
                `${konflikte.length === 1 ? 'Schülergruppe ist' : 'Schülergruppen sind'} mehrfach vergeben.</strong> ` +
                'Die folgenden Unterrichte tragen jeweils denselben Namen, werden aber von ganz ' +
                'unterschiedlichen Lehrkräften gehalten &ndash; dieselben Schülerinnen und Schüler ' +
                'können das nicht sein. Vermutlich wurde die Schülergruppe beim Anlegen in Untis von ' +
                'einem anderen Kurs übernommen. Sie werden hier zu je einem Kurs zusammengefasst; ' +
                'zum Trennen muss die Schülergruppe in Untis korrigiert werden.</p>' +
                `<ul>${liste}</ul>`;
        }

        // Fall 2: klassenübergreifender Unterricht ohne Namen – er zerfällt in Einzelklassen.
        if (fehlende.length > 0) {
            const liste = fehlende.map((f) => {
                const lehrer = f.lehrer.join(', ') || 'ohne Lehrkraft';
                const zeit = f.zeit === '' ? 'nicht verplant' : f.zeit;
                return `<li><span class="gruppe">${toolhubEscapeHtml(f.fach)}</span> ` +
                    `bei ${toolhubEscapeHtml(lehrer)} ` +
                    `<span class="unterricht">Unterricht ${toolhubEscapeHtml(f.unr)} (${toolhubEscapeHtml(zeit)}) ` +
                    `&ndash; ${f.klassen.length} Klassen: ${toolhubEscapeHtml(f.klassen.join(', '))}</span></li>`;
            }).join('');

            html +=
                `<p>${toolhubIcon('warnung', 'msg-icon')}<strong>${fehlende.length} ` +
                `klassenübergreifende${fehlende.length === 1 ? 'r Unterricht hat' : ' Unterrichte haben'} ` +
                'keine Schülergruppe.</strong> ' +
                'IServ kann dann nicht erkennen, dass es sich um eine gemeinsame Lerngruppe handelt: ' +
                'Der Unterricht erscheint in <em>jeder</em> beteiligten Klasse einzeln statt als ein Kurs. ' +
                'Richtig ist das nur, wenn tatsächlich alle Schülerinnen und Schüler dieser Klassen ' +
                'teilnehmen &ndash; bei Wahl- und Förderkursen muss in Untis eine Schülergruppe ' +
                'eingetragen werden.</p>' +
                `<ul>${liste}</ul>`;
        }

        konfliktDiv.innerHTML = html;
    }

    function zeigeErgebnis() {
        const eintraege = [...ergebnis.mapping.entries()];
        const behalten = eintraege.filter(([, e]) => !e.entfernt);
        const entfernt = eintraege.filter(([, e]) => e.entfernt);
        const geaendert = behalten.filter(([alt, e]) => alt !== e.neu);
        // Reihenfolge der Vorschau: erst die Konflikte, dann die per Zeitangabe
        // unterschiedenen Kurse, dann der Rest, zuletzt die entfernten.
        const konflikt = behalten.filter(([, e]) => e.konflikt);
        const unterschieden = behalten.filter(([, e]) => e.unterschieden && !e.konflikt);
        const normal = behalten.filter(([, e]) => !e.unterschieden && !e.konflikt);

        statsDiv.innerHTML =
            `<p>Datenzeilen: <strong>${ergebnis.anzahlZeilen}</strong> ` +
            `(davon ${ergebnis.anzahlOhneGruppe} ohne Kursbezeichnung, bleiben unverändert)</p>` +
            `<p>Kurse: <strong>${eintraege.length}</strong> &middot; ` +
            `behalten: <strong>${behalten.length}</strong> (umbenannt: ${geaendert.length}, ` +
            `mit Unterscheidungszusatz: ${behalten.filter(([, e]) => e.unterschieden).length}) &middot; ` +
            `entfernt: <strong>${entfernt.length}</strong> (${ergebnis.entfernteZeilen} Zeilen)</p>` +
            (gpu001Ergebnis && gpu001Ergebnis.geaenderteZeilen > 0
                ? `<p>GPU001: <strong>${gpu001Ergebnis.geaenderteZeilen}</strong> Bereitschaftsstunden ` +
                  `der Klasse <code>${BEREITSCHAFT}</code> zugeordnet</p>`
                : '') +
            `<p>Erkannte Kodierung: ${erkannteKodierung} (Ausgabe im ZIP als UTF-8)</p>`;

        zeigeKonflikte();

        konflikt.sort((a, b) => a[1].neu.localeCompare(b[1].neu, 'de'));
        unterschieden.sort((a, b) => a[1].neu.localeCompare(b[1].neu, 'de'));
        normal.sort((a, b) => a[1].neu.localeCompare(b[1].neu, 'de'));
        entfernt.sort((a, b) => a[0].localeCompare(b[0], 'de'));

        mappingBody.innerHTML = '';
        for (const [alt, e] of [...konflikt, ...unterschieden, ...normal, ...entfernt]) {
            const tr = document.createElement('tr');
            if (e.entfernt) tr.className = 'entfernt';
            else if (e.konflikt) tr.className = 'konflikt';
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
        // Unveränderte GPU001 unangetastet durchreichen, nur bei Bedarf neu kodieren.
        const gpu001Daten = gpu001Ergebnis && gpu001Ergebnis.geaenderteZeilen > 0
            ? new TextEncoder().encode(gpu001Ergebnis.inhalt)
            : gpu001Bytes;
        const zip = erzeugeZip([
            { name: 'GPU001.TXT', daten: gpu001Daten },
            { name: 'GPU002.TXT', daten: new TextEncoder().encode(ergebnis.inhalt) },
        ]);
        toolhubDownload(new Blob([zip], { type: 'application/zip' }), 'untis_iserv_import.zip');
    });
}

// Export für Tests unter Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        normalisiereGPU002, klassenTeil, basisName, splitRaw, unquote,
        parseFachKuerzelCSV: toolhubParseFachkuerzelCsv,
        normalisiereFach: toolhubNormalisiereFach,
        istEinKlassenKurs, findeNamenskonflikt, findeFehlendeGruppen,
        parseGPU001, transformiereGPU001, zeitAngabe, erzeugeZip, crc32,
    };
}
