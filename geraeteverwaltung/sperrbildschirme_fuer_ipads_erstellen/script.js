/*
 * Sperrbildschirme für iPads erstellen.
 *
 * Zu jeder Nummer einer fortlaufenden Reihe entsteht ein Bild: einfarbiger Hintergrund,
 * auf halber Höhe links das Wort "iPad" und rechts die Nummer, darunter das Logo der
 * Schule. Grundlage ist immer ein SVG; das PNG wird daraus im Browser gerastert, damit
 * beide Formate garantiert dasselbe zeigen.
 *
 * Damit ein heruntergeladenes SVG überall gleich aussieht – und damit die Rasterung
 * überhaupt die richtige Schrift findet –, wird Open Sans als Data-URL in das SVG
 * eingebettet (siehe schriftEinbettung()).
 */

const eigenBreite = document.getElementById('eigenBreite');
const eigenHoehe = document.getElementById('eigenHoehe');
const eigenZeile = document.getElementById('eigenZeile');
const hintergrundFarbe = document.getElementById('hintergrundFarbe');
const hintergrundHex = document.getElementById('hintergrundHex');
const schriftFarbe = document.getElementById('schriftFarbe');
const schriftHex = document.getElementById('schriftHex');
const eigenLogoBereich = document.getElementById('eigenLogoBereich');
const einfaerbenZeile = document.getElementById('einfaerbenZeile');
const logoEinfaerben = document.getElementById('logoEinfaerben');
const logoFarbeZeile = document.getElementById('logoFarbeZeile');
const logoFarbe = document.getElementById('logoFarbe');
const logoHex = document.getElementById('logoHex');
const praefix = document.getElementById('praefix');
const startNummer = document.getElementById('startNummer');
const endNummer = document.getElementById('endNummer');
const fuehrendeNullen = document.getElementById('fuehrendeNullen');
const nummernMeldung = document.getElementById('nummernMeldung');
const logoMeldung = document.getElementById('logoMeldung');
const statistik = document.getElementById('statistik');
const hilfslinien = document.getElementById('hilfslinien');
const vorschauGitter = document.getElementById('vorschauGitter');
const drehungMeldung = document.getElementById('drehungMeldung');
const mitHintergrundbild = document.getElementById('mitHintergrundbild');
const erzeugenBtn = document.getElementById('erzeugenBtn');
const erzeugenMeldung = document.getElementById('erzeugenMeldung');

// Das Wort links neben der Nummer – es benennt das Gerät und steht deshalb fest.
const GERAETEWORT = 'iPad';

// Mehr Bilder als das sind kein Klassensatz mehr, sondern ein Versehen (und würden den
// Browser beim Rastern lange beschäftigen).
const HOECHSTZAHL = 500;

/*
 * Ab dieser Länge des Präfix steht die Beschriftung zweizeilig: Präfix über der Nummer.
 * Ein langes Präfix ("Kunst 01") wird sonst so breit, dass es im gedrehten Hochformat
 * abgeschnitten wird (siehe sichtbarNachDrehung).
 */
const PRAEFIX_UMBRUCH = 3;

/*
 * So weit darf die Schrift höchstens verkleinert werden, wenn die Beschriftung selbst
 * zweizeilig noch zu breit ist. Darunter wäre sie auf dem Gerät kaum noch abzulesen –
 * dann bleibt es bei dieser Größe, und die Vorschau sagt, dass es trotzdem nicht reicht.
 */
const SCHRIFT_MINDESTANTEIL = 0.55;

/*
 * Alle Maße als Anteil der kürzeren Bildkante – so trägt dasselbe Layout Quer- und
 * Hochformat und jede benutzerdefinierte Auflösung.
 */
const LAYOUT = {
  schriftgroesse: 0.082,  // Höhe der Schrift
  zeilenabstand: 1.2,     // Abstand zweier Zeilen – Vielfaches der Schriftgröße
  logoBreite: 0.36,       // Feld, in das das Logo eingepasst wird; breit genug auch für
  logoHoehe: 0.17,        // einen querliegenden Schriftzug, hoch wie das Schulzeichen

  /*
   * Oberkante der Seriennummer, die iOS unten einblendet – Abstand zum unteren Bildrand.
   * Ebenfalls an den Screenshots gemessen; zwischen ihr und dem Benutzerkreis steht das Logo.
   */
  seriennummer: 0.0453,

  /*
   * Der Kreis mit dem Benutzerbild, den iOS auf geteilten iPads über den Sperrbildschirm
   * legt. Beide Werte sind an Screenshots eines iPads ausgemessen (quer und hochkant) und
   * fielen dort auf die kürzere Kante bezogen genau gleich aus: Durchmesser 0,3115 der
   * kurzen Kante, Mitte 0,0248 darüber oben – der Kreis sitzt also etwas höher als die
   * Bildmitte. Die Beschriftung richtet sich nach ihm, damit sie nicht dahinter verschwindet.
   */
  kreisRadius: 0.1558,
  kreisHoeher: 0.0248,

  /*
   * Abstand der Beschriftung zum Kreisrand, links wie rechts gleich. Er bleibt knapp:
   * Vom Kreisrand bis zum Rand des Ausschnitts, der nach dem Drehen bleibt, sind es bei
   * 2360 × 1640 nur 314 Pixel, und was hier abgeht, fehlt der Schrift (siehe
   * schriftgroesse). Der Schriftzug soll über den Raum hinweg lesbar bleiben.
   */
  textAbstand: 0.014,

  /*
   * Abstand, den die Beschriftung nach außen hält – zum Bildrand und zu der Kante, an der
   * nach dem Drehen beschnitten wird. Bündig am Rand sieht ein Schriftzug nach Versehen
   * aus; passt er mit diesem Abstand nicht mehr, wird die Schrift kleiner gesetzt.
   */
  randAbstand: 0.02
};

