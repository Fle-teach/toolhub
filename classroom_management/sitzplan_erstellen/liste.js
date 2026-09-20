/*
 * liste.js – aus einer Datei wird eine Schülerliste (Schritte 1 und 2).
 *
 * Einlesen von CSV und Excel, Zuordnung der Spalten und die Durchsicht des
 * Geschlechts. Was danach in `zustand.schueler` steht, ist die einzige Grundlage
 * aller weiteren Schritte:
 *
 *   { id, nachname, vorname, rufname, klasse, geschlecht, sicherheit, herkunft,
 *     platzwunsch, allein, festerPlatz }
 *
 * `herkunft` merkt sich, woher die Geschlechtsangabe stammt ('datei', 'name' oder
 * 'hand') – daran hängt, was Schritt 2 zur Durchsicht hervorhebt und was beim
 * erneuten Zuordnen der Spalten erhalten bleibt.
 */

/* ---------------------------------------------------------------------------
 * Schritt 1 – Datei einlesen und Spalten zuordnen
 * ------------------------------------------------------------------------ */

/*
 * Felder, die ein Schülerdatensatz haben kann, mit den Kopfzeilen, an denen sie
 * üblicherweise zu erkennen sind. Die Muster decken die Schreibweisen ab, die IServ,
 * DiViS und Untis ausgeben; alles Übrige wird von Hand zugeordnet.
 */
const SITZPLAN_FELDER = [
  { id: 'gesamtname', name: 'Name in einer Spalte',
    hinweis: 'z. B. „Müller, Lena“ – dann entfallen die beiden Felder darunter',
    muster: [/^name$/i, /^sch(ü|ue)ler(in)?$/i] },
  { id: 'nachname', name: 'Nachname',
    muster: [/^nachname$/i, /^familienname$/i, /^last ?name$/i, /^surname$/i] },
  { id: 'vorname', name: 'Vorname',
    muster: [/^vorname$/i, /^rufname$/i, /^first ?name$/i] },
  { id: 'rufname', name: 'Rufname',
    hinweis: 'optional – tritt im Sitzplan an die Stelle des Vornamens',
    muster: [/^rufname$/i, /^spitzname$/i, /^nickname$/i] },
  { id: 'klasse', name: 'Klasse oder Kurs',
    hinweis: 'optional', muster: [/^klasse$/i, /^kurs$/i, /^lerngruppe$/i, /^gruppe$/i,
      /^zus(ä|ae)tzliche informationen$/i] },
  { id: 'geschlecht', name: 'Geschlecht',
    hinweis: 'optional – fehlt es, wird es aus dem Vornamen geschlossen',
    muster: [/^geschlecht$/i, /^gender$/i, /^sex$/i, /^m\s*\/\s*w$/i] }
];

async function dateiEinlesen(datei) {
  const istExcel = /\.(xlsx|xlsm|xls)$/i.test(datei.name);
  let zeilen;
  if (istExcel) {
    const mappe = await toolhubReadWorkbook(datei);
    // raw: false – Werte so übernehmen, wie Excel sie anzeigt (Klassen wie "07.2"
    // sind sonst plötzlich ein Datum)
    zeilen = toolhubSheetRows(mappe, { header: false, defval: '', raw: false });
  } else {
    const ergebnis = await toolhubReadCsv(datei, { header: false });
    zeilen = ergebnis.rows;
  }

  zeilen = zeilen.map((zeile) => zeile.map((wert) => String(wert ?? '').trim()));
  const erste = zeilen.findIndex((zeile) => zeile.some((wert) => wert !== ''));
  if (erste < 0) throw new Error('Die Datei enthält keine Daten.');

  const felder = zeilen[erste].map((name, i) => name || `Spalte ${i + 1}`);
  const daten = zeilen.slice(erste + 1).filter((zeile) => zeile.some((wert) => wert !== ''));
  if (!daten.length) throw new Error('Unter der Kopfzeile steht kein Datensatz.');
  return { felder, zeilen: daten };
}

function zuordnungRaten() {
  const { felder, zeilen } = zustand.quelle;
  const zuordnung = {};
  // Eine Spalte nur einmal vergeben: Enthält eine Liste allein "Rufname" und keinen
  // Vornamen, ist das der Vorname – und eben kein zusätzlicher Rufname daneben.
  const vergeben = new Set();
  SITZPLAN_FELDER.forEach((feld) => {
    const treffer = felder.find((spalte) =>
      !vergeben.has(spalte) && feld.muster.some((muster) => muster.test(spalte)));
    zuordnung[feld.id] = treffer || '';
    if (treffer) vergeben.add(treffer);
  });

  /*
   * „Name“ als einzelne Spalte nur dann annehmen, wenn dort tatsächlich zwei Namen
   * durch ein Komma getrennt stehen. Sonst ist die Spalte ein Nachname, und die
   * Vornamen stehen daneben.
   */
  if (zuordnung.gesamtname) {
    const index = felder.indexOf(zuordnung.gesamtname);
    const mitKomma = zeilen.filter((zeile) => (zeile[index] || '').includes(',')).length;
    if (mitKomma < zeilen.length * 0.5) {
      if (!zuordnung.nachname) zuordnung.nachname = zuordnung.gesamtname;
      zuordnung.gesamtname = '';
    }
  }
  return zuordnung;
}

