/*
 * toolhub-xlsx.js – gemeinsame Bausteine für Excel-Dateien (SheetJS).
 *
 * Einbindung (Tool-Seiten, zwei Ebenen unter dem Root):
 *   <script src="../../assets/vendor/xlsx.full.min.js" defer></script>
 *   <script src="../../assets/toolhub-io.js" defer></script>
 *   <script src="../../assets/toolhub-xlsx.js" defer></script>
 *
 * Enthält:
 *   toolhubReadWorkbook(file)            Datei als Arbeitsmappe lesen
 *   toolhubSheetRows(sheet, options)     Blatt -> Zeilen (Objekte oder Arrays)
 *   toolhubColWidths(rows)               Spaltenbreiten am längsten Inhalt ausrichten
 *   toolhubSheetName(name)               Blattnamen auf gültige Form bringen
 *   toolhubWriteXlsx(sheets, filename)   Arbeitsmappe aus Zeilen-Arrays schreiben
 */

/*
 * Liest eine Datei als Arbeitsmappe. Wirft mit verständlicher Meldung, wenn die
 * Datei unlesbar ist oder keine Arbeitsblätter enthält.
 */
async function toolhubReadWorkbook(file) {
  const buffer = await toolhubReadArrayBuffer(file);
  let workbook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  } catch (error) {
    throw new Error(`Datei "${file.name}" konnte nicht gelesen werden: ${error.message}`);
  }
  if (!workbook.SheetNames.length) {
    throw new Error(`Datei "${file.name}" enthält keine Arbeitsblätter.`);
  }
  return workbook;
}

/*
 * Zeilen eines Blattes.
 *
 * options:
 *   header: true   Zeilen als Objekte mit der ersten Zeile als Schlüssel (Standard)
 *   header: false  Zeilen als Arrays – nötig, wenn die Kopfzeile nicht in Zeile 1 steht
 *                  oder Spaltennamen doppelt vorkommen
 *   defval         Ersatzwert für leere Zellen; ohne Angabe fehlen leere Zellen ganz
 *
 * sheet ist ein Arbeitsblatt oder eine Arbeitsmappe (dann wird das erste Blatt genommen).
 */
function toolhubSheetRows(sheet, options = {}) {
  const { header = true, defval } = options;
  const ws = sheet.SheetNames ? sheet.Sheets[sheet.SheetNames[0]] : sheet;
  return XLSX.utils.sheet_to_json(ws, header ? { defval } : { header: 1, defval });
}

// Spaltenbreiten am längsten Inhalt der jeweiligen Spalte ausrichten
function toolhubColWidths(rows) {
  const spalten = Math.max(...rows.map((row) => row.length));
  return Array.from({ length: spalten }, (_, i) => ({
    wch: Math.max(...rows.map((row) => String(row[i] ?? '').length)) + 2
  }));
}

/*
 * Excel erlaubt höchstens 31 Zeichen und keines von : \ / ? * [ ] im Blattnamen.
 * Ein ungültiger Name lässt XLSX.writeFile fehlschlagen.
 */
function toolhubSheetName(name) {
  const bereinigt = String(name ?? '').replace(/[:\\/?*[\]]/g, '-').trim();
  return (bereinigt || 'Tabelle').slice(0, 31);
}

/*
 * Schreibt eine Arbeitsmappe und löst den Download aus.
 *
 *   toolhubWriteXlsx({ 'Fehlzeiten': zeilen }, 'Auswertung.xlsx');
 *   toolhubWriteXlsx([{ name: '05A', rows }, { name: '05B', rows }], 'Klassen.xlsx');
 *
 * Zeilen sind Arrays von Arrays (erste Zeile = Kopfzeile). Die Spaltenbreiten werden
 * automatisch gesetzt; Blattnamen werden über toolhubSheetName() bereinigt.
 */
function toolhubWriteXlsx(sheets, filename) {
  const liste = Array.isArray(sheets)
    ? sheets
    : Object.entries(sheets).map(([name, rows]) => ({ name, rows }));

  const wb = XLSX.utils.book_new();
  liste.forEach(({ name, rows }) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = toolhubColWidths(rows);
    XLSX.utils.book_append_sheet(wb, ws, toolhubSheetName(name));
  });
  XLSX.writeFile(wb, filename);
}
