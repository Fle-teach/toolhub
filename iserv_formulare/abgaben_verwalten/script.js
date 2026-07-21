// ----- Tabs -----
const tabs = document.querySelectorAll('.tab');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      document.getElementById(t.getAttribute('aria-controls')).classList.toggle('hidden', t !== tab);
    });
  });
});

// ----- Dateiauswahl (gemeinsame Upload-Komponente aus toolhub.js) -----
const nurCSVHinweis = () => alert('Bitte nur CSV-Dateien auswählen.');

const teilnehmerUpload = toolhubUpload({
  input: 'teilnehmerCSV',
  zone: 'teilnehmerCSVZone',
  list: 'teilnehmerCSVList',
  extensions: ['.csv'],
  onInvalid: nurCSVHinweis
});

const formularUpload = toolhubUpload({
  input: 'formularCSV',
  zone: 'formularCSVZone',
  list: 'formularCSVList',
  extensions: ['.csv'],
  onInvalid: nurCSVHinweis
});

const csvUpload = toolhubUpload({
  input: 'csvFile',
  zone: 'csvFileZone',
  list: 'csvFileList',
  extensions: ['.csv'],
  onInvalid: nurCSVHinweis
});

// ----- Fehlende Abgaben ermitteln -----
let teilnehmerDaten = [];
let formularDaten = [];
let fehlendeTeilnehmer = [];

document.getElementById('vergleichenBtn').addEventListener('click', vergleichen);
document.getElementById('bereinigenBtn').addEventListener('click', bereinigen);

// Der Export-Button wird erst mit dem Ergebnis erzeugt
document.getElementById('ergebnis').addEventListener('click', (event) => {
  if (event.target.closest('#exportBtn')) exportiereCSV();
});

async function vergleichen() {
  const tFile = teilnehmerUpload.files[0];
  const fFiles = formularUpload.files;

  if (!tFile || fFiles.length === 0) {
    alert('Bitte Teilnehmerliste und mindestens eine Formulardatei auswählen.');
    return;
  }

  try {
    teilnehmerDaten = (await toolhubReadCsv(tFile)).rows;
    const formulare = await Promise.all(fFiles.map(file => toolhubReadCsv(file)));
    formularDaten = formulare.flatMap(ergebnis => ergebnis.rows);
  } catch (error) {
    alert(error.message);
    return;
  }

  findeFehlende();
}

function findeFehlende() {
  const formularSet = new Set(
    formularDaten.map(row => (row.Vorname?.trim().toLowerCase() || "") + "|" + (row.Nachname?.trim().toLowerCase() || ""))
  );

  const fehlende = teilnehmerDaten.filter(row => {
    const key = (row.Vorname?.trim().toLowerCase() || "") + "|" + (row.Nachname?.trim().toLowerCase() || "");
    return !formularSet.has(key);
  });

  fehlendeTeilnehmer = fehlende;
  zeigeTabelle(fehlende);
}

