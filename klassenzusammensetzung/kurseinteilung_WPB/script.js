/* =========================================================================
   Vornamen → Geschlecht  (lokales Wörterbuch + Heuristik, keine Online-API)
   ========================================================================= */
const MALE_NAMES = `Lukas Jonas Felix Maximilian Paul Leon Finn Elias Noah Ben Luis Henri Henry Moritz David
Jakob Jacob Anton Emil Theo Theodor Oskar Oscar Julian Tim Niklas Nikolas Philipp Philip Jan Samuel Erik Erich
Matteo Adrian Fabian Linus Tom Tobias Simon Jonathan Daniel Michael Sebastian Alexander Aaron Hannes Mats Mattis
Carl Karl Konstantin Constantin Vincent Valentin Benedikt Benjamin Jannik Joel Levi Leo Liam Milan Nico Nick Marlon
Lennard Lennart Bennet Bennett Frederik Friedrich Florian Marius Johann Johannes Georg Gustav Wilhelm Heinrich Ludwig
Otto Bruno Til Till Bastian Christian Stefan Stephan Thomas Andreas Martin Peter Klaus Hans Robert Richard Raphael
Rafael Gabriel Damian Dominik Marvin Kevin Justin Colin Collin Ole Jasper Casper Kasimir Korbinian Quirin Xaver Sven
Lars Malte Arne Bjarne Hauke Thaddäus Maximus Maxim Maxi Maximilian Ferdinand Friedemann Lorenz Mathis Mathias Matthias`
    .split(/\s+/).filter(Boolean);

const FEMALE_NAMES = `Anna Mia Emma Hannah Hanna Lena Lea Leah Marie Sophia Sofia Lara Clara Klara Johanna Charlotte Emilia
Lina Mathilda Mathilde Frieda Frida Greta Ida Paula Nele Neele Luisa Louisa Sophie Sofie Amelie Nora Pauline Helena
Maja Maya Carla Karla Romy Ella Marlene Lilly Lilli Lily Mila Lia Stella Theresa Therese Teresa Elisa Elisabeth Magdalena
Franziska Katharina Catharina Julia Juliana Laura Sarah Sara Vanessa Jana Nina Lisa Melina Selina Celina Alina Annika
Antonia Valentina Viktoria Victoria Carlotta Josephine Josefine Henriette Friederike Wilhelmina Mathea Thea Tabea Rosa
Rosalie Fiona Zoe Zoé Isabel Isabella Isabelle Annabell Annabelle Leonie Leoni Melissa Hanne Merle Smilla Lotta Linnea
Liv Ronja Mara Marit Maila Mailin Cosima Eleni Helene Eva Anni Anne Christina Christine Sabine Susanne Petra Andrea Maria
Amalia Amelia Emely Emily Marlene Martha Marta Hedi Hedwig Else Elke Birte Femke Imke Wiebke Svea Solveig`
    .split(/\s+/).filter(Boolean);

// Bewusst mehrdeutige Vornamen → Nutzer muss entscheiden
const AMBIGUOUS_NAMES = `Luca Luka Kim Toni Tony Sascha Sasha Alex Eike Noa Sam Robin Maxime Nikita`
    .split(/\s+/).filter(Boolean);

const NAME_DICT = (() => {
    const d = new Map();
    MALE_NAMES.forEach(n => d.set(n.toLowerCase(), 'm'));
    FEMALE_NAMES.forEach(n => d.set(n.toLowerCase(), 'w'));
    AMBIGUOUS_NAMES.forEach(n => d.set(n.toLowerCase(), 'ambig'));
    return d;
})();

const LS_KEY = 'wpb_gender_overrides';
function loadOverrides() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function saveOverride(name, g) {
    const o = loadOverrides(); o[name.toLowerCase()] = g;
    try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch {}
}

// Liefert { g:'m'|'w'|null, conf:'sicher'|'unsicher'|'mehrdeutig' }
function guessGender(vorname) {
    const raw = (vorname || '').trim();
    if (!raw) return { g: null, conf: 'mehrdeutig' };
    // gemerkte manuelle Korrektur hat Vorrang
    const ov = loadOverrides()[raw.toLowerCase()];
    if (ov === 'm' || ov === 'w') return { g: ov, conf: 'sicher' };
    // Doppelnamen: ersten Bestandteil verwenden
    const first = raw.split(/[\s\-]+/)[0].toLowerCase();
    const hit = NAME_DICT.get(first) || NAME_DICT.get(raw.toLowerCase());
    if (hit === 'm') return { g: 'm', conf: 'sicher' };
    if (hit === 'w') return { g: 'w', conf: 'sicher' };
    if (hit === 'ambig') return { g: null, conf: 'mehrdeutig' };
    // Heuristik für Unbekannte (markiert als unsicher)
    if (/(a|e|ine|ina|ie)$/.test(first)) return { g: 'w', conf: 'unsicher' };
    return { g: 'm', conf: 'unsicher' };
}

/* =========================================================================
   CSV einlesen (Trennzeichen und Kodierung erkennt toolhub-io.js)
   ========================================================================= */
function parseCSV(text) {
    const { rows, fields } = toolhubParseCsv(text);
    if (!rows.length) throw new Error('Die Datei ist leer.');

    const required = ['Vorname', 'Nachname', 'Zusätzliche Informationen', 'Option'];
    const missing = required.filter(c => !fields.includes(c));
    if (missing.length) {
        throw new Error('Fehlende Spalten: ' + missing.join(', ') +
            '. Gefundene Spalten: ' + fields.join(', '));
    }
    return rows;
}

