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
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'
};

// Name der Absatzvorlage, die den Seitenumbruch zwischen zwei Datensätzen erzeugt (ODT)
const TOOLHUB_ODT_UMBRUCH_STIL = 'ToolhubSeitenumbruch';

// Name der Zeichenvorlage für die feste Schriftgröße der Feldwerte (ODT)
const TOOLHUB_ODT_SCHRIFT_STIL = 'ToolhubSchrift';

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
 * Jedes Stück erhält beim Zurückschreiben eine Folge von Abschnitten
 *   { text, istFeld }
 * istFeld markiert den Teil, der aus einem Feld stammt – nur dieser bekommt eine
 * abweichende Schriftgröße (siehe toolhubVorlageGroesseFn), der umgebende Text
 * behält seine.
 *
 * Optionen (alle optional):
 *   behaltUnbekannte      nicht zugeordnete Felder als {{Feld}} stehen lassen
 *   schriftgroesse        feste Punktgröße für alle Feldwerte
 *   autoSchrift           Objekt für die automatische Verkleinerung langer Werte
 *   umbruecheZuLeerzeichen manuelle Zeilenumbrüche im Feldwert zu Leerzeichen machen
 *
 * stuecke: [{ lies(): string, schreibe(abschnitte, optionen): void }]
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
      if (b > a) ausgabe[i].push({ text: teil.slice(a - start[i], b - start[i]), istFeld: false });
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
    const wert = bekannt
      ? toolhubVorlageUmbrueche(toolhubVorlageWert(werte[name]), optionen)
      : (behalten ? treffer[0] : '');

    // Der Wert übernimmt die Formatierung der Stelle, an der das Feld beginnt
    ausgabe[stueckAn(treffer.index)].push({ text: wert, istFeld: bekannt });
    gelesen = treffer.index + treffer[0].length;
    ersetzt = true;
  }

  if (!ersetzt) return false;

  uebernimm(gelesen, gesamt.length);
  stuecke.forEach((stueck, i) => stueck.schreibe(ausgabe[i], optionen));
  return true;
}

// Manuelle Zeilenumbrüche im Feldwert bei Bedarf zu einfachen Leerzeichen machen
function toolhubVorlageUmbrueche(text, optionen) {
  if (!optionen || !optionen.umbruecheZuLeerzeichen) return text;
  return text.replace(/\s*\n\s*/g, ' ');
}

/*
 * Kapazität einer Seite in „Zeichen · Punkt²" (siehe toolhubVorlageSeitengroesse):
 * Wie viel durch Felder hinzukommender Text auf eine Seite passt, bevor unter die
 * Startgröße verkleinert wird. KAP / Größe² ≈ Feld-Zeichen pro Seite bei dieser Größe
 * (hier ~740 Zeichen bei 11 pt). An den drei LEG-Beispielen kalibriert: Bei diesem
 * Wert bleiben Seiten mit wenig Feldtext bei der Startgröße, während die vollen
 * Kommentar-Seiten so weit verkleinert werden, dass sie ihre Seitenzahl halten.
 */
const TOOLHUB_SEITEN_KAPAZITAET = 90000;

// Effektive Zeichenlast: sichtbare Zeichen plus je Umbruch eine volle Zeile
function toolhubVorlageLast(text, zpz) {
  const zeichen = text.length;
  const umbrueche = (text.match(/\n/g) || []).length;
  return zeichen + umbrueche * zpz;
}

/*
 * Ob ein Wert die Schwellen für die automatische Anpassung erreicht.
 * Ohne aktive Schwellen gilt jeder (nicht leere) Wert als „lang".
 */
function toolhubVorlageUeberSchwelle(text, auto) {
  if (!auto.schwellenAktiv) return true;
  const umbrueche = (text.match(/\n/g) || []).length;
  return text.length >= auto.abZeichen || umbrueche >= auto.abUmbrueche;
}

