// CodeMirror 6 editor: raw markdown with the markup styled in place.
import { EditorState, EditorSelection, Compartment } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, highlightSpecialChars, highlightWhitespace, ViewPlugin, Decoration,
  WidgetType, dropCursor, rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  syntaxHighlighting, HighlightStyle, syntaxTree, LanguageDescription, indentOnInput,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { cpp } from '@codemirror/lang-cpp';

const codeLanguages = [
  LanguageDescription.of({ name: 'javascript', alias: ['js', 'jsx', 'ts', 'typescript', 'tsx', 'node'], support: javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'python', alias: ['py'], support: python() }),
  LanguageDescription.of({ name: 'json', alias: ['jsonc'], support: json() }),
  LanguageDescription.of({ name: 'html', alias: ['xml', 'svg'], support: html() }),
  LanguageDescription.of({ name: 'css', support: css() }),
  LanguageDescription.of({ name: 'cpp', alias: ['c', 'c++', 'h', 'hpp', 'cs', 'csharp', 'java'], support: cpp() }),
];

// Colours live in CSS (classes), so light/dark theming is pure CSS.
const mdHighlight = HighlightStyle.define([
  { tag: t.heading, class: 'tk-heading' },
  { tag: t.strong, class: 'tk-strong' },
  { tag: t.emphasis, class: 'tk-em' },
  { tag: t.strikethrough, class: 'tk-strike' },
  { tag: t.link, class: 'tk-link' },
  { tag: t.url, class: 'tk-url' },
  { tag: t.monospace, class: 'tk-code' },
  { tag: t.quote, class: 'tk-quote' },
  { tag: t.processingInstruction, class: 'tk-mark' },
  { tag: t.contentSeparator, class: 'tk-mark' },
  { tag: t.labelName, class: 'tk-url' },
  { tag: t.special(t.string), class: 'tk-esc' }, // escapes / entities
  { tag: t.comment, class: 'tk-comment' },
  { tag: t.angleBracket, class: 'tk-html' },
  { tag: t.tagName, class: 'tk-html' },
  { tag: t.attributeName, class: 'tk-html' },
  // fenced-code languages
  { tag: [t.keyword, t.operatorKeyword, t.modifier], class: 'hl-keyword' },
  { tag: [t.string, t.regexp], class: 'hl-string' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'hl-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'hl-fn' },
  { tag: [t.typeName, t.className], class: 'hl-type' },
  { tag: [t.lineComment, t.blockComment], class: 'hl-comment' },
  { tag: t.propertyName, class: 'hl-prop' },
]);

// Line-level classes: big headings, shaded code blocks, quote bar, rules.
function lineDecos(view) {
  const decos = [];
  const doc = view.state.doc;
  const tree = syntaxTree(view.state);
  const addLines = (from, to, cls) => {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos);
      decos.push(Decoration.line({ class: cls }).range(line.from));
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  };
  // YAML front matter at the very top: shown plain and muted, not as markdown.
  const head = doc.sliceString(0, 6000);
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(head);
  const fmEnd = fm && /^[\w-]+\s*:/m.test(fm[1]) ? fm[0].replace(/\r?\n$/, '').length : 0;
  if (fmEnd) {
    addLines(0, fmEnd, 'cm-fmline');
    decos.push(Decoration.mark({ class: 'cm-frontmatter' }).range(0, fmEnd));
  }
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter(node) {
        if (node.from < fmEnd) return node.to > fmEnd; // skip nodes inside front matter
        const n = node.name;
        let m;
        if ((m = /^ATXHeading(\d)$/.exec(n))) addLines(node.from, node.from, 'cm-h' + m[1]);
        else if ((m = /^SetextHeading(\d)$/.exec(n))) addLines(node.from, node.to, 'cm-h' + m[1]);
        else if (n === 'FencedCode' || n === 'CodeBlock') {
          addLines(node.from, node.to, 'cm-codeline');
          if (n === 'FencedCode') {
            decos.push(Decoration.line({ class: 'cm-codeline-first' }).range(doc.lineAt(node.from).from));
            decos.push(Decoration.line({ class: 'cm-codeline-last' }).range(doc.lineAt(node.to).from));
          }
        } else if (n === 'Blockquote') addLines(node.from, node.to, 'cm-quoteline');
        else if (n === 'HorizontalRule') addLines(node.from, node.from, 'cm-hrline');
        else if (n === 'Table') addLines(node.from, node.to, 'cm-tableline');
      },
    });
  }
  return Decoration.set(decos, true);
}