/* =========================================================================
   Zustand
   ========================================================================= */
const state = {
    students: [],     // {id, vorname, nachname, klasse, option, geschlecht:'m'|'w'|null, conf}
    subjects: [],     // distinct Optionen
    classes: [],      // distinct Klassen, sortiert
    config: {
        criteria: { gender: 'soft', size: 'soft', minN: 'soft', maxN: 'soft', classEven: 'soft' },
        minN: 2,
        maxN: 4,
        sizeTol: 1,
        perSubject: {}  // option -> { nCourses, bands: { klasse: [bool,...] } }
    },
    results: {}       // option -> { nCourses, assign: Map id->courseIdx, params }
};

const MODE_LABELS = { hard: 'Hart', soft: 'Ziel', off: 'Aus' };

/* =========================================================================
   Einteilungs-Algorithmus (pro Fach) — reine Funktionen
   ========================================================================= */
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function makeCourses(n) { const a = []; for (let i = 0; i < n; i++) a.push({ size: 0, m: 0, w: 0, cls: new Map() }); return a; }
function addStu(c, s) { c.size++; c[s.g]++; let e = c.cls.get(s.k); if (!e) { e = { m: 0, w: 0 }; c.cls.set(s.k, e); } e[s.g]++; }
function remStu(c, s) { c.size--; c[s.g]--; let e = c.cls.get(s.k); e[s.g]--; }

// Kosten einer Verteilung. Liefert {hard, soft, total} + Detailverletzungen.
function costOf(courses, ctx) {
    const { crit, minN, maxN, ratio, sizeTol, classCourseList } = ctx;
    let hard = 0, soft = 0;
    const detail = { size: 0, gender: 0, minN: 0, maxN: 0, classEven: 0 };

    // Gleiche Kursgrößen
    if (crit.size !== 'off') {
        const sizes = courses.map(c => c.size);
        const max = Math.max(...sizes), min = Math.min(...sizes);
        if (crit.size === 'hard') {
            if (max - min > sizeTol) { hard += (max - min - sizeTol); detail.size += (max - min - sizeTol); }
        } else {
            const mean = sizes.reduce((a, b) => a + b, 0) / courses.length;
            soft += sizes.reduce((a, b) => a + (b - mean) ** 2, 0) * 1.0;
        }
    }
    // Geschlechter-Gleichgewicht
    if (crit.gender !== 'off') {
        let pen = 0, viol = 0;
        for (const c of courses) {
            if (c.size > 0) {
                const r = c.m / c.size;
                pen += ((r - ratio) ** 2) * c.size;
                if (c.size >= 3 && Math.abs(r - ratio) > 0.2) viol++;
            }
        }
        if (crit.gender === 'hard') { hard += viol; detail.gender += viol; }
        else soft += pen * 6.0;
    }
    // Mind. N je Klasse & Geschlecht (nur für tatsächlich vertretene Klassen)
    if (crit.minN !== 'off') {
        let pen = 0;
        for (const c of courses) {
            for (const [, e] of c.cls) {
                for (const g of ['m', 'w']) {
                    if (e[g] > 0 && e[g] < minN) pen += (minN - e[g]);
                }
            }
        }
        if (crit.minN === 'hard') { hard += pen; detail.minN += pen; }
        else soft += pen * 4.0;
    }
    // Höchstens N je Klasse & Geschlecht (Obergrenze pro Kurs)
    if (crit.maxN !== 'off') {
        let pen = 0;
        for (const c of courses) {
            for (const [, e] of c.cls) {
                for (const g of ['m', 'w']) {
                    if (e[g] > maxN) pen += (e[g] - maxN);
                }
            }
        }
        if (crit.maxN === 'hard') { hard += pen; detail.maxN += pen; }
        else soft += pen * 4.0;
    }
    // Klassen gleichmäßig über ihre erlaubten Kurse
    if (crit.classEven !== 'off') {
        let pen = 0, viol = 0;
        for (const { k, allowed } of classCourseList) {
            const counts = allowed.map(ci => { const e = courses[ci].cls.get(k); return e ? e.m + e.w : 0; });
            const max = Math.max(...counts), min = Math.min(...counts);
            const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
            pen += counts.reduce((a, b) => a + (b - mean) ** 2, 0);
            if (max - min > 1) viol += (max - min - 1);
        }
        if (crit.classEven === 'hard') { hard += viol; detail.classEven += viol; }
        else soft += pen * 1.0;
    }
    return { hard, soft, total: hard * 1e6 + soft, detail };
}

function allowedCoursesFor(klasse, nCourses, allowedByClass) {
    const a = allowedByClass.get(klasse);
    return (a && a.length) ? a : Array.from({ length: nCourses }, (_, i) => i);
}

// Greedy-Start: zufällige Reihenfolge, jeder Schüler in den aktuell günstigsten erlaubten Kurs
function greedyStart(students, nCourses, allowedFor, ctx, rnd) {
    const courses = makeCourses(nCourses);
    const assign = new Map();
    const order = students.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0;[order[i], order[j]] = [order[j], order[i]]; }
    for (const s of order) {
        const allowed = allowedFor(s);
        let bestC = allowed[0], bestCost = Infinity;
        for (const ci of allowed) {
            addStu(courses[ci], s);
            const c = costOf(courses, ctx).total;
            remStu(courses[ci], s);
            if (c < bestCost || (c === bestCost && rnd() < 0.5)) { bestCost = c; bestC = ci; }
        }
        addStu(courses[bestC], s); assign.set(s.id, bestC);
    }
    return { courses, assign };
}