/*
 * Bestimmt die einheitliche Schriftgröße einer Seite aus der bereits vorhandenen
 * statischen Textlast und der durch Felder hinzukommenden Last.
 *
 * Modell: Der vertikale Platzbedarf von Text wächst ungefähr mit Zeichenzahl · Größe²
 * (kleinere Schrift ⇒ mehr Zeichen je Zeile UND kleinere Zeilen). Eine Seite fasst
 * KAP „Zeichen·Punkt²". Der feste Text belegt davon `cStat · start²`; für die Felder
 * bleibt der Rest. Gesucht ist die größte Größe S mit
 *     cStat · start² + cFeld · S² ≤ KAP
 * begrenzt auf [Mindestgröße, Startgröße]. „Aggressiv einpassen" heißt: notfalls bis
 * zur Mindestgröße verkleinern, auch wenn es dann immer noch nicht ganz passt.
 *
 * Das bleibt eine Näherung – die echte Seitenaufteilung entsteht erst in Word/Writer.
 */
function toolhubVorlageSeitengroesse(cStat, cFeld, auto) {
  const start = auto.startGroesse;
  if (cFeld <= 0) return start; // keine (langen) Felder auf der Seite

  const frei = TOOLHUB_SEITEN_KAPAZITAET - cStat * start * start;
  if (frei <= 0) return auto.mindestGroesse;

  const roh = Math.sqrt(frei / cFeld);
  const begrenzt = Math.min(start, Math.max(auto.mindestGroesse, roh));
  return Math.round(begrenzt * 2) / 2; // auf halbe Punkte runden
}

/*
 * Liefert eine Funktion, die zu einem Feldwert die Schriftgröße (in Punkt) bestimmt –
 * oder null, wenn der Wert die Größe seiner Fundstelle behalten soll.
 *   feste Größe:   optionen.schriftgroesse (Zahl)
 *   automatisch:   optionen.autoSchrift + optionen.seitengroesse (je Seite gesetzt)
 *   sonst:         null (Größe der Fundstelle)
 *
 * Im Automatik-Modus bekommen alle (langen) Felder einer Seite dieselbe Größe
 * (optionen.seitengroesse). Werte unter den Schwellen behalten die Fundstellen-Größe
 * oder erhalten eine feste Größe (auto.kurzModus). Ohne gesetzte Seitengröße – etwa in
 * Kopf-/Fußzeilen – wird nicht angepasst.
 */
