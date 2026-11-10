import { host, isHosted } from './host.js';
import { render } from './render.js';
import { createEditor } from './editor.js';
import { CHEATS } from './cheats.js';
import { WELCOME } from './welcome.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const viewer = $('#viewer');
const viewerWrap = $('#viewer-wrap');

// ---------------------------------------------------------------- preferences
const PREF_KEY = 'slithymdview.prefs';
const prefs = Object.assign({ split: true, cheats: false, reveal: false, theme: 'auto' },
  (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } })());
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

// ---------------------------------------------------------------- state
const state = {
  path: null, name: null, docBase: null,
  original: '', dirty: false, mode: 'view', welcome: false,
  pendingSave: null,
};

const editor = createEditor($('#editor'), {
  onChange() {
    updateDirty();
    schedulePreview();
    updateStats();
    scheduleDraft();
  },
  onCursor(ln, col) { $('#st-pos').textContent = `Ln ${ln}, Col ${col}`; },
  onScroll() { if (state.mode === 'edit' && prefs.split) syncPreviewToEditor(); },
});

// iPhone/browser: keep unsaved edits in a draft (the Windows host ignores these messages).
let draftTimer = 0;
function sendDraft() { clearTimeout(draftTimer); host.send('changed', { content: editor.getDoc(), dirty: state.dirty }); }
function scheduleDraft() {
  if (isHosted) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(sendDraft, 600);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !isHosted && draftTimer) sendDraft(); });

// ---------------------------------------------------------------- rendering
function renderViewer() {
  viewer.innerHTML = render(editor.getDoc(), { reveal: prefs.reveal, docBase: state.docBase });
}

let previewTimer = 0;
function schedulePreview() {
  if (state.mode !== 'edit' || !prefs.split) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { renderViewer(); syncPreviewToEditor(); }, 120);
}

// Map between source lines and rendered blocks via data-line attributes.
function blocks() {
  return [...viewer.querySelectorAll('[data-line]')]
    .map((el) => ({ el, line: +el.dataset.line }))
    .filter((b) => !Number.isNaN(b.line));
}
function viewerTopLine() {
  const top = viewerWrap.getBoundingClientRect().top;
  for (const b of blocks()) {
    if (b.el.getBoundingClientRect().bottom > top + 4) return b.line;
  }
  return 0;
}
function scrollViewerToLine(line, smooth = false) {
  const bs = blocks();
  let bi = -1;
  for (let i = 0; i < bs.length; i++) if (bs[i].line <= line) bi = i;
  if (bi < 0) { viewerWrap.scrollTo({ top: 0 }); return; }
  const best = bs[bi];
  const next = bs.slice(bi + 1).find((b) => b.line > best.line);
  const wrapTop = viewerWrap.getBoundingClientRect().top;
  let y = best.el.getBoundingClientRect().top - wrapTop + viewerWrap.scrollTop;
  if (next && next.line > best.line) { // interpolate between the two blocks
    const y2 = next.el.getBoundingClientRect().top - wrapTop + viewerWrap.scrollTop;
    y += (y2 - y) * ((line - best.line) / (next.line - best.line));
  }
  viewerWrap.scrollTo({ top: Math.max(0, y - 12), behavior: smooth ? 'smooth' : 'auto' });
}
function syncPreviewToEditor() {
  requestAnimationFrame(() => scrollViewerToLine(editor.topLine()));
}

// ---------------------------------------------------------------- modes & toggles
function setMode(mode) {
  if (mode === state.mode) return;
  if (mode === 'edit') {
    const line = viewerTopLine();
    state.mode = 'edit';
    applyClasses();
    requestAnimationFrame(() => { editor.scrollToLine(line); editor.focus(); if (prefs.split) { renderViewer(); syncPreviewToEditor(); } });
  } else {
    const line = editor.topLine();
    state.mode = 'view';
    applyClasses();
    renderViewer();
    requestAnimationFrame(() => scrollViewerToLine(line));
  }
  updateStats();
}

function toggle(pref) {
  prefs[pref] = !prefs[pref];
  savePrefs();
  if (pref === 'reveal') {
    editor.setReveal(prefs.reveal);
    const line = state.mode === 'view' ? viewerTopLine() : null;
    renderViewer();
    if (line !== null) scrollViewerToLine(line);
  }
  if (pref === 'split' && state.mode === 'edit' && prefs.split) { renderViewer(); syncPreviewToEditor(); }
  applyClasses();
}

