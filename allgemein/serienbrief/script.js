/*
 * Serienbrief – verbindet eine Vorlage (DOCX/ODT) mit Datensätzen (CSV/XLSX).
 *
 * Das Lesen und Füllen der Vorlagen steckt in ../../assets/toolhub-vorlagen.js;
 * hier stehen nur die Oberfläche, die Zuordnung Spalte -> Feld und die Aufteilung
 * der Datensätze auf die Ausgabedokumente.
 */

const felderPanel = document.getElementById('felderPanel');
const einstellungenPanel = document.getElementById('einstellungenPanel');
const erzeugenPanel = document.getElementById('erzeugenPanel');

const blattZeile = document.getElementById('blattZeile');
const blattAuswahl = document.getElementById('blattAuswahl');
const statistik = document.getElementById('statistik');
const felderKoerper = document.getElementById('felderKoerper');
const unbenutzteSpalten = document.getElementById('unbenutzteSpalten');
const gruppenZeile = document.getElementById('gruppenZeile');
const gruppenSpalte = document.getElementById('gruppenSpalte');
const dateinameZeile = document.getElementById('dateinameZeile');
const dateiname = document.getElementById('dateiname');
const behaltUnbekannte = document.getElementById('behaltUnbekannte');
const vorschauBtn = document.getElementById('vorschauBtn');
const erzeugenBtn = document.getElementById('erzeugenBtn');
const downloadBtn = document.getElementById('downloadBtn');
const vorschau = document.getElementById('vorschau');
const vorschauText = document.getElementById('vorschauText');
const ergebnisWrap = document.getElementById('ergebnisWrap');
const ergebnisKoerper = document.getElementById('ergebnisKoerper');

const zustand = {
  vorlage: null,      // Vorlage-Objekt aus toolhub-vorlagen.js
  mappe: null,        // Arbeitsmappe, solange die Daten aus Excel kommen
  spalten: [],        // Spaltennamen der Tabelle
  datensaetze: [],    // Zeilen der Tabelle als Objekte
  zuordnung: {},      // Feldname -> Spaltenname ('' = nicht zugeordnet)
  dokumente: []       // { name, blob, anzahl }
};

const einstellungen = {
  modus: 'einzeln',   // 'einzeln' | 'gruppiert' | 'proDatensatz'
  gruppenSpalte: '',
  behaltUnbekannte: false
};

// ---------------------------------------------------------------------------
// Dateien einlesen
// ---------------------------------------------------------------------------

toolhubUpload({
  input: 'vorlageInput',
  zone: 'vorlageZone',
  list: 'vorlageListe',
  extensions: TOOLHUB_VORLAGE_ENDUNGEN,
  onInvalid: (namen) => meldung('ladeMeldung', `Als Vorlage sind nur DOCX- und ODT-Dateien möglich: ${namen.join(', ')}`, 'error'),
  onChange: (dateien) => ladeVorlage(dateien[0] || null)
});

toolhubUpload({
  input: 'datenInput',
  zone: 'datenZone',
  list: 'datenListe',
  extensions: ['.csv', '.xlsx', '.xls', '.xlsm'],
  onInvalid: (namen) => meldung('ladeMeldung', `Als Datensätze sind nur CSV- und Excel-Dateien möglich: ${namen.join(', ')}`, 'error'),
  onChange: (dateien) => ladeDaten(dateien[0] || null)
});

async function ladeVorlage(datei) {
  ergebnisLeeren();
  if (!datei) {
    zustand.vorlage = null;
    aktualisiere();
    return;
  }

  try {
    zustand.vorlage = await toolhubVorlageLaden(datei);
    if (zustand.vorlage.alleFelder.length === 0) {
      meldung('ladeMeldung', `In "${datei.name}" wurde kein Feld der Form {{Feldname}} gefunden.`, 'warn');
    } else {
      meldung('ladeMeldung', '');
    }
  } catch (fehler) {
    zustand.vorlage = null;
    meldung('ladeMeldung', fehler.message, 'error');
  }
  aktualisiere();
}

