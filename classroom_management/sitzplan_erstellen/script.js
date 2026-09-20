/*
 * script.js – Einstiegsdatei des Sitzplan-Tools.
 *
 * Hier stehen der Zustand, die Oberfläche der Schritte 3 bis 6 und die Verdrahtung
 * aller Bedienelemente. Die Fachteile liegen daneben:
 *   liste.js       Datei einlesen, Spalten zuordnen, Geschlecht prüfen (Schritt 1 + 2)
 *   raum.js        Raummodell, Vorlagen, Geometrie
 *   verteilung.js  Regeln, Kosten, Suche
 *   export.js      Drucken, Bild, Speicherstand
 */

const zustand = {
  quelle: null,               // { felder, zeilen } der eingelesenen Datei
  zuordnung: {},              // Feldname -> Spaltenname ('' = nicht zugeordnet)
  schueler: [],
  raum: null,
  geo: null,
  belegung: null,             // Array über geo.plaetze: Schülerindex oder -1
  markiert: new Set(),        // Plätze, die an einem Regelverstoß beteiligt sind
  lauf: null,                 // laufende Optimierung
  regeln: {
    verteilung: 'zufall',
    muster: 'keins',
    musterHart: false,
    klassen: 'egal',
    klassenHart: false,
    vordereReihen: 2,
    wuenscheHart: false,
    zusammen: [],
    getrennt: []
  }
};

let paarZaehler = 0;

/* ---------------------------------------------------------------------------
 * Kleinkram
 * ------------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function abschnittZeigen(id, sichtbar = true) {
  $(id).classList.toggle('visible', sichtbar);
}

function schuelerName(person) {
  return `${person.nachname}, ${person.vorname}`.replace(/^, |, $/, '');
}

/*
 * Der Name, unter dem ein Kind im Sitzplan steht: der Rufname, sonst der Vorname.
 * Gemeint ist die Anrede im Unterricht – deshalb steht er zuerst und hervorgehoben,
 * und der Nachname darunter nur, wenn er gebraucht wird.
 */
function schuelerRufname(person) {
  return person.rufname || person.vorname || person.nachname;
}

// Die beiden Zahlenfelder des Raum-Werkzeugs als Maßangabe
function raumMassEingabe() {
  return {
    breite: Math.max(1, parseInt($('raumBreite').value, 10) || 1),
    tiefe: Math.max(1, parseInt($('raumTiefe').value, 10) || 1)
  };
}

function klassenVorhanden() {
  return new Set(zustand.schueler.map((s) => s.klasse).filter(Boolean)).size > 1;
}

/* ---------------------------------------------------------------------------
 * Schritt 3 – Raum
 * ------------------------------------------------------------------------ */

/*
 * Neuen Raum übernehmen. Wer schon einen Platz hatte, behält ihn, sofern es den Platz
 * noch gibt – so lässt sich ein Tisch verschieben, ohne den ganzen Plan zu verlieren.
 */
function raumSetzen(raum) {
  const vorher = new Map();
  if (zustand.geo && zustand.belegung) {
    zustand.belegung.forEach((si, p) => {
      if (si >= 0) vorher.set(zustand.geo.plaetze[p].id, zustand.schueler[si].id);
    });
  }

  zustand.raum = raum;
  raumZaehlerAngleichen(raum);
  zustand.geo = raumGeometrie(raum);

  if (vorher.size) {
    const nachId = new Map(zustand.schueler.map((s, i) => [s.id, i]));
    const belegung = new Array(zustand.geo.plaetze.length).fill(-1);
    const gesetzt = new Set();
    zustand.geo.plaetze.forEach((platz, p) => {
      const schuelerId = vorher.get(platz.id);
      const si = nachId.get(schuelerId);
      if (si !== undefined) { belegung[p] = si; gesetzt.add(si); }
    });
    // Wessen Platz weggefallen ist, rückt auf einen freien nach
    zustand.schueler.forEach((_, si) => {
      if (gesetzt.has(si)) return;
      const frei = belegung.indexOf(-1);
      if (frei >= 0) belegung[frei] = si;
    });
    zustand.belegung = belegung;
  } else {
    zustand.belegung = null;
  }

  // Feste Plätze, die es nicht mehr gibt, lösen sich auf
  const vorhandene = new Set(zustand.geo.plaetze.map((platz) => platz.id));
  zustand.schueler.forEach((person) => {
    if (person.festerPlatz && !vorhandene.has(person.festerPlatz)) person.festerPlatz = null;
  });

  $('raumBreite').value = raum.breite;
  $('raumTiefe').value = raum.tiefe;
  raumEditorZeichnen();
  planZeichnen();
  wuenscheZeichnen();
}