function applyClasses() {
  app.classList.toggle('mode-view', state.mode === 'view');
  app.classList.toggle('mode-edit', state.mode === 'edit');
  app.classList.toggle('split', prefs.split);
  app.classList.toggle('reveal', prefs.reveal);
  app.classList.toggle('cheats-open', prefs.cheats);
  app.classList.toggle('dirty', state.dirty);
  $('#btn-view').classList.toggle('active', state.mode === 'view');
  $('#btn-edit').classList.toggle('active', state.mode === 'edit');
  $('#btn-view').setAttribute('aria-pressed', state.mode === 'view');
  $('#btn-edit').setAttribute('aria-pressed', state.mode === 'edit');
  for (const [id, on] of [['#btn-split', prefs.split], ['#btn-reveal', prefs.reveal], ['#btn-cheats', prefs.cheats]]) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', on);
  }
  document.documentElement.dataset.theme = prefs.theme;
  const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && darkQuery.matches);
  if (dark !== lastDark) { lastDark = dark; host.send('theme', { dark }); }
  for (const b of document.querySelectorAll('[data-theme-choice]')) b.classList.toggle('on', b.dataset.themeChoice === prefs.theme);
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let lastDark = null;
darkQuery.addEventListener('change', () => applyClasses());

// ---------------------------------------------------------------- document lifecycle
function load(msg) {
  const keepView = msg.reload;
  const line = keepView ? (state.mode === 'view' ? viewerTopLine() : editor.topLine()) : 0;
  state.welcome = msg.content == null;
  state.path = msg.path || null;
  state.name = msg.name || (state.welcome ? null : 'Untitled.md');
  state.docBase = msg.docBase || null;
  state.original = state.welcome ? WELCOME : msg.content.replace(/\r\n?/g, '\n');
  if (keepView) editor.replaceAll(state.original); else editor.setDoc(state.original);
  state.dirty = false;
  if (!keepView) state.mode = 'view';
  applyClasses();
  renderViewer();
  updateHeader();
  updateStats();
  if (keepView) {
    if (state.mode === 'view') scrollViewerToLine(line); else editor.scrollToLine(line);
  } else viewerWrap.scrollTo({ top: 0 });
}

function updateDirty() {
  const d = editor.getDoc() !== state.original;
  if (d !== state.dirty) {
    state.dirty = d;
    app.classList.toggle('dirty', d);
    host.send('dirty', { dirty: d });
    updateHeader();
  }
}

function updateHeader() {
  const name = state.name || 'Welcome';
  $('#doc-name').textContent = name;
  $('#doc-name').title = state.path || '';
  $('#st-path').textContent = state.path || (state.welcome ? 'No file open' : 'Not saved yet');
  if (!isHosted) document.title = `${state.dirty ? '• ' : ''}${name} — SlithyMDView`;
}

function updateStats() {
  const text = editor.getDoc();
  const words = (text.match(/\S+/g) || []).length;
  $('#st-words').textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
  $('#st-mode').textContent = state.mode === 'edit' ? 'Editing' : 'Viewing';
}

function save(as = false) {
  const content = editor.getDoc();
  state.pendingSave = content;
  host.send(as || !state.path ? 'saveAs' : 'save', {
    content, path: state.path, suggestedName: state.name || 'Untitled.md',
  });
}

host.on((msg) => {
  switch (msg.type) {
    case 'load': load(msg); break;
    case 'saved':
      if (state.pendingSave !== null) state.original = state.pendingSave;
      state.pendingSave = null;
      state.path = msg.path; state.name = msg.name; state.welcome = false;
      if (msg.docBase) state.docBase = msg.docBase;
      updateDirty(); updateHeader(); flash('Saved');
      break;
    case 'saveFailed':
      state.pendingSave = null;
      flash(msg.message || 'Save failed', true);
      break;
    case 'requestSave': save(false); break;
    case 'setMode': setMode(msg.mode); break;
    case 'toast': flash(msg.message); break;
    case 'restore':   // unsaved edits from last time (iPhone/browser)
      editor.replaceAll(msg.content);
      updateDirty(); renderViewer(); updateStats();
      flash('Restored your unsaved changes');
      break;
    case 'version': $('#menu-version').textContent = msg.text; break;
    default:
  }
});

let flashTimer = 0;
function flash(text, isError = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), isError ? 4000 : 1400);
}