async function ladeDaten(datei) {
  ergebnisLeeren();
  if (!datei) {
    zustand.mappe = null;
    zustand.spalten = [];
    zustand.datensaetze = [];
    blattZeile.classList.add('hidden');
    aktualisiere();
    return;
  }

  try {
    if (datei.name.toLowerCase().endsWith('.csv')) {
      zustand.mappe = null;
      blattZeile.classList.add('hidden');
      const { rows, fields } = await toolhubReadCsv(datei);
      uebernimmZeilen(rows, fields);
    } else {
      zustand.mappe = await toolhubReadWorkbook(datei);
      fuelleBlattAuswahl();
      uebernimmBlatt();
    }
    meldung('ladeMeldung', '');
  } catch (fehler) {
    zustand.mappe = null;
    zustand.spalten = [];
    zustand.datensaetze = [];
    meldung('ladeMeldung', fehler.message, 'error');
  }
  aktualisiere();
}

function fuelleBlattAuswahl() {
  blattAuswahl.innerHTML = '';
  zustand.mappe.SheetNames.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    blattAuswahl.appendChild(option);
  });
  // Die Auswahl lohnt sich nur, wenn es mehr als ein Blatt gibt
  blattZeile.classList.toggle('hidden', zustand.mappe.SheetNames.length < 2);
}

function uebernimmBlatt() {
  const blatt = zustand.mappe.Sheets[blattAuswahl.value || zustand.mappe.SheetNames[0]];
  // raw: false -> Datums- und Zahlenwerte so übernehmen, wie Excel sie anzeigt
  const zeilen = toolhubSheetRows(blatt, { defval: '', raw: false });
  uebernimmZeilen(zeilen, spaltenAus(zeilen));
}

blattAuswahl.addEventListener('change', () => {
  ergebnisLeeren();
  try {
    uebernimmBlatt();
    meldung('ladeMeldung', '');
  } catch (fehler) {
    zustand.spalten = [];
    zustand.datensaetze = [];
    meldung('ladeMeldung', fehler.message, 'error');
  }
  aktualisiere();
});

// Spaltennamen in der Reihenfolge ihres ersten Auftretens
function spaltenAus(zeilen) {
  const namen = [];
  zeilen.forEach((zeile) => {
    Object.keys(zeile).forEach((name) => {
      if (!namen.includes(name)) namen.push(name);
    });
  });
  return namen;
}

function uebernimmZeilen(zeilen, spalten) {
  zustand.datensaetze = zeilen;
  zustand.spalten = (spalten && spalten.length > 0 ? spalten : spaltenAus(zeilen)).filter((name) => name !== '');
  if (zustand.datensaetze.length === 0) throw new Error('Die Datei enthält keine Datensätze.');
}

// ---------------------------------------------------------------------------
// Felder zuordnen
// ---------------------------------------------------------------------------

// Für den Abgleich zählen weder Groß-/Kleinschreibung noch Leer- und Trennzeichen
function schluessel(name) {
  return String(name ?? '').toLowerCase().replace(/[\s._-]+/g, '');
}

/*
 * Ordnet jedem Feld der Vorlage eine Spalte zu. Bereits von Hand gesetzte
 * Zuordnungen bleiben erhalten, solange es die Spalte noch gibt.
 */
function ordneZu() {
  const nachSchluessel = new Map();
  zustand.spalten.forEach((spalte) => {
    if (!nachSchluessel.has(schluessel(spalte))) nachSchluessel.set(schluessel(spalte), spalte);
  });

  const neu = {};
  felderDerVorlage().forEach((feld) => {
    const bisher = zustand.zuordnung[feld];
    if (bisher && zustand.spalten.includes(bisher)) neu[feld] = bisher;
    else neu[feld] = nachSchluessel.get(schluessel(feld)) || '';
  });
  zustand.zuordnung = neu;
}

function felderDerVorlage() {
  return zustand.vorlage ? zustand.vorlage.alleFelder : [];
}

