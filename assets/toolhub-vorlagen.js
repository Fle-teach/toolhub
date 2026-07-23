/*
 * toolhub-vorlagen.js – Serienbrief-Vorlagen im Format DOCX und ODT.
 *
 * Einbindung (Tool-Seiten, zwei Ebenen unter dem Root):
 *   <script src="../../assets/vendor/jszip.min.js" defer></script>
 *   <script src="../../assets/toolhub-io.js" defer></script>
 *   <script src="../../assets/toolhub-vorlagen.js" defer></script>
 *
 * Enthält:
 *   toolhubVorlageLaden(datei)          Vorlage einlesen -> Vorlage-Objekt (siehe unten)
 *   toolhubVorlageFelder(text)          Feldnamen aus einem Text lesen
 *   toolhubVorlageFuelleText(text, …)   Felder in einem Text ersetzen (z. B. Dateinamen)
 *   TOOLHUB_VORLAGE_ENDUNGEN            unterstützte Dateiendungen
 *
 * Ein Vorlage-Objekt bietet:
 *   .format          'docx' | 'odt'
 *   .endung          '.docx' | '.odt'
 *   .felder          Feldnamen des Fließtexts, Reihenfolge des ersten Auftretens
 *   .kopfFelder      Feldnamen aus Kopf-/Fußzeilen (dort gilt der erste Datensatz)
 *   .erzeuge(saetze, optionen)   -> Promise<Blob>: ein Dokument mit einem Abschnitt
 *                                   je Datensatz, dazwischen ein Seitenumbruch
 *   .vorschauText(satz, optionen)-> Promise<string>: reiner Text eines Datensatzes
 *
 * Ein "Datensatz" ist ein Objekt { Feldname: Wert }; die Schlüssel sind bereits die
 * Feldnamen der Vorlage. Die Zuordnung Spalte -> Feld gehört ins jeweilige Tool.
 *
 * Serienbrieffelder haben die Form {{Feldname}}. Umschließende Leerzeichen im Feld
 * werden ignoriert ({{ Vorname }} == {{Vorname}}).
 *
 * Zusätzlich werden die formateigenen Seriendruckfelder verstanden, sodass in Word
 * bzw. Writer eingerichtete Vorlagen unverändert weiterverwendet werden können:
 *   DOCX  MERGEFIELD, auch in IF-Feldern verschachtelt (siehe Abschnitt weiter unten)
 *   ODT   <text:database-display> (Einfügen > Feldbefehl > Weitere > Datenbank)
 *
 * Warum eigener Code statt einer Bibliothek: Die Tools laufen ohne Build-Schritt und
 * ohne Internetzugang; DOCX und ODT sind ZIP-Archive mit XML, das reicht mit JSZip
 * und dem DOMParser des Browsers aus.
 */

const TOOLHUB_VORLAGE_ENDUNGEN = ['.docx', '.odt'];

// Namensräume der beiden Formate
const TOOLHUB_NS = {
  xml: 'http://www.w3.org/XML/1998/namespace',
  // DOCX (WordprocessingML)
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  // ODT (OpenDocument)
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'
};

// Name der Absatzvorlage, die den Seitenumbruch zwischen zwei Datensätzen erzeugt (ODT)
const TOOLHUB_ODT_UMBRUCH_STIL = 'ToolhubSeitenumbruch';

// ---------------------------------------------------------------------------
// Felder ersetzen
// ---------------------------------------------------------------------------

// Jeder Aufruf braucht ein eigenes RegExp-Objekt, weil /g den Suchzeiger mitführt.
function toolhubVorlageMuster() {
  return /\{\{\s*([^{}]*?)\s*\}\}/g;
}

// Feldnamen eines Textes, Reihenfolge des ersten Auftretens, ohne Wiederholungen
function toolhubVorlageFelder(text) {
  const namen = [];
  for (const treffer of String(text ?? '').matchAll(toolhubVorlageMuster())) {
    if (treffer[1] && !namen.includes(treffer[1])) namen.push(treffer[1]);
  }
  return namen;
}

/*
 * Wandelt einen Wert aus CSV/XLSX in Text um. Zeilenumbrüche werden vereinheitlicht,
 * damit die Formate sie später als echten Umbruch einfügen können.
 */
function toolhubVorlageWert(wert) {
  if (wert === null || wert === undefined) return '';
  if (wert instanceof Date) return wert.toLocaleDateString('de-DE');
  return String(wert).replace(/\r\n?/g, '\n');
}

/*
 * Ersetzt Felder in einer Zeichenkette – gedacht für Dateinamen-Muster.
 * Unbekannte Felder werden geleert.
 */
function toolhubVorlageFuelleText(text, werte) {
  return String(text ?? '').replace(toolhubVorlageMuster(), (ganz, name) => {
    if (!name) return ganz;
    return Object.prototype.hasOwnProperty.call(werte, name) ? toolhubVorlageWert(werte[name]) : '';
  });
}

/*
 * Kern der Ersetzung: Ein Absatz besteht aus mehreren "Stücken" (in DOCX die <w:t>,
 * in ODT die Textknoten). Word und Writer zerlegen Text beim Tippen häufig mitten im
 * Wort, ein Feld kann also über mehrere Stücke verteilt sein. Deshalb wird der Absatz
 * als Ganzes durchsucht und danach wieder auf die Stücke verteilt – so bleibt die
 * Formatierung der übrigen Textteile erhalten.
 *
 * stuecke: [{ lies(): string, schreibe(text: string): void }]
 * Rückgabe: true, wenn etwas ersetzt wurde.
 */