/*
 * Open Sans hat eine Versalhöhe von 1462 der 2048 Einheiten des Geviert, also 0,714 em.
 * Mittig wirkt die Zeile, wenn die Mitte der Versalhöhe auf der Bildmitte liegt – die
 * Grundlinie steht demnach eine halbe Versalhöhe darunter. (Auf die Zeilenhöhe kommt es
 * nicht an: Ober- und Unterlängen zählen für das Auge hier nicht mit.)
 */
const VERSALHOEHE_HALB = 0.357;

const SCHRIFT_URL = '../../assets/fonts/open-sans-latin-normal.woff2';

// Das Schulzeichen liegt als gemeinsames Asset bereit und ist deshalb voreingestellt.
// Es zeichnet sich in `currentColor`, nimmt die eingestellte Logofarbe also unmittelbar an.
const STANDARDLOGO_URL = '../../assets/goa-logo.svg';

// id des eingebetteten Logos im erzeugten SVG – daran hängt die Regel, die es einfärbt
const LOGO_ID = 'logo';

const zustand = {
  standardlogo: null,  // Schulzeichen, beim Laden der Seite geholt
  eigenesLogo: null,   // hochgeladenes Logo
  schrift: null        // Data-URL der eingebetteten Schrift (wird einmal geladen)
};

// ---------------------------------------------------------------------------
// Einstellungen auslesen
// ---------------------------------------------------------------------------

