/*
 * koffer.js – Hinweisschild und Ladeanleitung für den iPad-Koffer.
 *
 * Beide entstehen aus Vorlagen in vorlagen/ (DIN A4, quer und hochkant, Einheiten in
 * Millimetern). Das Skript füllt darin die Stellen, die eine feste id tragen – welche das
 * sind, steht im README. Beide Ausrichtungen tragen dieselben ids; das Füllen weiß nicht,
 * welche es vor sich hat. Ausgegeben wird als SVG (mit eingebetteter Schrift) oder als Vektor-PDF über
 * jsPDF und svg2pdf.js.
 *
 * Gesetzt ist alles in Inter, wie die Vorlagen entworfen sind; die handschriftlichen Notizen
 * am QR-Code in Caveat. Die Schnitte liegen als TTF in assets/fonts: jsPDF kann nur
 * TrueType einbetten und keine variablen Schriften, deshalb feste Stärken statt einer
 * variablen Datei.
 */

const KOFFER_VORLAGEN = {
  quer: {
    schild: 'vorlagen/Hinweisschild_iPad-Koffer.svg',
    schildQr: 'vorlagen/Hinweisschild_iPad-Koffer_qr.svg',
    anleitung: 'vorlagen/Anleitung_iPad-Koffer_laden.svg'
  },
  hoch: {
    schild: 'vorlagen/Hinweisschild_iPad-Koffer_hoch.svg',
    schildQr: 'vorlagen/Hinweisschild_iPad-Koffer_qr_hoch.svg',
    anleitung: 'vorlagen/Anleitung_iPad-Koffer_laden_hoch.svg'
  }
};

// Alle Stärken, die in den Vorlagen vorkommen (font-weight 400 bis 800)
const INTER_STAERKEN = [400, 500, 600, 700, 800];

// Die Handschrift gibt es nur fett: dünner wirkt sie aus der Entfernung wie Bleistift
const HANDSCHRIFT = { familie: 'Caveat', staerke: 700, datei: '../../assets/fonts/caveat-latin-700.ttf' };

// Farbe des Koffers in der Anleitung (Gewebe des Deckels) – Hintergrund der Kofferziffern
const KOFFERDECKEL = '#24272c';

const kofferZustand = {
  vorlagen: null,   // { quer: { schild, anleitung }, hoch: { … } } als SVG-Text
  inter: null,      // { [stärke]: base64 der TTF-Datei }
  handschrift: null, // base64 der Caveat-Datei
  laden: null       // laufendes Promise, damit gleichzeitige Aufrufe nur einmal laden
};

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

/*
 * Holt Vorlagen und Schriften – einmal, beim ersten Bedarf. Die Schriften werden zugleich
 * im Dokument angemeldet: Ohne sie ließe sich nicht messen, wie breit ein Schriftzug in
 * Inter ausfällt, und die Vorschau stünde in einer Ersatzschrift da.
 */
function kofferVorbereiten() {
  if (!kofferZustand.laden) {
    kofferZustand.laden = (async () => {
      const holen = async (url) => {
        let antwort;
        try {
          antwort = await fetch(url);
        } catch {
          throw new Error('Die Vorlagen ließen sich nicht laden. Die Seite muss über einen ' +
            'Server geöffnet werden (siehe README), nicht direkt aus dem Dateisystem.');
        }
        if (!antwort.ok) throw new Error(`${url} nicht gefunden (${antwort.status}).`);
        return antwort;
      };

      const vorlagen = {};
      await Promise.all(Object.entries(KOFFER_VORLAGEN).flatMap(([ausrichtung, dateien]) => {
        vorlagen[ausrichtung] = {};
        return Object.entries(dateien).map(async ([art, url]) => {
          vorlagen[ausrichtung][art] = await (await holen(url)).text();
        });
      }));

      const inter = {};
      await Promise.all(INTER_STAERKEN.map(async (staerke) => {
        const puffer = await (await holen(`../../assets/fonts/inter-latin-${staerke}.ttf`)).arrayBuffer();
        inter[staerke] = base64VonPuffer(puffer);
        const schnitt = new FontFace('Inter', puffer, { weight: String(staerke) });
        await schnitt.load();
        document.fonts.add(schnitt);
      }));

      const handPuffer = await (await holen(HANDSCHRIFT.datei)).arrayBuffer();
      const handSchnitt = new FontFace(HANDSCHRIFT.familie, handPuffer, { weight: String(HANDSCHRIFT.staerke) });
      await handSchnitt.load();
      document.fonts.add(handSchnitt);

      kofferZustand.vorlagen = vorlagen;
      kofferZustand.inter = inter;
      kofferZustand.handschrift = base64VonPuffer(handPuffer);
    })();
    // Ein gescheiterter Versuch soll beim nächsten Mal neu laden dürfen
    kofferZustand.laden.catch(() => { kofferZustand.laden = null; });
  }
  return kofferZustand.laden;
}