function toolhubVorlageGroesseFn(optionen) {
  if (optionen && optionen.autoSchrift) {
    const auto = optionen.autoSchrift;
    const seite = optionen.seitengroesse;
    return (text) => {
      if (seite == null) return null;
      if (!toolhubVorlageUeberSchwelle(text, auto)) {
        return auto.kurzModus === 'fest' ? auto.kurzGroesse : null;
      }
      return seite;
    };
  }
  const fest = optionen && optionen.schriftgroesse;
  if (typeof fest === 'number' && fest > 0) return () => fest;
  return () => null;
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

  // ----- Automatik: einheitliche Schriftgröße je Seite -----

  /*
   * Ersetzt die Felder seitenweise: Für jede Seite (Bereich zwischen den fest
   * gesetzten Seitenumbrüchen der Vorlage) wird aus dem vorhandenen Text und dem
   * hinzukommenden Feldtext eine gemeinsame Schriftgröße bestimmt und beim Ersetzen
   * gesetzt. So bekommen alle (langen) Felder einer Seite dieselbe Größe.
   */
  _ersetzeProSeite(wurzeln, werte, optionen) {
    this._seitenGruppen(wurzeln).forEach((gruppe) => {
      const seitengroesse = this._seitenGroesse(gruppe, werte, optionen.autoSchrift, optionen);
      this._ersetze(gruppe, werte, Object.assign({}, optionen, { seitengroesse }));
    });
  }

  /*
   * Bestimmt die Schriftgröße einer Seite. Sammelt die statische Textlast (fester
   * Vorlagentext) und die durch Felder hinzukommende Last der Seite und reicht sie an
   * toolhubVorlageSeitengroesse weiter. Nur Felder über der Schwelle zählen als „lang"
   * und werden verkleinert; kurze Felder tragen mit ihrer vollen Größe zur Belegung bei.
   */
  _seitenGroesse(wurzeln, werte, auto, optionen) {
    const zpz = auto.zeichenProZeile > 0 ? auto.zeichenProZeile : 60;
    let cStat = 0;   // fließender fester Text (in Zeichen-Last)
    let cLang = 0;   // Felder über der Schwelle (werden verkleinert)
    let cKurz = 0;   // Felder unter der Schwelle (bleiben groß)

    this._absaetze(wurzeln).forEach((absatz) => {
      const text = this._stuecke(absatz).map((stueck) => stueck.lies() || '').join('');
      let statisch = '';
      let letzte = 0;
      for (const treffer of text.matchAll(toolhubVorlageMuster())) {
        statisch += text.slice(letzte, treffer.index);
        letzte = treffer.index + treffer[0].length;
        const name = treffer[1];
        if (!name || !Object.prototype.hasOwnProperty.call(werte, name)) continue;
        const wert = toolhubVorlageUmbrueche(toolhubVorlageWert(werte[name]), optionen);
        const last = toolhubVorlageLast(wert, zpz);
        if (toolhubVorlageUeberSchwelle(wert, auto)) cLang += last;
        else cKurz += last;
      }
      statisch += text.slice(letzte);
      // Fester Text in Tabellenzellen bleibt außen vor: Zellen haben eine weitgehend
      // feste Höhe und packen den Text dicht, während fließender Text die Seite füllt.
      // Feldtext wird dagegen überall gezählt – auch Felder in Zellen wachsen mit.
      if (!this._istInTabelle(absatz)) {
        cStat += Math.max(zpz, toolhubVorlageLast(statisch, zpz));
      }
    });

    // Kurze Felder behalten ihre Größe -> ihre Last zählt wie fester Text zur Belegung
    return toolhubVorlageSeitengroesse(cStat + cKurz, cLang, auto);
  }

  // Ob ein Absatz in einer Tabelle steckt (Unterklassen überschreiben)
  _istInTabelle() { return false; }

  /*
   * Seiten einer Knotenmenge: Array von Knoten-Arrays, getrennt an den fest
   * gesetzten Seitenumbrüchen der Vorlage. Die Unterklassen liefern die Erkennung
   * über _umbruchVor()/_umbruchNach() für einen Block (Absatz/Tabelle).
   */
  _seitenGruppen(wurzeln) {
    const gruppen = [];
    let aktuell = [];
    wurzeln.forEach((knoten) => {
      if (knoten.nodeType === 1 && this._umbruchVor(knoten) && aktuell.length > 0) {
        gruppen.push(aktuell);
        aktuell = [];
      }
      aktuell.push(knoten);
      if (knoten.nodeType === 1 && this._umbruchNach(knoten)) {
        gruppen.push(aktuell);
        aktuell = [];
      }
    });
    if (aktuell.length > 0) gruppen.push(aktuell);
    return gruppen;
  }

  // Standard: keine Seitenumbrüche erkannt (Unterklassen überschreiben)
  _umbruchVor() { return false; }
  _umbruchNach() { return false; }
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
        schreibe: (abschnitte, optionen) => ToolhubVorlageDocx._schreibeStueck(t, abschnitte, optionen)
      });
    });
    return stuecke;
  }

  /*
   * Schreibt die Abschnitte in das <w:t> zurück. Ohne feste Schriftgröße bleibt
   * alles in einem Run – Verhalten wie bisher. Mit fester Größe bekommt nur der
   * Feldwert diese Größe: der Run wird an den Abschnittsgrenzen in mehrere Runs
   * geteilt (nur der einfache Fall „Run = rPr? + genau dieses w:t"; andernfalls
   * trägt der ganze Run die Größe, was praktisch nur Feldtext betrifft).
   */
  static _schreibeStueck(t, abschnitte, optionen) {
    const groesseFn = toolhubVorlageGroesseFn(optionen);
    // Größe je Feld-Abschnitt (null = Größe der Fundstelle behalten)
    const groessen = abschnitte.map((a) => (a.istFeld && a.text !== '') ? groesseFn(a.text) : null);
    const gesamt = abschnitte.map((a) => a.text).join('');

    const schlicht = () => {
      t.textContent = gesamt;
      // Ohne xml:space="preserve" verwirft Word führende und schließende Leerzeichen
      t.setAttributeNS(TOOLHUB_NS.xml, 'xml:space', 'preserve');
      ToolhubVorlageDocx._zeilenumbrueche(t);
    };

    if (!groessen.some((g) => g != null)) {
      schlicht();
      return;
    }

    const run = t.parentNode;
    const rPr = ToolhubVorlageDocx._direktesRPr(run);
    const andereKinder = Array.from(run.childNodes)
      .filter((k) => k.nodeType === 1 && !(k === rPr));
    const einfacherRun = andereKinder.length === 1 && andereKinder[0] === t;

    if (!einfacherRun) {
      // Zusammengesetzter Run (mehrere w:t, Umbrüche …): ganzen Run auf die
      // kleinste geforderte Größe skalieren – betrifft praktisch nur Feldtext
      schlicht();
      const kleinste = Math.min(...groessen.filter((g) => g != null));
      ToolhubVorlageDocx._setzeGroesse(ToolhubVorlageDocx._sichereRPr(run), kleinste);
      return;
    }

    const doc = t.ownerDocument;
    const eltern = run.parentNode;
    abschnitte.forEach((a, i) => {
      if (a.text === '') return;
      const neu = ToolhubVorlageDocx._wertRunAusRPr(doc, rPr, a.text, groessen[i]);
      eltern.insertBefore(neu, run);
    });
    eltern.removeChild(run);
  }

  static _direktesRPr(run) {
    return Array.from(run.childNodes).find((k) =>
      k.nodeType === 1 && k.namespaceURI === TOOLHUB_NS.w && k.localName === 'rPr') || null;
  }

  // Vorhandenes rPr des Runs oder ein neu angelegtes (als erstes Kind)
  static _sichereRPr(run) {
    let rPr = ToolhubVorlageDocx._direktesRPr(run);
    if (!rPr) {
      rPr = run.ownerDocument.createElementNS(TOOLHUB_NS.w, 'w:rPr');
      run.insertBefore(rPr, run.firstChild);
    }
    return rPr;
  }

  // Setzt Schriftgröße im rPr; Word speichert sie in halben Punkten (pt * 2)
  static _setzeGroesse(rPr, punkt) {
    const halbe = String(Math.round(punkt * 2));
    ['sz', 'szCs'].forEach((name) => {
      let el = Array.from(rPr.childNodes).find((k) =>
        k.nodeType === 1 && k.namespaceURI === TOOLHUB_NS.w && k.localName === name);
      if (!el) {
        el = rPr.ownerDocument.createElementNS(TOOLHUB_NS.w, 'w:' + name);
        rPr.appendChild(el);
      }
      el.setAttributeNS(TOOLHUB_NS.w, 'w:val', halbe);
    });
  }

  // Neuer Run mit dem Text; rPr wird von rPrQuelle geklont, optional mit fester Größe
  static _wertRunAusRPr(doc, rPrQuelle, text, punkt) {
    const run = doc.createElementNS(TOOLHUB_NS.w, 'w:r');
    if (rPrQuelle) run.appendChild(rPrQuelle.cloneNode(true));
    if (punkt) ToolhubVorlageDocx._setzeGroesse(ToolhubVorlageDocx._sichereRPr(run), punkt);

    const t = doc.createElementNS(TOOLHUB_NS.w, 'w:t');
    t.setAttributeNS(TOOLHUB_NS.xml, 'xml:space', 'preserve');
    t.textContent = text;
    run.appendChild(t);
    ToolhubVorlageDocx._zeilenumbrueche(t);
    return run;
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

  // Absatz mit w:pageBreakBefore -> beginnt eine neue Seite
  _umbruchVor(block) {
    if (!(block.namespaceURI === TOOLHUB_NS.w && block.localName === 'p')) return false;
    const pPr = block.getElementsByTagNameNS(TOOLHUB_NS.w, 'pPr')[0];
    return !!(pPr && pPr.getElementsByTagNameNS(TOOLHUB_NS.w, 'pageBreakBefore')[0]);
  }

  // Block enthält einen w:br w:type="page" -> danach beginnt eine neue Seite
  _umbruchNach(block) {
    return Array.from(block.getElementsByTagNameNS(TOOLHUB_NS.w, 'br'))
      .some((br) => br.getAttributeNS(TOOLHUB_NS.w, 'type') === 'page');
  }

  _istInTabelle(absatz) {
    return !!toolhubVorlageVorfahre(absatz.parentNode, TOOLHUB_NS.w, ['tbl']);
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
    const groesseFn = toolhubVorlageGroesseFn(optionen);

    // Einfache Felder zuerst – sie können keine anderen Felder enthalten
    Array.from(absatz.getElementsByTagNameNS(TOOLHUB_NS.w, 'fldSimple')).forEach((element) => {
      if (toolhubVorlageVorfahre(element.parentNode, TOOLHUB_NS.w, ['p']) !== absatz) return;
      const name = toolhubVorlageDocxEinfachName(element);
      if (!name) return;

      const vorhanden = Object.prototype.hasOwnProperty.call(werte, name);
      const wert = vorhanden
        ? toolhubVorlageUmbrueche(toolhubVorlageWert(werte[name]), optionen)
        : (optionen && optionen.behaltUnbekannte ? `{{${name}}}` : '');

      const quelle = element.getElementsByTagNameNS(TOOLHUB_NS.w, 'r')[0];
      const rPr = quelle && ToolhubVorlageDocx._direktesRPr(quelle);
      // Größe nur bestimmen, wenn der Wert wirklich aus dem Datensatz kommt
      element.parentNode.replaceChild(
        ToolhubVorlageDocx._wertRunAusRPr(element.ownerDocument, rPr, wert, vorhanden ? groesseFn(wert) : null),
        element);
    });

    const runs = toolhubVorlageDocxRuns(absatz);
    const felder = toolhubVorlageDocxFeldbaum(runs);

    // Von hinten nach vorn, damit die Indizes der übrigen Felder gültig bleiben
    felder.slice().reverse().forEach((feld) => {
      let wert = toolhubVorlageDocxFeldwert(feld, werte, optionen);
      if (wert === null) return; // fremdes Feld (DATE, PAGE …) unangetastet lassen
      wert = toolhubVorlageUmbrueche(wert, optionen);

      const betroffen = runs.slice(feld.von, feld.bis + 1);
      // Formatierung des zuletzt angezeigten Ergebnisses übernehmen, sonst die des Feldanfangs
      const quelle = (feld.trenner >= 0 ? runs.slice(feld.trenner + 1, feld.bis) : [])
        .find((run) => ToolhubVorlageDocx._direktesRPr(run)) || betroffen[0];
      const rPr = ToolhubVorlageDocx._direktesRPr(quelle);

      const neu = ToolhubVorlageDocx._wertRunAusRPr(absatz.ownerDocument, rPr, wert, wert === '' ? null : groesseFn(wert));
      betroffen[0].parentNode.insertBefore(neu, betroffen[0]);
      betroffen.forEach((run) => run.parentNode.removeChild(run));
    });
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
      if (optionen.autoSchrift) this._ersetzeProSeite(kopien, werte, optionen);
      else this._ersetze(kopien, werte, optionen);
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
            schreibe: (abschnitte, optionen) => ToolhubVorlageOdt._schreibeStueck(knoten, abschnitte, optionen)
          });
        } else if (knoten.nodeType === 1 && !this._istAbsatz(knoten)) {
          sammle(knoten);
        }
      });
    };
    sammle(absatz);
    return stuecke;
  }

  /*
   * Schreibt die Abschnitte in den Textknoten zurück. Ohne feste Schriftgröße
   * bleibt es ein einfacher Textknoten (Verhalten wie bisher); mit fester Größe
   * wird der Feldwert in ein <text:span> mit der Größe gefasst, der umgebende
   * Text bleibt gewöhnlicher Text mit seiner ursprünglichen Formatierung.
   */
  static _schreibeStueck(knoten, abschnitte, optionen) {
    const groesseFn = toolhubVorlageGroesseFn(optionen);
    const groessen = abschnitte.map((a) => (a.istFeld && a.text !== '') ? groesseFn(a.text) : null);

    if (!groessen.some((g) => g != null)) {
      knoten.nodeValue = abschnitte.map((a) => a.text).join('');
      ToolhubVorlageOdt._zeilenumbrueche(knoten);
      return;
    }

    const doc = knoten.ownerDocument;
    const eltern = knoten.parentNode;
    const dahinter = knoten.nextSibling;
    abschnitte.forEach((a, i) => {
      if (a.text === '') return;
      if (groessen[i] != null) {
        eltern.insertBefore(ToolhubVorlageOdt._schriftSpan(doc, a.text, groessen[i]), dahinter);
      } else {
        const textKnoten = doc.createTextNode(a.text);
        eltern.insertBefore(textKnoten, dahinter);
        ToolhubVorlageOdt._zeilenumbrueche(textKnoten);
      }
    });
    eltern.removeChild(knoten);
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
    const groesseFn = toolhubVorlageGroesseFn(optionen);
    this._datenbankFelder(absatz).forEach((el) => {
      const name = el.getAttributeNS(TOOLHUB_NS.text, 'column-name');
      if (!name) return;

      const vorhanden = Object.prototype.hasOwnProperty.call(werte, name);
      const wert = vorhanden
        ? toolhubVorlageUmbrueche(toolhubVorlageWert(werte[name]), optionen)
        : (optionen && optionen.behaltUnbekannte ? `{{${name}}}` : '');
      const punkt = vorhanden ? groesseFn(wert) : null;

      if (punkt != null) {
        el.parentNode.replaceChild(ToolhubVorlageOdt._schriftSpan(el.ownerDocument, wert, punkt), el);
      } else {
        const knoten = el.ownerDocument.createTextNode(wert);
        el.parentNode.replaceChild(knoten, el);
        ToolhubVorlageOdt._zeilenumbrueche(knoten);
      }
    });
  }

  // <text:span> mit der Zeichenvorlage für die feste Größe, Text mit Umbrüchen
  static _schriftSpan(doc, text, punkt) {
    const name = ToolhubVorlageOdt._schriftStilAnlegen(doc, punkt);
    const span = doc.createElementNS(TOOLHUB_NS.text, 'text:span');
    span.setAttributeNS(TOOLHUB_NS.text, 'text:style-name', name);
    const knoten = doc.createTextNode(text);
    span.appendChild(knoten);
    ToolhubVorlageOdt._zeilenumbrueche(knoten);
    return span;
  }

  // Automatische Stile des Dokuments; legt den Abschnitt bei Bedarf an
  static _automatischeStile(doc) {
    let auto = doc.getElementsByTagNameNS(TOOLHUB_NS.office, 'automatic-styles')[0];
    if (auto) return auto;
    auto = doc.createElementNS(TOOLHUB_NS.office, 'office:automatic-styles');
    // Reihenfolge im ODF-Schema beachten: vor master-styles bzw. body einfügen
    const master = doc.getElementsByTagNameNS(TOOLHUB_NS.office, 'master-styles')[0];
    const body = doc.getElementsByTagNameNS(TOOLHUB_NS.office, 'body')[0];
    doc.documentElement.insertBefore(auto, master || body || null);
    return auto;
  }

  /*
   * Zeichenvorlage mit einer bestimmten Schriftgröße; je Größe eine eigene Vorlage
   * (im Automatik-Modus kommen mehrere Größen vor). Gibt den Vorlagennamen zurück.
   */
  static _schriftStilAnlegen(doc, punkt) {
    const auto = ToolhubVorlageOdt._automatischeStile(doc);
    const name = TOOLHUB_ODT_SCHRIFT_STIL + '_' + String(punkt).replace('.', '_');
    const vorhanden = Array.from(auto.getElementsByTagNameNS(TOOLHUB_NS.style, 'style'))
      .some((stil) => stil.getAttributeNS(TOOLHUB_NS.style, 'name') === name);
    if (vorhanden) return name;

    const stil = doc.createElementNS(TOOLHUB_NS.style, 'style:style');
    stil.setAttributeNS(TOOLHUB_NS.style, 'style:name', name);
    stil.setAttributeNS(TOOLHUB_NS.style, 'style:family', 'text');
    const eigenschaften = doc.createElementNS(TOOLHUB_NS.style, 'style:text-properties');
    const groesse = punkt + 'pt';
    eigenschaften.setAttributeNS(TOOLHUB_NS.fo, 'fo:font-size', groesse);
    eigenschaften.setAttributeNS(TOOLHUB_NS.style, 'style:font-size-asian', groesse);
    eigenschaften.setAttributeNS(TOOLHUB_NS.style, 'style:font-size-complex', groesse);
    stil.appendChild(eigenschaften);
    auto.appendChild(stil);
    return name;
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
    const auto = ToolhubVorlageOdt._automatischeStile(doc);

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
      if (optionen.autoSchrift) this._ersetzeProSeite(kopien, werte, optionen);
      else this._ersetze(kopien, werte, optionen);
    });

    return text;
  }

  /*
   * Absatzvorlagen-Namen, deren Absatz einen fest gesetzten Seitenumbruch davor bzw.
   * danach erzwingt (fo:break-before / fo:break-after = "page"). Wird einmal je Dokument
   * aus den automatischen und den gemeinsamen Vorlagen gesammelt und gemerkt.
   */
  _umbruchStile(doc) {
    if (this._umbruchStileCache && this._umbruchStileCache.doc === doc) return this._umbruchStileCache;
    const vor = new Set();
    const nach = new Set();
    Array.from(doc.getElementsByTagNameNS(TOOLHUB_NS.style, 'style')).forEach((stil) => {
      const name = stil.getAttributeNS(TOOLHUB_NS.style, 'name');
      if (!name) return;
      // Seitenumbruch kann an Absatz- oder Tabellenvorlagen hängen
      const props = stil.getElementsByTagNameNS(TOOLHUB_NS.style, 'paragraph-properties')[0] ||
        stil.getElementsByTagNameNS(TOOLHUB_NS.style, 'table-properties')[0];
      if (!props) return;
      if (props.getAttributeNS(TOOLHUB_NS.fo, 'break-before') === 'page') vor.add(name);
      if (props.getAttributeNS(TOOLHUB_NS.fo, 'break-after') === 'page') nach.add(name);
    });
    this._umbruchStileCache = { doc, vor, nach };
    return this._umbruchStileCache;
  }

  _umbruchVor(block) {
    if (!this._istBlock(block)) return false;
    const name = block.getAttributeNS(TOOLHUB_NS.text, 'style-name') ||
      block.getAttributeNS(TOOLHUB_NS.table, 'style-name');
    return name ? this._umbruchStile(block.ownerDocument).vor.has(name) : false;
  }

  _umbruchNach(block) {
    if (!this._istBlock(block)) return false;
    const name = block.getAttributeNS(TOOLHUB_NS.text, 'style-name') ||
      block.getAttributeNS(TOOLHUB_NS.table, 'style-name');
    return name ? this._umbruchStile(block.ownerDocument).nach.has(name) : false;
  }

  _istBlock(el) {
    if (el.namespaceURI === TOOLHUB_NS.text && (el.localName === 'p' || el.localName === 'h')) return true;
    return el.namespaceURI === TOOLHUB_NS.table && el.localName === 'table';
  }

  _istInTabelle(absatz) {
    return !!toolhubVorlageVorfahre(absatz.parentNode, TOOLHUB_NS.table, ['table']);
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
