/*
 * export.js – Ausgabe des fertigen Plans: Drucken, Bild und Speicherstand.
 *
 * Gedruckt wird die Seite selbst (die Regeln dafür stehen in styles.css). Das Bild
 * wird dagegen eigens auf ein <canvas> gezeichnet: So sieht es unabhängig vom
 * gewählten Design immer gleich aus und lässt sich ohne Fremdbibliothek erzeugen.
 */

/* ---------------------------------------------------------------------------
 * Drucken
 * ------------------------------------------------------------------------ */

function sitzplanDrucken(zustand) {
  if (!zustand.belegung) {
    toolhubMessage('planMeldung', 'Erst einen Sitzplan erzeugen, dann drucken.', 'warn', 'warnung');
    return;
  }
  // Die Überschrift steht nur im Ausdruck; am Bildschirm ist sie über CSS ausgeblendet
  document.getElementById('druckTitel').textContent = document.getElementById('planTitel').value.trim();
  window.print();
}

/* ---------------------------------------------------------------------------
 * Bild
 * ------------------------------------------------------------------------ */

/*
 * Farben des Bildes. Bewusst fest und hell: Ein PNG landet in Dokumenten, Mappen und
 * im Ausdruck, also auf Weiß – die dunkle Oberfläche des toolhubs wäre dort fehl am
 * Platz. Die Akzentfarbe ist die der Kategorie in der hellen Fassung.
 */
const SITZPLAN_BILDFARBEN = {
  grund: '#ffffff',
  text: '#1a2433',
  leise: '#5c6b7f',
  linie: '#c7d0dc',
  flaeche: '#e8edf5',
  akzent: '#a21caf',
  akzentText: '#ffffff',
  junge: '#3b4cca',
  maedchen: '#8a6100'
};

const SITZPLAN_BILDMASS = {
  feldX: 190,
  feldY: 108,
  rand: 36,
  tafel: 46,
  titelHoehe: 46
};

// Text auf die verfügbare Breite kürzen, notfalls mit Auslassungspunkten
function sitzplanKuerzen(ctx, text, breite) {
  if (ctx.measureText(text).width <= breite) return text;
  let gekuerzt = text;
  while (gekuerzt.length > 1 && ctx.measureText(`${gekuerzt}…`).width > breite) {
    gekuerzt = gekuerzt.slice(0, -1);
  }
  return `${gekuerzt}…`;
}

function sitzplanRundesRechteck(ctx, x, y, breite, hoehe, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, breite, hoehe, radius);
}

/*
 * Zeichnet den Plan auf ein neues <canvas> und gibt es zurück.
 * Die Lehrersicht spiegelt die Plätze waagerecht – gerechnet wird das beim Setzen der
 * Koordinaten, nicht über eine Transformation, sonst stünde auch die Schrift spiegelverkehrt.
 */