/*
 * Rastermaße am Raum setzen. Die Feldbreite richtet sich nach dem Platz, der da ist:
 * Ein breiter Raum (U-Form, 13 Plätze nebeneinander) passt so noch ganz ins Bild,
 * statt seitlich wegzuscrollen – man muss den Raum ja als Ganzes sehen. Nach unten
 * begrenzt, weil unter etwa 58 Pixeln kein Name mehr lesbar ist; dann bleibt es beim
 * Scrollen (overflow-x der Bühne).
 */
function raumMassSetzen(element) {
  element.style.setProperty('--breite', zustand.raum.breite);
  element.style.setProperty('--tiefe', zustand.raum.tiefe);

  const buehne = element.closest('.raum-buehne');
  const verfuegbar = buehne ? buehne.clientWidth : 0;
  // 0 heißt: der Abschnitt ist noch ausgeblendet – dann beim Standardmaß aus dem CSS bleiben
  if (!verfuegbar) return;
  const feldX = Math.min(108, Math.max(58, Math.floor(verfuegbar / zustand.raum.breite)));
  element.style.setProperty('--feld-x', `${feldX}px`);
  element.style.setProperty('--feld-y', `${Math.min(62, Math.max(42, Math.round(feldX * 0.57)))}px`);
}

function raumEditorZeichnen() {
  const raum = zustand.raum;
  const flaeche = $('raumEditor').querySelector('.raum-flaeche');
  raumMassSetzen($('raumEditor'));
  flaeche.innerHTML = '';

  const nummern = new Map(zustand.geo.plaetze.map((platz, i) => [platz.id, i + 1]));

  raum.tische.forEach((tisch) => {
    const el = document.createElement('div');
    el.className = 'tisch';
    el.dataset.id = tisch.id;
    el.style.setProperty('--x', tisch.x);
    el.style.setProperty('--y', tisch.y);
    el.style.setProperty('--spalten', tisch.spalten);
    el.style.setProperty('--reihen', tisch.reihen);

    for (let index = 0; index < tisch.spalten * tisch.reihen; index++) {
      const platz = document.createElement('div');
      platz.className = 'platz leer';
      platz.innerHTML = `<span class="platz-inhalt">${nummern.get(`${tisch.id}-${index}`) || ''}</span>`;
      el.appendChild(platz);
    }

    const knoepfe = document.createElement('div');
    knoepfe.className = 'tisch-knoepfe';
    knoepfe.innerHTML =
      '<button type="button" class="tisch-knopf" data-tat="drehen" title="Tisch drehen">⟳</button>' +
      '<button type="button" class="tisch-knopf" data-tat="weg" title="Tisch entfernen">×</button>';
    el.appendChild(knoepfe);

    flaeche.appendChild(el);
  });

  const plaetze = raumPlatzAnzahl(raum);
  const anzahl = zustand.schueler.length;
  if (!plaetze) {
    toolhubMessage('raumStatus', 'Der Raum hat noch keine Tische.', 'warn', 'warnung');
  } else if (plaetze < anzahl) {
    toolhubMessage('raumStatus',
      `${plaetze} Plätze für ${anzahl} Schüler – es fehlen ${anzahl - plaetze}.`, 'error', 'kreuz');
  } else {
    toolhubMessage('raumStatus',
      `${plaetze} Plätze für ${anzahl} Schüler${plaetze > anzahl ? ` (${plaetze - anzahl} bleiben frei)` : ''}.`,
      'success', 'haken');
  }
}