function zeigeFelder() {
  const felder = felderDerVorlage();
  felderKoerper.innerHTML = '';

  felder.forEach((feld) => {
    const zeile = document.createElement('tr');

    // Word- und Writer-Felder werden in ihrer eigenen Schreibweise gezeigt,
    // damit sie in der Vorlage wiederzuerkennen sind
    const ausVorlage = zustand.vorlage.formatFelder.includes(feld);
    const feldZelle = document.createElement('td');
    feldZelle.innerHTML = ausVorlage
      ? `<code>«${toolhubEscapeHtml(feld)}»</code>`
      : `<code>{{${toolhubEscapeHtml(feld)}}}</code>`;

    const hinweise = [];
    if (ausVorlage) {
      hinweise.push(zustand.vorlage.format === 'docx' ? 'Word-Seriendruckfeld' : 'Writer-Datenbankfeld');
    }
    if (zustand.vorlage.kopfFelder.includes(feld) && !zustand.vorlage.felder.includes(feld)) {
      hinweise.push('nur in Kopf-/Fußzeile');
    }
    if (hinweise.length > 0) {
      const hinweis = document.createElement('div');
      hinweis.className = 'feld-hinweis';
      hinweis.textContent = hinweise.join(' · ');
      feldZelle.appendChild(hinweis);
    }

    const spaltenZelle = document.createElement('td');
    const auswahl = document.createElement('select');
    auswahl.innerHTML = '<option value="">— keine Spalte —</option>';
    zustand.spalten.forEach((spalte) => {
      const option = document.createElement('option');
      option.value = spalte;
      option.textContent = spalte;
      auswahl.appendChild(option);
    });
    auswahl.value = zustand.zuordnung[feld] || '';
    auswahl.addEventListener('change', () => {
      zustand.zuordnung[feld] = auswahl.value;
      ergebnisLeeren();
      zeigeFelder();
      zeigeStatistik();
    });
    spaltenZelle.appendChild(auswahl);

    const wertZelle = document.createElement('td');
    const spalte = zustand.zuordnung[feld];
    if (!spalte) {
      wertZelle.className = 'fehlt';
      wertZelle.textContent = 'keine passende Spalte';
    } else {
      const wert = toolhubVorlageWert((zustand.datensaetze[0] || {})[spalte]);
      wertZelle.textContent = wert || '(leer)';
      if (!wert) wertZelle.className = 'leer';
    }

    zeile.append(feldZelle, spaltenZelle, wertZelle);
    felderKoerper.appendChild(zeile);
  });

  const benutzt = new Set(Object.values(zustand.zuordnung).filter(Boolean));
  const uebrig = zustand.spalten.filter((spalte) => !benutzt.has(spalte));
  unbenutzteSpalten.textContent = uebrig.length > 0
    ? `Nicht verwendete Spalten: ${uebrig.join(', ')}`
    : '';
}

function zeigeStatistik() {
  const felder = felderDerVorlage();
  const ohneSpalte = felder.filter((feld) => !zustand.zuordnung[feld]).length;
  const einheitenAnzahl = baueEinheiten().length;

  statistik.innerHTML = `
    <div class="stat-card">
      <h3>Datensätze</h3>
      <div class="value">${zustand.datensaetze.length}</div>
      <p>Zeilen der Tabelle</p>
    </div>
    <div class="stat-card">
      <h3>Felder</h3>
      <div class="value">${felder.length}</div>
      <p>in der Vorlage gefunden</p>
    </div>
    <div class="stat-card">
      <h3>Ohne Spalte</h3>
      <div class="value">${ohneSpalte}</div>
      <p>${einstellungen.behaltUnbekannte ? 'bleiben als {{Feld}} stehen' : 'werden leer eingesetzt'}</p>
    </div>
    <div class="stat-card">
      <h3>Dokumente</h3>
      <div class="value">${einheitenAnzahl}</div>
      <p>entstehen beim Erzeugen</p>
    </div>
  `;

  // Kopf- und Fußzeilen gehören zum ganzen Dokument, nicht zum einzelnen Datensatz
  const kopfFelder = zustand.vorlage ? zustand.vorlage.kopfFelder : [];
  const mehrfach = baueEinheiten().some((einheit) => einheit.saetze.length > 1);
  meldung('felderMeldung', kopfFelder.length > 0 && mehrfach
    ? `Die Vorlage enthält Felder in Kopf- oder Fußzeile (${kopfFelder.join(', ')}). Da diese für das ganze ` +
      'Dokument gelten, wird dort der jeweils erste Datensatz eingesetzt.'
    : '', 'warn');
}

// ---------------------------------------------------------------------------
// Ausgabe-Einstellungen
// ---------------------------------------------------------------------------

document.querySelectorAll('input[name="ausgabeModus"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    einstellungen.modus = radio.value;
    ergebnisLeeren();
    aktualisiereEinstellungen();
    zeigeStatistik();
  });
});

