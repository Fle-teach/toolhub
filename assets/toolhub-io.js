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
 * Fügt Datensätze wieder zusammen, die durch nicht maskierte Zeilenumbrüche in einen
 * Feldwert zerrissen wurden. Manche Exporte schreiben mehrzeilige Zellen (z. B. lange
 * Kommentare) mit echten Zeilenumbrüchen, ohne den Wert in Anführungszeichen zu setzen –
 * dann zerlegt jeder Parser den Datensatz in mehrere Zeilen.
 *
 * Reparatur über die Spaltenzahl: Ein vollständiger Datensatz hat so viele Felder wie die
 * Kopfzeile (N). Bleibt eine Zeile darunter, gehört ihr letzter Wert mit der nächsten Zeile
 * zusammen (der Zeilenumbruch stand mitten im Wert) – dort wird wieder ein "\n" eingesetzt.
 * Eine Zeile mit N Feldern beginnt dagegen einen neuen Datensatz.
 *
 * `zeilen` sind Arrays von Feldern (inkl. Kopfzeile als erstes Element). Rückgabe ebenso.
 */
function toolhubCsvDatensaetzeZusammenfuegen(zeilen) {
  if (zeilen.length === 0) return zeilen;
  const spalten = zeilen[0].length; // N = Spaltenzahl der Kopfzeile
  const istLeer = (zeile) => zeile.length === 0 || (zeile.length === 1 && zeile[0] === '');

  const ergebnis = [];
  let puffer = null;
  for (const zeile of zeilen) {
    if (puffer === null) {
      if (istLeer(zeile)) continue; // Leerzeilen zwischen Datensätzen überspringen
      puffer = zeile.slice();
    } else if (!istLeer(zeile) && zeile.length >= spalten) {
      // Voller Datensatz, obwohl der vorige noch unvollständig war -> vorigen abschließen
      ergebnis.push(puffer);
      puffer = zeile.slice();
    } else {
      // Fortsetzung: letzter Wert des Puffers ging in dieser Zeile weiter (Umbruch im Wert)
      puffer[puffer.length - 1] += '\n' + (zeile.length ? zeile[0] : '');
      for (let i = 1; i < zeile.length; i++) puffer.push(zeile[i]);
    }
    if (puffer.length >= spalten) {
      ergebnis.push(puffer);
      puffer = null;
    }
  }
  if (puffer !== null) ergebnis.push(puffer);
  return ergebnis;
}

/*
 * Liest CSV über PapaParse. Das Trennzeichen wird erkannt (Semikolon zuerst, wie
 * deutsches Excel exportiert).
 *
 * options:
 *   header: true          Zeilen als Objekte mit den Kopfzeilen als Schlüssel (Standard)
 *   header: false         Zeilen als Arrays
 *   delimiter: ';'        Trennzeichen fest vorgeben statt zu erkennen
 *   trim: false           Werte und Kopfzeilen nicht beschneiden (Standard: beschneiden)
 *   reparieren: false     Datensätze, die durch Zeilenumbrüche in Werten zerrissen wurden,
 *                         nicht zusammenfügen (Standard: zusammenfügen, siehe unten)
 *
 * Rückgabe: { rows, fields, delimiter }
 * Wirft bei Parserfehlern, die über eine abweichende Spaltenzahl hinausgehen.
 */
function toolhubParseCsv(text, options = {}) {
  const { header = true, delimiter, trim = true, reparieren = true } = options;

  // Immer zuerst als Zeilen-Arrays einlesen, ohne Leerzeilen zu überspringen – nur so sind
  // durch Zeilenumbrüche zerrissene Datensätze an der Spaltenzahl erkennbar.
  const result = Papa.parse(text.replace(/^﻿/, ''), {
    header: false,
    delimiter,
    delimitersToGuess: [';', ',', '\t', '|'],
    skipEmptyLines: false
  });

  // FieldMismatch (abweichende Spaltenzahl) ist bei Leer-/Kommentarzeilen und bei den unten
  // reparierten Umbruch-Schäden üblich; die Delimiter-Warnung tritt nur bei sehr kurzen
  // Dateien auf, wo PapaParse mangels Daten auf das Komma zurückfällt – beides ist harmlos.
  const fatal = result.errors.filter((e) => e.type !== 'FieldMismatch' && e.type !== 'Delimiter');
  if (fatal.length > 0) throw new Error(`CSV konnte nicht gelesen werden: ${fatal[0].message}`);

  let zeilen = result.data;
  const spalten = zeilen.length ? zeilen[0].length : 0;
  const nichtLeer = (z) => !(z.length === 0 || (z.length === 1 && z[0] === ''));

  // Reparatur nur übernehmen, wenn sie tatsächlich Zeilen zusammengeführt hat UND das
  // Ergebnis überwiegend saubere Datensätze mit voller Spaltenzahl sind. Damit bleiben
  // gewöhnliche (auch bewusst kürzere) CSVs unangetastet und nur echte Umbruch-Schäden
  // werden geheilt.
  if (reparieren && spalten > 0) {
    const roh = zeilen.filter(nichtLeer).length;
    const repariert = toolhubCsvDatensaetzeZusammenfuegen(zeilen);
    const sauber = repariert.filter((z) => z.length === spalten).length;
    if (repariert.length < roh && sauber >= Math.ceil(repariert.length * 0.7)) {
      zeilen = repariert;
    }
  }

  const schneiden = (wert) => (trim ? (wert || '').trim() : (wert || ''));
  const daten = zeilen.filter(nichtLeer).map((zeile) => zeile.map(schneiden));

  let fields = [];
  let rows;
  if (header) {
    // Erste Zeile ist die Kopfzeile; gleiche Namen werden eindeutig gemacht (wie PapaParse),
    // damit sich Spalten nicht gegenseitig überschreiben.
    const gesehen = {};
    fields = (daten[0] || []).map((name) => {
      if (gesehen[name] === undefined) { gesehen[name] = 0; return name; }
      gesehen[name] += 1;
      return `${name}_${gesehen[name]}`;
    });
    rows = daten.slice(1).map((zeile) => {
      const satz = {};
      fields.forEach((name, i) => { satz[name] = zeile[i] !== undefined ? zeile[i] : ''; });
      return satz;
    });
  } else {
    rows = daten;
  }

  return {
    rows,
    fields: header ? fields : [],
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