/*
 * Tische verschieben. Gerechnet wird in Rasterfeldern: Die Maus zieht den Tisch
 * stufenlos, abgelegt wird er aber immer auf einem Feld. Eine Stelle, an der er nicht
 * hinpasst, wird rot markiert und der Tisch springt beim Loslassen zurück.
 */
function raumEditorVerdrahten() {
  const editor = $('raumEditor');
  const flaeche = editor.querySelector('.raum-flaeche');
  let zug = null;

  editor.addEventListener('pointerdown', (ereignis) => {
    const knopf = ereignis.target.closest('.tisch-knopf');
    const el = ereignis.target.closest('.tisch');
    if (!el) return;

    if (knopf) {
      if (knopf.dataset.tat === 'drehen') {
        if (!raumTischDrehen(zustand.raum, el.dataset.id)) {
          toolhubMessage('raumStatus', 'Gedreht passt der Tisch hier nicht – erst Platz schaffen.', 'warn', 'warnung');
          return;
        }
      } else {
        raumTischEntfernen(zustand.raum, el.dataset.id);
      }
      raumSetzen(zustand.raum);
      return;
    }

    const tisch = zustand.raum.tische.find((t) => t.id === el.dataset.id);
    const mass = flaeche.getBoundingClientRect();
    zug = {
      el,
      tisch,
      feldX: mass.width / zustand.raum.breite,
      feldY: mass.height / zustand.raum.tiefe,
      startX: ereignis.clientX,
      startY: ereignis.clientY,
      x: tisch.x,
      y: tisch.y,
      gueltig: true
    };
    el.classList.add('zieht');
    el.setPointerCapture(ereignis.pointerId);
    ereignis.preventDefault();
  });

  editor.addEventListener('pointermove', (ereignis) => {
    if (!zug) return;
    const x = zug.tisch.x + Math.round((ereignis.clientX - zug.startX) / zug.feldX);
    const y = zug.tisch.y + Math.round((ereignis.clientY - zug.startY) / zug.feldY);
    zug.x = Math.max(0, Math.min(x, zustand.raum.breite - zug.tisch.spalten));
    zug.y = Math.max(0, Math.min(y, zustand.raum.tiefe - zug.tisch.reihen));
    zug.gueltig = raumPlatzFrei(zustand.raum, { ...zug.tisch, x: zug.x, y: zug.y }, zug.tisch.id);
    zug.el.style.setProperty('--x', zug.x);
    zug.el.style.setProperty('--y', zug.y);
    zug.el.classList.toggle('ungueltig', !zug.gueltig);
  });

  const beenden = () => {
    if (!zug) return;
    zug.el.classList.remove('zieht', 'ungueltig');
    if (zug.gueltig) {
      zug.tisch.x = zug.x;
      zug.tisch.y = zug.y;
    }
    zug = null;
    raumSetzen(zustand.raum);
  };
  editor.addEventListener('pointerup', beenden);
  editor.addEventListener('pointercancel', beenden);
}

/* ---------------------------------------------------------------------------
 * Schritt 4 – Regeln
 * ------------------------------------------------------------------------ */

function regelnZeichnen() {
  $('klassenZeile').style.display = klassenVorhanden() ? '' : 'none';
  paarListeZeichnen('zusammen');
  paarListeZeichnen('getrennt');
  wuenscheZeichnen();
}

const PAAR_MODI = {
  zusammen: [
    { wert: 'nebeneinander', text: 'direkt nebeneinander' },
    { wert: 'tisch', text: 'am selben Tisch' }
  ],
  getrennt: [
    { wert: 'nebeneinander', text: 'nicht nebeneinander' },
    { wert: 'tisch', text: 'nicht am selben Tisch' },
    { wert: 'abstand', text: 'mindestens … Plätze auseinander' }
  ]
};