function zuordnungZeichnen() {
  const gitter = $('zuordnungGrid');
  const { felder } = zustand.quelle;
  gitter.innerHTML = '';

  SITZPLAN_FELDER.forEach((feld) => {
    // Mit einer Gesamtnamen-Spalte sind Nachname und Vorname gegenstandslos. Das Feld
    // dafür bleibt immer stehen – sonst käme man nicht wieder zu zwei Spalten zurück.
    if (zustand.zuordnung.gesamtname && (feld.id === 'nachname' || feld.id === 'vorname')) return;

    const huelle = document.createElement('div');
    huelle.className = 'zuordnung-feld';
    const pflicht = feld.id === 'nachname' || feld.id === 'vorname';
    if (pflicht && !zustand.zuordnung[feld.id]) huelle.classList.add('fehlt');

    const beschriftung = document.createElement('label');
    beschriftung.textContent = feld.hinweis ? `${feld.name} (${feld.hinweis})` : feld.name;
    beschriftung.htmlFor = `zuordnung-${feld.id}`;

    const auswahl = document.createElement('select');
    auswahl.id = `zuordnung-${feld.id}`;
    auswahl.innerHTML = `<option value="">– keine Spalte –</option>` +
      felder.map((spalte) => `<option value="${toolhubEscapeHtml(spalte)}">${toolhubEscapeHtml(spalte)}</option>`).join('');
    auswahl.value = zustand.zuordnung[feld.id] || '';
    auswahl.addEventListener('change', () => {
      zustand.zuordnung[feld.id] = auswahl.value;
      zuordnungZeichnen();
      schuelerUebernehmen();
    });

    huelle.append(beschriftung, auswahl);
    gitter.appendChild(huelle);
  });
}

/*
 * Aus Datei und Zuordnung die Schülerliste bauen. Vorhandene Einstellungen zu einem
 * Schüler (Geschlecht von Hand, Sitzwunsch) bleiben erhalten, solange der Name gleich
 * bleibt – sonst wäre nach jeder Korrektur an der Zuordnung alles wieder weg.
 */
function schuelerUebernehmen() {
  const { felder, zeilen } = zustand.quelle;
  const spalte = (name) => felder.indexOf(name);
  const alt = new Map(zustand.schueler.map((person) => [schuelerName(person).toLowerCase(), person]));

  const iGesamt = spalte(zustand.zuordnung.gesamtname);
  const iNach = spalte(zustand.zuordnung.nachname);
  const iVor = spalte(zustand.zuordnung.vorname);
  const iRufname = spalte(zustand.zuordnung.rufname);
  const iKlasse = spalte(zustand.zuordnung.klasse);
  const iGeschlecht = spalte(zustand.zuordnung.geschlecht);

  if (iGesamt < 0 && (iNach < 0 || iVor < 0)) {
    zustand.schueler = [];
    toolhubMessage('meldung', 'Bitte die Spalten für Nachname und Vorname zuordnen.', 'warn', 'warnung');
    ['geschlechtPanel', 'raumPanel', 'regelnPanel', 'planPanel', 'exportPanel']
      .forEach((id) => abschnittZeigen(id, false));
    return;
  }

  const liste = [];
  zeilen.forEach((zeile, i) => {
    let nachname = '';
    let vorname = '';
    if (iGesamt >= 0) {
      // "Müller, Lena" ebenso wie "Lena Müller" – mit Komma zuerst der Nachname
      const ganz = zeile[iGesamt] || '';
      if (ganz.includes(',')) {
        [nachname, vorname] = ganz.split(',').map((teil) => teil.trim());
      } else {
        const teile = ganz.trim().split(/\s+/);
        nachname = teile.pop() || '';
        vorname = teile.join(' ');
      }
    } else {
      nachname = zeile[iNach] || '';
      vorname = zeile[iVor] || '';
    }
    if (!nachname && !vorname) return;

    const person = {
      id: `p${i}`,
      nachname,
      vorname,
      rufname: iRufname >= 0 ? (zeile[iRufname] || '') : '',
      klasse: iKlasse >= 0 ? (zeile[iKlasse] || '') : '',
      geschlecht: null,
      sicherheit: 'sicher',
      herkunft: 'datei',
      platzwunsch: 'egal',
      allein: false,
      festerPlatz: null
    };

    /*
     * Geraten wird nur, wo die Liste nichts sagt. Steht dort etwas, das weder "m" noch
     * "w" bedeutet – etwa "d" –, ist das eine Angabe und keine Lücke: Sie bleibt als
     * "ohne Angabe" stehen, statt sie durch eine Namensschätzung zu überschreiben.
     */
    const angabe = iGeschlecht >= 0 ? String(zeile[iGeschlecht] ?? '').trim() : '';
    if (angabe) {
      person.geschlecht = toolhubGeschlechtNormalisieren(angabe);
    } else {
      const geraten = toolhubGeschlechtRaten(vorname);
      person.geschlecht = geraten.geschlecht;
      person.sicherheit = geraten.sicherheit;
      person.herkunft = 'name';
    }

    const frueher = alt.get(schuelerName(person).toLowerCase());
    if (frueher) {
      person.platzwunsch = frueher.platzwunsch;
      person.allein = frueher.allein;
      if (!person.rufname) person.rufname = frueher.rufname || '';
      if (frueher.herkunft === 'hand') {
        person.geschlecht = frueher.geschlecht;
        person.sicherheit = 'sicher';
        person.herkunft = 'hand';
      }
    }
    liste.push(person);
  });

  zustand.schueler = liste;
  toolhubMessage('meldung', `${liste.length} Schüler eingelesen.`, 'success', 'haken');

  // Erst einblenden, dann zeichnen: raumMassSetzen() misst die verfügbare Breite,
  // und die ist an einem ausgeblendeten Abschnitt null
  ['geschlechtPanel', 'raumPanel', 'regelnPanel', 'planPanel', 'exportPanel']
    .forEach((id) => abschnittZeigen(id));
  if (!zustand.raum) {
    const { breite, tiefe } = raumMassEingabe();
    raumSetzen(raumAusVorlage('frontal_2er', breite, tiefe));
  }
  schuelerZeichnen();
  regelnZeichnen();
  planZuruecksetzen();
}

