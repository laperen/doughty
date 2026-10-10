import { projectId, interactions } from './narrative-references.js';
import { DoughtyNarrativeRuntime, NarrativeCatalog } from './narrative-catalog.js';

const storageKey = 'doughty-narrative-language';
const attributes = ['title', 'aria-label', 'placeholder', 'alt', 'aria-valuetext'];
const excluded = 'script, style, textarea, [data-narrative-direct]';

async function readJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Narrative asset ${url}: HTTP ${response.status}`);
  return response.json();
}

export async function createNarrative({ commands = {}, document: doc = document } = {}) {
  const base = new URL('./narrative-assets/', import.meta.url);
  const [project, index] = await Promise.all([
    readJSON(new URL('project.json', base)),
    readJSON(new URL('localization/index.json', base)),
  ]);
  const runtime = new DoughtyNarrativeRuntime({ commands });
  runtime.loadProject(project);
  if (projectId !== runtime.project.id) throw new Error('Narrative references belong to a different project.');
  await runtime.loadLocalizationIndex(index, path => readJSON(new URL(path, base)));
  const catalog = new NarrativeCatalog(runtime);
  // The runtime validates entries and participants when a conversation starts.
  // An obsolete interaction must not disable unrelated NPCs at startup.
  let selectedLanguage = '';
  try { selectedLanguage = localStorage.getItem(storageKey) || ''; } catch {}
  if (!runtime.getLanguages().some(language => String(language.id) === selectedLanguage)) selectedLanguage = '';
  runtime.languageId = selectedLanguage || null;

  // Capture original text before localization; repeated language changes never
  // attempt to translate a previously translated string. Observe only text and
  // accessible labels, leaving game IDs, HTML, attributes and input values alone.
  const records = new WeakMap();
  const tracked = new Set();
  function update(node, attribute = null) {
    const element = node.nodeType === 3 ? node.parentElement : node;
    if (!element || element.closest(excluded)) return;
    const key = attribute || 'text';
    const value = attribute ? node.getAttribute(attribute) : node.nodeValue;
    if (value == null) return;
    let entries = records.get(node);
    if (!entries) { entries = new Map(); records.set(node, entries); }
    let record = entries.get(key);
    if (!record || value !== record.rendered) record = { source: value };
    const textId = !attribute && element.getAttribute('data-text-id');
    const rendered = textId && runtime.project.text[textId]
      ? catalog.text(textId) : catalog.translate(record.source);
    record.rendered = rendered;
    entries.set(key, record);
    tracked.add(node);
    if (rendered !== value) {
      if (attribute) node.setAttribute(attribute, rendered);
      else node.nodeValue = rendered;
    }
  }
  function scan(node) {
    if (node.nodeType === 3) { update(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.nodeType === 1) {
      if (node.matches(excluded)) return;
      for (const attribute of attributes) if (node.hasAttribute(attribute)) update(node, attribute);
    }
    for (const child of node.childNodes) scan(child);
  }
  const observer = new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === 'characterData') update(change.target);
      else if (change.type === 'attributes') update(change.target, change.attributeName);
      else for (const node of change.addedNodes) scan(node);
    }
    // HUDs rebuild text nodes frequently; don't retain detached nodes.
    for (const node of tracked) if (!node.isConnected) tracked.delete(node);
  });
  scan(doc.documentElement);
  observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  const label = doc.createElement('label');
  label.className = 'narrative-language';
  label.dataset.narrativeDirect = '';
  const labelText = doc.createTextNode(catalog.translate('Language') + ' ');
  label.append(labelText);
  const select = doc.createElement('select');
  select.id = 'narrativeLanguage';
  select.setAttribute('aria-label', catalog.translate('Language'));
  select.append(new Option(catalog.translate('English (source)'), ''));
  for (const language of runtime.getLanguages()) select.append(new Option(language.name, String(language.id)));
  select.value = selectedLanguage;
  label.append(select);
  doc.querySelector('#homeLanguageSelection')?.append(label);
  if (!label.isConnected) doc.querySelector('#settingsMenu')?.append(label);
  const settingsLabel = label.cloneNode(true);
  settingsLabel.id = 'settingsLanguageSelection';
  settingsLabel.hidden = true;
  const settingsSelect = settingsLabel.querySelector('select');
  settingsSelect.id = 'settingsNarrativeLanguage';
  doc.querySelector('#settingsMenu [role="tablist"]')?.before(settingsLabel);

  const listeners = new Set();
  function setLanguage(id = '') {
    const language = runtime.getLanguages().find(entry => String(entry.id) === String(id));
    if (id && !language) throw new Error(`Unknown language ${id}`);
    runtime.languageId = language?.id ?? null;
    select.value = String(id);
    catalog.clearCache();
    labelText.nodeValue = catalog.translate('Language') + ' ';
    select.setAttribute('aria-label', catalog.translate('Language'));
    select.options[0].textContent = catalog.translate('English (source)');
    settingsSelect.value = String(id);
    settingsLabel.firstChild.nodeValue = catalog.translate('Language') + ' ';
    settingsSelect.setAttribute('aria-label', catalog.translate('Language'));
    settingsSelect.options[0].textContent = catalog.translate('English (source)');
    try { localStorage.setItem(storageKey, String(id)); } catch {}
    doc.documentElement.lang = language?.code || language?.locale || (id ? 'und' : 'en');
    for (const node of tracked) {
      if (!node.isConnected) { tracked.delete(node); continue; }
      for (const key of records.get(node).keys()) update(node, key === 'text' ? null : key);
    }
    for (const listener of listeners) listener();
  }
  select.addEventListener('change', () => setLanguage(select.value));
  settingsSelect.addEventListener('change', () => setLanguage(settingsSelect.value));
  setLanguage(selectedLanguage);
  return {
    runtime, interactions, catalog, setLanguage,
    translate: text => catalog.translate(text),
    text: (id, overrides) => catalog.text(id, overrides),
    onLanguageChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { observer.disconnect(); tracked.clear(); label.remove(); settingsLabel.remove(); listeners.clear(); },
  };
}
