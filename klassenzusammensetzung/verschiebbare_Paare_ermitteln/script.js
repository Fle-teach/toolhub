class GroupFinder {
    constructor() {
        this.students = new Map();
        this.groups = [];
    }

    /* CSV einlesen (toolhub-io.js erkennt Trennzeichen und Kodierung) */
    parseCSV(text) {
        const { rows, fields } = toolhubParseCsv(text);

        const requiredColumns = ['Schüler', 'Nachname', 'Vorname', 'Alte Klasse', 'Wunsch 1 - Höchste Priorität'];
        const missingColumns = requiredColumns.filter(col => !fields.includes(col));

        if (missingColumns.length > 0) {
            throw new Error(`Fehlende Spalten: ${missingColumns.join(', ')}`);
        }

        return rows;
    }

    analyze(data) {
        this.students.clear();
        this.groups = [];

        const directedGraph = new Map();   // Schüler -> gewünschte Schüler
        const undirectedGraph = new Map(); // für die Zusammenhangskomponenten

        data.forEach((row) => {
            const studentId = (row['Schüler'] || '').trim();
            if (!studentId) return;

            this.students.set(studentId, {
                id: studentId,
                name: `${row['Nachname'] || ''} ${row['Vorname'] || ''}`.trim(),
                klasse: (row['Alte Klasse'] || '').trim(),
                wish1: (row['Wunsch 1 - Höchste Priorität'] || '').trim()
            });

            if (!directedGraph.has(studentId)) directedGraph.set(studentId, []);
            if (!undirectedGraph.has(studentId)) undirectedGraph.set(studentId, new Set());
        });

        for (const [studentId, student] of this.students) {
            if (student.wish1 && this.students.has(student.wish1)) {
                directedGraph.get(studentId).push(student.wish1);
                undirectedGraph.get(studentId).add(student.wish1);
                undirectedGraph.get(student.wish1).add(studentId);
            }
        }

        const connectedComponents = this.findConnectedComponents(undirectedGraph);

        // Nur Komponenten behalten, in die niemand von außen hineinwünscht
        this.groups = connectedComponents
            .filter(component => !this.hasExternalIncomingEdges(component))
            .map(component => ({ members: component.sort(), size: component.length }))
            .sort((a, b) => b.size - a.size);

        return this.groups;
    }

    findConnectedComponents(undirectedGraph) {
        const visited = new Set();
        const components = [];

        // Iterative Tiefensuche – auch bei sehr großen Komponenten stabil
        for (const start of undirectedGraph.keys()) {
            if (visited.has(start)) continue;

            const component = [];
            const stack = [start];
            visited.add(start);

            while (stack.length > 0) {
                const node = stack.pop();
                component.push(node);
                for (const neighbor of undirectedGraph.get(node) || []) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        stack.push(neighbor);
                    }
                }
            }

            components.push(component);
        }

        return components;
    }

    hasExternalIncomingEdges(component) {
        const componentSet = new Set(component);

        for (const [studentId, student] of this.students) {
            if (componentSet.has(studentId)) continue;
            if (student.wish1 && componentSet.has(student.wish1)) return true;
        }

        return false;
    }

    exportToCSV() {
        if (this.groups.length === 0) return '';

        return Papa.unparse({
            fields: ['Gruppengröße', 'Schüler'],
            data: this.groups.map(group => [group.size, group.members.join(', ')])
        });
    }

    reset() {
        this.students.clear();
        this.groups = [];
    }
}

const finder = new GroupFinder();

const messageDiv = document.getElementById('message');
const resultsSection = document.getElementById('resultsSection');
const tableContainer = document.getElementById('tableContainer');
const totalStudentsEl = document.getElementById('totalStudents');
const groupCountEl = document.getElementById('groupCount');
const studentInGroupsEl = document.getElementById('studentInGroups');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const graphModal = document.getElementById('graphModal');
const graphCloseBtn = document.getElementById('graphCloseBtn');
const graphModalTitle = document.getElementById('graphModalTitle');
const graphStats = document.getElementById('graphStats');
const graphContainer = document.getElementById('graphContainer');

let currentNetwork = null;

/* Gemeinsame Upload-Komponente aus toolhub.js */
const upload = toolhubUpload({
    input: 'fileInput',
    zone: 'uploadBox',
    list: 'fileList',
    extensions: ['.csv'],
    onInvalid: (names) => showMessage(`Bitte eine CSV-Datei wählen (abgelehnt: ${names.join(', ')}).`, 'error'),
    onChange: (files) => {
        if (files.length === 0) {
            clearResults();
            return;
        }
        handleFile(files[0]);
    }
});

async function handleFile(file) {
    try {
        const data = finder.parseCSV(await toolhubReadText(file));
        displayResults(finder.analyze(data), data.length);
    } catch (error) {
        clearResults();
        showMessage(`Fehler: ${error.message}`, 'error');
    }
}

