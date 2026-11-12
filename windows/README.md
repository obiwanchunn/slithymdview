# SlithyMDView for Windows

*(Formerly MdView.)* A Markdown viewer and editor for Windows. Double-click a `.md` file and it opens fully formatted; flip to Edit to change the raw text, with the markup styled as you type.

## Features

- **View mode**: the rendered page — tables, task lists (click to tick), code with syntax colours, footnotes, images relative to the file, front matter, collapsible `<details>`.
- **Edit mode**: the raw Markdown, with headings sized, bold/italic shown, and the `#` `**` `` ` `` markers dimmed. Formatting toolbar, Ctrl+B / I / K shortcuts, find & replace (Ctrl+F).
- **Split**: live preview beside the editor, scroll-synced.
- **Markup** (Ctrl+Shift+M): reveals every piece of markup — like Word's ¶ button. In View mode each marker appears as an orange tag next to what it does; in Edit mode markers light up and spaces, tabs, and line ends become visible.
- **Cheat sheet** (F1): every Markdown construct with its syntax and rendered result. *Insert* drops an example into your document.
- Remembers window position; follows the Windows light/dark setting (or pick one under ⋯).
- Reloads automatically if another program changes the file (unless you have unsaved edits).
- Keeps the file's encoding and line endings when saving.

## Build

You need the **.NET 10 SDK** (free): `winget install Microsoft.DotNet.SDK.10`, or
https://dotnet.microsoft.com/download/dotnet/10.0

Get the source onto a **local** disk (GitHub: **Code → Download ZIP**, or `git clone`) — not a
Google Drive folder, whose virtual disk fights with the build. Then, in this `windows` folder:

```
.\build.cmd
```

That produces `publish\SlithyMDView.exe` (a few MB). It needs the .NET 10 Desktop Runtime, which the SDK installs. To make an exe you can copy to any 64-bit Windows 10/11 PC, use `build.cmd standalone` (larger file, no runtime needed).

The WebView2 runtime is part of Windows 10/11 already.

Prefer Visual Studio? Open `SlithyMDView.sln` (or `SlithyMDView\SlithyMDView.csproj`) in Visual Studio 2022 and press F5.

## Install (optional)

`publish\SlithyMDView.exe` runs from anywhere. To put it in `C:\Program Files\SlithyMDView`, run

```
.\install.cmd
```

after `build.cmd`. Windows asks for administrator permission (Program Files needs it) and the copy
happens in a second window. Close SlithyMDView first if it's open, then open the installed copy
once so **Open with** / **Edit with** point at it. Use that copy from then on: opening
`publish\SlithyMDView.exe` again would point them back at the build folder.

## Open with / Edit with / double-click

1. Run `SlithyMDView.exe`, open the **⋯** menu and choose **Use SlithyMDView for .md files…**
   (or run `SlithyMDView.exe --register`). That adds it to **Open with**, adds **Edit with
   SlithyMDView** to the full right-click menu (Windows 11: **Show more options**), and lists it in
   Settings → Default apps. Your defaults don't change.
2. To make double-click use it: right-click any `.md` file → **Open with** → **Choose another app**
   → **SlithyMDView** → **Always**. (Windows doesn't let programs make themselves the default.)

Newer builds take these entries over the first time you open them, so after building a new version
just open it once. The **⋯** menu shows which version you're running.
`SlithyMDView.exe --unregister` removes the entries.

**Coming from MdView?** SlithyMDView registers under its own name, so the old MdView entries stay
until you remove them: in the old MdView folder run `.\MdView.exe --unregister` (PowerShell).
Its settings (window position, theme) start fresh too.

## Shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+E | Toggle View / Edit |
| Ctrl+\\ | Toggle split preview (Edit mode) |
| Ctrl+Shift+M | Show / hide markup |
| F1 | Cheat sheet |
| Ctrl+S, Ctrl+Shift+S, Ctrl+O | Save, Save as, Open |
| Ctrl+B, Ctrl+I, Ctrl+K | Bold, italic, link |
| Ctrl+H | Cycle heading level |
| Ctrl+Shift+X, Ctrl+\` | Strikethrough, inline code |
| Ctrl+F | Find & replace (Edit mode) |
| Ctrl+P | Print |
| Ctrl+mouse wheel | Zoom |

## How it's put together

```
SlithyMDView/        C# / WPF host (the exe)
  MainWindow.xaml.cs   file open/save, dialogs, file watching, links
  Support.cs           settings, file association, unpacking the UI
  web/                 the built UI (embedded in the exe) — generated, don't edit
../web-src/          the UI source (HTML/CSS/JavaScript), shared with the iPhone version
  src/render.js        Markdown → HTML (markdown-it), incl. the "show markup" renderer
  src/editor.js        the editor (CodeMirror 6)
  src/cheats.js        cheat sheet entries
  src/main.js          toolbar, modes, messages to/from the host
  src/host.js          the bridge: Windows exe (WebView2), or the iPhone/browser stand-in
```

The window hosts a WebView2 (Edge) control; the C# side owns the file system and the page does the rendering and editing. They talk through small JSON messages (`load`, `save`, `saved`, `dirty`, `openLink`, ...).

### Changing the UI

Only needed if you edit files in `web-src` (requires Node.js 18+):

```
cd ..\web-src
npm install
npm run build
```

This rewrites both `windows\SlithyMDView\web\` and the iPhone app in `docs\`; then rebuild the exe
(and push, for the iPhone). You can also serve `docs\` with any local web server and open
`index.html?file=...` to work on the UI in a normal browser.

## Version

Set in `SlithyMDView/SlithyMDView.csproj`: bump `Version` (1.0.2 = v002) and `InformationalVersion`
together. v001 was MdView (2026-11-02); v002 (2026-11-10) is the first SlithyMDView; v003 (2026-11-10) fixes text wrapping in narrow windows; v004 (2026-11-10) adds Obsidian `[[wiki links]]`.

## Libraries

markdown-it (+ task-lists, footnote, anchor plugins), CodeMirror 6, highlight.js, DOMPurify, Microsoft WebView2 — all MIT/BSD/Apache-licensed.
