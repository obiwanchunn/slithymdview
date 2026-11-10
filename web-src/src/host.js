// Bridge between the page and whatever is hosting it.
//  • Windows: the SlithyMDView.exe shell (WebView2) owns files, dialogs and the window.
//  • iPhone / any browser: this file plays the host itself — Open picks a file, Save hands a
//    copy to the share sheet (or downloads it), and unsaved edits are kept in a draft so
//    nothing is lost if iOS closes the app in the background.
const wv = window.chrome && window.chrome.webview;
const listeners = [];

export const isHosted = !!wv;

export const host = {
  send(type, data = {}) {
    const msg = { type, ...data };
    if (wv) wv.postMessage(msg); else browserHost(msg);
  },
  sendFiles(type, files) {
    if (wv && wv.postMessageWithAdditionalObjects) wv.postMessageWithAdditionalObjects({ type }, files);
    else if (files && files.length) openFile(files[0]);
  },
  on(fn) { listeners.push(fn); },
};

if (wv) wv.addEventListener('message', (e) => listeners.forEach((f) => f(e.data)));

const emit = (m) => setTimeout(() => listeners.forEach((f) => f(m)), 0);

// ------------------------------------------------------------------ browser / iPhone host
const DRAFT_KEY = 'slithymdview.draft';
let current = { name: null, original: '' };
let isDirty = false;

function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; } }
function writeDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }

function loadDoc(name, content, extra = {}) {
  current = { name, original: content };
  emit({ type: 'load', path: name, name, content, docBase: null, ...extra });
}

let picker = null;
function pickFile() {
  if (!picker) {
    picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown,text/plain';
    picker.style.display = 'none';
    picker.addEventListener('change', () => {
      const f = picker.files && picker.files[0];
      picker.value = '';
      if (f) openFile(f);
    });
    document.body.appendChild(picker);
  }
  picker.click();
}

async function openFile(file) {
  try {
    const text = await file.text();
    // asked here, after the file is picked: iOS only opens the picker straight from a tap
    if (isDirty && !window.confirm(`Open ${file.name}? Your unsaved changes to ${current.name || 'this document'} will be lost.`)) return;
    clearDraft();
    isDirty = false;
    loadDoc(file.name, text);
  } catch (e) {
    emit({ type: 'toast', message: `Couldn’t open ${file.name}` });
  }
}

async function saveCopy(content, name) {
  const file = new File([content], name, { type: 'text/markdown' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
    current = { name, original: content };
    clearDraft();
    emit({ type: 'saved', path: name, name });
  } catch (e) {
    emit({ type: 'saveFailed', message: e && e.name === 'AbortError' ? 'Not saved' : 'Couldn’t save' });
  }
}

function browserHost(msg) {
  switch (msg.type) {
    case 'ready': {
      // ?file=… lets a test page load a sample document.
      const file = new URLSearchParams(location.search).get('file');
      if (file) {
        fetch(file).then((r) => r.text()).then((t) => loadDoc(file.split('/').pop(), t));
        break;
      }
      const d = readDraft();
      if (d && typeof d.content === 'string') {
        loadDoc(d.name, d.original ?? '');
        emit({ type: 'restore', content: d.content });
      } else emit({ type: 'load', path: null, name: null, content: null });
      break;
    }
    case 'open': pickFile(); break;
    case 'save':
      saveCopy(msg.content, msg.suggestedName || current.name || 'Untitled.md');
      break;
    case 'saveAs': {
      let name = window.prompt('Save a copy as', msg.suggestedName || current.name || 'Untitled.md');
      if (!name) { emit({ type: 'saveFailed', message: 'Not saved' }); break; }
      if (!/\.[a-z0-9]+$/i.test(name)) name += '.md';
      saveCopy(msg.content, name);
      break;
    }
    case 'changed':   // keep unsaved edits across app restarts
      if (msg.dirty) writeDraft({ name: current.name || 'Untitled.md', original: current.original, content: msg.content });
      else clearDraft();
      break;
    case 'dirty': isDirty = !!msg.dirty; break;
    case 'openLink': window.open(msg.href, '_blank', 'noopener'); break;
    case 'theme': {
      const m = document.querySelector('meta[name="theme-color"]');
      if (m) m.content = msg.dark ? '#15171b' : '#f7f6f3';
      break;
    }
    default:
  }
}
