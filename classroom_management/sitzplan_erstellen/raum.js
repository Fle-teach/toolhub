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
 * Eine Vorlage füllt den Raum, der gerade eingestellt ist – sie bringt keine eigene
 * Größe mit. So beschreibt man erst den Raum, den man vor sich hat (etwa 11 Plätze
 * breit, 6 Reihen tief), und bekommt darin eine U-Form, die auch wirklich an den
 * Wänden entlangläuft, statt mitten im Zimmer zu enden.
 *
 * Was nicht mehr hineinpasst, entfällt; für eine Vorlage, die im gesetzten Raum gar
 * nichts unterbringen kann, bleibt der Raum leer und der Hinweis unter dem Plan sagt
 * es. Die meisten Anordnungen sind Blöcke gleicher Tische – dafür genügt ein Bauplan
 * statt ausgeschriebener Koordinaten.
 * ------------------------------------------------------------------------ */

const SITZPLAN_RAUM_STANDARD = { breite: 9, tiefe: 4 };

/*
 * Gleiche Tische in Zeilen und Spalten, so oft sie hineinpassen.
 *
 *   spalten/reihen   Maße eines einzelnen Tisches in Feldern
 *   gangX/gangY      freie Felder zwischen zwei Tischen
 *
 * Waagerecht wird zentriert (der Rest verteilt sich auf beide Seitengänge),
 * senkrecht nicht: Tische stehen ab der ersten Reihe, freier Platz bleibt hinten.
 */
function raumBloecke(breite, tiefe, spalten, reihen, gangX = 1, gangY = 0) {
  const schrittX = spalten + gangX;
  const schrittY = reihen + gangY;
  const anzahlX = Math.floor((breite + gangX) / schrittX);
  const anzahlY = Math.floor((tiefe + gangY) / schrittY);

  const tische = [];
  if (anzahlX > 0 && anzahlY > 0) {
    const versatzX = Math.floor((breite - (anzahlX * schrittX - gangX)) / 2);
    for (let ry = 0; ry < anzahlY; ry++) {
      for (let rx = 0; rx < anzahlX; rx++) {
        tische.push(raumTischNeu(versatzX + rx * schrittX, ry * schrittY, spalten, reihen));
      }
    }
  }
  return { breite, tiefe, tische };
}

// Durchgehende Reihen: je Reihe ein Tisch über die volle Raumbreite
function raumReihen(breite, tiefe) {
  const tische = [];
  for (let y = 0; y < tiefe; y++) tische.push(raumTischNeu(0, y, breite, 1));
  return { breite, tiefe, tische };
}

/*
 * Eine Kante des Hufeisens mit Tischen zu je `laenge` Plätzen füllen. Der Rest am
 * Ende bekommt einen kürzeren Tisch, damit die Kante durchgehend besetzt ist.
 */
function raumKante(tische, von, bis, laenge, senkrecht, quer) {
  for (let i = von; i <= bis; i += laenge) {
    const stueck = Math.min(laenge, bis - i + 1);
    tische.push(senkrecht ? raumTischNeu(quer, i, 1, stueck) : raumTischNeu(i, quer, stueck, 1));
  }
}

/*
 * U-Form: Die offene Seite zeigt zur Tafel, geschlossen wird hinten. Die Seitenflügel
 * laufen an den Wänden entlang, die hintere Kante schließt zwischen ihnen ab.
 * `doppelt` legt ein zweites, kleineres U hinein.
 */
function raumHufeisen(breite, tiefe, doppelt) {
  const tische = [];
  const u = (rand) => {
    const links = rand;
    const rechts = breite - 1 - rand;
    const hinten = tiefe - 1 - rand;
    // Unter diesen Maßen bleibt von einem U nichts übrig, was diesen Namen verdient
    if (rechts - links < 2 || hinten - rand < 1) return;
    raumKante(tische, rand, hinten - 1, 5, true, links);          // linker Flügel
    raumKante(tische, rand, hinten - 1, 5, true, rechts);         // rechter Flügel
    raumKante(tische, links + 1, rechts - 1, 3, false, hinten);   // hintere Kante
  };
  u(0);
  if (doppelt) u(2);
  return { breite, tiefe, tische };
}

const SITZPLAN_VORLAGEN = [
  { id: 'frontal_2er', name: 'Frontalreihen, 2er-Tische',
    hinweis: 'die verbreitetste Anordnung',
    erzeugen: (b, t) => raumBloecke(b, t, 2, 1) },
  { id: 'frontal_3er', name: 'Frontalreihen, 3er-Tische',
    hinweis: 'breitere Blöcke, weniger Gänge',
    erzeugen: (b, t) => raumBloecke(b, t, 3, 1) },
  { id: 'gruppen_4er', name: 'Gruppentische (4er)',
    hinweis: 'Inseln zu je vier Plätzen, je zwei gegenüber',
    erzeugen: (b, t) => raumBloecke(b, t, 2, 2, 1, 1) },
  { id: 'gruppen_6er', name: 'Gruppentische (6er)',
    hinweis: 'Inseln zu je sechs Plätzen, je drei gegenüber',
    erzeugen: (b, t) => raumBloecke(b, t, 3, 2, 1, 1) },
  { id: 'kino', name: 'Durchgehende Reihen',
    hinweis: 'Reihen über die volle Raumbreite, ohne Mittelgang',
    erzeugen: (b, t) => raumReihen(b, t) },
  { id: 'u_form', name: 'U-Form',
    hinweis: 'an den Wänden entlang, zur Tafel hin offen',
    erzeugen: (b, t) => raumHufeisen(b, t, false) },
  { id: 'doppel_u', name: 'Doppeltes U',
    hinweis: 'U-Form mit zweitem U darin, für große Lerngruppen',
    erzeugen: (b, t) => raumHufeisen(b, t, true) },
  { id: 'einzel', name: 'Einzeltische (Klassenarbeit)',
    hinweis: 'alle Plätze einzeln und mit Abstand',
    erzeugen: (b, t) => raumBloecke(b, t, 1, 1, 1, 1) }
];

function raumAusVorlage(id, breite = SITZPLAN_RAUM_STANDARD.breite, tiefe = SITZPLAN_RAUM_STANDARD.tiefe) {
  const vorlage = SITZPLAN_VORLAGEN.find((v) => v.id === id) || SITZPLAN_VORLAGEN[0];
  return vorlage.erzeugen(Math.max(1, breite), Math.max(1, tiefe));
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