/* ---------------------------------------------------------------------------
 * Schritt 2 – Schüler prüfen (Geschlecht und Rufname)
 * ------------------------------------------------------------------------ */

const HERKUNFT_TEXT = { datei: 'aus der Liste', name: 'aus dem Vornamen', hand: 'von Hand' };

function schuelerZeichnen() {
  const koerper = $('geschlechtKoerper');
  koerper.innerHTML = '';

  zustand.schueler.forEach((person) => {
    const zeile = document.createElement('tr');
    if (person.herkunft === 'name' && person.sicherheit !== 'sicher') {
      zeile.className = person.sicherheit === 'mehrdeutig' ? 'mehrdeutig' : 'unsicher';
    }

    const zelle = (text) => {
      const td = document.createElement('td');
      td.textContent = text;
      return td;
    };

    const auswahl = document.createElement('select');
    auswahl.innerHTML =
      '<option value="">– ohne Angabe –</option>' +
      '<option value="m">♂ Junge</option>' +
      '<option value="w">♀ Mädchen</option>';
    auswahl.value = person.geschlecht || '';
    auswahl.addEventListener('change', () => {
      person.geschlecht = auswahl.value || null;
      person.sicherheit = 'sicher';
      person.herkunft = 'hand';
      // Die Korrektur merken, damit derselbe Vorname beim nächsten Mal stimmt
      if (auswahl.value) toolhubGeschlechtMerken(person.vorname, auswahl.value);
      schuelerZeichnen();
      planBerichten();
    });
    const zelleAuswahl = document.createElement('td');
    zelleAuswahl.appendChild(auswahl);

    const ruf = document.createElement('input');
    ruf.type = 'text';
    ruf.value = person.rufname || '';
    ruf.size = 12;
    ruf.placeholder = person.vorname;
    ruf.setAttribute('aria-label', `Rufname von ${schuelerName(person)}`);
    // Auf 'input' und ohne die Tabelle neu zu zeichnen: Sonst verlöre das Feld beim
    // ersten Tastendruck den Fokus und man könnte nur einen Buchstaben tippen.
    ruf.addEventListener('input', () => {
      person.rufname = ruf.value.trim();
      planZeichnen();
    });
    const zelleRuf = document.createElement('td');
    zelleRuf.appendChild(ruf);

    zeile.append(zelle(person.nachname), zelle(person.vorname), zelleRuf, zelle(person.klasse || '–'),
      zelle(HERKUNFT_TEXT[person.herkunft]), zelleAuswahl);
    koerper.appendChild(zeile);
  });

  const jungen = zustand.schueler.filter((s) => s.geschlecht === 'm').length;
  const maedchen = zustand.schueler.filter((s) => s.geschlecht === 'w').length;
  const offen = zustand.schueler.length - jungen - maedchen;
  $('zahlJungen').textContent = jungen;
  $('zahlMaedchen').textContent = maedchen;
  $('zahlOffen').textContent = offen;

  const unsicher = zustand.schueler.filter((s) => s.herkunft === 'name' && s.sicherheit !== 'sicher').length;
  if (zustand.schueler.every((s) => s.herkunft === 'datei')) {
    toolhubMessage('geschlechtMeldung', 'Alle Angaben stammen aus der Liste – nichts zu prüfen.', 'success', 'haken');
  } else if (unsicher > 0) {
    toolhubMessage('geschlechtMeldung',
      `${unsicher} Vorname(n) konnten nicht eindeutig zugeordnet werden. Ohne Angabe bleibt der Schüler aus dem Geschlechtermuster heraus.`,
      'warn', 'warnung');
  } else {
    toolhubMessage('geschlechtMeldung', 'Alle Vornamen konnten zugeordnet werden – bitte trotzdem überfliegen.', 'success', 'haken');
  }
}