function zeigeTabelle(daten) {
  const container = document.getElementById('ergebnis');

  // Bestimme verfügbare Header (ohne "Gruppe")
  let headers = [];
  if (teilnehmerDaten.length > 0) {
    headers = Object.keys(teilnehmerDaten[0]).filter(h => h.trim().toLowerCase() !== "gruppe");
  } else if (daten.length > 0) {
    headers = Object.keys(daten[0]).filter(h => h.trim().toLowerCase() !== "gruppe");
  }

  const classHeader = headers.find(h => h.trim().toLowerCase() === "klasse/information");
  const exportButton = '<button class="btn-secondary" id="exportBtn" type="button">Als CSV exportieren</button>';

  // Gruppiere nach Klasse/Information, falls vorhanden
  if (classHeader) {
    // Sammle alle Klassen aus der Teilnehmerliste
    const alleKlassen = new Map();
    teilnehmerDaten.forEach(row => {
      const key = (row[classHeader] || "Ohne Klasse/Information").trim();
      if (!alleKlassen.has(key)) {
        alleKlassen.set(key, []);
      }
    });

    // Füge fehlende Teilnehmer hinzu
    daten.forEach(row => {
      const key = (row[classHeader] || "Ohne Klasse/Information").trim();
      if (!alleKlassen.has(key)) {
        alleKlassen.set(key, []);
      }
      alleKlassen.get(key).push(row);
    });

    const gruppenKeys = Array.from(alleKlassen.keys()).sort((a, b) =>
      a.localeCompare(b, 'de', { sensitivity: 'base' })
    );

    // Sortiere jede Gruppe nach Nachname, dann Vorname
    gruppenKeys.forEach(key => {
      alleKlassen.get(key).sort((a, b) => {
        const lnA = (a.Nachname || "").trim().toLowerCase();
        const lnB = (b.Nachname || "").trim().toLowerCase();
        if (lnA !== lnB) return lnA.localeCompare(lnB, 'de', { sensitivity: 'base' });
        const fnA = (a.Vorname || "").trim().toLowerCase();
        const fnB = (b.Vorname || "").trim().toLowerCase();
        return fnA.localeCompare(fnB, 'de', { sensitivity: 'base' });
      });
    });

    let html = `<div><h3>Fehlende Teilnehmer nach Klasse (Gesamt: ${daten.length})</h3>`;
    if (daten.length > 0) {
      html += exportButton;
    }
    html += `<table class="uebersicht"><thead><tr><th>Klasse/Information</th><th>Fehlende Abgaben</th></tr></thead><tbody>`;
    gruppenKeys.forEach(gruppe => {
      html += `<tr><td>${toolhubEscapeHtml(gruppe)}</td><td>${alleKlassen.get(gruppe).length}</td></tr>`;
    });
    html += `<tr class="summe"><td>Gesamt</td><td>${daten.length}</td></tr>`;
    html += "</tbody></table></div>";

    gruppenKeys.forEach(gruppe => {
      const gruppeDaten = alleKlassen.get(gruppe);
      if (gruppeDaten.length > 0) {
        html += `<h4>${toolhubEscapeHtml(gruppe)}</h4>`;
        html += "<table><thead><tr>";
        headers.forEach(header => html += `<th>${toolhubEscapeHtml(header)}</th>`);
        html += "</tr></thead><tbody>";

        gruppeDaten.forEach(row => {
          html += "<tr>";
          headers.forEach(header => html += `<td>${toolhubEscapeHtml(row[header] || "")}</td>`);
          html += "</tr>";
        });

        html += "</tbody></table>";
      }
    });

    container.innerHTML = html;
    return;
  }

  // Fallback ohne Klassengruppierung
  if (daten.length === 0) {
    container.innerHTML = `<p class="success">Alle Teilnehmer haben ein Formular ausgefüllt. (Gesamt: 0 fehlende)</p>`;
    return;
  }

  let html = `<h3>Fehlende Teilnehmer (Gesamt: ${daten.length})</h3>`;
  html += exportButton;
  html += "<table><thead><tr>";
  headers.forEach(header => html += `<th>${toolhubEscapeHtml(header)}</th>`);
  html += "</tr></thead><tbody>";

  daten.forEach(row => {
    html += "<tr>";
    headers.forEach(header => html += `<td>${toolhubEscapeHtml(row[header] || "")}</td>`);
    html += "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

function exportiereCSV() {
  if (fehlendeTeilnehmer.length === 0) {
    alert("Keine fehlenden Teilnehmer zum Exportieren vorhanden.");
    return;
  }

  // Bestimme Header (ohne "Gruppe") und Feldnamen für Sortierung
  const headers = Object.keys(fehlendeTeilnehmer[0]).filter(h => h.trim().toLowerCase() !== "gruppe");
  const classHeader = headers.find(h => h.trim().toLowerCase() === "klasse/information");

  // Kopie erstellen und sortieren: Klasse/Information -> Nachname -> Vorname
  const rows = [...fehlendeTeilnehmer];
  const norm = v => (v ?? "").toString().trim().toLowerCase();
  rows.sort((a, b) => {
    if (classHeader) {
      const cA = norm(a[classHeader]);
      const cB = norm(b[classHeader]);
      const cCmp = cA.localeCompare(cB, 'de', { sensitivity: 'base' });
      if (cCmp !== 0) return cCmp;
    }
    const lnA = norm(a.Nachname);
    const lnB = norm(b.Nachname);
    const lnCmp = lnA.localeCompare(lnB, 'de', { sensitivity: 'base' });
    if (lnCmp !== 0) return lnCmp;
    const fnA = norm(a.Vorname);
    const fnB = norm(b.Vorname);
    return fnA.localeCompare(fnB, 'de', { sensitivity: 'base' });
  });

  // CSV-Daten erstellen in sortierter Reihenfolge
  const csvData = [headers];
  rows.forEach(row => {
    const rowData = headers.map(header => row[header] ?? "");
    csvData.push(rowData);
  });

  toolhubDownloadCsv(Papa.unparse(csvData), 'fehlende_teilnehmer.csv');
}

// ----- Doppelte Abgaben entfernen -----
function parseDatum(dateStr) {
  // Format: "15.04.2025 10:23"
  if (!dateStr) return new Date(0);
  const [date, time] = dateStr.trim().split(' ');
  const [day, month, year] = (date || "").split('.');
  const [hours, minutes] = (time || "0:0").split(':');
  return new Date(year, month - 1, day, hours, minutes);
}

async function bereinigen() {
  const file = csvUpload.files[0];
  if (!file) {
    alert('Bitte eine CSV-Datei auswählen.');
    return;
  }

  let eingelesen;
  try {
    eingelesen = await toolhubReadCsv(file);
  } catch (error) {
    alert(error.message);
    return;
  }

  const { rows: daten, fields: headers, delimiter } = eingelesen;

  if (!headers.includes('Import-ID') || !headers.includes('Ausgefüllt am')) {
    alert('Die CSV-Datei muss die Spalten "Import-ID" und "Ausgefüllt am" enthalten.');
    return;
  }

  // Pro Import-ID nur die neueste Abgabe behalten
  const dataMap = new Map();
  const gruppen = new Map();
  daten.forEach(row => {
    const id = row['Import-ID'];
    const datum = parseDatum(row['Ausgefüllt am']);
    const vorhanden = dataMap.get(id);
    if (!vorhanden || datum > vorhanden.datum) {
      dataMap.set(id, { row, datum });
    }
    if (!gruppen.has(id)) gruppen.set(id, []);
    gruppen.get(id).push(row);
  });

  const bereinigt = Array.from(dataMap.values()).map(e => e.row);
  const entfernt = daten.length - bereinigt.length;

  const csv = Papa.unparse(bereinigt, { columns: headers, delimiter });
  // Ohne BOM: die Datei wird wieder in IServ eingelesen
  toolhubDownloadCsv(csv, 'bereinigt.csv', { bom: false });

  let html =
    `<h3>Bereinigung abgeschlossen</h3>
     <ul>
       <li>${daten.length} Abgaben eingelesen</li>
       <li>${entfernt} doppelte Abgabe${entfernt === 1 ? "" : "n"} entfernt</li>
       <li>${bereinigt.length} Abgaben in der bereinigten Datei</li>
     </ul>`;

  // Übersicht aller doppelten Abgaben (behalten vs. entfernt)
  const doppelte = Array.from(gruppen.entries()).filter(([, rows]) => rows.length > 1);
  if (doppelte.length > 0) {
    html += `<h4>Übersicht der doppelten Abgaben</h4>`;
    html += `<p class="hint">Gr&uuml;n hinterlegte Datens&auml;tze wurden behalten, rot hinterlegte entfernt.</p>`;
    html += `<div class="table-wrap"><table><thead><tr><th>Status</th>`;
    headers.forEach(h => html += `<th>${toolhubEscapeHtml(h)}</th>`);
    html += `</tr></thead><tbody>`;
    doppelte.forEach(([id, rows]) => {
      rows.forEach(row => {
        const behalten = row === dataMap.get(id).row;
        html += `<tr class="${behalten ? 'row-kept' : 'row-removed'}">`;
        html += `<td class="status">${behalten ? 'behalten' : 'entfernt'}</td>`;
        headers.forEach(h => html += `<td>${toolhubEscapeHtml(row[h] ?? '')}</td>`);
        html += `</tr>`;
      });
    });
    html += `</tbody></table></div>`;
  } else {
    html += `<p class="success">Keine doppelten Abgaben gefunden.</p>`;
  }

  document.getElementById('bereinigungsErgebnis').innerHTML = html;
}