// Simulated Annealing mit ZWEI Zugtypen:
//  - Verschieben: ein Schüler wechselt den Kurs (ändert Kursgrößen)
//  - Tauschen:    zwei Schüler aus verschiedenen Kursen tauschen (Kursgrößen bleiben gleich)
// Swaps sind der Schlüssel gegen Sackgassen: z.B. Geschlecht ausgleichen, OHNE die Größe zu
// verschlechtern – mit reinen Verschiebungen blockieren sich solche Verbesserungen oft gegenseitig.
function anneal(students, courses, assign, ctx, allowedFor, rnd) {
    const n = students.length;
    let curCost = costOf(courses, ctx).total;
    let best = { assign: new Map(assign), cost: curCost };
    const iters = Math.min(40000, Math.max(4000, n * 500));
    let T = Math.max(1, curCost / Math.max(1, n)) + 8;
    const cooling = Math.pow(0.02 / T, 1 / iters);
    for (let i = 0; i < iters; i++) {
        let revert = null;
        if (rnd() < 0.5) {
            // Verschieben
            const s = students[(rnd() * n) | 0];
            const allowed = allowedFor(s);
            if (allowed.length > 1) {
                const from = assign.get(s.id);
                const to = allowed[(rnd() * allowed.length) | 0];
                if (to !== from) {
                    remStu(courses[from], s); addStu(courses[to], s); assign.set(s.id, to);
                    revert = () => { remStu(courses[to], s); addStu(courses[from], s); assign.set(s.id, from); };
                }
            }
        } else {
            // Tauschen (jeder muss im Kurs des anderen erlaubt sein)
            const a = students[(rnd() * n) | 0];
            const b = students[(rnd() * n) | 0];
            const ca = assign.get(a.id), cb = assign.get(b.id);
            if (ca !== cb && allowedFor(a).includes(cb) && allowedFor(b).includes(ca)) {
                remStu(courses[ca], a); remStu(courses[cb], b);
                addStu(courses[cb], a); addStu(courses[ca], b);
                assign.set(a.id, cb); assign.set(b.id, ca);
                revert = () => {
                    remStu(courses[cb], a); remStu(courses[ca], b);
                    addStu(courses[ca], a); addStu(courses[cb], b);
                    assign.set(a.id, ca); assign.set(b.id, cb);
                };
            }
        }
        if (!revert) { T *= cooling; continue; }
        const newCost = costOf(courses, ctx).total;
        const dE = newCost - curCost;
        if (dE <= 0 || rnd() < Math.exp(-dE / Math.max(1e-9, T))) {
            curCost = newCost;
            if (curCost < best.cost) best = { assign: new Map(assign), cost: curCost };
        } else {
            revert();
        }
        T *= cooling;
    }
    // beste gefundene Lösung in courses/assign zurückschreiben
    assign.clear(); for (const [k, v] of best.assign) assign.set(k, v);
    for (const c of courses) { c.size = 0; c.m = 0; c.w = 0; c.cls.clear(); }
    for (const s of students) addStu(courses[assign.get(s.id)], s);
    return best.cost;
}

// students: [{id,k,g}], allowedByClass: Map klasse->[courseIdx]
function assignSubject(students, nCourses, allowedByClass, crit, minN, maxN, sizeTol, seed) {
    const rnd = mulberry32(seed);
    const classes = [...new Set(students.map(s => s.k))];
    // erlaubte Kurse je Klasse einmal auflösen (Bänder) und wiederverwenden
    const resolvedAllowed = new Map(classes.map(k => [k, allowedCoursesFor(k, nCourses, allowedByClass)]));
    const classCourseList = classes.map(k => ({ k, allowed: resolvedAllowed.get(k) }));
    const ratio = students.length ? students.filter(s => s.g === 'm').length / students.length : 0.5;
    const ctx = { crit, minN, maxN, ratio, sizeTol, classCourseList };
    const allowedFor = s => resolvedAllowed.get(s.k);

    if (nCourses <= 1) {
        const assign = new Map(students.map(s => [s.id, 0]));
        const finalCourses = makeCourses(nCourses);
        for (const s of students) addStu(finalCourses[0], s);
        return { assign, courses: finalCourses, ctx, ratio, classCourseList };
    }

    // Mehrere Neustarts (jeweils anderer Greedy-Start + Annealing); beste Lösung gewinnt.
    // Das verhindert, dass ein einzelner unglücklicher Start in einem lokalen Optimum festsitzt.
    const restarts = students.length > 120 ? 5 : 10;
    let best = null;
    for (let rs = 0; rs < restarts; rs++) {
        const { courses, assign } = greedyStart(students, nCourses, allowedFor, ctx, rnd);
        anneal(students, courses, assign, ctx, allowedFor, rnd);
        const cost = costOf(courses, ctx).total;
        if (best === null || cost < best.cost) best = { assign: new Map(assign), cost };
        if (best.cost === 0) break; // perfekte Lösung – früh abbrechen
    }

    const finalCourses = makeCourses(nCourses);
    for (const s of students) addStu(finalCourses[best.assign.get(s.id)], s);
    return { assign: best.assign, courses: finalCourses, ctx, ratio, classCourseList };
}