function personenAuswahl(wert) {
  const auswahl = document.createElement('select');
  auswahl.className = 'person';
  auswahl.innerHTML = '<option value="">– Schüler wählen –</option>' +
    zustand.schueler.map((person) =>
      `<option value="${toolhubEscapeHtml(person.id)}">${toolhubEscapeHtml(schuelerName(person))}</option>`).join('');
  auswahl.value = wert || '';
  return auswahl;
}

function paarListeZeichnen(art) {
  const behaelter = $(art === 'zusammen' ? 'zusammenListe' : 'getrenntListe');
  behaelter.innerHTML = '';

  zustand.regeln[art].forEach((eintrag) => {
    const zeile = document.createElement('div');
    zeile.className = 'paar-zeile';

    eintrag.mitglieder.forEach((id, index) => {
      const auswahl = personenAuswahl(id);
      auswahl.addEventListener('change', () => {
        eintrag.mitglieder[index] = auswahl.value;
        planBerichten();
      });
      zeile.appendChild(auswahl);
    });

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'btn-secondary btn-small';
    plus.textContent = '+';
    plus.title = 'weiteren Schüler zu dieser Gruppe';
    plus.addEventListener('click', () => {
      eintrag.mitglieder.push('');
      paarListeZeichnen(art);
    });
    zeile.appendChild(plus);

    const modus = document.createElement('select');
    modus.innerHTML = PAAR_MODI[art]
      .map((m) => `<option value="${m.wert}">${m.text}</option>`).join('');
    modus.value = eintrag.modus;
    zeile.appendChild(modus);

    const abstand = document.createElement('input');
    abstand.type = 'number';
    abstand.min = '1';
    abstand.max = '12';
    abstand.value = eintrag.abstand;
    abstand.style.width = '64px';
    abstand.style.display = eintrag.modus === 'abstand' ? '' : 'none';
    abstand.addEventListener('change', () => {
      eintrag.abstand = Math.max(1, parseInt(abstand.value, 10) || 1);
      planBerichten();
    });
    zeile.appendChild(abstand);

    modus.addEventListener('change', () => {
      eintrag.modus = modus.value;
      abstand.style.display = modus.value === 'abstand' ? '' : 'none';
      planBerichten();
    });

    const haerte = document.createElement('select');
    haerte.className = 'haerte';
    haerte.innerHTML = '<option value="weich">weich</option><option value="hart">hart</option>';
    haerte.value = eintrag.hart ? 'hart' : 'weich';
    haerte.addEventListener('change', () => {
      eintrag.hart = haerte.value === 'hart';
      planBerichten();
    });
    zeile.appendChild(haerte);

    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'paar-weg';
    weg.textContent = '×';
    weg.title = 'Vorgabe entfernen';
    weg.addEventListener('click', () => {
      const index = zustand.regeln[art].indexOf(eintrag);
      zustand.regeln[art].splice(index, 1);
      paarListeZeichnen(art);
      planBerichten();
    });
    zeile.appendChild(weg);

    behaelter.appendChild(zeile);
  });
}

function paarHinzufuegen(art) {
  paarZaehler += 1;
  zustand.regeln[art].push({
    id: `r${paarZaehler}`,
    mitglieder: ['', ''],
    modus: 'nebeneinander',
    abstand: 3,
    hart: false
  });
  paarListeZeichnen(art);
}

