using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using Microsoft.Win32;

namespace SlithyMDView;

/// <summary>Unpacks the embedded web UI to a folder WebView2 can serve.</summary>
internal static class WebAssets
{
    private const string Prefix = "web/";

    public static string Extract(string targetDir)
    {
        Directory.CreateDirectory(targetDir);
        var asm = Assembly.GetExecutingAssembly();
        foreach (string res in asm.GetManifestResourceNames())
        {
            if (!res.StartsWith(Prefix, StringComparison.Ordinal)) continue;
            string file = Path.Combine(targetDir, res.Substring(Prefix.Length));

            using var stream = asm.GetManifestResourceStream(res)!;
            using var ms = new MemoryStream();
            stream.CopyTo(ms);
            byte[] data = ms.ToArray();

            // Only rewrite when changed (several SlithyMDView windows may start at once).
            if (File.Exists(file))
            {
                try
                {
                    if (new FileInfo(file).Length == data.Length && File.ReadAllBytes(file).AsSpan().SequenceEqual(data))
                        continue;
                }
                catch (IOException) { continue; } // another instance is writing it right now
            }
            string tmp = file + "." + Environment.ProcessId + ".tmp";
            try
            {
                File.WriteAllBytes(tmp, data);
                File.Move(tmp, file, overwrite: true);
            }
            catch (IOException)
            {
                try { File.Delete(tmp); } catch { /* ignore */ }
            }
        }
        return targetDir;
    }
}

/// <summary>Version info from the .csproj (Version / InformationalVersion).</summary>
internal static class AppInfo
{
    private static readonly Assembly Asm = Assembly.GetEntryAssembly() ?? typeof(AppInfo).Assembly;

    /// <summary>e.g. "v002 (2026-11-10)"</summary>
    public static string Version =>
        Asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "(unknown version)";

    /// <summary>e.g. 2 for v002 (the last number of Version 1.0.2)</summary>
    public static int Build => Asm.GetName().Version?.Build ?? 0;
}

/// <summary>Remembers window size and position between runs.</summary>
internal static class WindowSettings
{
    private sealed record Placement(double Left, double Top, double Width, double Height, bool Maximized);

    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SlithyMDView", "window.json");

    public static void Restore(Window w)
    {
        try
        {
            if (!File.Exists(FilePath)) return;
            var p = JsonSerializer.Deserialize<Placement>(File.ReadAllText(FilePath));
            if (p == null || p.Width < 300 || p.Height < 200) return;

            // Make sure the window lands on a screen that still exists.
            var screen = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
                                  SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
            var bounds = new Rect(p.Left, p.Top, p.Width, p.Height);
            if (!screen.IntersectsWith(bounds)) return;

            w.WindowStartupLocation = WindowStartupLocation.Manual;
            w.Left = p.Left; w.Top = p.Top; w.Width = p.Width; w.Height = p.Height;
            if (p.Maximized) w.WindowState = WindowState.Maximized;
        }
        catch { /* first run or unreadable: use defaults */ }
    }

    public static void Save(Window w)
    {
        try
        {
            var r = w.WindowState == WindowState.Normal ? new Rect(w.Left, w.Top, w.Width, w.Height) : w.RestoreBounds;
            if (r.IsEmpty) return;
            var p = new Placement(r.Left, r.Top, r.Width, r.Height, w.WindowState == WindowState.Maximized);
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(p));
        }
        catch { /* not important */ }
    }
}

/// <summary>
/// Per-user registration (no admin needed). Puts SlithyMDView in "Open with", adds
/// "Edit with SlithyMDView" to the full right-click menu, and lists it in Settings →
/// Default apps. Existing defaults are never changed.
/// </summary>
internal static class FileAssociation
{
    private const string AppName = "SlithyMDView";
    private const string ProgId = "SlithyMDView.Markdown";
    private const string EditVerb = "SlithyMDView.Edit";
    private static readonly string[] Extensions = { ".md", ".markdown", ".mdown", ".mkd", ".mdx" };