function toolhubVorlageErsetzeStuecke(stuecke, werte, optionen = {}) {
  const behalten = optionen.behaltUnbekannte === true;
  const texte = stuecke.map((stueck) => stueck.lies() || '');
  const gesamt = texte.join('');
  if (!gesamt.includes('{{')) return false;

  // Startposition jedes Stücks im Gesamttext
  const start = [];
  let pos = 0;
  texte.forEach((teil) => {
    start.push(pos);
    pos += teil.length;
  });

  // Stück, in dem eine Position im Gesamttext liegt (leere Stücke überspringen)
  function stueckAn(index) {
    for (let i = texte.length - 1; i >= 0; i--) {
      if (texte[i].length > 0 && start[i] <= index) return i;
    }
    return 0;
  }

  const ausgabe = texte.map(() => []);

  // Unveränderten Text aus dem Bereich [von, bis) auf seine Stücke verteilen
  function uebernimm(von, bis) {
    if (bis <= von) return;
    texte.forEach((teil, i) => {
      const a = Math.max(von, start[i]);
      const b = Math.min(bis, start[i] + teil.length);
      if (b > a) ausgabe[i].push(teil.slice(a - start[i], b - start[i]));
    });
  }

  const muster = toolhubVorlageMuster();
  let treffer;
  let gelesen = 0;
  let ersetzt = false;

  while ((treffer = muster.exec(gesamt)) !== null) {
    const name = treffer[1];
    if (!name) continue; // "{{}}" ist kein Feld und bleibt stehen

    uebernimm(gelesen, treffer.index);

    const bekannt = Object.prototype.hasOwnProperty.call(werte, name);
    const wert = bekannt ? toolhubVorlageWert(werte[name]) : (behalten ? treffer[0] : '');

    // Der Wert übernimmt die Formatierung der Stelle, an der das Feld beginnt
    ausgabe[stueckAn(treffer.index)].push(wert);
    gelesen = treffer.index + treffer[0].length;
    ersetzt = true;
  }

  if (!ersetzt) return false;

  uebernimm(gelesen, gesamt.length);
  stuecke.forEach((stueck, i) => stueck.schreibe(ausgabe[i].join('')));
  return true;
}

// ---------------------------------------------------------------------------
// XML in ZIP-Archiven
// ---------------------------------------------------------------------------

async function toolhubVorlageXmlLesen(zip, pfad) {
  const eintrag = zip.file(pfad);
  if (!eintrag) return null;
  const doc = new DOMParser().parseFromString(await eintrag.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`Die Datei "${pfad}" der Vorlage konnte nicht gelesen werden.`);
  }
  return doc;
}

function toolhubVorlageXmlSchreiben(zip, pfad, doc) {
  let xml = new XMLSerializer().serializeToString(doc);
  // Der Serializer lässt die XML-Deklaration weg; Word und Writer erwarten sie.
  if (!xml.startsWith('<?xml')) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
  zip.file(pfad, xml);
}

// Nächstgelegener Vorfahre mit diesem Namen (auch das Element selbst)
function toolhubVorlageVorfahre(knoten, ns, namen) {
  let aktuell = knoten;
  while (aktuell && aktuell.nodeType === 1) {
    if (aktuell.namespaceURI === ns && namen.includes(aktuell.localName)) return aktuell;
    aktuell = aktuell.parentNode;
  }
  return null;
}

/*
 * Alle Elemente mit einem dieser Namen unterhalb der angegebenen Wurzeln, in
 * Dokumentreihenfolge (die Wurzel selbst zählt mit). Die Reihenfolge ist wichtig,
 * damit Felder in der Reihenfolge des Dokuments erscheinen.
 */
function toolhubVorlageElemente(wurzeln, ns, namen) {
  const gesucht = Array.isArray(namen) ? namen : [namen];
  const gefunden = [];

  function gehe(knoten) {
    if (!knoten || knoten.nodeType !== 1) return;
    if (knoten.namespaceURI === ns && gesucht.includes(knoten.localName)) gefunden.push(knoten);
    Array.from(knoten.childNodes).forEach(gehe);
  }

  wurzeln.forEach(gehe);
  return gefunden;
}

// ---------------------------------------------------------------------------
// Gemeinsame Basis der beiden Formate
// ---------------------------------------------------------------------------

class ToolhubVorlage {
  constructor(datei, puffer) {
    this.datei = datei;
    this.puffer = puffer;
    this.felder = [];
    this.kopfFelder = [];
    // Namen, die aus einem formateigenen Seriendruckfeld stammen und nicht aus {{…}}
    this.formatFelder = [];
  }

  // Alle Feldnamen der Vorlage (Fließtext zuerst, dann nur in Kopf-/Fußzeilen benutzte)
  get alleFelder() {
    return this.felder.concat(this.kopfFelder.filter((name) => !this.felder.includes(name)));
  }

  /*
   * Feldnamen aller Absätze einsammeln (Reihenfolge des ersten Auftretens).
   * Neben den {{…}} zählen die formateigenen Seriendruckfelder mit, die
   * _formatFelder() der jeweiligen Klasse meldet.
   */
  _sammleFelder(absaetze) {
    const namen = [];
    const merke = (name) => {
      if (name && !namen.includes(name)) namen.push(name);
    };

    absaetze.forEach((absatz) => {
      const text = this._stuecke(absatz).map((stueck) => stueck.lies() || '').join('');
      toolhubVorlageFelder(text).forEach(merke);
      this._formatFelder(absatz).forEach((name) => {
        merke(name);
        if (!this.formatFelder.includes(name)) this.formatFelder.push(name);
      });
    });
    return namen;
  }