function wuenscheZeichnen() {
  const koerper = $('wuenscheKoerper');
  koerper.innerHTML = '';
  const platzName = new Map();
  if (zustand.geo) {
    zustand.geo.plaetze.forEach((platz, i) => platzName.set(platz.id, `Platz ${i + 1}`));
  }

  zustand.schueler.forEach((person) => {
    const zeile = document.createElement('tr');

    const name = document.createElement('td');
    name.textContent = schuelerName(person);
    const klasse = document.createElement('td');
    klasse.textContent = person.klasse || '–';

    const wunsch = document.createElement('select');
    wunsch.innerHTML =
      '<option value="egal">egal</option>' +
      '<option value="vorne">muss weit vorne sitzen</option>' +
      '<option value="nicht_hinten">nicht in der letzten Reihe</option>';
    wunsch.value = person.platzwunsch;
    wunsch.addEventListener('change', () => {
      person.platzwunsch = wunsch.value;
      planBerichten();
    });
    const zelleWunsch = document.createElement('td');
    zelleWunsch.appendChild(wunsch);

    const allein = document.createElement('input');
    allein.type = 'checkbox';
    allein.checked = person.allein;
    allein.addEventListener('change', () => {
      person.allein = allein.checked;
      planBerichten();
    });
    const zelleAllein = document.createElement('td');
    zelleAllein.appendChild(allein);

    const zelleFest = document.createElement('td');
    if (person.festerPlatz) {
      zelleFest.textContent = `${platzName.get(person.festerPlatz) || person.festerPlatz} `;
      const loesen = document.createElement('button');
      loesen.type = 'button';
      loesen.className = 'paar-weg';
      loesen.textContent = '×';
      loesen.title = 'Platz wieder freigeben';
      loesen.addEventListener('click', () => {
        person.festerPlatz = null;
        wuenscheZeichnen();
        planZeichnen();
      });
      zelleFest.appendChild(loesen);
    } else {
      zelleFest.textContent = '–';
    }

    zeile.append(name, klasse, zelleWunsch, zelleAllein, zelleFest);
    koerper.appendChild(zeile);
  });
}

function regelnEinlesen() {
  const regeln = zustand.regeln;
  regeln.verteilung = $('verteilung').value;
  regeln.muster = $('muster').value;
  regeln.musterHart = $('musterHaerte').value === 'hart';
  regeln.klassen = klassenVorhanden() ? $('klassen').value : 'egal';
  regeln.klassenHart = $('klassenHaerte').value === 'hart';
  regeln.vordereReihen = Math.max(1, parseInt($('vordereReihen').value, 10) || 2);
  regeln.wuenscheHart = $('wuenscheHaerte').value === 'hart';
  return regeln;
}

/* ---------------------------------------------------------------------------
 * Schritt 5 – Sitzplan
 * ------------------------------------------------------------------------ */

// Die Knöpfe während der Suche umschalten – „Beenden“ ist nur dann etwas wert
function planLaeuft(laeuft) {
  $('fortschritt').classList.toggle('laeuft', laeuft);
  if (!laeuft) $('fortschrittBalken').style.width = '0';
  $('erzeugenBtn').disabled = laeuft;
  $('weiterBtn').disabled = laeuft;
  $('stoppBtn').disabled = !laeuft;
}

function planZuruecksetzen() {
  zustand.belegung = null;
  zustand.markiert = new Set();
  planZeichnen();
  toolhubMessage('planMeldung', '');
}

function planErzeugen(vonVorne) {
  if (!zustand.schueler.length) return;
  if (!raumPlatzAnzahl(zustand.raum)) {
    toolhubMessage('planMeldung', 'Der Raum hat keine Tische – bitte erst eine Vorlage wählen.', 'error', 'kreuz');
    return;
  }

  const ctx = sitzplanKontext(zustand.raum, zustand.schueler, regelnEinlesen());
  const start = vonVorne || !zustand.belegung
    ? sitzplanStartbelegung(ctx, zustand.regeln.verteilung)
    : zustand.belegung.slice();

  zustand.lauf?.abbrechen();
  planLaeuft(true);
  toolhubMessage('planMeldung', 'Der Sitzplan wird gesucht …', 'info', 'sanduhr');

  zustand.lauf = sitzplanOptimieren(ctx, start, {
    aufFortschritt: (anteil) => {
      $('fortschrittBalken').style.width = `${Math.round(anteil * 100)}%`;
    },
    aufFertig: (belegung) => {
      zustand.lauf = null;
      zustand.belegung = belegung;
      planLaeuft(false);
      planBerichten();
    }
  });
}

