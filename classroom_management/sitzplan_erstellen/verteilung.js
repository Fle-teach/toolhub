/*
 * verteilung.js – Regeln, ihre Kosten und die Suche nach einer guten Sitzordnung.
 *
 * Eine Belegung ist ein Array über die Plätze (in der Reihenfolge von raumPlaetze):
 *   belegung[platzIndex] = Index des Schülers in `schueler`, oder -1 für frei.
 *
 * Bewertet wird nicht "richtig oder falsch", sondern wie teuer eine Belegung ist.
 * Jede Regel steuert Strafpunkte bei; harte Regeln wiegen so schwer, dass die Suche
 * sie praktisch nie verletzt, und werden zusätzlich gezählt, damit am Ende benannt
 * werden kann, welche Vorgabe nicht aufgeht.
 *
 * Schüler ohne Geschlechtsangabe bleiben aus allen geschlechtsbezogenen Mustern
 * heraus: Sie kosten nichts und werden frei verteilt, statt in eine der beiden
 * Gruppen gezwungen zu werden.
 */

const SITZPLAN_GEWICHT_HART = 1000;

/*
 * Stellt alles zusammen, was die Kostenfunktion in jedem Schritt braucht. Das lohnt
 * sich: Bei zehntausenden Versuchen darf nichts davon erneut berechnet werden.
 */
function sitzplanKontext(raum, schueler, regeln) {
  const geo = raumGeometrie(raum);
  const nachId = new Map(schueler.map((s, i) => [s.id, i]));

  // Paare (i < j) statt aller gerichteten Kanten – sonst zählt jede Nachbarschaft doppelt
  const nachbarPaare = [];
  geo.nebenan.forEach((liste, i) => liste.forEach((j) => { if (i < j) nachbarPaare.push([i, j]); }));

  const gruppe = (eintraege) => (eintraege || []).map((eintrag) => ({
    ...eintrag,
    indizes: eintrag.mitglieder.map((id) => nachId.get(id)).filter((i) => i !== undefined)
  })).filter((eintrag) => eintrag.indizes.length >= 2);

  return {
    raum,
    geo,
    schueler,
    nachId,
    nachbarPaare,
    regeln,
    zusammen: gruppe(regeln.zusammen),
    getrennt: gruppe(regeln.getrennt)
  };
}

// -------------------------------------------------------------------------
// Kosten
// -------------------------------------------------------------------------

/*
 * Liefert { gesamt, harteVerstoesse, detail }. `detail` zählt je Regelart die
 * Verstöße (nicht die Strafpunkte), getrennt nach harten und weichen: Unter „Zusammen-
 * sitzen“ können harte und weiche Vorgaben nebeneinander stehen, und der Bericht soll
 * eine weiche Vorgabe nicht als gescheiterte harte ausgeben.
 */