  // Felder in allen Absätzen unterhalb der Wurzeln ersetzen
  _ersetze(wurzeln, werte, optionen) {
    this._absaetze(wurzeln).forEach((absatz) => {
      // Zuerst die formateigenen Felder – sie hinterlassen gewöhnlichen Text,
      // der anschließend wie jeder andere auf {{…}} geprüft wird.
      this._ersetzeFormatFelder(absatz, werte, optionen);
      toolhubVorlageErsetzeStuecke(this._stuecke(absatz), werte, optionen);
    });
  }

  // Seriendruckfelder des Formats (Word: MERGEFIELD, Writer: Datenbankfeld)
  _formatFelder() {
    return [];
  }

  _ersetzeFormatFelder() {
  }

  /*
   * Reiner Text eines Absatzes – anders als _stuecke() zählen hier auch
   * Zeilenumbrüche und Tabulatoren mit, damit die Vorschau dem Dokument gleicht.
   */
  _absatzText(absatz) {
    let text = '';
    const gehe = (element) => {
      Array.from(element.childNodes).forEach((knoten) => {
        const eigen = this._knotenText(knoten);
        if (eigen !== null) text += eigen;
        else if (knoten.nodeType === 1 && !this._istAbsatz(knoten)) gehe(knoten);
      });
    };
    gehe(absatz);
    return text;
  }

  // Text aller Absätze unterhalb der Wurzeln (für die Vorschau)
  _text(wurzeln) {
    return this._absaetze(wurzeln).map((absatz) => this._absatzText(absatz)).join('\n');
  }
}

// ---------------------------------------------------------------------------
// Word-Feldfunktionen (MERGEFIELD, IF …)
//
// Word speichert ein Feld als Folge von Runs im selben Absatz:
//
//   fldChar begin | instrText " MERGEFIELD Note " | fldChar separate
//                 | Ergebnis der letzten Zusammenführung | fldChar end
//
// Die Anweisung kann über mehrere instrText verteilt sein und selbst Felder
// enthalten – so entstehen die verschachtelten IF-Konstruktionen, mit denen in
// Word-Vorlagen üblicherweise Ankreuzfelder gebaut werden:
//
//   IF { MERGEFIELD Note } = "5+" "X" { IF { MERGEFIELD Note } = "5" "X" "" }
//
// Deshalb wird der Feldbaum aufgebaut und rekursiv ausgewertet. Felder, die
// nicht zum Seriendruck gehören (DATE, PAGE …), bleiben unangetastet; Word
// aktualisiert sie beim Öffnen selbst.
// ---------------------------------------------------------------------------

// Runs eines Absatzes, ohne die tiefer liegender Absätze (Textfelder, Tabellen)
function toolhubVorlageDocxRuns(absatz) {
  return Array.from(absatz.getElementsByTagNameNS(TOOLHUB_NS.w, 'r'))
    .filter((run) => toolhubVorlageVorfahre(run.parentNode, TOOLHUB_NS.w, ['p']) === absatz);
}

function toolhubVorlageDocxFldChar(run) {
  const fldChar = run.getElementsByTagNameNS(TOOLHUB_NS.w, 'fldChar')[0];
  return fldChar ? fldChar.getAttributeNS(TOOLHUB_NS.w, 'fldCharType') : null;
}

// Text eines Runs – Anweisungstext und sichtbarer Text zählen gleichermaßen
function toolhubVorlageDocxRunText(run) {
  let text = '';
  ['instrText', 't'].forEach((name) => {
    Array.from(run.getElementsByTagNameNS(TOOLHUB_NS.w, name)).forEach((el) => {
      text += el.textContent || '';
    });
  });
  return text;
}

/*
 * Baut den Feldbaum eines Absatzes.
 *
 * Ein Feld ist { von, bis, anweisung, ergebnis }; `von`/`bis` sind Indizes in
 * `runs`, `anweisung` und `ergebnis` enthalten Teile der Form
 * { art: 'text', wert } bzw. { art: 'feld', feld } (verschachteltes Feld).
 *
 * Zurückgegeben werden nur die Felder der obersten Ebene. Felder ohne
 * passendes Ende (in Word möglich, wenn sie über Absätze reichen) entfallen.
 */
function toolhubVorlageDocxFeldbaum(runs) {
  const stapel = [];
  const oben = [];

  const ziel = (feld) => (feld.trenner < 0 ? feld.anweisung : feld.ergebnis);

  runs.forEach((run, index) => {
    const typ = toolhubVorlageDocxFldChar(run);
    const aktuell = stapel[stapel.length - 1];

    if (typ === 'begin') {
      const feld = { von: index, bis: -1, trenner: -1, anweisung: [], ergebnis: [] };
      if (aktuell) ziel(aktuell).push({ art: 'feld', feld });
      else oben.push(feld);
      stapel.push(feld);
      return;
    }
    if (typ === 'separate') {
      if (aktuell) aktuell.trenner = index;
      return;
    }
    if (typ === 'end') {
      const feld = stapel.pop();
      if (feld) feld.bis = index;
      return;
    }
    // Gewöhnlicher Run: nur innerhalb eines Feldes von Belang
    if (aktuell) ziel(aktuell).push({ art: 'text', wert: toolhubVorlageDocxRunText(run), run });
  });

  return oben.filter((feld) => feld.bis >= 0);
}

/*
 * Zerlegt eine Feldanweisung in Wörter. Anführungszeichen fassen zusammen,
 * verschachtelte Felder steuern ihr Ergebnis als Wort bei – so wird aus
 * `{ MERGEFIELD Note } = "5+" "X"` die Folge ['5+', '=', '5+', 'X'].
 */