function auswahl(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function zahl(feld, ersatz, kleinste, groesste) {
  const wert = Math.round(Number(feld.value));
  if (!Number.isFinite(wert)) return ersatz;
  return Math.min(groesste, Math.max(kleinste, wert));
}

/*
 * Breite und Höhe des Bildes. Die Auflösungen sind als Kantenpaar hinterlegt; welche der
 * beiden Kanten waagerecht liegt, entscheidet allein die Ausrichtung. Das gilt auch für
 * eigene Werte – so kommt nie ein Hochformat heraus, wenn Querformat eingestellt ist.
 */
function masse() {
  let kanten;
  switch (auswahl('aufloesung')) {
    case 'mitHomebutton': kanten = [2160, 1620]; break;
    case 'eigen': kanten = [zahl(eigenBreite, 2360, 16, 10000), zahl(eigenHoehe, 1640, 16, 10000)]; break;
    default: kanten = [2360, 1640];
  }
  const lang = Math.max(...kanten);
  const kurz = Math.min(...kanten);
  return auswahl('ausrichtung') === 'hoch'
    ? { breite: kurz, hoehe: lang }
    : { breite: lang, hoehe: kurz };
}

/*
 * Die Beschriftungen der Reihe. Jede besteht aus
 *
 *   voll     wie sie zusammen gelesen wird ("C 13") – für Dateiname und Vorschautitel
 *   zeilen   wie sie im Bild steht: ["C 13"] oder, bei langem Präfix, ["Kunst", "01"]
 *
 * Die Zahl der Stellen richtet sich nach der größten Nummer, damit alle Bilder gleich
 * breite Nummern tragen.
 */
function beschriftungen() {
  const start = zahl(startNummer, 1, 0, 99999);
  const ende = zahl(endNummer, 15, 0, 99999);
  if (ende < start) return { fehler: 'Die Endnummer liegt vor der Startnummer.' };

  const anzahl = ende - start + 1;
  if (anzahl > HOECHSTZAHL) {
    return { fehler: `${anzahl} Sperrbildschirme sind zu viele – höchstens ${HOECHSTZAHL} auf einmal.` };
  }

  // Das Leerzeichen am Ende trennt nur Präfix und Nummer; für die Länge zählt es nicht,
  // und in der zweizeiligen Fassung übernimmt der Zeilenumbruch seine Aufgabe.
  const vorsatz = praefix.value.replace(/\s+$/, '');
  const zweizeilig = vorsatz.length > PRAEFIX_UMBRUCH;

  const stellen = fuehrendeNullen.checked ? String(ende).length : 1;
  const liste = [];
  for (let n = start; n <= ende; n++) {
    const nummer = String(n).padStart(stellen, '0');
    liste.push({
      voll: praefix.value + nummer,
      zeilen: zweizeilig ? [vorsatz, nummer] : [praefix.value + nummer]
    });
  }
  return { liste, zweizeilig };
}

// ---------------------------------------------------------------------------
// SVG bauen
// ---------------------------------------------------------------------------

function xmlText(wert) {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Eine Nachkommastelle reicht bei Bildern dieser Größe und hält das SVG lesbar
function rund(wert) {
  return Math.round(wert * 10) / 10;
}

/*
 * Lage und Größe des Kreises, den iOS auf geteilten iPads mit dem Benutzerbild über den
 * Sperrbildschirm legt (siehe LAYOUT.kreisRadius).
 */
function benutzerkreis(breite, hoehe) {
  const kurz = Math.min(breite, hoehe);
  return {
    x: breite / 2,
    y: hoehe / 2 - kurz * LAYOUT.kreisHoeher,
    radius: kurz * LAYOUT.kreisRadius
  };
}

/*
 * Wird das iPad gedreht, füllt iOS den Bildschirm mit demselben Bild: Es vergrößert es,
 * bis die kurze Bildkante die lange Bildschirmkante deckt, und beschneidet den Überstand
 * zu beiden Seiten. Stehen bleibt von der langen Bildkante nur das mittlere Stück
 * kurz² / lang – bei 2360 × 1640 also knapp die halbe Breite.
 *
 * Rückgabe: der sichtbare Streifen entlang der langen Kante und die Achse, auf der er liegt.
 */
function sichtbarNachDrehung(breite, hoehe) {
  const kurz = Math.min(breite, hoehe);
  const lang = Math.max(breite, hoehe);
  const stueck = (kurz * kurz) / lang;
  return {
    achse: breite >= hoehe ? 'x' : 'y',
    von: (lang - stueck) / 2,
    bis: (lang + stueck) / 2
  };
}

/*
 * Breite eines Schriftzugs in der Ausgabeschrift. Gemessen wird auf einer Leinwand, mit
 * derselben Schrift und Stärke, mit der das SVG ihn später setzt – die Vorschübe stammen
 * damit aus derselben Quelle wie beim Zeichnen. Die Leinwand bleibt erhalten, sie wird
 * bei jeder Änderung der Vorschau mehrfach gebraucht.
 */
const messfeld = document.createElement('canvas').getContext('2d');

function textBreite(text, groesse) {
  messfeld.font = `700 ${groesse}px "Open Sans", Helvetica, Arial, sans-serif`;
  return messfeld.measureText(text).width;
}

/*
 * Platz, der einer Beschriftung neben dem Kreis bleibt – links wie rechts gleich viel,
 * weil Kreis und Ausschnitt beide mittig liegen. Nach außen begrenzt im Querformat der
 * Ausschnitt, der nach dem Drehen übrig bleibt; im Hochformat wird waagerecht nicht
 * beschnitten, dort ist es der Bildrand. Von beiden bleibt LAYOUT.randAbstand frei.
 */
function textPlatz(breite, hoehe) {
  const kurz = Math.min(breite, hoehe);
  const kreis = benutzerkreis(breite, hoehe);
  const streifen = sichtbarNachDrehung(breite, hoehe);
  const rand = (streifen.achse === 'x' ? streifen.bis : breite) - kurz * LAYOUT.randAbstand;
  return rand - (kreis.x + kreis.radius + kurz * LAYOUT.textAbstand);
}

/*
 * Schriftgröße für die ganze Reihe: gewünscht sind LAYOUT.schriftgroesse der kurzen Kante.
 * Passt der breiteste Schriftzug damit nicht in den Platz neben dem Kreis, wird verkleinert –
 * und zwar für alle Bilder der Reihe gleich, sonst stünden "iPad 1" und "iPad 115"
 * nebeneinander in verschiedenen Größen.
 *
 * Ohne Beschriftungen kommt die Größe heraus, die das Format überhaupt hergibt: "iPad"
 * steht immer da und ist allein schon breiter als eine kurze Nummer.
 */
function schriftgroesse(breite, hoehe, liste = []) {
  const gewuenscht = Math.min(breite, hoehe) * LAYOUT.schriftgroesse;
  const platz = textPlatz(breite, hoehe);
  if (platz <= 0) return gewuenscht;

  const breiteste = Math.max(
    textBreite(GERAETEWORT, gewuenscht),
    ...liste.flatMap((eintrag) => eintrag.zeilen.map((zeile) => textBreite(zeile, gewuenscht)))
  );
  if (breiteste <= platz) return gewuenscht;
  return gewuenscht * Math.max(SCHRIFT_MINDESTANTEIL, platz / breiteste);
}

/*
 * Das Logo steht mittig zwischen dem unteren Rand des Benutzerkreises und der
 * Seriennummer, die iOS unten einblendet – also in der freien Fläche darunter und nicht
 * in einem festen Anteil der Bildhöhe.
 */
function logofeld(breite, hoehe) {
  const kurz = Math.min(breite, hoehe);
  const kreis = benutzerkreis(breite, hoehe);
  const feldBreite = kurz * LAYOUT.logoBreite;
  const feldHoehe = kurz * LAYOUT.logoHoehe;
  const mitte = ((kreis.y + kreis.radius) + (hoehe - kurz * LAYOUT.seriennummer)) / 2;
  return {
    x: (breite - feldBreite) / 2,
    y: mitte - feldHoehe / 2,
    breite: feldBreite,
    hoehe: feldHoehe
  };
}

/*
 * Setzt das Logo in das Feld, das für es vorgesehen ist. Beide Wege passen es dort ein,
 * statt es zu verzerren (`preserveAspectRatio`), und beide legen seine Mitte auf die
 * Mitte des Feldes:
 *
 *   Vektor  Das SVG wird als verschachteltes <svg> übernommen. Nur so lässt es sich
 *           einfärben – über ein <image> wäre es ein eigenes Dokument, in dem weder
 *           `currentColor` noch eine Regel von außen ankommt.
 *   Pixel   PNG und JPG bleiben ein <image> mit dem Bild als Data-URL; ihre Farben
 *           stehen in den Bildpunkten und sind nicht mehr zu ändern.
 */
function logoMarkup(logo, feld, logoId) {
  const masze = `x="${rund(feld.x)}" y="${rund(feld.y)}" ` +
    `width="${rund(feld.breite)}" height="${rund(feld.hoehe)}" preserveAspectRatio="xMidYMid meet"`;

  if (logo.art === 'raster') return `<image ${masze} href="${xmlText(logo.datenUrl)}"/>`;

  const kopie = logo.wurzel.cloneNode(true);
  kopie.setAttribute('id', logoId);
  ['x', 'y', 'width', 'height', 'preserveAspectRatio'].forEach((name) => kopie.removeAttribute(name));
  const rumpf = new XMLSerializer().serializeToString(kopie);
  return rumpf.replace(/^<svg/, `<svg ${masze}`);
}

/*
 * Erzeugt das SVG eines Sperrbildschirms.
 *
 *   zeilen        Beschriftung rechts, ein- oder zweizeilig; ohne sie entsteht das
 *                 reine Hintergrundbild
 *   groesse       Schriftgröße; ohne Angabe die gewünschte aus LAYOUT. Sie kommt von
 *                 außen, weil sie für die ganze Reihe gilt (siehe schriftgroesse)
 *   logo          eingelesenes Logo (entfällt beim Hintergrundbild)
 *   logoFarbe     Farbe, auf die ein Vektorlogo gebracht wird; null = unverändert lassen
 *   logoId        id des eingebetteten Logos; nur die Vorschau braucht eine eigene
 *   schrift       Data-URL der eingebetteten Schriftdatei; ohne sie greift die Schrift
 *                 der Umgebung – das genügt für die Vorschau innerhalb der Seite
 *   hilfslinien   zeichnet Benutzerkreis und Hochformat-Ausschnitt ein; nur für die
 *                 Vorschau gedacht, in den Dateien hat das nichts zu suchen
 */
function baueSvg({ breite, hoehe, hintergrund, farbe, zeilen, groesse: vorgabe, logo, logoFarbe,
  logoId = LOGO_ID, schrift, hilfslinien = false }) {
  const kurz = Math.min(breite, hoehe);
  const groesse = rund(vorgabe || kurz * LAYOUT.schriftgroesse);
  const mitText = Array.isArray(zeilen) && zeilen.length > 0;
  const mitLogo = mitText && logo;
  const faerben = mitLogo && logo.art === 'vektor' && logoFarbe;
  const regeln = [];
  const teile = [];

  teile.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" ` +
    `viewBox="0 0 ${breite} ${hoehe}">`);

  if (mitText && schrift) {
    // Die Schrift steckt im SVG selbst: beim Rastern über ein <img> wäre eine
    // Datei daneben nicht erreichbar, und ein weitergegebenes SVG bliebe sonst
    // auf die Schriften des fremden Rechners angewiesen.
    regeln.push('@font-face{font-family:"Open Sans";font-style:normal;font-weight:300 800;' +
      `src:url(${schrift}) format("woff2");}`);
  }

  if (faerben) {
    /*
     * Das eingebettete Logo auf eine Farbe bringen. `color` genügt allein nicht: Es
     * greift nur bei `currentColor`, nicht bei fest eingetragenen Farbwerten. Deshalb
     * zusätzlich zwei Regeln, die Füllung und Kontur überschreiben – "!important", weil
     * sie sich sonst an einem style-Attribut im Logo die Zähne ausbeißen.
     *
     * Ausgenommen bleibt, was ausdrücklich auf "none" steht: Bei einer Strichzeichnung
     * ist die Fläche bewusst leer, und eine Füllung würde sie zulaufen lassen.
     */
    const farbwert = xmlText(logoFarbe);
    regeln.push(`#${logoId}{color:${farbwert}}`);
    regeln.push(`#${logoId} :not([fill="none"]){fill:${farbwert} !important}`);
    regeln.push(`#${logoId} [stroke]:not([stroke="none"]){stroke:${farbwert} !important}`);
  }

  if (regeln.length > 0) teile.push(`<defs><style>${regeln.join('')}</style></defs>`);

  teile.push(`<rect width="${breite}" height="${hoehe}" fill="${xmlText(hintergrund)}"/>`);

  if (mitText) {
    /*
     * Beide Schriftzüge stehen neben dem Benutzerkreis, mit demselben Abstand zu seinem
     * Rand: "iPad" endet links davor, die Nummer beginnt rechts dahinter. Senkrecht
     * richten sie sich nach der Kreismitte – nicht nach der Bildmitte, denn der Kreis
     * sitzt etwas höher.
     */
    const kreis = benutzerkreis(breite, hoehe);
    const rand = kreis.radius + kurz * LAYOUT.textAbstand;
    const abstand = groesse * LAYOUT.zeilenabstand;

    // Mitte der Versalhöhe jeder Zeile; bei zwei Zeilen liegt die Kreismitte zwischen ihnen
    const mitten = zeilen.map((_, i) => kreis.y + (i - (zeilen.length - 1) / 2) * abstand);
    const grundlinie = (mitte) => rund(mitte + groesse * VERSALHOEHE_HALB);

    /*
     * Die Zeilen der Beschriftung stehen untereinander mittig zueinander: Die breiteste
     * hält den Abstand zum Kreis, die kürzere (meist die Nummer) rückt in deren Mitte.
     * Bei nur einer Zeile fällt beides zusammen.
     */
    const blockBreite = Math.max(...zeilen.map((zeile) => textBreite(zeile, groesse)));
    const blockMitte = kreis.x + rand + blockBreite / 2;

    teile.push(`<g fill="${xmlText(farbe)}" font-family="'Open Sans', Helvetica, Arial, sans-serif" ` +
      `font-weight="700" font-size="${groesse}">`);
    // "iPad" bleibt einzeilig und steht auf Höhe der Kreismitte
    teile.push(`<text x="${rund(kreis.x - rand)}" y="${grundlinie(kreis.y)}" ` +
      `text-anchor="end">${xmlText(GERAETEWORT)}</text>`);
    zeilen.forEach((zeile, i) => {
      teile.push(`<text x="${rund(blockMitte)}" y="${grundlinie(mitten[i])}" ` +
        `text-anchor="middle">${xmlText(zeile)}</text>`);
    });
    teile.push('</g>');
  }

  if (mitLogo) teile.push(logoMarkup(logo, logofeld(breite, hoehe), logoId));

  if (hilfslinien) teile.push(baueHilfslinien(breite, hoehe));

  teile.push('</svg>');
  return teile.join('\n');
}

/*
 * Nur für die Vorschau: der Kreis mit dem Benutzerbild und die Grenzen dessen, was nach
 * dem Drehen des iPads übrig bleibt. Beides gehört nicht in die erzeugten Dateien –
 * es soll beim Einrichten zeigen, wo das Bild später verdeckt oder beschnitten wird.
 */
function baueHilfslinien(breite, hoehe) {
  const kurz = Math.min(breite, hoehe);
  const kreis = benutzerkreis(breite, hoehe);
  const strich = rund(kurz * 0.004);
  const streifen = sichtbarNachDrehung(breite, hoehe);
  const quer = streifen.achse === 'x';

  const kante = (wert) => (quer
    ? `<line x1="${rund(wert)}" y1="0" x2="${rund(wert)}" y2="${hoehe}"/>`
    : `<line x1="0" y1="${rund(wert)}" x2="${breite}" y2="${rund(wert)}"/>`);

  // Höhe, auf der iOS die Seriennummer einblendet – die untere Grenze für das Logo
  const seriennummer = hoehe - kurz * LAYOUT.seriennummer;

  return '<g class="hilfslinien" fill="none" stroke="#ffffff" stroke-opacity="0.55" ' +
    `stroke-width="${strich}" stroke-dasharray="${rund(strich * 4)} ${rund(strich * 3)}">` +
    `<circle cx="${rund(kreis.x)}" cy="${rund(kreis.y)}" r="${rund(kreis.radius)}" ` +
    'fill="#ffffff" fill-opacity="0.18" stroke-dasharray="none"/>' +
    kante(streifen.von) + kante(streifen.bis) +
    `<line x1="0" y1="${rund(seriennummer)}" x2="${breite}" y2="${rund(seriennummer)}"/>` +
    '</g>';
}

// ---------------------------------------------------------------------------
// Schrift und Logo einlesen
// ---------------------------------------------------------------------------

function base64VonPuffer(puffer) {
  const bytes = new Uint8Array(puffer);
  let roh = '';
  // Blockweise: fromCharCode nimmt jedes Byte als Argument, eine ganze Schriftdatei
  // auf einmal würde den Aufruf-Stack sprengen.
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    roh += String.fromCharCode.apply(null, bytes.subarray(i, i + block));
  }
  return btoa(roh);
}

