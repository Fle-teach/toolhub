/*
 * raum.js – Raummodell, Vorlagen und der Editor für die Tischanordnung.
 *
 * Der Raum ist ein Raster aus Feldern, und ein Feld ist genau ein Sitzplatz: Ein
 * Tisch belegt `spalten` × `reihen` Felder und bringt ebenso viele Plätze mit. Feiner
 * als platzweise lässt sich ein Tisch nicht stellen – gröber aber auch nicht, und mehr
 * Freiheit braucht ein Klassenraum nicht. Gänge entstehen dadurch, dass Felder frei
 * bleiben.
 *
 *   Tisch   { id, x, y, spalten, reihen }      x/y = linke obere Ecke in Feldern
 *   Platz   { id, tischId, index, x, y, spalte, reihe }
 *
 * y = 0 ist die vorderste Reihe; die Tafel steht oberhalb des Rasters. Daran hängen
 * die Regeln „weit vorne sitzen“ und „nicht in der letzten Reihe“.
 *
 * Nachbarschaft ist bewusst zweigeteilt:
 *   nebeneinander  gleicher Tisch, gleiche Tischreihe, direkt daneben
 *   am selben Tisch beliebige zwei Plätze desselben Tisches (an einem 4er-Gruppentisch
 *                  sitzt man sich gegenüber, ohne nebeneinander zu sitzen)
 */

let raumZaehler = 0;

function raumTischNeu(x, y, spalten, reihen) {
  raumZaehler += 1;
  return { id: `t${raumZaehler}`, x, y, spalten, reihen };
}