// Bewertet die aktuelle Belegung neu – nach jeder Regeländerung und nach jedem Tausch
function planBerichten() {
  if (!zustand.belegung) return;
  const ctx = sitzplanKontext(zustand.raum, zustand.schueler, regelnEinlesen());
  const bericht = sitzplanBericht(zustand.belegung, ctx);
  zustand.markiert = bericht.markiert;

  const offen = bericht.zeilenWeich.length
    ? ['Weiche Regeln, die offen geblieben sind:', ...bericht.zeilenWeich]
    : [];
  if (bericht.zeilenHart.length) {
    toolhubMessage('planMeldung',
      ['Harte Regeln gehen in diesem Raum nicht auf:', ...bericht.zeilenHart, ...offen],
      'error', 'kreuz');
  } else if (offen.length) {
    toolhubMessage('planMeldung', offen, 'warn', 'warnung');
  } else {
    toolhubMessage('planMeldung', 'Alle Regeln sind erfüllt.', 'success', 'haken');
  }
  planZeichnen();
}

function planZeichnen() {
  const el = $('raumPlan');
  const flaeche = el.querySelector('.raum-flaeche');
  if (!zustand.raum) return;
  raumMassSetzen(el);
  el.classList.toggle('gedreht', $('lehrersicht').checked);
  flaeche.innerHTML = '';

  const zeigeNachname = $('zeigeNachname').checked;
  const zeigeGeschlecht = $('zeigeGeschlecht').checked;
  const zeigeKlasse = $('zeigeKlasse').checked;
  const zeigeVerstoesse = $('zeigeVerstoesse').checked;
  const nachPlatzId = new Map(zustand.geo.plaetze.map((platz, i) => [platz.id, i]));

  zustand.raum.tische.forEach((tisch) => {
    const tischEl = document.createElement('div');
    tischEl.className = 'tisch';
    tischEl.style.setProperty('--x', tisch.x);
    tischEl.style.setProperty('--y', tisch.y);
    tischEl.style.setProperty('--spalten', tisch.spalten);
    tischEl.style.setProperty('--reihen', tisch.reihen);

    for (let index = 0; index < tisch.spalten * tisch.reihen; index++) {
      const platzId = `${tisch.id}-${index}`;
      const p = nachPlatzId.get(platzId);
      const si = zustand.belegung ? zustand.belegung[p] : -1;
      const person = si >= 0 ? zustand.schueler[si] : null;

      const platzEl = document.createElement('div');
      platzEl.className = 'platz';
      platzEl.dataset.platz = platzId;
      if (!person) {
        platzEl.classList.add('leer');
        platzEl.innerHTML = '<span class="platz-inhalt">frei</span>';
      } else {
        if (zeigeGeschlecht && person.geschlecht) platzEl.classList.add(`g-${person.geschlecht}`);
        if (zeigeVerstoesse && zustand.markiert.has(p)) platzEl.classList.add('verstoss');
        if (person.festerPlatz === platzId) platzEl.classList.add('fest');
        const zeichen = zeigeGeschlecht ? toolhubGeschlechtZeichen(person.geschlecht) : '';
        platzEl.innerHTML =
          '<span class="platz-inhalt">' +
            `<span class="name hauptname">${zeichen ? `<span class="zeichen">${zeichen}</span>` : ''}` +
            `${toolhubEscapeHtml(schuelerRufname(person))}</span>` +
            (zeigeNachname && person.nachname ? `<span class="name">${toolhubEscapeHtml(person.nachname)}</span>` : '') +
            (zeigeKlasse && person.klasse ? `<span class="zusatz">${toolhubEscapeHtml(person.klasse)}</span>` : '') +
          '</span>';
        platzEl.title = `${schuelerName(person)} – klicken, um den Platz festzuhalten`;
      }
      tischEl.appendChild(platzEl);
    }
    flaeche.appendChild(tischEl);
  });

  // Wer keinen Platz bekommen hat, steht unter dem Plan – sonst verschwände er lautlos
  const uebrig = $('uebrigeSchueler');
  uebrig.innerHTML = '';
  if (zustand.belegung) {
    const gesetzt = new Set(zustand.belegung.filter((si) => si >= 0));
    const ohne = zustand.schueler.filter((_, si) => !gesetzt.has(si));
    if (ohne.length) {
      uebrig.innerHTML = `<span class="titel">Ohne Platz (${ohne.length}) – es fehlen Tische:</span>` +
        ohne.map((person) => `<span class="person">${toolhubEscapeHtml(schuelerName(person))}</span>`).join('');
    }
  }
}