/*
 * Open Sans als Data-URL. Genommen wird der lateinische Schnitt der Variable Font aus
 * assets/fonts – dieselbe Datei, aus der die Oberfläche ihre Schrift bezieht.
 * Wird einmal geladen und dann behalten.
 */
async function schriftEinbettung() {
  if (zustand.schrift) return zustand.schrift;
  let antwort;
  try {
    antwort = await fetch(SCHRIFT_URL);
  } catch {
    // Über file:// geöffnet verweigert der Browser jeden fetch auf assets/
    throw new Error('Die Schriftdatei ließ sich nicht laden. Die Seite muss über einen ' +
      'Server geöffnet werden (siehe README), nicht direkt aus dem Dateisystem.');
  }
  if (!antwort.ok) throw new Error(`Schriftdatei nicht gefunden (${SCHRIFT_URL}, ${antwort.status}).`);
  zustand.schrift = `data:font/woff2;base64,${base64VonPuffer(await antwort.arrayBuffer())}`;
  return zustand.schrift;
}

/*
 * Bereitet ein Vektorlogo zum Einbetten vor: Aus dem Text wird das <svg>-Element, das
 * später in jeden Sperrbildschirm kopiert wird.
 *
 * Weil dieses Element auch in der Vorschau *innerhalb der Seite* landet, fliegen Skripte
 * und Ereignis-Attribute heraus. Sie wären dort ausführbarer Code aus einer fremden
 * Datei – im fertigen Bild richten sie ohnehin nichts aus.
 */
