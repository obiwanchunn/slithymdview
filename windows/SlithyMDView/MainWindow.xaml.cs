using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace SlithyMDView;

/// <summary>
/// The window is a thin host: all UI lives in the embedded web page (web/),
/// which talks to this class through WebView2 messages. This class owns the
/// file system: loading, saving, dialogs, watching for outside changes.
/// </summary>
public partial class MainWindow : Window
{
    private const string AppHost = "app.slithymdview";   // serves the embedded UI
    private const string DocHost = "doc.slithymdview";   // serves images etc. next to the document

    private static readonly string DataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SlithyMDView");

    private readonly string? _initialPath;
    private string? _path;            // current file, null for the welcome page / unsaved doc
    private string? _docRoot;         // folder mapped to DocHost
    private bool _dirty;
    private bool _crlf = true;        // line endings to write back
    private Encoding _encoding = new UTF8Encoding(false);
    private Action? _afterSave;       // continuation after a "save changes?" prompt
    private bool _closeConfirmed;
    private bool _changedOnDiskNotified;

    private FileSystemWatcher? _watcher;
    private DateTime _ignoreChangesUntil = DateTime.MinValue;
    private readonly DispatcherTimer _reloadTimer;

    public MainWindow(string? path)
    {
        InitializeComponent();
        _initialPath = path;

        _reloadTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
        _reloadTimer.Tick += (_, _) => { _reloadTimer.Stop(); OnFileChangedOnDisk(); };

        WindowSettings.Restore(this);
        bool dark = SystemUsesDarkTheme();
        Background = new SolidColorBrush(dark ? Color.FromRgb(0x15, 0x17, 0x1B) : Color.FromRgb(0xF7, 0xF6, 0xF3));
        Web.DefaultBackgroundColor = dark
            ? System.Drawing.Color.FromArgb(0x15, 0x17, 0x1B)
            : System.Drawing.Color.FromArgb(0xF7, 0xF6, 0xF3);

        SourceInitialized += (_, _) => SetDarkTitleBar(dark);
        Loaded += async (_, _) => await InitWebViewAsync();
        Closing += OnClosing;
    }

    // ------------------------------------------------------------------ WebView2 setup

    private async Task InitWebViewAsync()
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataDir, "WebView2"));
            await Web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            var r = MessageBox.Show(this,
                "SlithyMDView needs the Microsoft Edge WebView2 Runtime, which isn't installed.\n\nOpen the download page now?",
                "SlithyMDView", MessageBoxButton.YesNo, MessageBoxImage.Error);
            if (r == MessageBoxResult.Yes) ShellOpen("https://developer.microsoft.com/microsoft-edge/webview2/");
            Close();
            return;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Could not start the viewer:\n\n" + ex.Message, "SlithyMDView",
                MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
            return;
        }

        var core = Web.CoreWebView2;
        string webDir = WebAssets.Extract(Path.Combine(DataDir, "web"));
        core.SetVirtualHostNameToFolderMapping(AppHost, webDir, CoreWebView2HostResourceAccessKind.Allow);

        var s = core.Settings;
#if DEBUG
        s.AreDevToolsEnabled = true;
#else
        s.AreDevToolsEnabled = false;