function displayResults(groups, totalStudents) {
    messageDiv.innerHTML = '';
    resultsSection.classList.add('visible');

    totalStudentsEl.textContent = totalStudents;
    groupCountEl.textContent = groups.length;
    studentInGroupsEl.textContent = groups.reduce((sum, group) => sum + group.size, 0);

    tableContainer.innerHTML = '';

    if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'no-results';
        empty.textContent = 'Keine geschlossenen Schülergruppen gefunden.';
        tableContainer.appendChild(empty);
        exportBtn.disabled = true;
        return;
    }

    exportBtn.disabled = false;

    // Nach Gruppengröße bündeln, größte zuerst
    const groupedBySize = new Map();
    groups.forEach(group => {
        if (!groupedBySize.has(group.size)) groupedBySize.set(group.size, []);
        groupedBySize.get(group.size).push(group);
    });

    Array.from(groupedBySize.keys()).sort((a, b) => b - a).forEach(size => {
        const groupsOfSize = groupedBySize.get(size);

        const section = document.createElement('div');
        section.className = 'group-section';

        const header = document.createElement('div');
        header.className = 'group-header';
        const title = document.createElement('h3');
        title.textContent = `Gruppen der Größe ${size}`;
        const count = document.createElement('div');
        count.className = 'count';
        count.textContent = `${groupsOfSize.length} ${groupsOfSize.length === 1 ? 'Gruppe' : 'Gruppen'}`;
        header.append(title, count);

        const list = document.createElement('div');
        list.className = 'group-list';

        groupsOfSize.forEach(group => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'group-row';
            row.title = 'Wunschgraph dieser Gruppe anzeigen';

            const members = document.createElement('div');
            members.className = 'members';
            group.members.forEach(id => {
                const badge = document.createElement('span');
                badge.className = 'student-badge';
                badge.textContent = id;
                members.appendChild(badge);
            });

            const hint = document.createElement('span');
            hint.className = 'open-hint';
            hint.textContent = 'Graph anzeigen →';

            row.append(members, hint);
            row.addEventListener('click', () => showGroupGraph(group.members));
            list.appendChild(row);
        });

        section.append(header, list);
        tableContainer.appendChild(section);
    });
}

function showMessage(text, type) {
    toolhubMessage(messageDiv, text, type);
}

function clearResults() {
    messageDiv.innerHTML = '';
    resultsSection.classList.remove('visible');
    tableContainer.innerHTML = '';
    finder.reset();
}

exportBtn.addEventListener('click', () => {
    const csv = finder.exportToCSV();
    if (!csv) {
        showMessage('Keine Daten zum Exportieren.', 'error');
        return;
    }

    toolhubDownloadCsv(csv, 'verschiebbare_gruppen.csv');
});

resetBtn.addEventListener('click', () => {
    upload.clear(); // löst onChange -> clearResults() aus
});

/* --- Graph-Dialog --- */

function closeGraph() {
    graphModal.classList.remove('show');
    if (currentNetwork) {
        currentNetwork.destroy();
        currentNetwork = null;
    }
}

graphCloseBtn.addEventListener('click', closeGraph);
graphModal.addEventListener('click', (event) => {
    if (event.target === graphModal) closeGraph();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && graphModal.classList.contains('show')) closeGraph();
});

/* Farben aus dem aktiven Design lesen, damit der Graph zum Theme passt */
function themeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function showGroupGraph(groupMembers) {
    const accent = themeColor('--accent');
    const accentText = themeColor('--accent-text');
    const mutualColor = themeColor('--ok');
    const memberSet = new Set(groupMembers);

    document.getElementById('legendMutual').style.background = mutualColor;
    document.getElementById('legendSingle').style.background = accent;

    const nodes = [];
    const edges = [];
    let mutualPairs = 0;

    groupMembers.forEach(memberId => {
        const student = finder.students.get(memberId);
        if (!student) return;

        nodes.push({
            id: memberId,
            label: memberId,
            title: student.name ? `${student.name} (${student.klasse})` : memberId,
            shape: 'box',
            margin: 10,
            color: { background: accent, border: accent },
            font: { color: accentText, size: 14, face: 'Open Sans, sans-serif' },
            widthConstraint: { minimum: 50 }
        });

        if (!student.wish1 || !memberSet.has(student.wish1)) return;

        const target = finder.students.get(student.wish1);
        const isMutual = target && target.wish1 === memberId;
        if (isMutual) mutualPairs += 0.5;

        edges.push({
            from: memberId,
            to: student.wish1,
            arrows: 'to',
            smooth: { type: isMutual ? 'curvedCW' : 'continuous' },
            color: { color: isMutual ? mutualColor : accent, opacity: 0.9 },
            width: isMutual ? 2.5 : 2
        });
    });

    graphModalTitle.textContent = `Gruppenwünsche (${groupMembers.length} Schüler)`;
    graphStats.textContent = `${groupMembers.length} Schüler · ${edges.length} Wunsch-Kanten · ${Math.round(mutualPairs)} gegenseitige Paare`;

    graphModal.classList.add('show');

    if (currentNetwork) currentNetwork.destroy();
    currentNetwork = new vis.Network(graphContainer, { nodes, edges }, {
        physics: {
            enabled: true,
            solver: 'barnesHut',
            barnesHut: {
                gravitationalConstant: -4000,
                centralGravity: 0.3,
                springLength: 200,
                springConstant: 0.04,
                damping: 0.7
            },
            stabilization: { iterations: 200 }
        },
        interaction: {
            navigationButtons: true,
            keyboard: true,
            zoomView: true,
            dragView: true
        }
    });
}
