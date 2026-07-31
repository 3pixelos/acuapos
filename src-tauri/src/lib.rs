use std::fs::OpenOptions;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

// --- Startup diagnostics -----------------------------------------------
// Temporary: file-based logging so we can see how far startup gets on a
// machine with no console and no visible crash dialog. Every step is
// flushed to disk immediately so the last line written is trustworthy even
// if the process dies right after.

fn log_path() -> PathBuf {
    let base = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("Desktop").join("Acua POS")
}

static LOG_LOCK: Mutex<()> = Mutex::new(());

fn log_line(msg: &str) {
    let _guard = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = log_path();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("log.txt"))
    {
        let _ = writeln!(f, "[{ts}] {msg}");
        let _ = f.flush();
    }
}

fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "?".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".into());
        log_line(&format!("PANIC at {loc}: {payload}"));
    }));
}

/// Send raw ESC/POS bytes to a network thermal printer over the JetDirect /
/// AppSocket protocol (raw TCP, port 9100 by convention). Same code path
/// whether the printer is on Wi-Fi or Ethernet — only its IP differs.
///
/// Short connect timeout so an unreachable printer can never hang the print
/// queue or block the cashier's UI; the JS side leaves `printed_at` null on
/// failure and retries.
#[tauri::command]
fn print_escpos(ip: String, port: u16, data: Vec<u8>) -> Result<(), String> {
    let addr = format!("{ip}:{port}");
    let socket = addr
        .to_socket_addrs()
        .map_err(|e| format!("adresse invalide {addr}: {e}"))?
        .next()
        .ok_or_else(|| format!("adresse introuvable {addr}"))?;

    let mut stream = TcpStream::connect_timeout(&socket, Duration::from_secs(4))
        .map_err(|e| format!("connexion {addr}: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&data)
        .map_err(|e| format!("écriture: {e}"))?;
    stream.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

/// Send raw ESC/POS bytes to a printer installed in Windows (USB or LPT),
/// bypassing the GDI print driver entirely via the spooler's RAW datatype.
/// This is the cashier/bill printer — physically USB-cabled to the till PC,
/// not on the network, so there is no IP/port involved here at all.
#[cfg(target_os = "windows")]
fn print_raw_to_windows_printer(printer_name: &str, data: &[u8]) -> Result<(), String> {
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    let printer_name_w = wide(printer_name);
    let mut handle: HANDLE = 0;

    unsafe {
        if OpenPrinterW(printer_name_w.as_ptr(), &mut handle, std::ptr::null()) == 0 {
            return Err(format!("impossible d'ouvrir l'imprimante '{printer_name}'"));
        }

        let mut doc_name = wide("Acua POS - addition");
        let mut datatype = wide("RAW");
        let doc_info = DOC_INFO_1W {
            pDocName: doc_name.as_mut_ptr(),
            pOutputFile: std::ptr::null_mut(),
            pDatatype: datatype.as_mut_ptr(),
        };

        let job_id = StartDocPrinterW(handle, 1, &doc_info);
        if job_id == 0 {
            ClosePrinter(handle);
            return Err("StartDocPrinterW a échoué".into());
        }
        if StartPagePrinter(handle) == 0 {
            EndDocPrinter(handle);
            ClosePrinter(handle);
            return Err("StartPagePrinter a échoué".into());
        }

        let mut written: u32 = 0;
        let ok = WritePrinter(
            handle,
            data.as_ptr() as *const core::ffi::c_void,
            data.len() as u32,
            &mut written,
        );
        EndPagePrinter(handle);
        EndDocPrinter(handle);
        ClosePrinter(handle);

        if ok == 0 || written as usize != data.len() {
            return Err("écriture vers l'imprimante incomplète ou refusée".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn print_escpos_usb(printer_name: String, data: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        print_raw_to_windows_printer(&printer_name, &data)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (printer_name, data);
        Err("impression USB disponible uniquement sous Windows".into())
    }
}

#[cfg(target_os = "windows")]
unsafe fn pwstr_to_string(p: *const u16) -> String {
    if p.is_null() {
        return String::new();
    }
    let mut len = 0isize;
    while *p.offset(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(p, len as usize))
}

/// List printers installed in Windows (local + connected), so the settings
/// UI can offer a dropdown instead of a hand-typed printer name.
#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        // Level 4 is the cheap enumeration, but some spooler states return
        // nothing for it — fall back to level 1 before concluding "empty".
        // A stock Windows always has at least "Microsoft Print to PDF", so
        // a genuinely empty result usually means a failing call: log it.
        let first = unsafe { enum_printers_at(4) };
        match first {
            Ok(names) if !names.is_empty() => Ok(names),
            first => {
                let second = unsafe { enum_printers_at(1) };
                match second {
                    Ok(names) if !names.is_empty() => Ok(names),
                    Ok(_) => {
                        if let Err(e) = &first {
                            log_line(&format!("list_printers: niveau 4 en erreur ({e}), niveau 1 vide"));
                            Err(e.clone())
                        } else {
                            log_line("list_printers: aucune imprimante (niveaux 4 et 1 vides)");
                            Ok(vec![])
                        }
                    }
                    Err(e) => {
                        log_line(&format!("list_printers: échec ({e})"));
                        Err(e)
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

#[cfg(target_os = "windows")]
unsafe fn enum_printers_at(level: u32) -> Result<Vec<String>, String> {
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_1W,
        PRINTER_INFO_4W,
    };
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed: u32 = 0;
    let mut returned: u32 = 0;
    EnumPrintersW(
        flags,
        std::ptr::null_mut(),
        level,
        std::ptr::null_mut(),
        0,
        &mut needed,
        &mut returned,
    );
    if needed == 0 {
        let err = GetLastError();
        if err != 0 && err != ERROR_INSUFFICIENT_BUFFER {
            return Err(format!("EnumPrintersW niveau {level}: erreur Win32 {err}"));
        }
        return Ok(vec![]);
    }
    let mut buf: Vec<u8> = vec![0; needed as usize];
    let ok = EnumPrintersW(
        flags,
        std::ptr::null_mut(),
        level,
        buf.as_mut_ptr(),
        needed,
        &mut needed,
        &mut returned,
    );
    if ok == 0 {
        return Err(format!(
            "EnumPrintersW niveau {level}: erreur Win32 {}",
            GetLastError()
        ));
    }
    let mut names = Vec::new();
    for i in 0..returned as isize {
        let name = match level {
            1 => pwstr_to_string((*(buf.as_ptr() as *const PRINTER_INFO_1W).offset(i)).pName),
            _ => pwstr_to_string((*(buf.as_ptr() as *const PRINTER_INFO_4W).offset(i)).pPrinterName),
        };
        if !name.is_empty() {
            names.push(name);
        }
    }
    Ok(names)
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();
    log_line("run() start");

    let mut builder = tauri::Builder::default();
    log_line("Builder::default() ok");

    // One running instance per machine — a second launch just focuses the
    // window we already have (the print backbone must not run twice).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            log_line("single-instance: second launch detected, focusing existing window");
            show_main(app);
        }));
        log_line("single_instance plugin registered");
    }

    let result = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            log_line("setup() start");
            // Auto-launch on boot so kitchen printing survives a PC restart
            // (power blip, Windows update) without anyone re-opening the app.
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                match app.autolaunch().enable() {
                    Ok(_) => log_line("autolaunch enabled"),
                    Err(e) => log_line(&format!("autolaunch enable failed: {e}")),
                }
            }

            // Tray icon so "closing" the window minimizes to tray instead of
            // quitting — the background print listener keeps running.
            let show = MenuItem::with_id(app, "show", "Ouvrir la caisse", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            log_line("tray menu built");

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Acua POS — impression cuisine active")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            log_line("tray icon built");

            match app.get_webview_window("main") {
                Some(_) => log_line("main window handle found"),
                None => log_line("main window handle NOT FOUND"),
            }

            log_line("setup() end (Ok)");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                log_line("window CloseRequested -> hiding instead of closing");
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            print_escpos,
            print_escpos_usb,
            list_printers
        ])
        .build(tauri::generate_context!());

    match result {
        Ok(app) => {
            log_line("Builder::build() ok, entering event loop (.run)");
            app.run(|_app, event| {
                if let tauri::RunEvent::Exit = event {
                    log_line("RunEvent::Exit received");
                }
            });
            log_line("event loop returned (process exiting)");
        }
        Err(e) => {
            log_line(&format!("Builder::build() FAILED: {e}"));
            panic!("erreur au lancement de Acua POS: {e}");
        }
    }
}
