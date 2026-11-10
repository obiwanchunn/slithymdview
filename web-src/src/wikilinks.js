// Obsidian-style wiki links for markdown-it:
//   [[#Heading]]            → link to a heading in this document
//   [[Note]]                → link to Note.md (same folder)
//   [[Note#Heading]]        → link to a heading in Note.md
//   [[Target|shown text]]   → custom link text
//   ![[picture.png]]        → image (![[picture.png|300]] sets the width)
//   ![[Note]]               → shown as a link (other notes aren't embedded)
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i;

export function wikilinks(md, { slugify }) {
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    let pos = state.pos;
    let embed = false;
    if (src.charCodeAt(pos) === 0x21 /* ! */) { embed = true; pos++; }
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;   // [[
    const end = src.indexOf(']]', pos + 2);
    if (end < 0) return false;
    const inner = src.slice(pos + 2, end);
    if (!inner.trim() || /[\n[\]]/.test(inner)) return false;

    if (!silent) {
      const bar = inner.indexOf('|');
      const target = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
      const alias = bar >= 0 ? inner.slice(bar + 1).trim() : '';
      const hash = target.indexOf('#');
      const file = (hash >= 0 ? target.slice(0, hash) : target).trim();
      const heading = hash >= 0 ? target.slice(hash + 1).trim() : '';
      const t = state.push('wikilink', '', 0);
      t.meta = { embed, target, file, heading, alias };
    }
    state.pos = end + 2;
    return true;
  });

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fileHref = (f) => encodeURI((/\.[a-z0-9]{1,6}$/i.test(f) ? f : f + '.md').replace(/\\/g, '/'));

  /** Returns { html, text } — text is what the reader sees (used by reveal mode too). */
  md.wikilinkParts = (m) => {
    if (m.embed && IMAGE.test(m.file)) {
      const size = /^(\d+)(?:x(\d+))?$/.exec(m.alias || '');
      const alt = size ? m.file : (m.alias || m.file);
      const dims = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ''}` : '';
      return { image: true, html: `<img src="${esc(fileHref(m.file))}" alt="${esc(alt)}"${dims}>` };
    }
    const href = (m.file ? fileHref(m.file) : '') + (m.heading ? '#' + slugify(m.heading) : '');
    const text = m.alias || (m.file && m.heading ? `${m.file} › ${m.heading}` : (m.file || m.heading));
    return { image: false, href, text };
  };

  md.renderer.rules.wikilink = (tokens, idx) => {
    const p = md.wikilinkParts(tokens[idx].meta);
    return p.image ? p.html : `<a href="${esc(p.href)}" class="wikilink">${esc(p.text)}</a>`;
  };
}