function sitzplanKosten(belegung, ctx) {
  const { geo, schueler, regeln } = ctx;
  const detail = {};
  ['muster', 'klassen', 'zusammen', 'getrennt', 'wunsch', 'allein']
    .forEach((art) => { detail[art] = { hart: 0, weich: 0 }; });
  let harteVerstoesse = 0;
  let gesamt = 0;

  const s = (platzIndex) => (belegung[platzIndex] >= 0 ? schueler[belegung[platzIndex]] : null);
  const g = (platzIndex) => (s(platzIndex) ? s(platzIndex).geschlecht : null);

  const buchen = (art, anzahl, hart) => {
    if (!anzahl) return;
    detail[art][hart ? 'hart' : 'weich'] += anzahl;
    gesamt += anzahl * (hart ? SITZPLAN_GEWICHT_HART : 1);
    if (hart) harteVerstoesse += anzahl;
  };

  /* ----- Geschlechtermuster ----- */
  if (regeln.muster !== 'keins') {
    let verstoesse = 0;

    if (regeln.muster === 'jm') {
      // Direkte Nachbarn sollen unterschiedlichen Geschlechts sein
      ctx.nachbarPaare.forEach(([i, j]) => {
        if (g(i) && g(j) && g(i) === g(j)) verstoesse += 1;
      });
    } else if (regeln.muster === 'jjmm') {
      /*
       * Zweierblöcke: Auf jeder Sitzbank bilden die Plätze 0+1, 2+3, … je ein Paar
       * gleichen Geschlechts, und aufeinanderfolgende Paare sind verschieden. An
       * einem 2er-Tisch bleibt davon "beide gleich" übrig – mehr gibt eine Bank aus
       * zwei Plätzen nicht her.
       */
      geo.baenke.forEach((bank) => {
        for (let k = 0; k + 1 < bank.length; k += 2) {
          if (g(bank[k]) && g(bank[k + 1]) && g(bank[k]) !== g(bank[k + 1])) verstoesse += 1;
        }
        for (let k = 0; k + 2 < bank.length; k += 2) {
          if (g(bank[k]) && g(bank[k + 2]) && g(bank[k]) === g(bank[k + 2])) verstoesse += 1;
        }
      });
    } else {
      // Tischweise: entweder ausgewogen oder bewusst gleichgeschlechtlich
      geo.tische.forEach((tisch) => {
        const m = tisch.filter((i) => g(i) === 'm').length;
        const w = tisch.filter((i) => g(i) === 'w').length;
        verstoesse += regeln.muster === 'tisch_gleich' ? Math.min(m, w) : Math.abs(m - w);
      });
    }

    buchen('muster', verstoesse, regeln.musterHart);
  }

  /* ----- Klassen mischen oder zusammenhalten ----- */
  if (regeln.klassen !== 'egal') {
    let verstoesse = 0;
    ctx.nachbarPaare.forEach(([i, j]) => {
      const a = s(i);
      const b = s(j);
      if (!a || !b || !a.klasse || !b.klasse) return;
      const gleich = a.klasse === b.klasse;
      if (regeln.klassen === 'mischen' ? gleich : !gleich) verstoesse += 1;
    });
    buchen('klassen', verstoesse, regeln.klassenHart);
  }

  /* ----- Schüler, die zusammensitzen sollen -----
   * Gezählt wird, wie viele Mitglieder *nicht* im größten zusammenhängenden Teil
   * der Gruppe sitzen. Bei einem Paar ist das 0 oder 1, bei einer Vierergruppe
   * wiegt ein einzelner Ausreißer weniger als eine gesprengte Gruppe. */
  ctx.zusammen.forEach((eintrag) => {
    const plaetze = eintrag.indizes.map((si) => belegung.indexOf(si));
    if (plaetze.some((p) => p < 0)) {
      buchen('zusammen', 1, eintrag.hart); // jemand aus der Gruppe sitzt gar nicht
      return;
    }
    const menge = new Set(plaetze);
    let groesster = 1;
    if (eintrag.modus === 'tisch') {
      const proTisch = new Map();
      plaetze.forEach((p) => {
        const tisch = geo.plaetze[p].tischId;
        proTisch.set(tisch, (proTisch.get(tisch) || 0) + 1);
      });
      groesster = Math.max(...proTisch.values());
    } else {
      geo.baenke.forEach((bank) => {
        let lauf = 0;
        bank.forEach((p) => {
          lauf = menge.has(p) ? lauf + 1 : 0;
          if (lauf > groesster) groesster = lauf;
        });
      });
    }
    buchen('zusammen', plaetze.length - groesster, eintrag.hart);
  });

  /* ----- Schüler, die auseinander sollen ----- */
  ctx.getrennt.forEach((eintrag) => {
    const plaetze = eintrag.indizes.map((si) => belegung.indexOf(si)).filter((p) => p >= 0);
    let verstoesse = 0;
    for (let a = 0; a < plaetze.length; a++) {
      for (let b = a + 1; b < plaetze.length; b++) {
        const i = plaetze[a];
        const j = plaetze[b];
        if (eintrag.modus === 'tisch') {
          if (geo.plaetze[i].tischId === geo.plaetze[j].tischId) verstoesse += 1;
        } else if (eintrag.modus === 'abstand') {
          if (raumAbstand(geo.plaetze[i], geo.plaetze[j]) < eintrag.abstand) verstoesse += 1;
        } else if (geo.nebenan[i].includes(j)) {
          verstoesse += 1;
        }
      }
    }
    buchen('getrennt', verstoesse, eintrag.hart);
  });

  /* ----- Sitzwünsche einzelner Schüler ----- */
  let wunsch = 0;
  let allein = 0;
  belegung.forEach((si, p) => {
    if (si < 0) return;
    const person = schueler[si];
    const platz = geo.plaetze[p];
    if (person.platzwunsch === 'vorne') {
      // Gestaffelt statt alles-oder-nichts: So findet die Suche den Weg nach vorne,
      // auch wenn der vorderste Bereich gerade voll ist.
      wunsch += Math.max(0, platz.y - (regeln.vordereReihen - 1));
    } else if (person.platzwunsch === 'nicht_hinten' && platz.y === geo.letzteReihe) {
      wunsch += 1;
    }
    if (person.allein) {
      allein += geo.nebenan[p].filter((n) => belegung[n] >= 0).length;
    }
  });
  buchen('wunsch', wunsch, regeln.wuenscheHart);
  buchen('allein', allein, regeln.wuenscheHart);

  return { gesamt, harteVerstoesse, detail };
}