function sitzplanZeichneBild(zustand, einstellungen) {
  const { raum, geo, schueler, belegung } = zustand;
  const { feldX, feldY, rand, tafel, titelHoehe } = SITZPLAN_BILDMASS;
  const f = SITZPLAN_BILDFARBEN;

  const kopf = einstellungen.titel ? titelHoehe : 0;
  const breite = raum.breite * feldX + rand * 2;
  const hoehe = raum.tiefe * feldY + rand * 2 + tafel + 24 + kopf;

  const leinwand = document.createElement('canvas');
  leinwand.width = breite;
  leinwand.height = hoehe;
  const ctx = leinwand.getContext('2d');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  ctx.fillStyle = f.grund;
  ctx.fillRect(0, 0, breite, hoehe);

  if (einstellungen.titel) {
    ctx.fillStyle = f.text;
    ctx.font = '700 26px "Open Sans", Arial, sans-serif';
    ctx.fillText(einstellungen.titel, breite / 2, rand + 8);
  }

  // Tafel als Bezugspunkt: Ohne sie ist einem Blatt Papier nicht anzusehen, wo vorne ist
  const tafelY = rand + kopf;
  ctx.fillStyle = f.akzent;
  sitzplanRundesRechteck(ctx, rand, tafelY, raum.breite * feldX, tafel - 12, 6);
  ctx.fill();
  ctx.fillStyle = f.akzentText;
  ctx.font = '600 17px "Open Sans", Arial, sans-serif';
  ctx.fillText('T A F E L', breite / 2, tafelY + (tafel - 12) / 2);

  const obenY = tafelY + tafel + 12;
  const spiegeln = einstellungen.lehrersicht;
  const nachPlatzId = new Map(geo.plaetze.map((platz, i) => [platz.id, i]));

  raum.tische.forEach((tisch) => {
    const tischX = spiegeln ? raum.breite - (tisch.x + tisch.spalten) : tisch.x;
    ctx.fillStyle = f.flaeche;
    ctx.strokeStyle = f.linie;
    ctx.lineWidth = 1.5;
    sitzplanRundesRechteck(ctx, rand + tischX * feldX, obenY + tisch.y * feldY,
      tisch.spalten * feldX, tisch.reihen * feldY, 10);
    ctx.fill();
    ctx.stroke();

    for (let index = 0; index < tisch.spalten * tisch.reihen; index++) {
      const spalte = index % tisch.spalten;
      const reihe = Math.floor(index / tisch.spalten);
      const zeigeSpalte = spiegeln ? tisch.spalten - 1 - spalte : spalte;
      const x = rand + (tischX + zeigeSpalte) * feldX + 8;
      const y = obenY + (tisch.y + reihe) * feldY + 8;
      const w = feldX - 16;
      const h = feldY - 16;

      const p = nachPlatzId.get(`${tisch.id}-${index}`);
      const si = belegung ? belegung[p] : -1;
      const person = si >= 0 ? schueler[si] : null;

      ctx.fillStyle = f.grund;
      ctx.strokeStyle = f.linie;
      ctx.lineWidth = 1.5;
      sitzplanRundesRechteck(ctx, x, y, w, h, 7);
      ctx.fill();
      ctx.stroke();

      if (!person) {
        ctx.fillStyle = f.leise;
        ctx.font = '400 15px "Open Sans", Arial, sans-serif';
        ctx.fillText('frei', x + w / 2, y + h / 2);
        continue;
      }

      // Geschlecht als schmaler Balken an der Seite – im Ausdruck auch in Graustufen lesbar
      if (einstellungen.zeigeGeschlecht && person.geschlecht) {
        ctx.fillStyle = person.geschlecht === 'm' ? f.junge : f.maedchen;
        sitzplanRundesRechteck(ctx, x, y, 5, h, 2);
        ctx.fill();
      }

      const mitte = x + w / 2;
      const zeigeKlasse = einstellungen.zeigeKlasse && person.klasse;
      const versatz = zeigeKlasse ? -8 : 0;

      ctx.fillStyle = f.text;
      ctx.font = '700 18px "Open Sans", Arial, sans-serif';
      ctx.fillText(sitzplanKuerzen(ctx, person.nachname, w - 18), mitte, y + h / 2 - 11 + versatz);
      ctx.font = '400 17px "Open Sans", Arial, sans-serif';
      ctx.fillText(sitzplanKuerzen(ctx, person.vorname, w - 18), mitte, y + h / 2 + 10 + versatz);
      if (zeigeKlasse) {
        ctx.fillStyle = f.leise;
        ctx.font = '400 13px "Open Sans", Arial, sans-serif';
        ctx.fillText(sitzplanKuerzen(ctx, person.klasse, w - 18), mitte, y + h - 14);
      }
    }
  });

  return leinwand;
}