/* =========================================================================
   Hilfen für UI
   ========================================================================= */
const $ = id => document.getElementById(id);
function roman(n) {
    const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let r = ''; n++; // 0-basiert -> I
    for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
    return r;
}
function showMessage(text, type) { toolhubMessage('message', text, type); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function setStep(active) {
    [['sectionUpload', 'chip1'], ['sectionGender', 'chip2'], ['sectionConfig', 'chip3'], ['sectionResults', 'chip4']]
        .forEach(([sec], i) => { $(sec).classList.toggle('visible', i === active); });
    [1, 2, 3, 4].forEach((n, i) => {
        const chip = $('chip' + n);
        chip.classList.toggle('active', i === active);
        chip.classList.toggle('done', i < active);
    });
}

function studentsOf(option) { return state.students.filter(s => s.option === option); }
function asAlgoStudents(option) {
    return studentsOf(option).map(s => ({ id: s.id, k: s.klasse, g: s.geschlecht }));
}

// Default-Parallelkurse: orientiert an der Klassenzahl, anteilig zur Schülerzahl des Fachs.
// Bsp.: 5 Klassen, 2/5 wählen Kunst, 3/5 Musik -> Kunst 2 Parallelkurse, Musik 3.
function defaultCourseCount(option) {
    const total = state.students.length || 1;
    const numClasses = state.classes.length || 1;
    const inSubject = studentsOf(option).length;
    return Math.max(1, Math.round(numClasses * inSubject / total));
}

/* =========================================================================
   Schritt 1 → Datei laden
   ========================================================================= */
// Gemeinsame Upload-Komponente aus toolhub.js (Klick + Drag-and-drop, Badge mit Entfernen)
const upload = toolhubUpload({
    input: 'fileInput',
    zone: 'uploadBox',
    list: 'fileList',
    extensions: ['.csv'],
    onChange: files => { if (files.length) handleFile(files[0]); },
    onInvalid: () => showMessage('Bitte eine CSV-Datei auswählen.', 'error')
});

async function handleFile(file) {
    if (!file) return;
    try {
        const rows = parseCSV(await toolhubReadText(file));
        ingestRows(rows);
        showMessage('', '');
        buildGenderStep();
        setStep(1);
    } catch (err) { showMessage('Fehler: ' + err.message, 'error'); }
}


function ingestRows(rows) {
    state.students = []; state.results = {}; state.config.perSubject = {};
    let i = 0;
    for (const r of rows) {
        const vorname = r['Vorname'] || '';
        const nachname = r['Nachname'] || '';
        const klasse = (r['Zusätzliche Informationen'] || '').trim() || '—';
        const option = (r['Option'] || '').trim();
        if (!vorname && !nachname) continue;
        if (!option) continue; // ohne Fach keine Einteilung
        const guess = guessGender(vorname);
        state.students.push({
            id: 's' + (i++), vorname, nachname, klasse, option,
            geschlecht: guess.g, conf: guess.conf
        });
    }
    state.subjects = [...new Set(state.students.map(s => s.option))].sort((a, b) => a.localeCompare(b, 'de'));
    state.classes = [...new Set(state.students.map(s => s.klasse))].sort((a, b) => a.localeCompare(b, 'de'));
    if (!state.students.length) throw new Error('Keine verwertbaren Zeilen gefunden (Vorname/Nachname/Option fehlen?).');
}

/* =========================================================================
   Schritt 2 → Geschlecht prüfen
   ========================================================================= */
function buildGenderStep() {
    renderGenderStats();
    renderGenderTable();
    updateGenderGate();
}
function renderGenderStats() {
    const total = state.students.length;
    const males = state.students.filter(s => s.geschlecht === 'm').length;
    const females = state.students.filter(s => s.geschlecht === 'w').length;
    const open = state.students.filter(s => s.geschlecht == null).length;
    const unsure = state.students.filter(s => s.conf === 'unsicher').length;
    $('genderStats').innerHTML = `
        <div class="stat-card"><h3>Schüler</h3><div class="value">${total}</div></div>
        <div class="stat-card"><h3>Fächer</h3><div class="value">${state.subjects.length}</div></div>
        <div class="stat-card"><h3>♂ / ♀</h3><div class="value" style="font-size:22px;">${males} / ${females}</div></div>
        <div class="stat-card"><h3>Unsicher</h3><div class="value" style="color:var(--warn-col);">${unsure}</div></div>
        <div class="stat-card"><h3>Offen</h3><div class="value" style="color:${open ? 'var(--err)' : 'var(--ok)'};">${open}</div></div>`;
}
function renderGenderTable() {
    const onlyUnsure = $('onlyUnsure').checked;
    const tbody = $('genderTable').querySelector('tbody');
    let html = '';
    state.students.forEach(s => {
        const isUnsure = s.conf === 'unsicher';
        const isAmbig = s.geschlecht == null;
        if (onlyUnsure && !isUnsure && !isAmbig) return;
        const rowCls = isAmbig ? 'row-ambig' : (isUnsure ? 'row-unsure' : '');
        const badge = isAmbig ? '<span class="badge ambig">mehrdeutig</span>'
            : (isUnsure ? '<span class="badge unsure">unsicher</span>'
                : '<span class="badge sure">erkannt</span>');
        html += `<tr class="${rowCls}" data-id="${s.id}">
            <td>${esc(s.vorname)} ${esc(s.nachname)}</td>
            <td>${esc(s.klasse)}</td>
            <td>${esc(s.option)}</td>
            <td><select class="g-select" data-id="${s.id}">
                <option value="" ${s.geschlecht == null ? 'selected' : ''}>— bitte wählen —</option>
                <option value="m" ${s.geschlecht === 'm' ? 'selected' : ''}>♂ Junge</option>
                <option value="w" ${s.geschlecht === 'w' ? 'selected' : ''}>♀ Mädchen</option>
            </select></td>
            <td>${badge}</td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="5" class="muted" style="padding:20px;text-align:center;">Keine Einträge in dieser Ansicht.</td></tr>';
    tbody.querySelectorAll('select.g-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const s = state.students.find(x => x.id === sel.dataset.id);
            s.geschlecht = sel.value || null;
            s.conf = sel.value ? 'sicher' : 'mehrdeutig';
            if (sel.value) saveOverride(s.vorname, sel.value);
            renderGenderStats();
            updateGenderGate();
            // Zeilenfarbe anpassen
            const tr = sel.closest('tr');
            tr.classList.remove('row-ambig', 'row-unsure');
            tr.querySelector('td:last-child').innerHTML = sel.value
                ? '<span class="badge sure">bestätigt</span>' : '<span class="badge ambig">mehrdeutig</span>';
        });
    });
}
function updateGenderGate() {
    const open = state.students.filter(s => s.geschlecht == null).length;
    $('btnToConfig').disabled = open > 0;
    $('genderHint').innerHTML = open > 0
        ? `<div class="warn">${open} Schüler ohne eindeutiges Geschlecht. Bitte in der Spalte „Geschlecht" auswählen, dann geht es weiter.</div>`
        : `<div class="success">Alle Schüler haben ein Geschlecht. Du kannst die unsicheren (gelb) noch prüfen oder direkt weitergehen.</div>`;
}
$('onlyUnsure').addEventListener('change', renderGenderTable);
$('btnBackUpload1').addEventListener('click', () => setStep(0));
$('btnToConfig').addEventListener('click', () => { buildConfigStep(); setStep(2); });

/* =========================================================================
   Schritt 3 → Konfiguration
   ========================================================================= */
const CRITERIA = [
    { key: 'gender', label: 'Geschlechter-Gleichgewicht', sub: '♂/♀-Anteil je Kurs ≈ Anteil im Fach' },
    { key: 'size', label: 'Gleiche Kursgrößen', sub: 'Kurse möglichst gleich groß' },
    { key: 'minN', label: 'Mindestens N je Klasse & Geschlecht', sub: 'kein Kind allein als einzige(r) seiner Klasse+Geschlecht im Kurs' },
    { key: 'maxN', label: 'Höchstens N je Klasse & Geschlecht', sub: 'begrenzt, wie viele einer Klasse+Geschlecht in einem Kurs landen' },
    { key: 'classEven', label: 'Klassen gleichmäßig verteilen', sub: 'jede Klasse möglichst gleichmäßig über ihre Kurse' },
];

function buildConfigStep() {
    // Kriterien-Raster
    const cg = $('critGrid');
    cg.innerHTML = '';
    CRITERIA.forEach(c => {
        const left = document.createElement('div');
        left.innerHTML = `<div class="crit-label">${c.label}</div><div class="crit-sub">${c.sub}</div>`;
        const right = document.createElement('div');
        right.className = 'crit-ctrl';
        const sel = document.createElement('select');
        ['hard', 'soft', 'off'].forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = MODE_LABELS[m];
            if (state.config.criteria[c.key] === m) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => { state.config.criteria[c.key] = sel.value; });
        right.appendChild(sel);
        if (c.key === 'minN') {
            const inp = document.createElement('input');
            inp.type = 'number'; inp.min = '1'; inp.max = '6'; inp.value = state.config.minN; inp.style.width = '60px';
            inp.title = 'N (Mindestanzahl)';
            inp.addEventListener('change', () => { state.config.minN = Math.max(1, parseInt(inp.value) || 2); });
            const lab = document.createElement('span'); lab.className = 'crit-sub'; lab.textContent = 'N =';
            right.appendChild(lab); right.appendChild(inp);
        }
        if (c.key === 'maxN') {
            const inp = document.createElement('input');
            inp.type = 'number'; inp.min = '1'; inp.max = '20'; inp.value = state.config.maxN; inp.style.width = '60px';
            inp.title = 'N (Höchstanzahl)';
            inp.addEventListener('change', () => { state.config.maxN = Math.max(1, parseInt(inp.value) || 4); });
            const lab = document.createElement('span'); lab.className = 'crit-sub'; lab.textContent = 'N =';
            right.appendChild(lab); right.appendChild(inp);
        }
        if (c.key === 'size') {
            const inp = document.createElement('input');
            inp.type = 'number'; inp.min = '0'; inp.max = '10'; inp.value = state.config.sizeTol; inp.style.width = '60px';
            inp.title = 'erlaubte Größendifferenz (nur bei „Hart")';
            inp.addEventListener('change', () => { state.config.sizeTol = Math.max(0, parseInt(inp.value) || 0); });
            const lab = document.createElement('span'); lab.className = 'crit-sub'; lab.textContent = '± Toleranz';
            right.appendChild(lab); right.appendChild(inp);
        }
        cg.appendChild(left); cg.appendChild(right);
    });

    // Fächer
    const sc = $('subjectConfigs');
    sc.innerHTML = '';
    state.subjects.forEach(option => {
        const studs = studentsOf(option);
        const classesHere = [...new Set(studs.map(s => s.klasse))].sort((a, b) => a.localeCompare(b, 'de'));
        const males = studs.filter(s => s.geschlecht === 'm').length;
        const females = studs.filter(s => s.geschlecht === 'w').length;
        if (!state.config.perSubject[option]) {
            state.config.perSubject[option] = { nCourses: defaultCourseCount(option), bands: {} };
        }
        const cfg = state.config.perSubject[option];

        const box = document.createElement('div');
        box.className = 'subject-config';
        box.innerHTML = `
            <h3>${esc(option)}</h3>
            <div class="sub-meta">${studs.length} Schüler · ${males} ♂ / ${females} ♀ · Klassen: ${classesHere.map(esc).join(', ')}</div>
            <label style="font-size:14px;">Parallelkurse:
                <input type="number" min="1" max="10" value="${cfg.nCourses}" class="nCourses" style="width:64px;">
            </label>
            <span class="muted" style="margin-left:8px;">≈ ${Math.round(studs.length / cfg.nCourses)} Schüler/Kurs</span>
            <div style="margin-top:10px;">
                <span class="bands-toggle">▸ Klassen→Kurs-Modell (optional)</span>
                <div class="bands-wrap" style="display:none;"></div>
            </div>`;
        sc.appendChild(box);

        const nInput = box.querySelector('.nCourses');
        const bandsWrap = box.querySelector('.bands-wrap');
        const toggle = box.querySelector('.bands-toggle');

        const ensureBands = () => {
            classesHere.forEach(k => {
                if (!cfg.bands[k] || cfg.bands[k].length !== cfg.nCourses) {
                    cfg.bands[k] = Array.from({ length: cfg.nCourses }, () => true);
                }
            });
        };
        const renderBands = () => {
            ensureBands();
            let html = '<table class="matrix"><thead><tr><th>Klasse \\ Kurs</th>';
            for (let i = 0; i < cfg.nCourses; i++) html += `<th>Kurs ${roman(i)}</th>`;
            html += '</tr></thead><tbody>';
            classesHere.forEach(k => {
                html += `<tr><td class="rowhead">${esc(k)}</td>`;
                for (let i = 0; i < cfg.nCourses; i++)
                    html += `<td><input type="checkbox" data-k="${esc(k)}" data-i="${i}" ${cfg.bands[k][i] ? 'checked' : ''}></td>`;
                html += '</tr>';
            });
            html += '</tbody></table><div class="muted" style="margin-top:6px;">Häkchen = diese Klasse darf in diesen Kurs. Standard: überall erlaubt.</div>';
            bandsWrap.innerHTML = html;
            bandsWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
                cb.addEventListener('change', () => { cfg.bands[cb.dataset.k][+cb.dataset.i] = cb.checked; });
            });
        };
        toggle.addEventListener('click', () => {
            const open = bandsWrap.style.display === 'none';
            bandsWrap.style.display = open ? 'block' : 'none';
            toggle.textContent = (open ? '▾' : '▸') + ' Klassen→Kurs-Modell (optional)';
            if (open) renderBands();
        });
        nInput.addEventListener('change', () => {
            cfg.nCourses = Math.max(1, Math.min(10, parseInt(nInput.value) || 1));
            nInput.value = cfg.nCourses;
            box.querySelector('.muted').textContent = `≈ ${Math.round(studs.length / cfg.nCourses)} Schüler/Kurs`;
            cfg.bands = {}; // bei geänderter Kurszahl Modell zurücksetzen
            if (bandsWrap.style.display !== 'none') renderBands();
        });
    });
}
$('btnBackGender').addEventListener('click', () => setStep(1));
$('btnCompute').addEventListener('click', () => { computeAll(); setStep(3); });

