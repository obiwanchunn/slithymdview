// Markdown -> HTML rendering, in two flavours:
//   render(src)            normal, fully formatted output
//   render(src, {reveal})  same output, but every piece of markup is shown
//                          inline as a coloured marker (like Word's ¶ button)
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

export function slugify(s) {
  return s.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function highlight(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { /* fall through */ }
  }
  return ''; // markdown-it escapes it for us
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function makeBase() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, highlight });
  md.use(taskLists, { enabled: true, label: false })
    .use(footnote)
    .use(anchor, { slugify, tabIndex: false });

  // Tag every block element with the source line it came from. This drives
  // scroll-sync between editor and preview and the clickable task checkboxes.
  md.core.ruler.push('data_line', (state) => {
    const off = state.env.lineOffset || 0;
    for (const t of state.tokens) {
      if (t.map && t.block && t.nesting >= 0 && t.type !== 'inline') {
        t.attrSet('data-line', String(t.map[0] + off));
      }
    }
  });
  return md;
}

// ---------------------------------------------------------------- reveal mode
function mk(text, cls = '') {
  return `<span class="mk${cls ? ' ' + cls : ''}">${esc(text)}</span>`;
}

function makeReveal() {
  const md = makeBase();
  md.core.ruler.disable('text_join'); // keep escapes/entities as separate tokens so we can show them
  const R = md.renderer.rules;
  const tok = (t, i, o, e, self) => self.renderToken(t, i, o);
  const wrapOpen = (t, i, o, e, self) => self.renderToken(t, i, o) + mk(t[i].markup);
  const wrapClose = (t, i, o, e, self) => mk(t[i].markup) + self.renderToken(t, i, o);

  R.heading_open = (t, i, o, e, self) => {
    const m = t[i].markup;
    return self.renderToken(t, i, o) + (m.startsWith('#') ? mk(m + ' ', 'mk-block') : '');
  };
  R.heading_close = (t, i, o, e, self) => {
    const m = t[i].markup;
    return (m === '=' || m === '-' ? ' ' + mk(m.repeat(3), 'mk-block') : '') + self.renderToken(t, i, o);
  };
  R.strong_open = wrapOpen; R.strong_close = wrapClose;
  R.em_open = wrapOpen; R.em_close = wrapClose;
  R.s_open = wrapOpen; R.s_close = wrapClose;

  R.code_inline = (t, i) => {
    const m = t[i].markup || '`';
    return mk(m) + `<code>${esc(t[i].content)}</code>` + mk(m);
  };

  const fence = R.fence;
  R.fence = (t, i, o, e, self) => {
    const f = t[i];
    return `<div class="mk-line">${mk(f.markup + f.info, 'mk-block')}</div>` +
      fence(t, i, o, e, self) +
      `<div class="mk-line">${mk(f.markup, 'mk-block')}</div>`;
  };
  const codeBlock = R.code_block;
  R.code_block = (t, i, o, e, self) =>
    `<div class="mk-line">${mk('(indented 4 spaces)', 'mk-block mk-note')}</div>` + codeBlock(t, i, o, e, self);

  R.blockquote_open = (t, i, o, e, self) => self.renderToken(t, i, o) + mk('>', 'mk-block mk-quote');

  R.list_item_open = (t, i, o, e, self) => {
    const it = t[i];
    const marker = it.info ? it.info + it.markup : it.markup; // "1." or "-"
    return self.renderToken(t, i, o) + mk(marker + ' ', 'mk-block');
  };

  R.hr = (t, i, o, e, self) => `<div class="mk-line" data-line="${t[i].attrGet('data-line') || ''}">${mk(t[i].markup, 'mk-block')}</div>` + self.renderToken(t, i, o);

  R.link_open = (t, i, o, e, self) => {
    const l = t[i];
    if (l.markup === 'linkify') return self.renderToken(t, i, o);
    if (l.markup === 'autolink') return mk('<') + self.renderToken(t, i, o);
    e.__links = e.__links || [];
    e.__links.push(l.attrGet('href') + (l.attrGet('title') ? ` "${l.attrGet('title')}"` : ''));
    return mk('[') + self.renderToken(t, i, o);
  };
  R.link_close = (t, i, o, e, self) => {
    const l = t[i];
    if (l.markup === 'linkify') return self.renderToken(t, i, o);
    if (l.markup === 'autolink') return self.renderToken(t, i, o) + mk('>');
    const href = (e.__links || []).pop() || '';
    return self.renderToken(t, i, o) + mk('](' + href + ')', 'mk-url');
  };

  const image = R.image;
  R.image = (t, i, o, e, self) => {
    const im = t[i];
    const alt = self.renderInlineAsText(im.children || [], o, e);
    return mk(`![${alt}](${im.attrGet('src')})`, 'mk-url') + image(t, i, o, e, self);
  };

  R.softbreak = () => mk('↵', 'mk-ws') + '\n';
  R.hardbreak = () => mk('⏎', 'mk-ws mk-hard') + '<br>\n';
  R.paragraph_close = (t, i, o, e, self) =>
    (t[i].hidden ? '' : mk('¶', 'mk-ws')) + self.renderToken(t, i, o);

  R.th_open = (t, i, o, e, self) => self.renderToken(t, i, o) + mk('|');
  R.td_open = (t, i, o, e, self) => self.renderToken(t, i, o) + mk('|');

  R.text_special = (t, i) => {
    const s = t[i];
    if (s.info === 'escape') return mk('\\', 'mk-esc') + esc(s.content);
    if (s.info === 'entity') return mk(s.markup, 'mk-esc');
    return esc(s.content);
  };

  R.html_inline = (t, i) => {
    const c = t[i].content;
    // checkbox + label tokens injected by the task-list plugin
    if (c.startsWith('<input class="task-list-item-checkbox"')) {
      return mk(/checked/.test(c) ? '[x]' : '[ ]') + ' ' + c;
    }
    return mk(c, 'mk-html');
  };
  R.html_block = (t, i) =>
    `<div class="mk-htmlblock" data-line="${t[i].map ? t[i].map[0] : ''}">${mk('HTML', 'mk-block mk-note')}<pre>${esc(t[i].content)}</pre></div>`;

  R.footnote_ref = (t, i, o, e, self) => mk(`[^${t[i].meta.label}]`);
  return md;
}