gruppenSpalte.addEventListener('change', () => {
  einstellungen.gruppenSpalte = gruppenSpalte.value;
  ergebnisLeeren();
  zeigeStatistik();
});

dateiname.addEventListener('input', () => ergebnisLeeren());

behaltUnbekannte.addEventListener('change', () => {
  einstellungen.behaltUnbekannte = behaltUnbekannte.checked;
  ergebnisLeeren();
  zeigeStatistik();
});

function aktualisiereEinstellungen() {
  gruppenZeile.classList.toggle('disabled', einstellungen.modus !== 'gruppiert');
  gruppenSpalte.disabled = einstellungen.modus !== 'gruppiert';
  dateinameZeile.classList.toggle('disabled', einstellungen.modus !== 'proDatensatz');
  dateiname.disabled = einstellungen.modus !== 'proDatensatz';
}

// Danach wird im Schulalltag am ehesten gruppiert
const GRUPPEN_VORSCHLAEGE = ['klasse', 'kurs', 'gruppe', 'jahrgang', 'profil'];

function fuelleGruppenSpalte() {
  const bisher = einstellungen.gruppenSpalte;
  gruppenSpalte.innerHTML = '';
  zustand.spalten.forEach((spalte) => {
    const option = document.createElement('option');
    option.value = spalte;
    option.textContent = spalte;
    gruppenSpalte.appendChild(option);
  });

  const vorschlag = zustand.spalten.find((spalte) => GRUPPEN_VORSCHLAEGE.includes(schluessel(spalte)));
  gruppenSpalte.value = zustand.spalten.includes(bisher)
    ? bisher
    : (vorschlag || zustand.spalten[0] || '');
  einstellungen.gruppenSpalte = gruppenSpalte.value;
}

// ---------------------------------------------------------------------------
// Ausgabedokumente zusammenstellen
// ---------------------------------------------------------------------------

// Werte eines Datensatzes unter den Feldnamen der Vorlage
function werteFuer(satz) {
  const werte = {};
  Object.entries(zustand.zuordnung).forEach(([feld, spalte]) => {
    if (spalte) werte[feld] = satz[spalte];
  });
  return werte;
}