/* =========================================================================
   Schritt 4 → Berechnen, Anzeigen, Drag&Drop, Export
   ========================================================================= */
function bandsToAllowed(cfg, classesHere) {
    const m = new Map();
    classesHere.forEach(k => {
        const arr = cfg.bands[k];
        if (arr && arr.length === cfg.nCourses) {
            const allowed = arr.map((v, i) => v ? i : -1).filter(i => i >= 0);
            if (allowed.length) m.set(k, allowed);
        }
    });
    return m;
}

function computeAll(reseed = false) {
    const crit = state.config.criteria, minN = state.config.minN, maxN = state.config.maxN, sizeTol = state.config.sizeTol;
    state.subjects.forEach(option => {
        let cfg = state.config.perSubject[option];
        if (!cfg) { // Fallback, falls ohne Konfig-Schritt aufgerufen
            cfg = state.config.perSubject[option] = { nCourses: defaultCourseCount(option), bands: {} };
        }
        const algoStuds = asAlgoStudents(option);
        const classesHere = [...new Set(algoStuds.map(s => s.k))];
        const allowedByClass = bandsToAllowed(cfg, classesHere);
        const seed = (reseed ? Math.floor(Math.random() * 1e9) : 12345)
            + option.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const res = assignSubject(algoStuds, cfg.nCourses, allowedByClass, crit, minN, maxN, sizeTol, seed);
        state.results[option] = {
            nCourses: cfg.nCourses,
            assign: res.assign,
            params: { crit, minN, maxN, sizeTol, ratio: res.ratio, classCourseList: res.classCourseList, allowedByClass }
        };
    });
    renderResults();
}