#endif
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = true;          // Ctrl + mouse wheel zooms
        s.AreBrowserAcceleratorKeysEnabled = true; // Ctrl+P print, Ctrl+F in page, etc.
        s.AreHostObjectsAllowed = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsGeneralAutofillEnabled = false;

        core.WebMessageReceived += OnWebMessage;
        core.NavigationStarting += OnNavigationStarting;
        core.NewWindowRequested += (_, e) => { e.Handled = true; OpenLink(e.Uri); };
        core.ContextMenuRequested += (_, e) =>
        {
            // Trim browser-ish items that make no sense in a document viewer.
            string[] drop = { "back", "forward", "reload", "saveAs", "share", "createQrCode", "webCapture", "openLinkInNewWindow", "saveLinkAs" };
            for (int i = e.MenuItems.Count - 1; i >= 0; i--)
                if (drop.Contains(e.MenuItems[i].Name)) e.MenuItems.RemoveAt(i);
        };

        core.Navigate($"https://{AppHost}/index.html");
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (e.Uri.StartsWith($"https://{AppHost}/", StringComparison.OrdinalIgnoreCase)) return;
        e.Cancel = true;
        OpenLink(e.Uri);
    }

    private void Post(object message) =>
        Web.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(message));

    // ------------------------------------------------------------------ messages from the page

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        JsonNode? msg;
        try { msg = JsonNode.Parse(e.WebMessageAsJson); } catch { return; }
        if (msg is null) return;
        string type = msg["type"]?.GetValue<string>() ?? "";

        switch (type)
        {
            case "ready":
                Post(new { type = "version", text = "SlithyMDView " + AppInfo.Version });
                // First start (or the page was reloaded): show the current/initial file.
                string? toOpen = _path ?? _initialPath;
                if (toOpen != null && File.Exists(toOpen)) LoadFile(toOpen);
                else
                {
                    if (toOpen != null)
                        MessageBox.Show(this, $"File not found:\n{toOpen}", "SlithyMDView", MessageBoxButton.OK, MessageBoxImage.Warning);
                    Post(new { type = "load", path = (string?)null, name = (string?)null, content = (string?)null });
                    UpdateTitle();
                }
                break;

            case "dirty":
                _dirty = msg["dirty"]?.GetValue<bool>() ?? false;
                if (!_dirty) _changedOnDiskNotified = false;
                UpdateTitle();
                break;

            case "save":
                Save(msg["content"]?.GetValue<string>() ?? "", saveAs: false, msg["suggestedName"]?.GetValue<string>());
                break;

            case "saveAs":
                Save(msg["content"]?.GetValue<string>() ?? "", saveAs: true, msg["suggestedName"]?.GetValue<string>());
                break;

            case "open":
                ConfirmDiscard(ShowOpenDialog);
                break;

            case "openLink":
                OpenLink(msg["href"]?.GetValue<string>() ?? "");
                break;

            case "dropFiles":
                var files = new List<string>();
                foreach (var o in e.AdditionalObjects)
                    if (o is CoreWebView2File f && !string.IsNullOrEmpty(f.Path)) files.Add(f.Path);
                if (files.Count > 0)
                {
                    string first = files[0];
                    ConfirmDiscard(() => LoadFile(first));
                    foreach (var extra in files.Skip(1)) OpenInNewProcess(extra);
                }
                break;

            case "registerAssociation":
                RegisterAssociation();
                break;

            case "showInFolder":
                if (_path != null) Process.Start("explorer.exe", $"/select,\"{_path}\"");
                break;

            case "theme":
                bool dark = msg["dark"]?.GetValue<bool>() ?? false;
                SetDarkTitleBar(dark);
                Background = new SolidColorBrush(dark ? Color.FromRgb(0x15, 0x17, 0x1B) : Color.FromRgb(0xF7, 0xF6, 0xF3));
                break;
        }
    }

    // ------------------------------------------------------------------ files

    private void ShowOpenDialog()
    {
        var dlg = new OpenFileDialog
        {
            Title = "Open Markdown file",
            Filter = "Markdown files (*.md;*.markdown)|*.md;*.markdown;*.mdown;*.mkd;*.mdx|Text files (*.txt)|*.txt|All files (*.*)|*.*",
        };
        if (_path != null) dlg.InitialDirectory = Path.GetDirectoryName(_path);
        if (dlg.ShowDialog(this) == true) LoadFile(dlg.FileName);
    }

    private void LoadFile(string path, bool reload = false)
    {
        string text;
        try { text = ReadText(Path.GetFullPath(path), out _encoding); }
        catch (Exception ex)
        {
            if (!reload)
                MessageBox.Show(this, $"Could not open {path}\n\n{ex.Message}", "SlithyMDView", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        _path = Path.GetFullPath(path);
        _dirty = false;
        _changedOnDiskNotified = false;
        _crlf = text.Contains("\r\n") || !text.Contains('\n'); // keep the file's own line endings
        MapDocumentFolder();
        WatchFile();

        Post(new
        {
            type = "load",
            path = _path,
            name = Path.GetFileName(_path),
            content = text,
            docBase = DocBase(),
            reload,
        });
        UpdateTitle();
    }

    /// <summary>Reads text, keeping track of the encoding so we save it back the same way.</summary>
    private static string ReadText(string path, out Encoding encoding)
    {
        byte[] bytes = File.ReadAllBytes(path);

        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            encoding = new UTF8Encoding(true);
            return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        }
        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            encoding = new UnicodeEncoding(false, true);
            return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
        }
        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
        {
            encoding = new UnicodeEncoding(true, true);
            return Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);
        }
        try
        {
            var strict = new UTF8Encoding(false, throwOnInvalidBytes: true);
            string s = strict.GetString(bytes);
            encoding = new UTF8Encoding(false);
            return s;
        }
        catch (DecoderFallbackException)
        {
            // Not valid UTF-8: most likely an older Windows "ANSI" file.
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            encoding = Encoding.GetEncoding(1252);
            return encoding.GetString(bytes);
        }
    }

    private void Save(string content, bool saveAs, string? suggestedName)
    {
        string? target = _path;
        if (saveAs || target == null)
        {
            var dlg = new SaveFileDialog
            {
                Title = "Save Markdown file",
                Filter = "Markdown file (*.md)|*.md|Markdown file (*.markdown)|*.markdown|Text file (*.txt)|*.txt|All files (*.*)|*.*",
                FileName = suggestedName ?? (_path != null ? Path.GetFileName(_path) : "Untitled.md"),
                DefaultExt = ".md",
                AddExtension = true,
            };
            if (_path != null) dlg.InitialDirectory = Path.GetDirectoryName(_path);
            if (dlg.ShowDialog(this) != true)
            {
                _afterSave = null;
                Post(new { type = "saveFailed", message = "Not saved" });
                return;
            }
            target = dlg.FileName;
        }

        try
        {
            string text = _crlf ? content.Replace("\r\n", "\n").Replace("\n", "\r\n") : content;
            _ignoreChangesUntil = DateTime.UtcNow.AddSeconds(2);
            File.WriteAllText(target, text, _encoding);
        }
        catch (Exception ex)
        {
            _afterSave = null;
            Post(new { type = "saveFailed", message = "Save failed: " + ex.Message });
            return;
        }

        bool newFile = !string.Equals(target, _path, StringComparison.OrdinalIgnoreCase);
        _path = target;
        _dirty = false;
        _changedOnDiskNotified = false;
        if (newFile) { MapDocumentFolder(); WatchFile(); }

        Post(new { type = "saved", path = _path, name = Path.GetFileName(_path), docBase = DocBase() });
        UpdateTitle();

        var next = _afterSave;
        _afterSave = null;
        next?.Invoke();
    }

    /// <summary>
    /// Runs <paramref name="next"/> right away if there are no unsaved changes;
    /// otherwise asks Save / Don't save / Cancel first.
    /// </summary>
    private void ConfirmDiscard(Action next)
    {
        if (!_dirty) { next(); return; }
        string name = _path != null ? Path.GetFileName(_path) : "this document";
        var r = MessageBox.Show(this, $"Save changes to {name}?", "SlithyMDView",
            MessageBoxButton.YesNoCancel, MessageBoxImage.Warning);
        if (r == MessageBoxResult.Yes)
        {
            _afterSave = next;
            Post(new { type = "requestSave" }); // page replies with "save" (content), then Save() runs next
        }
        else if (r == MessageBoxResult.No)
        {
            _dirty = false;
            next();
        }
    }

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_closeConfirmed || !_dirty)
        {
            WindowSettings.Save(this);
            _watcher?.Dispose();
            return;
        }
        e.Cancel = true;
        // Close() can't be called from inside Closing, so defer it.
        ConfirmDiscard(() =>
        {
            _closeConfirmed = true;
            Dispatcher.BeginInvoke(new Action(Close));
        });
    }

    // ------------------------------------------------------------------ document folder & links

    /// <summary>Maps the document's drive root so relative images like ../img/a.png resolve.</summary>
    private void MapDocumentFolder()
    {
        if (_path == null || Web.CoreWebView2 == null) return;
        string root = Path.GetPathRoot(_path) ?? Path.GetDirectoryName(_path)!;
        if (string.Equals(root, _docRoot, StringComparison.OrdinalIgnoreCase)) return;
        if (_docRoot != null) Web.CoreWebView2.ClearVirtualHostNameToFolderMapping(DocHost);
        Web.CoreWebView2.SetVirtualHostNameToFolderMapping(DocHost, root, CoreWebView2HostResourceAccessKind.Allow);
        _docRoot = root;
    }

    private string? DocBase()
    {
        if (_path == null || _docRoot == null) return null;
        string dir = Path.GetDirectoryName(_path) ?? _docRoot;
        string rel = Path.GetRelativePath(_docRoot, dir);
        if (rel == ".") rel = "";
        var parts = rel.Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries)
                       .Select(Uri.EscapeDataString);
        string joined = string.Join("/", parts);
        return $"https://{DocHost}/" + (joined.Length > 0 ? joined + "/" : "");
    }

    private void OpenLink(string href)
    {
        if (string.IsNullOrWhiteSpace(href)) return;
        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri)) return;

        string? local = null;
        if (uri.Host.Equals(DocHost, StringComparison.OrdinalIgnoreCase) && _docRoot != null)
        {
            string rel = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')).Replace('/', Path.DirectorySeparatorChar);
            local = Path.GetFullPath(Path.Combine(_docRoot, rel));
        }
        else if (uri.IsFile)
        {
            local = uri.LocalPath;
        }

        if (local != null)
        {
            if (File.Exists(local) && IsMarkdown(local)) { ConfirmDiscard(() => LoadFile(local)); return; }
            if (File.Exists(local) || Directory.Exists(local)) { ShellOpen(local); return; }
            Post(new { type = "toast", message = "Not found: " + local });
            return;
        }

        if (uri.Scheme is "http" or "https" or "mailto") ShellOpen(uri.AbsoluteUri);
    }

    private static bool IsMarkdown(string path) =>
        Path.GetExtension(path).ToLowerInvariant() is ".md" or ".markdown" or ".mdown" or ".mkd" or ".mdx" or ".txt";

    private static void ShellOpen(string target)
    {
        try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); }
        catch { /* nothing sensible to do */ }
    }

    public static void OpenInNewProcess(string path)
    {
        string? exe = Environment.ProcessPath;
        if (exe == null) return;
        try { Process.Start(new ProcessStartInfo(exe) { ArgumentList = { path }, UseShellExecute = false }); }
        catch { /* ignore */ }
    }

    // ------------------------------------------------------------------ watching for outside edits

    private void WatchFile()
    {
        _watcher?.Dispose();
        _watcher = null;
        if (_path == null) return;
        try
        {
            _watcher = new FileSystemWatcher(Path.GetDirectoryName(_path)!, Path.GetFileName(_path))
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.FileName,
            };
            FileSystemEventHandler changed = (_, _) => Dispatcher.InvokeAsync(() => { _reloadTimer.Stop(); _reloadTimer.Start(); });
            _watcher.Changed += changed;
            _watcher.Created += changed;
            _watcher.Renamed += (_, e) =>
            {
                if (string.Equals(e.FullPath, _path, StringComparison.OrdinalIgnoreCase))
                    Dispatcher.InvokeAsync(() => { _reloadTimer.Stop(); _reloadTimer.Start(); });
            };
            _watcher.EnableRaisingEvents = true;
        }
        catch { _watcher = null; } // e.g. network paths that don't support watching
    }

    private void OnFileChangedOnDisk()
    {
        if (_path == null || DateTime.UtcNow < _ignoreChangesUntil || !File.Exists(_path)) return;
        if (!_dirty)
        {
            LoadFile(_path, reload: true); // quietly refresh
        }
        else if (!_changedOnDiskNotified)
        {
            _changedOnDiskNotified = true;
            Post(new { type = "toast", message = "This file was changed by another program" });
        }
    }

    // ------------------------------------------------------------------ misc

    private void RegisterAssociation()
    {
        try { FileAssociation.Register(); }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Could not register:\n" + ex.Message, "SlithyMDView", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }
        MessageBox.Show(this,
            "SlithyMDView is now in Open with, and \"Edit with SlithyMDView\" is in the full right-click\n" +
            "menu (Shift+right-click, or Show more options), for .md files.\n\n" +
            "Your defaults haven't changed. New builds take these entries over the first time you open them.\n\n" +
            "If you want SlithyMDView as the default for .md: right-click a .md → Open with →\n" +
            "Choose another app → SlithyMDView → Always.",
            "SlithyMDView", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void UpdateTitle()
    {
        string name = _path != null ? Path.GetFileName(_path) : "Welcome";
        Title = (_dirty ? "● " : "") + name + " — SlithyMDView";
    }

    private static bool SystemUsesDarkTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return key?.GetValue("AppsUseLightTheme") is int v && v == 0;
        }
        catch { return false; }
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    private void SetDarkTitleBar(bool dark)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd == IntPtr.Zero) return;
        int on = dark ? 1 : 0;
        DwmSetWindowAttribute(hwnd, 20, ref on, sizeof(int)); // DWMWA_USE_IMMERSIVE_DARK_MODE (Win10 2004+/Win11)
    }
}
