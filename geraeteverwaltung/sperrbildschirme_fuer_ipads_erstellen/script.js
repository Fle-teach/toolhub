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
const praefix = document.getElementById('praefix');
const startNummer = document.getElementById('startNummer');
const endNummer = document.getElementById('endNummer');
const fuehrendeNullen = document.getElementById('fuehrendeNullen');
const nummernMeldung = document.getElementById('nummernMeldung');
const logoMeldung = document.getElementById('logoMeldung');
const statistik = document.getElementById('statistik');
const vorschauGitter = document.getElementById('vorschauGitter');
const mitHintergrundbild = document.getElementById('mitHintergrundbild');
const erzeugenBtn = document.getElementById('erzeugenBtn');
const erzeugenMeldung = document.getElementById('erzeugenMeldung');

// Das Wort links neben der Nummer – es benennt das Gerät und steht deshalb fest.
const GERAETEWORT = 'iPad';

// Mehr Bilder als das sind kein Klassensatz mehr, sondern ein Versehen (und würden den
// Browser beim Rastern lange beschäftigen).
const HOECHSTZAHL = 500;

/*
 * Alle Maße als Anteil der kürzeren Bildkante – so trägt dasselbe Layout Quer- und
 * Hochformat und jede benutzerdefinierte Auflösung.
 */
const LAYOUT = {
  schriftgroesse: 0.082,  // Höhe der Schrift
  wortMitte: 1 / 3,       // "iPad" – Anteil der *Breite*
  nummerMitte: 2 / 3,     // Laufnummer – Anteil der *Breite*
  logoMitte: 0.75,        // Mitte des Logos – Anteil der *Höhe*
  logoBreite: 0.42,       // Feld, in das das Logo eingepasst wird
  logoHoehe: 0.2
};

/*
 * Open Sans hat eine Versalhöhe von 1462 der 2048 Einheiten des Geviert, also 0,714 em.
 * Mittig wirkt die Zeile, wenn die Mitte der Versalhöhe auf der Bildmitte liegt – die
 * Grundlinie steht demnach eine halbe Versalhöhe darunter. (Auf die Zeilenhöhe kommt es
 * nicht an: Ober- und Unterlängen zählen für das Auge hier nicht mit.)
 */
const VERSALHOEHE_HALB = 0.357;

const SCHRIFT_URL = '../../assets/fonts/open-sans-latin-normal.woff2';