const mdNormal = makeBase();
const mdReveal = makeReveal();

// ---------------------------------------------------------------- front matter
function splitFrontMatter(src) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m || !/^[\w-]+\s*:/m.test(m[1])) return { fm: null, body: src, offset: 0 };
  return { fm: m[1], body: src.slice(m[0].length), offset: m[0].split('\n').length - 1 };
}

// ---------------------------------------------------------------- sanitizing
let currentBase = null;
const ABS = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  for (const attr of ['src', 'href']) {
    const v = node.getAttribute && node.getAttribute(attr);
    if (v && currentBase && !ABS.test(v)) {
      try { node.setAttribute(attr, new URL(v.replace(/\\/g, '/'), currentBase).href); } catch { /* keep */ }
    }
  }
});

/** Render markdown to sanitized HTML. */
export function render(src, { reveal = false, docBase = null } = {}) {
  const { fm, body, offset } = splitFrontMatter(src || '');
  const md = reveal ? mdReveal : mdNormal;
  let html = '';
  if (fm !== null) {
    html += `<div class="frontmatter" data-line="0">` +
      (reveal ? mk('---', 'mk-block') : '<div class="fm-label">Front matter</div>') +
      `<pre>${esc(fm)}</pre>` + (reveal ? mk('---', 'mk-block') : '') + `</div>`;
  }
  html += md.render(body, { lineOffset: offset });
  currentBase = docBase;
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['checked'], FORBID_TAGS: ['style'] });
  currentBase = null;
  return clean;
}