// ---------------------------------------------------------------- viewer interactions
viewer.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1));
    const el = document.getElementById(id) || viewer.querySelector(`[name="${CSS.escape(id)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  host.send('openLink', { href: a.href });
});

viewer.addEventListener('change', (e) => {
  const box = e.target;
  if (!box.classList || !box.classList.contains('task-list-item-checkbox')) return;
  const li = box.closest('li[data-line]');
  if (!li) return;
  const keep = viewerWrap.scrollTop;
  if (editor.toggleTask(+li.dataset.line)) {
    renderViewer();
    viewerWrap.scrollTop = keep;
  }
});

// ---------------------------------------------------------------- cheat sheet
function buildCheats() {
  const list = $('#cheat-list');
  let html = ''; let group = null;
  CHEATS.forEach((c, i) => {
    if (c.group !== group) { group = c.group; html += `<h3 class="cheat-group">${group}</h3>`; }
    const src = c.md.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    html += `<div class="cheat" data-i="${i}" data-search="${(c.title + ' ' + c.group + ' ' + c.md).toLowerCase().replace(/"/g, '')}">
      <div class="cheat-head"><span class="cheat-title">${c.title}</span>
        <button class="cheat-ins" data-i="${i}" title="Insert into the document at the cursor">Insert</button></div>
      <pre class="cheat-src">${src}</pre>
      <div class="cheat-out md">${render(c.md).replace(/<img[^>]*?alt="([^"]*)"[^>]*>/g, '<span class="cheat-img">🖼 $1</span>')}</div>
      ${c.note ? `<div class="cheat-note">${render(c.note).replace(/^<p[^>]*>|<\/p>\s*$/g, '')}</div>` : ''}
    </div>`;
  });
  list.innerHTML = html;
  for (const el of list.querySelectorAll('[id]')) el.removeAttribute('id');
  for (const el of list.querySelectorAll('input')) el.disabled = true;

}
$('#cheat-list').addEventListener('click', (e) => {
  const b = e.target.closest('.cheat-ins');
  if (b) {
    const c = CHEATS[+b.dataset.i];
    if (state.mode !== 'edit') setMode('edit');
    requestAnimationFrame(() => { editor.insertSnippet(c.insert || c.md); flash('Inserted'); });
    return;
  }
  if (e.target.closest('a')) e.preventDefault();
});
$('#cheat-filter').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  for (const el of document.querySelectorAll('.cheat')) el.hidden = q && !el.dataset.search.includes(q);
  for (const h of document.querySelectorAll('.cheat-group')) {
    let n = h.nextElementSibling; let any = false;
    while (n && !n.classList.contains('cheat-group')) { if (!n.hidden) any = true; n = n.nextElementSibling; }
    h.hidden = !any;
  }
});

// ---------------------------------------------------------------- toolbar
$('#btn-view').onclick = () => setMode('view');
$('#btn-edit').onclick = () => setMode('edit');
$('#btn-split').onclick = () => toggle('split');
$('#btn-reveal').onclick = () => toggle('reveal');
$('#btn-cheats').onclick = () => toggle('cheats');
$('#cheats-close').onclick = () => toggle('cheats');
$('#btn-open').onclick = () => host.send('open');
$('#btn-save').onclick = () => save(false);

for (const b of document.querySelectorAll('.fmtbar [data-cmd]')) {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor selection
  b.addEventListener('click', () => editor.commands[b.dataset.cmd](editor.view));
}

const menu = $('#menu');
$('#btn-more').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
menu.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.themeChoice) { prefs.theme = b.dataset.themeChoice; savePrefs(); applyClasses(); return; }
  menu.hidden = true;
  switch (b.dataset.action) {
    case 'saveAs': save(true); break;
    case 'print': if (state.mode === 'edit') renderViewer(); window.print(); break;
    case 'register': host.send('registerAssociation'); break;
    case 'reveal-file': host.send('showInFolder'); break;
    default:
  }
});
if (!isHosted) for (const el of document.querySelectorAll('.host-only')) el.hidden = true;

// ---------------------------------------------------------------- keyboard
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  let handled = true;
  if (mod && k === 's') save(e.shiftKey);
  else if (mod && !e.shiftKey && k === 'e') setMode(state.mode === 'view' ? 'edit' : 'view');
  else if (mod && k === 'o') host.send('open');
  else if (mod && e.shiftKey && k === 'm') toggle('reveal');
  else if (k === 'f1' || (mod && k === '/')) toggle('cheats');
  else if (mod && k === '\\') toggle('split');
  else if (k === 'f5' || (mod && k === 'r')) { /* no reloading the app */ }
  else if (k === 'escape' && !menu.hidden) menu.hidden = true;
  else if (k === 'escape' && prefs.cheats && !document.querySelector('.cm-panel.cm-search')) toggle('cheats');
  else handled = false;
  if (handled) { e.preventDefault(); e.stopPropagation(); }
}, true);

window.addEventListener('beforeprint', () => { if (state.mode === 'edit') renderViewer(); });

// ---------------------------------------------------------------- drag & drop files
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; app.classList.add('dragging'); } }, true);
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; app.classList.remove('dragging'); } }, true);
window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } }, true);
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); e.stopPropagation();
  dragDepth = 0; app.classList.remove('dragging');
  host.sendFiles('dropFiles', e.dataTransfer.files);
}, true);

// ---------------------------------------------------------------- go
// eslint-disable-next-line no-undef
$('#menu-version').textContent = typeof __VERSION__ === 'string' ? __VERSION__ : '';
buildCheats();
editor.setReveal(prefs.reveal);
applyClasses();
host.send('ready');
window.__slithymdview = { state, prefs, editor, setMode, toggle };
