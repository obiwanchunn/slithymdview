# SlithyMDView — notes for Claude

Formerly **MdView** (v001, 2026-11-02). Renamed and moved to this repo 2026-11-10 (v002), when the
iPhone version was added. The owner likes it no-bloat and exactly as asked — make tweaks
surgically, don't redesign. Personal/setup notes (which PC, Drive folders) live in the owner's
home Google Drive: `Claude/SlithyMDView/slithymdview_notes_vVVV_YYYYMMDD.md`.

## Layout
- `web-src/` — the UI (HTML/CSS/JS), shared by both versions. `npm run build` (build.mjs) writes:
  - `windows/SlithyMDView/web/` (embedded in the exe; target chrome110)
  - `docs/` (iPhone web app for GitHub Pages; target safari15; index.html gets iPhone meta tags,
    manifest link, iphone.css and a service-worker registration injected; sw.js gets its cache
    name from `IPHONE_VERSION`). **Never edit `docs/` or `windows/SlithyMDView/web/` by hand.**
  - `web-src/iphone/` holds the iPhone-only files copied into `docs/` (sw.js, manifest, iphone.css,
    icons, the docs README). `web-src/art/make_icon.py` makes the icons.
- `windows/` — C# / .NET 10 WPF host with WebView2. `build.cmd` → `publish\SlithyMDView.exe`.
- `docs/` — GitHub Pages (main /docs) → https://obiwanchunn.github.io/slithymdview/. Named `docs`
  only because branch-deploy Pages allows just `/` or `/docs` (README explains this).

## How it works
- render.js — markdown-it + task-lists/footnote/anchor, DOMPurify; a second renderer for "show
  markup" (reveal) mode, which disables markdown-it's `text_join` rule so escapes/entities stay visible.
- editor.js — CodeMirror 6; line classes for heading sizes etc.; front matter; formatting commands.
- main.js — modes, toolbar, cheat sheet, scroll sync via `data-line`, shortcuts, host messages.
- host.js — the only platform split. Windows: WebView2 messages. Browser/iPhone (`browserHost`):
  Open = hidden file input (confirm-discard asked *after* picking, since iOS only opens the picker
  straight from a tap); Save = `navigator.share({files})` or `<a download>` fallback; Save as =
  `prompt()` for a name; unsaved edits kept in localStorage `slithymdview.draft`
  (main.js sends `changed {content, dirty}` throttled 600 ms + on visibilitychange) and restored at
  start via a `restore` message. `?file=…` loads a document for testing.
- Messages page→host: `ready, dirty, changed, save, saveAs, open, openLink, dropFiles,
  registerAssociation, showInFolder, theme`; host→page: `load, saved, saveFailed, requestSave,
  toast, restore, version`.
- Windows host keeps file encoding (UTF-8 ± BOM, UTF-16, Windows-1252 fallback) and CRLF/LF;
  watches the file and reloads if changed elsewhere and not dirty. Virtual hosts
  `app.slithymdview` (UI) and `doc.slithymdview` (document's drive root, for relative images).
- Version: Windows = csproj `Version` (1.0.N = vNNN) + `InformationalVersion`, sent to the page
  as `version` on `ready` and shown at the bottom of the ⋯ menu; iPhone = `IPHONE_VERSION` in
  build.mjs (compiled in as `__VERSION__`).
- Registration (Support.cs `FileAssociation`): HKCU ProgId `SlithyMDView.Markdown` for
  .md/.markdown/.mdown/.mkd/.mdx → OpenWithProgids, `Applications\SlithyMDView.exe`, Capabilities
  (Default apps), plus "Edit with SlithyMDView" via `SystemFileAssociations\<ext>\shell\SlithyMDView.Edit`.
  `RefreshIfOlder()` at startup re-registers to the running exe if setup was ever run and the
  owner (HKCU\Software\SlithyMDView ExePath/Build) is a different, not-newer exe. Never sets defaults.
  Same design as SlithyLens v005.

## Building / checking
- Claude's sandbox can't reach nuget.org, so it can't compile the C#. It can: run Roslyn `csc`
  from an apt-installed `dotnet-sdk-10.0` for a syntax pass, and type-check non-WPF/WebView2 code
  (Support.cs pieces) against the net10 reference assemblies.
- WPF ImplicitUsings do NOT include System.IO — keep explicit `using System.IO;` (bit SlithyLens).
- The UI can be fully tested: `cd web-src && npm ci && npm run build`, serve `docs/`, drive it with
  playwright at an iPhone viewport (390×844, touch). sample: `samples/sample.md`.
- In PowerShell the owner runs `.\build.cmd`.

## Version log
- v001 (2026-11-02): MdView, first release (.NET 8). Compiled first try.
- v002 (2026-11-10): renamed SlithyMDView; .NET 10; version in ⋯ menu; Edit with + auto
  take-over; tove-over-a-page icon. iPhone v001 (2026-11-10): first iPhone web app.
- v003 / iPhone v002 (2026-11-10): View mode didn't wrap on narrow screens — a long code line or
  wide table widened the whole page (grid track sized to content). Fix: `#app` grid-template-columns
  `minmax(0, 1fr)` + `.workspace` min-width 0; code blocks/tables now scroll inside themselves.
  Regression sample: `samples/wide.md` (page must stay 390 px wide at an iPhone viewport).

## Ideas not built (only if asked)
Find in View mode, recent-files list, tabs, spell check, export to HTML/PDF beyond printing.