/*
 * Im Plan: einen Platz auf einen anderen ziehen tauscht die beiden Schüler; ein Klick
 * ohne Bewegung heftet den Schüler auf seinem Platz fest bzw. löst ihn wieder.
 */
function planVerdrahten() {
  const el = $('raumPlan');
  let zug = null;

  el.addEventListener('pointerdown', (ereignis) => {
    const platzEl = ereignis.target.closest('.platz');
    if (!platzEl || !zustand.belegung) return;
    zug = { von: platzEl, bewegt: false, ziel: null };
    platzEl.setPointerCapture(ereignis.pointerId);
    ereignis.preventDefault();
  });

  el.addEventListener('pointermove', (ereignis) => {
    if (!zug) return;
    zug.bewegt = true;
    zug.von.classList.add('zieht');
    // Beim Zeigerfang liegt das Ereignis immer über dem Startelement – deshalb wird
    // das Ziel über die Bildschirmkoordinate gesucht, nicht über event.target.
    const unter = document.elementFromPoint(ereignis.clientX, ereignis.clientY);
    const ziel = unter && unter.closest('.platz');
    if (zug.ziel && zug.ziel !== ziel) zug.ziel.classList.remove('ziel');
    zug.ziel = ziel && ziel !== zug.von && el.contains(ziel) ? ziel : null;
    if (zug.ziel) zug.ziel.classList.add('ziel');
  });

  const beenden = () => {
    if (!zug) return;
    zug.von.classList.remove('zieht');
    zug.ziel?.classList.remove('ziel');

    const nachPlatzId = new Map(zustand.geo.plaetze.map((platz, i) => [platz.id, i]));
    if (zug.bewegt && zug.ziel) {
      const a = nachPlatzId.get(zug.von.dataset.platz);
      const b = nachPlatzId.get(zug.ziel.dataset.platz);
      [zustand.belegung[a], zustand.belegung[b]] = [zustand.belegung[b], zustand.belegung[a]];
      // Wer festgehalten war, bleibt es – ab jetzt auf seinem neuen Platz
      [a, b].forEach((p) => {
        const si = zustand.belegung[p];
        if (si >= 0 && zustand.schueler[si].festerPlatz) {
          zustand.schueler[si].festerPlatz = zustand.geo.plaetze[p].id;
        }
      });
      planBerichten();
      wuenscheZeichnen();
    } else if (!zug.bewegt) {
      const p = nachPlatzId.get(zug.von.dataset.platz);
      const si = zustand.belegung[p];
      if (si >= 0) {
        const person = zustand.schueler[si];
        person.festerPlatz = person.festerPlatz === zug.von.dataset.platz
          ? null
          : zug.von.dataset.platz;
        planZeichnen();
        wuenscheZeichnen();
      }
    }
    zug = null;
  };
  el.addEventListener('pointerup', beenden);
  el.addEventListener('pointercancel', beenden);
}

/* ---------------------------------------------------------------------------
 * Verdrahtung
 * ------------------------------------------------------------------------ */

