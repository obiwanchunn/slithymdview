// Builds the SlithyMDView UI twice from the same source:
//   ../windows/SlithyMDView/web   embedded in the Windows exe (WebView2)
//   ../docs                       the iPhone web app, published by GitHub Pages
// Run: npm install && npm run build
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

// Bump with each iPhone release (the Windows version lives in the .csproj).
const IPHONE_VERSION = 'iPhone v001 (2026-11-10)';

const dir = (rel) => new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function bundle(out, target, version) {
  mkdirSync(out, { recursive: true });
  await esbuild.build({
    entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife',
    target, outfile: out + 'app.js', legalComments: 'none',
    define: { __VERSION__: JSON.stringify(version) },
  });
  await esbuild.build({ entryPoints: ['src/app.css'], bundle: true, minify: true, target, outfile: out + 'app.css' });
}

// ---- Windows
const win = dir('../windows/SlithyMDView/web/');
await bundle(win, ['chrome110'], 'SlithyMDView');          // the exe reports its own version at startup
copyFileSync('src/index.html', win + 'index.html');
console.log('built ->', win);

// ---- iPhone
const web = dir('../docs/');
await bundle(web, ['safari15'], 'SlithyMDView ' + IPHONE_VERSION);
let html = readFileSync('src/index.html', 'utf8');
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1">';
if (!html.includes(viewport)) throw new Error('index.html viewport tag changed; update build.mjs');
html = html.replace(viewport, [
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="apple-mobile-web-app-title" content="SlithyMDView">',
  '<meta name="theme-color" content="#f7f6f3">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<link rel="icon" type="image/png" href="icons/icon-192.png">',
].join('\n'));
html = html.replace('<link rel="stylesheet" href="app.css">', '<link rel="stylesheet" href="app.css">\n<link rel="stylesheet" href="iphone.css">');
html = html.replace('</body>', `<script>if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});</script>\n</body>`);
writeFileSync(web + 'index.html', html);
for (const f of ['iphone.css', 'manifest.webmanifest', 'README.md']) copyFileSync('iphone/' + f, web + f);
writeFileSync(web + 'sw.js', readFileSync('iphone/sw.js', 'utf8')
  .replace('__CACHE__', 'slithymdview-' + IPHONE_VERSION.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')));
writeFileSync(web + '.nojekyll', '');
mkdirSync(web + 'icons', { recursive: true });
for (const f of readdirSync('iphone/icons')) copyFileSync('iphone/icons/' + f, web + 'icons/' + f);
console.log('built ->', web);
