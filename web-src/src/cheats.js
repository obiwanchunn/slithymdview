// Markdown reference shown in the cheat-sheet panel.
// md: the syntax as typed; note: a short explanation; insert: snippet (defaults to md)
export const CHEATS = [
  { group: 'Text', title: 'Bold', md: '**bold text**', note: '`__bold__` also works. Shortcut: Ctrl+B' },
  { group: 'Text', title: 'Italic', md: '*italic text*', note: '`_italic_` also works. Shortcut: Ctrl+I' },
  { group: 'Text', title: 'Bold and italic', md: '***bold and italic***' },
  { group: 'Text', title: 'Strikethrough', md: '~~struck through~~', note: 'Shortcut: Ctrl+Shift+X' },
  { group: 'Text', title: 'Inline code', md: 'Run `npm install` first.', note: 'Use double backticks to include a backtick: ``a ` b``. Shortcut: Ctrl+`' },
  { group: 'Text', title: 'Escaping characters', md: '\\*not italic\\* and 5 \\* 3', note: 'A backslash makes the next symbol literal: \\ ` * _ { } [ ] ( ) # + - . ! |' },
  { group: 'Text', title: 'HTML (inline)', md: 'Press <kbd>Ctrl</kbd>+<kbd>S</kbd>, or use <sub>sub</sub> and <sup>sup</sup>', note: 'Most simple HTML tags pass straight through.' },

  { group: 'Structure', title: 'Headings', md: '# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4', note: 'Up to 6 levels. Ctrl+H cycles the level of the current line.' },
  { group: 'Structure', title: 'Headings (underline style)', md: 'Heading 1\n=========\n\nHeading 2\n---------' },
  { group: 'Structure', title: 'Paragraphs', md: 'First paragraph.\n\nSecond paragraph — separated by a blank line.', note: 'A single line break inside a paragraph is ignored when rendered.' },
  { group: 'Structure', title: 'Line break', md: 'Line one  \nLine two\\\nLine three', note: 'End a line with two spaces or a backslash to force a break.' },
  { group: 'Structure', title: 'Horizontal rule', md: 'Above\n\n---\n\nBelow', note: '`***` and `___` also work. Leave a blank line above, or `---` turns the previous line into a heading.', insert: '---' },
  { group: 'Structure', title: 'Blockquote', md: '> A quotation.\n>\n> > A nested quotation.' },

  { group: 'Lists', title: 'Bulleted list', md: '- First\n- Second\n- Third', note: '`*` or `+` also work.' },
  { group: 'Lists', title: 'Numbered list', md: '1. First\n2. Second\n3. Third', note: 'The first number sets the start; the rest can all be `1.`' },
  { group: 'Lists', title: 'Nested list', md: '1. Fruit\n   - Apple\n   - Pear\n2. Vegetables\n   - Leek', note: 'Indent the child to line up with the parent’s text.' },
  { group: 'Lists', title: 'Task list', md: '- [x] Write the draft\n- [ ] Review it\n- [ ] Publish', note: 'In View mode you can click the boxes to tick them.' },

  { group: 'Links & images', title: 'Link', md: '[Anthropic](https://www.anthropic.com "optional title")', note: 'Shortcut: Ctrl+K' },
  { group: 'Links & images', title: 'Automatic link', md: '<https://example.com>  or just https://example.com' },
  { group: 'Links & images', title: 'Reference link', md: 'See [the docs][docs] for more.\n\n[docs]: https://example.com/docs', note: 'Keeps long URLs out of your paragraphs.' },
  { group: 'Links & images', title: 'Link to a heading', md: '[Jump to setup](#setup)', note: 'Lowercase the heading text and replace spaces with hyphens.' },
  { group: 'Links & images', title: 'Link to another file', md: '[Notes](notes.md)', note: 'Relative to this file’s folder. .md links open here.' },
  { group: 'Links & images', title: 'Wiki link (Obsidian)', md: 'See [[#Headings]], [[Other note]] or [[Other note|this note]].', note: '`[[#Heading]]` jumps within this file; `[[Note]]` opens Note.md from the same folder (Windows). `![[photo.png]]` shows an image.', insert: '[[#Heading]]' },
  { group: 'Links & images', title: 'Image', md: '![Alt text](images/photo.png "optional title")', note: 'Paths are relative to this file’s folder.' },
  { group: 'Links & images', title: 'Footnote', md: 'Here is a claim.[^1]\n\n[^1]: And here is the source.' },

  { group: 'Code & tables', title: 'Code block', md: '```python\ndef hello():\n    print("hi")\n```', note: 'Name the language after the opening fence for colouring. `~~~` fences work too.' },
  { group: 'Code & tables', title: 'Indented code block', md: '    four spaces of indent\n    makes a code block' },
  { group: 'Code & tables', title: 'Table', md: '| Left | Center | Right |\n| :--- | :----: | ----: |\n| a    | b      | c     |\n| dd   | ee     | ff    |', note: 'Colons in the divider row set alignment. Columns needn’t line up.' },
  { group: 'Code & tables', title: 'Collapsible section', md: '<details>\n<summary>Click to expand</summary>\n\nHidden **markdown** content.\n\n</details>' },
  { group: 'Code & tables', title: 'Comment (hidden)', md: '<!-- This text is not shown -->', note: 'Visible in Edit mode and with Show markup.' },
  { group: 'Code & tables', title: 'Front matter', md: '---\ntitle: My page\ntags: [notes]\n---', note: 'Metadata at the very top of a file. Shown as a box.' },
];