// ---------------------------------------------------------------------------
// Messen
// ---------------------------------------------------------------------------

const interMessfeld = document.createElement('canvas').getContext('2d');

/*
 * Breite eines Schriftzugs in Inter, in denselben Einheiten wie `groesse`. Gemessen wird
 * bei 100 Pixeln und dann umgerechnet: Die Vorlagen rechnen in Millimetern, und bei
 * Schriftgrößen um 10 "Pixel" runden manche Browser die Vorschübe sichtbar.
 *
 * Ohne Unterschneidung (Kerning): So zeichnet jsPDF, und es ist die größere der beiden
 * Breiten – was so gemessen passt, passt im Browser erst recht.
 */
function interBreite(text, groesse, staerke = 400) {
  interMessfeld.font = `${staerke} 100px Inter`;
  interMessfeld.fontKerning = 'none';
  return interMessfeld.measureText(text).width * groesse / 100;
}

// Versalhöhe von Inter: 1490 von 2048 Einheiten
const INTER_VERSALHOEHE = 1490 / 2048;

// ---------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------

function hexZuRgb(hex) {
  const wert = hex.replace('#', '');
  const voll = wert.length === 3 ? wert.split('').map((z) => z + z).join('') : wert;
  return [0, 2, 4].map((i) => parseInt(voll.slice(i, i + 2), 16));
}

function rgbZuHex(rgb) {
  return '#' + rgb.map((wert) => Math.round(wert).toString(16).padStart(2, '0')).join('');
}

