/*
 * toolhub-io.js – gemeinsame Bausteine für Dateien, CSV, Downloads und Meldungen.
 *
 * Einbindung (Tool-Seiten, zwei Ebenen unter dem Root):
 *   <script src="../../assets/vendor/papaparse.min.js" defer></script>   (nur für CSV)
 *   <script src="../../assets/toolhub-io.js" defer></script>
 *
 * Enthält:
 *   toolhubReadArrayBuffer(file)          Datei als ArrayBuffer lesen
 *   toolhubReadText(file)                 Datei als Text lesen (Kodierung wird erkannt)
 *   toolhubDecode(buffer)                 Bytes -> { text, encoding }
 *   toolhubParseCsv(text, options)        CSV-Text -> { rows, fields, delimiter }
 *   toolhubReadCsv(file, options)         Datei -> { rows, fields, delimiter, encoding }
 *   toolhubDownload(blob, filename)       Download auslösen
 *   toolhubDownloadCsv(text, filename)    CSV mit BOM herunterladen (Excel-tauglich)
 *   toolhubEscapeHtml(value)              Text für die Ausgabe in innerHTML entschärfen
 *   toolhubMessage(target, text, type)    Meldung in den Klassen aus toolhub.css anzeigen
 */

// ---------------------------------------------------------------------------
// Dateien lesen
// ---------------------------------------------------------------------------

function toolhubReadArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error(`Datei "${file.name}" konnte nicht gelesen werden.`));
    reader.readAsArrayBuffer(file);
  });
}

/*
 * Dekodiert Bytes zu Text. Schulische Quellsysteme (Untis, DiViS, deutsches Excel)
 * liefern mal UTF-8, mal Windows-1252. Zuerst wird UTF-8 streng versucht; scheitert
 * das an ungültigen Bytes, ist es praktisch immer Windows-1252.
 * Ein vorangestelltes BOM wird entfernt.
 */
function toolhubDecode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}

async function toolhubReadText(file) {
  const { text } = toolhubDecode(await toolhubReadArrayBuffer(file));
  return text;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/*
 * Liest CSV über PapaParse. Das Trennzeichen wird erkannt (Semikolon zuerst, wie
 * deutsches Excel exportiert).
 *
 * options:
 *   header: true          Zeilen als Objekte mit den Kopfzeilen als Schlüssel (Standard)
 *   header: false         Zeilen als Arrays
 *   delimiter: ';'        Trennzeichen fest vorgeben statt zu erkennen
 *   trim: false           Werte und Kopfzeilen nicht beschneiden (Standard: beschneiden)
 *
 * Rückgabe: { rows, fields, delimiter }
 * Wirft bei Parserfehlern, die über eine abweichende Spaltenzahl hinausgehen.
 */
function toolhubParseCsv(text, options = {}) {
  const { header = true, delimiter, trim = true } = options;

  const result = Papa.parse(text.replace(/^﻿/, ''), {
    header,
    delimiter,
    delimitersToGuess: [';', ',', '\t', '|'],
    skipEmptyLines: 'greedy',
    transformHeader: trim ? (h) => h.trim() : undefined,
    transform: trim ? (v) => (v || '').trim() : undefined
  });

  // FieldMismatch ist bei Exporten mit Leer- oder Kommentarzeilen üblich und harmlos
  const fatal = result.errors.filter((e) => e.type !== 'FieldMismatch');
  if (fatal.length > 0) throw new Error(`CSV konnte nicht gelesen werden: ${fatal[0].message}`);

  return {
    rows: result.data,
    fields: result.meta.fields || [],
    delimiter: result.meta.delimiter || delimiter || ';'
  };
}

async function toolhubReadCsv(file, options = {}) {
  const { text, encoding } = toolhubDecode(await toolhubReadArrayBuffer(file));
  return { ...toolhubParseCsv(text, options), encoding };
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function toolhubDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Verzögert freigeben: manche Browser laden erst nach dem Klick
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/*
 * Lädt CSV-Text herunter. Standardmäßig mit BOM, damit Excel die Umlaute korrekt
 * anzeigt. Für Dateien, die wieder in ein Fremdsystem eingelesen werden, kann das
 * BOM mit { bom: false } entfallen – manche Importer stolpern darüber.
 */
function toolhubDownloadCsv(text, filename, { bom = true } = {}) {
  toolhubDownload(new Blob([(bom ? '﻿' : '') + text], { type: 'text/csv;charset=utf-8;' }), filename);
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

function toolhubEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/*
 * Zeigt eine Meldung in einem Container an – passend zu den Klassen
 * .error / .success / .warn / .info aus toolhub.css.
 *
 *   toolhubMessage('meldung', 'Datei eingelesen.', 'success');
 *   toolhubMessage('meldung', ['Zeile 1', 'Zeile 2'], 'error');   // je Eintrag eine Zeile
 *   toolhubMessage('meldung', '');                                // Meldung entfernen
 *
 * target ist eine id oder ein Element. Der Text wird als Text eingefügt, nie als HTML –
 * Inhalte aus eingelesenen Dateien müssen so nicht eigens entschärft werden.
 */
function toolhubMessage(target, text, type = 'info') {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  el.innerHTML = '';

  const zeilen = (Array.isArray(text) ? text : [text]).filter((z) => z);
  if (zeilen.length === 0) return;

  const box = document.createElement('div');
  box.className = type;
  zeilen.forEach((zeile, index) => {
    if (index > 0) box.appendChild(document.createElement('br'));
    box.appendChild(document.createTextNode(zeile));
  });
  el.appendChild(box);
}
