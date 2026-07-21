/*
 * toolhub-kurse.js – gemeinsame Bausteine rund um Fachkürzel und Kursbezeichnungen.
 *
 * Einbindung (Tool-Seiten, zwei Ebenen unter dem Root):
 *   <script src="../../assets/toolhub-kurse.js" defer></script>
 *
 * Enthält:
 *   toolhubParseFachkuerzelCsv(text)     Zuordnungstabelle aus fachkuerzel.csv aufbauen
 *   toolhubNormalisiereFach(fach, map)   einzelne Fach-Phrase vereinheitlichen
 *   toolhubLadeFachkuerzel(url)          fachkuerzel.csv laden (einmal je Seite, gecacht)
 *   toolhubPadJahrgang(zahl)             Jahrgang zweistellig ("8" -> "08")
 *
 * Der Aufbau der vollständigen Kursbezeichnung bleibt bei den Tools: die Quelldaten
 * (Untis-Export bzw. DiViS-Kursliste) sind zu verschieden, um sinnvoll zusammenzufallen.
 * Gemeinsam ist die Konvention des Ergebnisses:
 *   <Klasse/Jahrgang> <Fachkürzel> <Lehrerkürzel (alphabetisch)>
 */

const TOOLHUB_FACHKUERZEL_URL = '../../assets/fachkuerzel.csv';

/*
 * Erwartetes Format: "Fach;Normalisiertes Kürzel;Zu Ersetzen[;weitere Varianten...]"
 * Es wird gegen alle Spalten (Fachname, Kürzel, Varianten) case-insensitiv gematcht.
 */
function toolhubParseFachkuerzelCsv(text) {
  const map = new Map();
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/); // BOM entfernen
  lines.slice(1).forEach((line) => {
    if (!line.trim()) return;
    const fields = line.split(';').map((f) => f.trim());
    const normalized = fields[1];
    if (!normalized) return;
    fields.forEach((key) => {
      if (!key) return;
      map.set(key.toLowerCase().replace(/\s+/g, ' '), normalized);
    });
  });
  return map;
}

/*
 * Normalisiert eine Fach-Phrase.
 *
 * Entscheidend: Die gesamte Phrase wird als Ganzes geprüft, nicht ihre Einzelwörter –
 * sonst würden Bestandteile eines unbekannten mehrteiligen Kürzels einzeln ersetzt
 * (z. B. "muPr Orchester" fälschlich zu "muPr Orch").
 * - Ist die komplette Phrase bekannt (case-insensitiv, auch mehrwortig wie "E cam"
 *   oder "Big Band"), wird sie durch das normalisierte Kürzel ersetzt.
 * - Sonst gilt sie als EIN unbekanntes Kürzel: mehrteilige werden mit Unterstrich
 *   verbunden ("muPr Band" -> "muPr_Band", "RS Fö" -> "RS_Fö"), damit die Bestandteile
 *   der Kursbezeichnung durch Leerzeichen eindeutig getrennt bleiben; einteilige
 *   bleiben unverändert.
 */
function toolhubNormalisiereFach(fach, fachMap) {
  if (fachMap && fachMap.size > 0) {
    const key = String(fach).toLowerCase().replace(/\s+/g, ' ');
    const normalized = fachMap.get(key);
    if (normalized) return normalized;
  }
  return String(fach).replace(/\s+/g, '_');
}

// Jahrgang zweistellig, damit Kursnamen sich sortieren lassen ("8" -> "08")
function toolhubPadJahrgang(jahrgang) {
  return String(jahrgang).padStart(2, '0');
}

/*
 * Lädt die Fachkürzel-Tabelle aus assets/. Das Ergebnis wird gecacht, damit mehrere
 * Aufrufer sich eine Anfrage teilen.
 *
 * Wirft, wenn die Datei nicht erreichbar ist (typisch beim Öffnen über file://).
 * Die Tools fangen das ab und arbeiten dann ohne Normalisierung weiter bzw. bieten
 * die Datei zur manuellen Auswahl an – der Umweg über einen lokalen Server ist der
 * eigentliche Fix (siehe CLAUDE.md, "Lokal testen").
 */
let toolhubFachkuerzelPromise = null;

function toolhubLadeFachkuerzel(url = TOOLHUB_FACHKUERZEL_URL) {
  if (!toolhubFachkuerzelPromise) {
    toolhubFachkuerzelPromise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(toolhubParseFachkuerzelCsv)
      .catch((error) => {
        toolhubFachkuerzelPromise = null; // erneuter Versuch bleibt möglich
        throw new Error(`fachkuerzel.csv konnte nicht geladen werden: ${error.message}`);
      });
  }
  return toolhubFachkuerzelPromise;
}

// Export für Tests unter Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toolhubParseFachkuerzelCsv,
    toolhubNormalisiereFach,
    toolhubPadJahrgang,
    toolhubLadeFachkuerzel,
  };
}
