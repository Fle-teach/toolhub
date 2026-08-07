/*
 * toolhub.js – gemeinsames Theme-Handling für die Hauptseite und alle Tools.
 *
 * Muss synchron im <head> eingebunden werden (ohne defer/async), damit das
 * Theme vor dem ersten Rendern gesetzt ist und nichts aufblitzt:
 *   <script src="../../assets/toolhub.js"></script>
 */

// Theme vor dem ersten Rendern setzen
document.documentElement.dataset.theme =
  localStorage.getItem('toolhub-theme') ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

/*
 * Icon-Vorrat: eigene Strichzeichnungen (einfarbig, 24×24, Kontur in currentColor).
 * Sie treten an die Stelle von Emojis – die sehen je nach Betriebssystem anders aus
 * und passen farblich nicht zum übrigen Design.
 *
 * Einbindung im Markup über einen Platzhalter, dessen Klasse die Größe bestimmt:
 *   <span data-icon="setzling" class="panel-icon"></span>    großes Wasserzeichen im Panel
 *   <span data-icon="download" class="inline-icon"></span>   in Buttons und Fließtext
 *
 * Hier stehen die Motive, die an mehr als einer Stelle vorkommen (Kacheln der
 * Startseite, Bedienelemente). Ein Motiv, das nur ein einziges Tool braucht, bleibt
 * als <svg> in dessen Seite.
 */