const lineClasses = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = lineDecos(view); }
  update(u) {
    if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
      this.decorations = lineDecos(u.view);
    }
  }
}, { decorations: (v) => v.decorations });

// "Show markup": a pilcrow at the end of every line.
class Pilcrow extends WidgetType {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-pilcrow'; s.textContent = '¶'; return s; }
  eq() { return true; }
  ignoreEvent() { return true; }
}
const pilcrows = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view) {
    const out = [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        out.push(Decoration.widget({ widget: new Pilcrow(), side: 1 }).range(line.to));
        pos = line.to + 1;
      }
    }
    return Decoration.set(out, true);
  }
}, { decorations: (v) => v.decorations });

// ---------------------------------------------------------------- formatting commands
function wrap(view, before, after = before, placeholder = 'text') {
  const { state } = view;
  const tr = state.changeByRange((r) => {
    const pre = state.sliceDoc(r.from - before.length, r.from);
    const post = state.sliceDoc(r.to, r.to + after.length);
    if (pre === before && post === after) { // toggle off
      return {
        changes: [{ from: r.from - before.length, to: r.from }, { from: r.to, to: r.to + after.length }],
        range: EditorSelection.range(r.from - before.length, r.to - before.length),
      };
    }
    if (r.empty) {
      return {
        changes: { from: r.from, insert: before + placeholder + after },
        range: EditorSelection.range(r.from + before.length, r.from + before.length + placeholder.length),
      };
    }
    return {
      changes: [{ from: r.from, insert: before }, { from: r.to, insert: after }],
      range: EditorSelection.range(r.from + before.length, r.to + before.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
  view.focus();
  return true;
}

function selectedLines(state) {
  const lines = new Map();
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to;) {
      const line = state.doc.lineAt(pos);
      lines.set(line.number, line);
      if (line.to >= r.to) break;
      pos = line.to + 1;
    }
  }
  return [...lines.values()];
}

// Toggle a prefix on every selected line. `make(i)` gives the prefix for line i,
// `match` recognises an existing prefix of this kind.
function prefixLines(view, make, match) {
  const { state } = view;
  const lines = selectedLines(state);
  const all = lines.every((l) => match.test(l.text));
  const changes = lines.map((l, i) => {
    const indent = /^\s*/.exec(l.text)[0];
    if (all) {
      const m = match.exec(l.text);
      return { from: l.from + indent.length, to: l.from + m[0].length, insert: '' };
    }
    const existing = /^\s*(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> ?)/.exec(l.text);
    return { from: l.from + indent.length, to: existing ? l.from + existing[0].length : l.from + indent.length, insert: make(i) };
  });
  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input' });
  view.focus();
  return true;
}

function cycleHeading(view) {
  const { state } = view;
  const changes = selectedLines(state).map((l) => {
    const m = /^(#{1,6})\s+/.exec(l.text);
    if (!m) return { from: l.from, insert: '# ' };
    const n = m[1].length;
    return { from: l.from, to: l.from + m[0].length, insert: n >= 6 ? '' : '#'.repeat(n + 1) + ' ' };
  });
  view.dispatch({ changes, userEvent: 'input' });
  view.focus();
  return true;
}

function insertBlock(view, text, selectFrom, selectTo) {
  const { state } = view;
  const r = state.selection.main;
  const line = state.doc.lineAt(r.from);
  let insert = text;
  let at = r.from;
  // Put blocks on their own lines, separated by a blank line.
  if (line.text.trim() !== '') { at = line.to; insert = '\n\n' + insert; }
  const nextLine = at < state.doc.length ? state.doc.lineAt(Math.min(at + 1, state.doc.length)) : null;
  if (nextLine && nextLine.text.trim() !== '' && nextLine.number !== line.number) insert += '\n';
  const lead = insert.length - insert.trimStart().length;
  const sel = selectFrom != null
    ? EditorSelection.range(at + lead + selectFrom, at + lead + selectTo)
    : EditorSelection.cursor(at + insert.length);
  view.dispatch({ changes: { from: at, insert }, selection: sel, scrollIntoView: true, userEvent: 'input' });
  view.focus();
  return true;
}

export const commands = {
  bold: (v) => wrap(v, '**', '**', 'bold text'),
  italic: (v) => wrap(v, '*', '*', 'italic text'),
  strike: (v) => wrap(v, '~~', '~~', 'struck text'),
  code: (v) => wrap(v, '`', '`', 'code'),
  heading: cycleHeading,
  link: (v) => {
    const r = v.state.selection.main;
    const text = v.state.sliceDoc(r.from, r.to) || 'link text';
    const ins = `[${text}](https://)`;
    v.dispatch({
      changes: { from: r.from, to: r.to, insert: ins },
      selection: EditorSelection.range(r.from + text.length + 3, r.from + ins.length - 1),
      userEvent: 'input',
    });
    v.focus();
    return true;
  },
  image: (v) => insertBlock(v, '![alt text](image.png)', 2, 10),
  quote: (v) => prefixLines(v, () => '> ', /^\s*>\s?/),
  bullet: (v) => prefixLines(v, () => '- ', /^\s*[-*+] (?!\[[ xX]\] )/),
  numbered: (v) => prefixLines(v, (i) => `${i + 1}. `, /^\s*\d+[.)] /),
  task: (v) => prefixLines(v, () => '- [ ] ', /^\s*[-*+] \[[ xX]\] /),
  codeblock: (v) => insertBlock(v, '```\ncode\n```', 4, 8),
  table: (v) => insertBlock(v, '| Column 1 | Column 2 | Column 3 |\n| :------- | :------: | -------: |\n| left     | center   | right    |', 2, 10),
  hr: (v) => insertBlock(v, '---'),
};

// ---------------------------------------------------------------- factory
export function createEditor(parent, { onChange, onCursor, onScroll, onSave }) {
  const reveal = new Compartment();
  const revealExt = (on) => on
    ? [highlightWhitespace(), pilcrows, EditorView.editorAttributes.of({ class: 'cm-reveal' })]
    : [];

  const formatKeys = keymap.of([
    { key: 'Mod-b', run: commands.bold },
    { key: 'Mod-i', run: commands.italic },
    { key: 'Mod-k', run: commands.link },
    { key: 'Mod-Shift-x', run: commands.strike },
    { key: 'Mod-`', run: commands.code },
    { key: 'Mod-h', run: commands.heading },
  ]);

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: '', extensions: base() }),
  });

  function base() {
    return [
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(),
      drawSelection(), dropCursor(), rectangularSelection(), indentOnInput(),
      highlightActiveLine(), highlightSelectionMatches(), search({ top: true }),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages, addKeymap: true }),
      syntaxHighlighting(mdHighlight),
      lineClasses,
      reveal.of(revealExt(false)),
      formatKeys,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange?.();
        if (u.selectionSet || u.docChanged) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          onCursor?.(line.number, head - line.from + 1);
        }
      }),
      EditorView.domEventHandlers({ scroll: () => { onScroll?.(); } }),
    ];
  }

  let revealOn = false;
  return {
    view,
    commands,
    getDoc: () => view.state.doc.toString(),
    setDoc(text) {
      view.setState(EditorState.create({ doc: text, extensions: base() }));
      if (revealOn) view.dispatch({ effects: reveal.reconfigure(revealExt(true)) });
    },
    replaceAll(text) { // keeps undo history
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
    setReveal(on) {
      revealOn = on;
      view.dispatch({ effects: reveal.reconfigure(revealExt(on)) });
    },
    /** 0-based source line at the top of the editor viewport */
    topLine() {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop - view.documentPadding.top + 4);
      return view.state.doc.lineAt(block.from).number - 1;
    },
    scrollToLine(n) {
      const ln = Math.max(1, Math.min(view.state.doc.lines, n + 1));
      const pos = view.state.doc.line(ln).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 8 }) });
    },
    insertSnippet(text) {
      return insertBlock(view, text);
    },
    toggleTask(line0) {
      const ln = line0 + 1;
      if (ln > view.state.doc.lines) return false;
      const line = view.state.doc.line(ln);
      const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(line.text);
      if (!m) return false;
      const pos = line.from + m[1].length;
      view.dispatch({ changes: { from: pos, to: pos + 1, insert: m[2] === ' ' ? 'x' : ' ' }, userEvent: 'input' });
      return true;
    },
  };
}