function toolhubVorlageDocxWoerter(teile, werte, optionen) {
  const woerter = [];
  let aktuell = null;
  let inAnfuehrung = false;

  const anhaengen = (text) => { aktuell = (aktuell === null ? '' : aktuell) + text; };
  const abschliessen = () => {
    if (aktuell !== null) woerter.push(aktuell);
    aktuell = null;
  };

  teile.forEach((teil) => {
    if (teil.art === 'feld') {
      const wert = toolhubVorlageDocxFeldwert(teil.feld, werte, optionen);
      anhaengen(wert === null ? '' : wert);
      return;
    }
    for (const zeichen of teil.wert) {
      if (inAnfuehrung) {
        if (zeichen === '"') inAnfuehrung = false;
        else anhaengen(zeichen);
      } else if (zeichen === '"') {
        inAnfuehrung = true;
        anhaengen('');
      } else if (/\s/.test(zeichen)) {
        abschliessen();
      } else {
        anhaengen(zeichen);
      }
    }
  });

  abschliessen();
  return woerter;
}

// Zahl oder null – "5+" ist bewusst keine Zahl, sonst verglichen IF-Felder falsch
function toolhubVorlageZahl(wert) {
  const text = String(wert).trim().replace(',', '.');
  return /^[+-]?\d+(\.\d+)?$/.test(text) ? parseFloat(text) : null;
}

/*
 * Vergleich einer IF-Bedingung. Zwei Zahlen werden numerisch verglichen, sonst
 * wird die Zeichenkette ohne Rücksicht auf Groß- und Kleinschreibung geprüft;
 * bei = und <> sind die Platzhalter * und ? erlaubt (wie in Word).
 * null bedeutet: nicht auswertbar.
 */
