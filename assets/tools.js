/*
 * tools.js – Verzeichnis aller Kategorien und Tools.
 *
 * Einzige Stelle, an der steht, welche Tools es gibt: Die Kacheln der Startseite
 * werden daraus erzeugt. Ein neues Tool wird hier eingetragen, die Startseite
 * bleibt unverändert.
 *
 * Die Kategoriefarben stehen in toolhub.css (Klassen .cat-<id>), die Icons in
 * toolhub.js (TOOLHUB_ICONS) – beides wird auch von den Tool-Seiten genutzt.
 *
 * Bewusst eine gewöhnliche Skriptdatei und keine JSON-Datei: so lässt sich die
 * Startseite auch ohne lokalen Server (über file://) öffnen.
 */

/*
 * Kategorien in der Reihenfolge, in der sie auf der Startseite erscheinen.
 *
 *   id      Ordnername; bestimmt zugleich die Farbklasse (.cat-<id>)
 *   name    Überschrift der Kachel
 *   icon    Schlüssel aus TOOLHUB_ICONS
 *   tools   { name, ordner } – ohne `ordner` gilt das Tool als geplant und
 *           wird ausgegraut dargestellt statt als toter Link
 *
 * Ein Tool kann in mehreren Kategorien auftauchen, ohne kopiert zu werden: statt
 * `ordner` bekommt der Eintrag dann `ziel` – einen Pfad ab dem Wurzelverzeichnis.
 * Mit `?kategorie=<id>` übernimmt die Zielseite Farbe und Icon dieser Kategorie:
 *
 *   { name: 'Lernfördervereinbarungen erstellen',
 *     ziel: 'allgemein/serienbrief/index.html?kategorie=foerderkoordination' }
 */
const TOOLHUB_KATEGORIEN = [
  {
    id: 'allgemein',
    name: 'Allgemein',
    icon: 'raster',
    tools: [
      { name: 'Serienbriefe aus Vorlage (DOCX/ODT) und Datensätzen (CSV/XLSX) erstellen', ordner: 'serienbrief' }
    ]
  },
  {
    id: 'foerderkoordination',
    name: 'Förderkoordination',
    icon: 'setzling',
    tools: [
      { name: 'SuS mit Förderbedarf ermitteln', ordner: 'sus_mit_foerderbedarf_ermitteln' },
      // Verweist auf das allgemeine Serienbrief-Tool – dort in den Farben dieser Kategorie
      { name: 'Lernfördervereinbarungen erstellen',
        ziel: 'allgemein/serienbrief/index.html?kategorie=foerderkoordination' },
      { name: 'Förderlisten kombinieren', ordner: 'foerderlisten_kombinieren' }
    ]
  },
  {
    id: 'geraeteverwaltung',
    name: 'Geräteverwaltung',
    icon: 'geraet',
    tools: [
      { name: 'Routereinträge für Schüler-iPads erstellen',
        ordner: 'routereintraege_fuer_schueler_ipads_erstellen' },
      { name: 'Sperrbildschirme für iPads erstellen',
        ordner: 'sperrbildschirme_fuer_ipads_erstellen' }
    ]
  },
  {
    id: 'iserv_benutzerverwaltung',
    name: 'IServ-Benutzerverwaltung',
    icon: 'benutzer',
    tools: [
      { name: 'Schüler-, Eltern-, Lehrer-, und Kursdaten aus DiViS in IServ importieren', ordner: 'zsr_divis_merger' }
    ]
  },
  {
    id: 'iserv_formulare',
    name: 'IServ-Formulare',
    icon: 'formular',
    tools: [
      { name: 'Fehlende Abgaben ermitteln & doppelte Abgaben entfernen', ordner: 'abgaben_verwalten' }
    ]
  },
  {
    id: 'iserv_klassenbuch',
    name: 'IServ-Klassenbuch',
    icon: 'buch',
    tools: [
      { name: 'Fehlzeiten nach Fächern auswerten', ordner: 'fehlzeiten_nach_faechern_auswerten' }
    ]
  },
  {
    id: 'iserv_stundenplan',
    name: 'IServ-Stundenplan',
    icon: 'stundenplan',
    tools: [
      { name: 'UNTIS-Export für Import in IServ vorverarbeiten', ordner: 'untis_export_fuer_import_in_iserv_vorbereiten' }
    ]
  },
  {
    id: 'legs',
    name: 'LEGs',
    icon: 'gespraech',
    tools: [
      { name: 'Schülerabgaben (CSV) in für KuK ausfüllbare Bögen (DOCX) umwandeln', ordner: 'sus_abgaben_in_kuk_boegen_umwandeln' }
    ]
  },
  {
    id: 'klassenzusammensetzung',
    name: 'Klassen- & Kurszusammensetzung',
    icon: 'knoten',
    tools: [
      { name: 'Neue Klassenzusammensetzungen für den Jahrgangswechsel 6/7 erstellen', ordner: 'optimierer' },
      { name: 'Verschiebbare Paare ermitteln', ordner: 'verschiebbare_Paare_ermitteln' },
      { name: 'Kurseinteilung WPB', ordner: 'kurseinteilung_WPB' }
    ]
  }
];

// Kacheln der Startseite erzeugen
function toolhubRendereKacheln(ziel) {
  ziel.innerHTML = TOOLHUB_KATEGORIEN.map((kategorie) => {
    const links = kategorie.tools.map((tool) => {
      const beschriftung = toolhubEscapeHtml(tool.name);
      // `ziel` verweist auf ein Tool in einem anderen Ordner (siehe Kopf der Datei)
      const pfad = tool.ziel || (tool.ordner && `${kategorie.id}/${tool.ordner}/index.html`);
      return pfad
        ? `<a href="${toolhubEscapeHtml(pfad)}">${beschriftung}</a>`
        : `<span class="geplant" title="noch nicht verfügbar">${beschriftung}</span>`;
    }).join('\n      ');

    return `<section class="card cat-${kategorie.id}">
      ${toolhubIcon(kategorie.icon, 'card-icon')}
      <h2>${toolhubEscapeHtml(kategorie.name)}</h2>
      <div class="tools">
      ${links}
      </div>
    </section>`;
  }).join('\n\n');
}

document.addEventListener('DOMContentLoaded', () => {
  const kacheln = document.getElementById('kacheln');
  if (kacheln) toolhubRendereKacheln(kacheln);
});
