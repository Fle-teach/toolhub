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