// -------------------------------------------------------------------------
// Ausgangsbelegung
// -------------------------------------------------------------------------

function sitzplanMischen(liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

/*
 * Erste Belegung. Sie ist zugleich das Ergebnis, wenn keine Regel gesetzt ist – die
 * Suche verwirft nur Belegungen, die *teurer* sind, und lässt eine kostenfreie
 * Ordnung deshalb unangetastet (siehe sitzplanOptimieren).
 *
 * Feste Plätze werden vorab gesetzt und von der Suche ausgenommen.
 */
function sitzplanStartbelegung(ctx, art) {
  const { geo, schueler } = ctx;
  const belegung = new Array(geo.plaetze.length).fill(-1);
  const vergeben = new Set();

  schueler.forEach((person, si) => {
    if (!person.festerPlatz) return;
    const p = geo.plaetze.findIndex((platz) => platz.id === person.festerPlatz);
    if (p >= 0 && belegung[p] < 0) {
      belegung[p] = si;
      vergeben.add(si);
    }
  });

  const uebrig = schueler.map((_, si) => si).filter((si) => !vergeben.has(si));
  const nameVon = (si) => `${schueler[si].nachname} ${schueler[si].vorname}`;
  if (art === 'alphabetisch') {
    uebrig.sort((a, b) => nameVon(a).localeCompare(nameVon(b), 'de'));
  } else if (art === 'klassenweise') {
    uebrig.sort((a, b) => (schueler[a].klasse || '').localeCompare(schueler[b].klasse || '', 'de')
      || nameVon(a).localeCompare(nameVon(b), 'de'));
  } else {
    sitzplanMischen(uebrig);
  }

  let n = 0;
  for (let p = 0; p < belegung.length && n < uebrig.length; p++) {
    if (belegung[p] < 0) belegung[p] = uebrig[n++];
  }
  return belegung;
}

// -------------------------------------------------------------------------
// Suche
// -------------------------------------------------------------------------

/*
 * Simuliertes Abkühlen mit Platztausch.
 *
 * Eine Besonderheit gegenüber dem Lehrbuch: Ein Tausch, der genau nichts ändert
 * (Δ = 0), wird *nicht* übernommen. Sonst würde eine Belegung ohne gesetzte Regeln –
 * alle Kosten 0 – schlicht durchgewürfelt und eine bewusst alphabetische
 * Ausgangsordnung ginge verloren.
 *
 * Läuft in Zeitscheiben über setTimeout, damit die Oberfläche bedienbar bleibt.
 *
 *   optionen.schritte      Anzahl Versuche insgesamt
 *   optionen.aufFortschritt(anteil, kosten)
 *   optionen.aufFertig(belegung, kosten)
 *   Rückgabe: { abbrechen() }
 */
function sitzplanOptimieren(ctx, startbelegung, optionen = {}) {
  const { geo, schueler } = ctx;
  const beweglich = geo.plaetze
    .map((platz, p) => p)
    .filter((p) => {
      const si = startbelegung[p];
      return si < 0 || !schueler[si].festerPlatz;
    });

  let aktuell = startbelegung.slice();
  let aktuellKosten = sitzplanKosten(aktuell, ctx);
  let beste = aktuell.slice();
  let besteKosten = aktuellKosten;

  const schritte = optionen.schritte || Math.max(20000, geo.plaetze.length * 1500);
  const starttemperatur = Math.max(2, besteKosten.gesamt / 20);
  let getan = 0;
  let abgebrochen = false;

  // Zu wenige bewegliche Plätze: nichts zu suchen
  if (beweglich.length < 2) {
    setTimeout(() => optionen.aufFertig?.(beste, besteKosten), 0);
    return { abbrechen() {} };
  }

  // Abbrechen heißt "hier aufhören", nicht "wegwerfen": Das bis dahin Beste wird
  // übergeben, sonst wäre die Wartezeit umsonst gewesen.
  const abbrechen = () => {
    if (abgebrochen) return;
    abgebrochen = true;
    optionen.aufFertig?.(beste, besteKosten);
  };

  function scheibe() {
    if (abgebrochen) return;
    const bis = Math.min(getan + 4000, schritte);
    while (getan < bis) {
      getan += 1;
      const a = beweglich[Math.floor(Math.random() * beweglich.length)];
      const b = beweglich[Math.floor(Math.random() * beweglich.length)];
      if (a === b || (aktuell[a] < 0 && aktuell[b] < 0)) continue;

      [aktuell[a], aktuell[b]] = [aktuell[b], aktuell[a]];
      const kosten = sitzplanKosten(aktuell, ctx);
      const delta = kosten.gesamt - aktuellKosten.gesamt;
      // Temperatur läuft linear auf 0 zu; Δ = 0 wird bewusst abgelehnt (siehe oben)
      const temperatur = starttemperatur * (1 - getan / schritte);
      const annehmen = delta < 0
        || (delta > 0 && temperatur > 0 && Math.random() < Math.exp(-delta / temperatur));

      if (annehmen) {
        aktuellKosten = kosten;
        if (kosten.gesamt < besteKosten.gesamt) {
          beste = aktuell.slice();
          besteKosten = kosten;
        }
      } else {
        [aktuell[a], aktuell[b]] = [aktuell[b], aktuell[a]];
      }
    }

    optionen.aufFortschritt?.(getan / schritte, besteKosten);
    if (getan >= schritte || besteKosten.gesamt === 0) {
      optionen.aufFertig?.(beste, besteKosten);
    } else {
      setTimeout(scheibe, 0);
    }
  }

  setTimeout(scheibe, 0);
  return { abbrechen };
}

// -------------------------------------------------------------------------
// Bericht
// -------------------------------------------------------------------------

const SITZPLAN_REGELNAMEN = {
  muster: 'Geschlechtermuster',
  klassen: 'Klassen mischen bzw. zusammenhalten',
  zusammen: 'Schüler, die zusammensitzen sollen',
  getrennt: 'Schüler, die auseinander sollen',
  wunsch: 'Sitzwünsche (vorne / nicht hinten)',
  allein: 'Schüler, die allein sitzen sollen'
};

/*
 * Klartext zu einer fertigen Belegung: je Regelart eine Zeile mit der Zahl der
 * Verstöße. Dazu die Plätze, die an einem Verstoß beteiligt sind – sie werden im
 * Plan hervorgehoben, damit man sieht, wo es hakt, statt es zu suchen.
 */
function sitzplanBericht(belegung, ctx) {
  const kosten = sitzplanKosten(belegung, ctx);
  const zeilenVon = (haerte) => Object.entries(kosten.detail)
    .filter(([, zahlen]) => zahlen[haerte] > 0)
    .map(([art, zahlen]) => `${SITZPLAN_REGELNAMEN[art]}: ${zahlen[haerte]}× nicht erfüllt`);
  const zeilenHart = zeilenVon('hart');
  const zeilenWeich = zeilenVon('weich');

  const markiert = new Set();
  const { geo, schueler, regeln } = ctx;
  const g = (p) => (belegung[p] >= 0 ? schueler[belegung[p]].geschlecht : null);

  if (regeln.muster === 'jm') {
    ctx.nachbarPaare.forEach(([i, j]) => {
      if (g(i) && g(j) && g(i) === g(j)) { markiert.add(i); markiert.add(j); }
    });
  }
  if (regeln.klassen !== 'egal') {
    ctx.nachbarPaare.forEach(([i, j]) => {
      const a = belegung[i] >= 0 ? schueler[belegung[i]] : null;
      const b = belegung[j] >= 0 ? schueler[belegung[j]] : null;
      if (!a || !b || !a.klasse || !b.klasse) return;
      const gleich = a.klasse === b.klasse;
      if (regeln.klassen === 'mischen' ? gleich : !gleich) { markiert.add(i); markiert.add(j); }
    });
  }
  ctx.getrennt.forEach((eintrag) => {
    const plaetze = eintrag.indizes.map((si) => belegung.indexOf(si)).filter((p) => p >= 0);
    for (let a = 0; a < plaetze.length; a++) {
      for (let b = a + 1; b < plaetze.length; b++) {
        const i = plaetze[a];
        const j = plaetze[b];
        const verletzt = eintrag.modus === 'tisch'
          ? geo.plaetze[i].tischId === geo.plaetze[j].tischId
          : eintrag.modus === 'abstand'
            ? raumAbstand(geo.plaetze[i], geo.plaetze[j]) < eintrag.abstand
            : geo.nebenan[i].includes(j);
        if (verletzt) { markiert.add(i); markiert.add(j); }
      }
    }
  });
  ctx.zusammen.forEach((eintrag) => {
    const plaetze = eintrag.indizes.map((si) => belegung.indexOf(si));
    if (plaetze.some((p) => p < 0)) return;
    const menge = new Set(plaetze);
    let groesster = 1;
    geo.baenke.forEach((bank) => {
      let lauf = 0;
      bank.forEach((p) => { lauf = menge.has(p) ? lauf + 1 : 0; if (lauf > groesster) groesster = lauf; });
    });
    if (eintrag.modus === 'tisch') {
      const proTisch = new Map();
      plaetze.forEach((p) => {
        const tisch = geo.plaetze[p].tischId;
        proTisch.set(tisch, (proTisch.get(tisch) || 0) + 1);
      });
      groesster = Math.max(...proTisch.values());
    }
    if (groesster < plaetze.length) plaetze.forEach((p) => markiert.add(p));
  });
  belegung.forEach((si, p) => {
    if (si < 0) return;
    const person = schueler[si];
    const platz = geo.plaetze[p];
    if (person.platzwunsch === 'vorne' && platz.y > regeln.vordereReihen - 1) markiert.add(p);
    if (person.platzwunsch === 'nicht_hinten' && platz.y === geo.letzteReihe) markiert.add(p);
    if (person.allein && geo.nebenan[p].some((n) => belegung[n] >= 0)) markiert.add(p);
  });

  return { kosten, zeilenHart, zeilenWeich, markiert };
}