// Zeichen, die in Dateinamen nicht vorkommen dürfen (Windows ist hier am strengsten)
function sichererName(name) {
  const bereinigt = String(name ?? '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  return bereinigt || 'Serienbrief';
}

/*
 * Teilt die Datensätze in Ausgabedokumente auf: { name, saetze }.
 * Der Name trägt noch keine Endung – die kommt aus der Vorlage.
 */
function baueEinheiten() {
  const saetze = zustand.datensaetze;
  if (saetze.length === 0) return [];

  if (einstellungen.modus === 'proDatensatz') {
    const vergeben = new Map();
    return saetze.map((satz, index) => {
      const muster = dateiname.value.trim() || 'Serienbrief_{{Nr}}';
      // Das Muster verweist auf die Spalten der Tabelle, nicht auf die Felder der Vorlage
      let name = sichererName(toolhubVorlageFuelleText(muster, { ...satz, Nr: index + 1 }));
      // Gleiche Namen (z. B. Namensvetter) würden sich in der ZIP-Datei überschreiben
      const anzahl = (vergeben.get(name) || 0) + 1;
      vergeben.set(name, anzahl);
      if (anzahl > 1) name = `${name}_${anzahl}`;
      return { name, saetze: [satz] };
    });
  }

  if (einstellungen.modus === 'gruppiert' && einstellungen.gruppenSpalte) {
    const gruppen = new Map();
    saetze.forEach((satz) => {
      const wert = toolhubVorlageWert(satz[einstellungen.gruppenSpalte]) || 'ohne Angabe';
      if (!gruppen.has(wert)) gruppen.set(wert, []);
      gruppen.get(wert).push(satz);
    });
    return Array.from(gruppen, ([wert, gruppe]) => ({
      name: sichererName(`Serienbrief_${wert}`),
      saetze: gruppe
    }));
  }

  return [{ name: 'Serienbriefe', saetze }];
}

// ---------------------------------------------------------------------------
// Erzeugen, Vorschau, Download
// ---------------------------------------------------------------------------

vorschauBtn.addEventListener('click', async () => {
  try {
    const satz = zustand.datensaetze[0];
    const text = await zustand.vorlage.vorschauText(werteFuer(satz), {
      behaltUnbekannte: einstellungen.behaltUnbekannte
    });
    vorschauText.textContent = text.replace(/\n{3,}/g, '\n\n').trim() || '(Die Vorlage enthält keinen Text.)';
    vorschau.classList.remove('hidden');
    meldung('erzeugenMeldung', '');
  } catch (fehler) {
    meldung('erzeugenMeldung', fehler.message, 'error');
  }
});

erzeugenBtn.addEventListener('click', async () => {
  const einheiten = baueEinheiten();
  erzeugenBtn.disabled = true;
  downloadBtn.disabled = true;
  zustand.dokumente = [];

  try {
    for (let i = 0; i < einheiten.length; i++) {
      const einheit = einheiten[i];
      meldung('erzeugenMeldung', `Erzeuge Dokument ${i + 1} von ${einheiten.length} …`, 'info');
      // Kurz an den Browser abgeben, damit die Meldung sichtbar wird
      await new Promise((fertig) => setTimeout(fertig, 0));

      const blob = await zustand.vorlage.erzeuge(einheit.saetze.map(werteFuer), {
        behaltUnbekannte: einstellungen.behaltUnbekannte
      });
      zustand.dokumente.push({
        name: einheit.name + zustand.vorlage.endung,
        blob,
        anzahl: einheit.saetze.length
      });
    }

    zeigeErgebnis();
    downloadBtn.disabled = false;
    meldung('erzeugenMeldung',
      `✓ ${zustand.dokumente.length} Dokument(e) mit insgesamt ${zustand.datensaetze.length} Datensätzen erzeugt.`,
      'success');
  } catch (fehler) {
    zustand.dokumente = [];
    meldung('erzeugenMeldung', `Fehler beim Erzeugen: ${fehler.message}`, 'error');
    console.error(fehler);
  } finally {
    erzeugenBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', async () => {
  if (zustand.dokumente.length === 0) return;

  if (zustand.dokumente.length === 1) {
    toolhubDownload(zustand.dokumente[0].blob, zustand.dokumente[0].name);
    return;
  }

  const zip = new JSZip();
  zustand.dokumente.forEach((dokument) => zip.file(dokument.name, dokument.blob));
  toolhubDownload(await zip.generateAsync({ type: 'blob' }), 'Serienbriefe.zip');
});

function zeigeErgebnis() {
  ergebnisKoerper.innerHTML = '';
  zustand.dokumente.forEach((dokument) => {
    const zeile = document.createElement('tr');

    const nameZelle = document.createElement('td');
    nameZelle.textContent = dokument.name;

    const anzahlZelle = document.createElement('td');
    anzahlZelle.textContent = dokument.anzahl;

    const groesseZelle = document.createElement('td');
    groesseZelle.textContent = `${Math.max(1, Math.round(dokument.blob.size / 1024))} kB`;

    const knopfZelle = document.createElement('td');
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'btn-secondary btn-small';
    knopf.textContent = 'Herunterladen';
    knopf.addEventListener('click', () => toolhubDownload(dokument.blob, dokument.name));
    knopfZelle.appendChild(knopf);

    zeile.append(nameZelle, anzahlZelle, groesseZelle, knopfZelle);
    ergebnisKoerper.appendChild(zeile);
  });
  ergebnisWrap.classList.remove('hidden');
}

function ergebnisLeeren() {
  zustand.dokumente = [];
  ergebnisKoerper.innerHTML = '';
  ergebnisWrap.classList.add('hidden');
  vorschau.classList.add('hidden');
  downloadBtn.disabled = true;
  meldung('erzeugenMeldung', '');
}

// ---------------------------------------------------------------------------
// Oberfläche auffrischen
// ---------------------------------------------------------------------------

function meldung(id, text, art) {
  toolhubMessage(id, text, art);
}

function aktualisiere() {
  const bereit = Boolean(zustand.vorlage) && zustand.datensaetze.length > 0;

  felderPanel.classList.toggle('hidden', !bereit);
  einstellungenPanel.classList.toggle('hidden', !bereit);
  erzeugenPanel.classList.toggle('hidden', !bereit);
  if (!bereit) return;

  ordneZu();
  fuelleGruppenSpalte();
  aktualisiereEinstellungen();
  zeigeFelder();
  zeigeStatistik();
}

aktualisiereEinstellungen();