    public static void Register()
    {
        string exe = Environment.ProcessPath ?? throw new InvalidOperationException("Unknown exe path");
        string command = $"\"{exe}\" \"%1\"";

        using var classes = Registry.CurrentUser.CreateSubKey(@"Software\Classes");
        using (var prog = classes.CreateSubKey(ProgId))
        {
            prog.SetValue("", "Markdown document");
            using (var icon = prog.CreateSubKey("DefaultIcon")) icon.SetValue("", $"\"{exe}\",0");
            using (var cmd = prog.CreateSubKey(@"shell\open\command")) cmd.SetValue("", command);
        }
        foreach (string ext in Extensions)
        {
            using (var k = classes.CreateSubKey(ext + @"\OpenWithProgids"))
                k.SetValue(ProgId, "");

            // "Edit with SlithyMDView" in the right-click menu, whatever app is the default.
            // (Windows 11 shows it under "Show more options" / Shift+right-click.)
            using var verb = classes.CreateSubKey($@"SystemFileAssociations\{ext}\shell\{EditVerb}");
            verb.SetValue("MUIVerb", "Edit with SlithyMDView");
            verb.SetValue("Icon", $"\"{exe}\",0");
            using var vcmd = verb.CreateSubKey("command");
            vcmd.SetValue("", command);
        }
        using (var app = classes.CreateSubKey(@"Applications\SlithyMDView.exe"))
        {
            app.SetValue("FriendlyAppName", AppName);
            using (var cmd = app.CreateSubKey(@"shell\open\command")) cmd.SetValue("", command);
            using var types = app.CreateSubKey("SupportedTypes");
            foreach (string ext in Extensions) types.SetValue(ext, "");
        }

        // Shows SlithyMDView under Settings → Apps → Default apps.
        using (var caps = Registry.CurrentUser.CreateSubKey(@"Software\SlithyMDView\Capabilities"))
        {
            caps.SetValue("ApplicationName", AppName);
            caps.SetValue("ApplicationDescription", "Markdown viewer and editor");
            using var assoc = caps.CreateSubKey("FileAssociations");
            foreach (string ext in Extensions) assoc.SetValue(ext, ProgId);
        }
        using (var reg = Registry.CurrentUser.CreateSubKey(@"Software\RegisteredApplications"))
            reg.SetValue(AppName, @"Software\SlithyMDView\Capabilities");

        // Which build owns the entries, so newer builds can take over (see RefreshIfOlder).
        using (var me = Registry.CurrentUser.CreateSubKey(@"Software\SlithyMDView"))
        {
            me.SetValue("ExePath", exe);
            me.SetValue("Build", AppInfo.Build);
        }

        SHChangeNotify(0x08000000 /* SHCNE_ASSOCCHANGED */, 0, IntPtr.Zero, IntPtr.Zero);
    }

    /// <summary>
    /// Called at every start. If SlithyMDView has been set up (by any build) and the entries point
    /// at a different exe, take them over, unless they belong to a newer build that still exists.
    /// Does nothing if setup was never run, and never touches defaults.
    /// </summary>
    public static void RefreshIfOlder()
    {
        try
        {
            string? exe = Environment.ProcessPath;
            if (exe == null) return;
            using var me = Registry.CurrentUser.OpenSubKey(@"Software\SlithyMDView");
            if (me == null) return;
            using (var caps = me.OpenSubKey("Capabilities"))
                if (caps == null) return;                           // never set up

            string? owner = me.GetValue("ExePath") as string;
            int ownerBuild = me.GetValue("Build") is int b ? b : 0;
            if (string.Equals(owner, exe, StringComparison.OrdinalIgnoreCase)) return;
            if (ownerBuild > AppInfo.Build && owner != null && File.Exists(owner)) return;

            Register();
        }
        catch { /* not important enough to bother the user */ }
    }

    public static void Unregister()
    {
        using (var classes = Registry.CurrentUser.OpenSubKey(@"Software\Classes", writable: true))
        {
            if (classes != null)
            {
                classes.DeleteSubKeyTree(ProgId, false);
                classes.DeleteSubKeyTree(@"Applications\SlithyMDView.exe", false);
                foreach (string ext in Extensions)
                {
                    classes.DeleteSubKeyTree($@"SystemFileAssociations\{ext}\shell\{EditVerb}", false);
                    using var k = classes.OpenSubKey(ext + @"\OpenWithProgids", writable: true);
                    k?.DeleteValue(ProgId, false);
                }
            }
        }
        Registry.CurrentUser.DeleteSubKeyTree(@"Software\SlithyMDView", false);
        using (var reg = Registry.CurrentUser.OpenSubKey(@"Software\RegisteredApplications", writable: true))
            reg?.DeleteValue(AppName, false);
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
    }

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
}