// Relative Leuchtdichte nach WCAG – Grundlage des Kontrastverhältnisses
function leuchtdichte(hex) {
  const [r, g, b] = hexZuRgb(hex).map((wert) => {
    const anteil = wert / 255;
    return anteil <= 0.03928 ? anteil / 12.92 : ((anteil + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(a, b) {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

/*
 * Bringt eine Farbe auf ausreichenden Kontrast zu ihrem Hintergrund, indem sie schrittweise
 * mit Weiß bzw. Schwarz gemischt wird – so bleibt der Farbton erkennbar. Gebraucht wird das
 * für Ziffern und Wörter, die in der Kofferfarbe stehen: Dunkelblau auf dem schwarzen
 * Koffer wäre sonst so wenig zu lesen wie Gelb auf dem weißen Schild.
 *
 * Bildschirm und Pfeil behalten dagegen die exakte Farbe – sie *sind* die Farbe, an der
 * man den Koffer erkennt.
 */
function mitKontrast(farbe, hintergrund, mindest) {
  if (kontrast(farbe, hintergrund) >= mindest) return farbe;
  const richtung = leuchtdichte(hintergrund) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  const start = hexZuRgb(farbe);
  for (let anteil = 0.05; anteil <= 1; anteil += 0.05) {
    const misch = rgbZuHex(start.map((wert, i) => wert + (richtung[i] - wert) * anteil));
    if (kontrast(misch, hintergrund) >= mindest) return misch;
  }
  return rgbZuHex(richtung);
}

// Weiß oder Schwarz – je nachdem, was auf dieser Farbe besser zu lesen ist
function lesbarAuf(farbe) {
  return kontrast(farbe, '#ffffff') >= kontrast(farbe, '#1d1f23') ? '#ffffff' : '#1d1f23';
}

/*
 * Vorschlag für das Farbwort im Hinweisschild ("… nur iPads mit rotem
 * Bildschirmhintergrund"). Aus einem Farbwert lässt sich nur grob ableiten, wie Menschen
 * eine Farbe nennen – der Vorschlag ist deshalb ein Ausgangspunkt, das Feld bleibt änderbar.
 * Das Wort steht im Dativ, passend zum Satz.
 */
function farbwortVorschlag(hex) {
  const [r, g, b] = hexZuRgb(hex).map((wert) => wert / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const buntheit = max - min;
  // Hellwert und Sättigung nach HSV: Bei HSL gälte reines Blau als "halb hell", und ein
  // Marineblau wie #00008f landete knapp über der Grenze zu "dunkel"
  const hellwert = max;
  const saettigung = max === 0 ? 0 : buntheit / max;

  if (buntheit < 0.1) {
    if (hellwert > 0.9) return 'weißem';
    if (hellwert < 0.2) return 'schwarzem';
    return 'grauem';
  }

  let ton = 0;
  if (max === r) ton = ((g - b) / buntheit) % 6;
  else if (max === g) ton = (b - r) / buntheit + 2;
  else ton = (r - g) / buntheit + 4;
  ton = (ton * 60 + 360) % 360;

  let wort;
  if (ton < 15 || ton >= 345) wort = 'rot';
  else if (ton < 40) wort = hellwert < 0.65 ? 'braun' : 'orange';
  else if (ton < 66) wort = 'gelb';
  else if (ton < 165) wort = 'grün';
  else if (ton < 195) wort = 'türkis';
  else if (ton < 255) wort = 'blau';
  else if (ton < 290) wort = 'violett';
  else wort = 'pink';

  // Orange und Türkis sind nicht beugbar – dafür die Form auf "-farben"
  const endung = wort === 'orange' || wort === 'türkis' ? 'farbenem' : 'em';
  let vorsatz = '';
  if (hellwert < 0.6 && wort !== 'braun') vorsatz = 'dunkel';
  else if (hellwert > 0.85 && saettigung < 0.5) vorsatz = 'hell';
  return vorsatz + wort + endung;
}

// ---------------------------------------------------------------------------
// Handgeschriebene Kofferziffern
// ---------------------------------------------------------------------------

/*
 * Auf dem Kofferdeckel steht die Nummer wie von Hand aufgemalt: ein einzelner Strich,
 * rund abgeschlossen. Die "1" und die "3" stammen aus der Vorlage, die übrigen Ziffern
 * sind im selben Stil nachgezeichnet – Höhe 62 Einheiten, Mitte bei (0,0).
 *
 *   links, rechts   Ausdehnung des Strichs; daraus ergibt sich der Abstand bei
 *                   mehrstelligen Nummern
 */
const HANDZIFFERN = {
  0: { links: -17, rechts: 17, d: 'M 3,-30 C -10,-33 -17,-17 -17,1 C -17,18 -10,31 0,31 C 11,31 17,17 17,-1 C 17,-17 11,-31 -1,-31' },
  1: { links: -9, rechts: 3, d: 'M -9,-22 L 3,-31 L 3,31' },
  2: { links: -16, rechts: 17, d: 'M -15,-18 C -11,-31 13,-34 15,-15 C 16,-3 5,8 -16,31 L 17,31' },
  3: { links: -17, rechts: 17, d: 'M -14,-20 C -8,-33 14,-33 15,-17 C 16,-5 4,-2 -4,-1 C 9,-1 18,7 16,19 C 13,34 -11,34 -17,21' },
  4: { links: -17, rechts: 17, d: 'M 8,31 L 8,-31 L -17,13 L 17,13' },
  5: { links: -17, rechts: 17, d: 'M 15,-31 L -11,-31 L -14,-4 C -6,-10 14,-11 16,7 C 18,26 -1,35 -17,22' },
  6: { links: -17, rechts: 17, d: 'M 13,-28 C 1,-35 -16,-24 -17,0 C -18,22 -8,31 1,31 C 12,31 17,21 16,10 C 15,-2 5,-6 -3,-5 C -10,-4 -16,2 -17,9' },
  7: { links: -16, rechts: 16, d: 'M -16,-31 L 16,-31 L -5,31' },
  8: { links: -16, rechts: 16, d: 'M 0,-1 C -11,-3 -14,-11 -14,-17 C -14,-26 -7,-31 0,-31 C 7,-31 14,-26 14,-17 C 14,-11 11,-3 0,-1 C -12,1 -16,9 -16,17 C -16,26 -8,31 0,31 C 8,31 16,26 16,17 C 16,9 12,1 0,-1 Z' },
  9: { links: -16, rechts: 15, d: 'M 15,-14 C 13,-3 5,1 -2,0 C -11,-1 -16,-8 -16,-16 C -16,-25 -9,-31 -1,-31 C 9,-31 15,-23 15,-12 C 15,7 10,26 -13,30' }
};

const HANDZIFFER_ABSTAND = 9;

/*
 * Breite, die eine Nummer auf einer Deckelhälfte haben darf: Die Hälfte ist 68 Einheiten
 * breit, die Ziffer steht mittig darin und soll Luft zu Kante und Mittelnaht behalten.
 */
const DECKEL_PLATZ = 56;

/*
 * Inhalt einer Deckelhälfte, mittig um (0,0). Reine Ziffernfolgen werden aus den
 * Handziffern zusammengesetzt; enthält die Nummer etwas anderes (etwa "Kunst"), steht sie
 * in Inter – handgezeichnet gibt es nur Ziffern. Beides wird schmaler, wenn es nicht passt.
 *
 * Zurück kommt neben dem Markup die Breite, die die Nummer tatsächlich einnimmt – an ihr
 * richtet sich die Spitze des Pfeils aus, der auf die Nummer zeigt.
 */
function deckelnummer(nummer, farbe) {
  if (/^\d+$/.test(nummer)) {
    const ziffern = nummer.split('').map((z) => HANDZIFFERN[z]);
    const breite = ziffern.reduce((summe, z) => summe + z.rechts - z.links, 0) +
      HANDZIFFER_ABSTAND * (ziffern.length - 1);
    const skala = Math.min(1, DECKEL_PLATZ / breite);

    let x = -breite / 2;
    const pfade = ziffern.map((z) => {
      const pfad = `<path d="${z.d}" transform="translate(${rund(x - z.links)},0)"/>`;
      x += z.rechts - z.links + HANDZIFFER_ABSTAND;
      return pfad;
    }).join('');
    return {
      markup: skala < 1 ? `<g transform="scale(${rund(skala * 1000) / 1000})">${pfade}</g>` : pfade,
      breite: breite * skala
    };
  }

  // Versalhöhe wie die Handziffern (62), schmaler wenn nötig
  const groesse = Math.min(62 / INTER_VERSALHOEHE, 62 * DECKEL_PLATZ / interBreite(nummer, 62, 700));
  return {
    markup: `<text x="0" y="${rund(groesse * INTER_VERSALHOEHE / 2)}" text-anchor="middle" ` +
      `font-family="Inter, sans-serif" font-weight="700" font-size="${rund(groesse)}" ` +
      `fill="${farbe}" stroke="none">${xmlText(nummer)}</text>`,
    breite: interBreite(nummer, groesse, 700)
  };
}

/*
 * Die Pfeile in Karte 1 zeigen jeweils auf eine Nummer ihres Koffers: der von Koffer a auf
 * die untere, aufrechte, der von Koffer b auf die obere, kopfstehende. In der Vorlage endet
 * die Spitze knapp vor der schmalen "1" bzw. der "3"; eine breitere Nummer läge sonst
 * unter der Spitze.
 *
 *   mitte     x-Mitte der Nummer, auf die der Pfeil zeigt (aus der Vorlage)
 *   kante     Kante dieser Nummer in der Vorlage, vor der die Spitze endet
 *   seite     +1: Pfeil kommt von rechts, die rechte Kante zählt; -1: von links
 */
const PFEILZIELE = {
  a: { mitte: 63, kante: 66, seite: 1 },
  b: { mitte: 497, kante: 480, seite: -1 }
};

/*
 * Verschiebt Spitze und Hals eines Pfeils um `versatz` entlang der x-Achse. Das stumpfe
 * Ende bleibt stehen – es liegt am iPad – und der Pfeil wird entsprechend kürzer.
 */
function pfeilspitzeVerschieben(pfeil, versatz) {
  const punkte = pfeil.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const ende = punkte[0][0];
  pfeil.setAttribute('points', punkte
    .map(([x, y]) => `${x === ende ? x : rund(x + versatz)},${y}`)
    .join(' '));
}

// ---------------------------------------------------------------------------
// Vorlagen füllen
// ---------------------------------------------------------------------------

function vorlageLesen(text) {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

function vorlageSchreiben(dokument) {
  return new XMLSerializer().serializeToString(dokument.documentElement);
}

/*
 * Beschriftet das iPad einer Vorlage: Bildschirm in der Kofferfarbe, Name und Verzierung
 * in der Schriftfarbe. Ein langer Name wird schmaler gesetzt, damit er auf dem Bildschirm
 * bleibt (72 Einheiten breit, mit etwas Rand).
 */
function ipadBeschriften(dokument, praefix, { farbe, textfarbe, ipadName }) {
  dokument.getElementById(`${praefix}bildschirm`).setAttribute('fill', farbe);
  dokument.querySelectorAll(`.${praefix}deko`).forEach((el) => el.setAttribute('fill', textfarbe));

  const schrift = dokument.getElementById(`${praefix}name`);
  const groesse = Number(schrift.getAttribute('font-size'));
  const breite = interBreite(ipadName, groesse, 700);
  schrift.textContent = ipadName;
  schrift.setAttribute('fill', textfarbe);
  if (breite > 64) schrift.setAttribute('font-size', rund(groesse * 64 / breite));
}

/*
 * Hinweisschild für einen Koffer.
 *
 *   nummer      Koffernummer, groß neben "iPad-Koffer"
 *   farbe       Hintergrundfarbe der Sperrbildschirme
 *   textfarbe   Schriftfarbe der Sperrbildschirme (für das abgebildete iPad)
 *   farbwort    "rotem", "dunkelblauem" … – steht im Satz des Hinweises
 *   ipadName    Beschriftung des abgebildeten iPads, etwa "iPad-101"
 *   schildfarbe Farbe von Nummer und Farbwort; ohne Angabe die Kofferfarbe, bei zu wenig
 *               Kontrast zum weißen Schild angepasst (siehe mitKontrast)
 *   ausrichtung 'quer' oder 'hoch' – wählt die Vorlage
 *   link        Ziel des QR-Codes. Mit Link teilt sich die Seite: Das Schild der anderen
 *               Ausrichtung steht verkleinert in der einen Hälfte, der QR-Code mit seinen
 *               Notizen in der anderen. Ohne Link bleibt es beim Schild allein.
 */
function baueSchild({ nummer, farbe, textfarbe, farbwort, ipadName, schildfarbe, ausrichtung = 'quer', link = '' }) {
  const vorlagen = kofferZustand.vorlagen[ausrichtung];
  const dokument = vorlageLesen(link ? vorlagen.schildQr : vorlagen.schild);
  // Auf dem weißen Schild: Kontrast wie für große Schrift
  const schriftfarbe = schildfarbe || mitKontrast(farbe, '#ffffff', 3);

  if (link) {
    qrZeichnen(dokument.getElementById('qr-code'), link);
    dokument.querySelectorAll('.notiz.akzent').forEach((notiz) => notiz.setAttribute('fill', schriftfarbe));
  }

  // Koffernummer – nach rechts bis zu der Grenze, die die Vorlage nennt (data-rechts):
  // quer der Seitenrand, hochkant das iPad daneben. Passt sie nicht, wird sie schmaler.
  const zahl = dokument.getElementById('koffernummer');
  const groesse = Number(zahl.getAttribute('font-size'));
  const platz = Number(zahl.dataset.rechts) - Number(zahl.getAttribute('x'));
  const breite = interBreite(nummer, groesse, 800);
  zahl.textContent = nummer;
  zahl.setAttribute('fill', schriftfarbe);
  if (breite > platz) {
    const neu = groesse * platz / breite;
    zahl.setAttribute('font-size', rund(neu));
    // Nennt die Vorlage eine Mitte (data-mitte), bleibt die kleinere Nummer dort stehen –
    // hochkant neben dem iPad. Sonst hält sie ihre Grundlinie, quer die des Titels.
    if (zahl.dataset.mitte) {
      zahl.setAttribute('y', rund(Number(zahl.dataset.mitte) + neu * INTER_VERSALHOEHE / 2));
    }
  }

  hinweisSetzen(dokument.getElementById('hinweistext'), farbwort, schriftfarbe);
  ipadBeschriften(dokument, 'ipad-', { farbe, textfarbe, ipadName });
  return vorlageSchreiben(dokument);
}

/*
 * Setzt den Satz des Hinweises neu – mit dem Farbwort ändert sich die Länge der Zeilen.
 * Umbrochen wird nach Wörtern in die Breite, die die Vorlage am Feld angibt (data-breite);
 * die Zeilen stehen mittig zur mittleren Grundlinie der Vorlage (data-mitte).
 *
 * Jede Zeile ist ein <text>, Wörter gleicher Auszeichnung teilen sich ein <tspan>. Den
 * Wortabstand setzt so jeder Darsteller selbst: Feste Positionen je Wort stammten aus einer
 * Messung und passten nur zu dem, der unterschneidet – der Browser tut es, jsPDF nicht.
 */
function hinweisSetzen(feld, farbwort, farbe) {
  const x = Number(feld.dataset.x);
  const mitte = Number(feld.dataset.mitte);
  const breite = Number(feld.dataset.breite);
  const groesse = Number(feld.dataset.groesse);
  const zeilenabstand = Number(feld.dataset.zeilenabstand);

  const woerter = [
    ...'In diesen iPad-Koffer dürfen nur iPads mit'.split(' ').map((t) => ({ t, staerke: 400 })),
    { t: farbwort.trim() || 'dieser', staerke: 700, farbig: true },
    { t: 'Bildschirmhintergrund', staerke: 700, farbig: true },
    { t: '.', staerke: 400, angehaengt: true }
  ];
  const leer = interBreite(' ', groesse, 400);

  const zeilen = [[]];
  let belegt = 0;
  woerter.forEach((wort) => {
    wort.breite = interBreite(wort.t, groesse, wort.staerke);
    const zeile = zeilen[zeilen.length - 1];
    const zusatz = (zeile.length && !wort.angehaengt ? leer : 0) + wort.breite;
    // Der Punkt bleibt bei seinem Wort, auch wenn er die Zeile etwas überzieht
    if (zeile.length && !wort.angehaengt && belegt + zusatz > breite) {
      zeilen.push([wort]);
      belegt = wort.breite;
    } else {
      zeile.push(wort);
      belegt += zusatz;
    }
  });

  feld.innerHTML = zeilen.map((zeile, i) => {
    // Wörter gleicher Auszeichnung zu einem Stück zusammenfassen; das Leerzeichen hängt am
    // Ende des vorigen Stücks, wie in der Vorlage
    const stuecke = [];
    zeile.forEach((wort, j) => {
      const vorher = stuecke[stuecke.length - 1];
      const abstand = j > 0 && !wort.angehaengt ? ' ' : '';
      if (vorher && vorher.staerke === wort.staerke && vorher.farbig === Boolean(wort.farbig)) {
        vorher.t += abstand + wort.t;
      } else {
        if (vorher) vorher.t += abstand;
        stuecke.push({ t: wort.t, staerke: wort.staerke, farbig: Boolean(wort.farbig) });
      }
    });

    const grundlinie = mitte + (i - (zeilen.length - 1) / 2) * zeilenabstand;
    return `<text x="${rund(x)}" y="${rund(grundlinie)}" font-size="${groesse}" fill="#1d1f23">` +
      stuecke.map((stueck) => `<tspan font-weight="${stueck.staerke}"` +
        `${stueck.farbig ? ` fill="${farbe}"` : ''}>${xmlText(stueck.t)}</tspan>`).join('') +
      '</text>';
  }).join('');
}

/*
 * Kodiert den Link als QR-Code (qrcode-generator in assets/vendor) und zeichnet ihn in den
 * Platz, den die Vorlage am Element nennt (data-x, data-y, data-groesse). Der Platz schließt
 * die Ruhezone ein – vier Module Weiß ringsum, wie die Norm sie verlangt –, ein langer Link
 * macht die Module also kleiner, nicht den Code größer.
 *
 * Fehlerkorrektur Q: Ein Viertel des Codes darf zerkratzt oder verdeckt sein, das Schild
 * hängt im Klassenraum. Gezeichnet wird ein einziger Pfad, je Reihe zusammenhängende Module
 * als ein Rechteck – so bleibt das PDF klein und zeigt keine Haarlinien zwischen den Modulen.
 */
const QR_RUHEZONE = 4;

function qrZeichnen(platz, link) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const code = qrcode(0, 'Q');
  code.addData(link, 'Byte');
  try {
    code.make();
  } catch {
    throw new Error('Der Link ist zu lang für einen QR-Code.');
  }

  const anzahl = code.getModuleCount();
  const modul = Number(platz.dataset.groesse) / (anzahl + 2 * QR_RUHEZONE);
  const teile = [];
  for (let zeile = 0; zeile < anzahl; zeile++) {
    for (let spalte = 0; spalte < anzahl; spalte++) {
      if (!code.isDark(zeile, spalte)) continue;
      const anfang = spalte;
      while (spalte + 1 < anzahl && code.isDark(zeile, spalte + 1)) spalte++;
      teile.push(`M${anfang} ${zeile}h${spalte - anfang + 1}v1h-${spalte - anfang + 1}z`);
    }
  }

  const x = Number(platz.dataset.x) + QR_RUHEZONE * modul;
  const y = Number(platz.dataset.y) + QR_RUHEZONE * modul;
  platz.innerHTML = `<path transform="translate(${rund(x)},${rund(y)}) scale(${modul.toFixed(5)})" ` +
    `fill="#000000" d="${teile.join('')}"/>`;
}

/*
 * Ladeanleitung. Nur Karte 1 ändert sich: zwei Koffer mit ihren iPads, je mit
 *
 *   nummer      Koffernummer auf dem Deckel
 *   farbe       Bildschirm-, Pfeil- und Ziffernfarbe
 *   textfarbe   Schrift auf dem abgebildeten iPad
 *   ipadName    Beschriftung des iPads
 *   ziffernfarbe  Farbe der Nummer auf dem Deckel; ohne Angabe die Kofferfarbe, bei zu
 *                 wenig Kontrast zum dunklen Deckel angepasst
 *
 * a ist der Koffer der eingestellten Sperrbildschirme, b ein frei gewählter zum Vergleich.
 * `ausrichtung` ('quer' oder 'hoch') wählt die Vorlage. Hochkant ist nur die Anordnung der
 * Karten eine andere; das Bild von Karte 1 ist dasselbe, die Pfeilziele gelten deshalb weiter.
 */
function baueAnleitung({ a, b, ausrichtung = 'quer' }) {
  const dokument = vorlageLesen(kofferZustand.vorlagen[ausrichtung].anleitung);

  [['a', a], ['b', b]].forEach(([kennung, koffer]) => {
    // Die Ziffern stehen auf dem dunklen Deckel und brauchen dort genug Kontrast
    const ziffernfarbe = koffer.ziffernfarbe || mitKontrast(koffer.farbe, KOFFERDECKEL, 3);
    const gruppe = dokument.getElementById(`koffer-${kennung}-nummer`);
    const nummer = deckelnummer(koffer.nummer, ziffernfarbe);
    gruppe.setAttribute('stroke', ziffernfarbe);
    [...gruppe.children].forEach((haelfte) => { haelfte.innerHTML = nummer.markup; });

    // Pfeilspitze an die Kante der Nummer rücken, im selben Abstand wie in der Vorlage
    const ziel = PFEILZIELE[kennung];
    const pfeil = dokument.getElementById(`pfeil-${kennung}`);
    pfeil.setAttribute('fill', koffer.farbe);
    pfeilspitzeVerschieben(pfeil, ziel.mitte + ziel.seite * nummer.breite / 2 - ziel.kante);

    ipadBeschriften(dokument, `ipad-${kennung}-`, koffer);
  });

  return vorlageSchreiben(dokument);
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

/*
 * SVG mit eingebetteter Schrift – eingebettet werden nur die Stärken, die im Dokument
 * vorkommen. Ohne sie fiele das SVG auf einem Rechner ohne Inter auf eine Ersatzschrift
 * zurück, und in der Vorschau (als <img>) ebenso.
 */
function kofferSvgMitSchrift(svgText) {
  const staerken = new Set(['400']);
  for (const treffer of svgText.matchAll(/font-weight="(\d{3})"/g)) staerken.add(treffer[1]);

  const regeln = [...staerken]
    .filter((staerke) => kofferZustand.inter[staerke])
    .map((staerke) => '@font-face{font-family:"Inter";font-style:normal;' +
      `font-weight:${staerke};src:url(data:font/ttf;base64,${kofferZustand.inter[staerke]}) format("truetype");}`)
    .join('') +
    (svgText.includes(`font-family="${HANDSCHRIFT.familie}"`)
      ? `@font-face{font-family:"${HANDSCHRIFT.familie}";font-style:normal;font-weight:${HANDSCHRIFT.staerke};` +
        `src:url(data:font/ttf;base64,${kofferZustand.handschrift}) format("truetype");}`
      : '');

  return svgText.replace(/<svg\b[^>]*>/, (kopf) => `${kopf}<defs><style>${regeln}</style></defs>`);
}

/*
 * Vektor-PDF in DIN A4. Format und Ausrichtung der Seite stammen aus der viewBox des SVG
 * (Millimeter) – so passt das PDF zu jeder Vorlage. svg2pdf.js zeichnet das SVG mit jsPDF
 * nach; die Schrift muss dafür in jsPDF angemeldet sein – je Stärke ein Schnitt, unter dem
 * Namen, den die Vorlagen als font-family nennen.
 *
 * Das SVG geht dabei *ohne* eingebettete Schrift hinein: svg2pdf liest <style> mit und
 * müsste sich sonst durch mehrere hundert Kilobyte Data-URL arbeiten.
 */
async function kofferAlsPdf(svgText, titel) {
  const [, , breite, hoehe] = /viewBox="([^"]+)"/.exec(svgText)[1].trim().split(/[\s,]+/).map(Number);
  const pdf = new window.jspdf.jsPDF({
    orientation: breite > hoehe ? 'landscape' : 'portrait', unit: 'mm', format: [breite, hoehe], compress: true
  });
  INTER_STAERKEN.forEach((staerke) => {
    const datei = `Inter-${staerke}.ttf`;
    pdf.addFileToVFS(datei, kofferZustand.inter[staerke]);
    pdf.addFont(datei, 'Inter', 'normal', staerke);
  });
  pdf.addFileToVFS('Caveat.ttf', kofferZustand.handschrift);
  pdf.addFont('Caveat.ttf', HANDSCHRIFT.familie, 'normal', HANDSCHRIFT.staerke);
  pdf.setProperties({ title: titel });

  // svg2pdf wertet Stile über das Dokument aus – das Element muss deshalb eingehängt sein
  const huelle = document.createElement('div');
  huelle.style.cssText = 'position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  huelle.innerHTML = svgText;
  document.body.appendChild(huelle);
  gesperrteTexteZerlegen(huelle.firstElementChild);
  const zuruecksetzen = ohneUnterschneidungMessen();
  try {
    await pdf.svg(huelle.firstElementChild, { x: 0, y: 0, width: breite, height: hoehe });
  } finally {
    zuruecksetzen();
    huelle.remove();
  }
  return pdf.output('blob');
}

/*
 * svg2pdf kennt kein letter-spacing und setzte gesperrte Beschriftungen (Aux1/Charge auf der
 * Zeitschaltuhr) eng. Für den Export steht deshalb jeder Buchstabe als eigenes <text> an
 * seiner Stelle: Vorschub ohne Unterschneidung – so zeichnet jsPDF – plus Sperrung. Die
 * Sperrung hinter dem letzten Buchstaben zählt nicht mit, sonst stünde ein mittig
 * ausgerichteter Schriftzug ein Stück zu weit links.
 *
 * Erfasst werden nur einfache Texte mit eigener Schriftgröße und ohne <tspan>.
 */
function gesperrteTexteZerlegen(svg) {
  svg.querySelectorAll('text[letter-spacing]').forEach((text) => {
    const sperrung = Number(text.getAttribute('letter-spacing'));
    const groesse = Number(text.getAttribute('font-size'));
    if (!sperrung || !groesse || text.children.length) return;

    const staerke = text.getAttribute('font-weight') || 400;
    const zeichen = [...text.textContent];
    const vorschuebe = zeichen.map((z) => interBreite(z, groesse, staerke));
    const gesamt = vorschuebe.reduce((summe, v) => summe + v, 0) + sperrung * (zeichen.length - 1);
    const anker = text.getAttribute('text-anchor');
    let x = Number(text.getAttribute('x')) - (anker === 'middle' ? gesamt / 2 : anker === 'end' ? gesamt : 0);

    const gruppe = document.createElementNS(text.namespaceURI, 'g');
    zeichen.forEach((z, i) => {
      const einzeln = text.cloneNode(false);
      ['letter-spacing', 'text-anchor'].forEach((name) => einzeln.removeAttribute(name));
      einzeln.setAttribute('x', x);
      einzeln.textContent = z;
      gruppe.appendChild(einzeln);
      x += vorschuebe[i] + sperrung;
    });
    text.replaceWith(gruppe);
  });
}

/*
 * svg2pdf misst Textstücke im Browser – auf einer Leinwand oder an einem versteckten SVG –,
 * zeichnet sie dann aber mit jsPDF. Der Browser unterschneidet dabei, jsPDF nicht: Das
 * gezeichnete Stück fällt bis zu 2 % breiter aus als gemessen, und das nächste <tspan>
 * rückt in den Wortabstand ("mit der richtigen" verlor ein halbes Leerzeichen).
 *
 * Für die Dauer des Exports misst der Browser deshalb ohne Unterschneidung, auf beiden
 * Wegen. Zurück gibt es die Funktion, die alles wiederherstellt.
 */
function ohneUnterschneidungMessen() {
  const original = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function messen(text) {
    this.fontKerning = 'none';
    return original.call(this, text);
  };

  const stil = document.createElement('style');
  stil.textContent = 'text, tspan { font-kerning: none; }';
  document.head.appendChild(stil);

  return () => {
    CanvasRenderingContext2D.prototype.measureText = original;
    stil.remove();
  };
}