function svgLogoVorbereiten(text, name) {
  const baum = new DOMParser().parseFromString(text, 'image/svg+xml');
  const wurzel = baum.documentElement;
  if (baum.querySelector('parsererror') || wurzel.tagName.toLowerCase() !== 'svg') {
    throw new Error('Die Datei enthält kein lesbares SVG.');
  }

  wurzel.querySelectorAll('script').forEach((el) => el.remove());
  wurzel.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attribut) => {
      if (/^on/i.test(attribut.name)) el.removeAttribute(attribut.name);
    });
  });

  // Ohne viewBox hat das Logo kein festes Seitenverhältnis und zöge sich beim Einpassen
  // auf das ganze Feld auseinander. Das lässt sich hier nicht heilen, aber sagen.
  const warnung = wurzel.getAttribute('viewBox')
    ? ''
    : 'Das SVG-Logo hat kein viewBox-Attribut – es könnte verzerrt erscheinen. ' +
      'Besser das viewBox in der Datei ergänzen oder ein PNG verwenden.';

  return { name, art: 'vektor', wurzel, warnung };
}

async function logoEinlesen(datei) {
  const puffer = await toolhubReadArrayBuffer(datei);
  const istSvg = /\.svg$/i.test(datei.name) || datei.type === 'image/svg+xml';

  if (istSvg) return svgLogoVorbereiten(toolhubDecode(puffer).text, datei.name);

  const typ = datei.type || 'image/png';
  return {
    name: datei.name,
    art: 'raster',
    datenUrl: `data:${typ};base64,${base64VonPuffer(puffer)}`,
    warnung: ''
  };
}