const zustand = {
  logo: null,      // { name, datenUrl } des hochgeladenen Logos
  schrift: null    // Data-URL der eingebetteten Schrift (wird einmal geladen)
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
 * Die Beschriftungen der Reihe, z. B. ["01", "02", … "15"] oder ["C 13", "C 14"].
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

  const stellen = fuehrendeNullen.checked ? String(ende).length : 1;
  const liste = [];
  for (let n = start; n <= ende; n++) liste.push(praefix.value + String(n).padStart(stellen, '0'));
  return { liste };
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
 * Erzeugt das SVG eines Sperrbildschirms.
 *
 *   text      Beschriftung rechts; ohne Angabe entsteht das reine Hintergrundbild
 *   logo      Data-URL des Logos (entfällt beim Hintergrundbild)
 *   schrift   Data-URL der eingebetteten Schriftdatei; ohne sie greift die Schrift
 *             der Umgebung – das genügt für die Vorschau innerhalb der Seite
 */
function baueSvg({ breite, hoehe, hintergrund, farbe, text, logo, schrift }) {
  const kurz = Math.min(breite, hoehe);
  const groesse = rund(kurz * LAYOUT.schriftgroesse);
  const teile = [];

  teile.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" ` +
    `viewBox="0 0 ${breite} ${hoehe}">`);

  if (text !== undefined && schrift) {
    // Die Schrift steckt im SVG selbst: beim Rastern über ein <img> wäre eine
    // Datei daneben nicht erreichbar, und ein weitergegebenes SVG bliebe sonst
    // auf die Schriften des fremden Rechners angewiesen.
    teile.push('<defs><style>' +
      '@font-face{font-family:"Open Sans";font-style:normal;font-weight:300 800;' +
      `src:url(${schrift}) format("woff2");}` +
      '</style></defs>');
  }

  teile.push(`<rect width="${breite}" height="${hoehe}" fill="${xmlText(hintergrund)}"/>`);

  if (text !== undefined) {
    const grundlinie = rund(hoehe / 2 + groesse * VERSALHOEHE_HALB);
    teile.push(`<g fill="${xmlText(farbe)}" font-family="'Open Sans', Helvetica, Arial, sans-serif" ` +
      `font-weight="700" font-size="${groesse}" text-anchor="middle">`);
    teile.push(`<text x="${rund(breite * LAYOUT.wortMitte)}" y="${grundlinie}">${xmlText(GERAETEWORT)}</text>`);
    teile.push(`<text x="${rund(breite * LAYOUT.nummerMitte)}" y="${grundlinie}">${xmlText(text)}</text>`);
    teile.push('</g>');

    if (logo) {
      // Das Logo wird in ein Feld eingepasst (preserveAspectRatio), statt es zu
      // verzerren – seine Mitte liegt dabei stets auf der Mitte des Feldes.
      const feldBreite = kurz * LAYOUT.logoBreite;
      const feldHoehe = kurz * LAYOUT.logoHoehe;
      teile.push(`<image x="${rund((breite - feldBreite) / 2)}" y="${rund(hoehe * LAYOUT.logoMitte - feldHoehe / 2)}" ` +
        `width="${rund(feldBreite)}" height="${rund(feldHoehe)}" ` +
        `preserveAspectRatio="xMidYMid meet" href="${xmlText(logo)}"/>`);
    }
  }

  teile.push('</svg>');
  return teile.join('\n');
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

async function logoEinlesen(datei) {
  const puffer = await toolhubReadArrayBuffer(datei);
  const istSvg = /\.svg$/i.test(datei.name) || datei.type === 'image/svg+xml';
  const typ = istSvg ? 'image/svg+xml' : (datei.type || 'image/png');

  // Ein SVG ohne viewBox hat kein festes Seitenverhältnis; beim Einpassen zöge es sich
  // dann auf das ganze Feld auseinander. Das lässt sich hier nicht heilen, aber sagen.
  let warnung = '';
  if (istSvg && !/viewBox\s*=/.test(toolhubDecode(puffer).text)) {
    warnung = 'Das SVG-Logo hat kein viewBox-Attribut – es könnte verzerrt erscheinen. ' +
      'Besser eine PNG-Datei verwenden oder das viewBox ergänzen.';
  }

  return { name: datei.name, datenUrl: `data:${typ};base64,${base64VonPuffer(puffer)}`, warnung };
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

/*
 * Die Vorschau zeigt den ersten und den letzten Sperrbildschirm der Reihe sowie – wenn
 * gewählt – das Hintergrundbild. Sie steht in der Seite und kommt deshalb ohne die
 * eingebettete Schrift aus.
 */
function aktualisiereVorschau() {
  eigenZeile.classList.toggle('disabled', auswahl('aufloesung') !== 'eigen');
  eigenBreite.disabled = eigenHoehe.disabled = auswahl('aufloesung') !== 'eigen';

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
      <p>${anzahl > 0 ? `${toolhubEscapeHtml(liste[0])} bis ${toolhubEscapeHtml(liste[anzahl - 1])}` : 'keine'}</p>
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

  const gemeinsam = {
    breite,
    hoehe,
    hintergrund: hintergrundFarbe.value,
    farbe: schriftFarbe.value,
    logo: zustand.logo ? zustand.logo.datenUrl : null
  };

  const bilder = [];
  if (anzahl > 0) bilder.push({ titel: `${GERAETEWORT} ${liste[0]}`, text: liste[0] });
  if (anzahl > 1) bilder.push({ titel: `${GERAETEWORT} ${liste[anzahl - 1]}`, text: liste[anzahl - 1] });
  if (mitHintergrundbild.checked) bilder.push({ titel: 'Hintergrundbild', text: undefined });

  vorschauGitter.innerHTML = bilder.map((bild) => `
    <figure class="vorschau">
      <div class="vorschau-bild">${baueSvg({ ...gemeinsam, text: bild.text })}</div>
      <figcaption>${toolhubEscapeHtml(bild.titel)}</figcaption>
    </figure>`).join('');
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
    const schrift = await schriftEinbettung();
    const gemeinsam = {
      breite,
      hoehe,
      hintergrund: hintergrundFarbe.value,
      farbe: schriftFarbe.value,
      logo: zustand.logo ? zustand.logo.datenUrl : null,
      schrift
    };

    const aufgaben = liste.map((text) => ({ text, name: `${GERAETEWORT}-${text}` }));
    if (mitHintergrundbild.checked) aufgaben.push({ text: undefined, name: 'Hintergrund' });

    const zip = new JSZip();
    for (let i = 0; i < aufgaben.length; i++) {
      const aufgabe = aufgaben[i];
      toolhubMessage(erzeugenMeldung,
        `Bild ${i + 1} von ${aufgaben.length} wird erzeugt …`, 'info', 'sanduhr');

      const svg = baueSvg({ ...gemeinsam, text: aufgabe.text });
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

[eigenBreite, eigenHoehe, praefix, startNummer, endNummer].forEach((feld) => {
  feld.addEventListener('input', aktualisiereVorschau);
});

[fuehrendeNullen, mitHintergrundbild].forEach((feld) => {
  feld.addEventListener('change', aktualisiereVorschau);
});

document.querySelectorAll('input[name="aufloesung"], input[name="ausrichtung"]').forEach((feld) => {
  feld.addEventListener('change', aktualisiereVorschau);
});

toolhubUpload({
  input: 'logoInput',
  zone: 'logoZone',
  list: 'logoListe',
  extensions: ['.svg', '.png', '.jpg', '.jpeg', '.webp'],
  onInvalid: (namen) => toolhubMessage(logoMeldung,
    `Kein Bildformat: ${namen.join(', ')} – erwartet werden .svg, .png, .jpg oder .webp.`, 'error', 'kreuz'),
  onChange: async (dateien) => {
    if (dateien.length === 0) {
      zustand.logo = null;
      toolhubMessage(logoMeldung, '');
      aktualisiereVorschau();
      return;
    }

    try {
      zustand.logo = await logoEinlesen(dateien[0]);
      toolhubMessage(logoMeldung,
        zustand.logo.warnung || `Logo „${zustand.logo.name}“ übernommen.`,
        zustand.logo.warnung ? 'warn' : 'success',
        zustand.logo.warnung ? 'warnung' : 'haken');
    } catch (ausnahme) {
      zustand.logo = null;
      toolhubMessage(logoMeldung, `Logo konnte nicht gelesen werden: ${ausnahme.message}`, 'error', 'kreuz');
    }
    aktualisiereVorschau();
  }
});

aktualisiereVorschau();