function buildCoursesFromAssign(option) {
    const r = state.results[option];
    const courses = makeCourses(r.nCourses);
    studentsOf(option).forEach(s => {
        const ci = r.assign.get(s.id);
        addStu(courses[ci], { k: s.klasse, g: s.geschlecht });
    });
    return courses;
}

function renderResults() {
    // Gesamt-Zusammenfassung
    let totalViol = 0;
    state.subjects.forEach(o => {
        const r = state.results[o];
        const courses = buildCoursesFromAssign(o);
        const cost = costOf(courses, { ...r.params, classCourseList: r.params.classCourseList });
        totalViol += cost.hard;
    });
    $('resultsSummary').innerHTML = totalViol > 0
        ? `<div class="warn">⚠️ ${totalViol} Verletzung(en) harter Regeln verbleiben (rot markiert). Evtl. ist eine Regel mit den aktuellen Zahlen nicht voll erfüllbar – per Drag &amp; Drop nachbessern oder Kriterium lockern.</div>`
        : `<div class="success">✓ Alle als „Hart" gesetzten Regeln sind erfüllt.</div>`;

    const cont = $('resultsContainer');
    cont.innerHTML = '';
    state.subjects.forEach(option => cont.appendChild(renderSubjectBoard(option)));
}

function renderSubjectBoard(option) {
    const r = state.results[option];
    const board = document.createElement('div');
    board.className = 'subject-board';
    board.dataset.option = option;

    const header = document.createElement('h3');
    header.textContent = `${option} — ${r.nCourses} Parallelkurse`;
    board.appendChild(header);

    const warnDiv = document.createElement('div');
    warnDiv.className = 'board-warn';
    board.appendChild(warnDiv);

    const row = document.createElement('div');
    row.className = 'courses-row';
    board.appendChild(row);

    for (let ci = 0; ci < r.nCourses; ci++) {
        const col = document.createElement('div');
        col.className = 'course-col';
        col.dataset.course = ci;
        col.innerHTML = `<div class="course-head"></div><div class="course-body"></div>`;
        // Drop-Ziel
        col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('dragover'); });
        col.addEventListener('dragleave', () => col.classList.remove('dragover'));
        col.addEventListener('drop', e => {
            e.preventDefault(); col.classList.remove('dragover');
            const sid = e.dataTransfer.getData('text/sid');
            const fromOpt = e.dataTransfer.getData('text/opt');
            if (fromOpt !== option) return; // nur innerhalb desselben Fachs verschieben
            r.assign.set(sid, ci);
            refreshSubjectBoard(option);
        });
        row.appendChild(col);
    }
    board.appendChild(row);
    // Inhalte füllen
    setTimeout(() => refreshSubjectBoard(option), 0);
    return board;
}