/*
 * Das Schulzeichen aus assets/ – voreingestellt, damit die üblichen Sperrbildschirme
 * ohne einen einzigen Handgriff fertig sind. Schlägt das fehl (etwa über file://),
 * bleibt es beim leeren unteren Drittel; die Meldung sagt, woran es liegt.
 */
async function standardlogoLaden() {
  const antwort = await fetch(STANDARDLOGO_URL);
  if (!antwort.ok) throw new Error(`nicht gefunden (${antwort.status})`);
  return svgLogoVorbereiten(await antwort.text(), 'goa-logo.svg');
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

/*
 * Die Vorschau zeigt den ersten und den letzten Sperrbildschirm der Reihe sowie – wenn
 * gewählt – das Hintergrundbild. Sie steht in der Seite und kommt deshalb ohne die
 * eingebettete Schrift aus.
 */
/*
 * Das Logo, mit dem gearbeitet wird – je nach Auswahl das Schulzeichen, ein eigenes
 * oder keines. Ein eigenes, das (noch) nicht ausgewählt ist, bleibt dabei erhalten:
 * Wer zwischen den Möglichkeiten hin und her springt, muss es nicht neu hochladen.
 */
function aktuellesLogo() {
  switch (auswahl('logoQuelle')) {
    case 'standard': return zustand.standardlogo;
    case 'eigen': return zustand.eigenesLogo;
    default: return null;
  }
}

/*
 * Alles, was für jeden Sperrbildschirm der Reihe gleich ist – Vorschau und Ausgabe teilen
 * es sich. Die Schriftgröße gehört dazu: Sie richtet sich nach der breitesten Beschriftung
 * der *ganzen* Reihe und ist deshalb für jedes einzelne Bild dieselbe.
 */
function bildEinstellungen(liste = []) {
  const { breite, hoehe } = masse();
  return {
    breite,
    hoehe,
    groesse: schriftgroesse(breite, hoehe, liste),
    hintergrund: hintergrundFarbe.value,
    farbe: schriftFarbe.value,
    logo: aktuellesLogo(),
    logoFarbe: logoEinfaerben.checked ? logoFarbe.value : null
  };
}

function aktualisiereVorschau() {
  eigenZeile.classList.toggle('disabled', auswahl('aufloesung') !== 'eigen');
  eigenBreite.disabled = eigenHoehe.disabled = auswahl('aufloesung') !== 'eigen';

  // Einfärben ist eine Sache der Vektorlogos; ohne Logo und bei Pixelbildern grau
  const logo = aktuellesLogo();
  const faerbbar = Boolean(logo) && logo.art === 'vektor';
  eigenLogoBereich.classList.toggle('hidden', auswahl('logoQuelle') !== 'eigen');
  einfaerbenZeile.classList.toggle('disabled', !faerbbar);
  logoEinfaerben.disabled = !faerbbar;
  logoFarbeZeile.classList.toggle('disabled', !faerbbar || !logoEinfaerben.checked);
  logoFarbe.disabled = logoHex.disabled = !faerbbar || !logoEinfaerben.checked;

  const { breite, hoehe } = masse();
  const { liste, fehler } = beschriftungen();

  toolhubMessage(nummernMeldung, fehler || '', 'error', 'kreuz');
  erzeugenBtn.disabled = Boolean(fehler);

  const anzahl = liste ? liste.length : 0;
  const dateien = anzahl + (mitHintergrundbild.checked ? 1 : 0);

  statistik.innerHTML = `
    <div class="stat-card">
      <h3>Sperrbildschirme</h3>
      <div class="value">${anzahl}</div>
      <p>${anzahl > 0 ? `${toolhubEscapeHtml(liste[0].voll)} bis ${toolhubEscapeHtml(liste[anzahl - 1].voll)}` : 'keine'}</p>
    </div>
    <div class="stat-card klein">
      <h3>Aufl&ouml;sung</h3>
      <div class="value">${breite} &times; ${hoehe}</div>
      <p>Pixel, ${breite >= hoehe ? 'Querformat' : 'Hochformat'}</p>
    </div>
    <div class="stat-card">
      <h3>Dateien im Archiv</h3>
      <div class="value">${dateien}</div>
      <p>${mitHintergrundbild.checked ? 'mit Hintergrundbild' : 'ohne Hintergrundbild'}</p>
    </div>`;

  const bilder = [];
  if (anzahl > 0) bilder.push({ titel: `${GERAETEWORT} ${liste[0].voll}`, zeilen: liste[0].zeilen });
  if (anzahl > 1) {
    bilder.push({ titel: `${GERAETEWORT} ${liste[anzahl - 1].voll}`, zeilen: liste[anzahl - 1].zeilen });
  }
  if (mitHintergrundbild.checked) bilder.push({ titel: 'Hintergrundbild', zeilen: null });

  const gemeinsam = bildEinstellungen(liste || []);
  vorschauGitter.innerHTML = bilder.map((bild, i) => `
    <figure class="vorschau">
      <div class="vorschau-bild">${baueSvg({
        ...gemeinsam,
        zeilen: bild.zeilen,
        hilfslinien: hilfslinien.checked,
        // Die Vorschauen stehen in derselben Seite: eine eigene id je Bild, damit die
        // Regel zum Einfärben nicht auf die Logos der Nachbarn übergreift
        logoId: `logo-vorschau-${i}`
      })}</div>
      <figcaption>${toolhubEscapeHtml(bild.titel)}</figcaption>
    </figure>`).join('');

  pruefeDrehung(breite, hoehe, gemeinsam.groesse);
}

/*
 * Kontrolliert an den fertig gesetzten Vorschauen, was nach dem Drehen des iPads vom
 * Schriftzug übrig bleibt. Gemessen statt gerechnet: Erst am gezeichneten Text steht
 * fest, wie breit er mit diesen Buchstaben wirklich ausfällt.
 *
 * Meldet außerdem, wenn die Schrift dafür verkleinert werden musste – das erklärt, warum
 * die Beschriftung kleiner steht als sonst.
 */
function pruefeDrehung(breite, hoehe, groesse) {
  const streifen = sichtbarNachDrehung(breite, hoehe);
  const quer = streifen.achse === 'x';
  let ueberstand = 0;

  vorschauGitter.querySelectorAll('.vorschau-bild svg > g > text').forEach((el) => {
    const kasten = el.getBBox();
    const von = quer ? kasten.x : kasten.y;
    const bis = von + (quer ? kasten.width : kasten.height);
    ueberstand = Math.max(ueberstand, streifen.von - von, bis - streifen.bis);
  });

  if (ueberstand > 1) {
    toolhubMessage(drehungMeldung,
      'Beim Drehen ins Hochformat vergrößert iOS das Bild und schneidet die Ränder ab – ' +
      `dabei fehlen der Beschriftung rund ${Math.round(ueberstand)} Pixel. Kleiner als ` +
      `${Math.round(SCHRIFT_MINDESTANTEIL * 100)} Prozent wird die Schrift dafür nicht ` +
      'gesetzt; ein kürzeres Präfix schafft Platz.', 'warn', 'warnung');
    return;
  }

  /*
   * Verglichen wird mit der Größe, die dieses Format ohnehin zulässt – nicht mit der
   * gewünschten. Sonst meldete sich die Zeile bei jedem Querformat, denn dort ist der
   * Platz neben dem Kreis schon für "iPad" allein zu knapp.
   */
  const anteil = groesse / schriftgroesse(breite, hoehe);
  toolhubMessage(drehungMeldung, anteil < 0.995
    ? `Wegen der langen Beschriftung steht die Schrift auf ${Math.round(anteil * 100)} ` +
      'Prozent ihrer sonstigen Größe – so bleibt sie neben dem Benutzerbild und mit ' +
      'Abstand zum Rand vollständig sichtbar.'
    : '', 'info', 'haken');
}

// ---------------------------------------------------------------------------
// PNG rastern
// ---------------------------------------------------------------------------

/*
 * Rastert ein SVG über ein <img> auf eine Leinwand. Das SVG wird dabei als eigenes
 * Bild geladen: Es darf deshalb keine Datei von außen nachladen – Schrift und Logo
 * stecken aus genau diesem Grund als Data-URL darin.
 */
function svgZuPng(svgText, breite, hoehe) {
  return new Promise((erfuellen, ablehnen) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const bild = new Image();

    bild.onload = () => {
      URL.revokeObjectURL(url);
      const leinwand = document.createElement('canvas');
      leinwand.width = breite;
      leinwand.height = hoehe;
      leinwand.getContext('2d').drawImage(bild, 0, 0, breite, hoehe);
      leinwand.toBlob((blob) => {
        if (blob) erfuellen(blob);
        else ablehnen(new Error('Das Bild konnte nicht als PNG gespeichert werden.'));
      }, 'image/png');
    };

    bild.onerror = () => {
      URL.revokeObjectURL(url);
      ablehnen(new Error('Das Bild konnte nicht gezeichnet werden.'));
    };

    bild.src = url;
  });
}