const TOOLHUB_ICONS = {
  // Vier Kacheln (Allgemeines, Verschiedenes)
  raster:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/>' +
    '<rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/>' +
    '<rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/>' +
    '<rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  // Setzling / Wachstum. Beide Keimblätter setzen bei (12,12) am Stiel an – dort liegt
  // auch der Drehpunkt, um den sie sich auf der Startseite entfalten.
  setzling:
    '<path d="M12 22V12"/>' +
    '<path class="blatt-links" d="M12 12C12 8.5 9.2 6 5 6c0 4.2 2.8 6.5 7 6.5"/>' +
    '<path class="blatt-rechts" d="M12 12C12 8.5 14.8 6 19 6c0 4.2-2.8 6.5-7 6.5"/>' +
    '<path d="M7 22h10"/>',
  // Benutzergruppe. Auf der Startseite rückt die Reihe auf: Die linke Person tritt ab,
  // die rechte nimmt ihren Platz ein, von rechts kommt eine neue hinzu. Bewegt werden
  // dabei nicht die Personen selbst, sondern zwei Doppelgänger, die im Ruhezustand
  // deckungsgleich auf ihnen liegen und deshalb nicht zu sehen sind – so ist sowohl der
  // Anfang als auch das Ende der Bewegung genau dieses Icon (siehe styles.css).
  benutzer:
    '<g class="person-links">' +
      '<circle cx="9" cy="8" r="3.5"/>' +
      '<path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>' +
    '</g>' +
    '<g class="person-rechts">' +
      '<circle cx="17.5" cy="9.5" r="2.5"/>' +
      '<path d="M16.5 14.2c2.7.4 4.8 2.8 4.8 5.8"/>' +
    '</g>' +
    '<g class="nachruecker">' +
      '<circle cx="9" cy="8" r="3.5"/>' +
      '<path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>' +
    '</g>' +
    '<g class="neuzugang">' +
      '<circle cx="17.5" cy="9.5" r="2.5"/>' +
      '<path d="M16.5 14.2c2.7.4 4.8 2.8 4.8 5.8"/>' +
    '</g>',
  // Formular mit Häkchen. Die Haken werden auf der Startseite nacheinander gesetzt;
  // `pathLength="1"` macht die Strichrechnung unabhängig von ihrer echten Länge.
  formular:
    '<rect x="5" y="3" width="14" height="18" rx="2"/>' +
    '<path class="haken" pathLength="1" d="M8.5 9.5l1.3 1.3 2.4-2.6"/>' +
    '<path d="M14.5 10h2"/>' +
    '<path class="haken spaeter" pathLength="1" d="M8.5 15.5l1.3 1.3 2.4-2.6"/>' +
    '<path d="M14.5 16h2"/>',
  // Aufgeschlagenes Buch (Klassenbuch)
  buch:
    '<path d="M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2z"/>' +
    '<path d="M12 6v14"/>' +
    '<path d="M7 9c1 0 2 .1 3 .4"/>' +
    '<path d="M7 12.5c1 0 2 .1 3 .4"/>' +
    // Zeilen der rechten Seite. Sie gehören zur Lage *unter* dem umschlagenden Blatt und
    // zeichnen sich beim Umschlagen von rechts nach links ein, während das Blatt sie
    // freigibt. Dafür `pathLength="1"`: eine Strichlänge ist damit genau eine Zeile,
    // unabhängig von ihrer tatsächlichen Länge (siehe .zeile in styles.css).
    '<path class="zeile" pathLength="1" d="M14 9.4c1-.3 2-.4 3-.4"/>' +
    '<path class="zeile" pathLength="1" d="M14 12.9c1-.3 2-.4 3-.4"/>' +
    // Umschlagendes Blatt samt seinen Zeilen: alle drei liegen deckungsgleich auf der
    // rechten Buchhälfte und sind deshalb im Ruhezustand nicht als eigenes Blatt zu
    // erkennen. Erst die Animation der Startseite klappt die Gruppe um den Rücken nach
    // links, wo sie genau auf der linken Hälfte samt deren Zeilen landet – die Zeilen
    // müssen mitwandern, sonst wirkt das Blatt beim Umschlagen durchsichtig
    // (siehe .blatt in styles.css).
    '<g class="blatt">' +
      '<path d="M12 6c2-1.5 4.5-2 8-2V18c-3.5 0-6 .5-8 2z"/>' +
      '<path d="M14 9.4c1-.3 2-.4 3-.4"/>' +
      '<path d="M14 12.9c1-.3 2-.4 3-.4"/>' +
    '</g>',
  // Stundenplan-Raster. Auf der Startseite entsteht das Raster Linie für Linie:
  // erst die Kopfzeile, dann die Spalten (`pathLength="1"`, siehe styles.css).
  stundenplan:
    '<rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<path class="kopfzeile" pathLength="1" d="M3 10h18"/>' +
    '<path class="spalte" pathLength="1" d="M9 10v11"/>' +
    '<path class="spalte spaeter" pathLength="1" d="M15 10v11"/>' +
    '<path d="M8 3v4"/>' +
    '<path d="M16 3v4"/>',
  // Gesprächsblasen (Lernentwicklungsgespräche)
  gespraech:
    '<path d="M14 4H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2v3l4-3h3a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>' +
    '<path d="M18 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3.5-3"/>',
  // Schieberegler (Einstellungen, Optionen, Regeln)
  einstellungen:
    '<path d="M4 6h9"/>' +
    '<path d="M17 6h3"/>' +
    '<circle cx="15" cy="6" r="2"/>' +
    '<path d="M4 12h3"/>' +
    '<path d="M11 12h9"/>' +
    '<circle cx="9" cy="12" r="2"/>' +
    '<path d="M4 18h9"/>' +
    '<path d="M17 18h3"/>' +
    '<circle cx="15" cy="18" r="2"/>',
  // Funkendes Tablet (Geräteverwaltung). Die drei Wellen sitzen konzentrisch um den
  // rechten Rand des Geräts (14,12) und sind die einzigen Pfade der Gruppe .wellen –
  // auf der Startseite gehen sie von dort nacheinander nach außen (siehe styles.css).
  geraet:
    '<rect x="3" y="3.5" width="11" height="17" rx="2"/>' +
    '<path d="M6.5 17.8h4"/>' +
    '<g class="wellen">' +
      '<path d="M15.4 10.6a2 2 0 0 1 0 2.8"/>' +
      '<path d="M16.8 9.2a4 4 0 0 1 0 5.7"/>' +
      '<path d="M18.2 7.8a6 6 0 0 1 0 8.5"/>' +
    '</g>',
  // Verbundene Knoten (Gruppenzusammensetzung). Die drei Kanten sind die einzigen
  // <path> im Motiv; auf der Startseite ziehen sie sich nacheinander zwischen den
  // Knoten – jede von ihrem ersten Knoten aus (`pathLength="1"`, siehe styles.css).
  knoten:
    '<circle cx="5.5" cy="6" r="2.5"/>' +
    '<circle cx="18.5" cy="6" r="2.5"/>' +
    '<circle cx="12" cy="18" r="2.5"/>' +
    '<path pathLength="1" d="M8 6h8"/>' +
    '<path pathLength="1" d="M6.8 8.2l4 7.6"/>' +
    '<path pathLength="1" d="M17.2 8.2l-4 7.6"/>',

  /* ----- Motive für Bedienelemente (Überschriften, Buttons, Hinweise) ----- */

  // Briefumschlag (Serienbrief, Anschreiben)
  brief:
    '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
    '<path d="M3.6 6.6l7.2 5.1a2 2 0 0 0 2.4 0l7.2-5.1"/>',
  // Textdokument mit umgeknickter Ecke (DOCX/ODT)
  dokument:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
    '<path d="M14 3v5h5"/>' +
    '<path d="M8.5 13h7"/>' +
    '<path d="M8.5 16.5h4.5"/>',
  // Tabelle mit Kopfzeile (Datensätze aus CSV/XLSX)
  tabelle:
    '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
    '<path d="M3 9h18"/>' +
    '<path d="M3 14.5h18"/>' +
    '<path d="M9.5 9v11"/>',
  // Auge (Vorschau)
  auge:
    '<path d="M2.5 12S6.4 5.8 12 5.8 21.5 12 21.5 12 17.6 18.2 12 18.2 2.5 12 2.5 12z"/>' +
    '<circle cx="12" cy="12" r="2.8"/>',
  // Pfeil in eine Ablage (Herunterladen, Speichern)
  download:
    '<path d="M12 3.5v10.5"/>' +
    '<path d="M7.8 10.2L12 14.4l4.2-4.2"/>' +
    '<path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2"/>',
  // Haken im Kreis (erledigt)
  haken:
    '<circle cx="12" cy="12" r="8.8"/>' +
    '<path d="M8 12.3l2.7 2.7L16 9.6"/>',
  // Kreuz im Kreis (fehlgeschlagen, fehlt)
  kreuz:
    '<circle cx="12" cy="12" r="8.8"/>' +
    '<path d="M9.3 9.3l5.4 5.4"/>' +
    '<path d="M14.7 9.3l-5.4 5.4"/>',
  // Dreieck mit Ausrufezeichen (Warnung)
  warnung:
    '<path d="M10.3 4.4L2.9 17.3A2 2 0 0 0 4.6 20.3h14.8a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0z"/>' +
    '<path d="M12 9.8v3.9"/>' +
    '<path d="M12 16.9v.01"/>',
  // Pfeil aus einer Ablage heraus (Hochladen, Importieren)
  upload:
    '<path d="M12 15.5V4.5"/>' +
    '<path d="M7.8 8.7L12 4.5l4.2 4.2"/>' +
    '<path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2"/>',
  // Trichter (Filter, Auswahl einschränken)
  filter:
    '<path d="M4.2 5h15.6l-6.1 7.3v5.3l-3.4 2v-7.3z"/>',
  // Balkendiagramm mit Achse (Auswertung, Zusammenfassung)
  diagramm:
    '<path d="M3.5 3.5v17h17"/>' +
    '<rect x="7" y="12" width="3" height="5.5" rx="0.7"/>' +
    '<rect x="12" y="8.5" width="3" height="9" rx="0.7"/>' +
    '<rect x="17" y="5.5" width="3" height="12" rx="0.7"/>',
  // Sanduhr (Verarbeitung läuft)
  sanduhr:
    '<path d="M7 3.5h10"/>' +
    '<path d="M7 20.5h10"/>' +
    '<path d="M8.2 3.5v3.7L12 12l-3.8 4.8v3.7"/>' +
    '<path d="M15.8 3.5v3.7L12 12l3.8 4.8v3.7"/>',
  // Wiedergabe-Zeichen (Start, Fortsetzen)
  start:
    '<path d="M8.5 5.6l9.4 6.4-9.4 6.4z"/>',
  // Pause
  pause:
    '<rect x="8" y="5.5" width="2.8" height="13" rx="1"/>' +
    '<rect x="13.2" y="5.5" width="2.8" height="13" rx="1"/>',
  // Stopp (Beenden)
  stopp:
    '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  // Einzelne Person (Schülerdaten)
  person:
    '<circle cx="12" cy="8" r="3.4"/>' +
    '<path d="M5.6 20c0-3.5 2.9-6.4 6.4-6.4s6.4 2.9 6.4 6.4"/>',
  // Zwei Erwachsene (Elterndaten)
  eltern:
    '<circle cx="8.6" cy="8.4" r="2.7"/>' +
    '<circle cx="15.4" cy="8.4" r="2.7"/>' +
    '<path d="M3.5 19c0-2.8 2.3-5.1 5.1-5.1 1.1 0 2.1.3 2.9.9"/>' +
    '<path d="M20.5 19c0-2.8-2.3-5.1-5.1-5.1-1.1 0-2.1.3-2.9.9"/>',
  // Tafel auf Gestell (Lehrkräfte)
  tafel:
    '<rect x="3.5" y="3.5" width="17" height="11.5" rx="1.5"/>' +
    '<path d="M7 7.5h7"/>' +
    '<path d="M7 11h4"/>' +
    '<path d="M12 15v2.6"/>' +
    '<path d="M8.4 20.5l3.6-3 3.6 3"/>',
  // Zwei sich überschneidende Mengen (Daten zusammenführen). Bewusst kompakt und
  // symmetrisch: In der Überschrift liegt die linke Hälfte hinter dem Text, ein Motiv
  // aus waagerechten Linien bliebe dort als versprengter Rest zurück.
  zusammenfuehren:
    '<circle cx="9.2" cy="12" r="6.2"/>' +
    '<circle cx="14.8" cy="12" r="6.2"/>',
  // Aufzählung (Liste, Kursliste)
  liste:
    '<path d="M4.5 6.5h.01"/>' +
    '<path d="M4.5 12h.01"/>' +
    '<path d="M4.5 17.5h.01"/>' +
    '<path d="M8.5 6.5h11"/>' +
    '<path d="M8.5 12h11"/>' +
    '<path d="M8.5 17.5h11"/>'
};