function start() {
  toolhubUpload({
    input: 'listeDatei',
    zone: 'listeZone',
    list: 'listeListe',
    extensions: ['.csv', '.xlsx', '.xls', '.xlsm'],
    onChange: async (dateien) => {
      if (!dateien.length) return;
      try {
        zustand.quelle = await dateiEinlesen(dateien[0]);
        zustand.zuordnung = zuordnungRaten();
        $('zuordnungBereich').classList.remove('hidden');
        zuordnungZeichnen();
        schuelerUebernehmen();
      } catch (fehler) {
        toolhubMessage('meldung', fehler.message, 'error', 'kreuz');
      }
    },
    onInvalid: (namen) => toolhubMessage('meldung',
      `Nicht lesbar (erwartet CSV oder Excel): ${namen.join(', ')}`, 'error', 'kreuz')
  });

  // Vorlagen
  $('vorlage').innerHTML = SITZPLAN_VORLAGEN
    .map((v) => `<option value="${v.id}">${toolhubEscapeHtml(v.name)} – ${toolhubEscapeHtml(v.hinweis)}</option>`)
    .join('');
  $('vorlageBtn').addEventListener('click', () => {
    zustand.schueler.forEach((person) => { person.festerPlatz = null; });
    zustand.belegung = null;
    // Die Vorlage füllt den Raum, der in den Feldern daneben steht
    const { breite, tiefe } = raumMassEingabe();
    raumSetzen(raumAusVorlage($('vorlage').value, breite, tiefe));
  });

  document.querySelectorAll('[data-tisch]').forEach((knopf) => {
    knopf.addEventListener('click', () => {
      const [spalten, reihen] = knopf.dataset.tisch.split('x').map(Number);
      if (!raumTischHinzufuegen(zustand.raum, spalten, reihen)) {
        toolhubMessage('raumStatus', 'Kein freies Feld für diesen Tisch – den Raum vergrößern.', 'warn', 'warnung');
        return;
      }
      raumSetzen(zustand.raum);
    });
  });

  const groesseAendern = () => {
    const { breite, tiefe } = raumMassEingabe();
    raumGroesseSetzen(zustand.raum, breite, tiefe);
    raumSetzen(zustand.raum);
  };
  $('raumBreite').addEventListener('change', groesseAendern);
  $('raumTiefe').addEventListener('change', groesseAendern);

  $('zuschneidenBtn').addEventListener('click', () => {
    raumZuschneiden(zustand.raum);
    raumSetzen(zustand.raum);
  });
  $('leerenBtn').addEventListener('click', () => {
    zustand.raum.tische = [];
    zustand.belegung = null;
    raumSetzen(zustand.raum);
  });
  raumEditorVerdrahten();

  // Regeln
  $('zusammenPlus').addEventListener('click', () => paarHinzufuegen('zusammen'));
  $('getrenntPlus').addEventListener('click', () => paarHinzufuegen('getrennt'));
  ['verteilung', 'muster', 'musterHaerte', 'klassen', 'klassenHaerte', 'vordereReihen', 'wuenscheHaerte']
    .forEach((id) => $(id).addEventListener('change', planBerichten));

  // Plan
  $('erzeugenBtn').addEventListener('click', () => planErzeugen(true));
  $('weiterBtn').addEventListener('click', () => planErzeugen(false));
  // Der Abbruch liefert das bisher Beste über aufFertig – hier ist nichts weiter zu tun
  $('stoppBtn').addEventListener('click', () => zustand.lauf?.abbrechen());
  planLaeuft(false);
  ['lehrersicht', 'zeigeNachname', 'zeigeGeschlecht', 'zeigeKlasse', 'zeigeVerstoesse']
    .forEach((id) => $(id).addEventListener('change', planZeichnen));
  planVerdrahten();

  // Ausgabe
  $('druckenBtn').addEventListener('click', () => sitzplanDrucken(zustand));
  $('bildBtn').addEventListener('click', () => sitzplanAlsBild(zustand));
  $('sichernBtn').addEventListener('click', () => sitzplanSichern(zustand));
  $('ladenBtn').addEventListener('click', () => $('ladenDatei').click());
  $('ladenDatei').addEventListener('change', async () => {
    const datei = $('ladenDatei').files[0];
    if (!datei) return;
    try {
      await sitzplanLaden(zustand, datei);
    } catch (fehler) {
      toolhubMessage('meldung', fehler.message, 'error', 'kreuz');
    }
    $('ladenDatei').value = '';
  });
}

document.addEventListener('DOMContentLoaded', start);

// Die Feldbreite hängt von der Fensterbreite ab und muss deshalb nachgemessen werden
let massTimer;
addEventListener('resize', () => {
  clearTimeout(massTimer);
  massTimer = setTimeout(() => {
    if (!zustand.raum) return;
    raumMassSetzen($('raumEditor'));
    raumMassSetzen($('raumPlan'));
  }, 150);
});
