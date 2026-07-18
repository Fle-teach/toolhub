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

// Umschalter (Button mit id="theme-toggle") verbinden, sobald das DOM bereit ist
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('toolhub-theme', next);
  });
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