async function sitzplanAlsBild(zustand) {
  if (!zustand.belegung) {
    toolhubMessage('planMeldung', 'Erst einen Sitzplan erzeugen, dann als Bild sichern.', 'warn', 'warnung');
    return;
  }
  // Ohne das wird die erste Ausgabe in einer Ersatzschrift gesetzt
  if (document.fonts?.ready) await document.fonts.ready;

  const titel = document.getElementById('planTitel').value.trim();
  const leinwand = sitzplanZeichneBild(zustand, {
    titel,
    lehrersicht: document.getElementById('lehrersicht').checked,
    zeigeGeschlecht: document.getElementById('zeigeGeschlecht').checked,
    zeigeKlasse: document.getElementById('zeigeKlasse').checked
  });

  leinwand.toBlob((blob) => {
    const name = titel ? titel.replace(/[\\/:*?"<>|]/g, '-') : 'Sitzplan';
    toolhubDownload(blob, `${name}.png`);
  }, 'image/png');
}

/* ---------------------------------------------------------------------------
 * Speicherstand
 *
 * Die Sitzordnung wird als Zuordnung Platz -> Schüler gesichert und nicht als Liste
 * über die Plätze: So lässt sich ein Stand auch dann noch laden, wenn die Plätze
 * inzwischen in anderer Reihenfolge gezählt werden.
 * ------------------------------------------------------------------------ */

const SITZPLAN_DATEIVERSION = 1;

function sitzplanSichern(zustand) {
  if (!zustand.raum) return;
  const sitzordnung = {};
  if (zustand.belegung) {
    zustand.belegung.forEach((si, p) => {
      if (si >= 0) sitzordnung[zustand.geo.plaetze[p].id] = zustand.schueler[si].id;
    });
  }

  const daten = {
    version: SITZPLAN_DATEIVERSION,
    erzeugt: new Date().toISOString(),
    titel: document.getElementById('planTitel').value.trim(),
    schueler: zustand.schueler,
    raum: zustand.raum,
    regeln: zustand.regeln,
    sitzordnung
  };

  const name = daten.titel ? daten.titel.replace(/[\\/:*?"<>|]/g, '-') : 'Sitzplan';
  toolhubDownload(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }),
    `${name}.json`);
}

async function sitzplanLaden(zustand, datei) {
  const daten = JSON.parse(await toolhubReadText(datei));
  if (!daten || !Array.isArray(daten.schueler) || !daten.raum) {
    throw new Error('Das ist kein gesicherter Sitzplan.');
  }

  zustand.schueler = daten.schueler.map((person) => ({
    platzwunsch: 'egal', allein: false, festerPlatz: null, herkunft: 'datei', sicherheit: 'sicher',
    ...person
  }));
  Object.assign(zustand.regeln, daten.regeln || {});
  zustand.regeln.zusammen = daten.regeln?.zusammen || [];
  zustand.regeln.getrennt = daten.regeln?.getrennt || [];

  // Abschnitte einblenden, bevor gezeichnet wird – raumMassSetzen() misst die
  // verfügbare Breite, und die ist an einem ausgeblendeten Abschnitt null
  ['geschlechtPanel', 'raumPanel', 'regelnPanel', 'planPanel', 'exportPanel']
    .forEach((id) => abschnittZeigen(id));

  // Ohne Sitzordnung übernehmen, damit raumSetzen nichts aus dem alten Raum fortschreibt
  zustand.geo = null;
  zustand.belegung = null;
  raumSetzen(daten.raum);

  if (daten.sitzordnung) {
    const nachId = new Map(zustand.schueler.map((person, i) => [person.id, i]));
    const belegung = new Array(zustand.geo.plaetze.length).fill(-1);
    zustand.geo.plaetze.forEach((platz, p) => {
      const si = nachId.get(daten.sitzordnung[platz.id]);
      if (si !== undefined) belegung[p] = si;
    });
    zustand.belegung = belegung;
  }

  document.getElementById('planTitel').value = daten.titel || '';
  document.getElementById('verteilung').value = zustand.regeln.verteilung;
  document.getElementById('muster').value = zustand.regeln.muster;
  document.getElementById('musterHaerte').value = zustand.regeln.musterHart ? 'hart' : 'weich';
  document.getElementById('klassen').value = zustand.regeln.klassen;
  document.getElementById('klassenHaerte').value = zustand.regeln.klassenHart ? 'hart' : 'weich';
  document.getElementById('vordereReihen').value = zustand.regeln.vordereReihen;
  document.getElementById('wuenscheHaerte').value = zustand.regeln.wuenscheHart ? 'hart' : 'weich';

  geschlechtZeichnen();
  regelnZeichnen();
  if (zustand.belegung) planBerichten(); else planZeichnen();
  toolhubMessage('meldung',
    `Sitzplan geladen: ${zustand.schueler.length} Schüler, ${raumPlatzAnzahl(zustand.raum)} Plätze.`,
    'success', 'haken');
}