function refreshSubjectBoard(option) {
    const r = state.results[option];
    const board = document.querySelector(`.subject-board[data-option="${cssEscape(option)}"]`);
    if (!board) return;
    const studs = studentsOf(option);
    const courses = buildCoursesFromAssign(option);
    const cost = costOf(courses, r.params);

    // Warnungen je Fach
    const warnDiv = board.querySelector('.board-warn');
    const msgs = [];
    if (r.params.crit.size === 'hard' && cost.detail.size > 0) msgs.push('Kursgrößen überschreiten die Toleranz');
    if (r.params.crit.gender === 'hard' && cost.detail.gender > 0) msgs.push(`${cost.detail.gender} Kurs(e) mit unausgeglichenem Geschlecht`);
    if (r.params.crit.minN === 'hard' && cost.detail.minN > 0) msgs.push(`Mindest-N je Klasse/Geschlecht ${cost.detail.minN}× verletzt`);
    if (r.params.crit.maxN === 'hard' && cost.detail.maxN > 0) msgs.push(`Höchst-N je Klasse/Geschlecht ${cost.detail.maxN}× verletzt`);
    if (r.params.crit.classEven === 'hard' && cost.detail.classEven > 0) msgs.push('Klassenverteilung ungleichmäßig');
    warnDiv.innerHTML = msgs.length ? `<div class="warn">⚠️ ${msgs.join(' · ')}</div>` : '';

    const cols = board.querySelectorAll('.course-col');
    const ratio = r.params.ratio;
    cols.forEach((col, ci) => {
        const c = courses[ci];
        const clsDist = [...c.cls.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
            .map(([k, e]) => `${esc(k)}: ${e.m + e.w}`).join(' · ') || '—';
        // Hervorhebung bei harter Verletzung in genau diesem Kurs
        let colViol = false;
        if (r.params.crit.minN === 'hard') {
            for (const [, e] of c.cls) for (const g of ['m', 'w']) if (e[g] > 0 && e[g] < r.params.minN) colViol = true;
        }
        if (r.params.crit.maxN === 'hard') {
            for (const [, e] of c.cls) for (const g of ['m', 'w']) if (e[g] > r.params.maxN) colViol = true;
        }
        if (r.params.crit.gender === 'hard' && c.size >= 3 && Math.abs((c.m / c.size) - ratio) > 0.2) colViol = true;
        col.classList.toggle('violation', colViol);

        col.querySelector('.course-head').innerHTML = `
            <div class="ct">Kurs ${roman(ci)}</div>
            <div class="cmeta">${c.size} Schüler · ${c.m} ♂ / ${c.w} ♀</div>
            <div class="cls-dist">${clsDist}</div>`;

        const body = col.querySelector('.course-body');
        body.innerHTML = '';
        studs.filter(s => r.assign.get(s.id) === ci)
            .sort((a, b) => a.klasse.localeCompare(b.klasse, 'de') || a.nachname.localeCompare(b.nachname, 'de'))
            .forEach(s => {
                const card = document.createElement('div');
                card.className = 'stu-card ' + s.geschlecht;
                card.draggable = true;
                card.innerHTML = `<span>${s.geschlecht === 'm' ? '♂' : '♀'} ${esc(s.vorname)} ${esc(s.nachname)}</span><span class="kl">${esc(s.klasse)}</span>`;
                card.addEventListener('dragstart', e => {
                    e.dataTransfer.setData('text/sid', s.id);
                    e.dataTransfer.setData('text/opt', option);
                    card.classList.add('dragging');
                });
                card.addEventListener('dragend', () => card.classList.remove('dragging'));
                body.appendChild(card);
            });
    });

    // Gesamtzusammenfassung neu (für globale Warnung)
    let totalViol = 0;
    state.subjects.forEach(o => {
        const rr = state.results[o];
        totalViol += costOf(buildCoursesFromAssign(o), rr.params).hard;
    });
    $('resultsSummary').innerHTML = totalViol > 0
        ? `<div class="warn">⚠️ ${totalViol} Verletzung(en) harter Regeln verbleiben (rot markiert).</div>`
        : `<div class="success">✓ Alle als „Hart" gesetzten Regeln sind erfüllt.</div>`;
}

// einfache CSS-Attribut-Escape-Hilfe für querySelector
function cssEscape(s) { return s.replace(/["\\]/g, '\\$&'); }

$('btnRegenerate').addEventListener('click', () => computeAll(true));
$('btnBackConfig').addEventListener('click', () => setStep(2));
$('btnReset').addEventListener('click', reset);
$('btnExport').addEventListener('click', exportXlsx);

function reset() {
    state.students = []; state.subjects = []; state.classes = []; state.results = {};
    state.config.perSubject = {};
    upload.clear();
    showMessage('', '');
    setStep(0);
}

/* =========================================================================
   Excel-Export (SheetJS)
   ========================================================================= */
function exportXlsx() {
    if (!state.subjects.length) { showMessage('Keine Daten zum Exportieren.', 'error'); return; }
    if (typeof XLSX === 'undefined') { showMessage('Excel-Bibliothek nicht geladen (Internetverbindung?). Bitte Seite neu laden.', 'error'); return; }

    const blaetter = [];

    // Blatt „Gesamt"
    const gesamt = [['Vorname', 'Nachname', 'Klasse', 'Fach', 'Kurs', 'Geschlecht']];
    state.subjects.forEach(option => {
        const r = state.results[option];
        studentsOf(option)
            .slice()
            .sort((a, b) => (r.assign.get(a.id) - r.assign.get(b.id)) || a.klasse.localeCompare(b.klasse, 'de') || a.nachname.localeCompare(b.nachname, 'de'))
            .forEach(s => {
                gesamt.push([s.vorname, s.nachname, s.klasse, option, 'Kurs ' + roman(r.assign.get(s.id)), s.geschlecht === 'm' ? 'm' : 'w']);
            });
    });
    blaetter.push({ name: 'Gesamt', rows: gesamt });

    // Statistik-Blatt
    const stat = [['Fach', 'Kurs', 'Schüler', 'Jungen', 'Mädchen', 'Klassenverteilung']];
    state.subjects.forEach(option => {
        const r = state.results[option];
        const courses = buildCoursesFromAssign(option);
        courses.forEach((c, ci) => {
            const dist = [...c.cls.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([k, e]) => `${k}:${e.m + e.w}`).join(', ');
            stat.push([option, 'Kurs ' + roman(ci), c.size, c.m, c.w, dist]);
        });
    });
    blaetter.push({ name: 'Statistik', rows: stat });

    // Je Kurs ein eigenes Tabellenblatt
    const usedNames = new Set(['Gesamt', 'Statistik']);
    state.subjects.forEach(option => {
        const r = state.results[option];
        for (let ci = 0; ci < r.nCourses; ci++) {
            const rows = [['Vorname', 'Nachname', 'Klasse', 'Geschlecht']];
            studentsOf(option)
                .filter(s => r.assign.get(s.id) === ci)
                .sort((a, b) => a.klasse.localeCompare(b.klasse, 'de') || a.nachname.localeCompare(b.nachname, 'de'))
                .forEach(s => rows.push([s.vorname, s.nachname, s.klasse, s.geschlecht === 'm' ? 'm' : 'w']));
            const name = uniqueSheetName(`${option} Kurs ${roman(ci)}`, usedNames);
            blaetter.push({ name, rows });
        }
    });

    toolhubWriteXlsx(blaetter, 'Kurseinteilung_WPB.xlsx');
}

// Blattnamen bereinigt toolhubSheetName; hier kommt nur die Eindeutigkeit dazu,
// weil ein Fach in mehreren Kursen denselben Namen ergeben kann
function uniqueSheetName(base, used) {
    const name = toolhubSheetName(base);
    if (!used.has(name)) { used.add(name); return name; }
    let i = 2, cand;
    do { const suf = ' ' + i; cand = name.slice(0, 31 - suf.length).trim() + suf; i++; } while (used.has(cand));
    used.add(cand); return cand;
}