function toolhubVorlageVergleich(links, operator, rechts) {
  const a = toolhubVorlageZahl(links);
  const b = toolhubVorlageZahl(rechts);

  if (a !== null && b !== null) {
    switch (operator) {
      case '=': return a === b;
      case '<>': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      default: return null;
    }
  }

  const x = String(links).trim().toLowerCase();
  const y = String(rechts).trim().toLowerCase();

  if (operator === '=' || operator === '<>') {
    let gleich;
    if (/[*?]/.test(y)) {
      const muster = new RegExp('^' + y.replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      gleich = muster.test(x);
    } else {
      gleich = x === y;
    }
    return operator === '=' ? gleich : !gleich;
  }

  switch (operator) {
    case '>': return x > y;
    case '<': return x < y;
    case '>=': return x >= y;
    case '<=': return x <= y;
    default: return null;
  }
}

/*
 * Wert eines Feldes; null heißt "nicht zuständig" – das Feld bleibt dann
 * unverändert im Dokument stehen.
 */
function toolhubVorlageDocxFeldwert(feld, werte, optionen) {
  const woerter = toolhubVorlageDocxWoerter(feld.anweisung, werte, optionen);
  if (woerter.length === 0) return null;
  const art = woerter[0].toUpperCase();

  if (art === 'MERGEFIELD') {
    const name = woerter[1];
    if (!name) return null;
    if (Object.prototype.hasOwnProperty.call(werte, name)) return toolhubVorlageWert(werte[name]);
    return optionen && optionen.behaltUnbekannte ? `{{${name}}}` : '';
  }

  if (art === 'IF') {
    const ergebnis = toolhubVorlageVergleich(woerter[1] ?? '', woerter[2], woerter[3] ?? '');
    if (ergebnis === null) return null;
    return (ergebnis ? woerter[4] : woerter[5]) ?? '';
  }

  return null;
}

// Feldnamen eines Feldbaums (auch aus verschachtelten Feldern), für die Zuordnung
function toolhubVorlageDocxFeldnamen(felder, namen = []) {
  felder.forEach((feld) => {
    const text = feld.anweisung
      .map((teil) => (teil.art === 'text' ? teil.wert : ' '))
      .join('');
    const treffer = text.match(/^\s*MERGEFIELD\s+(?:"([^"]+)"|(\S+))/i);
    if (treffer) {
      const name = treffer[1] || treffer[2];
      if (!namen.includes(name)) namen.push(name);
    }
    feld.anweisung.concat(feld.ergebnis).forEach((teil) => {
      if (teil.art === 'feld') toolhubVorlageDocxFeldnamen([teil.feld], namen);
    });
  });
  return namen;
}

// Name eines einfachen Feldes <w:fldSimple w:instr=" MERGEFIELD Name ">
function toolhubVorlageDocxEinfachName(element) {
  const anweisung = element.getAttributeNS(TOOLHUB_NS.w, 'instr') || '';
  const treffer = anweisung.match(/^\s*MERGEFIELD\s+(?:"([^"]+)"|(\S+))/i);
  return treffer ? (treffer[1] || treffer[2]) : null;
}

// ---------------------------------------------------------------------------
// DOCX (Word)
// ---------------------------------------------------------------------------

class ToolhubVorlageDocx extends ToolhubVorlage {
  constructor(datei, puffer) {
    super(datei, puffer);
    this.format = 'docx';
    this.endung = '.docx';
    this.mimetyp = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  static async lade(datei, puffer) {
    const vorlage = new ToolhubVorlageDocx(datei, puffer);
    const zip = await JSZip.loadAsync(puffer);
    const doc = await toolhubVorlageXmlLesen(zip, 'word/document.xml');
    if (!doc) throw new Error(`"${datei.name}" ist keine gültige DOCX-Datei (word/document.xml fehlt).`);

    vorlage.felder = vorlage._sammleFelder(vorlage._absaetze([doc.documentElement]));

    const kopfNamen = [];
    for (const pfad of ToolhubVorlageDocx._kopfDateien(zip)) {
      const kopfDoc = await toolhubVorlageXmlLesen(zip, pfad);
      if (!kopfDoc) continue;
      vorlage._sammleFelder(vorlage._absaetze([kopfDoc.documentElement])).forEach((name) => {
        if (!kopfNamen.includes(name)) kopfNamen.push(name);
      });
    }
    vorlage.kopfFelder = kopfNamen;
    return vorlage;
  }

  static _kopfDateien(zip) {
    return Object.keys(zip.files).filter((pfad) => /^word\/(header|footer)\d*\.xml$/.test(pfad));
  }

  _absaetze(wurzeln) {
    return toolhubVorlageElemente(wurzeln, TOOLHUB_NS.w, 'p');
  }

  _istAbsatz(element) {
    return element.namespaceURI === TOOLHUB_NS.w && element.localName === 'p';
  }

  // null = kein eigener Textbeitrag, also weiter in die Tiefe gehen
  _knotenText(knoten) {
    if (knoten.nodeType !== 1 || knoten.namespaceURI !== TOOLHUB_NS.w) return null;
    if (knoten.localName === 't') return knoten.textContent;
    if (knoten.localName === 'br') return '\n';
    if (knoten.localName === 'tab') return '\t';
    return null;
  }

  /*
   * Textstücke eines Absatzes sind seine <w:t>. Absätze können verschachtelt sein
   * (Textfelder, Tabellen in Tabellen) – Stücke tieferer Absätze bleiben deshalb
   * ihrem eigenen Absatz vorbehalten.
   */
  _stuecke(absatz) {
    const stuecke = [];
    Array.from(absatz.getElementsByTagNameNS(TOOLHUB_NS.w, 't')).forEach((t) => {
      if (toolhubVorlageVorfahre(t.parentNode, TOOLHUB_NS.w, ['p']) !== absatz) return;
      stuecke.push({
        lies: () => t.textContent,
        schreibe: (text) => {
          t.textContent = text;
          // Ohne xml:space="preserve" verwirft Word führende und schließende Leerzeichen
          t.setAttributeNS(TOOLHUB_NS.xml, 'xml:space', 'preserve');
          ToolhubVorlageDocx._zeilenumbrueche(t);
        }
      });
    });
    return stuecke;
  }

  // Zeilenumbrüche im Wert werden zu <w:br/> zwischen mehreren <w:t> desselben Runs
  static _zeilenumbrueche(t) {
    const text = t.textContent;
    if (!text.includes('\n')) return;

    const teile = text.split('\n');
    const doc = t.ownerDocument;
    const eltern = t.parentNode;
    const dahinter = t.nextSibling;

    t.textContent = teile[0];
    for (let i = 1; i < teile.length; i++) {
      eltern.insertBefore(doc.createElementNS(TOOLHUB_NS.w, 'w:br'), dahinter);
      const weiterer = doc.createElementNS(TOOLHUB_NS.w, 'w:t');
      weiterer.setAttributeNS(TOOLHUB_NS.xml, 'xml:space', 'preserve');
      weiterer.textContent = teile[i];
      eltern.insertBefore(weiterer, dahinter);
    }
  }

  static _seitenumbruch(doc) {
    const p = doc.createElementNS(TOOLHUB_NS.w, 'w:p');
    const r = doc.createElementNS(TOOLHUB_NS.w, 'w:r');
    const br = doc.createElementNS(TOOLHUB_NS.w, 'w:br');
    br.setAttributeNS(TOOLHUB_NS.w, 'w:type', 'page');
    r.appendChild(br);
    p.appendChild(r);
    return p;
  }

  // ----- Word-eigene Seriendruckfelder -----

  // Feldnamen aus MERGEFIELD-Feldern eines Absatzes (auch in IF-Bedingungen)
  _formatFelder(absatz) {
    const namen = toolhubVorlageDocxFeldnamen(
      toolhubVorlageDocxFeldbaum(toolhubVorlageDocxRuns(absatz)));

    Array.from(absatz.getElementsByTagNameNS(TOOLHUB_NS.w, 'fldSimple')).forEach((element) => {
      if (toolhubVorlageVorfahre(element.parentNode, TOOLHUB_NS.w, ['p']) !== absatz) return;
      const name = toolhubVorlageDocxEinfachName(element);
      if (name && !namen.includes(name)) namen.push(name);
    });

    return namen;
  }

  /*
   * Ersetzt die Word-Felder eines Absatzes durch ihr Ergebnis. Die
   * Runs eines ausgewerteten Feldes verschwinden dabei samt Anweisung;
   * an ihre Stelle tritt ein einzelner Run mit dem Wert.
   */
  _ersetzeFormatFelder(absatz, werte, optionen) {
    // Einfache Felder zuerst – sie können keine anderen Felder enthalten
    Array.from(absatz.getElementsByTagNameNS(TOOLHUB_NS.w, 'fldSimple')).forEach((element) => {
      if (toolhubVorlageVorfahre(element.parentNode, TOOLHUB_NS.w, ['p']) !== absatz) return;
      const name = toolhubVorlageDocxEinfachName(element);
      if (!name) return;

      const vorhanden = Object.prototype.hasOwnProperty.call(werte, name);
      const wert = vorhanden
        ? toolhubVorlageWert(werte[name])
        : (optionen && optionen.behaltUnbekannte ? `{{${name}}}` : '');

      const quelle = element.getElementsByTagNameNS(TOOLHUB_NS.w, 'r')[0];
      element.parentNode.replaceChild(ToolhubVorlageDocx._wertRun(element.ownerDocument, wert, quelle), element);
    });

    const runs = toolhubVorlageDocxRuns(absatz);
    const felder = toolhubVorlageDocxFeldbaum(runs);

    // Von hinten nach vorn, damit die Indizes der übrigen Felder gültig bleiben
    felder.slice().reverse().forEach((feld) => {
      const wert = toolhubVorlageDocxFeldwert(feld, werte, optionen);
      if (wert === null) return; // fremdes Feld (DATE, PAGE …) unangetastet lassen

      const betroffen = runs.slice(feld.von, feld.bis + 1);
      // Formatierung des zuletzt angezeigten Ergebnisses übernehmen, sonst die des Feldanfangs
      const quelle = (feld.trenner >= 0 ? runs.slice(feld.trenner + 1, feld.bis) : [])
        .find((run) => run.getElementsByTagNameNS(TOOLHUB_NS.w, 'rPr')[0]) || betroffen[0];

      const neu = ToolhubVorlageDocx._wertRun(absatz.ownerDocument, wert, quelle);
      betroffen[0].parentNode.insertBefore(neu, betroffen[0]);
      betroffen.forEach((run) => run.parentNode.removeChild(run));
    });
  }

  // Run mit dem Feldwert, formatiert wie der Run, den er ersetzt
  static _wertRun(doc, wert, quelle) {
    const run = doc.createElementNS(TOOLHUB_NS.w, 'w:r');

    const rPr = quelle && quelle.getElementsByTagNameNS(TOOLHUB_NS.w, 'rPr')[0];
    if (rPr) run.appendChild(rPr.cloneNode(true));

    const t = doc.createElementNS(TOOLHUB_NS.w, 'w:t');
    t.setAttributeNS(TOOLHUB_NS.xml, 'xml:space', 'preserve');
    t.textContent = wert;
    run.appendChild(t);
    ToolhubVorlageDocx._zeilenumbrueche(t);

    return run;
  }

  /*
   * Baut den Inhalt des Dokuments: je Datensatz eine Kopie der Vorlage, dazwischen ein
   * Seitenumbruch. Das abschließende <w:sectPr> (Seitenformat) muss das letzte Element
   * des Bodys bleiben und wird deshalb erst am Ende wieder angehängt.
   */
  _baueBody(doc, saetze, optionen) {
    const body = doc.getElementsByTagNameNS(TOOLHUB_NS.w, 'body')[0];
    if (!body) throw new Error('Die DOCX-Vorlage enthält keinen Textkörper.');

    const kinder = Array.from(body.childNodes);
    const letztes = kinder[kinder.length - 1];
    const sectPr = letztes && letztes.nodeType === 1 && letztes.namespaceURI === TOOLHUB_NS.w &&
      letztes.localName === 'sectPr' ? letztes : null;
    const vorlageKnoten = kinder.filter((knoten) => knoten !== sectPr);

    while (body.firstChild) body.removeChild(body.firstChild);

    saetze.forEach((werte, index) => {
      if (index > 0) body.appendChild(ToolhubVorlageDocx._seitenumbruch(doc));
      const kopien = vorlageKnoten.map((knoten) => knoten.cloneNode(true));
      kopien.forEach((knoten) => body.appendChild(knoten));
      this._ersetze(kopien, werte, optionen);
    });

    if (sectPr) body.appendChild(sectPr);
    return body;
  }

  async erzeuge(saetze, optionen = {}) {
    const zip = await JSZip.loadAsync(this.puffer);
    const doc = await toolhubVorlageXmlLesen(zip, 'word/document.xml');
    this._baueBody(doc, saetze, optionen);
    toolhubVorlageXmlSchreiben(zip, 'word/document.xml', doc);

    // Kopf- und Fußzeilen gelten für das ganze Dokument – dort zählt der erste Datensatz
    for (const pfad of ToolhubVorlageDocx._kopfDateien(zip)) {
      const kopfDoc = await toolhubVorlageXmlLesen(zip, pfad);
      if (!kopfDoc) continue;
      this._ersetze([kopfDoc.documentElement], saetze[0] || {}, optionen);
      toolhubVorlageXmlSchreiben(zip, pfad, kopfDoc);
    }

    await ToolhubVorlageDocx._loeseDatenquelle(zip);
    return zip.generateAsync({ type: 'blob', mimeType: this.mimetyp });
  }

  /*
   * Trennt das Ergebnis von der Datenquelle der Vorlage. Eine in Word
   * eingerichtete Serienbriefvorlage merkt sich in settings.xml die Datei, aus
   * der zusammengeführt wurde; ohne diesen Schritt fragt Word beim Öffnen jedes
   * erzeugten Dokuments danach – und der Pfad zur Quelldatei bliebe darin stehen.
   */
  static async _loeseDatenquelle(zip) {
    const einstellungen = await toolhubVorlageXmlLesen(zip, 'word/settings.xml');
    if (!einstellungen) return;

    const mailMerge = einstellungen.getElementsByTagNameNS(TOOLHUB_NS.w, 'mailMerge')[0];
    if (!mailMerge) return;
    mailMerge.parentNode.removeChild(mailMerge);
    toolhubVorlageXmlSchreiben(zip, 'word/settings.xml', einstellungen);

    const bezuege = await toolhubVorlageXmlLesen(zip, 'word/_rels/settings.xml.rels');
    if (!bezuege) return;
    Array.from(bezuege.getElementsByTagName('Relationship'))
      .filter((bezug) => (bezug.getAttribute('Type') || '').endsWith('/mailMergeSource'))
      .forEach((bezug) => bezug.parentNode.removeChild(bezug));
    toolhubVorlageXmlSchreiben(zip, 'word/_rels/settings.xml.rels', bezuege);
  }

  async vorschauText(satz, optionen = {}) {
    const zip = await JSZip.loadAsync(this.puffer);
    const doc = await toolhubVorlageXmlLesen(zip, 'word/document.xml');
    return this._text([this._baueBody(doc, [satz], optionen)]);
  }
}

// ---------------------------------------------------------------------------
// ODT (LibreOffice/OpenOffice Writer)
// ---------------------------------------------------------------------------

class ToolhubVorlageOdt extends ToolhubVorlage {
  constructor(datei, puffer) {
    super(datei, puffer);
    this.format = 'odt';
    this.endung = '.odt';
    this.mimetyp = 'application/vnd.oasis.opendocument.text';
  }

  static async lade(datei, puffer) {
    const vorlage = new ToolhubVorlageOdt(datei, puffer);
    const zip = await JSZip.loadAsync(puffer);
    const doc = await toolhubVorlageXmlLesen(zip, 'content.xml');
    if (!doc) throw new Error(`"${datei.name}" ist keine gültige ODT-Datei (content.xml fehlt).`);

    vorlage.felder = vorlage._sammleFelder(vorlage._absaetze([doc.documentElement]));

    // Kopf- und Fußzeilen stehen in den Seitenvorlagen der styles.xml
    const stile = await toolhubVorlageXmlLesen(zip, 'styles.xml');
    vorlage.kopfFelder = stile
      ? vorlage._sammleFelder(vorlage._absaetze([stile.documentElement]))
      : [];
    return vorlage;
  }

  _absaetze(wurzeln) {
    return toolhubVorlageElemente(wurzeln, TOOLHUB_NS.text, ['p', 'h']);
  }

  _istAbsatz(element) {
    return element.namespaceURI === TOOLHUB_NS.text &&
      (element.localName === 'p' || element.localName === 'h');
  }

  // null = kein eigener Textbeitrag, also weiter in die Tiefe gehen
  _knotenText(knoten) {
    if (knoten.nodeType === 3) return knoten.nodeValue;
    if (knoten.nodeType !== 1 || knoten.namespaceURI !== TOOLHUB_NS.text) return null;
    if (knoten.localName === 'line-break') return '\n';
    if (knoten.localName === 'tab') return '\t';
    // <text:s> steht für mehrere aufeinanderfolgende Leerzeichen
    if (knoten.localName === 's') {
      return ' '.repeat(Number(knoten.getAttributeNS(TOOLHUB_NS.text, 'c')) || 1);
    }
    return null;
  }

  /*
   * Textstücke eines Absatzes sind seine Textknoten – auch die in <text:span>, denn
   * Writer zerlegt formatierte Stellen in Spans. Verschachtelte Absätze (z. B. in
   * Rahmen) bleiben ausgespart, sie werden für sich behandelt.
   */
  _stuecke(absatz) {
    const stuecke = [];
    const sammle = (element) => {
      Array.from(element.childNodes).forEach((knoten) => {
        if (knoten.nodeType === 3) {
          stuecke.push({
            lies: () => knoten.nodeValue,
            schreibe: (text) => {
              knoten.nodeValue = text;
              ToolhubVorlageOdt._zeilenumbrueche(knoten);
            }
          });
        } else if (knoten.nodeType === 1 && !this._istAbsatz(knoten)) {
          sammle(knoten);
        }
      });
    };
    sammle(absatz);
    return stuecke;
  }

  // ----- Writer-eigene Seriendruckfelder -----

  // Datenbankfelder eines Absatzes: <text:database-display text:column-name="Note"/>
  _datenbankFelder(absatz) {
    return Array.from(absatz.getElementsByTagNameNS(TOOLHUB_NS.text, 'database-display'))
      .filter((el) => toolhubVorlageVorfahre(el.parentNode, TOOLHUB_NS.text, ['p', 'h']) === absatz);
  }

  _formatFelder(absatz) {
    return this._datenbankFelder(absatz)
      .map((el) => el.getAttributeNS(TOOLHUB_NS.text, 'column-name'))
      .filter(Boolean);
  }

  _ersetzeFormatFelder(absatz, werte, optionen) {
    this._datenbankFelder(absatz).forEach((el) => {
      const name = el.getAttributeNS(TOOLHUB_NS.text, 'column-name');
      if (!name) return;

      const vorhanden = Object.prototype.hasOwnProperty.call(werte, name);
      const wert = vorhanden
        ? toolhubVorlageWert(werte[name])
        : (optionen && optionen.behaltUnbekannte ? `{{${name}}}` : '');

      const knoten = el.ownerDocument.createTextNode(wert);
      el.parentNode.replaceChild(knoten, el);
      ToolhubVorlageOdt._zeilenumbrueche(knoten);
    });
  }

  // Zeilenumbrüche im Wert werden zu <text:line-break/>
  static _zeilenumbrueche(knoten) {
    const text = knoten.nodeValue;
    if (!text.includes('\n')) return;

    const teile = text.split('\n');
    const doc = knoten.ownerDocument;
    const eltern = knoten.parentNode;
    const dahinter = knoten.nextSibling;

    knoten.nodeValue = teile[0];
    for (let i = 1; i < teile.length; i++) {
      eltern.insertBefore(doc.createElementNS(TOOLHUB_NS.text, 'text:line-break'), dahinter);
      eltern.insertBefore(doc.createTextNode(teile[i]), dahinter);
    }
  }

  /*
   * ODT kennt keinen Seitenumbruch als eigenes Element: Er hängt an einer Absatzvorlage
   * mit fo:break-before="page". Die wird einmal in die automatischen Vorlagen gelegt.
   */
  static _umbruchStilAnlegen(doc) {
    let auto = doc.getElementsByTagNameNS(TOOLHUB_NS.office, 'automatic-styles')[0];
    if (!auto) {
      auto = doc.createElementNS(TOOLHUB_NS.office, 'office:automatic-styles');
      const body = doc.getElementsByTagNameNS(TOOLHUB_NS.office, 'body')[0];
      doc.documentElement.insertBefore(auto, body || null);
    }

    const vorhanden = Array.from(auto.getElementsByTagNameNS(TOOLHUB_NS.style, 'style'))
      .some((stil) => stil.getAttributeNS(TOOLHUB_NS.style, 'name') === TOOLHUB_ODT_UMBRUCH_STIL);
    if (vorhanden) return;

    const stil = doc.createElementNS(TOOLHUB_NS.style, 'style:style');
    stil.setAttributeNS(TOOLHUB_NS.style, 'style:name', TOOLHUB_ODT_UMBRUCH_STIL);
    stil.setAttributeNS(TOOLHUB_NS.style, 'style:family', 'paragraph');
    const eigenschaften = doc.createElementNS(TOOLHUB_NS.style, 'style:paragraph-properties');
    eigenschaften.setAttributeNS(TOOLHUB_NS.fo, 'fo:break-before', 'page');
    stil.appendChild(eigenschaften);
    auto.appendChild(stil);
  }

  static _seitenumbruch(doc) {
    const p = doc.createElementNS(TOOLHUB_NS.text, 'text:p');
    p.setAttributeNS(TOOLHUB_NS.text, 'text:style-name', TOOLHUB_ODT_UMBRUCH_STIL);
    return p;
  }

  /*
   * Baut den Inhalt: je Datensatz eine Kopie der Vorlage, dazwischen ein
   * Seitenumbruch. Die Deklarationen am Anfang des Textkörpers (Nummernkreise,
   * Variablen) dürfen nur einmal vorkommen und bleiben deshalb unangetastet.
   */
  _baueText(doc, saetze, optionen) {
    const text = doc.getElementsByTagNameNS(TOOLHUB_NS.office, 'text')[0];
    if (!text) throw new Error('Die ODT-Vorlage enthält keinen Textkörper.');

    const deklarationen = ['sequence-decls', 'variable-decls', 'user-field-decls'];
    const kinder = Array.from(text.childNodes);
    const kopf = kinder.filter((knoten) => knoten.nodeType === 1 &&
      knoten.namespaceURI === TOOLHUB_NS.text && deklarationen.includes(knoten.localName));
    const vorlageKnoten = kinder.filter((knoten) => !kopf.includes(knoten));

    while (text.firstChild) text.removeChild(text.firstChild);
    kopf.forEach((knoten) => text.appendChild(knoten));

    if (saetze.length > 1) ToolhubVorlageOdt._umbruchStilAnlegen(doc);

    saetze.forEach((werte, index) => {
      if (index > 0) text.appendChild(ToolhubVorlageOdt._seitenumbruch(doc));
      const kopien = vorlageKnoten.map((knoten) => knoten.cloneNode(true));
      kopien.forEach((knoten) => text.appendChild(knoten));
      this._ersetze(kopien, werte, optionen);
    });

    return text;
  }

  async erzeuge(saetze, optionen = {}) {
    const zip = await JSZip.loadAsync(this.puffer);
    const doc = await toolhubVorlageXmlLesen(zip, 'content.xml');
    this._baueText(doc, saetze, optionen);
    toolhubVorlageXmlSchreiben(zip, 'content.xml', doc);

    // Kopf- und Fußzeilen stehen in den Seitenvorlagen – dort zählt der erste Datensatz
    const stile = await toolhubVorlageXmlLesen(zip, 'styles.xml');
    if (stile) {
      this._ersetze([stile.documentElement], saetze[0] || {}, optionen);
      toolhubVorlageXmlSchreiben(zip, 'styles.xml', stile);
    }

    // "mimetype" muss der erste Eintrag des Archivs bleiben und unkomprimiert sein
    const mimetype = zip.file('mimetype');
    if (mimetype) zip.file('mimetype', await mimetype.async('string'), { compression: 'STORE' });

    return zip.generateAsync({ type: 'blob', mimeType: this.mimetyp });
  }

  async vorschauText(satz, optionen = {}) {
    const zip = await JSZip.loadAsync(this.puffer);
    const doc = await toolhubVorlageXmlLesen(zip, 'content.xml');
    return this._text([this._baueText(doc, [satz], optionen)]);
  }
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

/*
 * Liest eine Vorlage ein. Das Format wird an der Dateiendung erkannt, weil DOCX und
 * ODT beide ZIP-Archive sind und sich nicht an den ersten Bytes unterscheiden lassen.
 */
async function toolhubVorlageLaden(datei) {
  const name = (datei.name || '').toLowerCase();
  const puffer = await toolhubReadArrayBuffer(datei);

  if (name.endsWith('.docx')) return ToolhubVorlageDocx.lade(datei, puffer);
  if (name.endsWith('.odt')) return ToolhubVorlageOdt.lade(datei, puffer);

  throw new Error(`"${datei.name}": Als Vorlage werden ${TOOLHUB_VORLAGE_ENDUNGEN.join(' und ')} unterstützt.`);
}