// Baut ein SVG aus dem Icon-Vorrat; `klasse` ist z. B. 'card-icon' oder 'panel-icon'.
function toolhubIcon(name, klasse) {
  const inhalt = TOOLHUB_ICONS[name];
  if (!inhalt) return '';
  return `<svg class="${klasse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inhalt + '</svg>';
}

// Ersetzt <span data-icon="…"> durch das zugehörige SVG (Klassen bleiben erhalten)
function toolhubSetzeIcons(wurzel = document) {
  wurzel.querySelectorAll('[data-icon]').forEach((el) => {
    const svg = toolhubIcon(el.dataset.icon, el.className);
    if (svg) el.outerHTML = svg;
  });
}

/*
 * Sucht in einer Kategorie den Eintrag, dessen `ziel` auf die gerade geöffnete Seite
 * verweist – daraus stammt der Name, unter dem das Tool hier auftritt.
 */
function toolhubAliasEintrag(kategorie) {
  const seite = location.pathname.replace(/index\.html$/, '');
  return kategorie.tools.find((tool) => {
    if (!tool.ziel) return false;
    const pfad = tool.ziel.split('?')[0].replace(/index\.html$/, '');
    return pfad && seite.endsWith(pfad);
  });
}

/*
 * Ein Tool kann in mehreren Kategorien auftauchen, ohne kopiert zu werden: Wird die
 * Seite mit ?kategorie=<id> geöffnet, übernimmt sie Farbe, Icon und Bezeichnung dieser
 * Kategorie. Eingetragen wird das in tools.js über `ziel` beim jeweiligen Tool.
 *
 * Die Farbe steckt in der Klasse .cat-<id> am <body>. Icon und Bezeichnung greifen nur,
 * wenn die Seite zusätzlich tools.js einbindet (dort stehen Icon und Name) und ihre
 * Platzhalter mit data-kategorie-icon bzw. data-kategorie-titel markiert hat.
 *
 * Läuft vor toolhubSetzeIcons(), damit nur der endgültige Icon-Name gezeichnet wird.
 */
function toolhubKategorieUebernehmen() {
  const id = new URLSearchParams(location.search).get('kategorie');
  // Nur einfache Ordnernamen zulassen – der Wert landet in einem Klassennamen
  if (!id || !/^[a-z0-9_]+$/.test(id)) return;

  const body = document.body;
  [...body.classList].forEach((klasse) => {
    if (klasse.startsWith('cat-')) body.classList.remove(klasse);
  });
  body.classList.add(`cat-${id}`);

  const kategorie = typeof TOOLHUB_KATEGORIEN !== 'undefined'
    ? TOOLHUB_KATEGORIEN.find((eintrag) => eintrag.id === id)
    : null;
  if (!kategorie) return;

  document.querySelectorAll('[data-kategorie-icon]').forEach((el) => {
    el.dataset.icon = kategorie.icon;
  });

  // Bezeichnung aus tools.js übernehmen – so steht der Name nur an einer Stelle
  const eintrag = toolhubAliasEintrag(kategorie);
  if (!eintrag) return;
  document.querySelectorAll('[data-kategorie-titel]').forEach((el) => {
    el.textContent = eintrag.name;
  });
  document.title = `${eintrag.name} – toolhub`;
}

/*
 * Kopfzeile jeder Seite: Zurück-Link (nur auf Tool-Seiten) und Theme-Umschalter.
 * Beides wird hier erzeugt, damit das Markup nicht in jeder Tool-Seite steht.
 *
 * Der Zurück-Link erscheint, sobald der <body> eine Kategorie-Klasse trägt
 * (z. B. class="cat-klassenzusammensetzung"); Ziel ist die Startseite zwei
 * Ebenen höher, abweichend über <body data-zurueck="…"> einstellbar.
 */
const TOOLHUB_ICON_SONNE =
  '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="4"/>' +
  '<path d="M12 2v2"/><path d="M12 20v2"/>' +
  '<path d="M4.9 4.9l1.4 1.4"/><path d="M17.7 17.7l1.4 1.4"/>' +
  '<path d="M2 12h2"/><path d="M20 12h2"/>' +
  '<path d="M4.9 19.1l1.4-1.4"/><path d="M17.7 6.3l1.4-1.4"/></svg>';

const TOOLHUB_ICON_MOND =
  '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function toolhubKopf() {
  const body = document.body;
  const istToolSeite = [...body.classList].some((klasse) => klasse.startsWith('cat-'));

  if (istToolSeite && !document.querySelector('.back-link')) {
    const zurueck = document.createElement('a');
    zurueck.className = 'back-link';
    zurueck.href = body.dataset.zurueck || '../../index.html';
    zurueck.innerHTML = '&#8592; <em id="h1a">tool</em><em id="h1b">hub</em>';
    body.prepend(zurueck);
  }

  let toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.id = 'theme-toggle';
    toggle.type = 'button';
    toggle.title = 'Design wechseln';
    toggle.setAttribute('aria-label', 'Zwischen hellem und dunklem Design wechseln');
    toggle.innerHTML = TOOLHUB_ICON_SONNE + TOOLHUB_ICON_MOND;
    body.prepend(toggle);
  }

  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('toolhub-theme', next);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  toolhubKategorieUebernehmen();
  toolhubKopf();
  toolhubSetzeIcons();
});

/*
 * Gemeinsame Datei-Upload-Komponente (Klick + Drag-and-drop, Badges mit Entfernen).
 * Zugehöriges Markup und CSS: siehe Abschnitt "Datei-Upload" in toolhub.css.
 *
 * Verwendung:
 *   const upload = toolhubUpload({
 *     input: 'meinInput',          // id des <input type="file"> (multiple-Attribut wird übernommen)
 *     zone: 'meinInputZone',       // id des Ablage-/Klickbereichs (.upload-box)
 *     list: 'meinInputList',       // id des Badge-Containers (.file-list)
 *     extensions: ['.xlsx'],       // erlaubte Endungen (leer = alle)
 *     onChange: (files) => {},     // optional: nach jeder Änderung der Auswahl
 *     onInvalid: (names) => {}     // optional: bei abgelehnten Dateien (Standard: alert)
 *   });
 *
 *   upload.files  – aktuelle Auswahl (Array von File-Objekten)
 *   upload.clear()– Auswahl leeren
 *
 * Bei multiple wird die Auswahl ergänzt (Duplikate übersprungen),
 * andernfalls ersetzt die neue Datei die bisherige.
 */
function toolhubUpload({ input, zone, list, extensions = [], onChange, onInvalid }) {
  const inputEl = document.getElementById(input);
  const zoneEl = document.getElementById(zone);
  const listEl = list ? document.getElementById(list) : null;
  const files = [];

  function notify() {
    if (onChange) onChange(files.slice());
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    files.forEach((file, index) => {
      const badge = document.createElement('span');
      badge.className = 'file-badge';
      badge.textContent = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Datei entfernen';
      removeBtn.setAttribute('aria-label', `${file.name} entfernen`);
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        files.splice(index, 1);
        render();
        notify();
      });

      badge.appendChild(removeBtn);
      listEl.appendChild(badge);
    });
  }

  function matchesExtension(file) {
    if (extensions.length === 0) return true;
    const name = file.name.toLowerCase();
    return extensions.some((ext) => name.endsWith(ext.toLowerCase()));
  }

  function add(fileList) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const valid = incoming.filter(matchesExtension);
    const invalid = incoming.filter((file) => !matchesExtension(file));

    if (invalid.length > 0) {
      const names = invalid.map((file) => file.name);
      if (onInvalid) {
        onInvalid(names);
      } else {
        alert(`Ungültiges Dateiformat (erlaubt: ${extensions.join(', ')}): ${names.join(', ')}`);
      }
    }

    if (valid.length === 0) return;

    if (inputEl.multiple) {
      valid.forEach((file) => {
        const schonVorhanden = files.some((f) =>
          f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
        if (!schonVorhanden) files.push(file);
      });
    } else {
      files.length = 0;
      files.push(valid[0]);
    }

    render();
    notify();
  }

  zoneEl.addEventListener('click', () => inputEl.click());

  ['dragenter', 'dragover'].forEach((eventName) => {
    zoneEl.addEventListener(eventName, (event) => {
      event.preventDefault();
      zoneEl.classList.add('dragover');
    });
  });

  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('dragover'));

  zoneEl.addEventListener('drop', (event) => {
    event.preventDefault();
    zoneEl.classList.remove('dragover');
    add(event.dataTransfer.files);
  });

  inputEl.addEventListener('change', () => {
    add(inputEl.files);
    inputEl.value = ''; // erlaubt erneutes Auswählen derselben Datei
  });

  return {
    files,
    clear() {
      files.length = 0;
      render();
      notify();
    }
  };
}