// ---------------------------------------------------------------------------
// Erzeugen und herunterladen
// ---------------------------------------------------------------------------

/*
 * Dateinamen dürfen keine Zeichen enthalten, über die ein Betriebssystem stolpert:
 * "iPad-C 13" wird zu "iPad-C-13". Zwei Bilder können dabei nicht denselben Namen
 * bekommen – das Präfix ist für die ganze Reihe dasselbe, unterschieden werden sie
 * durch die Nummer.
 */
function dateiname(text, endung) {
  const sauber = String(text).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  return `${sauber || 'ohne-nummer'}.${endung}`;
}

function groesseInText(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

erzeugenBtn.addEventListener('click', async () => {
  const { liste, fehler } = beschriftungen();
  if (fehler) return;

  const { breite, hoehe } = masse();
  const format = auswahl('format');
  const alsPng = format === 'png';

  erzeugenBtn.disabled = true;
  toolhubMessage(erzeugenMeldung, 'Sperrbildschirme werden erzeugt …', 'info', 'sanduhr');

  try {
    const gemeinsam = { ...bildEinstellungen(liste), schrift: await schriftEinbettung() };

    const aufgaben = liste.map((eintrag) => ({
      zeilen: eintrag.zeilen,
      name: `${GERAETEWORT}-${eintrag.voll}`
    }));
    if (mitHintergrundbild.checked) aufgaben.push({ zeilen: null, name: 'Hintergrund' });

    const zip = new JSZip();
    for (let i = 0; i < aufgaben.length; i++) {
      const aufgabe = aufgaben[i];
      toolhubMessage(erzeugenMeldung,
        `Bild ${i + 1} von ${aufgaben.length} wird erzeugt …`, 'info', 'sanduhr');

      const svg = baueSvg({ ...gemeinsam, zeilen: aufgabe.zeilen });
      if (alsPng) {
        zip.file(dateiname(aufgabe.name, 'png'), await svgZuPng(svg, breite, hoehe));
      } else {
        zip.file(dateiname(aufgabe.name, 'svg'), svg);
      }
    }

    const archiv = await zip.generateAsync({ type: 'blob' });
    toolhubDownload(archiv, 'Sperrbildschirme.zip');

    toolhubMessage(erzeugenMeldung,
      `${aufgaben.length} Bilder als Sperrbildschirme.zip (${groesseInText(archiv.size)}) heruntergeladen.`,
      'success', 'haken');
  } catch (ausnahme) {
    toolhubMessage(erzeugenMeldung, `Fehler beim Erzeugen: ${ausnahme.message}`, 'error', 'kreuz');
    console.error(ausnahme);
  } finally {
    erzeugenBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Bedienung verdrahten
// ---------------------------------------------------------------------------

/*
 * Farbwähler und Hex-Feld zeigen denselben Wert: Der Wähler ist bequem, das Feld erlaubt
 * es, eine Hausfarbe als Zahl einzutippen oder abzulesen.
 */
function farbePaaren(waehler, feld) {
  waehler.addEventListener('input', () => {
    feld.value = waehler.value;
    aktualisiereVorschau();
  });

  feld.addEventListener('input', () => {
    const wert = feld.value.trim();
    // Kurzschreibweise (#abc) mitnehmen, halbfertige Eingaben stillschweigend übergehen
    const voll = /^#?[0-9a-fA-F]{3}$/.test(wert)
      ? '#' + wert.replace('#', '').split('').map((z) => z + z).join('')
      : (/^#?[0-9a-fA-F]{6}$/.test(wert) ? '#' + wert.replace('#', '') : null);
    if (!voll) return;
    waehler.value = voll.toLowerCase();
    aktualisiereVorschau();
  });

  // Erst beim Verlassen aufräumen – währenddessen soll die Eingabe nicht springen
  feld.addEventListener('blur', () => { feld.value = waehler.value; });
}

farbePaaren(hintergrundFarbe, hintergrundHex);
farbePaaren(schriftFarbe, schriftHex);
farbePaaren(logoFarbe, logoHex);

[eigenBreite, eigenHoehe, praefix, startNummer, endNummer].forEach((feld) => {
  feld.addEventListener('input', aktualisiereVorschau);
});

[fuehrendeNullen, mitHintergrundbild, logoEinfaerben, hilfslinien].forEach((feld) => {
  feld.addEventListener('change', aktualisiereVorschau);
});

document.querySelectorAll('input[name="aufloesung"], input[name="ausrichtung"], input[name="logoQuelle"]')
  .forEach((feld) => feld.addEventListener('change', aktualisiereVorschau));

toolhubUpload({
  input: 'logoInput',
  zone: 'logoZone',
  list: 'logoListe',
  extensions: ['.svg', '.png', '.jpg', '.jpeg', '.webp'],
  onInvalid: (namen) => toolhubMessage(logoMeldung,
    `Kein Bildformat: ${namen.join(', ')} – erwartet werden .svg, .png, .jpg oder .webp.`, 'error', 'kreuz'),
  onChange: async (dateien) => {
    if (dateien.length === 0) {
      zustand.eigenesLogo = null;
      toolhubMessage(logoMeldung, '');
      aktualisiereVorschau();
      return;
    }

    try {
      zustand.eigenesLogo = await logoEinlesen(dateien[0]);
      toolhubMessage(logoMeldung,
        zustand.eigenesLogo.warnung || `Logo „${zustand.eigenesLogo.name}“ übernommen.`,
        zustand.eigenesLogo.warnung ? 'warn' : 'success',
        zustand.eigenesLogo.warnung ? 'warnung' : 'haken');
    } catch (ausnahme) {
      zustand.eigenesLogo = null;
      toolhubMessage(logoMeldung, `Logo konnte nicht gelesen werden: ${ausnahme.message}`, 'error', 'kreuz');
    }
    aktualisiereVorschau();
  }
});

aktualisiereVorschau();

/*
 * Die Schriftgröße hängt davon ab, wie breit die Beschriftung ausfällt – gemessen werden
 * kann das erst, wenn Open Sans geladen ist. Bis dahin misst der Browser in einer
 * Ersatzschrift; sobald die richtige da ist, wird noch einmal gerechnet.
 */
if (document.fonts) {
  document.fonts.load('700 100px "Open Sans"').then(aktualisiereVorschau).catch(() => {});
}

// Das voreingestellte Schulzeichen kommt nach: Die Vorschau steht schon, sobald es da
// ist, wird sie ein zweites Mal gezeichnet.
standardlogoLaden().then((logo) => {
  zustand.standardlogo = logo;
  aktualisiereVorschau();
}).catch((ausnahme) => {
  toolhubMessage(logoMeldung,
    `Das Schulzeichen (${STANDARDLOGO_URL}) ließ sich nicht laden: ${ausnahme.message}. ` +
    'Ein eigenes Logo lässt sich weiterhin hochladen.', 'warn', 'warnung');
});