// Nach dem Laden eines Speicherstands weiterzählen, damit keine ID doppelt vergeben wird
function raumZaehlerAngleichen(raum) {
  raum.tische.forEach((tisch) => {
    const nummer = parseInt(String(tisch.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(nummer) && nummer > raumZaehler) raumZaehler = nummer;
  });
}

function raumPlatzAnzahl(raum) {
  return raum.tische.reduce((summe, tisch) => summe + tisch.spalten * tisch.reihen, 0);
}

// Alle Plätze in Lesereihenfolge: vorne nach hinten, links nach rechts
function raumPlaetze(raum) {
  const plaetze = [];
  raum.tische.forEach((tisch) => {
    for (let index = 0; index < tisch.spalten * tisch.reihen; index++) {
      const spalte = index % tisch.spalten;
      const reihe = Math.floor(index / tisch.spalten);
      plaetze.push({
        id: `${tisch.id}-${index}`,
        tischId: tisch.id,
        index,
        spalte,
        reihe,
        x: tisch.x + spalte,
        y: tisch.y + reihe
      });
    }
  });
  return plaetze.sort((a, b) => a.y - b.y || a.x - b.x);
}

/*
 * Vorbereitete Nachschlagewerke für den Optimierer. Sie werden einmal je Raum gebaut,
 * weil die Kostenfunktion sie in jedem Schritt braucht.
 */
function raumGeometrie(raum) {
  const plaetze = raumPlaetze(raum);
  const nachIndex = new Map(plaetze.map((platz, i) => [platz.id, i]));
  const letzteReihe = plaetze.reduce((max, platz) => Math.max(max, platz.y), 0);

  // nebeneinander: gleicher Tisch, gleiche Tischreihe, Spalten direkt nebeneinander
  const nebenan = plaetze.map(() => []);
  // am selben Tisch: alle übrigen Plätze desselben Tisches
  const amTisch = plaetze.map(() => []);
  plaetze.forEach((a, i) => {
    plaetze.forEach((b, j) => {
      if (i === j || a.tischId !== b.tischId) return;
      amTisch[i].push(j);
      if (a.reihe === b.reihe && Math.abs(a.spalte - b.spalte) === 1) nebenan[i].push(j);
    });
  });

  // Tische als Listen von Platz-Indizes – für Regeln, die je Tisch zählen
  const tische = raum.tische.map((tisch) =>
    plaetze.map((platz, i) => (platz.tischId === tisch.id ? i : -1)).filter((i) => i >= 0));

  // Zusammenhängende Sitzbänke: je Tisch eine Liste je Tischreihe, von links nach rechts.
  // Daran hängt die Muster-Regel (Junge-Mädchen und Junge-Junge-Mädchen-Mädchen).
  const baenke = [];
  raum.tische.forEach((tisch) => {
    for (let reihe = 0; reihe < tisch.reihen; reihe++) {
      const bank = plaetze
        .map((platz, i) => ({ platz, i }))
        .filter(({ platz }) => platz.tischId === tisch.id && platz.reihe === reihe)
        .sort((a, b) => a.platz.spalte - b.platz.spalte)
        .map(({ i }) => i);
      if (bank.length) baenke.push(bank);
    }
  });

  return { plaetze, nachIndex, nebenan, amTisch, tische, baenke, letzteReihe };
}

// Abstand zweier Plätze in Feldern – Grundlage der Trennregeln ("mindestens N Plätze weg")
function raumAbstand(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ---------------------------------------------------------------------------
 * Vorlagen
 *
 * Die meisten Anordnungen sind Blöcke gleicher Tische in Zeilen und Spalten – dafür
 * genügt ein Bauplan statt ausgeschriebener Koordinaten. Die Raumgröße ergibt sich
 * aus den Tischen, damit keine leere Fläche mitgeschleppt wird.
 * ------------------------------------------------------------------------ */

function raumBloecke(spalten, reihen, anzahlX, anzahlY, gangX = 1, gangY = 0) {
  const schrittX = spalten + gangX;
  const schrittY = reihen + gangY;
  const tische = [];
  for (let ry = 0; ry < anzahlY; ry++) {
    for (let rx = 0; rx < anzahlX; rx++) {
      tische.push(raumTischNeu(rx * schrittX, ry * schrittY, spalten, reihen));
    }
  }
  return {
    breite: anzahlX * schrittX - gangX,
    tiefe: anzahlY * schrittY - gangY,
    tische
  };
}

/*
 * U-Form: Die offene Seite zeigt zur Tafel, geschlossen wird hinten. Die Seitenflügel
 * sind senkrechte Tische (1 Spalte, mehrere Reihen), die hintere Kante waagerechte.
 */
function raumHufeisen(doppelt) {
  const breite = 13;
  const tiefe = 7;
  const tische = [
    raumTischNeu(0, 1, 1, 5),                 // linker Flügel
    raumTischNeu(breite - 1, 1, 1, 5),        // rechter Flügel
    raumTischNeu(1, tiefe - 1, 3, 1),         // hintere Kante
    raumTischNeu(4, tiefe - 1, 3, 1),
    raumTischNeu(7, tiefe - 1, 3, 1),
    raumTischNeu(10, tiefe - 1, 2, 1)
  ];
  if (doppelt) {
    tische.push(
      raumTischNeu(2, 2, 1, 3),               // innerer Flügel links
      raumTischNeu(breite - 3, 2, 1, 3),      // innerer Flügel rechts
      raumTischNeu(3, tiefe - 2, 3, 1),       // innere hintere Kante
      raumTischNeu(6, tiefe - 2, 3, 1)
    );
  }
  return { breite, tiefe, tische };
}

const SITZPLAN_VORLAGEN = [
  { id: 'frontal_2er', name: 'Frontalreihen, 2er-Tische',
    hinweis: 'Drei Blöcke, vier Reihen – die verbreitetste Anordnung',
    erzeugen: () => raumBloecke(2, 1, 3, 4) },
  { id: 'frontal_3er', name: 'Frontalreihen, 3er-Tische',
    hinweis: 'Drei Blöcke, drei Reihen',
    erzeugen: () => raumBloecke(3, 1, 3, 3) },
  { id: 'gruppen_4er', name: 'Gruppentische (4er)',
    hinweis: 'Sechs Inseln zu je vier Plätzen, je zwei gegenüber',
    erzeugen: () => raumBloecke(2, 2, 3, 2, 1, 1) },
  { id: 'gruppen_6er', name: 'Gruppentische (6er)',
    hinweis: 'Sechs Inseln zu je sechs Plätzen, je drei gegenüber',
    erzeugen: () => raumBloecke(3, 2, 3, 2, 1, 1) },
  { id: 'kino', name: 'Durchgehende Reihen',
    hinweis: 'Vier Reihen ohne Mittelgang',
    erzeugen: () => raumBloecke(8, 1, 1, 4) },
  { id: 'u_form', name: 'U-Form',
    hinweis: 'Zur Tafel hin offen – alle sehen einander',
    erzeugen: () => raumHufeisen(false) },
  { id: 'doppel_u', name: 'Doppeltes U',
    hinweis: 'U-Form mit zweiter Reihe innen, für große Lerngruppen',
    erzeugen: () => raumHufeisen(true) },
  { id: 'einzel', name: 'Einzeltische (Klassenarbeit)',
    hinweis: 'Alle Plätze einzeln und mit Abstand',
    erzeugen: () => raumBloecke(1, 1, 5, 5, 1, 1) }
];

function raumAusVorlage(id) {
  const vorlage = SITZPLAN_VORLAGEN.find((v) => v.id === id) || SITZPLAN_VORLAGEN[0];
  return vorlage.erzeugen();
}

/* ---------------------------------------------------------------------------
 * Tische setzen, prüfen, verändern
 * ------------------------------------------------------------------------ */

function raumUeberschneidung(tisch, anderer) {
  return tisch.x < anderer.x + anderer.spalten && anderer.x < tisch.x + tisch.spalten
      && tisch.y < anderer.y + anderer.reihen && anderer.y < tisch.y + tisch.reihen;
}

// Passt ein Tisch an diese Stelle? (innerhalb des Rasters und ohne einen anderen zu treffen)
function raumPlatzFrei(raum, tisch, ausser = null) {
  if (tisch.x < 0 || tisch.y < 0) return false;
  if (tisch.x + tisch.spalten > raum.breite) return false;
  if (tisch.y + tisch.reihen > raum.tiefe) return false;
  return !raum.tische.some((anderer) => anderer.id !== (ausser || tisch.id)
    && raumUeberschneidung(tisch, anderer));
}

// Erste freie Stelle von vorne links – dorthin kommt ein neu hinzugefügter Tisch
function raumFreieStelle(raum, spalten, reihen) {
  for (let y = 0; y + reihen <= raum.tiefe; y++) {
    for (let x = 0; x + spalten <= raum.breite; x++) {
      const probe = { id: '', x, y, spalten, reihen };
      if (raumPlatzFrei(raum, probe)) return { x, y };
    }
  }
  return null;
}

function raumTischHinzufuegen(raum, spalten, reihen) {
  const stelle = raumFreieStelle(raum, spalten, reihen);
  if (!stelle) return null;
  const tisch = raumTischNeu(stelle.x, stelle.y, spalten, reihen);
  raum.tische.push(tisch);
  return tisch;
}

// Drehen heißt: Spalten und Reihen tauschen. Geht nur, wenn der Tisch dann noch passt.
function raumTischDrehen(raum, tischId) {
  const tisch = raum.tische.find((t) => t.id === tischId);
  if (!tisch) return false;
  const gedreht = { ...tisch, spalten: tisch.reihen, reihen: tisch.spalten };
  if (!raumPlatzFrei(raum, gedreht, tisch.id)) return false;
  tisch.spalten = gedreht.spalten;
  tisch.reihen = gedreht.reihen;
  return true;
}

function raumTischEntfernen(raum, tischId) {
  const index = raum.tische.findIndex((t) => t.id === tischId);
  if (index >= 0) raum.tische.splice(index, 1);
}

/*
 * Raumgröße ändern. Tische, die dadurch aus dem Raster fielen, werden so weit wie
 * möglich hereingeschoben; was dann immer noch nicht passt, fällt weg – besser als
 * ein Tisch, der unsichtbar außerhalb des Raums weiterlebt.
 */
function raumGroesseSetzen(raum, breite, tiefe) {
  raum.breite = Math.max(1, breite);
  raum.tiefe = Math.max(1, tiefe);
  raum.tische = raum.tische.filter((tisch) => {
    tisch.x = Math.min(tisch.x, raum.breite - tisch.spalten);
    tisch.y = Math.min(tisch.y, raum.tiefe - tisch.reihen);
    return tisch.x >= 0 && tisch.y >= 0;
  });
}

/*
 * Auf die kleinste Fläche zusammenziehen, in der noch alle Tische stehen. Nach dem
 * Löschen von Tischen bleibt sonst leerer Raum stehen, der später mitgedruckt wird.
 */
function raumZuschneiden(raum) {
  if (!raum.tische.length) return;
  const minX = Math.min(...raum.tische.map((t) => t.x));
  const minY = Math.min(...raum.tische.map((t) => t.y));
  raum.tische.forEach((tisch) => { tisch.x -= minX; tisch.y -= minY; });
  raum.breite = Math.max(...raum.tische.map((t) => t.x + t.spalten));
  raum.tiefe = Math.max(...raum.tische.map((t) => t.y + t.reihen));
}
