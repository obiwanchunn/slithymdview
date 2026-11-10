using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;

namespace SlithyMDView;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Command-line switches for scripted setup:
        //   SlithyMDView.exe --register     add SlithyMDView to "Open with" for .md files
        //   SlithyMDView.exe --unregister   remove it again
        if (e.Args.Length > 0 && e.Args[0].Equals("--register", StringComparison.OrdinalIgnoreCase))
        {
            FileAssociation.Register();
            Shutdown();
            return;
        }
        if (e.Args.Length > 0 && e.Args[0].Equals("--unregister", StringComparison.OrdinalIgnoreCase))
        {
            FileAssociation.Unregister();
            Shutdown();
            return;
        }

        // If SlithyMDView was set up in Open with by an older build, point it at this one.
        FileAssociation.RefreshIfOlder();

        string? path = e.Args.FirstOrDefault(a => !a.StartsWith("--"));
        var window = new MainWindow(path);
        MainWindow = window;
        window.Show();

        // Extra files (e.g. several selected in Explorer) each get their own window/process.
        foreach (var extra in e.Args.Where(a => !a.StartsWith("--")).Skip(1))
            SlithyMDView.MainWindow.OpenInNewProcess(extra);
    }
}
